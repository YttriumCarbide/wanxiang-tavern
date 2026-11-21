import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdventureState } from '../src/adventure/state.js';
import { normalizeScript } from '../src/ai/contracts.js';
import { newLibrary } from '../src/ai/library.js';
import { applySaveSnapshot, createSaveSnapshot } from '../src/app/saves.js';
import { adventureTestScript } from '../src/content/generation-mode.js';
import { beginEncounter, newExpedition } from '../src/expedition.js';
import { exportDatabase, readDatabaseBackup } from '../src/storage/backup.js';
import { createCheckpoint } from '../src/storage/checkpoint.js';
import { createGameStorage, openDatabase } from '../src/storage/database.js';
import { openDiskDatabase } from '../src/storage/disk-database.js';
import { restoreBackup } from '../src/storage/panel.js';

const libraryKey = 'game.wanxiang.worldbooks.v1';
const checkpointKey = 'wanxiang.battle-checkpoint.v1';

function backupWith(text) {
  return {
    app: 'wanxiang-static-backup',
    version: 1,
    entries: [
      ['installation', { version: 1 }],
      [libraryKey, text],
    ],
  };
}

test('a complete backup checks the inner game progress before returning replacement entries', () => {
  assert.throws(() => readDatabaseBackup(backupWith('{"version":1,')), /JSON/);
  assert.throws(() => readDatabaseBackup(backupWith('{}')), /游戏进度格式/);
  assert.throws(
    () => readDatabaseBackup(backupWith('{"version":2,"characters":[],"party":[]}')),
    /版本不兼容/,
  );
  const valid = backupWith('{"version":1,"characters":[],"party":[],"chapter":3}');
  assert.deepEqual(readDatabaseBackup(valid).entries, valid.entries);
  const invalidPreferences = backupWith('{"version":1,"characters":[],"party":[],"chapter":3}');
  invalidPreferences.preferences = false;
  assert.throws(() => readDatabaseBackup(invalidPreferences), /备份偏好设置无效/);
  valid.entries[0][1] = null;
  assert.throws(() => readDatabaseBackup(valid), /安装记录/);
});

test('portable backup rejects nonfinite and circular values before JSON loses the data', async () => {
  const cycle = {};
  cycle.next = cycle;
  for (const value of [NaN, Infinity, -Infinity, cycle]) {
    const database = { entries: () => [['world.states', { current: value }]] };
    await assert.rejects(exportDatabase(database, {}), /无法完整保存为 JSON/);
  }
});

function indexedDatabaseWithWorkingCopy(records) {
  const connection = {
    transaction(_, mode) {
      const working = new Map(records);
      const pending = [];
      let aborted = false;
      const transaction = {
        objectStore: () => ({
          openCursor() {
            const request = {};
            const entries = [...working];
            function advance() {
              const entry = entries.shift();
              request.result = entry && { key: entry[0], value: entry[1], continue: advance };
              pending.push(() => request.onsuccess());
            }
            advance();
            return request;
          },
          get(key) {
            const request = {};
            pending.push(() => {
              request.result = working.get(key);
              request.onsuccess();
            });
            return request;
          },
          delete: (key) => working.delete(key),
          put: (value, key) => working.set(key, structuredClone(value)),
        }),
        abort() {
          aborted = true;
        },
      };
      queueMicrotask(() => {
        for (const settle of pending) if (!aborted) settle();
        if (aborted) return transaction.onabort();
        if (mode === 'readwrite') {
          records.clear();
          for (const [key, value] of working) records.set(key, value);
        }
        return transaction.oncomplete();
      });
      return transaction;
    },
  };
  return {
    open() {
      const request = { result: connection };
      queueMicrotask(() => request.onsuccess());
      return request;
    },
  };
}

test('synchronous clone failure rolls back earlier deletes and puts in the same IndexedDB write', async () => {
  const records = new Map([['keep', 1]]);
  const database = await openDatabase({ indexedDB: indexedDatabaseWithWorkingCopy(records) });
  await assert.rejects(
    database.write(
      [
        ['added', 2],
        ['bad', () => {}],
      ],
      ['keep'],
    ),
    {
      name: 'DataCloneError',
    },
  );
  assert.deepEqual([...records], [['keep', 1]]);
  await database.write([['added', 2]], ['keep']);
  assert.deepEqual([...records], [['added', 2]]);
});

function checkpointFixture(exploration = null) {
  const book = { ...normalizeScript(adventureTestScript(), 'book'), runId: 'fixture-run' };
  const expedition = newExpedition('bossGate', {}, exploration);
  expedition.adventure = createAdventureState(book, expedition.id);
  const library = newLibrary();
  const session = {
    runtime: { mode: 'battle' },
    selection: {},
    journey: { expedition },
    ai: { activeScript: book, library, chat: { quick: [] } },
    battle: { state: beginEncounter(newExpedition()), plan: [], history: [] },
  };
  const entries = new Map();
  const storage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  };
  const checkpoint = createCheckpoint({ session, storage, apiClient: { staticMode: true } });
  return { checkpoint, entries, session, storage };
}

test('a checkpoint with a missing enemy list returns to the hall with earned inventory', () => {
  const { checkpoint, entries, session } = checkpointFixture();
  session.ai.library.inventory.gold = 375;
  checkpoint.saveNow();
  assert.ok(checkpoint.pending());
  const damaged = JSON.parse(entries.get(checkpointKey));
  delete damaged.state.enemyIds;
  entries.set(checkpointKey, JSON.stringify(damaged));
  assert.equal(checkpoint.pending(), null);
  assert.equal(entries.has(checkpointKey), false);
  assert.equal(session.ai.library.inventory.gold, 375);
});

test('a legacy Ruins slot cannot restore the adventure purged by migration', () => {
  const { session, storage } = checkpointFixture({ map: 'ruins' });
  delete session.ai.library.migrations.ruinsResetV2;
  const snapshot = createSaveSnapshot(session);
  let resumed = false;
  applySaveSnapshot({ session, storage, journey: { resume: () => (resumed = true) } }, snapshot);
  assert.equal(resumed, false);
});

test('two static game tabs cannot overwrite a newer saved library with a stale one', async () => {
  const key = libraryKey.slice('game.'.length);
  const durable = new Map([[libraryKey, 'initial']]);
  const indexedDB = indexedDatabaseWithWorkingCopy(durable);
  const first = createGameStorage(await openDatabase({ indexedDB }));
  const staleDatabase = await openDatabase({ indexedDB });
  const stale = createGameStorage(staleDatabase);
  first.setItem(key, 'newer');
  await first.flush();
  stale.setItems([
    [key, 'based on initial'],
    [checkpointKey, 'stale checkpoint'],
  ]);
  await assert.rejects(stale.flush(), /另一游戏页面已保存新进度/);
  assert.deepEqual(await staleDatabase.readEntries(), [[libraryKey, 'newer']]);
});

test('only a later durable value for the failed key allows backup again', async () => {
  let first = true;
  const storage = createGameStorage({
    entries: () => [],
    async write() {
      if (first) {
        first = false;
        throw Error('temporary write failure');
      }
    },
  });
  storage.setItem('progress', 'previous');
  await assert.rejects(storage.flush(), /temporary write failure/);
  storage.setItem('settings', 'updated settings');
  await assert.rejects(storage.flush(), /temporary write failure/);
  storage.setItem('progress', 'newer');
  await storage.flush();
});

test('a failed connection-settings write does not partially commit a disk import', async (t) => {
  const previous = '{"version":1,"characters":[],"party":[],"chapter":3}';
  const imported = '{"version":1,"characters":[],"party":[],"chapter":2}';
  const disk = new Map([[libraryKey, previous]]);
  let revision = 1;
  t.mock.method(globalThis, 'fetch', async (_, request) => {
    if (request.method === 'POST') {
      const { entries, deleted } = JSON.parse(request.body);
      for (const key of deleted) disk.delete(key);
      for (const [key, value] of entries) disk.set(key, value);
      return Response.json({ revision: ++revision });
    }
    return Response.json({
      app: 'wanxiang-disk-storage',
      revision,
      entries: [...disk],
      token: 'fixture',
    });
  });
  const browser = {
    get: () => undefined,
    entries: () => [],
    async write(entries) {
      if (entries.some(([key]) => key === 'api.config')) throw Error('connection storage failed');
    },
  };
  const database = await openDiskDatabase('/__demo/storage', browser, () => {});
  await assert.rejects(
    database.write([
      [libraryKey, imported],
      ['api.config', { version: 5 }],
    ]),
    /connection storage failed/,
  );
  assert.equal(disk.get(libraryKey), previous);
});

test('disk updates compare Blob bytes before skipping or committing an image replacement', async (t) => {
  let revision = 1;
  const diskBlob = { blob: true, mime: 'image/png', base64: 'AQ==' };
  const disk = new Map([['portrait.avatar', diskBlob]]);
  const browserValues = new Map();
  const browser = {
    get: (key) => browserValues.get(key),
    entries: () => [...browserValues],
    async write(entries, deleted = []) {
      for (const key of deleted) browserValues.delete(key);
      for (const [key, value] of entries) browserValues.set(key, structuredClone(value));
    },
  };
  const posts = [];
  t.mock.method(globalThis, 'fetch', async (_, request) => {
    if (request.method === 'POST') {
      posts.push(JSON.parse(request.body));
      for (const key of JSON.parse(request.body).deleted) disk.delete(key);
      for (const [key, value] of JSON.parse(request.body).entries) disk.set(key, value);
      return Response.json({ revision: ++revision });
    }
    return Response.json({
      app: 'wanxiang-disk-storage',
      revision,
      entries: [...disk],
      token: 'fixture',
    });
  });
  const database = await openDiskDatabase('/__demo/storage', browser, () => {});
  await database.write([['portrait.avatar', new Blob([Uint8Array.of(1)], { type: 'image/png' })]]);
  assert.equal(posts.length, 0);

  await database.write([['portrait.avatar', new Blob([Uint8Array.of(2)], { type: 'image/png' })]]);
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].entries[0], [
    'portrait.avatar',
    { blob: true, mime: 'image/png', base64: 'Ag==' },
  ]);
  assert.equal((await browser.get('portrait.avatar').arrayBuffer()).byteLength, 1);
  assert.equal(new Uint8Array(await browser.get('portrait.avatar').arrayBuffer())[0], 2);
});

test('a definite disk failure restores the browser connection unless it changed elsewhere', async (t) => {
  const original = { version: 5, model: 'original' };
  const newer = { version: 5, model: 'other tab' };
  const records = new Map([['api.config', original]]);
  const indexedDB = indexedDatabaseWithWorkingCopy(records);
  const browser = await openDatabase({ indexedDB });
  const otherTab = await openDatabase({ indexedDB });
  let interleave = false;
  t.mock.method(globalThis, 'fetch', async (_, request) => {
    if (request.method === 'POST') {
      if (interleave) await otherTab.write([['api.config', newer]]);
      return Response.json({ error: 'disk transaction was rejected' }, { status: 409 });
    }
    return Response.json({ app: 'wanxiang-disk-storage', revision: 1, entries: [], token: 'a' });
  });
  const database = await openDiskDatabase('/__demo/storage', browser, () => {});
  const imported = [
    [libraryKey, 'imported'],
    ['api.config', { version: 5, model: 'imported' }],
  ];
  await assert.rejects(database.write(imported), /disk transaction was rejected/);
  assert.deepEqual(records.get('api.config'), original);

  interleave = true;
  await assert.rejects(database.write(imported), /接口连接无法自动恢复/);
  assert.deepEqual(records.get('api.config'), newer);
});

test('an unresolved disk import freezes stale writes and keeps the staged connection', async (t) => {
  const records = new Map([['api.config', { version: 5, model: 'original' }]]);
  const browser = await openDatabase({ indexedDB: indexedDatabaseWithWorkingCopy(records) });
  let posted = false;
  t.mock.method(globalThis, 'fetch', async (_, request) => {
    if (request.method === 'POST') posted = true;
    if (posted) throw Error('HTTP connection lost');
    return Response.json({ app: 'wanxiang-disk-storage', revision: 1, entries: [], token: 'a' });
  });
  const database = await openDiskDatabase('/__demo/storage', browser, () => {});
  const storage = createGameStorage(database);
  const connection = { version: 5, model: 'imported' };
  const backup = {
    entries: [
      [libraryKey, 'imported'],
      ['api.config', connection],
    ],
    preferences: {},
  };
  await assert.rejects(restoreBackup(database, storage, backup, {}), { requiresReload: true });
  assert.deepEqual(records.get('api.config'), connection);
  assert.throws(() => storage.setItem('progress', 'stale'), /暂时无法保存/);
});

test('a concurrent disk commit is not mistaken for a timed-out write', async (t) => {
  const original = 'previous';
  const unrelated = 'unrelated';
  const durable = new Map([
    [libraryKey, original],
    [unrelated, 'previous unrelated value'],
  ]);
  let revision = 1;
  let initialRead = true;
  t.mock.method(globalThis, 'fetch', async (_, request) => {
    if (request.method === 'POST') {
      durable.set(libraryKey, 'my write');
      durable.set(unrelated, 'another tab');
      revision++;
      throw Error('response lost after a concurrent commit');
    }
    if (initialRead) {
      initialRead = false;
      return Response.json({
        app: 'wanxiang-disk-storage',
        revision,
        entries: [...durable].map(([key, value]) => [key, key === libraryKey ? original : value]),
        token: 'fixture',
      });
    }
    return Response.json({
      app: 'wanxiang-disk-storage',
      revision,
      entries: [...durable],
      token: 'fixture',
    });
  });
  const browser = {
    get: () => undefined,
    entries: () => [],
    async write() {},
  };
  const database = await openDiskDatabase('/__demo/storage', browser, () => {});

  await assert.rejects(database.write([[libraryKey, 'my write']]), { requiresReload: true });
  assert.equal(database.get(libraryKey), original);
  assert.equal(database.get(unrelated), 'previous unrelated value');
  assert.equal(durable.get(libraryKey), 'my write');
  assert.equal(durable.get(unrelated), 'another tab');
});

test('import pauses the old session and resumes it only when the write is rejected', async () => {
  const started = Promise.withResolvers();
  let rejectWrite;
  const database = {
    entries: () => [],
    write: () =>
      new Promise((_, reject) => {
        started.resolve();
        rejectWrite = reject;
      }),
  };
  const storage = createGameStorage(database);
  const restoring = restoreBackup(database, storage, { entries: [], preferences: {} }, {});
  assert.throws(() => storage.setItem('progress', 'stale'), /暂时无法保存/);
  await started.promise;
  assert.ok(rejectWrite);
  rejectWrite(Error('database rejected import'));
  await assert.rejects(restoring, /database rejected import/);
  await storage.replace(() => {});
  assert.throws(() => storage.setItem('progress', 'stale'), /暂时无法保存/);
});
