import { CORRIDOR_RING_GUIDANCE } from '../content/corridor-ring.js';

/** Append the new authored event without replacing a player's edited outline or switches. */
export function upgradeTutorialRevision(source) {
  const book = structuredClone(source);
  for (const entry of Object.values(book.entries)) {
    const marker = entry.extensions?.wanxiang;
    if (
      [marker?.officialDungeonId, marker?.dungeonId].includes('ruins-corridor') &&
      !entry.content.includes('【第二关纹章戒指事件】')
    ) {
      entry.content +=
        '\n\n' +
        CORRIDOR_RING_GUIDANCE +
        '\n重要节点5修订：开幕雷击蓄势时意外获得戒指，主角满充能结合，使用平衡后突破机关石门。';
    }
    if (marker?.monsterId === 'ruinsGate' && !entry.content.includes('雷锁贯穿'))
      entry.content +=
        '\n开幕雷锁贯穿：首次出手对左位造成60伤害，每场只用一次；后续使用原有闸门与暗弩意图。平衡会将该次伤害分摊至三个前场位置。';
  }
  return book;
}
