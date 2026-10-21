import { RUINS_ROUTES } from '../content/ruins-encounters.js';
import { ALL_OFFICIAL_DUNGEONS } from '../content/official-dungeons.js';
import { RUINS_MONSTER_LORE, monsterWorldbook } from '../content/monsters.js';
import { DEFINITIONS } from '../data.js';
import { newWorldEntry } from './worldbook.js';

/** Keep authored outlines intact. Append the actual cast, and add missing owned bestiary records. */
export function upgradeRuinsWorldbook(source) {
  const book = structuredClone(source);
  let uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
  for (const [sequence, dungeon] of ALL_OFFICIAL_DUNGEONS.entries()) {
    let entry = Object.values(book.entries).find(
      (item) =>
        item.extensions?.wanxiang?.officialDungeonId === dungeon.id ||
        item.extensions?.wanxiang?.dungeonId === dungeon.id,
    );
    if (!entry) {
      entry = {
        ...newWorldEntry(uid),
        comment: `官设副本：${dungeon.name}`,
        key: [dungeon.key],
        content: dungeon.outline,
        matchScenario: true,
        ignoreBudget: true,
        preventRecursion: true,
        excludeRecursion: true,
        order: 850,
        apiTargets: ['script'],
        extensions: { wanxiang: { officialDungeonId: dungeon.id } },
      };
      book.entries[uid++] = entry;
    }
    const marker = '【遗迹固定战斗阵容 v1】';
    if (entry.content.includes(marker)) continue;
    const route = RUINS_ROUTES[sequence];
    entry.content +=
      '\n\n' +
      [
        marker,
        '以下是程序实际安排的五场敌人，不是强制逐场拆分的大纲。沿完整大纲自然推进，禁止改换怪物或挪用其他剧本Boss；胜负、掉落与关键人物结局以已发生事件为准。',
        ...route.battles.map(
          (battle, index) =>
            `第${index + 1}场：${battle.enemyIds.map((id) => DEFINITIONS[id].name).join('、')}。${battle.reason}`,
        ),
      ].join('\n');
  }
  for (const id of Object.keys(RUINS_MONSTER_LORE)) {
    if (Object.values(book.entries).some((entry) => entry.extensions?.wanxiang?.monsterId === id))
      continue;
    book.entries[uid] = {
      ...newWorldEntry(uid),
      comment: `怪物图鉴：${DEFINITIONS[id].name}`,
      key: [id, DEFINITIONS[id].name],
      content: monsterWorldbook(id, DEFINITIONS[id].name),
      matchScenario: true,
      preventRecursion: true,
      order: 200,
      apiTargets: ['script'],
      extensions: { wanxiang: { monsterId: id, apiTargets: ['script'] } },
    };
    uid++;
  }
  return book;
}
