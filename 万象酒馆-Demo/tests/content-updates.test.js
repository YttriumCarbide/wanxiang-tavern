import assert from 'node:assert/strict';
import test from 'node:test';
import { once } from 'node:events';
import { createContentUpdates } from '../src/updates/content-updates.js';
import {
  compareReleases,
  loadUpdateRelease,
  sourceUrl,
  TUTORIAL_GATE,
  validateIndex,
} from '../src/updates/manifest.js';
import { createDownloadQueue } from '../src/updates/queue.js';
import { updateFixture, memoryUpdateStore } from './update-fixture.js';

const manifestUrl = 'https://example.test/game/manifest.json';

function networkFile(url, payloads) {
  const path = url.pathname.slice(url.pathname.indexOf('/assets/') + 1);
  const bytes = payloads.get(path);
  assert.ok(bytes, url.href);
  return bytes;
}

test('loads the exact index from a mirror after the origin returned bytes with the wrong hash', async () => {
  const { manifest, index } = await updateFixture();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(String(url));
    if (url === manifestUrl) return Response.json(manifest);
    if (String(url).startsWith('https://example.test')) {
      const corrupted = JSON.stringify(index).replace('1.2.3', '9.9.9');
      return new Response(corrupted);
    }
    return Response.json(index);
  };
  const release = await loadUpdateRelease(manifestUrl, { fetchImpl, expectedVersion: '1.2.3' });
  assert.deepEqual(release.index, index);
  assert.deepEqual(calls, [
    manifestUrl,
    'https://example.test/game/chunks.json',
    'https://raw.githubusercontent.com/example/game/v1/chunks.json',
  ]);
  await assert.rejects(
    loadUpdateRelease(manifestUrl, { fetchImpl, expectedVersion: '1.2.4' }),
    /shell version/,
  );
  const different = structuredClone(release);
  different.index.chunks[1].sha256 = '0'.repeat(64);
  different.index.chunks.pop();
  assert.deepEqual(compareReleases(release, different).changed, ['ready-next']);
  assert.deepEqual(compareReleases(release, different).removed, ['optional']);
  const file = index.chunks[1].files[0];
  assert.equal(
    sourceUrl(
      { kind: 'github-release', baseUrl: 'https://github.com/example/game/releases/download/v1/' },
      manifestUrl,
      file,
    ).pathname,
    '/example/game/releases/download/v1/asset-' + file.sha256,
  );
  index.gates[TUTORIAL_GATE] = ['startup'];
  await assert.rejects(validateIndex(index, manifest.version), /gate chunk dependency/);
});

test('ranks mirrors by probe availability and resumes a broken transfer on the other source', async () => {
  const fixture = await updateFixture();
  const { payloads, index } = fixture;
  const file = index.chunks[1].files[0];
  const store = memoryUpdateStore();
  const attempts = [];
  const queue = createDownloadQueue({
    release: { ...fixture, manifestUrl },
    store,
    fetchImpl: async (url, options) => {
      const primary = url.hostname === 'gitee.com';
      if (options.method === 'HEAD') return new Response(null, { status: primary ? 200 : 405 });
      const bytes = networkFile(url, payloads);
      attempts.push([url.hostname, url.pathname.split('/').at(-1), options.headers?.Range]);
      if (!url.pathname.endsWith('/next.txt')) return new Response(bytes);
      if (primary) return new Response(bytes.subarray(0, 4));
      assert.equal(options.headers.Range, 'bytes=4-');
      return new Response(bytes.subarray(4), {
        status: 206,
        headers: { 'content-range': 'bytes 4-9/10' },
      });
    },
  });
  await queue.start();
  assert.deepEqual(attempts, [
    ['gitee.com', 'next.txt', undefined],
    ['raw.githubusercontent.com', 'next.txt', 'bytes=4-'],
    ['gitee.com', 'more.txt', undefined],
  ]);
  assert.equal(queue.snapshot('ready-next').state, 'ready');
  assert.equal(queue.snapshot('optional').state, 'idle');
  assert.equal(await (await store.read('verified', file)).text(), 'abcdefghij');
  assert.equal(await store.read('partial', file), null);
});

test('rechecks persisted bytes, resumes after a fresh queue, and retries a source returning corrupt content', async () => {
  const fixture = await updateFixture();
  const { index, payloads } = fixture;
  const file = index.chunks[1].files[0];
  const cached = index.chunks[1].files[1];
  const store = memoryUpdateStore();
  await store.write('partial', file, new Blob(['abcd']));
  await store.write('verified', file, new Blob(['xxxxxxxxxx']));
  await store.write('verified', cached, new Blob(['next']));
  const requests = [];
  const queue = createDownloadQueue({
    release: { ...fixture, manifestUrl },
    store,
    fetchImpl: async (url, options) => {
      const github = url.hostname === 'raw.githubusercontent.com';
      if (options.method === 'HEAD') return new Response(null, { status: github ? 200 : 405 });
      requests.push([github, options.headers?.Range]);
      if (github) {
        return new Response('xxxxxx', {
          status: 206,
          headers: { 'content-range': 'bytes 4-9/10' },
        });
      }
      return new Response(networkFile(url, payloads));
    },
  });
  await queue.start();
  assert.deepEqual(requests, [
    [true, 'bytes=4-'],
    [false, undefined],
  ]);
  assert.equal(await (await store.read('verified', file)).text(), 'abcdefghij');
  assert.equal(queue.snapshot('ready-next').verifiedBytes, file.bytes + cached.bytes);
});

test('prioritizes requested chunks over queued background ones and leaves valid cache untouched', async () => {
  const fixture = await updateFixture();
  fixture.index.chunks[2].delivery = 'background';
  fixture.index.chunks[2].priority = 1;
  const store = memoryUpdateStore();
  for (const file of fixture.index.chunks[1].files)
    await store.write('verified', file, new Blob([fixture.payloads.get(file.path)]));
  const order = [];
  const queue = createDownloadQueue({
    release: { ...fixture, manifestUrl },
    store,
    fetchImpl: async (url, options) => {
      if (options.method === 'HEAD') return new Response(null, { status: 405 });
      order.push(url.pathname.split('/').at(-1));
      assert.equal(queue.snapshot('ready-next').state, 'ready');
      return new Response(networkFile(url, fixture.payloads));
    },
  });
  const idle = queue.start();
  await queue.enqueue(['ready-next']);
  await idle;
  assert.deepEqual(order, ['optional.txt']);
});

test('starts silently, reports gate waiting and errors, then opens only after the last required write', async () => {
  const fixture = await updateFixture();
  const entered = new EventTarget();
  let blocked = true;
  const store = memoryUpdateStore();
  const write = store.write;
  let signalLastWrite;
  const lastWrite = new Promise((resolve) => {
    signalLastWrite = resolve;
  });
  let commitLastWrite;
  const allowWrite = new Promise((resolve) => {
    commitLastWrite = resolve;
  });
  store.write = async (area, file, blob) => {
    if (area === 'verified' && file.path === 'assets/more.txt') {
      signalLastWrite();
      await allowWrite;
    }
    return write(area, file, blob);
  };
  const updates = createContentUpdates({
    load: async () => ({ ...fixture, manifestUrl }),
    store,
    fetchImpl: async (url, options) => {
      if (options.method === 'HEAD') return new Response(null, { status: 405 });
      entered.dispatchEvent(new Event('network'));
      if (blocked && url.pathname.endsWith('/more.txt')) return new Response(null, { status: 503 });
      return new Response(networkFile(url, fixture.payloads));
    },
  });
  const gateStates = [];
  const unsubscribe = updates.subscribe((state) => gateStates.push(state));
  const network = once(entered, 'network');
  const initial = updates.start();
  await network;
  assert.equal(updates.queryGate().requested, false);
  assert.equal(updates.requestGate().state, 'waiting');
  await initial;
  const failure = updates.queryGate();
  assert.equal(failure.state, 'waiting');
  assert.equal(failure.verifiedBytes, 10);
  assert.equal(failure.chunks[0].error, 'http-503');
  blocked = false;
  const retry = updates.retryGate();
  await lastWrite;
  assert.equal(updates.queryGate().loadedBytes, 14);
  assert.equal(updates.queryGate().state, 'waiting');
  commitLastWrite();
  await retry;
  assert.equal(updates.queryGate().state, 'ready');
  assert.equal(gateStates.at(-1).verifiedBytes, 14);
  unsubscribe();
  updates.dispose();
});

test('an empty gate remains passable when the release manifest cannot load', async () => {
  const updates = createContentUpdates({
    emptyGates: [TUTORIAL_GATE],
    load: async () => {
      throw Error('offline');
    },
    store: memoryUpdateStore(),
  });
  assert.equal(updates.requestGate().state, 'ready');
  await updates.start();
  assert.equal(updates.queryGate().releaseStatus, 'failed');
  assert.equal(updates.queryGate().state, 'ready');
  updates.dispose();
});
