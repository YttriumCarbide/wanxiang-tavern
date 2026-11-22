import {
  DOT_BUFFS,
  equipmentCost,
  clampEquipmentLevel,
  resolveEquipmentQuality,
  EQUIPMENT_QUALITIES,
  createRng,
  STAT_UNIT_COSTS,
  levelStatScale,
  hashSeed,
  EQUIPMENT_STATS,
  equipmentBudget,
  EQUIPMENT_TRIGGER_SCOPE_MULTIPLIERS,
  equipmentTriggerLimit,
} from './equipment-scale.js';
import { combatScale } from './combat-scale.js';
import {
  NEGATIVE_BUFFS,
  GENERATED_POSITIVE_BUFFS,
  EXCLUSIVE_BUFFS,
  normalizeRules,
} from './triggers.js';
import { equipmentDescription } from './skill-text.js';
import { normalizeEquipmentCategory, inferLegacyEquipmentCategory } from './equipment-slots.js';
import { gemBonusText, findGemById } from './content/gems.js';
import { restoreEquipmentAffixes } from './equipment-affixes.js';
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

function nonScaledStacks(mode, buffKey, power, qualityMeta, rng, scopeScale = 1) {
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
  const scaledMin = Math.max(1, Math.floor(min * scopeScale));
  const scaledMax = Math.max(scaledMin, Math.floor(max * scopeScale));
  const val =
    scaledMin === scaledMax ? scaledMin : Math.round(scaledMin + rng() * (scaledMax - scaledMin));
  return [scaledMin, scaledMax, val];
}

function compileRulesForQuality(
  designRules,
  level,
  qualityMeta,
  rng,
  reserveStatBudget = 0,
  ruleRevision = 0,
) {
  const lvlScale = combatScale(level);
  const mpScale = Math.sqrt(lvlScale);
  const effectRatios = [];
  const rawList = Array.isArray(designRules) ? designRules.slice(0, qualityMeta.maxRules) : [];
  const rules = [];
  for (const rule of rawList) {
    if (rule.mode === 'continuous' && !qualityMeta.allowContinuous) continue;
    const versionedScope = ruleRevision === 2 && rule.mode === 'event';
    const triggerScope = versionedScope ? rule.scope || 'expedition' : null;
    const scopeScale = triggerScope ? EQUIPMENT_TRIGGER_SCOPE_MULTIPLIERS[triggerScope] || 1 : 1;
    const hostile = ['lowestEnemy', 'allEnemies'].includes(rule.target);
    const maxEff = Math.max(1, qualityMeta.maxEffects);
    const effects = [];
    for (const effect of (rule.effects || []).slice(0, maxEff)) {
      if (effect.type === 'cleanse') {
        if (effect.buffs === undefined) {
          effects.push({ type: 'cleanse' });
          continue;
        }
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
          const min = Math.max(
            1,
            Math.floor(bMin * qualityMeta.powerScale * lvlScale * scopeScale * 0.85),
          );
          const max = Math.max(
            min,
            Math.ceil(bMax * qualityMeta.powerScale * lvlScale * scopeScale * 1.15),
          );
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
            scopeScale,
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
            ? Math.sqrt(qualityMeta.powerScale) * mpScale * Math.sqrt(scopeScale)
            : qualityMeta.powerScale * lvlScale * scopeScale;
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
      ...(rule.mode === 'event'
        ? {
            scope: triggerScope || 'expedition',
            ...(versionedScope ? { triggerRevision: 2 } : {}),
            limit: versionedScope
              ? equipmentTriggerLimit(triggerScope, qualityMeta.tier)
              : qualityMeta.tier >= 4
                ? 3
                : 1,
          }
        : {}),
      target: rule.target,
      conditions: cleanConditions,
      effects,
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
      ...(rule.scope && rule.scope !== 'round' ? { scope: rule.scope } : {}),
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
    effectiveDesign.ruleRevision,
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
  const explicitCategory =
    normalizeEquipmentCategory(raw.category) || normalizeEquipmentCategory(source.category);
  const category = explicitCategory || inferLegacyEquipmentCategory(raw.name, source.id);
  const legacyCategorized = !explicitCategory || raw.legacyCategorized === true;
  const dcBonus =
    category === 'gem' && raw.dcBonus && typeof raw.dcBonus === 'object'
      ? structuredClone(raw.dcBonus)
      : undefined;
  const equipment = {
    id: source.id,
    name: raw.name.trim(),
    category,
    ...(legacyCategorized ? { legacyCategorized: true } : {}),
    description: raw.description.trim() || (dcBonus ? gemBonusText(dcBonus) : ''),
    ...(typeof raw.flavor === 'string' && raw.flavor.trim() ? { flavor: raw.flavor.trim() } : {}),
    price: source.value,
    level,
    quality,
    map: source.map || source.source?.map || 'ruins',
    sourceName: source.name,
    sourceDescription: source.description || raw.sourceDescription || '',
    stats,
    rules: normalizeRules(raw.rules || []),
    ...(dcBonus ? { dcBonus } : {}),
    ...(raw.design ? { design: structuredClone(raw.design) } : {}),
    ...(raw.statRanges ? { statRanges: structuredClone(raw.statRanges) } : {}),
    ...(Number.isInteger(raw.rollPercent) ? { rollPercent: raw.rollPercent } : {}),
  };
  if (!Object.keys(stats).length && !equipment.rules.length && !dcBonus)
    throw Error('装备至少需要一项属性或规则');
  if (equipmentCost(equipment) > equipmentBudget(source, quality))
    throw Error('装备超过原物品的以太强度预算：' + source.name);
  return equipment;
}

function restoreOwnedInstance(item, template) {
  const category = normalizeEquipmentCategory(item.category) || template.category;
  if (category === 'gem') {
    const gem = findGemById(item.templateId) || template;
    const dcBonus = structuredClone(item.dcBonus || gem.dcBonus || {});
    return {
      id: item.id,
      templateId: item.templateId,
      category: 'gem',
      level: 1,
      quality: gem.quality || 'common',
      stats: {},
      rules: [],
      investedEther: 0,
      dcBonus,
      description: gemBonusText(dcBonus),
      ...(gem.flavor ? { flavor: gem.flavor } : {}),
    };
  }
  const level = clampEquipmentLevel(item.level ?? template.level ?? 1);
  const quality = resolveEquipmentQuality(item.quality ?? template.quality, template.price);
  const stats =
    item.stats && typeof item.stats === 'object' ? structuredClone(item.stats) : undefined;
  const rules = Array.isArray(item.rules) ? normalizeRules(item.rules) : undefined;
  const entry = {
    id: item.id,
    templateId: item.templateId,
    category,
    level,
    quality,
    investedEther: Number.isFinite(item.investedEther)
      ? Math.max(0, Math.trunc(item.investedEther))
      : Math.max(0, Math.trunc(Number(template.price) || 0)),
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
            category: item.category,
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
    const template =
      catalog.find((entry) => entry.id === item.templateId) || findGemById(item.templateId);
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
    affixesByTemplate: restoreEquipmentAffixes(value?.affixesByTemplate, catalog),
    favorites: (value?.favorites || []).filter((id) => catalog.some((item) => item.id === id)),
    hidden: (value?.hidden || []).filter((id) => catalog.some((item) => item.id === id)),
  };
}
