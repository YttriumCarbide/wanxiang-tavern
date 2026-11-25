import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { RETIRED_OFFICIAL_DRAFT_IDS } from '../src/ai/character-cleanup.js';
import { normalizeCharacter } from '../src/ai/contracts.js';
import { newCampaign } from '../src/campaign.js';
import { HEROES } from '../src/data.js';
import { characterDocument } from './fixtures/ai.js';
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
  for (const retiredId of [
    'official-lyria',
    'official-morrow',
    'official-serin',
    'official-vesper',
    'official-rook',
  ])
    assert(!pool.some((entry) => entry.id === retiredId));
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

test('restoreLibrary purges retired drafts and portraitless loreless characters from existing campaign saves', () => {
  const save = newCampaign(normalizeCharacter(characterDocument(), 'character-protagonist'));
  const template = save.characters.find((entry) => entry.id === 'official-edith');
  const retiredEntries = RETIRED_OFFICIAL_DRAFT_IDS.map((id, index) => ({
    ...structuredClone(template),
    id,
    officialId: id.replace('official-', ''),
    source: 'official',
    portrait: undefined,
    setting: {
      name: `废案${index + 1}`,
      worldbook: '',
    },
  }));
  const blankDraft = {
    ...structuredClone(template),
    id: 'character-draft-nolore',
    source: 'generated',
    portrait: '',
    setting: {
      name: '无立绘无设定角色',
      worldbook: '',
    },
  };
  const aegisHero = HEROES.find((hero) => hero.id === 'aegis');
  const aegis = {
    ...structuredClone(template),
    id: 'official-aegis',
    officialId: 'aegis',
    source: 'official',
    portrait: './assets/portraits/aegis.png',
    setting: { ...template.setting, name: aegisHero.name },
  };
  save.campaign.firstRecruit = true;
  save.characters.push(...retiredEntries, blankDraft, aegis);
  save.party = [
    'character-protagonist',
    'official-edith',
    'official-lyria',
    'official-morrow',
    'character-draft-nolore',
    'official-aegis',
  ];
  save.relationships = {
    'official-edith': { affinity: 12 },
    'official-lyria': { affinity: 30 },
    'official-morrow': { affinity: 18 },
    'official-rook': { affinity: 5 },
    'official-aegis': { affinity: 9 },
  };
  save.daily = {
    active: {
      kind: 'outing',
      direct: true,
      scene: 'street',
      companions: ['official-lyria', 'official-edith', 'official-vesper', 'official-aegis'],
    },
  };
  const restored = restoreLibrary(JSON.parse(JSON.stringify(save)));
  assert.equal(restored.daily.active.scene, 'city-center');
  const restoredIds = new Set(restored.characters.map((entry) => entry.id));
  assert(restoredIds.has('character-protagonist'));
  assert(restoredIds.has('official-edith'));
  assert(restoredIds.has('official-aegis'));
  assert(!restoredIds.has('character-draft-nolore'));
  for (const retiredId of RETIRED_OFFICIAL_DRAFT_IDS) {
    assert(!restoredIds.has(retiredId));
    assert.equal(restored.relationships[retiredId], undefined);
  }
  assert.deepEqual(restored.party, [
    'character-protagonist',
    'official-edith',
    'official-aegis',
    null,
    null,
    null,
  ]);
  assert.deepEqual(restored.daily.active.companions, ['official-edith', 'official-aegis']);
  assert.equal(restored.relationships['official-edith'].affinity, 12);
  assert.equal(restored.relationships['official-aegis'].affinity, 9);
  const pool = officialSummonPool(restored, {}, { developerMode: true });
  for (const retiredId of RETIRED_OFFICIAL_DRAFT_IDS) {
    assert(!pool.some((entry) => entry.id === retiredId));
  }
});
