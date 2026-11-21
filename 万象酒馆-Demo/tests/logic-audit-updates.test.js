import assert from 'node:assert/strict';
import test from 'node:test';
import { createContentUpdates } from '../src/updates/content-updates.js';
import { TUTORIAL_GATE } from '../src/updates/manifest.js';
import { createDownloadQueue } from '../src/updates/queue.js';
import { memoryUpdateStore, updateFixture } from './update-fixture.js';

async function updateScenario() {
  const fixture = await updateFixture();
  const release = {
    ...fixture,
    manifest: {
      ...fixture.manifest,
      sources: [{ id: 'local', kind: 'local', priority: 1, baseUrl: './' }],
    },
    manifestUrl: 'https://updates.test/manifest.json',
  };
  function responseFor(url) {
    const bytes = fixture.payloads.get(url.pathname.slice(1));
    assert.ok(bytes);
    return new Response(bytes);
  }
  return { release, store: memoryUpdateStore(), responseFor };
}

function pauseVerifiedWrite(store) {
  const entered = Promise.withResolvers();
  const unblocked = Promise.withResolvers();
  const write = store.write;
  store.write = async (area, file, blob) => {
    if (area === 'verified') {
      entered.resolve();
      await unblocked.promise;
    }
    return write(area, file, blob);
  };
  return { started: entered.promise, resume: unblocked.resolve };
}

test('a refused resume can switch sources even when deleting the old checkpoint fails', async () => {
  const { release, store, responseFor } = await updateScenario();
  const chunk = release.index.chunks.find(({ id }) => id === 'optional');
  const [file] = chunk.files;
  await store.write('partial', file, new Blob(['opt']));
  const remove = store.remove;
  let partialRemovals = 0;
  store.remove = async (area, entry) => {
    if (area === 'partial' && ++partialRemovals === 1) {
      throw Error('Checkpoint is temporarily unavailable for deletion');
    }
    return remove(area, entry);
  };
  release.manifest.sources.unshift({
    id: 'mirror',
    kind: 'github-raw',
    priority: 0,
    baseUrl: 'https://mirror.test/',
  });
  const requestedRanges = [];
  const queue = createDownloadQueue({
    release,
    store,
    attempts: 1,
    fetchImpl: async (url, options) => {
      requestedRanges.push(options.headers?.Range);
      if (url.hostname !== 'updates.test') return new Response(null, { status: 416 });
      return responseFor(url);
    },
  });

  await queue.enqueue([chunk.id]);
  assert.deepEqual(requestedRanges, ['bytes=3-', undefined]);
  assert.equal(await (await store.read('verified', file)).text(), 'optional');
  assert.equal(await store.read('partial', file), null);
  assert.equal(queue.snapshot(chunk.id).state, 'ready');
});

test('an unknown chunk leaves existing queue entries untouched', async () => {
  const { release, store, responseFor } = await updateScenario();
  const queue = createDownloadQueue({ release, store, fetchImpl: responseFor });
  let changes = 0;
  queue.subscribe(() => changes++);

  assert.throws(() => queue.enqueue(['optional', 'retired']), /Unknown deferred chunk: retired/);
  assert.equal(queue.snapshot('optional').state, 'idle');
  assert.equal(changes, 0);

  await queue.enqueue(['optional']);
  assert.equal(queue.snapshot('optional').state, 'ready');
});

test('a second startup waits for the same active download', async () => {
  const { release, store, responseFor } = await updateScenario();
  const write = pauseVerifiedWrite(store);
  const updates = createContentUpdates({
    load: async () => release,
    store,
    fetchImpl: responseFor,
  });
  const first = updates.start();
  await write.started;
  let completed = false;
  const second = updates.start().then(() => {
    completed = true;
  });
  await Promise.resolve();
  const completedEarly = completed;
  write.resume();

  await Promise.all([first, second]);
  assert.equal(completedEarly, false);
  assert.equal(updates.queryGate().state, 'ready');
  updates.dispose();
});

test('a verified write that completes after disposal cannot publish queue progress', async () => {
  const { release, store, responseFor } = await updateScenario();
  const write = pauseVerifiedWrite(store);
  const queue = createDownloadQueue({ release, store, fetchImpl: responseFor });
  let changes = 0;
  queue.subscribe(() => changes++);
  const downloading = queue.enqueue(['optional']);
  await write.started;
  const published = changes;
  const beforeDispose = queue.snapshot('optional');
  queue.dispose();
  write.resume();

  await downloading;
  assert.equal(changes, published);
  assert.deepEqual(queue.snapshot('optional'), beforeDispose);
});

test('departure retries the failed manifest and shares the active load', async () => {
  const { release, store, responseFor } = await updateScenario();
  const recover = Promise.withResolvers();
  let loads = 0;
  const updates = createContentUpdates({
    load: async () => {
      if (++loads === 1) throw Error('Connection interrupted');
      return recover.promise;
    },
    store,
    fetchImpl: responseFor,
  });
  await updates.start();
  assert.equal(updates.queryGate().releaseStatus, 'failed');

  const firstClick = updates.requestGate(TUTORIAL_GATE, { retry: true });
  const nextClick = updates.requestGate(TUTORIAL_GATE, { retry: true });
  const loading = updates.start();
  recover.resolve(release);
  await loading;

  assert.equal(firstClick.releaseStatus, 'loading');
  assert.equal(nextClick.releaseStatus, 'loading');
  assert.equal(firstClick.state, 'waiting');
  assert.equal(nextClick.state, 'waiting');
  assert.equal(loads, 2);
  assert.equal(updates.requestGate(TUTORIAL_GATE, { retry: true }).state, 'ready');
  updates.dispose();
});

test('repeated departure requests retry a missing file once and wait for its verified write', async () => {
  const { release, store, responseFor } = await updateScenario();
  let connected = false;
  const files = [];
  const updates = createContentUpdates({
    load: async () => release,
    store,
    fetchImpl: async (url) => {
      files.push(url.pathname);
      if (!connected && url.pathname === '/assets/more.txt') {
        return new Response(null, { status: 503 });
      }
      return responseFor(url);
    },
  });
  await updates.start();
  const initial = updates.queryGate();
  assert.equal(initial.chunks[0].state, 'failed');
  assert.equal(initial.verifiedBytes, 10);
  const startIndex = files.length;
  connected = true;
  const write = pauseVerifiedWrite(store);

  assert.equal(updates.requestGate(TUTORIAL_GATE, { retry: true }).chunks[0].state, 'queued');
  await write.started;
  const waiting = updates.requestGate(TUTORIAL_GATE, { retry: true });
  const pending = updates.retryGate();
  write.resume();
  await pending;

  assert.equal(waiting.state, 'waiting');
  assert.equal(waiting.verifiedBytes, 10);
  assert.deepEqual(files.slice(startIndex), ['/assets/more.txt']);
  assert.equal(updates.requestGate(TUTORIAL_GATE, { retry: true }).state, 'ready');
  updates.dispose();
});
