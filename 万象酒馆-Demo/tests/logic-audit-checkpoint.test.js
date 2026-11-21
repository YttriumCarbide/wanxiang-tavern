import assert from 'node:assert/strict';
import test from 'node:test';
import { createAdventureState } from '../src/adventure/state.js';
import { normalizeScript } from '../src/ai/contracts.js';
import { newLibrary } from '../src/ai/library.js';
import { adventureTestScript } from '../src/content/generation-mode.js';
import { beginEncounter, newExpedition } from '../src/expedition.js';
import { createCheckpoint, GAME_LIBRARY_KEY } from '../src/storage/checkpoint.js';

const checkpointKey = 'wanxiang.battle-checkpoint.v1';

function fixture(map = 'ruins') {
  const expedition = newExpedition();
  // Simulate the stored routing metadata without coupling the roster to world generation.
  const state = beginEncounter(expedition);
  expedition.exploration = { map };
  const book = normalizeScript(adventureTestScript(), 'audit-checkpoint');
  expedition.adventure = createAdventureState(book, expedition.id);
  const library = newLibrary();
  const session = {
    runtime: { mode: 'battle' },
    journey: { expedition },
    ai: { activeScript: book, library, chat: { quick: [] } },
    battle: { state, plan: [], history: [] },
  };
  const records = new Map();
  const batches = [];
  const storage = {
    getItem: (key) => records.get(key) ?? null,
    removeItem: (key) => records.delete(key),
    setItems(entries, deleted) {
      batches.push({ entries, deleted });
      for (const [key, text] of entries) records.set(key, text);
      for (const key of deleted) records.delete(key);
    },
  };
  const checkpoint = createCheckpoint({ session, storage, apiClient: { staticMode: true } });
  return { checkpoint, records, batches, session };
}

test('a migrated main library drops a legacy Ruins checkpoint but still resumes another map', () => {
  for (const map of ['ruins', 'forest']) {
    const { checkpoint, records, session } = fixture(map);
    const legacy = checkpoint.snapshot();
    delete legacy.library.migrations.ruinsResetV2;
    records.set(checkpointKey, JSON.stringify(legacy));
    session.ai.library.migrations.ruinsResetV2 = true;
    const restored = checkpoint.pending();
    if (map === 'ruins') {
      assert.equal(restored, null);
      assert.equal(records.has(checkpointKey), false);
    } else {
      assert.equal(restored?.journey.expedition.exploration.map, 'forest');
      assert.equal(restored?.library.migrations.ruinsResetV2, true);
    }
  }
});

test('progress and the matching checkpoint share a transaction, including the return to the hall', () => {
  const { checkpoint, records, batches, session } = fixture();
  session.ai.library.inventory.gold = 620;
  checkpoint.saveLibrary();
  assert.equal(batches.length, 1);
  assert.deepEqual(
    batches[0].entries.map(([key]) => key),
    [GAME_LIBRARY_KEY, checkpointKey],
  );
  assert.equal(checkpoint.pending()?.library.inventory.gold, 620);

  session.ai.library.inventory.gold = 625;
  session.runtime.mode = 'inn';
  checkpoint.saveLibrary();
  assert.equal(batches.length, 2);
  assert.deepEqual(batches[1].deleted, [checkpointKey]);
  assert.equal(JSON.parse(records.get(GAME_LIBRARY_KEY)).inventory.gold, 625);
  assert.equal(records.has(checkpointKey), false);
});

test('an older paired checkpoint cannot roll back a newer main library', () => {
  const { checkpoint, records, session } = fixture();
  session.ai.library.inventory.gold = 5;
  checkpoint.saveLibrary();
  session.ai.library.inventory.gold = 50;
  records.set(GAME_LIBRARY_KEY, JSON.stringify(session.ai.library));
  assert.equal(checkpoint.pending(), null);
  assert.equal(session.ai.library.inventory.gold, 50);
  assert.equal(records.has(checkpointKey), false);
});
