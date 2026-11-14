import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOverlandItems,
  normalizeOverlandStory,
  overlandOrigin,
  overlandPlan,
  overlandRunPlan,
  restoreOverlandRun,
} from '../src/overland-travel.js';
import {
  overlandItemsResponse,
  overlandRequest,
  overlandResponse,
  rollOverlandLootStages,
} from '../src/ai/pipeline/overland-request.js';
import { combatRank, combatScale, scaleMoveEffects } from '../src/combat-scale.js';
import { grownCombat, restoreGrowth } from '../src/growth.js';
import { EDITH } from '../src/content/edith.js';
import { enemyGrowth } from '../src/enemy-growth.js';
import { SILVER_CROWN_PLACES } from '../src/content/silver-crown-scenes.js';
import { explorationScene } from '../src/exploration/scenes.js';
import { chooseDiscoveryPoint, placeDiscovery, routePoints } from '../src/atlas-discoveries.js';
import {
  normalizeQuestCharacter,
  normalizeSocialQuest,
  questRecruitmentReady,
} from '../src/tavern-quests.js';
import { chatResponse } from '../src/ai/pipeline/chat-response.js';
import { createMapExpansion } from '../src/app/map-expansion.js';

test('at the second cleared area, map expansion finishes before summary and applies only once', async () => {
  const world = { id: 'world-example', name: '地点', map: 'ruins', enemyDefinitions: {} };
  const node = { id: 'cleared', map: 'ruins', world };
  const library = {
    worlds: [world],
    exploration: { [world.id]: { cleared: [node], frontier: [{ world }], completed: 2 } },
    history: [],
  };
  const calls = [];
  const controller = createMapExpansion({
    session: { ai: { library, generationOptions: {} }, runtime: {} },
    generation: { save: () => true },
    apiClient: {
      async request(path, input) {
        calls.push(path);
        assert.equal(input.existing.id, world.id);
        return { world: { ...input.existing, background: '新区域的线索' } };
      },
    },
  });
  void controller.extend(node);
  await controller.afterMaps(() => calls.push('generate/summary'));
  await controller.extend(node);
  assert.deepEqual(calls, ['generate/map', 'generate/summary']);
  assert.equal(library.exploration[world.id].frontier[0].world.expandedAt, 2);
});

test('chat accepts one optional lead and high-level recruits keep a later party requirement', async () => {
  const lead = {
    title: '钟声',
    description: '追查没有响过的钟。',
    hook: '失踪的钟匠',
    type: 'social',
    level: 5,
  };
  const body = '<wanxiang_output>【旁白】钟楼传来异响。</wanxiang_output>';
  const tail = '<wanxiang_quest>' + JSON.stringify(lead) + '</wanxiang_quest>';
  const read = (value, questOffer = true) =>
    chatResponse('quick-chat', value, [], { questOffer }, async (_scripts, items) => items);
  assert.deepEqual((await read(body + tail)).quest, lead);
  assert.equal((await read(body + tail + tail)).quest, undefined);
  assert.equal((await read(body + tail, false)).quest, undefined);
  const plan = normalizeQuestCharacter(
    {
      scene: 'court',
      story: '人物在庭院讲述发生的事。'.repeat(44),
      level: 80,
      requirements: { tavern: 2, affection: 1, partyLevel: 1, difficulty: 'medium' },
    },
    { court: '庭院' },
  );
  assert.equal(plan.requirements.partyLevel, 70);
  const library = {
    daily: { rank: 2 },
    party: ['a'],
    characters: [{ id: 'a', growth: { level: 70 } }],
  };
  assert(!questRecruitmentReady(library, { plan, affection: 100 }));
  assert(questRecruitmentReady(library, { plan, affection: 100, negotiated: true }));
  assert.throws(() => normalizeSocialQuest({ acts: [] }, {}), /五幕/);
});

test('discoveries sample every fixed route point including destinations, then exhaust in either direction', () => {
  const plan = overlandPlan('outskirts', 'road-capital');
  const reverse = overlandPlan('road-capital', 'outskirts');
  const route = routePoints(plan);
  assert.equal(route.length, 4);
  const discoveries = [];
  for (let index = 0; index < 4; index++) {
    const point = chooseDiscoveryPoint(index % 2 ? reverse : plan, discoveries, () => 0.999);
    if (index === 0) assert.equal(point.id, 'road-capital');
    const location = placeDiscovery(
      { id: 'world-stop-' + index, name: '支路 ' + index },
      { linkId: point.id, direction: '北' },
      point,
      route,
      discoveries,
      () => 0.5,
    );
    discoveries.push(location);
    const trip = overlandPlan('outskirts', location.id, location);
    assert.equal(trip.stages.at(-1).from.id, point.id);
    assert.equal(trip.stages.at(-1).to.id, location.id);
  }
  assert.equal(chooseDiscoveryPoint(reverse, discoveries), null);
});
import {
  ETERNAL_CITY_GATE,
  ETERNAL_CITY_PLACES,
  ETERNAL_CITY_STOPS,
} from '../src/content/eternal-city-scenes.js';
import { ATLAS_PLACES, ATLAS_ROUTES } from '../src/content/atlas-geography.js';

test('the capital route has exactly three stops, with bends and working travel in either direction', () => {
  const expected = ['outskirts', ...Object.keys(ETERNAL_CITY_STOPS), ETERNAL_CITY_GATE];
  assert.equal(expected.length, 5);
  const outward = overlandPlan(expected[0], expected.at(-1));
  const home = overlandPlan(expected.at(-1), expected[0]);
  assert.equal(outward.turns, 13);
  assert.equal(home.turns, outward.turns);
  assert.deepEqual(
    outward.stages.map(({ to }) => to.id),
    expected.slice(1),
  );
  assert.deepEqual(
    home.stages.map(({ to }) => to.id),
    expected.slice(0, -1).reverse(),
  );
  assert.match(home.stages[0].choices[0].action, /出城/);
  for (const { from, to } of outward.stages) {
    assert(ATLAS_PLACES[to.id]);
    assert(ATLAS_ROUTES.some(([a, b, bends]) => a === from.id && b === to.id && bends.length > 0));
  }
  const across = overlandPlan('road-capital', ETERNAL_CITY_GATE);
  assert.equal(across.turns, 23);
  assert.equal(across.stages[2].to.id, 'outskirts');
});

test('all ten capital panoramas are reachable from the gate and have reciprocal exits', () => {
  assert.equal(Object.keys(ETERNAL_CITY_PLACES).length, 10);
  const pending = new Set([ETERNAL_CITY_GATE]);
  const visited = new Set();
  for (const id of pending) {
    visited.add(id);
    assert.equal(overlandOrigin(id), ETERNAL_CITY_GATE);
    const scene = explorationScene(id);
    assert.equal(scene.illustration.aspect, 3);
    for (const { destination } of scene.points) {
      assert(explorationScene(destination).points.some((point) => point.destination === id));
      if (!visited.has(destination)) pending.add(destination);
    }
  }
  assert.equal(visited.size, 10);
});

test('Silver Crown links every city scene to its gate and shares the tavern through one courtyard', () => {
  const places = Object.entries(SILVER_CROWN_PLACES);
  assert.equal(places.filter(([, place]) => place.wide).length, 5);
  assert.equal(places.filter(([, place]) => !place.wide).length, 6);
  assert.equal(places.filter(([, place]) => place.night).length, 8);
  for (const [id, place] of places) {
    assert.equal(overlandOrigin(id), 'road-capital');
    assert(Object.keys(explorationScene(id).illustration.spots).length > 0);
    for (const destination of Object.keys(place.exits)) {
      if (destination === 'tavern') assert.equal(id, 'crown-tavern-door');
      else assert(explorationScene(destination).points.some((point) => point.destination === id));
    }
  }
  assert(
    !explorationScene('outskirts').points.some((point) => point.destination?.startsWith('road-')),
  );
  assert.equal(overlandOrigin('road-pines'), 'outskirts');
  assert.equal(overlandOrigin('road-orchard'), 'road-bridge');
  assert.equal(overlandOrigin('road-causeway'), 'road-reeds');
});

test('bridge and city request exactly the traversed legs, including reverse paths', () => {
  const bridge = overlandPlan('outskirts', 'road-bridge');
  assert.deepEqual(
    bridge.stages.map((leg) => [leg.turns, leg.type]),
    [[3, 'battle']],
  );
  const reeds = overlandPlan('outskirts', 'road-reeds');
  assert.equal(reeds.turns, 6);
  assert.deepEqual(
    reeds.stages.map((leg) => leg.type),
    ['battle', 'event'],
  );
  const city = overlandPlan('outskirts', 'road-capital');
  assert.equal(city.turns, 10);
  assert.deepEqual(
    city.stages.map((leg) => leg.to.id),
    ['road-bridge', 'road-reeds', 'road-capital'],
  );
  assert.deepEqual(
    overlandPlan('road-capital', 'outskirts').stages.map((leg) => leg.turns),
    [4, 3, 3],
  );
  const input = { overland: { from: bridge.from, to: bridge.to } };
  const request = overlandRequest(
    input,
    { contextSize: 16000, maxTokens: 2048 },
    (s) => s.length / 3,
  );
  assert.match(request.messages[0].content, /恰好写 1 幕/);
  const mechanics = JSON.parse(request.messages.at(-1).content).stages;
  assert.deepEqual(mechanics[0].enemyIds, ['patrolHound']);
  assert.equal(mechanics[0].level, 3);
});

test('overland output can author prose and choices only, with validated save restoration', () => {
  const plan = overlandPlan('outskirts', 'road-reeds');
  const raw = {
    acts: plan.stages.map((leg) => ({
      id: leg.id,
      title: '路况',
      story: '【旁白】沿岸传来水声。',
      ...(leg.choices
        ? {
            choices: leg.choices.map(({ id, action }) => ({
              id,
              label: action,
              outcome: '通过。',
            })),
          }
        : {}),
    })),
  };
  const acts = overlandResponse(`<wanxiang_json>${JSON.stringify(raw)}</wanxiang_json>`, {
    overland: plan,
  });
  const run = { id: 'route', from: plan.from, to: plan.to, acts, index: 0, phase: 'battle' };
  assert.deepEqual(restoreOverlandRun(run), run);
  const prior = { ...run, to: 'road-bridge', acts: [acts[1], acts[0]], index: 1 };
  assert.deepEqual(restoreOverlandRun(prior), prior);
  assert.deepEqual(
    overlandRunPlan(prior).stages.map((leg) => leg.to.id),
    ['road-reeds', 'road-bridge'],
  );
  assert.throws(() => normalizeOverlandStory({ acts: acts.slice(0, 1) }, plan), /2 幕/);
  assert.throws(
    () => normalizeOverlandStory({ acts: [{ ...acts[0], enemyIds: ['ares'] }, acts[1]] }, plan),
    /只能/,
  );
});

test('same-rank growth uses shared scales, SP grows slower, and multi-hit gets one bonus', () => {
  const build = (level) =>
    grownCombat({ id: 'edith', combat: EDITH, growth: restoreGrowth({ level }, 'edith') });
  assert.equal(combatRank(20), '普通');
  assert.equal(combatRank(21), '精锐');
  assert.equal(build(99).mp, 80);
  assert.equal(build(21).hp, Math.round(EDITH.hp * combatScale(21)));
  const boss = enemyGrowth({ level: 21, seed: 123 }, 0, 'ares', true);
  assert.equal(boss.hpScale, combatScale(21));
  assert.equal(boss.damageScale, combatScale(21));
  const multi = [3, 3, 4].map((value) => ({ type: 'damage', value }));
  assert.equal(
    scaleMoveEffects(multi, 3.1, 5).reduce((sum, hit) => sum + hit.value, 0),
    36,
  );
});

test('overland loot stages roll only for battle legs and validate optional loot items', () => {
  const reeds = overlandPlan('outskirts', 'road-reeds');
  const rolled = rollOverlandLootStages(reeds.stages, () => 0.1);
  assert.deepEqual(rolled, ['bridge-patrol']);
  assert.deepEqual(
    rollOverlandLootStages(reeds.stages, () => 0.9),
    [],
  );

  const stageId = reeds.stages[0].id;
  const raw = {
    acts: reeds.stages.map((leg) => ({
      id: leg.id,
      title: '沿途所见',
      story: '【旁白】石桥旁雾色低垂。',
      ...(leg.choices
        ? {
            choices: leg.choices.map(({ id, action }) => ({
              id,
              label: action,
              outcome: '稳步渡过。',
            })),
          }
        : {}),
    })),
    items: [{ stageId, name: '涉水铜徽', description: '浸过桥下溪水的旧铜章。', value: 16 }],
  };
  const items = overlandItemsResponse(`<wanxiang_json>${JSON.stringify(raw)}</wanxiang_json>`, {
    overland: reeds,
  });
  assert.deepEqual(items, [
    { stageId, name: '涉水铜徽', description: '浸过桥下溪水的旧铜章。', value: 16 },
  ]);
  assert.throws(
    () =>
      normalizeOverlandItems(
        [{ stageId: reeds.stages[1].id, name: '非战斗站物品', description: '不合法', value: 12 }],
        reeds,
      ),
    /战斗/,
  );
  assert.throws(
    () =>
      normalizeOverlandItems(
        [{ stageId, name: '超价物品', description: '超限', value: 999 }],
        reeds,
      ),
    /4～120/,
  );
});
