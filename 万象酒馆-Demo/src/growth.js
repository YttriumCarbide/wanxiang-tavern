import { applyEquipment } from './equipment.js';
/** Persistent growth is separate from authored combat definitions and battle snapshots. */
export const RARITIES = Object.freeze({
  common: {
    name: '普通',
    weight: 55,
    rates: { hp: 65, mp: 50, attack: 30, skillDamage: 30, limit: 2, manaCost: 15 },
  },
  rare: {
    name: '稀有',
    weight: 30,
    rates: { hp: 80, mp: 65, attack: 40, skillDamage: 40, limit: 3, manaCost: 20 },
  },
  epic: {
    name: '史诗',
    weight: 12,
    rates: { hp: 95, mp: 80, attack: 50, skillDamage: 50, limit: 4, manaCost: 25 },
  },
  legendary: {
    name: '传说',
    weight: 3,
    rates: { hp: 100, mp: 95, attack: 60, skillDamage: 60, limit: 5, manaCost: 30 },
  },
});
export const GROWTH_LABELS = Object.freeze({
  hp: '生命',
  mp: '法力',
  attack: '普攻伤害',
  skillDamage: '技能伤害',
  limit: '行动次数',
  manaCost: '技能耗蓝降低',
});
function seedOf(text) {
  let seed = 2166136261;
  for (const char of String(text)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}
export function rarityFor(id) {
  let roll = seedOf(id) % 100;
  for (const [id, tier] of Object.entries(RARITIES)) {
    roll -= tier.weight;
    if (roll < 0) return id;
  }
  return 'common';
}
export function restoreGrowth(value, id) {
  const bonus = Object.fromEntries(
    Object.keys(GROWTH_LABELS).map((key) => [
      key,
      Number.isSafeInteger(value?.bonus?.[key]) ? Math.max(0, Math.min(999, value.bonus[key])) : 0,
    ]),
  );
  return {
    level: Number.isSafeInteger(value?.level) ? Math.max(1, Math.min(99, value.level)) : 1,
    xp: Number.isSafeInteger(value?.xp) ? Math.max(0, Math.min(1000000, value.xp)) : 0,
    rarity: RARITIES[value?.rarity] ? value.rarity : rarityFor(id),
    seed: Number.isInteger(value?.seed) ? value.seed >>> 0 : seedOf(id),
    bonus,
  };
}
export function xpToNext(level) {
  return 40 + (level - 1) * 20;
}
export function grownCombat(member) {
  const growth = restoreGrowth(member.growth, member.id);
  const combat = structuredClone(member.combat);
  const b = growth.bonus;
  combat.hp += b.hp;
  combat.mp += b.mp;
  combat.attack += b.attack;
  combat.limit = Math.min(5, combat.limit + b.limit);
  for (const skill of combat.skills) {
    if (skill.passive) continue;
    skill.mp = Math.max(0, skill.mp - b.manaCost);
    if (b.skillDamage || b.manaCost)
      skill.text += '（成长：技能伤害+' + b.skillDamage + '，耗蓝降低' + b.manaCost + '）';
    for (const effect of skill.effects) if (effect.type === 'damage') effect.value += b.skillDamage;
  }
  return combat;
}
export function gainExperience(member, amount) {
  const growth = restoreGrowth(member.growth, member.id);
  const levels = [];
  growth.xp += amount;
  function random() {
    growth.seed = (Math.imul(growth.seed, 1664525) + 1013904223) >>> 0;
    return growth.seed / 4294967296;
  }
  while (growth.level < 99 && growth.xp >= xpToNext(growth.level)) {
    growth.xp -= xpToNext(growth.level);
    growth.level++;
    const gains = {};
    for (const [key, rate] of Object.entries(RARITIES[growth.rarity].rates)) {
      if (random() * 100 >= rate) continue;
      const n = key === 'hp' ? 2 : 1;
      if (key === 'limit' && member.combat.limit + growth.bonus.limit >= 5) continue;
      if (
        key === 'manaCost' &&
        !member.combat.skills.some((s) => !s.passive && s.mp > growth.bonus.manaCost)
      )
        continue;
      growth.bonus[key] += n;
      gains[key] = n;
    }
    levels.push({ level: growth.level, gains });
  }
  if (growth.level === 99) growth.xp = 0;
  member.growth = growth;
  return { id: member.id, name: member.setting.name, amount, level: growth.level, levels };
}
/** Enemy death claims are awarded on accepted playback, including a subsequently lost battle. */
export function claimKillExperience(library, expedition, state, result) {
  library.experienceClaims ||= [];
  const gains = [];
  for (const dead of result.deaths || []) {
    if (state.units[dead.id]?.side !== 'enemy') continue;
    const claim = expedition.id + ':' + state.encounter + ':' + dead.id;
    if (library.experienceClaims.includes(claim)) continue;
    library.experienceClaims.push(claim);
    const boss = expedition.boss === dead.id;
    const amount = boss ? 60 : 12;
    for (const id of expedition.partyIds || library.party.filter(Boolean)) {
      const member = library.characters.find((m) => m.id === id);
      if (member) gains.push(gainExperience(member, amount));
    }
  }
  library.experienceClaims = library.experienceClaims.slice(-4000);
  return gains;
}
export function claimCompletionExperience(library, expedition) {
  library.experienceClaims ||= [];
  const claim = expedition.id + ':complete';
  if (library.experienceClaims.includes(claim)) return [];
  library.experienceClaims.push(claim);
  return (expedition.partyIds || library.party.filter(Boolean))
    .map((id) => library.characters.find((m) => m.id === id))
    .filter(Boolean)
    .map((member) => gainExperience(member, 40));
}
export function generationNumbers(input) {
  const rarity = RARITIES[input.rarity] ? input.rarity : rarityFor(input.rollId || input.brief);
  const index = Object.keys(RARITIES).indexOf(rarity);
  return {
    rarity,
    name: RARITIES[rarity].name,
    probabilities: Object.fromEntries(Object.entries(RARITIES).map(([id, t]) => [id, t.weight])),
    hp: [30 + index * 8, 44 + index * 10],
    mp: [10 + index * 3, 16 + index * 6],
    attack: [4 + index, 6 + index * 2],
    skillDamage: [5 + index * 2, 10 + index * 4],
    limit: input.purpose === 'protagonist' ? 2 : index >= 2 ? '1或2，按强度分配' : '1',
    skillMana: [2, Math.min(10, 4 + index * 2)],
    growthRates: RARITIES[rarity].rates,
    guidance:
      '仅分配数据层基础数值，不按原设境界直接无限放大。主动技能伤害与耗蓝匹配；群体技能使用区间低值。普通攻击与技能伤害独立。主角行动次数必须为2。等级初始1，升级时六项属性独立按成长率判定；技能耗蓝成长是减消耗，最多降至0。',
  };
}

export function applyEncounterGrowth(expedition, members) {
  const carried = expedition.carried;
  if (!carried) return;
  for (const [index, slot] of Object.keys(expedition.heroDefinitions).entries()) {
    const member = members.find((entry) => entry.id === expedition.partyIds?.[index]);
    const unit = carried.units[slot];
    const old = carried.heroDefinitions[slot];
    if (!member || !unit || !old) continue;
    const combat = applyEquipment(grownCombat(member), old.equipment || []);
    const hp = combat.hp - old.hp;
    const mp = combat.mp - old.mp;
    unit.maxHp += hp;
    if (unit.hp > 0) unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(0, hp));
    unit.maxMp += mp;
    unit.mp = Math.min(unit.maxMp, unit.mp + Math.max(0, mp));
    carried.heroDefinitions[slot] = {
      ...combat,
      id: slot,
      ...(old.customPortrait ? { customPortrait: old.customPortrait } : {}),
    };
  }
}
