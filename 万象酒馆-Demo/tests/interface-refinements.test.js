import { DEFINITIONS } from '../src/data.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createConnectionStore } from '../src/ai/connection-store.js';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { upgradeAssetWorldbook } from '../src/ai/asset-worldbook.js';
import { normalizeWorldSettings } from '../src/ai/worldbook.js';
import { normalizeWorld, restoreWorlds } from '../src/worlds.js';
import { worldFixture } from './fixtures/multiverse.js';
import { tavernPresetFixture } from './fixtures/ai.js';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { compileRoster } from '../src/ai/library.js';
import { applyEncounterGrowth, gainExperience, xpToNext } from '../src/growth.js';
import { newExpedition, beginEncounter, completeEncounter } from '../src/expedition.js';
import { preview, makeAction, advance, newBattle } from '../src/engine.js';
import { EMBLEM_ID, canCombine } from '../src/emblems.js';

const readText = (file) => readFile(new URL('../prompts/' + file, import.meta.url), 'utf8');

test('a killing attack fills charge; growth and next encounter retain the equipped emblem and full charge', () => {
  const library = newCampaign(defaultProtagonist());
  library.characters[0].emblemId = EMBLEM_ID;
  const expedition = newExpedition('bossGate', compileRoster(library));
  expedition.partyIds = [...library.party];
  const state = beginEncounter(expedition);
  state.units.aegis.emblemCharge = 5;
  for (const id of state.enemyIds) state.units[id].hp = 0;
  const target = state.enemyIds[0];
  state.units[target].hp = 1;
  const forecast = preview(state, [makeAction(state, 'aegis', 'attack', target, 0)]);
  assert(forecast.valid);
  const won = advance(forecast);
  assert.equal(won.phase, 'victory');
  assert.equal(won.units.aegis.emblemCharge, 6);
  completeEncounter(expedition, won);
  gainExperience(library.characters[0], xpToNext(1));
  applyEncounterGrowth(expedition, library.characters);
  const next = beginEncounter(expedition);
  assert.equal(next.heroDefinitions.aegis.emblemId, EMBLEM_ID);
  assert.equal(next.units.aegis.emblemCharge, 6);
  assert(canCombine(next, 'aegis'));
});

test('generated enemy healing and boons target enemies while damage/debuffs target players; legacy slow is dropped on load', () => {
  const raw = worldFixture();
  const enemy = raw.enemies[0];
  enemy.intents[0].effects = [
    { type: 'damage', value: 4, target: 'opponents' },
    { type: 'heal', value: 8, target: 'lowestAlly' },
    { type: 'buff', buff: 'strength', value: 1, target: 'allAllies' },
  ];
  const world = normalizeWorld(raw);
  const state = newBattle(world.enemyIds, {}, world.enemyDefinitions);
  state.phase = 'plan';
  state.round = 1;
  for (const id of state.formation.filter(Boolean))
    state.heroDefinitions[id] = { ...structuredClone(DEFINITIONS[id]), skills: [] };
  const low = world.enemyIds[1];
  state.units[low].hp = 10;
  for (const id of world.enemyIds.slice(1))
    state.enemyDefinitions[id].intents = [{ name: '等待', slots: [0], effects: [] }];
  const result = preview(state, []);
  assert(result.valid);
  assert.equal(result.final.units[low].hp, 18);
  for (const id of world.enemyIds) assert.equal(result.final.units[id].buffs.strength, 1);
  for (const id of state.formation.filter(Boolean)) assert(!result.final.units[id].buffs.strength);
  assert.equal(state.units[state.formation[0]].hp - result.final.units[state.formation[0]].hp, 4);
  const bad = worldFixture();
  bad.enemies[0].intents[0].effects = [{ type: 'buff', buff: 'slow', value: 1 }];
  assert.throws(() => normalizeWorld(bad), /迟缓/);
  const saved = structuredClone(world);
  saved.enemyDefinitions[enemy.id].intents[0].effects = bad.enemies[0].intents[0].effects;
  const restored = restoreWorlds([saved]);
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0].enemyDefinitions[enemy.id].intents[0].effects, []);
  assert.equal(restoreWorlds(restored).length, 1);
  bad.enemies[0].intents[0].effects = [{ type: 'heal', value: 3, target: 'opponents' }];
  assert.throws(() => normalizeWorld(bad), /治疗/);
  raw.enemies[2].portrait = 'enemy-humanoid-sword-female';
  assert(normalizeWorld(raw).enemyDefinitions[raw.enemies[2].id].boss);
});

test('keys persist by default, explicit opt-out stays ephemeral and public settings redact them', async () => {
  let snapshot;
  const store = createConnectionStore({
    save: async (value) => {
      snapshot = structuredClone(value);
    },
  });
  await store.saveProfile({
    kind: 'chat',
    baseUrl: 'https://example.test/v1',
    model: 'model',
    tokenField: 'max_tokens',
    apiKey: 'fixture-private-key',
  });
  assert.equal(createConnectionStore({ snapshot }).get('chat').apiKey, 'fixture-private-key');
  assert(!JSON.stringify(store.visible()).includes('fixture-private-key'));
  await store.saveProfile({ ...store.get('chat'), kind: 'chat', rememberKey: false });
  assert.equal(store.get('chat').apiKey, 'fixture-private-key');
  assert.equal(createConnectionStore({ snapshot }).get('chat').apiKey, '');
});

test('map and creation use imported preset, editable worldbook format, wrapped responses and raw failure diagnostics', async () => {
  const contents = Object.fromEntries(
    await Promise.all(
      ['map', 'creation'].map(async (kind) => [
        kind,
        await readText('worldbook/' + kind + '-output.md'),
      ]),
    ),
  );
  const book = upgradeAssetWorldbook(
    { id: 'asset-format', name: '资产格式', entries: {} },
    contents,
  );
  const preset = tavernPresetFixture();
  preset.id = 'shared-community';
  preset.temperature = 0.63;
  preset.prompts.find((entry) => entry.identifier === 'main').content = 'IMPORTED_COMMUNITY_PRESET';
  const pipeline = createAiPipeline({
    settings: createConnectionStore(),
    worlds: {
      async resolve() {
        return {
          books: [book],
          settings: normalizeWorldSettings({ globalSelect: [book.id] }),
          state: {},
        };
      },
      async commit() {},
    },
    regexStore: { get: () => [] },
    helperStorage: { get: () => ({}) },
    countTokens: (text) => Math.ceil(text.length / 3),
    readText,
    runRegexTasks: async (_scripts, tasks) =>
      tasks.map((task) => ({ text: task.text, changes: [] })),
  });
  const cases = [
    ['map', { brief: '去潮灯港' }, worldFixture()],
    [
      'creation',
      {
        items: [
          {
            id: 'stone',
            name: '港口石片',
            description: '潮湿石片',
            value: 10,
            map: 'metropolis',
            script: '旅人从港口拾起一块石片。',
          },
        ],
      },
      {
        schemaVersion: 2,
        items: [
          {
            id: 'stone',
            name: '港口石片',
            description: '生命强化',
            design: { statFocus: ['hp'], rules: [] },
          },
        ],
      },
    ],
  ];
  for (const [kind, input, response] of cases) {
    const prepared = await pipeline.buildRequest(kind, input, preset);
    const messages = prepared.messages.map((message) => message.content).join('\n');
    assert(messages.includes('IMPORTED_COMMUNITY_PRESET'));
    assert(messages.includes(contents[kind]));
    assert(!messages.includes(contents[kind === 'map' ? 'creation' : 'map']));
    assert.equal(prepared.sampling.temperature, 0.63);
    const job = { kind, input, source: preset, prepared, requestId: 'asset-test' };
    const result = await pipeline.acceptResult(job, {
      content:
        '<think>ignored</think><wanxiang_json>' + JSON.stringify(response) + '</wanxiang_json>',
    });
    assert(kind === 'map' ? result.world.enemyIds.length > 0 : result.items.length === 1);
    await assert.rejects(
      pipeline.acceptResult(job, { content: 'BROKEN RAW RESPONSE' }),
      (failure) => {
        assert.equal(failure.diagnostic.rawText, 'BROKEN RAW RESPONSE');
        return true;
      },
    );
  }
});
