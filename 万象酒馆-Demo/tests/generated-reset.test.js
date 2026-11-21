import test from 'node:test';
import assert from 'node:assert/strict';
import { officialCharacter } from '../src/ai/library-roster.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import {
  applyGeneratedReset,
  applyGeneratedDatabaseReset,
  GENERATED_RESET_REVISION,
} from '../src/app/generated-reset.js';

const LIBRARY_KEY = 'game.wanxiang.worldbooks.v1';
const SAVES_KEY = 'game.wanxiang.saves.v1';
const WORLD_KEY = 'world.book.tavern-world';
const API_KEY = 'api.config';
const MARKER_KEY = 'game.wanxiang.generated-reset.v1';

const edith = officialCharacter('edith');
const qingyuan = defaultProtagonist();
const copy = {
  ...edith,
  id: 'character-fixture-copy',
  source: 'generated',
  combat: { ...(edith.combat || {}), customPortrait: './__portraits/private.png' },
};

function makeLibrary() {
  return {
    version: 1,
    characters: [edith, copy],
    party: [copy.id, edith.id, null, null, null, null],
    campaign: { protagonistId: copy.id, tasks: { accepted: true } },
    inventory: { gold: 326 },
    history: [{ characterId: edith.id }, { characterId: copy.id }],
  };
}

function makeStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

test('local empty store writes only the marker and no library', () => {
  const storage = makeStorage();
  applyGeneratedReset(storage);
  assert.equal(storage.getItem(MARKER_KEY.slice(5)), GENERATED_RESET_REVISION);
  assert.equal(storage.getItem(LIBRARY_KEY.slice(5)), null);
});

test('local migration removes generated copy and restores default protagonist', () => {
  const localLibraryKey = LIBRARY_KEY.slice(5);
  const storage = makeStorage({ [localLibraryKey]: JSON.stringify(makeLibrary()) });
  applyGeneratedReset(storage);

  const library = JSON.parse(storage.getItem(localLibraryKey));
  assert.equal(library.characters.length, 2);
  const ids = library.characters.map((c) => c.id);
  assert.ok(ids.includes(edith.id));
  assert.ok(ids.includes(qingyuan.id));
  assert.ok(!ids.includes(copy.id));

  assert.equal(library.party[0], qingyuan.id);
  assert.equal(library.party[1], edith.id);
  assert.deepEqual(library.party.slice(2), [null, null, null, null]);

  assert.equal(library.campaign.protagonistId, qingyuan.id);
  assert.equal(library.campaign.tasks.accepted, true);
  assert.equal(library.inventory.gold, 326);

  assert.deepEqual(library.history, [{ characterId: edith.id }]);
  assert.equal(storage.getItem(MARKER_KEY.slice(5)), GENERATED_RESET_REVISION);
});

test('database restore corrects library, saves, world and writes a single batch', async () => {
  const library = makeLibrary();
  const saves = {
    version: 1,
    slots: {
      slot1: {
        timestamp: 123,
        note: '保留备注',
        summary: {},
        data: {
          library,
          customPortraits: { [copy.id]: './__portraits/private.png' },
        },
      },
    },
  };
  const world = {
    entries: {
      0: { extensions: { wanxiang: { characterId: edith.id } } },
      1: { extensions: { wanxiang: { characterId: copy.id } } },
    },
  };
  const apiConfig = { endpoint: 'https://example.test', token: 'secret' };

  const initial = {
    [LIBRARY_KEY]: JSON.stringify(library),
    [SAVES_KEY]: JSON.stringify(saves),
    [WORLD_KEY]: world,
    [API_KEY]: apiConfig,
    'portrait.official.png': new Blob(['official']),
    'portrait.private.png': new Blob(['personal-copy']),
  };

  let captured = null;
  const db = {
    entries() {
      return Object.entries(initial);
    },
    async write(writes, deleted) {
      assert.equal(captured, null);
      captured = { writes, deleted };
    },
  };

  await applyGeneratedDatabaseReset(db);

  const writeMap = new Map(captured.writes);
  assert.deepEqual(
    new Set(writeMap.keys()),
    new Set([LIBRARY_KEY, SAVES_KEY, WORLD_KEY, MARKER_KEY]),
  );
  assert.deepEqual(captured.deleted, ['portrait.private.png']);

  const restoredLibrary = JSON.parse(writeMap.get(LIBRARY_KEY));
  assert.equal(restoredLibrary.inventory.gold, 326);
  assert.equal(restoredLibrary.characters.length, 2);
  assert.equal(restoredLibrary.party[0], qingyuan.id);
  assert.equal(restoredLibrary.party[1], edith.id);

  const restoredSaves = JSON.parse(writeMap.get(SAVES_KEY));
  const slot = restoredSaves.slots.slot1;
  assert.equal(slot.timestamp, 123);
  assert.equal(slot.note, '保留备注');
  assert.equal(slot.data.library.inventory.gold, 326);
  assert.equal(slot.data.library.party[0], qingyuan.id);
  assert.ok(!slot.data.customPortraits || !slot.data.customPortraits[copy.id]);
  assert.deepEqual(slot.summary.partyNames, [qingyuan.setting.name, edith.setting.name]);

  assert.deepEqual(writeMap.get(WORLD_KEY).entries, { 0: world.entries[0] });
  assert.equal(writeMap.get(MARKER_KEY), GENERATED_RESET_REVISION);
});

test('existing marker skips database migration and preserves future personal copy', async () => {
  const futureCopy = {
    ...edith,
    id: 'character-future-personal',
    source: 'generated',
    combat: { ...(edith.combat || {}), customPortrait: './__portraits/future.png' },
  };
  const library = {
    ...makeLibrary(),
    characters: [edith, futureCopy],
    party: [futureCopy.id, edith.id, null, null, null, null],
    campaign: { protagonistId: futureCopy.id, tasks: { accepted: true } },
  };
  const initial = {
    [MARKER_KEY]: String(GENERATED_RESET_REVISION),
    [LIBRARY_KEY]: JSON.stringify(library),
  };

  let writeCalled = false;
  const db = {
    entries() {
      return Object.entries(initial);
    },
    async write() {
      writeCalled = true;
    },
  };

  await applyGeneratedDatabaseReset(db);
  assert.equal(writeCalled, false);
});
