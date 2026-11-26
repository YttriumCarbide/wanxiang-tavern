import { applyEquipment } from './equipment-combat.js';
import { finalPassiveText, finalSkillText } from './skill-text.js';
import { characterGenerationPlan } from './character-generation.js';
import { applyEmblemStats } from './emblems.js';
import { applyCompanionModifiers } from './companion-mechanics.js';
import { combatRank } from './combat-scale.js';
import { equippedUniversalSkills, isUniversalSkill } from './learnable-skills.js';
import { applyCharacterModifier } from './game-modifier.js';
import { HEROES } from './data.js';
import { defaultProtagonist } from './content/qingyuan.js';
import { battleResourceLimits } from './engine.js';

// Revision 11 replaces percentage multipliers with Fire Emblem pure-integer growth,
// kit-driven rates, per-battle starting shield, tier promotions, and rare jackpots.
export const GROWTH_REVISION = 11;
const GROWTH_ROLL_SALT = 11;
const SKILL_TARGETS = ['skill1', 'skill2'];
const SLOT_TARGETS = ['entrySkill', 'skill1', 'skill2'];
const CORE_STAT_TARGETS = [
  'hp',
  'startingShield',
  'mp',
  'attack',
  'entrySkill',
  'skill1',
  'skill2',
];
const DIRECT_VALUE_TYPES = new Set(['damage', 'heal', 'selfHeal', 'shield', 'selfShield']);
const SP_MIN = 3;
const SP_DISCOUNT_MAX = 2;
const LIMIT_GROWTH_MAX = 2;
const ROLL_BOUNDS = Object.freeze({
  hp: [1, 80],
  startingShield: [1, 20],
  mp: [1, 20],
  attack: [1, 20],
  entrySkill: [1, 20],
  skill1: [1, 20],
  skill2: [1, 20],
  skill1Sp: [1, 2],
  skill2Sp: [1, 2],
  limit: [1, 2],
});

/** Tier promotions at Lv.20/40/60/80/90 grant flat spikes and enforce anti-screw base floors. */
export const PROMOTION_TIERS = Object.freeze({
  20: Object.freeze({
    rank: '精锐',
    hp: 14,
    startingShield: 3,
    mp: 3,
    attack: 2,
    activeSlot: 2,
    floor: Object.freeze({ hp: 32, startingShield: 4, mp: 6, attack: 4 }),
  }),
  40: Object.freeze({
    rank: '超凡',
    hp: 20,
    startingShield: 4,
    mp: 4,
    attack: 3,
    activeSlot: 3,
    floor: Object.freeze({ hp: 82, startingShield: 10, mp: 16, attack: 10 }),
  }),
  60: Object.freeze({
    rank: '史诗',
    hp: 26,
    startingShield: 5,
    mp: 5,
    attack: 4,
    activeSlot: 3,
    floor: Object.freeze({ hp: 142, startingShield: 18, mp: 28, attack: 18 }),
  }),
  80: Object.freeze({
    rank: '传说',
    hp: 32,
    startingShield: 6,
    mp: 6,
    attack: 5,
    activeSlot: 4,
    floor: Object.freeze({ hp: 212, startingShield: 28, mp: 42, attack: 28 }),
  }),
  90: Object.freeze({
    rank: '神话',
    hp: 40,
    startingShield: 8,
    mp: 8,
    attack: 6,
    activeSlot: 5,
    floor: Object.freeze({ hp: 266, startingShield: 36, mp: 54, attack: 36 }),
  }),
});

/** Persistent growth is separate from authored combat definitions and battle snapshots. */
export const RARITIES = Object.freeze({
  common: { name: '普通', weight: 55, rateBonus: 0, tier: 0 },
  rare: { name: '稀有', weight: 30, rateBonus: 0.03, tier: 1 },
  epic: { name: '史诗', weight: 12, rateBonus: 0.06, tier: 2 },
  legendary: { name: '传说', weight: 3, rateBonus: 0.09, tier: 3 },
});

export const GROWTH_LABELS = Object.freeze({
  hp: '生命',
  startingShield: '开场护盾',
  mp: '法力',
  attack: '攻击力',
  entrySkill: '入场技威力',
  skill1: '技能1威力',
  skill2: '技能2威力',
  skill1Sp: '技能1消耗',
  skill2Sp: '技能2消耗',
  limit: '行动次数',
  // Previously awarded levels can still be displayed in a saved settlement.
  skillDamage: '技能伤害',
  manaCost: '技能消耗降低',
});

export function growthGainText(key, value) {
  const label = GROWTH_LABELS[key] || key;
  if (key === 'skill1Sp' || key === 'skill2Sp') return `${label} −${value} SP`;
  return `${label} +${value}`;
}

function seedOf(text) {
  let seed = 2166136261;
  for (const char of String(text)) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  return seed >>> 0;
}

export function rarityFor(id) {
  let roll = seedOf(id) % 100;
  for (const [key, tier] of Object.entries(RARITIES)) {
    roll -= tier.weight;
    if (roll < 0) return key;
  }
  return 'common';
}

function growthRoll(seed, level, target, kind) {
  return seedOf(`${seed}:growth:${GROWTH_ROLL_SALT}:${level}:${target}:${kind}`) / 4294967296;
}

function clampRate(value) {
  return Math.max(0.06, Math.min(0.95, Math.round(value * 1000) / 1000));
}

function isDirectNumericEffect(effect) {
  return Boolean(
    effect && !effect.flat && DIRECT_VALUE_TYPES.has(effect.type) && Number(effect.value) > 0,
  );
}

function hasNumericMove(skill) {
  return Boolean(
    skill &&
    !skill.passive &&
    Array.isArray(skill.effects) &&
    skill.effects.some(isDirectNumericEffect),
  );
}

function moveNumericWeight(skill) {
  if (!skill || skill.passive || !Array.isArray(skill.effects)) return 0;
  return skill.effects.reduce(
    (sum, effect) => sum + (isDirectNumericEffect(effect) ? Number(effect.value) : 0),
    0,
  );
}

function nativeSkills(combat) {
  return (combat?.skills || []).filter((skill) => !isUniversalSkill(skill) && !skill.borrowedFrom);
}

function clamp01Jitter(seed, key) {
  return (seedOf(`${seed}:rate:${key}`) / 4294967296 - 0.5) * 0.08;
}

/**
 * Derive personal Fire Emblem growth rates solely from the character's combat blueprint
 * and rarity/seed, completely independent of exploration dcAttrs.
 */
export function deriveGrowthRates(combat, rarity = 'common', seed = 0) {
  const tierMeta = RARITIES[rarity] || RARITIES.common;
  const skills = nativeSkills(combat);
  const entry = combat?.entrySkill;
  const [skill1, skill2] = skills;
  const hasCombat = Boolean(combat);
  const baseHp = combat?.hp || 40;
  const baseMp = combat?.mp || 20;
  const baseAttack = combat?.attack || 8;
  const passiveCount = skills.filter((skill) => skill?.passive).length;
  const maxSkillSp = Math.max(0, ...skills.map((skill) => skill?.mp || 0));
  const hasShieldMove = [entry, ...skills].some(
    (skill) =>
      !skill?.passive &&
      skill?.effects?.some((effect) => ['shield', 'selfShield'].includes(effect.type)),
  );
  const entryWeight = moveNumericWeight(entry);
  const s1Weight = moveNumericWeight(skill1);
  const s2Weight = moveNumericWeight(skill2);

  const rates = {
    hpStep: baseHp >= 46 ? 3 : 2,
    hp: 0.78 + (baseHp >= 46 ? 0.1 : baseHp <= 34 ? -0.06 : 0),
    startingShield: 0.26 + (baseHp >= 48 || hasShieldMove ? 0.16 : 0),
    mp: 0.38 + (baseMp >= 24 || maxSkillSp >= 8 ? 0.16 : 0),
    attack: 0.24 + (baseAttack >= 9 ? 0.1 : 0) + passiveCount * 0.08,
    entrySkill: !hasCombat
      ? 0.36
      : !hasNumericMove(entry)
        ? 0
        : 0.34 + (entryWeight >= 12 ? 0.16 : entryWeight >= 8 ? 0.08 : 0),
    skill1: !hasCombat
      ? 0.38
      : !hasNumericMove(skill1)
        ? 0
        : 0.36 + (s1Weight >= 14 || (skill1?.mp || 0) >= 7 ? 0.14 : s1Weight >= 9 ? 0.06 : 0),
    skill2: !hasCombat
      ? 0.38
      : !hasNumericMove(skill2)
        ? 0
        : 0.36 + (s2Weight >= 14 || (skill2?.mp || 0) >= 7 ? 0.14 : s2Weight >= 9 ? 0.06 : 0),
  };

  // Reallocate dead-slot probability budget to active kit pillars so passives/buffs never waste rolls.
  let deadSlots = 0;
  for (const slot of SLOT_TARGETS) if (rates[slot] === 0) deadSlots += 1;
  if (deadSlots > 0) {
    rates.attack += deadSlots * 0.06;
    rates.startingShield += deadSlots * 0.05;
    for (const slot of SLOT_TARGETS) if (rates[slot] > 0) rates[slot] += deadSlots * 0.05;
  }

  for (const key of CORE_STAT_TARGETS) {
    if (rates[key] > 0) {
      rates[key] = clampRate(rates[key] + tierMeta.rateBonus + clamp01Jitter(seed, key));
    }
  }

  rates.skill1Sp =
    hasCombat && (!skill1 || skill1.passive || (skill1.mp || 0) <= SP_MIN)
      ? 0
      : clampRate(0.09 + ((skill1?.mp || 0) >= 8 ? 0.04 : 0) + tierMeta.tier * 0.015);
  rates.skill2Sp =
    hasCombat && (!skill2 || skill2.passive || (skill2.mp || 0) <= SP_MIN)
      ? 0
      : clampRate(0.09 + ((skill2?.mp || 0) >= 8 ? 0.04 : 0) + tierMeta.tier * 0.015);
  rates.limit = clampRate(0.018 + tierMeta.tier * 0.005);
  return rates;
}

function rollLevel(seed, rarity, level, combat = null, priorTotals = {}) {
  const rates = deriveGrowthRates(combat, rarity, seed);
  const skills = nativeSkills(combat);
  const roll = {};
  let hits = 0;

  for (const target of CORE_STAT_TARGETS) {
    const rate = rates[target];
    if (!(rate > 0)) continue;
    if (growthRoll(seed, level, target, 'roll') < rate) {
      roll[target] = target === 'hp' ? rates.hpStep : 1;
      hits += 1;
    }
  }

  // Fire Emblem anti-blank guarantee: at least 2 active stats tick on every level-up.
  if (hits < 2) {
    const fallbackPool = CORE_STAT_TARGETS.filter(
      (target) => !roll[target] && rates[target] > 0,
    ).sort(
      (a, b) =>
        rates[b] - rates[a] ||
        growthRoll(seed, level, a, 'tie') - growthRoll(seed, level, b, 'tie'),
    );
    for (const target of fallbackPool) {
      if (hits >= 2) break;
      roll[target] = target === 'hp' ? rates.hpStep : 1;
      hits += 1;
    }
  }

  // Rare jackpots: per-skill SP discounts and action-limit point.
  for (const [index, target] of SKILL_TARGETS.entries()) {
    const costKey = `${target}Sp`;
    const rate = rates[costKey];
    const used = priorTotals[costKey] || 0;
    const baseMp = skills[index]?.mp;
    const canDiscount =
      rate > 0 && used < SP_DISCOUNT_MAX && (!combat || (baseMp != null && baseMp - used > SP_MIN));
    if (canDiscount && growthRoll(seed, level, costKey, 'roll') < rate) {
      roll[costKey] = 1;
    }
  }

  const limitGrown = priorTotals.limit || 0;
  const currentLimit = (combat?.limit || 1) + limitGrown;
  if (
    limitGrown < LIMIT_GROWTH_MAX &&
    currentLimit < 6 &&
    growthRoll(seed, level, 'limit', 'roll') < rates.limit
  ) {
    roll.limit = 1;
  }

  // Tier promotions grant large flat increases + enforce anti-screw base floors.
  const tier = PROMOTION_TIERS[level];
  if (tier) {
    for (const key of ['hp', 'startingShield', 'mp', 'attack']) {
      roll[key] = (roll[key] || 0) + tier[key];
    }
    for (const slot of SLOT_TARGETS) {
      if (rates[slot] > 0) roll[slot] = (roll[slot] || 0) + tier.activeSlot;
    }
    for (const [key, minTotal] of Object.entries(tier.floor)) {
      const total = (priorTotals[key] || 0) + (roll[key] || 0);
      if (total < minTotal) roll[key] = (roll[key] || 0) + (minTotal - total);
    }
  }

  return roll;
}

function readRoll(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
  const roll = {};
  for (const [key, [min, max]] of Object.entries(ROLL_BOUNDS)) {
    const val = saved[key];
    if (Number.isInteger(val) && val >= min && val <= max) roll[key] = val;
  }
  return Object.keys(roll).length || Object.keys(saved).length === 0 ? roll : null;
}

function addRollToTotals(totals, roll) {
  for (const [key, value] of Object.entries(roll || {})) {
    totals[key] = (totals[key] || 0) + value;
  }
}

export function restoreGrowth(value, id, combat = null) {
  const level = Number.isSafeInteger(value?.level) ? Math.max(1, Math.min(99, value.level)) : 1;
  const storedXp = Number.isSafeInteger(value?.xp) ? Math.max(0, Math.min(1000000, value.xp)) : 0;
  const revision = value?.revision;
  const oldThreshold = 240 + (level - 1) * 140 + (level - 1) ** 2 * 20;
  const rarity = Object.hasOwn(RARITIES, value?.rarity) ? value.rarity : rarityFor(id);
  const seed = Number.isInteger(value?.seed) ? value.seed >>> 0 : seedOf(id);
  const sameRevision = revision === GROWTH_REVISION && Array.isArray(value.rolls);
  const savedRolls = sameRevision ? value.rolls : [];
  const totals = {};
  const rolls = [];
  for (let index = 0; index < level - 1; index += 1) {
    const existing = sameRevision ? readRoll(savedRolls[index]) : null;
    const roll = existing || rollLevel(seed, rarity, index + 2, combat, totals);
    addRollToTotals(totals, roll);
    rolls.push(roll);
  }
  return {
    level,
    revision: GROWTH_REVISION,
    xp:
      revision === 2 ||
      revision === 3 ||
      (Number.isInteger(revision) && revision >= 4 && revision <= GROWTH_REVISION)
        ? storedXp
        : Math.floor((storedXp / oldThreshold) * xpToNext(level)),
    rarity,
    seed,
    rolls,
  };
}

export function xpToNext(level) {
  return 180 + (level - 1) * 45;
}

function growthTotals(rolls) {
  const totals = {};
  for (const roll of rolls) addRollToTotals(totals, roll);
  return totals;
}

function baseEntrySkill(member) {
  if (member.setting?.entrySkill) {
    return {
      id: `entry-${member.id}`,
      name: member.setting.entrySkill.name,
      target: 'opposite',
      effects: [{ type: 'damage', value: 8 }],
    };
  }
  if (member.id === 'character-qingyuan' || member.setting?.name === '青缘')
    return defaultProtagonist().combat.entrySkill;
  return (HEROES.find((hero) => hero.id === member.archetype) || HEROES[0]).entrySkill;
}

function addFlatEffects(effects, bonus, damageOnly = false) {
  if (!effects?.length || !bonus) return effects;
  return effects.map((effect) => {
    if (effect.flat) return effect;
    if (damageOnly) {
      if (effect.type !== 'damage') return effect;
      return { ...effect, value: effect.value + bonus };
    }
    if (!DIRECT_VALUE_TYPES.has(effect.type) || !(Number(effect.value) > 0)) return effect;
    return { ...effect, value: effect.value + bonus };
  });
}

function applyMoveGrowth(skill, flatBonus, spDiscount, markName) {
  if (skill.passive) {
    skill.text = finalPassiveText(skill, markName);
    return;
  }
  if (skill.mp > SP_MIN && spDiscount) {
    skill.mp = Math.max(SP_MIN, skill.mp - spDiscount);
  }
  if (skill.effects && flatBonus) {
    skill.effects = addFlatEffects(skill.effects, flatBonus, false);
  }
  skill.text = finalSkillText(skill, markName);
}

function applySharedAttackGrowth(skill, attackBonus, markName) {
  if (!attackBonus || skill.passive) return;
  if (skill.effects) {
    skill.effects = addFlatEffects(skill.effects, attackBonus, true);
  }
  skill.text = finalSkillText(skill, markName);
}

function effectiveGrowth(member) {
  const growth = restoreGrowth(member.growth, member.id, member.combat);
  const level = member.modifierValues?.level;
  return level && level !== growth.level
    ? restoreGrowth({ ...growth, level }, member.id, member.combat)
    : growth;
}

export function grownCombat(member, frozenSkillIds = null) {
  const growth = effectiveGrowth(member);
  const totals = growthTotals(growth.rolls);
  const combat = structuredClone(member.combat);
  applyCharacterModifier(member, combat);
  combat.level = growth.level;
  combat.growthRevision = GROWTH_REVISION;
  combat.hp = Math.round(combat.hp) + (totals.hp || 0);
  combat.mp = Math.round(combat.mp) + (totals.mp || 0);
  combat.startingShield = Math.max(0, (combat.startingShield || 0) + (totals.startingShield || 0));
  combat.attackBeforeGrowth = combat.attack;
  combat.attack = Math.round(combat.attack) + (totals.attack || 0);
  combat.limit = Math.min(6, (combat.limit || 1) + Math.min(LIMIT_GROWTH_MAX, totals.limit || 0));

  const markName = combat.mechanicMark?.name;
  const baseEntry = combat.entrySkill || baseEntrySkill(member);
  if (baseEntry) {
    combat.entrySkill = structuredClone(baseEntry);
    applyMoveGrowth(combat.entrySkill, totals.entrySkill || 0, 0, markName);
  }
  const skills = nativeSkills(combat);
  for (const [index, target] of SKILL_TARGETS.entries()) {
    const skill = frozenSkillIds
      ? skills.find((candidate) => candidate.id === frozenSkillIds[index])
      : skills[index];
    if (skill) applyMoveGrowth(skill, totals[target] || 0, totals[`${target}Sp`] || 0, markName);
  }
  for (const skill of equippedUniversalSkills(member)) {
    if (combat.skills.some((existing) => existing.id === skill.id)) continue;
    skill.text = finalSkillText(skill, markName);
    combat.skills.push(skill);
  }
  const attackBonus = totals.attack || 0;
  // Shared attack growth raises basic attack, entry skills, native skills, and universal techniques by flat integer points.
  if (combat.entrySkill) applySharedAttackGrowth(combat.entrySkill, attackBonus, markName);
  for (const skill of combat.skills) applySharedAttackGrowth(skill, attackBonus, markName);
  return combat;
}

export function compileCharacterCombat(member, equipment, frozenSkillIds = null) {
  return applyEmblemStats(
    applyEquipment(grownCombat(member, frozenSkillIds), equipment),
    member.emblemId,
  );
}

function primaryDirectValue(skill) {
  const effect = skill?.effects?.find(isDirectNumericEffect);
  return effect ? Number(effect.value) : null;
}

function levelGains(prior, next, roll) {
  const gains = {};
  if (next.hp > prior.hp) gains.hp = next.hp - prior.hp;
  if ((next.startingShield || 0) > (prior.startingShield || 0)) {
    gains.startingShield = (next.startingShield || 0) - (prior.startingShield || 0);
  }
  if (next.mp > prior.mp) gains.mp = next.mp - prior.mp;
  if (next.attack > prior.attack) gains.attack = next.attack - prior.attack;
  if (next.limit > prior.limit) gains.limit = next.limit - prior.limit;

  const beforeSkills = nativeSkills(prior);
  const afterSkills = nativeSkills(next);
  const moves = [
    ['entrySkill', prior.entrySkill, next.entrySkill],
    ...SKILL_TARGETS.map((target, index) => [target, beforeSkills[index], afterSkills[index]]),
  ];
  for (const [target, before, after] of moves) {
    if (!before || !after || isUniversalSkill(after)) continue;
    if (roll[target] && hasNumericMove(after)) gains[target] = roll[target];
    const costKey = `${target}Sp`;
    if (roll[costKey] && before.mp > after.mp) gains[costKey] = before.mp - after.mp;
  }
  return gains;
}

function levelRows(prior, next, roll) {
  const rows = [
    { key: 'hp', label: '生命', before: prior.hp, after: next.hp, delta: next.hp - prior.hp },
    {
      key: 'startingShield',
      label: '开场护盾',
      before: prior.startingShield || 0,
      after: next.startingShield || 0,
      delta: (next.startingShield || 0) - (prior.startingShield || 0),
    },
    { key: 'mp', label: '法力', before: prior.mp, after: next.mp, delta: next.mp - prior.mp },
    {
      key: 'attack',
      label: '攻击力',
      before: prior.attack,
      after: next.attack,
      delta: next.attack - prior.attack,
    },
  ];
  const beforeSkills = nativeSkills(prior);
  const afterSkills = nativeSkills(next);
  const slots = [
    ['entrySkill', '入场技', prior.entrySkill, next.entrySkill],
    ...SKILL_TARGETS.map((target, index) => [
      target,
      index === 0 ? '技能1' : '技能2',
      beforeSkills[index],
      afterSkills[index],
    ]),
  ];
  for (const [target, shortLabel, before, after] of slots) {
    if (!after || !hasNumericMove(after)) continue;
    const afterVal = primaryDirectValue(after);
    const beforeVal = primaryDirectValue(before) ?? afterVal;
    rows.push({
      key: target,
      label: `${shortLabel}威力`,
      before: beforeVal,
      after: afterVal,
      delta: roll[target] || 0,
    });
  }
  for (const [index, target] of SKILL_TARGETS.entries()) {
    const costKey = `${target}Sp`;
    if (roll[costKey] && beforeSkills[index] && afterSkills[index]) {
      rows.push({
        key: costKey,
        label: index === 0 ? '技能1消耗' : '技能2消耗',
        before: beforeSkills[index].mp,
        after: afterSkills[index].mp,
        delta: beforeSkills[index].mp - afterSkills[index].mp,
      });
    }
  }
  if (next.limit > prior.limit) {
    rows.push({
      key: 'limit',
      label: '行动次数',
      before: prior.limit,
      after: next.limit,
      delta: next.limit - prior.limit,
    });
  }
  return rows;
}

export function gainExperience(member, amount) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError('Experience amount must be a finite nonnegative integer');
  }
  const growth = restoreGrowth(member.growth, member.id, member.combat);
  const totals = growthTotals(growth.rolls);
  const levels = [];
  const before = { level: growth.level, xp: growth.xp };
  growth.xp += amount;
  let prior;
  while (growth.level < 99 && growth.xp >= xpToNext(growth.level)) {
    prior ||= grownCombat({ ...member, growth });
    growth.xp -= xpToNext(growth.level);
    growth.level++;
    const roll = rollLevel(growth.seed, growth.rarity, growth.level, member.combat, totals);
    addRollToTotals(totals, roll);
    growth.rolls.push(roll);
    const next = grownCombat({ ...member, growth });
    levels.push({
      level: growth.level,
      previousLevel: growth.level - 1,
      rank: combatRank(growth.level),
      promoted: Object.hasOwn(PROMOTION_TIERS, growth.level),
      gains: levelGains(prior, next, roll),
      rows: levelRows(prior, next, roll),
    });
    prior = next;
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
    growth:
      '采用火焰纹章式纯整数跳点成长，由实战招式构筑决定各项成长偏向，与六维探索属性解耦。升级独立抽取生命、开场护盾、法力、全域攻击力、入场技/技能1/技能2威力及低概率SP减耗与行动次数，Lv.20/40/60/80/90触发阶位突破并保底补齐基准线。',
    guidance:
      plan.guidance +
      '所有参考均为1级无装备基础值，不含升级、装备、开场护盾或结合。初始等级1，成长由代码处理。',
  };
}

function sameStructure(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameStructure(left[key], right[key]))
  );
}

const effectShape = ({ value: _value, perMark: _perMark, ...shape }) => shape;
const ruleShape = ({ effects, ...shape }) => ({ ...shape, effects: effects?.map(effectShape) });

/** Recompile numeric growth only when the original move and its effect layout are still present. */
function refreshMove(frozen, compiled, markName, idAliases = []) {
  const sameId = frozen?.id === compiled?.id;
  const compatibleAlias = idAliases.includes(frozen?.id) && idAliases.includes(compiled?.id);
  if (!frozen || !compiled || (!sameId && !compatibleAlias) || frozen.borrowedFrom) return frozen;
  const shape = (skill) => ({
    passive: skill.passive,
    target: skill.target,
    mechanic: skill.mechanic,
    effects: skill.effects?.map(effectShape),
    rules: skill.rules?.map(ruleShape),
  });
  if (!sameStructure(shape(frozen), shape(compiled))) return frozen;
  const next = { ...frozen };
  for (const field of ['mp', 'hp', 'effects', 'rules', 'endHeal']) {
    if (Object.hasOwn(frozen, field) && Object.hasOwn(compiled, field))
      next[field] = compiled[field];
  }
  next.text = next.passive ? finalPassiveText(next, markName) : finalSkillText(next, markName);
  return next;
}

function carryGrowthResources(unit, before, after) {
  const oldLimits = battleResourceLimits(before);
  const limits = battleResourceLimits(after);
  const hp = limits.hp - oldLimits.hp;
  const mp = limits.mp - oldLimits.mp;
  unit.maxHp += hp;
  unit.maxMp += mp;
  if (unit.hp > 0) unit.hp = Math.max(1, Math.min(unit.maxHp, unit.hp + hp));
  unit.mp = Math.max(0, Math.min(unit.maxMp, unit.mp + mp));
}

export function applyEncounterGrowth(expedition, members) {
  const carried = expedition.carried;
  const definitions = carried?.heroDefinitions || expedition.heroDefinitions;
  for (const [index, { id: slot }] of HEROES.entries()) {
    const member = members.find((entry) => entry.id === expedition.partyIds?.[index]);
    const old = definitions?.[slot];
    if (!member || !old || old.inactive) continue;
    const migrate = old.growthRevision !== GROWTH_REVISION;
    const level = member.modifierValues?.level ?? member.growth?.level ?? 1;
    if (!migrate && old.level === level) continue;

    const original = expedition.heroDefinitions?.[slot] || old;
    const originalSkillIds = nativeSkills(original).map((skill) => skill.id);
    const equippedSkills = old.skills
      .filter((skill) => isUniversalSkill(skill) && !skill.borrowedFrom)
      .map((skill) => skill.id);
    const combat = applyCompanionModifiers(
      compileCharacterCombat(
        { ...member, equippedSkills, emblemId: old.emblemId },
        old.equipment,
        originalSkillIds,
      ),
      carried?.expeditionModifiers?.[slot],
    );
    const markName = old.mechanicMark?.name;
    const next = {
      ...old,
      growthRevision: GROWTH_REVISION,
      level: combat.level,
      hp: combat.hp,
      mp: combat.mp,
      startingShield: combat.startingShield || 0,
      attack: combat.attack,
      attackBeforeGrowth: combat.attackBeforeGrowth,
      limit: combat.limit,
      skills: old.skills.map((skill) =>
        refreshMove(
          skill,
          combat.skills.find(({ id }) => id === skill.id),
          markName,
        ),
      ),
    };
    if (old.entrySkill) {
      const entryIds = [`entry-${member.id}`, `${member.id}-entry`];
      // The authored Qingyuan also used a short ID before library normalization.
      if (member.id === 'character-qingyuan') entryIds.push('entry-qingyuan');
      next.entrySkill = refreshMove(old.entrySkill, combat.entrySkill, markName, entryIds);
    } else if (
      migrate &&
      (member.combat?.entrySkill || member.setting?.entrySkill) &&
      combat.entrySkill
    ) {
      next.entrySkill = combat.entrySkill;
    }
    const unit = carried?.units?.[slot];
    if (unit) carryGrowthResources(unit, old, next);
    definitions[slot] = next;
  }
}
