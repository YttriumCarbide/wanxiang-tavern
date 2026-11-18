import { finalSkillText } from './skill-text.js';
import { enemyEffectSide } from './enemy-targets.js';
import { resourceText } from './resource-text.js';

/** Archives can contain older moves without text; derive it from executable effects. */
export function enemyIntentText(move) {
  if (move.text && !/undefined|\bnull\b|NaN|^unf$/i.test(move.text)) return resourceText(move.text);
  const positions = (move.slots || [move.slot])
    .filter(Number.isInteger)
    .map((slot) => ['左位', '中位', '右位'][slot])
    .join('、');
  const targets = {
    self: '敌方自身',
    allAllies: '所有敌方单位',
    lowestAlly: 'hp最低的敌方单位',
    opponents: positions ? `我方${positions}` : '我方目标',
  };
  const parts = (move.effects || []).map((effect) =>
    finalSkillText({ effects: [{ ...effect, target: 'target' }] }).replaceAll(
      '目标',
      targets[enemyEffectSide(effect)] || '目标',
    ),
  );
  if (move.selfShield) parts.push(`敌方自身获得${move.selfShield}护盾。`);
  if (move.selfHeal) parts.push(`敌方自身回复${move.selfHeal}hp。`);
  if (move.selfBuff)
    for (const [buff, value] of Object.entries(move.selfBuff))
      parts.push(
        finalSkillText({ effects: [{ type: 'buff', buff, value }] }).replaceAll('目标', '敌方自身'),
      );
  if (move.sinkingPlague)
    parts.push(
      '三个前场地板染上【沉疫】，按滞留轮数剧痛加剧；每轮腐化1空时间格（只许换位，或用缓慢逼敌踩消）；连蹲后排受致命溺蚀，换入前场可刷新。',
    );
  else if (move.plagueAdd) parts.push(`加深命中前场格位【沉疫】${move.plagueAdd}层。`);
  return parts.join('') || (move.charging ? '蓄力，准备下一次攻击。' : '本次不造成伤害。');
}
