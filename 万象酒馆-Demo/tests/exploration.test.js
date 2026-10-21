import { BASE_WORLDS } from '../src/worlds.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newExploration,
  restoreExploration,
  explorationSpec,
  completeExploration,
  explorationPreview,
} from '../src/exploration.js';
import { REGIONS } from '../src/content/regions.js';
import { DEFINITIONS } from '../src/data.js';
import { newExpedition, beginEncounter, completeEncounter, chooseRest } from '../src/expedition.js';
import { generationInput, generationRequest } from '../server/prompts.mjs';
import { scriptOutputSchema } from '../src/ai/script-schema.js';
import { readGenerationResult } from '../server/generation-result.mjs';
import { newLibrary } from '../src/ai/library.js';

test('regions preserve independent progress and base worlds continue after six sites', () => {
  const routes = newExploration(817);
  assert.equal(Object.keys(routes).length, Object.keys(REGIONS).length);
  assert.equal(Object.keys(routes).length, 13);
  const untouched = JSON.stringify(routes.frost);
  const combinations = new Set();
  for (let i = 0; i < 6; i++) {
    const selected = routes.forest.frontier[0];
    const spec = explorationSpec(selected);
    combinations.add(spec.enemyIds.join(','));
    assert.equal(spec.map, 'forest');
    assert.equal(spec.hpScale, 1);
    assert(spec.enemyIds.length >= 1 && spec.enemyIds.length <= 3);
    const trip = newExpedition('bossGate', {}, selected);
    for (let room = 0; room < 5; room++) {
      const state = beginEncounter(trip);
      const expected = explorationSpec(selected, room);
      for (const id of expected.enemyIds) assert.equal(state.units[id].maxHp, DEFINITIONS[id].hp);
      assert.throws(() => completeEncounter(trip, state));
      state.phase = 'victory';
      assert.equal(completeEncounter(trip, state).complete, room === 4);
      if (trip.restPending) chooseRest(trip, 'sleep');
    }
    assert.equal(trip.records.length, 5);
    const next = completeExploration(routes, selected, {
      title: '林中往事',
      nextHook: { setting: '在古堡门口发现了新路。', map: 'ruins', artNodes: [] },
      lines: [{ text: '已经抵达古堡门口。' }],
    });
    if (i < 5) {
      assert.equal(next.map, 'forest');
      assert(next.continuation.includes('古堡'));
      assert.equal(next.parentId, selected.id);
    } else assert.equal(next.sequence, 6);
    assert.equal(completeExploration(routes, selected), null);
    assert.equal(routes.forest.frontier.length, 1);
    assert.equal(routes.forest.cleared.length, i + 1);
  }
  for (let seed = 0; seed < 120; seed++)
    combinations.add(explorationSpec(newExploration(seed).forest.frontier[0]).enemyIds.join(','));
  assert(combinations.size > 5);
  assert.equal(routes.forest.completed, 6);
  assert.equal(JSON.stringify(routes.frost), untouched);
  assert.deepEqual(restoreExploration(routes), routes);
});

test('all generated non-tutorial ordinary fights after the entrance contain at least two monsters', () => {
  for (const seed of [1, 72, 817, 17371]) {
    const routes = newExploration(seed);
    for (const route of Object.values(routes)) {
      for (const node of route.frontier) {
        for (let room = 1; room < 4; room++) {
          const spec = explorationSpec(node, room);
          // The authored introductory chapter keeps one stone guard for the slow lesson.
          if (node.map === 'ruins' && node.sequence === 0 && room === 2) {
            assert.deepEqual(spec.enemyIds, ['warden']);
            continue;
          }
          assert(spec.enemyIds.length >= 2 && spec.enemyIds.length <= 3);
          assert.equal(new Set(spec.enemyIds).size, spec.enemyIds.length);
          assert(spec.enemyIds.every((id) => !DEFINITIONS[id].boss));
        }
        assert(explorationSpec(node, 4).boss);
      }
    }
  }
});

test('all maps remove environmental bonuses and prompts agree with combat', async () => {
  const routes = newExploration(72),
    lib = newLibrary();
  for (const [map, region] of Object.entries(REGIONS)) {
    const node = routes[map].frontier[0];
    const spec = explorationSpec(node);
    const state = beginEncounter(newExpedition('bossGate', {}, node));
    const hero = state.units.aegis;
    assert.equal(hero.block, 0);
    assert.deepEqual(hero.buffs, {});
    assert.equal(region.rules, undefined);
    const input = {
      brief: '延续旅程',
      boss: 'bossGate',
      party: lib.characters.map((entry) => ({
        id: entry.id,
        name: entry.setting.name,
        worldbook: entry.setting.worldbook,
      })),
      chapter: 1,
      exploration: { ...node, continuation: '从古堡门口进入内部。' },
      history: [],
    };
    const context = generationInput('script', input);
    assert.equal(context.encounters.length, 5);
    assert.deepEqual(
      context.encounters[0].enemies.map((entry) => entry.id),
      spec.enemyIds,
    );
    assert.equal(context.request.region.environmentRules, undefined);
    assert.deepEqual(spec.environment, {});
    assert.equal(context.request.narrativeParts.length, 5);
    assert(context.request.continuation.includes('古堡'));
    const request = await generationRequest('script', input);
    assert(request.messages.some((message) => message.content.includes('古堡')));
  }
  const raw = {
    schemaVersion: 3,
    story: [
      '抵达古堡门前。',
      '穿过庭院。',
      '走入门厅。',
      '查看走廊。',
      '进入古堡内部的路已经打开。',
    ],
    data: {
      title: '古堡',
      synopsis: '从森林延伸到古堡。',
      setting: '林中城堡',
      tags: [],
      npcs: [],
      nextHook: { setting: '探索古堡内部。', map: 'forest', artNodes: [] },
    },
  };
  assert.equal(scriptOutputSchema().properties.story.minItems, 5);
  const accepted = readGenerationResult('script', JSON.stringify(raw), {
    party: lib.party.map((id) => ({ id })),
    exploration: routes.forest.frontier[0],
  });
  assert.equal(accepted.entry.story.length, 5);
  const short = { ...raw, story: raw.story.slice(0, 2) };
  assert.throws(() =>
    readGenerationResult('script', JSON.stringify(short), {
      party: lib.party.map((id) => ({ id })),
      exploration: routes.forest.frontier[0],
    }),
  );
});

test('routes unlock sequentially and legacy branches survive reload', () => {
  const routes = newExploration(42);
  const route = routes.ruins;
  const entrance = route.frontier[0];
  assert.equal(route.frontier.length, 1);
  const second = completeExploration(routes, entrance);
  assert.equal(route.frontier.length, 1);
  completeExploration(routes, second);
  assert.equal(route.frontier.length, 1);
  const left = route.frontier[0];
  completeExploration(routes, left);
  assert.equal(route.frontier.length, 1);
  completeExploration(routes, route.frontier[0]);
  assert.equal(route.frontier.length, 1);
  assert.equal(route.cleared.length, 4);
  assert.deepEqual(restoreExploration(JSON.parse(JSON.stringify(routes))), routes);
  const legacy = newExploration(42);
  legacy.ruins.frontier = Array.from({ length: 6 }, (_, index) => ({
    ...entrance,
    sequence: index,
    seed: index + 2,
    id: 'legacy',
  }));
  delete legacy.ruins.cleared;
  const restored = restoreExploration(legacy);
  assert.equal(restored.ruins.frontier.length, 6);
  assert.equal(restored.ruins.cleared.length, 0);
});

test('base worlds retain seventh routes and hidden art routes retain history', () => {
  const routes = newExploration(42);
  for (const [map, route] of Object.entries(routes)) {
    const preview = explorationPreview(route, map);
    assert.deepEqual(
      preview.map((entry) => entry.sequence),
      [0, 1, 2, 3, 4, 5],
    );
    assert.equal(new Set(preview.map((entry) => explorationSpec(entry).name)).size, 6);
    for (let i = 0; i < 6; i++)
      completeExploration(routes, route.frontier[0], {
        title: '已完成的旅途',
        runId: map + '-' + i,
        lines: [{ text: '实际发生的故事保留。' }],
      });
    assert.equal(route.frontier.length, BASE_WORLDS.includes(map) ? 1 : 0);
    const seventh = {
      ...route.cleared[0],
      sequence: 6,
      seed: 999,
      id: map + '-6-999',
      parentId: route.cleared[5].id,
      depth: 6,
    };
    route.cleared.push(seventh);
    route.frontier = [
      { ...seventh, sequence: 7, seed: 1000, id: map + '-7-1000', parentId: seventh.id },
    ];
    route.completed = 7;
    assert.equal(
      explorationSpec(seventh).environment &&
        Object.keys(explorationSpec(seventh).environment).length,
      0,
    );
  }
  const restored = restoreExploration(routes);
  for (const [map, route] of Object.entries(restored)) {
    assert.equal(route.completed, BASE_WORLDS.includes(map) ? 7 : 6);
    assert.equal(route.frontier.length, BASE_WORLDS.includes(map) ? 1 : 0);
    assert.equal(route.cleared.length, BASE_WORLDS.includes(map) ? 7 : 6);
    assert.equal(explorationPreview(route, map).length, BASE_WORLDS.includes(map) ? 8 : 6);
    assert.deepEqual(route.history, routes[map].history);
  }
  assert.deepEqual(restoreExploration(restored), restored);
});
