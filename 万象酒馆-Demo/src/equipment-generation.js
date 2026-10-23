import {
  normalizeEquipment,
  equipmentBudget,
  equipmentCost,
  EQUIPMENT_STATS,
} from './equipment.js';
import { normalizeRules, TRIGGER_EVENTS, POSITIVE_BUFFS, NEGATIVE_BUFFS } from './triggers.js';
import { finalPassiveText } from './skill-text.js';

export function equipmentGenerationPlan(source) {
  const tier =
    source.value <= 10
      ? 1
      : source.value <= 30
        ? 2
        : source.value <= 80
          ? 3
          : source.value <= 200
            ? 4
            : 5;
  return {
    tier,
    budget: equipmentBudget(source.value),
    maxStats: Math.min(3, tier + 1),
    stats: Object.keys(EQUIPMENT_STATS).filter(
      (key) =>
        !['limit', 'manaCost'].includes(key) || (key === 'manaCost' ? tier >= 4 : tier === 5),
    ),
    maxRules: tier === 1 ? 0 : tier === 5 ? 2 : 1,
    maxEffects: tier >= 4 ? 2 : 1,
    maxConditions: tier >= 3 ? 1 : 0,
    continuous: tier >= 4,
    targets:
      tier >= 4
        ? [
            'self',
            'lowestAlly',
            'allAllies',
            'frontAllies',
            'rearAllies',
            'lowestEnemy',
            'allEnemies',
          ]
        : ['self', 'lowestAlly', 'lowestEnemy'],
    events: Object.keys(TRIGGER_EVENTS),
    powers: ['low', 'standard', 'high'],
    instruction:
      '只选择statFocus、触发时机、条件、目标和效果power档位；不填写基础属性点数、伤害、buff层数或触发次数。代码会按来源价值分配最终数值。不得创造额外技能、标记、递归或改变游戏规则。',
  };
}

/** Value is code-owned. AI provides a bounded mechanism, never its final numerical strength. */
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
    throw Error('装备设计不符合该以太价值档位');
  let seed = 2166136261;
  for (const char of `${source.id}:${source.value}:${source.name}`)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619);
  const roll = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const rules = design.rules.map((rule) => {
    if (
      !['mode', 'event', 'target', 'conditions', 'effects'].every(
        (key) => key in rule || key === 'event',
      ) ||
      Object.keys(rule).some(
        (key) => !['mode', 'event', 'target', 'conditions', 'effects'].includes(key),
      ) ||
      !plan.targets.includes(rule.target) ||
      !Array.isArray(rule.conditions) ||
      rule.conditions.length > plan.maxConditions ||
      rule.conditions.some(
        (condition) => condition.subject === 'target' || condition.type === 'mark',
      ) ||
      !Array.isArray(rule.effects) ||
      !rule.effects.length ||
      rule.effects.length > plan.maxEffects ||
      (rule.mode === 'continuous' && !plan.continuous)
    )
      throw Error('装备事件复杂度超出价值档位');
    const hostile = ['lowestEnemy', 'allEnemies'].includes(rule.target);
    const effects = rule.effects.map((effect) => {
      if (
        !plan.powers.includes(effect.power) ||
        !['damage', 'heal', 'mana', 'shield', 'buff', 'cleanse'].includes(effect.type) ||
        Object.keys(effect).some((key) => !['type', 'power', 'buff', 'buffs'].includes(key))
      )
        throw Error('装备效果档位无效');
      if (
        (effect.type === 'damage' && !hostile) ||
        (['heal', 'mana', 'shield', 'cleanse'].includes(effect.type) && hostile) ||
        (effect.type === 'buff' &&
          !(hostile ? NEGATIVE_BUFFS : POSITIVE_BUFFS).includes(effect.buff))
      )
        throw Error('装备效果目标阵营无效');
      if (effect.type === 'cleanse') {
        if (
          !Array.isArray(effect.buffs) ||
          !effect.buffs.length ||
          effect.buffs.some((key) => !NEGATIVE_BUFFS.includes(key))
        )
          throw Error('装备净化状态无效');
        return {
          type: 'cleanse',
          buffs: [...new Set(effect.buffs)].slice(0, plan.tier >= 4 ? 2 : 1),
        };
      }
      const power = { low: 0.6, standard: 0.85, high: 1 }[effect.power];
      const value =
        effect.type === 'buff'
          ? 1
          : Math.max(1, Math.min(10, Math.floor((1 + plan.tier * power) * (0.8 + roll() * 0.2))));
      return { type: effect.type, value, ...(effect.type === 'buff' ? { buff: effect.buff } : {}) };
    });
    return {
      ...rule,
      effects,
      ...(rule.mode === 'event' ? { limit: plan.tier >= 4 ? 3 : 1, scope: 'expedition' } : {}),
    };
  });
  const equipment = { stats: {}, rules: normalizeRules(rules) };
  // Spend at most half on event effects; low-value pieces may compile to useful stats alone.
  while (
    equipment.rules.length &&
    equipmentCost(equipment) > Math.floor(plan.budget * (plan.tier >= 4 ? 0.85 : 0.65))
  ) {
    const rule = equipment.rules.at(-1);
    const effect = rule.effects.find((entry) => entry.type !== 'buff' && entry.value > 1);
    if (effect) effect.value--;
    else equipment.rules.pop();
  }
  const caps = { hp: 20, mp: 12, attack: 5, skillDamage: 5, manaCost: 1, limit: 1 };
  const allocation = ['hp', ...design.statFocus];
  const target = Math.max(1, Math.floor(plan.budget * (0.85 + roll() * 0.15)));
  for (let points = 0; points < 150; points++) {
    const eligible = allocation.filter(
      (key) =>
        (equipment.stats[key] || 0) < caps[key] &&
        equipmentCost({
          ...equipment,
          stats: { ...equipment.stats, [key]: (equipment.stats[key] || 0) + 1 },
        }) <= target,
    );
    if (!eligible.length) break;
    const key = eligible[Math.floor(roll() * eligible.length)];
    equipment.stats[key] = (equipment.stats[key] || 0) + 1;
  }
  // Small leftover fractions still yield a safe, non-empty piece.
  if (!Object.keys(equipment.stats).length && !equipment.rules.length) equipment.stats.hp = 1;
  const statText = Object.entries(equipment.stats)
    .map(([key, value]) => `${EQUIPMENT_STATS[key]}+${value}`)
    .join('，');
  const description = [statText, finalPassiveText({ rules: equipment.rules })]
    .filter(Boolean)
    .join('；');
  return normalizeEquipment({ ...raw, ...equipment, description }, source);
}
