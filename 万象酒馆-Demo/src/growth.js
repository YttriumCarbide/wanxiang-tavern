import { applyEquipment } from './equipment-combat.js';
import { finalPassiveText, finalSkillText } from './skill-text.js';
import { characterGenerationPlan } from './character-generation.js';
import { applyEmblemStats } from './emblems.js';
import { applyCompanionModifiers } from './companion-mechanics.js';
import { combatScale, scaleLevelEffects, scaleMoveEffects } from './combat-scale.js';
import { equippedUniversalSkills, isUniversalSkill } from './learnable-skills.js';
import { applyCharacterModifier } from './game-modifier.js';
import { HEROES } from './data.js';
import { defaultProtagonist } from './content/qingyuan.js';
import { battleResourceLimits } from './engine.js';

// Revision 9 restores shared attack growth to techniques at the next encounter, not slot growth.
const GROWTH_REVISION = 9;
// Keep the sampling salt independent of the combat revision.
const GROWTH_ROLL_SALT = 5;
const POWER_TARGETS = ['entrySkill', 'attack', 'skill1', 'skill2'];
const SKILL_TARGETS = ['skill1', 'skill2'];
const POWER_MIN = 16;
const POWER_MAX = 28;
const SP_DISCOUNT_CHANCE = 0.35;

/** Persistent growth is separate from authored combat definitions and battle snapshots. */
export const RARITIES = Object.freeze({
  common: { name: '普通', weight: 55, powerChance: 0.45, attackChance: 0.08 },
  rare: { name: '稀有', weight: 30, powerChance: 0.48, attackChance: 0.12 },
  epic: { name: '史诗', weight: 12, powerChance: 0.51, attackChance: 0.16 },
  legendary: { name: '传说', weight: 3, powerChance: 0.54, attackChance: 0.2 },
});
export const GROWTH_LABELS = Object.freeze({
  hp: '生命',
  mp: '法力',
  attack: '攻击力',
  entrySkill: '入场技威力',
  skill1: '技能1威力',
  skill2: '技能2威力',
  skill1Sp: '技能1消耗',
  skill2Sp: '技能2消耗',
  // Previously awarded levels can still be displayed in a saved settlement.
  skillDamage: '技能伤害',
  limit: '行动次数',
  manaCost: '技能消耗降低',
});

export function growthGainText(key, value) {
  const label = GROWTH_LABELS[key] || key;
  if (key === 'skill1Sp' || key === 'skill2Sp') return `${label} −${value} SP`;
  if (['entrySkill', 'attack', 'skill1', 'skill2'].includes(key)) return `${label} +${value}%`;
  return `${label} +${value}`;
}

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

function growthRoll(seed, level, target, kind) {
  return seedOf(`${seed}:growth:${GROWTH_ROLL_SALT}:${level}:${target}:${kind}`) / 4294967296;
}

function rollLevel(seed, rarity, level) {
  const roll = {};
  for (const target of POWER_TARGETS) {
    const chance =
      target === 'attack' ? RARITIES[rarity].attackChance : RARITIES[rarity].powerChance;
    if (growthRoll(seed, level, target, 'power') < chance)
      roll[target] =
        POWER_MIN +
        Math.floor(growthRoll(seed, level, target, 'value') * (POWER_MAX - POWER_MIN + 1));
  }
  for (const target of SKILL_TARGETS) {
    if (growthRoll(seed, level, target, 'sp') < SP_DISCOUNT_CHANCE) roll[target + 'Sp'] = 1;
  }
  return roll;
}

function readRoll(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null;
  const roll = {};
  for (const target of POWER_TARGETS) {
    const points = saved[target];
    if (Number.isInteger(points) && points >= POWER_MIN && points <= POWER_MAX)
      roll[target] = points;
  }
  for (const target of SKILL_TARGETS) {
    const cost = target + 'Sp';
    if (saved[cost] === 1) roll[cost] = 1;
  }
  return Object.keys(roll).length || Object.keys(saved).length === 0 ? roll : null;
}

export function restoreGrowth(value, id) {
  const level = Number.isSafeInteger(value?.level) ? Math.max(1, Math.min(99, value.level)) : 1;
  const storedXp = Number.isSafeInteger(value?.xp) ? Math.max(0, Math.min(1000000, value.xp)) : 0;
  const revision = value?.revision;
  const oldThreshold = 240 + (level - 1) * 140 + (level - 1) ** 2 * 20;
  const rarity = Object.hasOwn(RARITIES, value?.rarity) ? value.rarity : rarityFor(id);
  const seed = Number.isInteger(value?.seed) ? value.seed >>> 0 : seedOf(id);
  const savedRolls =
    Number.isInteger(revision) &&
    revision >= 4 &&
    revision <= GROWTH_REVISION &&
    Array.isArray(value.rolls)
      ? value.rolls
      : [];
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
    rolls: Array.from(
      { length: level - 1 },
      (_, index) => readRoll(savedRolls[index]) || rollLevel(seed, rarity, index + 2),
    ),
  };
}

export function xpToNext(level) {
  return 180 + (level - 1) * 45;
}

function growthTotals(rolls) {
  const totals = {};
  for (const roll of rolls) {
    for (const [key, value] of Object.entries(roll)) totals[key] = (totals[key] || 0) + value;
  }
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

function applyMoveGrowth(skill, power, spDiscount, markName) {
  const scale = 1 + (power || 0) / 100;
  if (skill.passive) {
    if (skill.endHeal) skill.endHeal = Math.max(1, Math.round(skill.endHeal * scale));
    if (skill.rules && scale !== 1) {
      skill.rules = skill.rules.map((rule) => ({
        ...rule,
        effects: scaleLevelEffects(rule.effects, scale),
      }));
    }
    skill.text = finalPassiveText(skill, markName);
    return;
  }
  if (skill.mp > 3 && spDiscount) skill.mp = Math.max(3, skill.mp - spDiscount);
  if (skill.effects) skill.effects = scaleLevelEffects(skill.effects, scale);
  skill.text = finalSkillText(skill, markName);
}

function applySharedAttackGrowth(skill, scale, markName) {
  if (scale === 1) return;
  if (skill.effects) skill.effects = scaleMoveEffects(skill.effects, scale);
  if (skill.rules) {
    skill.rules = skill.rules.map((rule) => ({
      ...rule,
      effects: scaleMoveEffects(rule.effects, scale),
    }));
  }
  skill.text = skill.passive ? finalPassiveText(skill, markName) : finalSkillText(skill, markName);
}

function effectiveGrowth(member) {
  const growth = restoreGrowth(member.growth, member.id);
  const level = member.modifierValues?.level;
  return level && level !== growth.level ? restoreGrowth({ ...growth, level }, member.id) : growth;
}

function nativeSkills(combat) {
  return (combat.skills || []).filter((skill) => !isUniversalSkill(skill) && !skill.borrowedFrom);
}

export function grownCombat(member, frozenSkillIds = null) {
  const growth = effectiveGrowth(member);
  const totals = growthTotals(growth.rolls);
  const combat = structuredClone(member.combat);
  applyCharacterModifier(member, combat);
  combat.level = growth.level;
  combat.growthRevision = GROWTH_REVISION;
  const poolScale = combatScale(combat.level);
  combat.hp = Math.round(combat.hp * poolScale);
  combat.mp = Math.round(combat.mp * Math.sqrt(poolScale));
  combat.attackBeforeGrowth = combat.attack;
  combat.attack = Math.round(combat.attack * (1 + (totals.attack || 0) / 100));

  const markName = combat.mechanicMark?.name;
  const baseEntry = combat.entrySkill || baseEntrySkill(member);
  if (baseEntry) {
    combat.entrySkill = structuredClone(baseEntry);
    applyMoveGrowth(combat.entrySkill, totals.entrySkill, 0, markName);
  }
  const skills = nativeSkills(combat);
  for (const [index, target] of SKILL_TARGETS.entries()) {
    const skill = frozenSkillIds
      ? skills.find((candidate) => candidate.id === frozenSkillIds[index])
      : skills[index];
    if (skill) applyMoveGrowth(skill, totals[target], totals[target + 'Sp'], markName);
  }
  for (const skill of equippedUniversalSkills(member)) {
    if (combat.skills.some((existing) => existing.id === skill.id)) continue;
    skill.text = finalSkillText(skill, markName);
    combat.skills.push(skill);
  }
  const attackGrowthScale = 1 + (totals.attack || 0) / 100;
  if (combat.entrySkill) applySharedAttackGrowth(combat.entrySkill, attackGrowthScale, markName);
  for (const skill of combat.skills) applySharedAttackGrowth(skill, attackGrowthScale, markName);
  return combat;
}

export function compileCharacterCombat(member, equipment, frozenSkillIds = null) {
  return applyEmblemStats(
    applyEquipment(grownCombat(member, frozenSkillIds), equipment),
    member.emblemId,
  );
}

function levelGains(prior, next, roll) {
  const gains = {};
  for (const key of ['hp', 'mp', 'attack']) {
    if (next[key] > prior[key]) gains[key] = next[key] - prior[key];
  }
  const beforeSkills = nativeSkills(prior);
  const afterSkills = nativeSkills(next);
  if (roll.attack && next.attack !== prior.attack) gains.attack = roll.attack;
  const moves = [
    ['entrySkill', prior.entrySkill, next.entrySkill],
    ...SKILL_TARGETS.map((target, index) => [target, beforeSkills[index], afterSkills[index]]),
  ];
  const power = (skill) => JSON.stringify([skill.effects, skill.rules, skill.endHeal]);
  for (const [target, before, after] of moves) {
    if (!before || !after || isUniversalSkill(after)) continue;
    if (roll[target] && power(after) !== power(before)) gains[target] = roll[target];
    const costKey = target + 'Sp';
    if (roll[costKey] && before.mp > after.mp) gains[costKey] = before.mp - after.mp;
  }
  return gains;
}

export function gainExperience(member, amount) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new RangeError('Experience amount must be a finite nonnegative integer');
  }
  const growth = restoreGrowth(member.growth, member.id);
  const levels = [];
  const before = { level: growth.level, xp: growth.xp };
  growth.xp += amount;
  let prior;
  while (growth.level < 99 && growth.xp >= xpToNext(growth.level)) {
    prior ||= grownCombat({ ...member, growth });
    growth.xp -= xpToNext(growth.level);
    growth.level++;
    const roll = rollLevel(growth.seed, growth.rarity, growth.level);
    growth.rolls.push(roll);
    const next = grownCombat({ ...member, growth });
    levels.push({ level: growth.level, gains: levelGains(prior, next, roll) });
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
      '生命与法力按等级曲线成长。低概率抽到的攻击力成长增强普攻、入场技、本体技能和特技的伤害。分槽威力与SP减耗独立抽取，只作用于对应槽位，不作用于特技。',
    guidance:
      plan.guidance +
      '所有参考均为1级无装备基础值，不含升级、装备、敏捷或结合。初始等级1，成长由代码处理。',
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
      attack: combat.attack,
      attackBeforeGrowth: combat.attackBeforeGrowth,
      limit: migrate ? combat.limit : old.limit,
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
