import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary } from '../src/ai/library.js';
import { officialSummonPool } from '../src/summoning.js';
import {
  changeDeveloperBattle,
  developerEncounter,
  developerMaps,
  sanitizeDeveloperData,
  tuneDeveloperLibrary,
} from '../src/developer-rules.js';
import { newBattle, preview } from '../src/engine.js';

test('developer draw pool includes the three restricted visitors and Pandora, and excludes owned characters', () => {
  const library = newLibrary();
  const storyIds = ['official-libet', 'official-lumi', 'official-yuto-nakashi', 'official-pandora'];
  const lore = Object.fromEntries(
    [...storyIds, 'official-luo-gongxu'].map((id) => [
      id,
      {
        content: '可招募官设测试条目',
        extensions: { wanxiang: { characterId: id } },
      },
    ]),
  );
  assert.deepEqual(
    officialSummonPool(library, { entries: lore }).map(({ id }) => id),
    ['official-luo-gongxu'],
  );
  const pool = officialSummonPool(library, {}, { developerMode: true });
  for (const id of storyIds) assert(pool.some((entry) => entry.id === id));
  library.characters.push(pool.find((entry) => entry.id === storyIds[0]));
  assert(
    !officialSummonPool(library, {}, { developerMode: true }).some(({ id }) => id === storyIds[0]),
  );
});

test('sandbox stage threshold produces a real bossPhase event without changing the original state', () => {
  const state = newBattle(['alchemicalPuppet']);
  state.phase = 'plan';
  state.round = 2;
  const next = changeDeveloperBattle(state, 'phase', 'alchemicalPuppet');
  assert(next.units.alchemicalPuppet.hp < state.units.alchemicalPuppet.hp);
  assert(
    preview(next, []).events.some((event) => event.type === 'bossPhase' && event.phaseStage === 2),
  );
  assert.equal(
    changeDeveloperBattle(next, 'one-hp', 'alchemicalPuppet').units.alchemicalPuppet.hp,
    1,
  );
});

test('sandbox roster and encounter changes preserve source data and sanitize exports', () => {
  const library = newLibrary();
  const tuned = tuneDeveloperLibrary(library, 'level', { level: 15 });
  assert(tuned.characters.every((entry) => entry.growth.level === 15));
  assert(library.characters.every((entry) => entry.growth.level === 1));
  const map = developerMaps(library).find(({ id }) => id === 'mill');
  assert(
    developerEncounter(library, { map: 'mill', node: map.nodes[0].id, encounter: 0 }).enemyIds
      .length,
  );
  assert.deepEqual(developerEncounter(library, { map: 'ruins', enemies: ['apepLamb'] }).enemyIds, [
    'apepLamb',
  ]);
  assert.throws(() =>
    developerEncounter(library, { map: 'ruins', enemies: ['apepLamb', 'apepLamb'] }),
  );
  assert.deepEqual(
    sanitizeDeveloperData({ inner: { apiKey: 'secret' }, stack: 'Bearer secret-token' }),
    { inner: {}, stack: '[已隐藏]' },
  );
});
