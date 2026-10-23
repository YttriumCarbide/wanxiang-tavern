import { BUFFS } from './data.js';

export const TRIGGER_EVENTS = Object.freeze({
  battleStart: '每场战斗开始',
  roundStart: '回合开始',
  roundEnd: '回合结束',
  enterFront: '进入前场',
  enterRear: '进入后场',
  beforeAttack: '进攻前',
  afterAttack: '进攻后',
  skillCast: '释放主动技能',
  damageDealt: '造成生命伤害',
  damageTaken: '受到生命伤害',
  kill: '击杀敌人',
  healed: '获得治疗',
  manaSpent: '消耗法力',
  manaRestored: '恢复法力',
  itemUsed: '玩家使用道具',
  gainPositive: '获得正面状态',
  gainNegative: '获得负面状态',
  gainBuff: '获得任意状态',
});
export const TRIGGER_TARGETS = Object.freeze({
  self: '自身',
  target: '本次行动目标',
  attacker: '伤害来源',
  allAllies: '全体存活队友',
  frontAllies: '前场队友',
  rearAllies: '后场队友',
  lowestAlly: '生命比例最低队友',
  allEnemies: '全体存活敌人',
  lowestEnemy: '生命最低敌人',
});
export const POSITIVE_BUFFS = Object.freeze([
  'haste',
  'strength',
  'guard',
  'regen',
  'iron',
  'meteor',
  'overload',
]);
export const NEGATIVE_BUFFS = Object.freeze([
  'bind',
  'weak',
  'vulnerable',
  'poison',
  'slow',
  'bleed',
]);

function integer(value, min, max, label) {
  if (!Number.isInteger(value) || value < min || value > max) throw Error(label + '无效');
  return value;
}
export function normalizeCondition(condition) {
  const { type, value } = condition;
  const subject = condition.subject === undefined ? {} : { subject: condition.subject };
  if (condition.subject !== undefined && !['self', 'target'].includes(condition.subject))
    throw Error('条件对象无效');
  if (
    ['front', 'rear', 'hasPositive', 'hasNegative', 'hasBuff', 'hasShield', 'noBuff'].includes(type)
  )
    return { type, ...subject };
  if (['hpBelow', 'hpAbove', 'mpBelow', 'mpAbove'].includes(type))
    return { type, value: integer(value, 0, 100, '资源百分比'), ...subject };
  if (type === 'roundAtLeast')
    return { type, value: integer(value, 0, 99, '回合条件'), ...subject };
  if (type === 'mark') return { type, value: integer(value, 1, 3, '标记层数'), ...subject };
  if (type === 'buff' && Object.hasOwn(BUFFS, condition.buff))
    return { type, buff: condition.buff, value: integer(value, 1, 9, '状态层数'), ...subject };
  throw Error('触发条件无效');
}
export function effectMetadata(effect) {
  const result = {};
  if (effect.target !== undefined) {
    if (!['self', 'target', 'lowestAlly', 'allAllies', 'allEnemies'].includes(effect.target))
      throw Error('效果目标无效');
    result.target = effect.target;
  }
  if (effect.when) result.when = normalizeCondition(effect.when);
  if (effect.perMark !== undefined) result.perMark = integer(effect.perMark, 1, 8, '标记强化');
  if (effect.consumeMark === true) result.consumeMark = true;
  return result;
}
export function normalizeRules(value) {
  if (!Array.isArray(value) || value.length > 4) throw Error('触发规则最多四条');
  return value.map((rule, index) => {
    if (!['event', 'continuous'].includes(rule.mode)) throw Error('触发模式无效');
    if (rule.mode === 'event' && !Object.hasOwn(TRIGGER_EVENTS, rule.event))
      throw Error('触发事件无效');
    if (!Object.hasOwn(TRIGGER_TARGETS, rule.target)) throw Error('触发目标无效');
    const conditions = rule.conditions || [];
    if (!Array.isArray(conditions) || conditions.length > 6)
      throw Error('条件最多六项，全部同时满足');
    const checked = conditions.map(normalizeCondition);
    if (!Array.isArray(rule.effects) || !rule.effects.length || rule.effects.length > 3)
      throw Error('每条规则需要一至三项效果');
    const effects = rule.effects.map((effect) => {
      if (
        rule.mode === 'continuous' &&
        (effect.type !== 'buff' || !POSITIVE_BUFFS.includes(effect.buff))
      )
        throw Error('持续效果只支持正面状态光环');
      if (!['damage', 'heal', 'mana', 'shield', 'buff', 'cleanse', 'mark'].includes(effect.type))
        throw Error('触发效果无效');
      if (effect.type === 'cleanse') {
        if (
          !Array.isArray(effect.buffs) ||
          !effect.buffs.length ||
          effect.buffs.some((key) => !Object.hasOwn(BUFFS, key))
        )
          throw Error('净化状态无效');
        return { type: 'cleanse', buffs: [...new Set(effect.buffs)], ...effectMetadata(effect) };
      }
      if (effect.type === 'buff' && !Object.hasOwn(BUFFS, effect.buff)) throw Error('触发状态无效');
      return {
        type: effect.type,
        value: integer(
          effect.value,
          1,
          ['buff', 'mark'].includes(effect.type) ? 3 : 20,
          '触发数值',
        ),
        ...(effect.type === 'buff' ? { buff: effect.buff } : {}),
        ...effectMetadata(effect),
      };
    });
    if (rule.scope && !['round', 'battle', 'expedition'].includes(rule.scope))
      throw Error('触发次数范围无效');
    return {
      id: 'rule-' + index,
      mode: rule.mode,
      ...(rule.mode === 'event'
        ? {
            event: rule.event,
            limit: integer(rule.limit, 1, 50, '触发次数'),
            ...(rule.scope ? { scope: rule.scope } : {}),
          }
        : {}),
      conditions: checked,
      target: rule.target,
      effects,
    };
  });
}

/** Legacy passive fields are adapters into the same rule evaluator. */
export function rulesFor(definition) {
  const result = [];
  for (const skill of definition.skills || []) {
    if (!skill.passive) continue;
    let rules = skill.rules;
    const conditions =
      skill.location === '前场'
        ? [{ type: 'front' }]
        : skill.location === '后场'
          ? [{ type: 'rear' }]
          : [];
    if (!rules && (skill.buff || skill.teamFrontBuff))
      rules = [
        {
          mode: 'continuous',
          conditions,
          target: skill.teamFrontBuff ? 'frontAllies' : 'self',
          effects: [{ type: 'buff', buff: skill.buff || skill.teamFrontBuff, value: skill.value }],
        },
      ];
    if (!rules && skill.endHeal)
      rules = [
        {
          mode: 'event',
          event: 'roundEnd',
          conditions,
          target: 'lowestAlly',
          effects: [{ type: 'heal', value: skill.endHeal }],
          limit: 1000000,
        },
      ];
    for (const [index, rule] of (rules || []).entries())
      result.push({ ...rule, key: 'passive:' + skill.id + ':' + index, name: skill.name });
  }
  for (const equipment of definition.equipment || [])
    for (const [index, rule] of equipment.rules.entries())
      result.push({
        ...rule,
        key: 'equipment:' + equipment.id + ':' + index,
        name: equipment.name,
      });
  return result.flatMap((rule) => {
    if (rule.mode !== 'continuous' || !rule.effects.some((effect) => effect.buff === 'regen'))
      return [rule];
    const permanent = rule.effects.filter((effect) => effect.buff !== 'regen');
    const finite = {
      ...rule,
      key: rule.key + ':regen',
      mode: 'event',
      event: 'conditionStart',
      scope: 'battle',
      limit: 1,
      effects: rule.effects.filter((effect) => effect.buff === 'regen'),
    };
    return permanent.length ? [{ ...rule, effects: permanent }, finite] : [finite];
  });
}
export function conditionsMet(state, owner, conditions = [], context = {}) {
  if (!state.units[owner] || state.units[owner].hp <= 0) return false;
  return conditions.every(({ type, value, buff, subject }) => {
    const id = subject === 'target' ? context.target : owner;
    const unit = state.units[id];
    if (!unit || unit.hp <= 0) return false;
    const has = (keys) => keys.some((key) => unit.buffs[key] > 0);
    const position = state.formation.indexOf(id);
    if (type === 'front') return position >= 0 && position < 3;
    if (type === 'rear') return position >= 3;
    if (type === 'hasPositive') return has(POSITIVE_BUFFS);
    if (type === 'hasNegative') return has(NEGATIVE_BUFFS);
    if (type === 'hasBuff') return has(Object.keys(BUFFS));
    if (type === 'noBuff') return !has(Object.keys(BUFFS));
    if (type === 'hasShield') return unit.block > 0;
    if (type === 'buff') return (unit.buffs[buff] || 0) >= value;
    if (type === 'roundAtLeast') return state.round >= value;
    if (type === 'mark')
      return (id === owner && context.mark !== undefined ? context.mark : unit.mark || 0) >= value;
    const ratio = type.startsWith('hp')
      ? unit.hp / unit.maxHp
      : unit.maxMp
        ? unit.mp / unit.maxMp
        : 0;
    return type.endsWith('Below') ? ratio * 100 <= value : ratio * 100 >= value;
  });
}
export function triggerTargets(state, owner, target, event = {}) {
  const allies = Object.values(state.units).filter(
    (u) => u.side === state.units[owner].side && u.hp > 0,
  );
  const enemies = Object.values(state.units).filter(
    (u) => u.side !== state.units[owner].side && u.hp > 0,
  );
  if (target === 'self') return [owner];
  if (target === 'target') return (event.targets || []).filter((id) => state.units[id]?.hp > 0);
  if (target === 'attacker') return state.units[event.attacker]?.hp > 0 ? [event.attacker] : [];
  if (target === 'lowestAlly')
    return allies
      .sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)
      .slice(0, 1)
      .map((u) => u.id);
  if (target === 'lowestEnemy')
    return enemies
      .sort((a, b) => a.hp - b.hp)
      .slice(0, 1)
      .map((u) => u.id);
  if (target === 'allEnemies') return enemies.map((u) => u.id);
  return allies
    .filter(
      (u) =>
        target === 'allAllies' ||
        (target === 'frontAllies'
          ? state.formation.indexOf(u.id) >= 0 && state.formation.indexOf(u.id) < 3
          : state.formation.indexOf(u.id) >= 3),
    )
    .map((u) => u.id);
}
export function auraValue(state, definitions, id, buff) {
  let value = 0;
  for (const definition of definitions) {
    for (const rule of rulesFor(definition)) {
      if (
        rule.mode !== 'continuous' ||
        !conditionsMet(state, definition.id, rule.conditions, { target: id }) ||
        !triggerTargets(state, definition.id, rule.target).includes(id)
      )
        continue;
      for (const effect of rule.effects) if (effect.buff === buff) value += effect.value;
    }
  }
  return value;
}
