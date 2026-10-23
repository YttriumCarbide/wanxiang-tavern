import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWorld } from '../src/worlds.js';
import { worldFixture } from './fixtures/multiverse.js';
import { DEFINITIONS } from '../src/data.js';
import { newBattle, preview, advance, intent, makeReposition } from '../src/engine.js';
import { discardUnfinishedTrip } from '../src/abandoned-trip.js';
import { createCheckpoint } from '../src/storage/checkpoint.js';
import { requireNpcInteraction } from '../src/npc-interaction.js';
import { generationInput } from '../src/ai/pipeline/prompts.js';
import { newLibrary } from '../src/ai/library.js';
import { settingOnly } from '../src/ai/contracts.js';

test('duplicate generated enemy IDs discard replacements and reuse official, known and first definitions', () => {
  const raw = worldFixture();
  const original = normalizeWorld(raw);
  const expansion = {
    ...worldFixture(),
    enemies: [{ id: raw.enemies[0].id, hp: 'invalid replacement' }],
  };
  const expanded = normalizeWorld(expansion, original);
  assert.deepEqual(expanded.enemyDefinitions, original.enemyDefinitions);
  const known = normalizeWorld(
    { ...raw, enemies: [{ id: raw.enemies[2].id, hp: 'discard' }] },
    null,
    { knownEnemies: original.enemyDefinitions },
  );
  assert.deepEqual(
    known.enemyDefinitions[raw.enemies[2].id],
    original.enemyDefinitions[raw.enemies[2].id],
  );
  const duplicate = worldFixture();
  duplicate.enemies.push(
    { id: duplicate.enemies[0].id, hp: 'discard' },
    { id: 'bossGate', hp: 'discard official collision' },
  );
  const built = normalizeWorld(duplicate);
  assert.equal(built.enemyDefinitions[duplicate.enemies[0].id].hp, raw.enemies[0].hp);
  assert.equal(built.enemyIds.filter((id) => id === duplicate.enemies[0].id).length, 1);
  assert(built.enemyIds.includes('bossGate'));
  assert.equal(built.enemyDefinitions.bossGate, undefined);
  assert.equal(DEFINITIONS.bossGate.hp > 0, true);
});

test('gate first normal round locks the lowest-hp occupied position for 24 damage and weak once', () => {
  const initial = newBattle(['ruinsGate']);
  initial.units.aegis.hp = 32;
  initial.units.lyria.hp = 25;
  initial.units.morrow.hp = 28;
  const state = advance(preview(initial, []));
  assert.equal(intent(state, 'ruinsGate').slot, 1);
  assert.deepEqual(intent(state, 'ruinsGate').effects, [
    { type: 'damage', value: 24 },
    { type: 'buff', buff: 'weak', value: 1 },
  ]);
  const hit = preview(state, []);
  const strike = hit.events.find((event) => event.type === 'enemy' && event.actor === 'ruinsGate');
  assert.deepEqual(strike.targets, ['lyria']);
  assert.equal(strike.after.units.lyria.hp, 1);
  assert.equal(strike.after.units.lyria.buffs.weak, 1);
  assert.equal(intent(advance(hit), 'ruinsGate').lowestHpPosition, undefined);
  const dodge = structuredClone(state);
  dodge.formation[3] = null;
  const result = preview(dodge, [makeReposition(1, 3, 0)]);
  assert(result.valid);
  assert.equal(
    result.events.find((event) => event.type === 'enemy' && event.actor === 'ruinsGate').targets
      .length,
    0,
  );
});

test('NPC request decision is stable with approximately twenty percent of independent script seeds', () => {
  let required = 0;
  for (let i = 0; i < 10000; i++) if (requireNpcInteraction({ visitId: 'script-' + i })) required++;
  assert(required > 1800 && required < 2200);
  const party = newLibrary().characters.map(settingOnly);
  for (const expected of [false, true]) {
    let i = 0;
    while (requireNpcInteraction({ visitId: 'test-' + i }) !== expected) i++;
    const input = { visitId: 'test-' + i, brief: '探索遗迹', party, boss: 'bossGate' };
    const a = generationInput('script', input);
    assert.deepEqual(generationInput('script', input), a);
    assert.equal(a.request.npcInteraction?.required === true, expected);
    if (expected) assert.match(a.request.npcInteraction.instruction, /正文实际描写|正文安排/);
  }
});

test('loading discards only unfinished script records and associated archive sources, retaining earned data', () => {
  const library = {
    scripts: [{ id: 'done' }, { id: 'active' }],
    prepared: null,
    history: [
      { scriptId: 'done', runId: 'done-run', complete: true },
      { scriptId: 'active', runId: 'active-run', complete: false },
    ],
    characters: [{ id: 'hero' }],
    inventory: { gold: 50 },
    tavernChat: [{ content: '聊天仍在' }],
    archives: {
      items: [{ source: { runId: 'active-run' } }, { source: { runId: 'done-run' } }],
      npcs: [
        { name: 'shared', sources: [{ runId: 'active-run' }, { runId: 'done-run' }] },
        { name: 'temporary', sources: [{ runId: 'active-run' }] },
      ],
    },
  };
  const storage = new Map([
    [
      'wanxiang.battle-checkpoint.v1',
      JSON.stringify({ activeScript: { id: 'active', runId: 'active-run' } }),
    ],
  ]);
  const checkpoint = createCheckpoint({
    session: { ai: { library } },
    apiClient: { staticMode: true },
    storage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  });
  assert.equal(checkpoint.pending(), null);
  assert.equal(storage.has('wanxiang.battle-checkpoint.v1'), false);
  assert.deepEqual(library.scripts, [{ id: 'done' }]);
  assert.equal(library.history.length, 1);
  assert.equal(library.archives.items.length, 1);
  assert.deepEqual(library.archives.npcs, [{ name: 'shared', sources: [{ runId: 'done-run' }] }]);
  assert.equal(library.inventory.gold, 50);
  assert.equal(library.characters.length, 1);
  assert.equal(library.tavernChat[0].content, '聊天仍在');
  assert.equal(discardUnfinishedTrip(library), false);
  library.scripts.push({ id: 'legacy-active' });
  library.history.push(
    { scriptId: 'legacy-active', complete: false },
    { scriptId: 'legacy-done', complete: true },
  );
  library.archives.items.push({ source: { scriptId: 'legacy-done' } });
  assert.equal(discardUnfinishedTrip(library), true);
  assert(library.history.some((entry) => entry.scriptId === 'legacy-done'));
  assert(library.archives.items.some((entry) => entry.source.scriptId === 'legacy-done'));
});
