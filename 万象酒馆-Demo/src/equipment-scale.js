import { combatScale } from './combat-scale.js';
export const EQUIPMENT_STATS = Object.freeze({
  hp: '生命',
  mp: '法力',
  attack: '攻击力',
  skillDamage: '技能伤害',
  limit: '行动次数',
  manaCost: '耗蓝降低',
});

export const EQUIPMENT_QUALITY_ORDER = Object.freeze([
  'common',
  'uncommon',
  'rare',
  'epic',
  'legendary',
]);

export const EQUIPMENT_QUALITIES = Object.freeze({
  common: Object.freeze({
    id: 'common',
    tier: 1,
    name: '普通',
    color: '#9aa4b2',
    weight: 45,
    budgetBase: 14,
    statCount: 2,
    maxRules: 0,
    maxConditions: 0,
    maxEffects: 1,
    allowContinuous: false,
    allowManaCost: false,
    allowLimit: false,
    powerScale: 0.85,
    ascendTo: 'uncommon',
    ascendGoldBase: 12,
  }),
  uncommon: Object.freeze({
    id: 'uncommon',
    tier: 2,
    name: '精良',
    color: '#52c47c',
    weight: 32,
    budgetBase: 22,
    statCount: 2,
    maxRules: 1,
    maxConditions: 1,
    maxEffects: 1,
    allowContinuous: false,
    allowManaCost: false,
    allowLimit: false,
    powerScale: 1.0,
    ascendTo: 'rare',
    ascendGoldBase: 28,
  }),
  rare: Object.freeze({
    id: 'rare',
    tier: 3,
    name: '稀有',
    color: '#4ea1ff',
    weight: 16,
    budgetBase: 32,
    statCount: 3,
    maxRules: 1,
    maxConditions: 1,
    maxEffects: 1,
    allowContinuous: false,
    allowManaCost: true,
    allowLimit: false,
    powerScale: 1.2,
    ascendTo: 'epic',
    ascendGoldBase: 60,
  }),
  epic: Object.freeze({
    id: 'epic',
    tier: 4,
    name: '史诗',
    color: '#b47cff',
    weight: 6,
    budgetBase: 44,
    statCount: 3,
    maxRules: 2,
    maxConditions: 2,
    maxEffects: 2,
    allowContinuous: true,
    allowManaCost: true,
    allowLimit: true,
    powerScale: 1.45,
    ascendTo: 'legendary',
    ascendGoldBase: 120,
  }),
  legendary: Object.freeze({
    id: 'legendary',
    tier: 5,
    name: '传说',
    color: '#f5b942',
    weight: 1,
    budgetBase: 60,
    statCount: 4,
    maxRules: 2,
    maxConditions: 2,
    maxEffects: 2,
    allowContinuous: true,
    allowManaCost: true,
    allowLimit: true,
    powerScale: 1.75,
    ascendTo: null,
    ascendGoldBase: 0,
  }),
});

export const STAT_UNIT_COSTS = Object.freeze({
  hp: 2.2,
  mp: 3.2,
  attack: 10,
  skillDamage: 7,
  manaCost: 22,
  limit: 36,
});

export const EQUIPMENT_TRIGGER_SCOPE_MULTIPLIERS = Object.freeze({
  unlimited: 0.45,
  battle: 1,
  expedition: 1.5,
});

const EQUIPMENT_TRIGGER_FREQUENCY_COST = Object.freeze({
  unlimited: 2,
  battle: 0.9,
  expedition: 0.45,
});

export function equipmentTriggerLimit(scope, tier) {
  if (scope === 'unlimited') return undefined;
  if (scope === 'battle') return tier >= 4 ? 3 : 1;
  return tier >= 4 ? 4 : 2;
}

const CONTEXT_QUALITY_WEIGHTS = Object.freeze({
  dungeon: { common: 45, uncommon: 32, rare: 16, epic: 6, legendary: 1 },
  overland: { common: 45, uncommon: 32, rare: 16, epic: 6, legendary: 1 },
  elite: { common: 15, uncommon: 40, rare: 28, epic: 13, legendary: 4 },
  boss: { common: 0, uncommon: 20, rare: 42, epic: 28, legendary: 10 },
});

export const DOT_BUFFS = new Set(['poison', 'bleed']);

export function clampEquipmentLevel(level) {
  const numeric = Number(level);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(1, Math.min(99, Math.round(numeric)));
}

export function qualityFromValue(value = 10) {
  const numeric = Number(value) || 0;
  if (numeric <= 10) return 'common';
  if (numeric <= 30) return 'uncommon';
  if (numeric <= 80) return 'rare';
  if (numeric <= 200) return 'epic';
  return 'legendary';
}

export function resolveEquipmentQuality(quality, fallbackValue = 10) {
  if (typeof quality === 'string' && Object.hasOwn(EQUIPMENT_QUALITIES, quality)) return quality;
  return qualityFromValue(fallbackValue);
}

export function hashSeed(text) {
  let seed = 2166136261;
  for (const ch of String(text || 'wanxiang')) {
    seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619);
  }
  return seed >>> 0;
}

export function createRng(seedValue) {
  let state = Number.isInteger(seedValue) ? seedValue >>> 0 : hashSeed(seedValue);
  if (!state) state = 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Deterministic or weighted-random quality roll shaped by encounter difficulty & item luck. */
export function rollEquipmentQuality({ context = 'dungeon', value = 10, seed = null } = {}) {
  const base = { ...(CONTEXT_QUALITY_WEIGHTS[context] || CONTEXT_QUALITY_WEIGHTS.dungeon) };
  if (value >= 80 && base.common > 10) {
    base.common = Math.max(10, base.common - 12);
    base.rare += 8;
    base.epic += 3;
    base.legendary += 1;
  } else if (value >= 30 && base.common > 15) {
    base.common -= 6;
    base.uncommon += 4;
    base.rare += 2;
  }
  const total = EQUIPMENT_QUALITY_ORDER.reduce((sum, key) => sum + (base[key] || 0), 0);
  const rand = seed === null ? Math.random() : createRng(seed)();
  let cursor = rand * total;
  for (const key of EQUIPMENT_QUALITY_ORDER) {
    cursor -= base[key] || 0;
    if (cursor <= 0) return key;
  }
  return 'common';
}

export function levelStatScale(key, level = 1) {
  const lvl = clampEquipmentLevel(level);
  if (key === 'limit' || key === 'manaCost') return 1;
  const scale = combatScale(lvl);
  return key === 'mp' ? Math.sqrt(scale) : scale;
}

export function equipmentBudget(sourceOrValue, qualityOverride = null) {
  if (sourceOrValue && typeof sourceOrValue === 'object') {
    const quality = resolveEquipmentQuality(
      qualityOverride || sourceOrValue.quality,
      sourceOrValue.value ?? sourceOrValue.price ?? 10,
    );
    return EQUIPMENT_QUALITIES[quality].budgetBase;
  }
  const quality = resolveEquipmentQuality(qualityOverride, Number(sourceOrValue) || 0);
  return EQUIPMENT_QUALITIES[quality].budgetBase;
}

function effectLv1Cost(effect, levelScale, mpScale) {
  if (effect.type === 'cleanse') return (effect.buffs?.length ?? 3) * 3;
  if (effect.type === 'buff') {
    if (DOT_BUFFS.has(effect.buff)) return (effect.value / levelScale) * 0.9;
    return effect.value * 4.5;
  }
  if (effect.type === 'mana') return (effect.value / mpScale) * 1.1;
  return (effect.value / levelScale) * 0.8;
}

export function equipmentCost(equipment) {
  const level = clampEquipmentLevel(equipment?.level || 1);
  const scale = combatScale(level);
  const mpScale = Math.sqrt(scale);
  let cost = Object.entries(equipment.stats || {}).reduce((total, [key, value]) => {
    const unitScale = levelStatScale(key, level);
    const lv1Units = value / unitScale;
    return total + lv1Units * (STAT_UNIT_COSTS[key] || 0);
  }, 0);
  for (const rule of equipment.rules || []) {
    const scope = ['allAllies', 'allEnemies'].includes(rule.target)
      ? 1.8
      : ['frontAllies', 'rearAllies'].includes(rule.target)
        ? 1.5
        : 1;
    const freq = rule.mode === 'continuous' ? 2.2 : eventFrequencyCost(rule);
    const cond = rule.conditions?.length ? 0.85 : 1;
    const power = rule.effects.reduce(
      (sum, effect) => sum + effectLv1Cost(effect, scale, mpScale),
      0,
    );
    cost += scope * freq * cond * power;
  }
  return Math.ceil(cost);
}

function eventFrequencyCost(rule) {
  if (rule.triggerRevision !== 2)
    return rule.scope === 'round' ? 1.4 : rule.scope === 'battle' ? 1.1 : 0.9;
  const scope = rule.scope || 'expedition';
  if (scope === 'unlimited') return EQUIPMENT_TRIGGER_FREQUENCY_COST.unlimited;
  if (scope === 'round') return (rule.limit || 1) * 1.4;
  return (rule.limit || 1) * (EQUIPMENT_TRIGGER_FREQUENCY_COST[scope] || 0.9);
}
