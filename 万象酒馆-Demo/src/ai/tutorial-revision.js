import { CORRIDOR_RING_GUIDANCE } from '../content/corridor-ring.js';

/** Append the new authored event without replacing a player's edited outline or switches. */
export function upgradeTutorialRevision(source) {
  const book = structuredClone(source);
  for (const entry of Object.values(book.entries)) {
    const marker = entry.extensions?.wanxiang;
    if (marker?.monsterId === 'ruinsGate')
      entry.content = entry.content
        .replaceAll(
          '首次出手对左位造成60伤害',
          '第一回合锁定hp最低前场角色的位置造成24伤害并施加1层虚弱',
        )
        .replaceAll(
          '平衡会将该次伤害分摊至三个前场位置。',
          '平衡会将该次伤害分摊至三个前场位置，虚弱仍只施加给原目标。',
        );
    if (
      [marker?.officialDungeonId, marker?.dungeonId].includes('ruins-corridor') &&
      !entry.content.includes('【第二关纹章戒指事件】')
    ) {
      entry.content +=
        '\n\n' +
        CORRIDOR_RING_GUIDANCE +
        '\n重要节点5修订：开幕雷击蓄势时意外获得戒指，实际获赠者满充能结合，使用平衡后突破机关石门。';
    }
    if (marker?.monsterId === 'ruinsGate' && !entry.content.includes('雷锁贯穿'))
      entry.content +=
        '\n开幕雷锁贯穿：第一回合锁定hp最低前场角色的位置造成24伤害并施加1层虚弱，每场只用一次；后续使用原有闸门与暗弩意图。平衡会将该次伤害分摊至三个前场位置，虚弱仍只施加给原目标。';
  }
  return book;
}
