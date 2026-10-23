import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentGenerationPlan, compileEquipmentDesign } from '../src/equipment-generation.js';
import { equipmentBudget, equipmentCost, restoreEquipment } from '../src/equipment.js';
import { creationInput, creationResponse } from '../src/ai/pipeline/creation-request.js';
import { needsContinuationWorld, continuationInput } from '../src/continuation-world.js';
import { newLibrary } from '../src/ai/library.js';
import {
  completeExploration,
  addWorldRoute,
  restoreExploration,
  explorationPreview,
  explorationSpec,
} from '../src/exploration.js';
import { mapResponse } from '../src/ai/pipeline/map-request.js';
import { worldFixture } from './fixtures/multiverse.js';
import { generationInput } from '../src/ai/pipeline/prompts.js';
import { emblemRing, EMBLEM_ID } from '../src/emblems.js';
import { EDITH } from '../src/content/edith.js';
import { finalSkillText } from '../src/skill-text.js';

test('ether-value plans bound stats, event complexity, side effects and code-generated values', () => {
  for (const value of [0, 5, 10, 11, 30, 31, 80, 81, 200, 201, 1000, 10000]) {
    const source = {
      id: 'ore-' + value,
      name: '星矿',
      description: '月下的矿石',
      value,
      map: 'ruins',
    };
    const plan = equipmentGenerationPlan(source);
    const raw = {
      name: source.name,
      description: '一次设计',
      design: {
        statFocus: ['attack', 'mp'],
        rules: plan.maxRules
          ? [
              {
                mode: 'event',
                event: 'afterAttack',
                target: 'lowestEnemy',
                conditions: [],
                effects: [{ type: 'damage', power: 'high' }],
              },
            ]
          : [],
      },
    };
    const item = compileEquipmentDesign(raw, source);
    assert(equipmentCost(item) <= equipmentBudget(value));
    assert.deepEqual(
      compileEquipmentDesign(raw, source),
      item,
      'Preview and acceptance compile the same source deterministically',
    );
    assert.equal(item.price, value);
    assert(item.rules.length <= plan.maxRules);
    assert.equal(restoreEquipment({ catalog: [item], owned: [] }).catalog.length, 1);
    if (!plan.maxRules)
      assert.throws(() =>
        compileEquipmentDesign(
          {
            ...raw,
            design: {
              ...raw.design,
              rules: [
                {
                  mode: 'continuous',
                  target: 'self',
                  conditions: [],
                  effects: [{ type: 'buff', buff: 'iron', power: 'high' }],
                },
              ],
            },
          },
          source,
        ),
      );
  }
  const input = {
    items: [
      {
        id: 'ore',
        name: '星矿',
        description: '来自旧塔',
        value: 50,
        map: 'ruins',
        script: '旅人从旧塔找到矿石。',
      },
    ],
  };
  assert.equal(creationInput(input).items[0].designPlan.tier, 3);
  const response = creationResponse(
    JSON.stringify({
      schemaVersion: 2,
      items: [
        {
          id: 'ore',
          name: '星矿剑',
          description: '留有星辉',
          design: { statFocus: ['attack'], rules: [] },
        },
      ],
    }),
    input.items,
  );
  assert(response[0].stats.attack > 0);
  assert.throws(
    () =>
      compileEquipmentDesign(
        {
          name: 'bad',
          description: '',
          design: {
            statFocus: ['hp'],
            rules: [
              {
                mode: 'event',
                event: 'roundEnd',
                target: 'self',
                conditions: [],
                effects: [{ type: 'damage', power: 'high' }],
              },
            ],
          },
        },
        input.items[0],
      ),
    /阵营/,
  );
});

test('six completed stories feed one guarded continuation world with three fresh goals and a new boss', () => {
  const library = newLibrary();
  for (let sequence = 0; sequence < 6; sequence++) {
    const node = library.exploration.ruins.frontier[0];
    const id = 'main-' + sequence;
    library.scripts.push({ id, exploration: structuredClone(node) });
    library.history.push({
      scriptId: id,
      runId: id,
      map: 'ruins',
      nodeId: node.id,
      complete: true,
      title: '第' + (sequence + 1) + '关',
      lines: [{ text: '主线实际正文' + sequence, speaker: '旁白', stage: 'before' }],
    });
    completeExploration(library.exploration, node);
  }
  const seventh = library.exploration.ruins.frontier[0];
  assert(needsContinuationWorld(library, seventh));
  assert.equal(explorationSpec(seventh).name, '继续探索');
  assert.equal(explorationSpec(library.exploration.ruins.cleared[5]).name, '诅咒显现');
  const continuation = continuationInput(library, 'ruins');
  assert.equal(continuation.completedStories.length, 6);
  assert(
    continuation.completedStories.every((record, index) => record.story === '主线实际正文' + index),
  );
  const existing = {
    id: 'ruins',
    map: 'ruins',
    name: '界隙遗迹',
    background: '旧世界',
    landmarks: [],
    enemyIds: ['apepLamb'],
    enemyDefinitions: {},
  };
  const fixture = {
    ...worldFixture(),
    map: 'ruins',
    goals: ['前往北港寻找失踪商队', '拜访独立山城的学者', '进入地下水道关闭裂隙'],
  };
  assert.throws(
    () =>
      mapResponse(JSON.stringify({ ...fixture, goals: ['一个目标'] }), { existing, continuation }),
    /三个/,
  );
  const world = mapResponse(JSON.stringify(fixture), { existing, continuation });
  library.worlds.push(world);
  addWorldRoute(library.exploration, world);
  assert(!needsContinuationWorld(library, library.exploration.ruins.frontier[0]));
  const restored = restoreExploration(library.exploration, 1, library.worlds);
  assert.equal(restored.ruins.cleared.length, 6);
  assert(restored.ruins.cleared.every((node) => !node.world));
  assert.equal(explorationPreview(restored.ruins, 'ruins').length, 7);
  assert.equal(restored.ruins.frontier[0].world.goals.length, 3);
  const context = generationInput('script', {
    brief: '继续旅行',
    boss: 'apepLamb',
    exploration: restored.ruins.frontier[0],
    party: library.characters.map((member) => ({
      id: member.id,
      name: member.setting.name,
      worldbook: member.setting.worldbook,
    })),
  });
  assert(context.request.dynamicWorld.instruction.includes('可以分离'));
  assert(context.request.dynamicWorld.instruction.includes('data.encounters'));
  assert(!context.request.narrativeParts.at(-1).includes('Boss'));
});

test('emblem future segments blink distinctly without replacing actual current charge; HP cost stays in its UI label', () => {
  const markup = emblemRing({ emblemId: EMBLEM_ID }, { emblemCharge: 2 }, false, {
    emblemCharge: 4,
  });
  assert.equal((markup.match(/class="lit"/g) || []).length, 2);
  assert.equal((markup.match(/class="future-charge"/g) || []).length, 2);
  assert(!markup.includes('emblem-ring charged'));
  const settled = emblemRing({ emblemId: EMBLEM_ID }, { emblemCharge: 4 });
  assert.equal((settled.match(/class="lit"/g) || []).length, 4);
  assert(!settled.includes('future-charge'));
  assert.equal(EDITH.skills[1].hp, 6);
  assert(!finalSkillText(EDITH.skills[1]).includes('消耗'));
});
