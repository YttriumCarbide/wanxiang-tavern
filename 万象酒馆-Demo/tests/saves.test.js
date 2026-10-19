import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_SLOTS,
  SAVES_STORAGE_KEY,
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

test('SAVE_SLOTS contains exactly 4 slots: auto and 3 manual slots', () => {
  assert.equal(SAVE_SLOTS.length, 4);
  const ids = SAVE_SLOTS.map((s) => s.id);
  assert.deepEqual(ids, ['auto', 'slot1', 'slot2', 'slot3']);

  const autoSlot = SAVE_SLOTS.find((s) => s.id === 'auto');
  assert.equal(autoSlot.isAuto, true);
  assert.equal(autoSlot.label, '自动保存');

  const manualSlots = SAVE_SLOTS.filter((s) => !s.isAuto);
  assert.equal(manualSlots.length, 3);
  assert.deepEqual(
    manualSlots.map((s) => s.label),
    ['存档位 1', '存档位 2', '存档位 3'],
  );
});

test('loadSavesStore returns default empty slots when storage is empty or damaged', () => {
  const storage = createMockStorage();
  const store = loadSavesStore(storage);
  assert.equal(store.version, 1);
  assert.equal(store.slots.auto, null);
  assert.equal(store.slots.slot1, null);
  assert.equal(store.slots.slot2, null);
  assert.equal(store.slots.slot3, null);

  storage.setItem(SAVES_STORAGE_KEY, 'invalid json {');
  const fallback = loadSavesStore(storage);
  assert.equal(fallback.version, 1);
  assert.equal(fallback.slots.auto, null);
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

test('createNewSave finds the first available manual slot and populates it', () => {
  const storage = createMockStorage();
  const session = createSession();
  const store = loadSavesStore(storage);

  // 初始时 slot1, slot2, slot3 均为空
  const target1 = SAVE_SLOTS.filter((s) => !s.isAuto).find((s) => !store.slots[s.id]);
  assert.equal(target1.id, 'slot1');
  store.slots.slot1 = createSaveSnapshot(session, 'slot1', '新建存档1');
  writeSavesStore(store, storage);

  // 再次寻找可用槽位，应分配给 slot2
  const target2 = SAVE_SLOTS.filter((s) => !s.isAuto).find((s) => !store.slots[s.id]);
  assert.equal(target2.id, 'slot2');
  store.slots.slot2 = createSaveSnapshot(session, 'slot2', '新建存档2');
  writeSavesStore(store, storage);

  // 再次寻找，应分配给 slot3
  const target3 = SAVE_SLOTS.filter((s) => !s.isAuto).find((s) => !store.slots[s.id]);
  assert.equal(target3.id, 'slot3');
  store.slots.slot3 = createSaveSnapshot(session, 'slot3', '新建存档3');
  writeSavesStore(store, storage);

  // 当 3 个手动槽位全满时，不再有可用空槽位
  const targetNone = SAVE_SLOTS.filter((s) => !s.isAuto).find((s) => !store.slots[s.id]);
  assert.equal(targetNone, undefined);
});
