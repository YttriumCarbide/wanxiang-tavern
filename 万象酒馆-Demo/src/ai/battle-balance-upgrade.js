import { newWorldEntry } from './worldbook.js';
import { REST_LOSS_RECOVERY, STORY_RING_CHARGE } from '../content/journey-rules.js';

/** Describe current code-owned rules without overwriting the player's earlier entries. */
export function upgradeBattleBalance(source) {
  const book = structuredClone(source);
  if (
    Object.values(book.entries || {}).some(
      (entry) => entry.extensions?.wanxiang?.generationRule === 'battle-balance',
    )
  )
    return book;
  const uid = Math.max(-1, ...Object.keys(book.entries || {}).map(Number)) + 1;
  book.entries[uid] = {
    ...newWorldEntry(uid),
    comment: '当前战斗规则 · 休整、装备与沉疫',
    content: [
      '本条替代旧版本相同规则，不改写已经发生的历史。',
      `剧情赠送戒指时直接充满${STORY_RING_CHARGE}格，实际获赠者由程序选择。`,
      `第三场结束休整仍为二选一：睡眠恢复已损失hp的${REST_LOSS_RECOVERY * 100}%，用餐恢复已损失sp的${REST_LOSS_RECOVERY * 100}%，不能把它写成最大hp比例或sp回满。`,
      '每名角色最多佩戴一件同名装备，即使来源ID或介绍不同；不同角色可以使用各自持有的同名装备。过载被动增加hp/sp上限时，当前值同时补上增加量，原有资源损耗不抹去。',
      '敌人hp与直接伤害均填写1级现行基础值，进入战斗不额外乘全局倍率、不固定加伤；仅关卡等级成长与明确的技能/状态改变实战值。以本次reference.enemies为数值参考。',
      '阿佩普的羔羊第二回合对三个前场位置造成15伤害，并使三个位置染上沉疫。从施加当回合开始，回合末受到持续回合数乘2的伤害；换人不清除，后撤和空位时地板仍累计回合，只有前场角色承受。本场战斗结束清除。',
    ].join('\n'),
    constant: true,
    preventRecursion: true,
    ignoreBudget: true,
    apiTargets: ['character', 'script', 'chat', 'quick-chat', 'map', 'creation'],
    position: 4,
    role: 0,
    depth: 0,
    order: 9998,
    extensions: { wanxiang: { generationRule: 'battle-balance' } },
  };
  return book;
}
