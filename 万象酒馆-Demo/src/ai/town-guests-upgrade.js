import { TOWN_GUESTS } from '../content/town-guests.js';
import { officialCharacter } from './library.js';
import { characterWorldEntry, newWorldEntry } from './worldbook.js';

/** Add authored guests without replacing edited prose or any existing world entry. */
export function upgradeTownGuests(source) {
  const book = structuredClone(source);
  book.entries ||= {};
  book.extensions ||= {};
  book.extensions.wanxiang ||= {};
  if (book.extensions.wanxiang.townGuestsRevision >= 56) return book;
  let uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
  for (const id of Object.keys(TOWN_GUESTS)) {
    const character = officialCharacter(id);
    if (
      Object.values(book.entries).some(
        (entry) => entry.extensions?.wanxiang?.characterId === character.id,
      )
    )
      continue;
    book.entries[uid] = characterWorldEntry(character, uid);
    uid++;
  }
  book.entries[uid] = {
    ...newWorldEntry(uid),
    comment: '战斗规则：飞行、致盲与悠扬',
    key: ['飞行', '致盲', '悠扬', '莉贝特', '露弥', '悠托-纳卡希'],
    apiTargets: ['character', 'map', 'script', 'chat'],
    preventRecursion: true,
    excludeRecursion: true,
    content:
      '飞行：受到伤害减半，向下取整，攻击先减伤再扣护盾；正常回合结束减少1层。致盲：敌人一次攻击若伤害两个及以上目标，其中一个目标伤害为0；落空目标由纯规则预演提前锁定，播放不得再次随机，正常回合结束减少1层。生成敌人禁止施加致盲。悠扬是悠托自身的本场专属标记，不按3层封顶；普攻按实际受到生命伤害的敌人数积累，星痕变奏只消耗自身1层，琥珀之歌按施放前层数治疗且不消耗。相邻指同排左右紧邻位置，不跨排；中位同时覆盖两侧。所有叙事只描述已经结算的真实战斗事件。',
    extensions: { wanxiang: { generationRule: 'town-guest-statuses' } },
  };
  book.extensions.wanxiang.townGuestsRevision = 56;
  return book;
}
