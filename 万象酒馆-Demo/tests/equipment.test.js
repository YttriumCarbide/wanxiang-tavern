import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newBattle,
  newEncounter,
  preview,
  advance,
  makeAction,
  makeSwap,
  effectiveBuff,
  campRest,
} from '../src/engine.js';
import {
  normalizeEquipment,
  buyEquipment,
  equip,
  equippedDefinitions,
  applyEquipment,
} from '../src/equipment.js';
import { normalizeRules } from '../src/triggers.js';
import { HEROES } from '../src/data.js';
import { newLibrary, compileRoster, restoreLibrary } from '../src/ai/library.js';
import {
  recordSettlement,
  pandoraEligible,
  joinPandora,
  performedFrontRearSwap,
} from '../src/companion-events.js';
import { officialSummonPool } from '../src/summoning.js';
import { creationInput, creationPlan, creationResponse } from '../server/creation-request.mjs';
import { developerOption, restoreGenerationOptions } from '../src/generation-options.js';

function withRules(rules) {
  const hero = structuredClone(HEROES[0]);
  hero.equipment = [{ id: 'test-ring', name: '试炼指环', stats: {}, rules: normalizeRules(rules) }];
  return { [hero.id]: hero };
}
function eventRule(event, effects, target = 'self', limit = 2) {
  return { mode: 'event', event, target, effects, conditions: [], limit };
}

test('equipment has three slots, unique physical ownership, exact ether price and persists into combat', () => {
  const library = newLibrary();
  const template = normalizeEquipment(
    { name: '碎晶剑', description: '普攻增加2', stats: { attack: 2 }, rules: [] },
    { id: 'ore', value: 25, name: '晶矿', map: 'frost' },
  );
  library.equipment.catalog.push(template);
  library.inventory.ether = 25;
  buyEquipment(library, 'ore', 'owned-1');
  assert.equal(library.inventory.ether, 0);
  equip(library, 'official-aegis', 0, 'owned-1');
  assert.throws(() => equip(library, 'official-lyria', 0, 'owned-1'), /已被使用/);
  assert.throws(() => equip(library, 'official-aegis', 3, null), /装备槽/);
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.equal(compileRoster(restored).aegis.attack, HEROES[0].attack + 2);
  assert.equal(equippedDefinitions(restored, restored.characters[0])[0].price, 25);
  assert.throws(() => buyEquipment(library, 'ore', 'owned-2'), /以太不足/);
  assert.throws(
    () =>
      normalizeEquipment(
        { name: '伪造', description: '', stats: { constructor: 1, attack: 40 } },
        { id: 'invalid', name: '石片', value: 1 },
      ),
    /属性/,
  );
});

test('conditional equipment aura follows real formation and disappears when owner dies', () => {
  const rules = [
    {
      mode: 'continuous',
      target: 'self',
      conditions: [{ type: 'front' }],
      effects: [{ type: 'buff', buff: 'iron', value: 2 }],
    },
  ];
  const state = newBattle(['sprout'], withRules(rules));
  assert.equal(effectiveBuff(state, 'aegis', 'iron'), 2);
  state.formation = ['serin', 'lyria', 'morrow', 'aegis', 'vesper', 'rook'];
  assert.equal(effectiveBuff(state, 'aegis', 'iron'), 0);
  state.formation.reverse();
  state.units.aegis.hp = 0;
  assert.equal(effectiveBuff(state, 'aegis', 'iron'), 0);
  const haste = newBattle(
    ['sprout'],
    withRules([
      { mode: 'continuous', target: 'self', effects: [{ type: 'buff', buff: 'haste', value: 3 }] },
    ]),
  );
  haste.units.aegis.buffs.haste = 2;
  assert.equal(effectiveBuff(haste, 'aegis', 'haste'), 2);
});

test('preview is pure, event limits persist across encounters and reset for a new dungeon', () => {
  const definitions = withRules([eventRule('afterAttack', [{ type: 'shield', value: 3 }])]);
  let state = newBattle(['sprout'], definitions);
  const original = JSON.stringify(state);
  let result = preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]);
  assert.equal(result.final.units.aegis.block, 3);
  assert.equal(JSON.stringify(state), original);
  assert.deepEqual(
    preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]).final,
    result.final,
  );
  state = newEncounter(
    { enemyIds: ['sprout'], hpScale: 1, map: 'ruins' },
    campRest(advance(result)).state,
    1,
  );
  result = preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]);
  assert.equal(result.final.units.aegis.block, 3);
  state = newEncounter({ enemyIds: ['sprout'], hpScale: 1, map: 'ruins' }, result.final, 2);
  assert.equal(
    preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]).final.units.aegis.block,
    0,
  );
  state = newBattle(['sprout'], definitions);
  assert.equal(
    preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]).final.units.aegis.block,
    3,
  );
});

test('equipment buffs and heals cannot recursively proc gain/healed rules', () => {
  const rules = [
    eventRule('afterAttack', [{ type: 'buff', buff: 'strength', value: 1 }]),
    eventRule('gainPositive', [{ type: 'shield', value: 5 }]),
    eventRule('healed', [{ type: 'heal', value: 3 }]),
  ];
  const state = newBattle(['sprout'], withRules(rules));
  const result = preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]);
  assert.equal(result.final.units.aegis.buffs.strength, 1);
  assert.equal(result.final.units.aegis.block, 0);
  const active = structuredClone(HEROES[0]);
  active.skills[0].effects = [{ type: 'buff', buff: 'strength', value: 1 }];
  active.skills[0].target = 'self';
  active.equipment = withRules(rules).aegis.equipment;
  const natural = newBattle(['sprout'], { aegis: active });
  const buff = preview(natural, [makeAction(natural, 'aegis', active.skills[0].id, 'aegis', 0)]);
  assert.equal(buff.final.units.aegis.block, 5);
});

test('new generic passives use the same rule engine as equipment; front/rear swaps are actual events', () => {
  const hero = structuredClone(HEROES[3]);
  hero.skills[1] = {
    id: 'rear-support',
    name: '援护',
    passive: true,
    location: '全战斗',
    rules: normalizeRules([eventRule('enterFront', [{ type: 'shield', value: 4 }], 'self', 1)]),
  };
  const state = newBattle(['sprout'], { serin: hero });
  const result = preview(state, [makeSwap('serin', 0, 0)]);
  assert.equal(result.final.units.serin.block, 4);
  assert.equal(performedFrontRearSwap(state, result), true);
});

test('trigger damage cannot masquerade as a natural kill and chain another equipment effect', () => {
  const rules = [
    eventRule('damageDealt', [{ type: 'damage', value: 20 }], 'target'),
    eventRule('kill', [{ type: 'shield', value: 5 }]),
  ];
  const state = newBattle(['sprout'], withRules(rules));
  const result = preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]);
  assert.equal(result.final.units.sprout.hp, 0);
  assert.equal(result.final.units.aegis.block, 0);
  state.units.sprout.hp = 1;
  assert.equal(
    preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]).final.units.aegis.block,
    5,
  );
});

test('creation validates batch identity and code budget, without importing presets or unrelated lore', () => {
  const items = [
    {
      id: 'ore',
      name: '晶矿',
      description: '破碎晶石',
      value: 10,
      map: 'frost',
      script: '矿洞中拾取晶矿。',
    },
  ];
  const profile = {
    tokenField: 'max_tokens',
    maxTokens: 8192,
    contextSize: 131072,
    promptProcessing: 'merge_tools',
  };
  const request = creationInput({ items });
  assert.equal(request.items.length, 1);
  assert.equal(request.scripts[0], '矿洞中拾取晶矿。');
  assert.deepEqual(creationPlan({ items }, profile, (text) => Math.ceil(text.length / 2)).batches, [
    ['ore'],
  ]);
  const content = {
    schemaVersion: 2,
    items: [
      { id: 'ore', name: '晶片', description: '星辉', design: { statFocus: ['hp'], rules: [] } },
    ],
  };
  const result = creationResponse(JSON.stringify(content), items);
  assert.equal(result[0].price, 10);
  content.items[0].design.statFocus = ['limit'];
  assert.throws(() => creationResponse(JSON.stringify(content), items), /档位/);
  content.items[0].id = 'unknown';
  assert.throws(() => creationResponse(JSON.stringify(content), items), /ID/);
  assert.throws(
    () =>
      normalizeRules([
        { mode: 'continuous', target: 'self', effects: [{ type: 'damage', value: 1 }] },
      ]),
    /持续/,
  );
});

test('Pandora is excluded from all official draws and only joins once after two distinct settlements', () => {
  const library = newLibrary();
  const book = {
    entries: {
      0: { content: '潘多拉', extensions: { wanxiang: { characterId: 'official-pandora' } } },
    },
  };
  assert.deepEqual(officialSummonPool(library, book), []);
  recordSettlement(library, 'run1');
  recordSettlement(library, 'run1');
  assert.equal(pandoraEligible(library), false);
  recordSettlement(library, 'run2');
  assert.equal(joinPandora(library), true);
  assert.equal(joinPandora(library), false);
  assert.equal(library.characters.filter((member) => member.id === 'official-pandora').length, 1);
  assert.equal(restoreLibrary(library).progression.swapLesson, 'pending');
});

test('developer-only retreat and archive editing require both switches; equipment mana reduction clamps to zero', () => {
  assert.equal(
    developerOption(restoreGenerationOptions({ allowRetreat: true }), 'allowRetreat'),
    false,
  );
  assert.equal(
    developerOption(
      restoreGenerationOptions({ developerMode: true, allowRetreat: true }),
      'allowRetreat',
    ),
    true,
  );
  const combat = applyEquipment(HEROES[0], [
    { stats: { manaCost: 2 }, rules: [] },
    { stats: { manaCost: 2 }, rules: [] },
  ]);
  assert.ok(combat.skills.every((skill) => skill.passive || skill.mp >= 0));
});
