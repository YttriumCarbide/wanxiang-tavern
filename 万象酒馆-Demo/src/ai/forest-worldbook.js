import { newWorldEntry } from './worldbook.js';
import { FOREST_DUNGEONS, FOREST_NPCS } from '../content/forest-dungeons.js';
import { FOREST_ROUTES } from '../content/forest-encounters.js';
import { FOREST_ENEMIES, FOREST_BOSSES } from '../content/forest-adversaries.js';
import { monsterWorldbook } from '../content/monsters.js';

/** Add authored chapters and matching casts; existing world prose and edits remain intact. */
export function upgradeForestWorldbook(source) {
  const book = structuredClone(source);
  book.entries ||= {};
  let uid =
    Math.max(
      -1,
      ...Object.keys(book.entries || {})
        .map(Number)
        .filter(Number.isFinite),
    ) + 1;
  function add(marker, fields) {
    if (
      Object.values(book.entries).some((entry) =>
        Object.entries(marker).every(([key, value]) => entry.extensions?.wanxiang?.[key] === value),
      )
    )
      return;
    book.entries[uid] = { ...newWorldEntry(uid), ...fields, extensions: { wanxiang: marker } };
    uid++;
  }
  for (const [index, dungeon] of FOREST_DUNGEONS.entries()) {
    add(
      { officialDungeonId: dungeon.id },
      {
        comment: '官设副本：' + dungeon.name,
        key: [dungeon.key],
        content:
          dungeon.outline +
          '\n\n【古林固定战斗阵容】\n以下为程序真实配置，沿大纲自然推进，不能改换敌人或提前宣告胜负。\n' +
          FOREST_ROUTES[index].battles
            .map((battle, i) => `第${i + 1}场：${battle.enemyIds.join('、')}。${battle.reason}`)
            .join('\n'),
        matchScenario: true,
        ignoreBudget: true,
        preventRecursion: true,
        excludeRecursion: true,
        position: 1,
        order: 850,
        apiTargets: ['script'],
      },
    );
  }
  for (const npc of FOREST_NPCS)
    add(
      { officialNpcId: npc.id },
      {
        comment: '官设NPC：' + npc.name,
        ignoreBudget: true,
        key: [
          npc.name,
          ...FOREST_DUNGEONS.filter((d) => d.npcs.some((n) => n.id === npc.id)).map((d) => d.key),
        ],
        content: `姓名：${npc.name}\n身份：${npc.title}\n外貌：${npc.appearance}\n人物设计：${npc.design}\n叙事边界：${npc.boundary}`,
        matchScenario: true,
        preventRecursion: true,
        order: 840,
        apiTargets: ['script', 'character'],
      },
    );
  for (const enemy of [...FOREST_ENEMIES, ...FOREST_BOSSES])
    add(
      { monsterId: enemy.id },
      {
        comment: '古林怪物图鉴：' + enemy.name,
        ignoreBudget: true,
        key: [enemy.id, enemy.name],
        content:
          monsterWorldbook(enemy.id, enemy.name) +
          '\n基础hp：' +
          enemy.hp +
          '；速度：' +
          enemy.speed +
          '；每回合一次行动。' +
          (enemy.tactic.mode === 'moon-tree'
            ? '\n三部位速度均为1，行动顺序树冠、魔眼、树根。按三回合循环，第四回合重新开始；魔眼首轮激光21伤害，每个循环乘1.5；树根治疗各存活部位最大hp的20%。必须全部击败才算胜利。'
            : ''),
        matchScenario: true,
        preventRecursion: true,
        order: 210,
        apiTargets: ['script', 'map'],
      },
    );
  return book;
}
