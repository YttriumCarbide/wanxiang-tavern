import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_SLOTS,
  SAVE_PAGE_SIZE,
  SAVE_PAGE_COUNT,
  SAVES_STORAGE_KEY,
  createSaveManager,
  createSaveSnapshot,
  validateSaveSnapshot,
  loadSavesStore,
  writeSavesStore,
  applySaveSnapshot,
} from '../src/app/saves.js';
import { createSession } from '../src/app/session.js';

function createMockStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key) => store.get(key) || null,
    setItem: (key, val) => store.set(key, String(val)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

function installDomFixture(t, cleanup = () => {}) {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const previousConfirm = globalThis.confirm;
  globalThis.document = { querySelector: () => null, querySelectorAll: () => [] };
  globalThis.window = { confirm: () => true };
  globalThis.confirm = () => true;
  t.after(() => {
    cleanup();
    if (previousConfirm === undefined) delete globalThis.confirm;
    else globalThis.confirm = previousConfirm;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
}

function installManagerFixture(t, { storage = createMockStorage(), confirm = () => true } = {}) {
  let saves;
  installDomFixture(t, () => saves?.dispose());
  globalThis.window.confirm = confirm;
  globalThis.confirm = confirm;
  const notices = [];
  const session = createSession(storage);
  saves = createSaveManager({
    session,
    storage,
    events: { on() {} },
    apiClient: { staticMode: false },
    shell: { toast: (message) => notices.push(message) },
  });
  return { session, storage, saves, notices };
}

function makeFile(payload) {
  return { text: async () => payload };
}

function validSnapshotPayload(slotId = 'auto', note = 'imported') {
  return JSON.stringify(createSaveSnapshot(createSession(createMockStorage()), slotId, note));
}

test('SAVE_SLOTS contains exactly 20 slots: auto and 19 manual slots', () => {
  assert.equal(SAVE_SLOTS.length, 20);
  const ids = SAVE_SLOTS.map((s) => s.id);
  assert.equal(ids[0], 'auto');
  assert.equal(ids.length, 20);
  for (let i = 1; i <= 19; i += 1) {
    assert.equal(ids[i], `slot${i}`);
  }

  const autoSlot = SAVE_SLOTS.find((s) => s.id === 'auto');
  assert.equal(autoSlot.isAuto, true);
  assert.equal(autoSlot.label, '自动保存');

  const manualSlots = SAVE_SLOTS.filter((s) => !s.isAuto);
  assert.equal(manualSlots.length, 19);
  assert.equal(manualSlots[0].label, '存档位 1');
  assert.equal(manualSlots[18].label, '存档位 19');
});

test('SAVE_PAGE_SIZE and SAVE_PAGE_COUNT describe the 20-slot paging contract', () => {
  assert.equal(SAVE_PAGE_SIZE, 4);
  assert.equal(SAVE_PAGE_COUNT, 5);
  assert.equal(SAVE_PAGE_SIZE * SAVE_PAGE_COUNT, SAVE_SLOTS.length);
});

test('loadSavesStore returns default empty slots when storage is empty or damaged', () => {
  const storage = createMockStorage();
  const store = loadSavesStore(storage);
  assert.equal(store.version, 1);
  assert.equal(store.slots.auto, null);
  assert.equal(store.slots.slot1, null);
  assert.equal(store.slots.slot2, null);
  assert.equal(store.slots.slot3, null);
  assert.equal(store.slots.slot19, null);
  assert.equal(Object.keys(store.slots).length, 20);

  storage.setItem(SAVES_STORAGE_KEY, 'invalid json {');
  const fallback = loadSavesStore(storage);
  assert.equal(fallback.version, 1);
  assert.equal(fallback.slots.auto, null);
  assert.equal(Object.keys(fallback.slots).length, 20);
});

test('legacy 4-slot store migrates data and fills all 20 slots', () => {
  const session = createSession();
  const legacy = {
    version: 1,
    slots: {
      auto: createSaveSnapshot(session, 'auto', '旧自动'),
      slot1: createSaveSnapshot(session, 'slot1', '旧槽1'),
      slot2: createSaveSnapshot(session, 'slot2', '旧槽2'),
      slot3: createSaveSnapshot(session, 'slot3', '旧槽3'),
    },
  };
  const storage = createMockStorage({ [SAVES_STORAGE_KEY]: JSON.stringify(legacy) });
  const store = loadSavesStore(storage);

  assert.equal(store.slots.auto?.note, '旧自动');
  assert.equal(store.slots.slot1?.note, '旧槽1');
  assert.equal(store.slots.slot2?.note, '旧槽2');
  assert.equal(store.slots.slot3?.note, '旧槽3');
  assert.equal(Object.keys(store.slots).length, 20);
  for (let i = 4; i <= 19; i += 1) {
    assert.equal(store.slots[`slot${i}`], null);
  }
});

test('createSaveSnapshot creates a comprehensive, valid snapshot from session', () => {
  const session = createSession();
  const snapshot = createSaveSnapshot(session, 'slot1', '测试存档');

  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.slotId, 'slot1');
  assert.equal(snapshot.note, '测试存档');
  assert.ok(snapshot.timestamp > 0);
  assert.ok(typeof snapshot.dateString === 'string' && snapshot.dateString.length > 0);

  // 摘要
  assert.equal(snapshot.summary.chapter, 1);
  assert.equal(snapshot.summary.mode, 'inn');
  assert.equal(snapshot.summary.partyNames.length, 6);
  assert.ok(snapshot.summary.characterCount >= 6);

  // 校验
  assert.equal(validateSaveSnapshot(snapshot), true);
  assert.equal(validateSaveSnapshot(null), false);
  assert.equal(validateSaveSnapshot({}), false);
  assert.equal(validateSaveSnapshot({ version: 1, data: {} }), false);
});

test('writeSavesStore and loadSavesStore preserve slots and allow free overwriting', () => {
  const storage = createMockStorage();
  const session = createSession();

  let store = loadSavesStore(storage);
  const snap1 = createSaveSnapshot(session, 'slot1', '初次记录');
  store.slots.slot1 = snap1;
  writeSavesStore(store, storage);

  // 读取验证
  let reloaded = loadSavesStore(storage);
  assert.equal(reloaded.slots.slot1?.note, '初次记录');
  assert.equal(reloaded.slots.slot2, null);

  // 自由覆盖：将 slot1 覆盖为新进度，同时保存 auto
  session.ai.library.chapter = 2;
  const snap1Overwritten = createSaveSnapshot(session, 'slot1', '覆盖记录');
  const autoSnap = createSaveSnapshot(session, 'auto', '自动保存记录');

  reloaded.slots.slot1 = snap1Overwritten;
  reloaded.slots.auto = autoSnap;
  writeSavesStore(reloaded, storage);

  const finalCheck = loadSavesStore(storage);
  assert.equal(finalCheck.slots.slot1?.note, '覆盖记录');
  assert.equal(finalCheck.slots.slot1?.summary.chapter, 2);
  assert.equal(finalCheck.slots.auto?.note, '自动保存记录');
});

test('slot19 persists and slot20 / unknown keys are rejected or dropped', () => {
  const storage = createMockStorage();
  const session = createSession();
  const store = loadSavesStore(storage);
  store.slots.slot19 = createSaveSnapshot(session, 'slot19', '第十九槽');
  writeSavesStore(store, storage);

  const reloaded = loadSavesStore(storage);
  assert.equal(reloaded.slots.slot19?.note, '第十九槽');
  assert.equal(reloaded.slots.slot20, undefined);
  assert.equal(Object.keys(reloaded.slots).length, 20);

  // 未知键在读取时被丢弃
  const raw = JSON.parse(storage.getItem(SAVES_STORAGE_KEY));
  raw.slots.slot20 = createSaveSnapshot(session, 'slot20', '越界');
  raw.slots.bogus = createSaveSnapshot(session, 'bogus', '未知');
  storage.setItem(SAVES_STORAGE_KEY, JSON.stringify(raw));
  const sanitized = loadSavesStore(storage);
  assert.equal(sanitized.slots.slot20, undefined);
  assert.equal(sanitized.slots.bogus, undefined);
  assert.equal(Object.keys(sanitized.slots).length, 20);
});

test('manual save reports failed writes without changing the visible slot', async (t) => {
  installDomFixture(t);

  const storage = {
    getItem: () => null,
    setItem() {
      throw new Error('quota exceeded');
    },
  };
  const notices = [];
  const session = createSession(storage);
  const saves = createSaveManager({
    session,
    storage,
    events: { on() {} },
    shell: { toast: (message) => notices.push(message) },
  });

  await saves.saveSlot('slot1', 'test');

  assert.equal(saves.getStore().slots.slot1, null);
  assert(notices.some((message) => message.includes('保存失败')));
  assert.equal(
    notices.some((message) => message.includes('已覆盖保存')),
    false,
  );
  saves.dispose();
});

test('slow import is cancelled when the runtime changes while the file is read', async (t) => {
  installDomFixture(t);

  const storage = createMockStorage();
  const session = createSession(storage);
  const originalLibrary = session.ai.library;
  const payload = JSON.stringify(createSaveSnapshot(createSession(storage), 'auto', 'delayed'));
  let releaseRead;
  const file = {
    text: () =>
      new Promise((resolve) => {
        releaseRead = () => resolve(payload);
      }),
  };
  const saves = createSaveManager({
    session,
    storage,
    events: { on() {} },
    apiClient: { staticMode: false },
    shell: { toast() {} },
  });

  const pending = saves.importFromFile(file);
  await new Promise((resolve) => setImmediate(resolve));
  session.runtime.token += 1;
  releaseRead();

  assert.equal(await pending, false);
  assert.equal(session.ai.library, originalLibrary);
  assert.equal(saves.getStore().slots.auto, null);
  assert.equal(storage.getItem(SAVES_STORAGE_KEY), null);
  saves.dispose();
});

test('applySaveSnapshot restores library, portraits and journey state', () => {
  const session = createSession();
  const context = {
    session,
    journey: {
      returnInn: () => {
        session.runtime.mode = 'inn';
      },
    },
    shell: {
      toast: () => {},
      renderParty: () => {},
    },
  };

  session.ai.library.chapter = 5;
  session.journey.bossChoice = 'bossTide';
  session.journey.regionMap = 'palace';

  const snapshot = createSaveSnapshot(session, 'slot2', '第5章星殿');

  // 修改当前 session 状态模拟不同进度
  session.ai.library.chapter = 1;
  session.journey.bossChoice = 'bossGate';
  session.journey.regionMap = 'ruins';

  // 恢复
  applySaveSnapshot(context, snapshot);

  assert.equal(session.ai.library.chapter, 5);
  assert.equal(session.journey.bossChoice, 'bossTide');
  assert.equal(session.journey.regionMap, 'palace');
  assert.equal(session.runtime.mode, 'inn');
  assert.ok(session.battle.state);
});

test('createNewSave fills 19 manual slots in order and leaves full stores unchanged', async (t) => {
  const { saves, storage, session } = installManagerFixture(t);
  for (let index = 1; index <= 19; index += 1) {
    session.ai.library.chapter = index;
    assert.equal(await saves.createNewSave(), true);
    assert.equal(saves.getStore().slots[`slot${index}`].summary.chapter, index);
  }
  const before = structuredClone(saves.getStore());
  await saves.createNewSave();
  assert.deepEqual(saves.getStore(), before);
  assert.deepEqual(loadSavesStore(storage), before);
  assert.equal(saves.getStore().slots.auto, null);
  assert.equal(Object.values(saves.getStore().slots).filter(Boolean).length, 19);
});

test('setPage and getPage keep navigation within the 0..4 page range', (t) => {
  const { saves } = installManagerFixture(t);

  assert.equal(saves.getPage(), 0);
  saves.setPage(4);
  assert.equal(saves.getPage(), 4);
  saves.setPage(0);
  assert.equal(saves.getPage(), 0);
  assert.equal(saves.setPage(-1), false);
  assert.equal(saves.getPage(), 0);
  assert.equal(saves.setPage(99), false);
  assert.equal(saves.getPage(), 0);
});

test('renameSlot trims names, rejects empty names and keeps timestamp/dateString/data', async (t) => {
  const { saves } = installManagerFixture(t);

  assert.equal(await saves.saveSlot('slot1', '原始'), true);
  const before = saves.getStore().slots.slot1;
  assert.ok(before);

  assert.equal(await saves.renameSlot('slot1', '  新名字  '), true);
  const renamed = saves.getStore().slots.slot1;
  assert.equal(renamed.name, '新名字');
  assert.equal(renamed.timestamp, before.timestamp);
  assert.equal(renamed.dateString, before.dateString);
  assert.deepEqual(renamed.data, before.data);

  assert.equal(await saves.renameSlot('slot1', '   '), false);
  assert.equal(saves.getStore().slots.slot1.name, '新名字');

  assert.equal(await saves.renameSlot('slot1', 'x'.repeat(24)), true);
  assert.equal(await saves.renameSlot('slot1', 'x'.repeat(25)), false);
  assert.equal(saves.getStore().slots.slot1.name, 'x'.repeat(24));

  assert.equal(await saves.renameSlot('slot99', '无效'), false);
  assert.equal(saves.getStore().slots.slot99, undefined);
});

test('queued autosave preserves a rename while its storage flush is pending', async (t) => {
  const { session, storage, saves } = installManagerFixture(t);
  await saves.saveSlot('slot1', 'original');
  let releaseFlush;
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  storage.flush = () => {
    if (releaseFlush) return Promise.resolve();
    return new Promise((resolve) => {
      releaseFlush = resolve;
      markStarted();
    });
  };

  const rename = saves.renameSlot('slot1', 'kept after autosave');
  await started;
  session.ai.library.chapter = 4;
  const autosave = saves.autoSave('queued autosave');
  releaseFlush();

  assert.deepEqual(await Promise.all([rename, autosave]), [true, true]);
  const reloaded = loadSavesStore(storage);
  assert.equal(reloaded.slots.slot1.name, 'kept after autosave');
  assert.equal(reloaded.slots.slot1.summary.chapter, 1);
  assert.equal(reloaded.slots.auto.summary.chapter, 4);
});

test('saveSlot overwrite preserves the previously renamed name', async (t) => {
  const { saves } = installManagerFixture(t);

  assert.equal(await saves.saveSlot('slot2', '初次'), true);
  assert.equal(await saves.renameSlot('slot2', '我的存档'), true);
  assert.equal(saves.getStore().slots.slot2.name, '我的存档');

  assert.equal(await saves.saveSlot('slot2', '覆盖'), true);
  assert.equal(saves.getStore().slots.slot2.name, '我的存档');
});

test('importFromFile parses without writing and does not switch session', async (t) => {
  const { session, storage, saves } = installManagerFixture(t);
  const originalLibrary = session.ai.library;
  const originalMode = session.runtime.mode;

  const result = await saves.importFromFile(makeFile(validSnapshotPayload('auto', '待选')));

  assert.equal(result, true);
  const pending = saves.getPendingImport();
  assert.ok(pending);
  assert.equal(pending.note, '待选');
  assert.equal(session.ai.library, originalLibrary);
  assert.equal(session.runtime.mode, originalMode);
  assert.equal(storage.getItem(SAVES_STORAGE_KEY), null);
  assert.equal(saves.getStore().slots.auto, null);
});

test('importToSlot writes only the chosen slot19 and does not apply the snapshot', async (t) => {
  const { session, storage, saves } = installManagerFixture(t);
  const originalLibrary = session.ai.library;
  const originalMode = session.runtime.mode;

  assert.equal(
    await saves.importFromFile(makeFile(validSnapshotPayload('auto', '导入槽19'))),
    true,
  );
  assert.equal(await saves.importToSlot('slot19'), true);

  const store = saves.getStore();
  assert.ok(store.slots.slot19);
  assert.equal(store.slots.slot19.note, '导入槽19');
  assert.equal(store.slots.auto, null);
  assert.equal(saves.getPendingImport(), null);

  // 不 apply：session 状态不变
  assert.equal(session.ai.library, originalLibrary);
  assert.equal(session.runtime.mode, originalMode);

  // 持久化到存储
  const reloaded = loadSavesStore(storage);
  assert.ok(reloaded.slots.slot19);
  assert.equal(reloaded.slots.auto, null);
});

test('importToSlot rejects invalid slots without creating extra keys', async (t) => {
  const { saves } = installManagerFixture(t);

  assert.equal(await saves.importFromFile(makeFile(validSnapshotPayload('auto', '无效槽'))), true);
  assert.equal(await saves.importToSlot('slot20'), false);
  assert.equal(await saves.importToSlot('bogus'), false);

  const store = saves.getStore();
  assert.equal(store.slots.slot20, undefined);
  assert.equal(store.slots.bogus, undefined);
  assert.equal(Object.keys(store.slots).length, 20);
  // 无效槽不消耗 pending
  assert.ok(saves.getPendingImport());
});

test('cancelling overwrite keeps the original slot and pending import intact', async (t) => {
  const { saves } = installManagerFixture(t, { confirm: () => false });

  assert.equal(await saves.saveSlot('slot1', '原档'), true);
  const original = saves.getStore().slots.slot1;
  assert.ok(original);

  assert.equal(await saves.importFromFile(makeFile(validSnapshotPayload('auto', '新档'))), true);
  const pendingBefore = saves.getPendingImport();
  assert.ok(pendingBefore);

  assert.equal(await saves.importToSlot('slot1'), false);
  assert.equal(saves.getStore().slots.slot1.note, original.note);
  assert.equal(saves.getStore().slots.slot1.timestamp, original.timestamp);
  assert.deepEqual(saves.getPendingImport(), pendingBefore);
});

test('confirming overwrite replaces the original slot', async (t) => {
  const { saves } = installManagerFixture(t, { confirm: () => true });

  assert.equal(await saves.saveSlot('slot1', '原档'), true);
  assert.equal(await saves.importFromFile(makeFile(validSnapshotPayload('auto', '新档'))), true);
  assert.equal(await saves.importToSlot('slot1'), true);
  assert.equal(saves.getStore().slots.slot1.note, '新档');
  assert.equal(saves.getPendingImport(), null);
});

test('cancelImport clears pending without writing', async (t) => {
  const { storage, saves } = installManagerFixture(t);

  assert.equal(await saves.importFromFile(makeFile(validSnapshotPayload('auto', '取消'))), true);
  assert.ok(saves.getPendingImport());

  saves.cancelImport();
  assert.equal(saves.getPendingImport(), null);
  assert.equal(storage.getItem(SAVES_STORAGE_KEY), null);
  assert.equal(saves.getStore().slots.auto, null);
});

test('importToSlot keeps the original slot when flush fails', async (t) => {
  const storage = createMockStorage();
  const { saves } = installManagerFixture(t, { storage });

  assert.equal(await saves.saveSlot('slot1', '原档'), true);
  const original = saves.getStore().slots.slot1;
  assert.ok(original);

  assert.equal(await saves.importFromFile(makeFile(validSnapshotPayload('auto', '新档'))), true);

  storage.flush = async () => {
    throw new Error('flush failed');
  };

  assert.equal(await saves.importToSlot('slot1'), false);
  assert.equal(saves.getStore().slots.slot1.note, original.note);
  assert.equal(saves.getStore().slots.slot1.timestamp, original.timestamp);
  assert.ok(saves.getPendingImport());
});
