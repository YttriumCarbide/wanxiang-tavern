import { BUFFS } from './data.js';
import { resourceText } from './resource-text.js';
import { TRIGGER_EVENTS, TRIGGER_TARGETS } from './triggers.js';

function conditionText(condition, markName = '标记') {
  const who = condition.subject === 'target' ? '目标' : '自身';
  const names = {
    front: '位于前场',
    rear: '位于后场',
    hasPositive: '有正面状态',
    hasNegative: '有负面状态',
    hasBuff: '有状态',
    noBuff: '无状态',
    hasShield: '有护盾',
  };
  if (names[condition.type]) return `${who}${names[condition.type]}`;
  if (condition.type === 'mark') return `${who}${markName}达到${condition.value}层`;
  if (condition.type === 'buff')
    return `${who}${BUFFS[condition.buff]?.name || condition.buff}达到${condition.value}层`;
  if (condition.type === 'roundAtLeast') return `第${condition.value}回合起`;
  const resource = condition.type.startsWith('hp') ? 'hp' : 'sp';
  return `${who}${resource}${condition.type.endsWith('Below') ? '不高于' : '不低于'}${condition.value}%`;
}

function effectText(effect, target = '目标', markName = '标记') {
  let description = '';
  if (effect.type === 'damage') description = `对${target}造成${effect.value}伤害`;
  else if (effect.type === 'heal') description = `为${target}回复${effect.value}hp`;
  else if (effect.type === 'selfHeal') description = `自身回复${effect.value}hp`;
  else if (effect.type === 'selfMana' || effect.type === 'mana')
    description = `${effect.type === 'selfMana' ? '自身' : target}回复${effect.value}sp`;
  else if (effect.type === 'shield' || effect.type === 'selfShield')
    description = `${effect.type === 'selfShield' ? '自身' : target}获得${effect.value}护盾`;
  else if (effect.type === 'buff')
    description = `${target}获得${effect.value}层${BUFFS[effect.buff]?.name || effect.buff}`;
  else if (effect.type === 'cleanse')
    description = `净化${target}的${effect.buffs.map((key) => BUFFS[key]?.name || key).join('、')}`;
  else if (effect.type === 'mark')
    description = `${target}获得${effect.value}层${markName}，最多3层`;
  if (effect.perMark)
    description += `，每层${markName}增加${effect.perMark}${effect.type === 'damage' ? '伤害' : effect.type === 'heal' ? 'hp回复' : '护盾'}${effect.consumeMark ? '并消耗全部标记' : ''}`;
  return (effect.when ? `${conditionText(effect.when, markName)}时，` : '') + description;
}

function effectTarget(effect, fallback) {
  return (
    {
      self: '自身',
      lowestAlly: '生命比例最低的队友',
      allAllies: '所有队友',
      allEnemies: '所有敌人',
      target: fallback,
    }[effect.target] || fallback
  );
}

/** Passive cards display executable effects, never the setting's action description. */
export function finalPassiveText(skill, markName = '标记') {
  if (skill.rules)
    return resourceText(
      skill.rules
        .map((rule) => {
          const conditions = rule.conditions
            ?.map((condition) => conditionText(condition, markName))
            .join('且');
          const timing =
            rule.mode === 'event' ? TRIGGER_EVENTS[rule.event] || rule.event : '持续生效';
          const target = TRIGGER_TARGETS[rule.target] || '自身';
          const effects = rule.effects
            .map(
              (effect) =>
                effectText(effect, effectTarget(effect, target), markName) +
                (rule.mode === 'continuous' && effect.buff === 'regen'
                  ? '（条件首次满足时获得，本场限1次，正常衰减）'
                  : ''),
            )
            .join('，');
          const scope = { round: '每回合', battle: '每场战斗', expedition: '每次副本' }[
            rule.scope || 'expedition'
          ];
          return `${timing}${conditions ? `，${conditions}时` : ''}：${effects}${rule.mode === 'event' ? `；${scope}最多${rule.limit}次` : ''}。`;
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

/** Display the actual compiled effects, including growth, without explanatory growth suffixes. */
export function finalSkillText(skill, markName = '标记') {
  const parts = [];
  for (const effect of skill.effects || []) {
    const target =
      skill.target === 'allEnemies'
        ? '所有敌人'
        : skill.target === 'allAllies'
          ? '所有队友'
          : '目标';
    parts.push(effectText(effect, effectTarget(effect, target), markName));
  }
  return resourceText(parts.join('，') + '。');
}
