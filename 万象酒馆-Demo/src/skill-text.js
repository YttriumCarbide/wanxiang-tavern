import { BUFFS } from './data.js';

/** Display the actual compiled effects, including growth, without explanatory growth suffixes. */
export function finalSkillText(skill) {
  const parts = [];
  if (skill.hp) parts.push(`消耗${skill.hp}生命`);
  for (const effect of skill.effects || []) {
    const target =
      skill.target === 'allEnemies'
        ? '所有敌人'
        : skill.target === 'allAllies'
          ? '所有队友'
          : '目标';
    if (effect.type === 'damage') parts.push(`对${target}造成${effect.value}伤害`);
    else if (effect.type === 'heal') parts.push(`回复${effect.value}生命`);
    else if (effect.type === 'selfHeal') parts.push(`自身回复${effect.value}生命`);
    else if (effect.type === 'selfMana') parts.push(`自身回复${effect.value}法力`);
    else if (effect.type === 'shield') parts.push(`获得${effect.value}护盾`);
    else if (effect.type === 'buff')
      parts.push(`${BUFFS[effect.buff]?.name || effect.buff}${effect.value}`);
    else if (effect.type === 'cleanse')
      parts.push('净化' + effect.buffs.map((key) => BUFFS[key]?.name || key).join('、'));
  }
  return parts.join('，') + '。';
}
