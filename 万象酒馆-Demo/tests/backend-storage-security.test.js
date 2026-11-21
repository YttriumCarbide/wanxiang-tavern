import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { link, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { atomicWrite, createDiskStore } from '../server/disk-store.mjs';
import { createDiskStorageApi } from '../server/disk-storage-api.mjs';
import { createHelperStorage } from '../server/helper-storage.mjs';
import { createPortraitStore } from '../server/portrait-store.mjs';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import {
  PATH_TRAVERSAL_INPUTS,
  MALFORMED_JSON_BODIES,
  NON_OBJECT_JSON_BODIES,
  makeOversizedJsonBody,
} from './fixtures/backend-security-cases.js';

async function temporaryDirectory(t) {
  const root = path.join(process.cwd(), '.runtime/tests');
  await mkdir(root, { recursive: true });
  const directory = await mkdtemp(path.join(root, 'backend-storage-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

async function assertNoTemporaries(directory) {
  const files = await readdir(directory);
  assert.deepEqual(
    files.filter((file) => file.endsWith('.tmp')),
    [],
  );
}

function imageBytes() {
  return Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 1, 2, 3]);
}

function imageName(bytes) {
  return createHash('sha256').update(bytes).digest('hex') + '.png';
}

function book(name = 'security-test') {
  return { name, entries: {} };
}

async function invokeDiskApi(api, { method = 'POST', headers = {}, chunks = [] } = {}) {
  const request = Readable.from(chunks);
  request.method = method;
  request.headers = {
    host: 'localhost:4180',
    origin: 'http://localhost:4180',
    'content-type': 'application/json',
    ...headers,
  };
  const response = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    writeHead(status) {
      this.statusCode = status;
      return this;
    },
    end(value = '') {
      this.body = String(value);
      return this;
    },
  };
  await api(request, response);
  return {
    status: response.statusCode,
    headers: response.headers,
    value: response.body ? JSON.parse(response.body) : null,
  };
}

test('atomicWrite cleans failed temporary files and remains usable after a blocked destination', async (t) => {
  const directory = await temporaryDirectory(t);
  const file = path.join(directory, 'blocked.json');
  await mkdir(file);
  await assert.rejects(atomicWrite(file, 'next'));
  await assertNoTemporaries(directory);
  await rm(file, { recursive: true });
  await atomicWrite(file, 'committed');
  assert.equal(await readFile(file, 'utf8'), 'committed');
  await assertNoTemporaries(directory);
});

test('helper storage exposes only committed values and does not persist failed values later', async (t) => {
  const directory = await temporaryDirectory(t);
  const file = path.join(directory, 'helper.json');
  const store = await createHelperStorage(file);
  await mkdir(file);
  const pending = store.save('failed', { value: 'uncommitted' });
  assert.deepEqual(store.get('failed'), {});
  await assert.rejects(pending);
  assert.deepEqual(store.get('failed'), {});
  await assertNoTemporaries(directory);

  await rm(file, { recursive: true });
  assert.deepEqual(await store.save('accepted', { value: 'committed' }), { saved: true });
  assert.deepEqual(store.get('failed'), {});
  const persisted = JSON.parse(await readFile(file, 'utf8'));
  assert(!Object.hasOwn(persisted, 'failed'));
  assert.deepEqual(persisted.accepted, { value: 'committed' });
  const reopened = await createHelperStorage(file);
  assert.deepEqual(reopened.get('failed'), {});
  assert.deepEqual(reopened.get('accepted'), { value: 'committed' });
});

test('helper storage merges concurrent IDs and enforces dictionary and ID boundaries', async (t) => {
  const directory = await temporaryDirectory(t);
  const file = path.join(directory, 'helper.json');
  const store = await createHelperStorage(file);
  assert.deepEqual(store.get('constructor'), {});
  const firstValue = { value: 'first' };
  const first = store.save('alpha', firstValue);
  firstValue.value = 'changed-by-caller';
  const second = store.save('beta', { value: 'second' });
  await Promise.all([first, second]);
  await store.save('constructor', { value: 'own-property' });
  assert.deepEqual(store.get('alpha'), { value: 'first' });
  assert.deepEqual(store.get('beta'), { value: 'second' });
  assert.deepEqual(store.get('constructor'), { value: 'own-property' });
  const returned = store.get('alpha');
  returned.value = 'changed-return-value';
  assert.deepEqual(store.get('alpha'), { value: 'first' });

  for (const id of [...PATH_TRAVERSAL_INPUTS, null, 123, ['alpha']]) {
    assert.throws(() => store.get(id), /ID/);
    await assert.rejects(store.save(id, { value: 'blocked' }), /ID/);
  }
  await assert.rejects(store.save('invalid-value', { value: 123 }), /字符串字典/);
  await assert.rejects(store.save('oversized', JSON.parse(makeOversizedJsonBody(4000000))), /4MB/);
  const reopened = await createHelperStorage(file);
  assert.deepEqual(reopened.get('alpha'), { value: 'first' });
  assert.deepEqual(reopened.get('beta'), { value: 'second' });
  assert.deepEqual(reopened.get('constructor'), { value: 'own-property' });
  await assertNoTemporaries(directory);
});

test('portrait publication replaces the destination and preserves complete original bytes', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = await createPortraitStore(directory);
  const bytes = imageBytes();
  const name = imageName(bytes);
  const destination = path.join(directory, name);
  const retained = path.join(directory, 'retained-old-file.bin');
  const oldBytes = Buffer.from('previous-incomplete-file');
  await writeFile(destination, oldBytes);
  await link(destination, retained);
  const dataUrl = 'data:image/png;base64,' + bytes.toString('base64');
  const result = await store.save(dataUrl);
  assert.equal(result.url, '/api/ai/portraits/' + name);
  assert.deepEqual(await readFile(destination), bytes);
  assert.deepEqual(await readFile(retained), oldBytes);

  const results = await Promise.all(Array.from({ length: 8 }, () => store.save(dataUrl)));
  assert(results.every((item) => item.url === result.url));
  assert.deepEqual(await store.read(name), { bytes, mime: 'image/png' });
  for (const input of PATH_TRAVERSAL_INPUTS) {
    await assert.rejects(store.read(input), /引用/);
  }
  await assert.rejects(store.save('data:image/png;base64,QUJD'), /图片/);
  await assert.rejects(store.save('data:image/png;base64,' + 'A'.repeat(8500001)), /6MB/);
  await assertNoTemporaries(directory);
});

test('portrait write failure cleans its temporary file and permits a deterministic retry', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = await createPortraitStore(directory);
  const bytes = imageBytes();
  const name = imageName(bytes);
  const destination = path.join(directory, name);
  const dataUrl = 'data:image/png;base64,' + bytes.toString('base64');
  await mkdir(destination);
  await assert.rejects(store.save(dataUrl));
  await assertNoTemporaries(directory);
  await rm(destination, { recursive: true });
  await store.save(dataUrl);
  assert.deepEqual((await store.read(name)).bytes, bytes);
});

test('disk storage rejects path inputs while retaining opaque dotted keys and verified portraits', async (t) => {
  const root = await temporaryDirectory(t);
  const directory = path.join(root, 'saves');
  const outside = path.join(root, 'outside.json');
  await writeFile(outside, 'outside-sentinel');
  const store = createDiskStore({ directory });
  for (const key of PATH_TRAVERSAL_INPUTS) {
    await assert.rejects(
      store.write({ revision: 0, entries: [[key, 'blocked']], deleted: [] }),
      /名称/,
    );
  }
  assert.equal((await store.snapshot()).revision, 0);
  const bytes = imageBytes();
  const name = imageName(bytes);
  const portraitKey = 'portrait.' + name;
  const value = { blob: true, mime: 'image/png', base64: bytes.toString('base64') };
  assert.deepEqual(
    await store.write({
      revision: 0,
      entries: [
        ['game.safe..name', 'opaque-key'],
        [portraitKey, value],
      ],
      deleted: [],
    }),
    { revision: 1 },
  );
  const snapshot = await store.snapshot();
  assert.equal(new Map(snapshot.entries).get('game.safe..name'), 'opaque-key');
  assert.deepEqual(new Map(snapshot.entries).get(portraitKey), value);
  const wrongName = (name[0] === 'a' ? 'b' : 'a') + name.slice(1);
  await assert.rejects(
    store.write({ revision: 1, entries: [['portrait.' + wrongName, value]], deleted: [] }),
    /校验/,
  );
  assert.equal((await store.snapshot()).revision, 1);
  assert.equal(await readFile(outside, 'utf8'), 'outside-sentinel');
  const reopened = await createDiskStore({ directory }).snapshot();
  assert.deepEqual(new Map(reopened.entries).get(portraitKey), value);
});

test('disk storage serializes same-revision writers and rejects the stale transaction', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = createDiskStore({ directory });
  const results = await Promise.allSettled([
    store.write({ revision: 0, entries: [['game.progress', 'first']], deleted: [] }),
    store.write({ revision: 0, entries: [['game.progress', 'second']], deleted: [] }),
  ]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.equal(results[1].reason.status, 409);
  const snapshot = await store.snapshot();
  assert.equal(snapshot.revision, 1);
  assert.equal(new Map(snapshot.entries).get('game.progress'), 'first');
});

test('disk storage leaves committed memory unchanged when current-file publication fails', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = createDiskStore({ directory });
  await store.write({ revision: 0, entries: [['game.progress', 'before']], deleted: [] });
  const current = path.join(directory, '当前存档.json');
  await unlink(current);
  await mkdir(current);
  await assert.rejects(
    store.write({ revision: 1, entries: [['game.progress', 'after']], deleted: [] }),
  );
  const failedSnapshot = await store.snapshot();
  assert.equal(failedSnapshot.revision, 1);
  assert.equal(new Map(failedSnapshot.entries).get('game.progress'), 'before');
  await assertNoTemporaries(directory);
  await rm(current, { recursive: true });
  assert.deepEqual(
    await store.write({ revision: 1, entries: [['game.progress', 'after']], deleted: [] }),
    { revision: 2 },
  );
  const reopened = await createDiskStore({ directory }).snapshot();
  assert.equal(reopened.revision, 2);
  assert.equal(new Map(reopened.entries).get('game.progress'), 'after');
});

test('worldbook file operations reject traversal and retain normal book operations', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = await createWorldbookStore(directory);
  for (const id of PATH_TRAVERSAL_INPUTS) {
    await assert.rejects(store.get(id), /ID/);
    await assert.rejects(store.save({ id, book: book() }), /ID/);
    await assert.rejects(store.delete(id), /ID/);
  }
  await store.save({ id: 'security-book', book: book('accepted-book') });
  assert.equal((await store.get('security-book')).book.name, 'accepted-book');
  assert((await store.list()).some((item) => item.id === 'security-book'));
  await assertNoTemporaries(path.join(directory, 'books'));
});

test('worldbook configuration failure preserves committed settings and recovers its queue', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = await createWorldbookStore(directory);
  await store.save({ id: 'rollback-book', book: book() });
  await store.configure({ globalSelect: ['rollback-book'], chat: ['rollback-book'] });
  const before = (await store.visible()).settings;
  const settingsFile = path.join(directory, 'settings.json');
  await unlink(settingsFile);
  await mkdir(settingsFile);
  const pending = store.configure({ globalSelect: [], chat: [] });
  const observed = store.visible();
  await assert.rejects(pending);
  assert.deepEqual((await observed).settings, before);
  assert.deepEqual((await store.resolve('chat')).settings, before);
  await assertNoTemporaries(directory);

  await rm(settingsFile, { recursive: true });
  await store.configure({ globalSelect: [], chat: [] });
  assert.deepEqual((await store.visible()).settings.globalSelect, []);
  const reopened = await createWorldbookStore(directory);
  assert.deepEqual((await reopened.visible()).settings.globalSelect, []);
});

test('worldbook deletion restores the original book when settings cannot be committed', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = await createWorldbookStore(directory);
  const id = 'rollback-book';
  await store.save({ id, book: book('retained-book') });
  const configuration = {
    globalSelect: [id],
    chat: [id],
    bindings: { hero: [id] },
  };
  await store.configure(configuration);
  const before = (await store.visible()).settings;
  const bookFile = path.join(directory, 'books', id + '.json');
  const original = await readFile(bookFile);
  const settingsFile = path.join(directory, 'settings.json');
  await unlink(settingsFile);
  await mkdir(settingsFile);
  await assert.rejects(store.delete(id));
  assert.deepEqual(await readFile(bookFile), original);
  assert.equal((await store.get(id)).book.name, 'retained-book');
  assert.deepEqual((await store.visible()).settings, before);
  await assertNoTemporaries(directory);
  await assertNoTemporaries(path.join(directory, 'books'));

  await rm(settingsFile, { recursive: true });
  await store.configure(configuration);
  const deleted = await store.delete(id);
  assert(!deleted.books.some((item) => item.id === id));
  assert(!deleted.settings.globalSelect.includes(id));
  assert(!deleted.settings.chat.includes(id));
  assert(!deleted.settings.bindings.hero?.includes(id));
  await assert.rejects(store.get(id), { code: 'ENOENT' });
  const reopened = await createWorldbookStore(directory);
  await assert.rejects(reopened.get(id), { code: 'ENOENT' });
  assert(!(await reopened.visible()).settings.globalSelect.includes(id));
});

test(
  'worldbook queued save, delete and public reads complete in order without self-deadlock',
  { timeout: 10000 },
  async (t) => {
    const directory = await temporaryDirectory(t);
    const store = await createWorldbookStore(directory);
    const id = 'ordered-book';
    await store.save({ id, book: book('initial-book') });
    await store.configure({ globalSelect: [id] });
    const saved = store.save({ id, book: book('replacement-book') });
    const deleted = store.delete(id);
    const visible = store.visible();
    const listed = store.list();
    const resolved = store.resolve('chat');
    const results = await Promise.all([saved, deleted, visible, listed, resolved]);
    assert.equal(results[0].id, id);
    assert(!results[1].books.some((item) => item.id === id));
    assert(!results[2].books.some((item) => item.id === id));
    assert(!results[3].some((item) => item.id === id));
    assert(!results[4].books.some((item) => item.id === id));
    await assert.rejects(store.get(id), { code: 'ENOENT' });
    await store.save({ id, book: book('queue-remains-usable') });
    assert.equal((await store.get(id)).book.name, 'queue-remains-usable');
  },
);

test('worldbook state commits preserve cancellation, rollback and compare-and-swap guarantees', async (t) => {
  const directory = await temporaryDirectory(t);
  const store = await createWorldbookStore(directory);
  await assert.rejects(store.commit('chat', { step: 1, effects: {} }, 0, AbortSignal.abort()), {
    name: 'AbortError',
  });
  const stateFile = path.join(directory, 'state.json');
  await mkdir(stateFile);
  await assert.rejects(store.commit('chat', { step: 1, effects: {} }, 0));
  assert.equal((await store.resolve('chat')).state.step, 0);
  await assertNoTemporaries(directory);
  await rm(stateFile, { recursive: true });
  const results = await Promise.all([
    store.commit('chat', { step: 1, effects: { first: true } }, 0),
    store.commit('chat', { step: 1, effects: { stale: true } }, 0),
    store.commit('script', { step: 1, effects: { script: true } }, 0),
  ]);
  assert.deepEqual(results, [true, false, true]);
  const reopened = await createWorldbookStore(directory);
  assert.deepEqual((await reopened.resolve('chat')).state, {
    step: 1,
    effects: { first: true },
  });
  assert.deepEqual((await reopened.resolve('script')).state, {
    step: 1,
    effects: { script: true },
  });
});

test('disk API rejects unauthorized, malformed and oversized requests without committing them', async (t) => {
  const directory = await temporaryDirectory(t);
  const previousExitListeners = new Set(process.listeners('exit'));
  const api = createDiskStorageApi({ directory, port: 4180 });
  const initial = await invokeDiskApi(api, { method: 'GET' });
  const leaseListeners = process
    .listeners('exit')
    .filter((item) => !previousExitListeners.has(item));
  t.after(() => {
    for (const listener of leaseListeners) process.removeListener('exit', listener);
  });
  assert.equal(initial.status, 200);
  assert.equal(initial.value.revision, 0);
  assert.match(initial.value.token, /^[a-f0-9]{64}$/);
  assert.equal(initial.headers['cache-control'], 'no-store');
  assert.equal(initial.headers['x-content-type-options'], 'nosniff');
  const tokenHeaders = { 'x-tavern-storage': initial.value.token };

  for (const headers of [
    { host: 'attacker.invalid:4180' },
    { origin: 'https://attacker.invalid' },
    { 'sec-fetch-site': 'cross-site' },
  ]) {
    assert.equal((await invokeDiskApi(api, { method: 'GET', headers })).status, 403);
  }
  assert.equal((await invokeDiskApi(api, { chunks: [Buffer.from('{}')] })).status, 403);
  assert.equal(
    (
      await invokeDiskApi(api, {
        headers: { ...tokenHeaders, 'content-type': 'text/plain' },
        chunks: [Buffer.from('{}')],
      })
    ).status,
    415,
  );
  assert.equal((await invokeDiskApi(api, { method: 'DELETE' })).status, 405);

  for (const body of [...MALFORMED_JSON_BODIES, ...NON_OBJECT_JSON_BODIES]) {
    const response = await invokeDiskApi(api, {
      headers: tokenHeaders,
      chunks: [Buffer.from(body)],
    });
    assert(response.status >= 400, body);
    assert.equal(typeof response.value.error, 'string');
  }
  const megabyte = Buffer.alloc(1024 * 1024, 120);
  const oversized = await invokeDiskApi(api, {
    headers: tokenHeaders,
    chunks: [Buffer.from('{"payload":"'), ...Array(64).fill(megabyte), Buffer.from('"}')],
  });
  assert(oversized.status >= 400);
  assert.match(oversized.value.error, /64MB/);
  assert.equal((await invokeDiskApi(api, { method: 'GET' })).value.revision, 0);

  const text = JSON.stringify({
    revision: 0,
    entries: [['game.progress', 'split-测试值']],
    deleted: [],
  });
  const bytes = Buffer.from(text);
  const splitAt = bytes.indexOf(Buffer.from('测')) + 1;
  const accepted = await invokeDiskApi(api, {
    headers: { ...tokenHeaders, 'content-type': 'application/json; charset=utf-8' },
    chunks: [bytes.subarray(0, splitAt), bytes.subarray(splitAt)],
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.value.revision, 1);
  const snapshot = await invokeDiskApi(api, { method: 'GET' });
  assert.equal(snapshot.value.revision, 1);
  assert.equal(new Map(snapshot.value.entries).get('game.progress'), 'split-测试值');
});
