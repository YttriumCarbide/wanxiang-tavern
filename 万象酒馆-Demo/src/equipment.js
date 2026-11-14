import { finalSkillText, equipmentDescription } from './skill-text.js';
import {
  normalizeRules,
  EXCLUSIVE_BUFFS,
  GENERATED_POSITIVE_BUFFS,
  NEGATIVE_BUFFS,
} from './triggers.js';
import { combatScale, scaleMoveEffects } from './combat-scale.js';
import { encounterLevel } from './enemy-growth.js';

export const EQUIPMENT_STATS = Object.freeze({
  hp: '生命',
  mp: '法力',
  attack: '普攻',
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
    ascendEtherBase: 12,
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
    ascendEtherBase: 28,
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
    ascendEtherBase: 60,
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
    ascendEtherBase: 120,
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
    ascendEtherBase: 0,
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

const CONTEXT_QUALITY_WEIGHTS = Object.freeze({
  dungeon: { common: 45, uncommon: 32, rare: 16, epic: 6, legendary: 1 },
  overland: { common: 45, uncommon: 32, rare: 16, epic: 6, legendary: 1 },
  elite: { common: 15, uncommon: 40, rare: 28, epic: 13, legendary: 4 },
  boss: { common: 0, uncommon: 20, rare: 42, epic: 28, legendary: 10 },
});

const DOT_BUFFS = new Set(['poison', 'bleed']);

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

function createRng(seedValue) {
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
  if (effect.type === 'cleanse') return effect.buffs.length * 3;
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
    const freq =
      rule.mode === 'continuous'
        ? 2.2
        : rule.scope === 'round'
          ? 1.4
          : rule.scope === 'battle'
            ? 1.1
            : 0.9;
    const cond = rule.conditions?.length ? 0.85 : 1;
    const power = rule.effects.reduce(
      (sum, effect) => sum + effectLv1Cost(effect, scale, mpScale),
      0,
    );
    cost += scope * freq * cond * power;
  }
  return Math.ceil(cost);
}

function powerBaseRange(effectType, power, buffKey) {
  const tier = power === 'standard' ? 'medium' : power;
  if (effectType === 'mana') {
    return { low: [2, 3], medium: [4, 5], high: [6, 8] }[tier];
  }
  if (effectType === 'buff' && DOT_BUFFS.has(buffKey)) {
    return { low: [2, 3], medium: [4, 6], high: [7, 9] }[tier];
  }
  return { low: [3, 5], medium: [6, 9], high: [10, 14] }[tier];
}

function nonScaledStacks(mode, buffKey, power, qualityMeta, rng) {
  const tier = power === 'standard' ? 'medium' : power;
  if (buffKey === 'bind') return [1, 1, 1];
  if (buffKey === 'haste') {
    const hi = tier === 'high' && qualityMeta.tier >= 4 ? 2 : 1;
    return [1, hi, hi > 1 && rng() > 0.45 ? 2 : 1];
  }
  if (mode === 'continuous') {
    const hi = qualityMeta.tier >= 5 && tier === 'high' && buffKey !== 'flying' ? 2 : 1;
    return [1, hi, hi > 1 && rng() > 0.5 ? 2 : 1];
  }
  const [min, max] =
    buffKey === 'slow' || buffKey === 'flying' || buffKey === 'regen'
      ? { low: [1, 1], medium: [1, 2], high: [1, 2] }[tier]
      : { low: [1, 1], medium: [1, 2], high: [2, 3] }[tier];
  const val = min === max ? min : Math.round(min + rng() * (max - min));
  return [min, max, val];
}

function compileRulesForQuality(designRules, level, qualityMeta, rng, reserveStatBudget = 0) {
  const lvlScale = combatScale(level);
  const mpScale = Math.sqrt(lvlScale);
  const effectRatios = [];
  const rawList = Array.isArray(designRules) ? designRules.slice(0, qualityMeta.maxRules) : [];
  const rules = [];
  for (const rule of rawList) {
    if (rule.mode === 'continuous' && !qualityMeta.allowContinuous) continue;
    const hostile = ['lowestEnemy', 'allEnemies'].includes(rule.target);
    const maxEff = Math.max(1, qualityMeta.maxEffects);
    const effects = [];
    for (const effect of (rule.effects || []).slice(0, maxEff)) {
      if (effect.type === 'cleanse') {
        effects.push({
          type: 'cleanse',
          buffs: [...new Set(effect.buffs || [])]
            .filter((key) => NEGATIVE_BUFFS.includes(key))
            .slice(0, qualityMeta.tier >= 4 ? 2 : 1),
        });
        continue;
      }
      if (effect.type === 'buff') {
        const pool = hostile ? NEGATIVE_BUFFS : GENERATED_POSITIVE_BUFFS;
        if (!pool.includes(effect.buff) || EXCLUSIVE_BUFFS.includes(effect.buff)) continue;
        if (DOT_BUFFS.has(effect.buff)) {
          const [bMin, bMax] = powerBaseRange('buff', effect.power || 'medium', effect.buff);
          const min = Math.max(1, Math.floor(bMin * qualityMeta.powerScale * lvlScale * 0.85));
          const max = Math.max(min, Math.ceil(bMax * qualityMeta.powerScale * lvlScale * 1.15));
          const value = min === max ? min : Math.round(min + rng() * (max - min));
          effectRatios.push({ min, max, value });
          effects.push({ type: 'buff', buff: effect.buff, value });
        } else {
          const [min, max, value] = nonScaledStacks(
            rule.mode,
            effect.buff,
            effect.power || 'medium',
            qualityMeta,
            rng,
          );
          if (max > min) effectRatios.push({ min, max, value });
          effects.push({ type: 'buff', buff: effect.buff, value });
        }
        continue;
      }
      if (['damage', 'heal', 'mana', 'shield'].includes(effect.type)) {
        const [bMin, bMax] = powerBaseRange(effect.type, effect.power || 'medium');
        const scale =
          effect.type === 'mana'
            ? Math.sqrt(qualityMeta.powerScale) * mpScale
            : qualityMeta.powerScale * lvlScale;
        const min = Math.max(1, Math.floor(bMin * scale * 0.85));
        const max = Math.max(min, Math.ceil(bMax * scale * 1.15));
        const value = min === max ? min : Math.round(min + rng() * (max - min));
        effectRatios.push({ min, max, value });
        effects.push({ type: effect.type, value });
      }
    }
    if (!effects.length) continue;
    const cleanConditions = (rule.conditions || []).slice(0, qualityMeta.maxConditions);
    rules.push({
      mode: rule.mode,
      ...(rule.mode === 'event' ? { event: rule.event } : {}),
      target: rule.target,
      conditions: cleanConditions,
      effects,
      ...(rule.mode === 'event'
        ? { limit: qualityMeta.tier >= 4 ? 3 : 1, scope: 'expedition' }
        : {}),
    });
  }
  const normalized = normalizeRules(rules);
  const reserveRatio = qualityMeta.tier >= 4 ? 0.65 : 0.6;
  const maxRuleCost = Math.max(
    0,
    Math.min(
      Math.floor(qualityMeta.budgetBase * reserveRatio),
      qualityMeta.budgetBase - reserveStatBudget,
    ),
  );
  while (
    normalized.length &&
    equipmentCost({ level, stats: {}, rules: normalized }) > maxRuleCost
  ) {
    const last = normalized.at(-1);
    const scalable = last.effects.find((entry) =>
      entry.type !== 'buff' || DOT_BUFFS.has(entry.buff) ? entry.value > 1 : false,
    );
    if (scalable) {
      scalable.value = Math.max(1, Math.floor(scalable.value * 0.85));
    } else if (last.effects.length > 1) {
      last.effects.pop();
    } else {
      normalized.pop();
    }
  }
  return { rules: normalized, effectRatios };
}

/** Materialize a deterministic-or-rolled instance from a blueprint design at any (level, quality, seed). */
export function materializeEquipment({
  design,
  stats: fallbackStats,
  rules: fallbackRules,
  level = 1,
  quality = 'common',
  seed = 1,
} = {}) {
  const lvl = clampEquipmentLevel(level);
  const qualityKey = resolveEquipmentQuality(quality, 10);
  const qualityMeta = EQUIPMENT_QUALITIES[qualityKey];
  const rng = createRng(seed);

  const effectiveDesign = design || {
    statFocus: Object.keys(fallbackStats || {}).length ? Object.keys(fallbackStats) : ['hp'],
    rules: (fallbackRules || []).map((rule) => ({
      mode: rule.mode,
      ...(rule.event ? { event: rule.event } : {}),
      target: rule.target,
      conditions: rule.conditions || [],
      effects: (rule.effects || []).map((eff) => ({
        type: eff.type,
        ...(eff.buff ? { buff: eff.buff } : {}),
        ...(eff.buffs ? { buffs: eff.buffs } : {}),
        power: 'medium',
      })),
    })),
  };

  const focus = [...new Set(effectiveDesign.statFocus || ['hp'])].slice(0, qualityMeta.statCount);
  const reserveLimit =
    focus.includes('limit') && qualityMeta.allowLimit ? STAT_UNIT_COSTS.limit : 0;
  const { rules, effectRatios } = compileRulesForQuality(
    effectiveDesign.rules,
    lvl,
    qualityMeta,
    rng,
    reserveLimit,
  );
  const ruleCost = equipmentCost({ level: lvl, stats: {}, rules });
  let available = Math.max(4, qualityMeta.budgetBase - ruleCost);
  const stats = {};
  const statRanges = {};
  const rollSamples = [...effectRatios];

  if (focus.includes('limit') && qualityMeta.allowLimit && available >= STAT_UNIT_COSTS.limit) {
    stats.limit = 1;
    statRanges.limit = [1, 1];
    available = Math.max(0, available - STAT_UNIT_COSTS.limit);
  }
  if (
    focus.includes('manaCost') &&
    qualityMeta.allowManaCost &&
    available >= STAT_UNIT_COSTS.manaCost
  ) {
    const canTwo = qualityMeta.tier === 5 && available >= STAT_UNIT_COSTS.manaCost * 2;
    const min = 1;
    const max = canTwo ? 2 : 1;
    const val = canTwo && rng() > 0.55 ? 2 : 1;
    stats.manaCost = val;
    statRanges.manaCost = [min, max];
    if (max > min) rollSamples.push({ min, max, value: val });
    available = Math.max(0, available - val * STAT_UNIT_COSTS.manaCost);
  }

  let contFocus = focus.filter((key) => !['limit', 'manaCost'].includes(key));
  if (!contFocus.length && available >= STAT_UNIT_COSTS.hp) contFocus = ['hp'];
  if (contFocus.length && available >= STAT_UNIT_COSTS.hp) {
    // Allocate stat focus sequentially in priority order while rolling unused fraction into hp/remaining slots.
    let remainingBudget = available;
    const totalW = contFocus.reduce((sum, _, idx) => sum + Math.max(0.65, 1.3 - idx * 0.25), 0);
    let weightLeft = totalW;
    contFocus.forEach((key, idx) => {
      const w = Math.max(0.65, 1.3 - idx * 0.25);
      const isLast = idx === contFocus.length - 1;
      const desiredShare = isLast ? remainingBudget : (remainingBudget * w) / weightLeft;
      weightLeft -= w;
      const unitCost = STAT_UNIT_COSTS[key];
      const scale = levelStatScale(key, lvl);
      const centerBudget = desiredShare * 0.85;
      const scaledCenter = (centerBudget / unitCost) * scale;
      if (scaledCenter < 0.75) {
        if (idx === 0 && remainingBudget >= unitCost) {
          const singleScaled = Math.max(1, Math.round(scale));
          const min = Math.max(1, Math.floor(singleScaled * 0.85));
          const max = Math.max(min, Math.ceil(singleScaled * 1.15));
          const value = min === max ? min : Math.round(min + rng() * (max - min));
          stats[key] = value;
          statRanges[key] = [min, max];
          if (max > min) rollSamples.push({ min, max, value });
          remainingBudget = Math.max(0, remainingBudget - (value / scale) * unitCost);
        }
        return;
      }
      const min = Math.max(1, Math.floor(scaledCenter * 0.85));
      const max = Math.max(min, Math.ceil(scaledCenter * 1.15));
      const value = min === max ? min : Math.round(min + rng() * (max - min));
      stats[key] = value;
      statRanges[key] = [min, max];
      if (max > min) rollSamples.push({ min, max, value });
      remainingBudget = Math.max(0, remainingBudget - (value / scale) * unitCost);
    });
    if (remainingBudget >= STAT_UNIT_COSTS.hp * 1.15 && !stats.hp) {
      const hpScale = levelStatScale('hp', lvl);
      const centerHp = ((remainingBudget * 0.85) / STAT_UNIT_COSTS.hp) * hpScale;
      if (centerHp >= 0.75) {
        const min = Math.max(1, Math.floor(centerHp * 0.85));
        const max = Math.max(min, Math.ceil(centerHp * 1.15));
        const value = min === max ? min : Math.round(min + rng() * (max - min));
        stats.hp = value;
        statRanges.hp = [min, max];
        if (max > min) rollSamples.push({ min, max, value });
      }
    }
  }

  if (!Object.keys(stats).length && !rules.length) {
    const fallbackVal = Math.max(1, Math.round(combatScale(lvl)));
    stats.hp = fallbackVal;
    statRanges.hp = [fallbackVal, fallbackVal];
  }

  // Trim 1 point at a time from lowest-priority continuous stat only if integer rounding nudged over ceiling.
  while (equipmentCost({ level: lvl, stats, rules }) > qualityMeta.budgetBase) {
    const trimKey = [...contFocus]
      .reverse()
      .find((key) => (stats[key] || 0) > (key === contFocus[0] ? 1 : 0));
    if (!trimKey) break;
    stats[trimKey]--;
    if (!stats[trimKey]) delete stats[trimKey];
  }

  const ratioSum = rollSamples.reduce((sum, entry) => {
    const span = Math.max(1, entry.max - entry.min);
    return sum + Math.max(0, Math.min(1, (entry.value - entry.min) / span));
  }, 0);
  const rollPercent = rollSamples.length ? Math.round((ratioSum / rollSamples.length) * 100) : 100;

  return {
    level: lvl,
    quality: qualityKey,
    seed: Number.isInteger(seed) ? seed >>> 0 : hashSeed(seed),
    stats,
    rules,
    statRanges,
    rollPercent,
    description: equipmentDescription({ stats, rules }),
  };
}

export function normalizeEquipment(raw, source) {
  if (
    typeof source?.id !== 'string' ||
    !source.id ||
    source.id.length > 200 ||
    !Number.isSafeInteger(source.value) ||
    source.value < 0 ||
    source.value > 10000
  )
    throw Error('装备来源无效');
  if (
    !raw ||
    typeof raw.name !== 'string' ||
    !raw.name.trim() ||
    raw.name.length > 40 ||
    typeof raw.description !== 'string' ||
    raw.description.length > 500
  )
    throw Error('装备名称或说明无效');
  const level = clampEquipmentLevel(raw.level ?? source.level ?? 1);
  const quality = resolveEquipmentQuality(raw.quality ?? source.quality, source.value);
  const scale = combatScale(level);
  const mpScale = Math.sqrt(scale);
  const statLimits = {
    hp: Math.ceil(40 * scale),
    mp: Math.ceil(40 * mpScale),
    attack: Math.ceil(40 * scale),
    skillDamage: Math.ceil(40 * scale),
    manaCost: 2,
    limit: 1,
  };
  const stats = {};
  for (const [key, value] of Object.entries(raw.stats || {})) {
    if (
      !Object.hasOwn(EQUIPMENT_STATS, key) ||
      !Number.isInteger(value) ||
      value < 0 ||
      value > statLimits[key]
    )
      throw Error('装备基础属性无效');
    if (value) stats[key] = value;
  }
  const equipment = {
    id: source.id,
    name: raw.name.trim(),
    description: raw.description.trim(),
    ...(typeof raw.flavor === 'string' && raw.flavor.trim() ? { flavor: raw.flavor.trim() } : {}),
    price: source.value,
    level,
    quality,
    map: source.map || source.source?.map || 'ruins',
    sourceName: source.name,
    sourceDescription: source.description || raw.sourceDescription || '',
    stats,
    rules: normalizeRules(raw.rules || []),
    ...(raw.design ? { design: structuredClone(raw.design) } : {}),
    ...(raw.statRanges ? { statRanges: structuredClone(raw.statRanges) } : {}),
    ...(Number.isInteger(raw.rollPercent) ? { rollPercent: raw.rollPercent } : {}),
  };
  if (!Object.keys(stats).length && !equipment.rules.length)
    throw Error('装备至少需要一项属性或规则');
  if (equipmentCost(equipment) > equipmentBudget(source, quality))
    throw Error('装备超过原物品的以太强度预算：' + source.name);
  return equipment;
}

function restoreOwnedInstance(item, template) {
  const level = clampEquipmentLevel(item.level ?? template.level ?? 1);
  const quality = resolveEquipmentQuality(item.quality ?? template.quality, template.price);
  const stats =
    item.stats && typeof item.stats === 'object' ? structuredClone(item.stats) : undefined;
  const rules = Array.isArray(item.rules) ? normalizeRules(item.rules) : undefined;
  const entry = {
    id: item.id,
    templateId: item.templateId,
    level,
    quality,
    ...(item.seed !== undefined ? { seed: Number(item.seed) >>> 0 } : {}),
    ...(stats ? { stats } : {}),
    ...(rules ? { rules } : {}),
    ...(item.statRanges && typeof item.statRanges === 'object'
      ? { statRanges: structuredClone(item.statRanges) }
      : {}),
    ...(Number.isInteger(item.rollPercent) ? { rollPercent: item.rollPercent } : {}),
    ...(typeof item.description === 'string' && item.description.trim()
      ? { description: item.description.trim() }
      : {}),
  };
  if (!entry.stats || !entry.rules) {
    entry.stats ||= structuredClone(template.stats);
    entry.rules ||= structuredClone(template.rules);
    entry.description ||= equipmentDescription({ stats: entry.stats, rules: entry.rules });
  }
  return entry;
}

export function restoreEquipment(value) {
  const catalog = [];
  for (const item of Array.isArray(value?.catalog) ? value.catalog : []) {
    try {
      if (!catalog.some((entry) => entry.id === item.id))
        catalog.push(
          normalizeEquipment(item, {
            id: item.id,
            name: item.sourceName || item.name,
            value: item.price,
            description: item.sourceDescription,
            map: item.map,
            level: item.level,
            quality: item.quality,
          }),
        );
    } catch {
      /* Damaged equipment is not equipped. */
    }
  }
  const seen = new Set();
  const owned = [];
  for (const item of Array.isArray(value?.owned) ? value.owned : []) {
    if (typeof item?.id !== 'string' || item.id.length > 100 || seen.has(item.id)) continue;
    const template = catalog.find((entry) => entry.id === item.templateId);
    if (!template) continue;
    try {
      owned.push(restoreOwnedInstance(item, template));
      seen.add(item.id);
    } catch {
      /* Skip corrupted owned instance while keeping valid entries. */
    }
  }
  return {
    catalog,
    owned: owned.slice(0, 1000),
    favorites: (value?.favorites || []).filter((id) => catalog.some((item) => item.id === id)),
    hidden: (value?.hidden || []).filter((id) => catalog.some((item) => item.id === id)),
  };
}

export function favoriteEquipment(library, id) {
  const state = library.equipment;
  if (!state.catalog.some((item) => item.id === id)) throw Error('装备方案不存在');
  state.favorites ||= [];
  state.favorites = state.favorites.includes(id)
    ? state.favorites.filter((key) => key !== id)
    : [...state.favorites, id];
}

export function deleteEquipmentPlan(library, id) {
  const state = library.equipment;
  if (!state.catalog.some((item) => item.id === id)) throw Error('装备方案不存在');
  state.hidden = [...new Set([...(state.hidden || []), id])];
  state.favorites = (state.favorites || []).filter((key) => key !== id);
}

/** Maximum equipment level unlocked across party growth, explored frontiers, and loot archives. */
export function maxUnlockedEquipmentLevel(library) {
  let maxLevel = 1;
  for (const member of library?.characters || []) {
    maxLevel = Math.max(maxLevel, Number(member?.growth?.level) || 1);
  }
  for (const item of library?.archives?.items || []) {
    maxLevel = Math.max(maxLevel, Number(item?.level) || 1);
  }
  for (const owned of library?.equipment?.owned || []) {
    maxLevel = Math.max(maxLevel, Number(owned?.level) || 1);
  }
  for (const [map, state] of Object.entries(library?.exploration || {})) {
    if (!state || typeof state !== 'object') continue;
    if (Array.isArray(state.frontier)) {
      for (const node of state.frontier) {
        maxLevel = Math.max(maxLevel, encounterLevel({ ...node, map: node.map || map }));
      }
    }
    if (state.world?.sites) {
      for (let seq = 0; seq < (state.clears || 0); seq++) {
        maxLevel = Math.max(maxLevel, encounterLevel({ map, sequence: seq, world: state.world }));
      }
    }
  }
  return clampEquipmentLevel(maxLevel);
}

export function reforgeCost(template, instance) {
  const tier =
    EQUIPMENT_QUALITIES[resolveEquipmentQuality(instance?.quality, template?.price)].tier;
  const level = clampEquipmentLevel(instance?.level || template?.level || 1);
  return Math.max(3, Math.ceil(((template?.price || 10) * 0.35 + level * 1.2) * (tier * 0.45)));
}

export function temperCost(template, instance, targetLevel = (instance?.level || 1) + 1) {
  const tier =
    EQUIPMENT_QUALITIES[resolveEquipmentQuality(instance?.quality, template?.price)].tier;
  const current = clampEquipmentLevel(instance?.level || template?.level || 1);
  const delta = Math.max(1, clampEquipmentLevel(targetLevel) - current);
  return Math.max(4, Math.ceil(delta * (2.5 + tier * 1.6 + (template?.price || 10) * 0.06)));
}

export function ascendCost(template, instance) {
  const quality = EQUIPMENT_QUALITIES[resolveEquipmentQuality(instance?.quality, template?.price)];
  if (!quality.ascendTo) return 0;
  const level = clampEquipmentLevel(instance?.level || template?.level || 1);
  return Math.max(
    10,
    Math.ceil(quality.ascendEtherBase + level * 1.2 + (template?.price || 10) * 0.25),
  );
}

export function dismantleEther(template, instance) {
  const tier =
    EQUIPMENT_QUALITIES[resolveEquipmentQuality(instance?.quality, template?.price)].tier;
  const level = clampEquipmentLevel(instance?.level || template?.level || 1);
  return Math.max(2, Math.floor((template?.price || 6) * 0.4 + level * 0.5 + tier * 2));
}

export function buyEquipment(library, templateId, instanceId, options = {}) {
  return addEquipmentInstance(library, templateId, instanceId, options, true);
}

export function grantEquipment(library, templateId, instanceId, options = {}) {
  return addEquipmentInstance(library, templateId, instanceId, options, false);
}

function addEquipmentInstance(library, templateId, instanceId, options, purchase) {
  const template = library.equipment.catalog.find((item) => item.id === templateId);
  if (!template || library.equipment.hidden?.includes(templateId)) throw Error('装备方案已删除');
  if (purchase && library.inventory.ether < template.price) throw Error('以太不足');
  if (library.equipment.owned.length >= 1000) throw Error('装备背包已满');
  if (library.equipment.owned.some((item) => item.id === instanceId)) throw Error('装备标识重复');
  const level = clampEquipmentLevel(options.level ?? template.level ?? 1);
  const quality = resolveEquipmentQuality(options.quality ?? template.quality, template.price);
  const seed =
    options.seed !== undefined
      ? Number(options.seed) >>> 0
      : hashSeed(`${instanceId}:${library.equipment.owned.length}:${Date.now()}`);
  const rolled = materializeEquipment({
    design: template.design,
    stats: template.stats,
    rules: template.rules,
    level,
    quality,
    seed,
  });
  if (purchase) library.inventory.ether -= template.price;
  library.equipment.owned.push({
    id: instanceId,
    templateId,
    ...rolled,
  });
  return library.equipment.owned.at(-1);
}

function ownedWithTemplate(library, instanceId) {
  const instance = library.equipment?.owned.find((item) => item.id === instanceId);
  if (!instance) throw Error('未持有该装备实例');
  const template = library.equipment?.catalog.find((item) => item.id === instance.templateId);
  if (!template) throw Error('装备蓝图不存在');
  return { instance, template };
}

export function reforgeEquipment(library, instanceId, seed = null) {
  const { instance, template } = ownedWithTemplate(library, instanceId);
  const cost = reforgeCost(template, instance);
  if ((library.inventory.ether || 0) < cost) throw Error('以太不足以重铸属性');
  library.inventory.ether -= cost;
  const nextSeed =
    seed !== null && seed !== undefined
      ? Number(seed) >>> 0
      : hashSeed(`${instanceId}:reforge:${instance.seed ?? 1}:${Date.now()}:${Math.random()}`);
  const rolled = materializeEquipment({
    design: template.design,
    stats: instance.stats || template.stats,
    rules: instance.rules || template.rules,
    level: instance.level || template.level || 1,
    quality: instance.quality || template.quality || qualityFromValue(template.price),
    seed: nextSeed,
  });
  Object.assign(instance, rolled);
  return instance;
}

export function temperEquipment(library, instanceId, targetLevel = null) {
  const { instance, template } = ownedWithTemplate(library, instanceId);
  const currentLevel = clampEquipmentLevel(instance.level || template.level || 1);
  const maxUnlocked = maxUnlockedEquipmentLevel(library);
  const desired = targetLevel === null ? currentLevel + 1 : clampEquipmentLevel(targetLevel);
  if (desired <= currentLevel) throw Error('目标等级必须高于当前等级');
  if (desired > maxUnlocked) throw Error(`当前最高只解锁到 Lv.${maxUnlocked}`);
  const cost = temperCost(template, instance, desired);
  if ((library.inventory.ether || 0) < cost) throw Error('以太不足以淬炼升级');
  library.inventory.ether -= cost;
  const rolled = materializeEquipment({
    design: template.design,
    stats: instance.stats || template.stats,
    rules: instance.rules || template.rules,
    level: desired,
    quality: instance.quality || template.quality || qualityFromValue(template.price),
    seed: instance.seed ?? hashSeed(`${instance.id}:${template.id}`),
  });
  Object.assign(instance, rolled);
  return instance;
}

export function ascendEquipment(library, instanceId, seed = null) {
  const { instance, template } = ownedWithTemplate(library, instanceId);
  const currentQuality = resolveEquipmentQuality(
    instance.quality ?? template.quality,
    template.price,
  );
  const meta = EQUIPMENT_QUALITIES[currentQuality];
  if (!meta.ascendTo) throw Error('该装备已达最高传说品质');
  const cost = ascendCost(template, instance);
  if ((library.inventory.ether || 0) < cost) throw Error('以太不足以品质升阶');
  library.inventory.ether -= cost;
  const nextSeed =
    seed !== null && seed !== undefined
      ? Number(seed) >>> 0
      : (instance.seed ?? hashSeed(`${instance.id}:ascend:${meta.ascendTo}`));
  const rolled = materializeEquipment({
    design: template.design,
    stats: instance.stats || template.stats,
    rules: instance.rules || template.rules,
    level: instance.level || template.level || 1,
    quality: meta.ascendTo,
    seed: nextSeed,
  });
  Object.assign(instance, rolled);
  return instance;
}

export function dismantleEquipment(library, instanceId) {
  const { instance, template } = ownedWithTemplate(library, instanceId);
  if (library.characters?.some((member) => member.equipment?.includes(instanceId))) {
    throw Error('该装备正在穿戴中，请先卸下再分解');
  }
  const refund = dismantleEther(template, instance);
  library.equipment.owned = library.equipment.owned.filter((item) => item.id !== instanceId);
  library.inventory.ether = Math.min(999999999, (library.inventory.ether || 0) + refund);
  return refund;
}

export function equip(library, characterId, slot, instanceId) {
  const member = library.characters.find((item) => item.id === characterId);
  if (!member || !Number.isInteger(slot) || slot < 0 || slot > 2) throw Error('装备槽无效');
  if (instanceId && !library.equipment.owned.some((item) => item.id === instanceId))
    throw Error('未持有该装备');
  if (instanceId && library.characters.some((item) => item.equipment?.includes(instanceId)))
    throw Error('该装备已被使用，请先卸下');
  if (instanceId) {
    const instance = library.equipment.owned.find((item) => item.id === instanceId);
    const name = library.equipment.catalog.find((item) => item.id === instance.templateId)?.name;
    if (
      equippedDefinitions(library, member).some(
        (item) => item.name === name && member.equipment?.[slot] !== item.id,
      )
    )
      throw Error('同名装备每名角色只能装备一件');
  }
  member.equipment ||= [null, null, null];
  member.equipment[slot] = instanceId || null;
}

export function equippedDefinitions(library, member) {
  const names = new Set();
  return (member.equipment || [])
    .slice(0, 3)
    .map((id) => {
      const instance = library.equipment?.owned.find((item) => item.id === id);
      const template = library.equipment?.catalog.find((item) => item.id === instance?.templateId);
      if (!template) return null;
      return {
        ...structuredClone(template),
        id,
        templateId: template.id,
        level: clampEquipmentLevel(instance.level ?? template.level ?? 1),
        quality: resolveEquipmentQuality(instance.quality ?? template.quality, template.price),
        ...(instance.seed !== undefined ? { seed: instance.seed } : {}),
        stats: structuredClone(instance.stats || template.stats),
        rules: structuredClone(instance.rules || template.rules),
        ...(instance.statRanges ? { statRanges: structuredClone(instance.statRanges) } : {}),
        ...(Number.isInteger(instance.rollPercent) ? { rollPercent: instance.rollPercent } : {}),
        ...(instance.description ? { description: instance.description } : {}),
      };
    })
    .filter((item) => item && !names.has(item.name) && names.add(item.name));
}

export function applyEquipment(combat, equipment = []) {
  const result = structuredClone(combat);
  const valid = equipment.filter((item) => item && item.stats);
  for (const item of valid) {
    result.maxHp += item.stats.hp || 0;
    result.hp += item.stats.hp || 0;
    result.maxMp += item.stats.mp || 0;
    result.mp = Math.min(result.maxMp, result.mp + (item.stats.mp || 0));
    result.attack += item.stats.attack || 0;
    result.skillDamageBonus = (result.skillDamageBonus || 0) + (item.stats.skillDamage || 0);
    result.limit = Math.min(6, result.limit + (item.stats.limit || 0));
    result.manaCostReduction = Math.min(
      4,
      (result.manaCostReduction || 0) + (item.stats.manaCost || 0),
    );
  }
  const scale = combat.attack ? result.attack / combat.attack : 1;
  result.skills = (result.skills || []).map((skill) => {
    const next = { ...skill };
    if (Array.isArray(next.effects)) {
      next.effects = scaleMoveEffects(next.effects, scale);
    }
    if (next.skillDamageBonus !== false && result.skillDamageBonus) {
      next.effects = (next.effects || []).map((effect) =>
        effect.type === 'damage'
          ? { ...effect, value: effect.value + result.skillDamageBonus }
          : effect,
      );
    }
    if (result.manaCostReduction && Number.isInteger(next.mana) && next.mana > 0) {
      next.mana = Math.max(0, next.mana - result.manaCostReduction);
    }
    if (next.type !== 'passive' && !next.passive)
      next.text = finalSkillText(next, result.mechanicMark?.name);
    return next;
  });
  result.equipment = valid.map((item) => structuredClone(item));
  return result;
}
