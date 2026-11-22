import {
  normalizeEquipment,
  EQUIPMENT_STATS,
  EQUIPMENT_QUALITIES,
  EQUIPMENT_CRAFT_CATEGORIES,
  normalizeEquipmentCategory,
  clampEquipmentLevel,
  resolveEquipmentQuality,
  hashSeed,
  materializeEquipment,
} from './equipment.js';
import {
  TRIGGER_EVENTS,
  EXCLUSIVE_BUFFS,
  GENERATED_POSITIVE_BUFFS,
  NEGATIVE_BUFFS,
} from './triggers.js';

export function equipmentGenerationPlan(source) {
  const qualityKey = resolveEquipmentQuality(source?.quality, source?.value);
  const q = EQUIPMENT_QUALITIES[qualityKey];
  const level = clampEquipmentLevel(source?.level || 1);
  return {
    tier: q.tier,
    quality: q.id,
    qualityName: q.name,
    level,
    categories: EQUIPMENT_CRAFT_CATEGORIES,
    maxStats: q.statCount,
    stats: Object.keys(EQUIPMENT_STATS).filter(
      (key) =>
        !['limit', 'manaCost'].includes(key) ||
        (key === 'manaCost' ? q.allowManaCost : q.allowLimit),
    ),
    maxRules: q.maxRules,
    maxEffects: q.maxEffects,
    maxConditions: q.maxConditions,
    continuous: q.allowContinuous,
    triggerScopes: ['unlimited', 'battle', 'expedition'],
    scopeRestrictions: {
      unlimitedNonDotBuffs: q.tier >= 4,
      unlimitedCleanse: q.tier >= 3,
    },
    targets:
      q.tier >= 4
        ? [
            'self',
            'lowestAlly',
            'allAllies',
            'frontAllies',
            'rearAllies',
            'lowestEnemy',
            'allEnemies',
          ]
        : q.tier >= 3
          ? ['self', 'lowestAlly', 'frontAllies', 'lowestEnemy', 'allEnemies']
          : ['self', 'lowestAlly', 'lowestEnemy'],
    events: Object.keys(TRIGGER_EVENTS),
    powers: ['low', 'medium', 'high'],
    instruction:
      '只从designPlan中选择statFocus、触发时机、条件、目标、事件规则的scope（unlimited/battle/expedition）和定性power档位（low/medium/high）；绝不填写budget、price、limit、具体点数或状态层数。scope不填时按expedition兼容处理。代码会按品质、等级和触发范围换算效果数值与次数。',
  };
}

/** Value and level scaling remain code-owned; AI only picks qualitative archetypes. */
export function compileEquipmentDesign(raw, source) {
  const plan = equipmentGenerationPlan(source);
  const design = raw.design;
  if (
    !design ||
    !Array.isArray(design.statFocus) ||
    !design.statFocus.length ||
    design.statFocus.length > plan.maxStats ||
    new Set(design.statFocus).size !== design.statFocus.length ||
    design.statFocus.some((key) => !plan.stats.includes(key)) ||
    !Array.isArray(design.rules) ||
    design.rules.length > plan.maxRules ||
    Object.keys(design).some((key) => !['statFocus', 'rules'].includes(key))
  )
    throw Error('装备设计不符合该以太品质档位');

  const allowedPowers = new Set([...plan.powers, 'standard']);
  const validatedRules = design.rules.map((rule) => {
    if (
      !['mode', 'event', 'target', 'conditions', 'effects'].every(
        (key) => key in rule || key === 'event',
      ) ||
      Object.keys(rule).some(
        (key) => !['mode', 'event', 'scope', 'target', 'conditions', 'effects'].includes(key),
      ) ||
      !plan.targets.includes(rule.target) ||
      (rule.scope !== undefined && !plan.triggerScopes.includes(rule.scope)) ||
      (rule.mode !== 'event' && rule.scope !== undefined) ||
      !Array.isArray(rule.conditions) ||
      rule.conditions.length > plan.maxConditions ||
      rule.conditions.some(
        (condition) =>
          condition.subject === 'target' ||
          condition.type === 'mark' ||
          EXCLUSIVE_BUFFS.includes(condition.buff),
      ) ||
      !Array.isArray(rule.effects) ||
      !rule.effects.length ||
      rule.effects.length > plan.maxEffects ||
      (rule.mode === 'continuous' && !plan.continuous)
    )
      throw Error('装备事件复杂度超出品质档位');
    if (
      rule.scope === 'unlimited' &&
      !plan.scopeRestrictions.unlimitedNonDotBuffs &&
      rule.effects.some(
        (effect) => effect.type === 'buff' && !['poison', 'bleed'].includes(effect.buff),
      )
    )
      throw Error('无限触发的离散增益需要史诗及以上品质');
    if (
      rule.scope === 'unlimited' &&
      !plan.scopeRestrictions.unlimitedCleanse &&
      rule.effects.some((effect) => effect.type === 'cleanse')
    )
      throw Error('无限触发的净化需要稀有及以上品质');
    const hostile = ['lowestEnemy', 'allEnemies'].includes(rule.target);
    const effects = rule.effects.map((effect) => {
      if (
        !allowedPowers.has(effect.power) ||
        !['damage', 'heal', 'mana', 'shield', 'buff', 'cleanse'].includes(effect.type) ||
        Object.keys(effect).some((key) => !['type', 'power', 'buff', 'buffs'].includes(key))
      )
        throw Error('装备效果档位无效');
      if (
        (effect.type === 'damage' && !hostile) ||
        (['heal', 'mana', 'shield', 'cleanse'].includes(effect.type) && hostile) ||
        (effect.type === 'buff' &&
          (!(hostile ? NEGATIVE_BUFFS : GENERATED_POSITIVE_BUFFS).includes(effect.buff) ||
            (rule.mode === 'continuous' && effect.buff === 'artifact')))
      )
        throw Error('装备效果目标阵营无效');
      if (effect.type === 'cleanse') {
        const power = effect.power === 'standard' ? 'medium' : effect.power;
        if (effect.buffs === undefined) return { type: 'cleanse', power };
        if (
          !Array.isArray(effect.buffs) ||
          !effect.buffs.length ||
          effect.buffs.some((key) => !NEGATIVE_BUFFS.includes(key))
        )
          throw Error('装备净化状态无效');
        return {
          type: 'cleanse',
          power,
          buffs: [...new Set(effect.buffs)].slice(0, plan.tier >= 4 ? 2 : 1),
        };
      }
      return {
        type: effect.type,
        power: effect.power === 'standard' ? 'medium' : effect.power,
        ...(effect.type === 'buff' ? { buff: effect.buff } : {}),
      };
    });
    return {
      mode: rule.mode,
      ...(rule.mode === 'event' ? { event: rule.event } : {}),
      ...(rule.mode === 'event' ? { scope: rule.scope || 'expedition' } : {}),
      target: rule.target,
      conditions: structuredClone(rule.conditions),
      effects,
    };
  });

  const normalizedDesign = {
    ruleRevision: 2,
    statFocus: [...design.statFocus],
    rules: validatedRules,
  };
  const seed = hashSeed(
    `${source.id}:${source.value}:${source.name}:${plan.level}:${plan.quality}`,
  );
  const compiled = materializeEquipment({
    design: normalizedDesign,
    level: plan.level,
    quality: plan.quality,
    seed,
  });

  const isVoucherForged = Boolean(source?.voucherForged);
  const category = isVoucherForged
    ? normalizeEquipmentCategory(source?.category) || normalizeEquipmentCategory(raw.category)
    : normalizeEquipmentCategory(raw.category) || normalizeEquipmentCategory(source?.category);
  if (category === 'gem') throw Error('宝石来自预设掉落池，不由造物 API 构筑');
  if (
    isVoucherForged &&
    (!raw.name ||
      typeof raw.name !== 'string' ||
      !raw.name.trim() ||
      /未命名|待命名/.test(raw.name))
  ) {
    throw Error('兑换券凝聚装备缺少正式名称');
  }

  return normalizeEquipment(
    {
      ...raw,
      ...(category ? { category } : {}),
      ...(isVoucherForged
        ? {
            sourceName: '装备兑换券凝聚',
            sourceDescription: `消耗装备兑换券凝聚（Lv.${compiled.level} ${EQUIPMENT_QUALITIES[compiled.quality]?.name || compiled.quality}）`,
          }
        : {}),
      flavor: typeof raw.description === 'string' ? raw.description.trim() : '',
      description: compiled.description,
      level: compiled.level,
      quality: compiled.quality,
      design: normalizedDesign,
      stats: compiled.stats,
      rules: compiled.rules,
      statRanges: compiled.statRanges,
      rollPercent: compiled.rollPercent,
    },
    {
      ...source,
      ...(isVoucherForged
        ? {
            name: '装备兑换券凝聚',
            description: `消耗装备兑换券凝聚（Lv.${compiled.level} ${EQUIPMENT_QUALITIES[compiled.quality]?.name || compiled.quality}）`,
          }
        : {}),
      level: compiled.level,
      quality: compiled.quality,
    },
  );
}
