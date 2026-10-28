import { newWorldEntry } from './worldbook.js';
import { BUFFS } from '../data.js';
import { PANDORA } from '../content/pandora.js';
import { CORRIDOR_RING_GUIDANCE } from '../content/corridor-ring.js';

/** Add the current combat contract without replacing player-authored lore. */
export function upgradeCombatControl(source) {
  const book = structuredClone(source);
  book.entries ||= {};
  if (
    Object.values(book.entries).some(
      (entry) => entry.extensions?.wanxiang?.generationRule === 'combat-control',
    )
  )
    return book;
  const uid = Math.max(-1, ...Object.keys(book.entries).map(Number).filter(Number.isFinite)) + 1;
  const bind = PANDORA.skills.find((skill) => skill.id === 'clock-bind');
  book.entries[uid] = {
    ...newWorldEntry(uid),
    comment: '当前战斗规则 · 禁锢、潘多拉与剧情戒指',
    content: [
      `本条修订旧版本相同规则。禁锢：${BUFFS.bind.text} 对我方同样生效，时间轴显示被跳过的行动。`,
      `潘多拉的${bind.name}消耗${bind.ap} AP、${bind.mp} sp，不能使用旧版本数值。`,
      'Boss第二阶段由真实战斗事件触发，短暂禁锢我方，跳过本回合剩余行动；不预写触发时机或结果。',
      '剧情赠送纹章时，随机装备给尚未佩戴戒指的角色，优先前场；不得替换已佩戴戒指。所有角色已有戒指则收入收藏。对白使用程序给定的实际获赠者。',
      CORRIDOR_RING_GUIDANCE,
    ].join('\n'),
    constant: true,
    preventRecursion: true,
    ignoreBudget: true,
    apiTargets: ['character', 'script', 'chat', 'quick-chat', 'map', 'creation'],
    position: 4,
    role: 0,
    depth: 0,
    order: 9998,
    extensions: { wanxiang: { generationRule: 'combat-control' } },
  };
  return book;
}
