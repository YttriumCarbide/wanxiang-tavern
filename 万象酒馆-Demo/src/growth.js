import { applyEquipment } from './equipment.js';
import { finalPassiveText, finalSkillText } from './skill-text.js';
import { characterGenerationPlan } from './character-generation.js';
import { applyEmblemStats } from './emblems.js';
import { applyCompanionModifiers } from './companion-mechanics.js';
import { combatScale, scaleLevelEffects } from './combat-scale.js';
/** Persistent growth is separate from authored combat definitions and battle snapshots. */
export const RARITIES = Object.freeze({
  common: {
    name: '普通',
    weight: 55,
    rates: { hp: 46, mp: 30, attack: 16, skillDamage: 4, limit: 1, manaCost: 3 },
  },
  rare: {
    name: '稀有',
    weight: 30,
    rates: { hp: 44, mp: 30, attack: 17, skillDamage: 5, limit: 1, manaCost: 3 },
  },
  epic: {
    name: '史诗',
    weight: 12,
    rates: { hp: 43, mp: 29, attack: 18, skillDamage: 5, limit: 2, manaCost: 3 },
  },
  legendary: {
    name: '传说',
    weight: 3,
    rates: { hp: 42, mp: 28, attack: 19, skillDamage: 6, limit: 2, manaCost: 3 },
  },
});
export const GROWTH_LABELS = Object.freeze({
  hp: '生命',
  mp: '法力',
  attack: '普攻伤害',
  skillDamage: '技能伤害',
  limit: '行动次数',
  manaCost: '技能消耗降低',
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
  const level = Number.isSafeInteger(value?.level) ? Math.max(1, Math.min(99, value.level)) : 1;
  const storedXp = Number.isSafeInteger(value?.xp) ? Math.max(0, Math.min(1000000, value.xp)) : 0;
  const oldThreshold = 240 + (level - 1) * 140 + (level - 1) ** 2 * 20;
  const bonus = Object.fromEntries(
    Object.keys(GROWTH_LABELS).map((key) => [
      key,
      Number.isSafeInteger(value?.bonus?.[key]) ? Math.max(0, Math.min(999, value.bonus[key])) : 0,
    ]),
  );
  return {
    level,
    revision: 2,
    xp: value?.revision === 2 ? storedXp : Math.floor((storedXp / oldThreshold) * xpToNext(level)),
    rarity: RARITIES[value?.rarity] ? value.rarity : rarityFor(id),
    seed: Number.isInteger(value?.seed) ? value.seed >>> 0 : seedOf(id),
    bonus,
  };
}
export function xpToNext(level) {
  return 180 + (level - 1) * 45;
}
/** Replay stable per-skill resource choices so saving and previewing never reroll costs. */
export function grownSkillCosts(skill, reductions, memberId) {
  const costs = { mp: skill.mp || 0, hp: skill.hp || 0 };
  for (let step = 0; step < reductions; step++) {
    const available = ['hp', 'mp'].filter((key) => costs[key] > 3);
    if (!available.length) break;
    const key = available[seedOf(`${memberId}:${skill.id}:cost:${step}`) % available.length];
    costs[key]--;
  }
  return costs;
}
export function grownCombat(member) {
  const growth = restoreGrowth(member.growth, member.id);
  const combat = structuredClone(member.combat);
  combat.level = growth.level;
  const scale = combatScale(growth.level);
  combat.hp = Math.round(combat.hp * scale);
  combat.mp = Math.round(combat.mp * Math.sqrt(scale));
  combat.attack = Math.round(combat.attack * scale);
  combat.limit = Math.min(2, combat.limit + growth.bonus.limit);
  for (const skill of [...combat.skills, combat.entrySkill].filter(Boolean)) {
    if (skill.passive) {
      if (scale === 1) continue;
      if (skill.endHeal) skill.endHeal = Math.max(1, Math.round(skill.endHeal * scale));
      if (skill.rules)
        skill.rules = skill.rules.map((rule) => ({
          ...rule,
          effects: scaleLevelEffects(rule.effects, scale),
        }));
      skill.text = finalPassiveText(skill, combat.mechanicMark?.name);
      continue;
    }
    const costs = grownSkillCosts(skill, growth.bonus.manaCost, member.id);
    if (skill.mp) skill.mp = costs.mp;
    if (skill.hp) skill.hp = Math.round(costs.hp * scale);
    skill.effects = scaleLevelEffects(skill.effects, scale);
    skill.text = finalSkillText(skill, combat.mechanicMark?.name);
  }
  return combat;
}
export function gainExperience(member, amount) {
  const growth = restoreGrowth(member.growth, member.id);
  const levels = [];
  const before = { level: growth.level, xp: growth.xp };
  growth.xp += amount;
  while (growth.level < 99 && growth.xp >= xpToNext(growth.level)) {
    const prior = grownCombat({ ...member, growth });
    growth.xp -= xpToNext(growth.level);
    growth.level++;
    const next = grownCombat({ ...member, growth });
    const gains = Object.fromEntries(
      ['hp', 'mp', 'attack']
        .filter((key) => next[key] > prior[key])
        .map((key) => [key, next[key] - prior[key]]),
    );
    levels.push({ level: growth.level, gains });
  }
  if (growth.level === 99) growth.xp = 0;
  member.growth = growth;
  return {
    id: member.id,
    name: member.setting.name,
    amount,
    before,
    after: { level: growth.level, xp: growth.xp },
    level: growth.level,
    levels,
  };
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
    const amount = Math.round((boss ? 60 : 12) * (1 + ((state.level || 1) - 1) / 4));
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
    .map((member) =>
      gainExperience(member, Math.round(40 * (1 + ((expedition.carried?.level || 1) - 1) / 4))),
    );
}
export function generationNumbers(input) {
  const plan = characterGenerationPlan(input);
  const rarity = plan.rarity;
  return {
    ...plan,
    rarity,
    name: RARITIES[rarity].name,
    probabilities: Object.fromEntries(Object.entries(RARITIES).map(([id, t]) => [id, t.weight])),
    hp: plan.profiles.balanced.hp,
    mp: plan.profiles.balanced.sp,
    attack: plan.fixed.attack,
    limit: plan.fixed.limit,
    growth: '生命、普攻和技能威力按统一等级曲线成长，法力按较缓的独立曲线成长。',
    guidance:
      plan.guidance +
      '所有参考均为1级无装备基础值，不含升级、装备、敏捷或结合。初始等级1，成长由代码处理。',
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
    const combat = applyCompanionModifiers(
      applyEmblemStats(
        applyEquipment(grownCombat(member), old.equipment || []),
        member.emblemId || old.emblemId,
      ),
      carried.expeditionModifiers?.[slot],
    );
    const hp = combat.hp - old.hp;
    const mp = combat.mp - old.mp;
    unit.maxHp += hp;
    if (unit.hp > 0) unit.hp = Math.min(unit.maxHp, unit.hp + Math.max(0, hp));
    unit.maxMp += mp;
    unit.mp = Math.min(unit.maxMp, unit.mp + Math.max(0, mp));
    carried.heroDefinitions[slot] = {
      ...combat,
      id: slot,
      ...(old.emblemId ? { emblemId: old.emblemId } : {}),
      ...(old.customPortrait ? { customPortrait: old.customPortrait } : {}),
    };
  }
}
