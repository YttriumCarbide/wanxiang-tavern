import { BUFFS } from './data.js';
import { resourceText } from './resource-text.js';
import { TRIGGER_EVENTS, TRIGGER_TARGETS } from './triggers.js';

const NEGATIVE_BUFF_KEYS = new Set([
  'blind',
  'bind',
  'weak',
  'vulnerable',
  'poison',
  'slow',
  'bleed',
]);

const NATURAL_EVENTS = Object.freeze({
  ...TRIGGER_EVENTS,
  battleStart: '战斗开始时',
  roundStart: '每回合开始时',
  roundEnd: '每回合结束时',
  enterFront: '进入前场时',
  enterRear: '退至后场时',
  beforeAttack: '进攻前',
  afterAttack: '进攻后',
  skillCast: '施放主动技能时',
  damageDealt: '造成生命伤害后',
  damageTaken: '受到生命伤害后',
  kill: '击杀敌人后',
  healed: '获得治疗后',
  manaSpent: '消耗法力后',
  manaRestored: '回复法力后',
  itemUsed: '使用道具后',
  gainPositive: '获得正面状态后',
  gainNegative: '受到负面状态后',
  gainBuff: '获得状态后',
});

const NATURAL_TARGETS = Object.freeze({
  ...TRIGGER_TARGETS,
  target: '当前目标',
  attacker: '攻击者',
  allAllies: '全体存活队友',
  frontAllies: '前场队友',
  rearAllies: '后场队友',
  lowestAlly: '生命比例最低的队友',
  allEnemies: '全体存活敌人',
  lowestEnemy: '当前生命最低的敌人',
});

const EQUIPMENT_STAT_FORMATTERS = Object.freeze({
  hp: (value) => `生命上限 +${value}`,
  mp: (value) => `法力上限 +${value}`,
  attack: (value) => `普攻伤害 +${value}`,
  skillDamage: (value) => `技能伤害 +${value}`,
  limit: (value) => `每回合行动次数 +${value}`,
  manaCost: (value) => `技能法力消耗 -${value}`,
});

function conditionText(condition, markName = '标记', omitSelf = false) {
  const who = condition.subject === 'target' ? '目标' : omitSelf ? '' : '自身';
  const names = {
    front: '位于前场',
    rear: '位于后场',
    hasPositive: '带有正面状态',
    hasNegative: '带有负面状态',
    hasBuff: '带有任意状态',
    noBuff: '无任何状态',
    hasShield: '持有护盾',
  };
  if (names[condition.type]) return `${who}${names[condition.type]}`;
  if (condition.type === 'mark') return `${who}${markName}达到${condition.value}层`;
  if (condition.type === 'buff')
    return `${who}${BUFFS[condition.buff]?.name || condition.buff}达到${condition.value}层`;
  if (condition.type === 'roundAtLeast') return `第${condition.value}回合起`;
  const resource = condition.type.startsWith('hp') ? 'hp' : 'sp';
  return `${who}${resource}${condition.type.endsWith('Below') ? '不高于' : '不低于'}${condition.value}%`;
}

function effectText(effect, target = '目标', markName = '标记', natural = false) {
  let description = '';
  if (effect.type === 'damage')
    description = `对${target}造成${effect.value}${natural ? '点' : ''}伤害`;
  else if (effect.type === 'heal')
    description = `为${target}回复${effect.maxHpPercent ? `最大hp的${Math.round(effect.maxHpPercent * 100)}%` : `${effect.value}${natural ? '点' : ''}hp`}`;
  else if (effect.type === 'selfHeal') description = `自身回复${effect.value}hp`;
  else if (effect.type === 'selfMana' || effect.type === 'mana')
    description = `${effect.type === 'selfMana' ? '自身' : target}回复${effect.value}${natural ? '点' : ''}sp`;
  else if (effect.type === 'shield' || effect.type === 'selfShield')
    description = `${effect.type === 'selfShield' ? '自身' : target}获得${effect.value}${natural ? '点' : ''}护盾`;
  else if (effect.type === 'buff') {
    const buffName = BUFFS[effect.buff]?.name || effect.buff;
    if (natural && NEGATIVE_BUFF_KEYS.has(effect.buff)) {
      description =
        target === '自身'
          ? `自身承受${effect.value}层${buffName}`
          : `对${target}施加${effect.value}层${buffName}`;
    } else {
      description = `${target}获得${effect.value}层${buffName}`;
    }
  } else if (effect.type === 'cleanse')
    description = `净化${target}的${effect.buffs.map((key) => BUFFS[key]?.name || key).join('、')}`;
  else if (effect.type === 'mark')
    description = `${target}获得${effect.value}层${markName}，最多3层`;
  if (effect.perMark)
    description += `，每层${markName}增加${effect.perMark}${effect.type === 'damage' ? '伤害' : effect.type === 'heal' ? 'hp回复' : '护盾'}${effect.consumeMark ? '并消耗全部标记' : ''}`;
  return (effect.when ? `${conditionText(effect.when, markName)}时，` : '') + description;
}

function effectTarget(effect, fallback, targets = TRIGGER_TARGETS) {
  return (
    {
      self: '自身',
      lowestAlly: targets.lowestAlly || '生命比例最低的队友',
      allAllies: targets.allAllies || '所有队友',
      allEnemies: targets.allEnemies || '所有敌人',
      target: fallback,
    }[effect.target] || fallback
  );
}

/** Format equipment static stat bonuses in clear Chinese gameplay vocabulary. */
export function formatEquipmentStats(stats = {}) {
  const order = ['hp', 'mp', 'attack', 'skillDamage', 'limit', 'manaCost'];
  return resourceText(
    order
      .filter((key) => stats[key])
      .map((key) => EQUIPMENT_STAT_FORMATTERS[key](stats[key]))
      .join('，'),
  );
}

/** Passive cards and equipment rules display executable effects in natural Chinese. */
export function finalPassiveText(skill, markName = '标记') {
  if (skill.rules)
    return resourceText(
      skill.rules
        .map((rule) => {
          const conditions = rule.conditions
            ?.map((condition) => conditionText(condition, markName, true))
            .join('且');
          const timing = rule.mode === 'event' ? NATURAL_EVENTS[rule.event] || rule.event : '常驻';
          const target = NATURAL_TARGETS[rule.target] || '自身';
          const effects = rule.effects
            .map(
              (effect) =>
                effectText(effect, effectTarget(effect, target, NATURAL_TARGETS), markName, true) +
                (rule.mode === 'continuous' && effect.buff === 'regen'
                  ? '（条件首次满足时获得，本场限1次，正常衰减）'
                  : ''),
            )
            .join('，');
          const scope = { round: '每回合', battle: '每场战斗', expedition: '每次副本' }[
            rule.scope || 'expedition'
          ];
          if (rule.mode === 'continuous') {
            return `${conditions ? `${conditions}时，` : ''}常驻${effects}。`;
          }
          return `${timing}${conditions ? `，若${conditions}` : ''}，${effects}（${scope}最多${rule.limit}次）。`;
        })
        .join(''),
    );
  const location = skill.location && skill.location !== '全战斗' ? `${skill.location}时，` : '';
  if (skill.buff === 'regen')
    return `${location}本场首次满足条件时获得${skill.value}层再生，随后正常衰减。`;
  if (skill.buff)
    return `${location}自身持续获得${skill.value}层${BUFFS[skill.buff]?.name || skill.buff}。`;
  if (skill.teamFrontBuff)
    return `${location}前场队友持续获得${skill.value}层${BUFFS[skill.teamFrontBuff]?.name || skill.teamFrontBuff}。`;
  if (skill.endHeal) return `${location}回合结束为生命比例最低的队友回复${skill.endHeal}hp。`;
  if (skill.bonusMp) return `战斗外增加${skill.bonusMp}sp上限。`;
  return resourceText(skill.text || '');
}

/** Single authoritative readable description for any equipment template or owned instance. */
export function equipmentDescription(equipment = {}) {
  const statText = formatEquipmentStats(equipment.stats || {});
  const ruleText = equipment.rules?.length ? finalPassiveText({ rules: equipment.rules }) : '';
  return [statText, ruleText].filter(Boolean).join('；');
}

/** Display the actual compiled effects, including growth, without explanatory growth suffixes. */
export function finalSkillText(skill, markName = '标记') {
  if (['libet-entry', 'melody-entry'].includes(skill.mechanic)) return resourceText(skill.text);
  if (skill.id === 'amber-song')
    return `为所有存活队友回复等同于自身${markName}层数的hp，并给予${skill.effects.find((effect) => effect.type === 'buff')?.value || 0}层力量；不消耗${markName}。`;
  if (skill.mechanic === 'junlue')
    return `造成${skill.effects.find((effect) => effect.type === 'damage')?.value || 0}伤害，目标下次攻击只能指向自己；目标下次获得正面状态或护盾时，自己也获得同等增益。`;
  if (['soul-revive', 'soul-banquet'].includes(skill.mechanic))
    return resourceText(skill.text || '');
  const parts = [];
  for (const effect of skill.effects || []) {
    const target = skill.adjacentAllies
      ? skill.includeSelf
        ? '自身及同排左右紧邻的存活队友'
        : '同排左右紧邻的存活队友（不含自身）'
      : skill.target === 'allEnemies'
        ? '所有敌人'
        : skill.target === 'allAllies'
          ? '所有队友'
          : skill.target === 'self'
            ? '自身'
            : '目标';
    parts.push(effectText(effect, effectTarget(effect, target), markName));
  }
  if (skill.consumeMarkCount)
    parts.push(`消耗自身${skill.consumeMarkCount}层${markName}（不足时扣至0）`);
  if (skill.basicAttackInjuredMark) parts.push('每个实际受到生命伤害的敌人为自身提供1层悠扬');
  return resourceText(parts.join('，') + '。');
}
