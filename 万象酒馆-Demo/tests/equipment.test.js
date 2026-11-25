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
  EQUIPMENT_QUALITIES,
  normalizeEquipment,
  buyEquipment,
  equip,
  equippedDefinitions,
  applyEquipment,
  reforgeEquipment,
  reforgeCost,
  temperEquipment,
  temperCost,
  ascendEquipment,
  ascendCost,
  dismantleEquipment,
  maxUnlockedEquipmentLevel,
  restoreEquipment,
  rollEquipmentQuality,
  materializeEquipment,
} from '../src/equipment.js';
import { equipmentDescription } from '../src/skill-text.js';
import { compileEquipmentDesign, equipmentGenerationPlan } from '../src/equipment-generation.js';
import { archiveMilestone, archiveOverlandLoot } from '../src/archives.js';
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
  assert.throws(() => equip(library, 'official-aegis', 4, null), /装备槽/);
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  const roster = compileRoster(restored);
  assert.equal(roster.aegis.attack, HEROES[0].attack + library.equipment.owned[0].stats.attack);
  const battle = newBattle(['sprout'], roster);
  assert.equal(battle.units.aegis.maxMp, HEROES[0].mp, 'attack-only gear preserves blue bar');
  assert.equal(battle.units.aegis.mp, HEROES[0].mp);
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

test('equipment quality tiers, Lv.1..99 scaling, reforge, temper, ascend, dismantle, restore and natural text', () => {
  const library = newLibrary();
  const droppedBook = {
    id: 'book-1',
    title: '深层回廊',
    boss: true,
    exploration: { map: 'frost', sequence: 6 },
    items: [{ name: '冰髓指环', description: '寒气环绕', value: 42, encounter: 4 }],
    npcs: [],
  };
  const record = { runId: 'run-frost-6', map: 'frost' };
  archiveMilestone(library, droppedBook, record, 4);
  const dropped = library.archives.items.at(-1);
  assert(dropped.level >= 1 && dropped.level <= 99);
  assert(dropped.quality in EQUIPMENT_QUALITIES);

  const rolledBoss = rollEquipmentQuality({ context: 'boss', value: 42, seed: 99 });
  assert(rolledBoss in EQUIPMENT_QUALITIES);

  const design = {
    statFocus: ['attack', 'hp'],
    rules: [
      {
        mode: 'event',
        event: 'damageTaken',
        target: 'self',
        conditions: [],
        effects: [{ type: 'shield', power: 'medium' }],
      },
    ],
  };
  const rolledSpec = materializeEquipment({ design, level: 8, quality: 'rare', seed: 11 });
  const template = normalizeEquipment(
    {
      name: '深寒长靴',
      flavor: '踏雪留霜。',
      level: 8,
      quality: 'rare',
      description: '临时描述',
      design,
      ...rolledSpec,
      rules: normalizeRules(rolledSpec.rules),
    },
    { id: 'boots', name: '雪靴残片', value: 60, map: 'frost', level: 8, quality: 'rare' },
  );
  template.description = equipmentDescription(template);
  assert(template.description.includes(`hp上限 +${template.stats.hp}`));
  assert(
    template.description.includes(
      `受到hp伤害后，自身获得${template.rules[0].effects[0].value}点护盾`,
    ),
  );
  assert(!template.description.includes('skillDamage'));

  library.equipment.catalog.push(template);
  library.inventory.ether = 2000;
  library.inventory.gold = 1000;
  library.characters[0].growth = { ...(library.characters[0].growth || {}), level: 12 };
  const bought = buyEquipment(library, template.id, 'inst-1', { seed: 11 });
  assert.equal(bought.level, 8);
  assert.equal(bought.quality, 'rare');
  assert.equal(maxUnlockedEquipmentLevel(library) >= 12, true);

  const afterBuyEther = library.inventory.ether;
  const invested = bought.investedEther;
  let remainingGold = library.inventory.gold - reforgeCost(template, bought);
  const reforged = reforgeEquipment(library, 'inst-1', 77);
  assert.equal(library.inventory.gold, remainingGold);
  assert(reforged.rollPercent >= 0 && reforged.rollPercent <= 100);
  remainingGold -= temperCost(template, reforged, 12);
  const tempered = temperEquipment(library, 'inst-1', 12);
  assert.equal(library.inventory.gold, remainingGold);
  assert.equal(tempered.level, 12);
  assert.throws(
    () => temperEquipment(library, 'inst-1', maxUnlockedEquipmentLevel(library) + 1),
    /解锁/,
  );

  remainingGold -= ascendCost(template, tempered);
  const ascended = ascendEquipment(library, 'inst-1', 5);
  assert.equal(library.inventory.gold, remainingGold);
  assert.equal(library.inventory.ether, afterBuyEther);
  assert.equal(ascended.investedEther, invested);
  assert.equal(ascended.quality, 'epic');

  const restoredEq = restoreEquipment(JSON.parse(JSON.stringify(library.equipment)));
  assert.equal(restoredEq.owned[0].quality, 'epic');
  assert.equal(restoredEq.owned[0].level, 12);
  assert(restoredEq.owned[0].statRanges);

  equip(library, library.characters[0].id, 1, 'inst-1');
  assert.throws(() => dismantleEquipment(library, 'inst-1'), /穿戴/);
  equip(library, library.characters[0].id, 1, '');
  const beforeEther = library.inventory.ether;
  const refund = dismantleEquipment(library, 'inst-1');
  assert(refund > 0);
  assert.equal(library.inventory.ether, beforeEther + refund);
  assert.equal(library.equipment.owned.length, 0);

  archiveOverlandLoot(library, {
    runId: 'overland-test-1',
    title: '古道试炼',
    leg: { id: 'outskirts->road-bridge', level: 5, to: { name: '石桥' } },
    items: [
      { stageId: 'outskirts->road-bridge', name: '巡林短匕', description: '轻巧刀锋', value: 18 },
    ],
  });
  const ol = library.archives.items.find((entry) => entry.source?.overland);
  assert.equal(ol.level, 5);
  assert(ol.quality in EQUIPMENT_QUALITIES);
});

test('event rule scopes normalize limits and render unlimited descriptions without undefined', () => {
  const unlimited = normalizeRules([
    {
      mode: 'event',
      event: 'afterAttack',
      target: 'self',
      effects: [{ type: 'shield', value: 3 }],
      conditions: [],
      scope: 'unlimited',
    },
  ]);
  assert.equal(unlimited[0].scope, 'unlimited');
  assert.equal('limit' in unlimited[0], false);
  const battle = normalizeRules([
    { ...eventRule('afterAttack', [{ type: 'shield', value: 3 }], 'self', 2), scope: 'battle' },
  ]);
  assert.equal(battle[0].scope, 'battle');
  assert.equal(battle[0].limit, 2);
  const expedition = normalizeRules([
    {
      mode: 'event',
      event: 'afterAttack',
      target: 'self',
      effects: [{ type: 'shield', value: 3 }],
      conditions: [],
      scope: 'expedition',
      limit: 2,
    },
  ]);
  assert.equal(expedition[0].scope, 'expedition');
  assert.equal(expedition[0].limit, 2);
  assert.throws(
    () =>
      normalizeRules([
        {
          mode: 'event',
          event: 'afterAttack',
          target: 'self',
          effects: [{ type: 'shield', value: 3 }],
          conditions: [],
          scope: 'unlimited',
          limit: 2,
        },
      ]),
    /次数上限/,
  );
  assert.throws(
    () =>
      normalizeRules([
        {
          mode: 'event',
          event: 'afterAttack',
          target: 'self',
          effects: [{ type: 'shield', value: 3 }],
          conditions: [],
          scope: 'unknown',
        },
      ]),
    /次数范围/,
  );
  const description = equipmentDescription({
    name: '试炼指环',
    description: '',
    stats: {},
    rules: unlimited,
  });
  assert(description.includes('不限次数'));
  assert(!description.includes('undefined'));
});

test('event rule scopes reset across turns and encounters; unlimited never records proc uses', () => {
  const unlimitedRules = [
    {
      mode: 'event',
      event: 'afterAttack',
      target: 'self',
      effects: [{ type: 'shield', value: 3 }],
      conditions: [],
      scope: 'unlimited',
    },
  ];
  const battleRules = [
    {
      mode: 'event',
      event: 'afterAttack',
      target: 'self',
      effects: [{ type: 'shield', value: 3 }],
      conditions: [],
      scope: 'battle',
      limit: 1,
    },
  ];
  const expeditionRules = [
    {
      mode: 'event',
      event: 'afterAttack',
      target: 'self',
      effects: [{ type: 'shield', value: 3 }],
      conditions: [],
      scope: 'expedition',
      limit: 1,
    },
  ];
  const unlimitedDefs = withRules(unlimitedRules);
  delete unlimitedDefs.aegis.equipment[0].rules[0].limit;
  let state = newBattle(['sprout'], unlimitedDefs);
  const original = JSON.stringify(state);
  let result = preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]);
  assert.equal(JSON.stringify(state), original);
  assert.equal(result.final.units.aegis.block, 3);
  assert(
    !Object.keys(result.final.procUses || {}).some((key) => key.includes('equipment:test-ring')),
  );
  state = newEncounter({ enemyIds: ['sprout'], hpScale: 1, map: 'ruins' }, result.final, 1);
  result = preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]);
  assert.equal(result.final.units.aegis.block, 3);
  assert(
    !Object.keys(result.final.procUses || {}).some((key) => key.includes('equipment:test-ring')),
  );

  const battleDefs = withRules(battleRules);
  state = newBattle(['sprout'], battleDefs);
  result = preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]);
  assert.equal(result.final.units.aegis.block, 3);
  state = newEncounter({ enemyIds: ['sprout'], hpScale: 1, map: 'ruins' }, result.final, 1);
  result = preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]);
  assert.equal(result.final.units.aegis.block, 3);

  const expeditionDefs = withRules(expeditionRules);
  state = newBattle(['sprout'], expeditionDefs);
  result = preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]);
  assert.equal(result.final.units.aegis.block, 3);
  state = newEncounter({ enemyIds: ['sprout'], hpScale: 1, map: 'ruins' }, result.final, 1);
  result = preview(state, [makeAction(state, 'aegis', 'attack', 'sprout', 0)]);
  assert.equal(result.final.units.aegis.block, 0);
});

test('materializeEquipment differentiates scopes for the same seed and quality', () => {
  const design = {
    ruleRevision: 2,
    statFocus: ['hp'],
    rules: [
      {
        mode: 'event',
        event: 'afterAttack',
        target: 'self',
        conditions: [],
        effects: [{ type: 'shield', power: 'medium' }],
      },
    ],
  };
  function compile(scope) {
    const scoped = structuredClone(design);
    scoped.rules[0].scope = scope;
    return materializeEquipment({ design: scoped, level: 20, quality: 'legendary', seed: 44 });
  }
  const unlimited = compile('unlimited');
  const battle = compile('battle');
  const expedition = compile('expedition');
  assert.equal(unlimited.rules[0].scope, 'unlimited');
  assert.equal(unlimited.rules[0].limit, undefined);
  assert.equal(battle.rules[0].scope, 'battle');
  assert.equal(battle.rules[0].limit, 3);
  assert.equal(expedition.rules[0].scope, 'expedition');
  assert.equal(expedition.rules[0].limit, 4);
  assert(unlimited.rules[0].effects[0].value < battle.rules[0].effects[0].value);
  assert(battle.rules[0].effects[0].value < expedition.rules[0].effects[0].value);
  assert.equal(unlimited.rules[0].triggerRevision, 2);
  assert.equal(battle.rules[0].triggerRevision, 2);
  assert.equal(expedition.rules[0].triggerRevision, 2);
});

test('legacy equipment blueprints keep their pre-scope materialization and budget semantics', () => {
  const design = {
    statFocus: ['hp'],
    rules: [
      {
        mode: 'event',
        event: 'afterAttack',
        target: 'self',
        conditions: [],
        effects: [{ type: 'shield', power: 'medium' }],
      },
    ],
  };
  const legacy = materializeEquipment({ design, level: 20, quality: 'legendary', seed: 44 });
  assert.equal(legacy.rules[0].scope, 'expedition');
  assert.equal(legacy.rules[0].limit, 3);
  assert.equal(legacy.rules[0].triggerRevision, undefined);
  assert.equal(legacy.rules[0].effects[0].value, 30);
});

test('equipment generation advertises and rejects unlimited discrete effects by quality', () => {
  assert.equal(
    equipmentGenerationPlan({ quality: 'uncommon' }).scopeRestrictions.unlimitedCleanse,
    false,
  );
  assert.equal(
    equipmentGenerationPlan({ quality: 'rare' }).scopeRestrictions.unlimitedCleanse,
    true,
  );
  assert.equal(
    equipmentGenerationPlan({ quality: 'epic' }).scopeRestrictions.unlimitedNonDotBuffs,
    true,
  );
  const create = (quality, effect, target = 'self') =>
    compileEquipmentDesign(
      {
        name: '示例',
        description: '',
        design: {
          statFocus: ['hp'],
          rules: [
            {
              mode: 'event',
              event: 'afterAttack',
              scope: 'unlimited',
              target,
              conditions: [],
              effects: [effect],
            },
          ],
        },
      },
      { id: 'source', name: 'source', value: 100, quality, level: 20 },
    );
  assert.throws(
    () => create('rare', { type: 'buff', buff: 'strength', power: 'low' }),
    /史诗及以上/,
  );
  assert.throws(
    () => create('uncommon', { type: 'cleanse', buffs: ['poison'], power: 'low' }),
    /稀有及以上/,
  );
  assert.equal(
    create('epic', { type: 'buff', buff: 'strength', power: 'low' }).rules[0].scope,
    'unlimited',
  );
  assert.deepEqual(create('epic', { type: 'cleanse', power: 'low' }).rules[0].effects, [
    { type: 'cleanse' },
  ]);
  for (const buff of ['artifact', 'flying', 'confusion', 'blind']) {
    const target = ['confusion', 'blind'].includes(buff) ? 'lowestEnemy' : 'self';
    const item = create('epic', { type: 'buff', buff, power: 'low' }, target);
    assert.equal(item.rules[0].effects[0].buff, buff);
  }
});
