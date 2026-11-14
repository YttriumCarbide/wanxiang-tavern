import { INGREDIENTS, MEAL_FOODS } from './content/dining.js';

function hash(text) {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.codePointAt(0), 16777619) >>> 0;
  return value;
}
function randomFor(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
export function restoreDining(raw) {
  const inventory = Object.fromEntries(
    Object.keys(INGREDIENTS).map((id) => [
      id,
      Math.max(0, Math.min(9999, Math.floor(Number(raw?.inventory?.[id]) || 0))),
    ]),
  );
  return {
    version: 1,
    inventory,
    seed: Number(raw?.seed) || 74129,
    cycle: Math.max(0, Math.floor(Number(raw?.cycle) || 0)),
    eatenCycle: Number.isInteger(raw?.eatenCycle) ? raw.eatenCycle : -1,
    stock: Array.isArray(raw?.stock)
      ? raw.stock
          .filter((item) => INGREDIENTS[item.id] && Number.isInteger(item.left) && item.left >= 0)
          .slice(0, 5)
          .map((item) => ({ id: item.id, left: Math.min(5, item.left) }))
      : [],
    pending: structuredClone(raw?.pending || {}),
    preferences: structuredClone(raw?.preferences || {}),
    claims: Array.isArray(raw?.claims)
      ? raw.claims.filter((id) => typeof id === 'string').slice(-2000)
      : [],
    tutorial: ['ready', 'buy', 'cook', 'done'].includes(raw?.tutorial) ? raw.tutorial : 'ready',
    draft:
      raw?.draft && Array.isArray(raw.draft.members) && Array.isArray(raw.draft.foods)
        ? structuredClone(raw.draft)
        : null,
  };
}
export function diningState(library) {
  library.dining ||= restoreDining();
  if (!library.dining.stock.length) {
    const seed = library.exploration?.ruins?.frontier?.[0]?.seed;
    if (library.dining.seed === 74129 && seed) library.dining.seed = seed;
    refreshIngredients(library);
  }
  return library.dining;
}
export function refreshIngredients(library) {
  const state = library.dining;
  const random = randomFor(hash(`${state.seed}:${state.cycle}`));
  const pool = Object.values(INGREDIENTS);
  state.stock = [];
  while (state.stock.length < 5) {
    const roll = random();
    const rarity = roll < 0.6 ? 0 : roll < 0.88 ? 1 : roll < 0.98 ? 2 : 3;
    const candidates = pool.filter(
      (item) => item.rarity === rarity && !state.stock.some((entry) => entry.id === item.id),
    );
    if (!candidates.length) continue;
    const item = candidates[Math.floor(random() * candidates.length)];
    state.stock.push({ id: item.id, left: rarity === 0 ? 3 : rarity === 1 ? 2 : 1 });
  }
}
export function diningBattleCompleted(library, battleId) {
  const state = diningState(library);
  if (state.claims.includes(battleId)) return false;
  state.claims.push(battleId);
  state.claims = state.claims.slice(-2000);
  state.cycle++;
  refreshIngredients(library);
  return true;
}
export function buyIngredient(library, id) {
  const state = diningState(library);
  const item = INGREDIENTS[id];
  const stock = state.stock.find((entry) => entry.id === id);
  if (!item || !stock?.left) throw Error('本批食材已售罄');
  if (library.inventory.gold < item.price) throw Error('金币不足');
  library.inventory.gold -= item.price;
  state.inventory[id]++;
  stock.left--;
  if (state.tutorial === 'buy' && state.inventory.bread && state.inventory.cheese)
    state.tutorial = 'cook';
}
const officialPreferences = {
  aegis: { like: ['甜味', '果香'], hate: ['辛辣'] },
  edith: { like: ['清淡', '蛋奶'], hate: ['酒香'] },
  pandora: { like: ['甜味', '蛋奶'], hate: ['辛辣', '酒香'] },
  'luo-gongxu': { like: ['清淡', '鱼鲜', '酒香'], hate: ['浓香'] },
  'silica-laps': { like: ['肉食', '辛辣'], hate: ['菌菇'] },
};
export function foodPreference(library, member, food) {
  const state = diningState(library);
  let preference = officialPreferences[member.source === 'official' ? member.combat.id : ''];
  if (!preference) {
    state.preferences[member.id] ||= { like: [], hate: [] };
    preference = state.preferences[member.id];
    if (!preference.like.length) {
      const tags = [
        '谷物',
        '肉食',
        '鱼鲜',
        '蔬菜',
        '菌菇',
        '蛋奶',
        '果香',
        '甜味',
        '坚果',
        '清淡',
        '浓香',
        '辛辣',
        '酒香',
      ];
      const start = hash(member.id) % tags.length;
      preference.like = [tags[start], tags[(start + 4) % tags.length]];
      preference.hate = [tags[(start + 8) % tags.length]];
    }
  }
  if (food.tags.some((tag) => preference.hate.includes(tag))) return '讨厌';
  return food.tags.some((tag) => preference.like.includes(tag)) ? '喜欢' : '一般';
}
export function mealCost(foods) {
  const cost = {};
  for (const id of foods)
    for (const [key, count] of Object.entries(MEAL_FOODS[id]?.recipe || {}))
      cost[key] = (cost[key] || 0) + count;
  return cost;
}
/** One overall rating drives the menu, conversation and affection reward. */
export function mealPreference(library, member, foods) {
  const score = foods.reduce((total, id) => {
    const food = MEAL_FOODS[id];
    return (
      total + (food ? { 喜欢: 1, 一般: 0, 讨厌: -1 }[foodPreference(library, member, food)] : 0)
    );
  }, 0);
  return { score, preference: score > 0 ? '喜欢' : score < 0 ? '讨厌' : '一般' };
}
export function prepareMeal(library, members, foods, quality = 'ordinary', place = 'bar') {
  const state = diningState(library);
  if (state.draft) return state.draft;
  if (state.eatenCycle === state.cycle) throw Error('这一场战斗之间已经用过餐了');
  if (
    !members.length ||
    members.length > 3 ||
    new Set(members).size !== members.length ||
    members.some((id) => !library.characters.some((member) => member.id === id))
  )
    throw Error('选择1～3名不同的用餐者');
  if (
    !foods.length ||
    foods.length > 3 ||
    new Set(foods).size !== foods.length ||
    foods.some((id) => !MEAL_FOODS[id])
  )
    throw Error('选择1～3种不同的菜品');
  for (const [id, count] of Object.entries(mealCost(foods)))
    if ((state.inventory[id] || 0) < count) throw Error(`${INGREDIENTS[id].name}不足`);
  state.draft = { members: [...members], foods: [...foods], quality, place, cycle: state.cycle };
  return state.draft;
}
/** The meal transaction owns costs and rewards. Chat retries never run this twice. */
export function finishMeal(library) {
  const state = diningState(library);
  const meal = state.draft;
  if (!meal || state.eatenCycle === meal.cycle) return null;
  for (const [id, count] of Object.entries(mealCost(meal.foods)))
    if (state.inventory[id] < count) throw Error('食材数量变化，请重新选餐');
  for (const [id, count] of Object.entries(mealCost(meal.foods))) state.inventory[id] -= count;
  const bonus = {};
  for (const id of meal.foods)
    for (const [key, amount] of Object.entries(MEAL_FOODS[id].bonus))
      bonus[key] = (bonus[key] || 0) + amount;
  if (meal.quality === 'excellent') bonus.shieldPercent = (bonus.shieldPercent || 0) + 3;
  const protagonist = library.campaign?.protagonistId;
  const gains = [];
  for (const id of meal.members) {
    state.pending[id] = { bonus: { ...bonus }, foods: [...meal.foods] };
    if (!meal.members.includes(protagonist) || id === protagonist) continue;
    const member = library.characters.find((entry) => entry.id === id);
    const affection = { 讨厌: 1, 一般: 2, 喜欢: 3 }[
      mealPreference(library, member, meal.foods).preference
    ];
    library.relationships ||= {};
    const relationship = (library.relationships[id] ||= { affection: 0, gains: 0, agreed: false });
    const delta = Math.min(
      Number.MAX_SAFE_INTEGER - relationship.affection,
      affection + (meal.quality === 'excellent' ? 1 : 0),
    );
    relationship.affection += delta;
    gains.push({ id, delta });
  }
  state.eatenCycle = meal.cycle;
  state.draft = null;
  if (state.tutorial === 'cook') state.tutorial = 'done';
  return { ...meal, bonus, gains };
}
/** Apply once to this battle's private definitions, leaving expedition growth untouched. */
export function applyDiningToBattle(library, battle, partyIds, consume = true) {
  const dining = diningState(library);
  for (const [index, id] of partyIds.entries()) {
    const pending = dining.pending[id];
    const unitId = Object.keys(battle.heroDefinitions)[index];
    const unit = battle.units[unitId];
    if (!pending || !unit || unit.hp <= 0 || battle.heroDefinitions[unitId].inactive) continue;
    const bonus = pending.bonus || {};
    const definition = battle.heroDefinitions[unitId];
    const pctDelta = (base, pct) => (pct > 0 ? Math.max(1, Math.round((base * pct) / 100)) : 0);
    const attackGain =
      (Number(bonus.attack) || 0) + pctDelta(definition.attack, Number(bonus.attackPercent) || 0);
    const hpGain = (Number(bonus.hp) || 0) + pctDelta(unit.maxHp, Number(bonus.hpPercent) || 0);
    const mpGain = (Number(bonus.mp) || 0) + pctDelta(unit.maxMp, Number(bonus.mpPercent) || 0);
    const shieldGain =
      (Number(bonus.shield) || 0) + pctDelta(unit.maxHp, Number(bonus.shieldPercent) || 0);
    const flatSkill = Number(bonus.skillDamage) || 0;
    const pctSkill = Number(bonus.skillDamagePercent) || 0;
    const skillDeltas = [];
    definition.attack += attackGain;
    for (const [sIdx, skill] of (definition.skills || []).entries()) {
      for (const [eIdx, effect] of (skill.effects || []).entries()) {
        if (effect.type !== 'damage') continue;
        const delta = flatSkill + pctDelta(effect.value, pctSkill);
        if (delta) {
          effect.value += delta;
          skillDeltas.push([sIdx, eIdx, delta]);
        }
      }
    }
    definition.hp += hpGain;
    definition.mp += mpGain;
    unit.maxHp += hpGain;
    unit.maxMp += mpGain;
    unit.hp += hpGain;
    unit.mp += mpGain;
    unit.block += shieldGain;
    unit.mealBonus = {
      ...structuredClone(pending),
      applied: { hp: hpGain, mp: mpGain, attack: attackGain, skillDeltas },
    };
    if (consume) delete dining.pending[id];
  }
}
export function consumeDiningForBattle(library, battle, partyIds) {
  const dining = diningState(library);
  for (const [index, id] of partyIds.entries()) {
    const unit = battle.units[Object.keys(battle.heroDefinitions)[index]];
    if (unit?.mealBonus) delete dining.pending[id];
  }
}
/** Strip only dining's temporary contribution before inheritance; keep all real combat losses. */
export function withoutDiningBonus(battle) {
  if (!battle || !Object.values(battle.units).some((unit) => unit.mealBonus)) return battle;
  const copy = structuredClone(battle);
  for (const unit of Object.values(copy.units)) {
    if (!unit.mealBonus) continue;
    const applied = unit.mealBonus.applied;
    const bonus = unit.mealBonus.bonus || {};
    const definition = copy.heroDefinitions[unit.id];
    const hp = applied ? applied.hp : Number(bonus.hp) || 0;
    const mp = applied ? applied.mp : Number(bonus.mp) || 0;
    const attack = applied ? applied.attack : Number(bonus.attack) || 0;
    if (definition) {
      definition.hp -= hp;
      definition.mp -= mp;
      definition.attack -= attack;
      if (applied?.skillDeltas) {
        for (const [sIdx, eIdx, delta] of applied.skillDeltas) {
          const eff = definition.skills?.[sIdx]?.effects?.[eIdx];
          if (eff) eff.value -= delta;
        }
      } else {
        for (const skill of definition.skills || [])
          for (const effect of skill.effects || [])
            if (effect.type === 'damage') effect.value -= Number(bonus.skillDamage) || 0;
      }
    }
    unit.maxHp -= hp;
    unit.maxMp -= mp;
    unit.hp = Math.min(unit.hp, unit.maxHp);
    unit.mp = Math.min(unit.mp, unit.maxMp);
    delete unit.mealBonus;
  }
  return copy;
}
