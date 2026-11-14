import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  INGREDIENTS,
  DISHES,
  DIRECT_FOODS,
  MEAL_FOODS,
  foodBonusText,
} from '../src/content/dining.js';
import { newLibrary, restoreLibrary, compileRoster } from '../src/ai/library.js';
import {
  diningState,
  buyIngredient,
  diningBattleCompleted,
  prepareMeal,
  finishMeal,
  foodPreference,
  mealPreference,
  applyDiningToBattle,
  withoutDiningBonus,
  consumeDiningForBattle,
} from '../src/dining.js';
import { newBattle, newEncounter } from '../src/engine.js';
import {
  favoriteEquipment,
  deleteEquipmentPlan,
  buyEquipment,
  restoreEquipment,
} from '../src/equipment.js';
import { isMonsterWorldEntry, monsterNarrativeText } from '../src/ai/monster-narrative.js';
import { enemyIntentBadge } from '../src/enemy-intent.js';
import { normalizePromptPreset } from '../src/ai/presets.js';
import { chatRequest } from '../src/ai/pipeline/chat-request.js';
import { tavernPresetFixture } from './fixtures/ai.js';

test('food atlases retain RGBA originals and all recipes use registered ingredients', async () => {
  assert.equal(Object.keys(INGREDIENTS).length, 40);
  assert.equal(Object.keys(DISHES).length, 24);
  for (const food of Object.values(DISHES))
    for (const key of Object.keys(food.recipe)) assert(INGREDIENTS[key]);
  const manifest = JSON.parse(
    await readFile(new URL('../assets/dining/manifest.json', import.meta.url)),
  );
  assert.equal(manifest.assets.length, 4);
  for (const item of manifest.assets) {
    const bytes = await readFile(new URL('../' + item.file, import.meta.url));
    assert.equal(bytes[25], 6);
    assert.equal(bytes.readUInt32BE(16), item.width);
  }
});
test('limited ingredient stock persists and refreshes only once per completed battle', () => {
  const library = newLibrary();
  library.inventory.gold = 1000;
  const state = diningState(library);
  assert.equal(state.stock.length, 5);
  assert.equal(new Set(state.stock.map((entry) => entry.id)).size, 5);
  const item = state.stock[0],
    count = item.left;
  for (let n = 0; n < count; n++) buyIngredient(library, item.id);
  assert.throws(() => buyIngredient(library, item.id), /售罄/);
  const restored = restoreLibrary(library);
  assert.deepEqual(restored.dining.stock, state.stock);
  assert.equal(diningBattleCompleted(restored, 'run:0'), true);
  const stock = structuredClone(restored.dining.stock);
  assert.equal(diningBattleCompleted(restored, 'run:0'), false);
  assert.deepEqual(restored.dining.stock, stock);
});
test('one table pays once; retry draft survives reload, only participating companions gain affection', () => {
  const library = newLibrary();
  library.campaign = { protagonistId: library.characters[0].id };
  const state = diningState(library);
  state.inventory.bread = state.inventory.cheese = 3;
  const members = library.characters.slice(0, 3).map((member) => member.id);
  prepareMeal(library, members, ['cheese-board']);
  assert.equal(state.inventory.bread, 3, 'API attempts have no gameplay cost');
  prepareMeal(library, members, ['cheese-board']);
  const restored = restoreLibrary({ ...library, campaign: undefined });
  assert(restored.dining.draft);
  const result = finishMeal(library);
  assert.equal(result.gains.length, 2);
  assert.equal(state.inventory.bread, 2);
  assert.equal(state.inventory.cheese, 2);
  assert.equal(finishMeal(library), null);
  assert.throws(() => prepareMeal(library, members, ['cheese-board']), /已经/);
  diningBattleCompleted(library, 'test:0');
  prepareMeal(library, members.slice(1), ['cheese-board']);
  assert.equal(finishMeal(library).gains.length, 0);
});
test('the whole table has one score shared by dialogue and affection, including cancellation', () => {
  const library = newLibrary();
  const member = library.characters[0];
  const other = library.characters[1];
  library.campaign = { protagonistId: other.id };
  assert.deepEqual(mealPreference(library, member, ['cheese-board']), {
    score: 0,
    preference: '一般',
  });
  assert.deepEqual(mealPreference(library, member, ['apple-pie', 'cheese-board']), {
    score: 1,
    preference: '喜欢',
  });
  assert.deepEqual(mealPreference(library, member, ['pepper-beef']), {
    score: -1,
    preference: '讨厌',
  });
  assert.deepEqual(mealPreference(library, member, ['apple-pie', 'pepper-beef']), {
    score: 0,
    preference: '一般',
  });
  for (const id of Object.keys(INGREDIENTS)) library.dining.inventory[id] = 10;
  prepareMeal(library, [member.id, other.id], ['apple-pie', 'pepper-beef']);
  const result = finishMeal(library);
  assert.deepEqual(
    result.gains,
    [{ id: member.id, delta: 2 }],
    'one liked dish cannot override the disliked dish',
  );
});
test('next-battle bonuses follow character IDs, replace old food and never mutate expedition templates', () => {
  const library = newLibrary();
  const state = diningState(library),
    id = library.party[0],
    reserve = library.party[5];
  state.pending[id] = {
    bonus: { hp: 4, mp: 2, attack: 2, skillDamage: 1, shield: 3 },
    foods: ['herb-chicken'],
  };
  state.pending[reserve] = { bonus: { mp: 3 }, foods: ['apple-pie'] };
  const definitions = compileRoster(library),
    original = structuredClone(definitions);
  const battle = newBattle(['sprout'], definitions);
  applyDiningToBattle(library, battle, library.party);
  assert.deepEqual(definitions, original);
  assert.equal(battle.heroDefinitions.aegis.attack, definitions.aegis.attack + 2);
  assert.equal(battle.units.aegis.block, 3);
  assert.equal(battle.units.aegis.maxHp, definitions.aegis.hp + 4);
  assert.equal(battle.units.aegis.hp, battle.units.aegis.maxHp);
  const carried = withoutDiningBonus(battle);
  assert.deepEqual(carried.heroDefinitions.aegis, definitions.aegis);
  assert.equal(carried.units.aegis.maxHp, definitions.aegis.hp);
  assert(!carried.units.aegis.mealBonus);
  assert(battle.units.aegis.mealBonus);
  const nextEncounter = newEncounter(
    { enemyIds: ['sprout'], map: 'forest' },
    battle,
    1,
    definitions,
  );
  assert.deepEqual(nextEncounter.heroDefinitions.aegis, definitions.aegis);
  assert.equal(nextEncounter.units.aegis.maxHp, definitions.aegis.hp);
  assert.equal(nextEncounter.units.aegis.maxMp, definitions.aegis.mp);
  assert(!state.pending[id]);
  assert(!state.pending[reserve], 'rear participants still join this battle');
  const again = newBattle(['sprout'], definitions);
  applyDiningToBattle(library, again, library.party);
  assert.equal(again.heroDefinitions.aegis.attack, definitions.aegis.attack);
  state.pending[id] = { bonus: { shield: 2 }, foods: ['cheese-board'] };
  const loading = newBattle(['sprout'], definitions);
  applyDiningToBattle(library, loading, library.party, false);
  assert(state.pending[id], 'failed scene loading must leave the next-battle benefit pending');
  consumeDiningForBattle(library, loading, library.party);
  assert(!state.pending[id]);
  const member = { id: 'character-taste', source: 'generated', combat: {} };
  const taste = foodPreference(library, member, MEAL_FOODS['apple-pie']);
  assert.equal(foodPreference(library, member, MEAL_FOODS['apple-pie']), taste);

  for (const dish of Object.values(DISHES)) {
    assert(foodBonusText(dish.bonus).includes('%'), `${dish.name} should describe percentage buff`);
    for (const [k, v] of Object.entries(dish.bonus)) {
      assert(k.endsWith('Percent') && v >= 4 && v <= 10, `${dish.name} invalid percent ${k}:${v}`);
    }
  }
  for (const food of Object.values(DIRECT_FOODS)) {
    assert(foodBonusText(food.bonus).includes('%'), `${food.name} should describe percentage buff`);
    for (const [k, v] of Object.entries(food.bonus)) {
      assert(k.endsWith('Percent') && v >= 3 && v <= 5, `${food.name} invalid percent ${k}:${v}`);
    }
  }
  const scaledDefs = structuredClone(definitions);
  scaledDefs.aegis.hp = 120;
  scaledDefs.aegis.mp = 40;
  scaledDefs.aegis.attack = 30;
  state.pending[id] = {
    bonus: {
      hpPercent: 10,
      mpPercent: 10,
      attackPercent: 5,
      skillDamagePercent: 10,
      shieldPercent: 5,
    },
    foods: ['hearth-stew'],
  };
  const pctBattle = newBattle(['sprout'], scaledDefs);
  applyDiningToBattle(library, pctBattle, library.party);
  assert.equal(pctBattle.units.aegis.maxHp, 132);
  assert.equal(pctBattle.units.aegis.maxMp, 44);
  assert.equal(pctBattle.heroDefinitions.aegis.attack, 32);
  assert.equal(pctBattle.units.aegis.block, 6);
  assert.deepEqual(withoutDiningBonus(pctBattle).heroDefinitions.aegis, scaledDefs.aegis);
});
test('deleting a forge plan preserves owned and equipped items across restore', () => {
  const library = newLibrary();
  const plan = {
    id: 'meal-test-gear',
    name: '旧银扣',
    description: '',
    price: 10,
    stats: { hp: 1 },
    rules: [],
  };
  library.equipment.catalog.push(plan);
  library.inventory.ether = 100;
  buyEquipment(library, plan.id, 'owned-silver');
  favoriteEquipment(library, plan.id);
  deleteEquipmentPlan(library, plan.id);
  const restored = restoreEquipment(library.equipment);
  assert.equal(restored.owned[0].templateId, plan.id);
  assert(restored.hidden.includes(plan.id));
  assert.throws(() => buyEquipment(library, plan.id, 'second'), /删除/);
});
test('monster lore loses mechanical clauses without changing activation metadata; intents retain repeated targets', () => {
  const entry = {
    uid: 4,
    key: ['兽'],
    constant: false,
    position: 1,
    content:
      '外形：披着灰色毛皮。\n基础hp：120；速度：2\n行动：对中间敌方单位造成21点伤害。\n习性：守护旧井。',
    extensions: { wanxiang: { monsterId: 'test' } },
  };
  const cleaned = monsterNarrativeText(entry.content);
  assert(cleaned.includes('灰色毛皮'));
  assert(!cleaned.includes('21'));
  assert(!cleaned.includes('基础hp'));
  assert(monsterNarrativeText('外形：两点淡黄眼光。').includes('两点淡黄眼光'));
  assert.equal(monsterNarrativeText('攻击中位8伤害\n获得6护盾'), '');
  assert(
    isMonsterWorldEntry({
      comment: '霜背甲虫',
      content: '名称：霜背甲虫\n习性与能力：守护矿井。\n行动方式：撞击。',
    }),
  );
  const badge = enemyIntentBadge({
    targets: [0, 1, 2].map((slot) => ({
      slot,
      id: 'hero' + slot,
      damage: 12,
      buffs: slot === 1 ? [{ key: 'vulnerable', value: 2 }] : [],
    })),
    selfBuffs: [{ key: 'strength', value: 1 }],
  });
  assert.equal((badge.match(/class="intent-target"/g) || []).length, 3);
  assert.equal((badge.match(/class="intent-divider"/g) || []).length, 2);
  assert(badge.includes('intent-self'));
});
test('retired monster boundary is removed by monsterNarrativeText without losing prose', () => {
  const boundary =
    '叙事边界：这些是可观察特征与可能的行动。实际伤害、技能使用、受伤和胜负以游戏已经确认的事件为准。';
  assert.equal(monsterNarrativeText('外形：灰色毛皮。\n' + boundary), '外形：灰色毛皮。');
});

test('meal food lore is injected exactly once and ordinary chats do not receive it', async () => {
  const preset = normalizePromptPreset(tavernPresetFixture()).preset;
  const base = { text: '一起吃饭吧', place: 'bar', characters: [], selected: [], history: [] };
  const options = {
    profile: { contextSize: 200000, maxTokens: 2000 },
    worldInfo: { books: [], settings: {}, state: {} },
    regexScripts: [],
    countTokens: (text) => Math.ceil(text.length / 3),
    runRegexTasks: async (_scripts, tasks) =>
      tasks.map((item) => ({ text: item.text, warnings: [] })),
  };
  const normal = await chatRequest('chat', base, preset, options);
  assert(!JSON.stringify(normal.messages).includes('酒馆用餐：'));
  const meal = await chatRequest(
    'chat',
    { ...base, dining: { foods: [{ name: '旅人奶酪拼盘' }], preferences: [] } },
    preset,
    options,
  );
  assert.equal(meal.messages.filter((message) => message.content.includes('酒馆用餐：')).length, 1);
});
