import { newWorldEntry, characterWorldEntry } from './worldbook.js';
import { FROST_DUNGEONS, FROST_NPCS } from '../content/frost-dungeons.js';
import { FROST_ROUTES } from '../content/frost-encounters.js';
import { FROST_ENEMIES, FROST_BOSSES } from '../content/frost-adversaries.js';
import { OFFICIAL_VISITORS } from '../content/official-visitors.js';
import { officialCharacter } from './library.js';

/** Incremental official content: never replace a player's edited chapter or character entry. */
export function upgradeFrostWorldbook(source) {
  const book = structuredClone(source);
  book.entries ||= {};
  let uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
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
  for (const [index, dungeon] of FROST_DUNGEONS.entries())
    add(
      { officialDungeonId: dungeon.id },
      {
        comment: '官设副本：' + dungeon.name,
        key: [dungeon.key],
        content:
          dungeon.outline +
          '\n\n【矿窟固定战斗阵容】\n' +
          FROST_ROUTES[index].battles
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
  for (const npc of FROST_NPCS)
    add(
      { officialNpcId: npc.id },
      {
        comment: '官设NPC：' + npc.name,
        key: [
          npc.name,
          ...FROST_DUNGEONS.filter((dungeon) =>
            dungeon.npcs.some((entry) => entry.id === npc.id),
          ).map((dungeon) => dungeon.key),
        ],
        content: `姓名：${npc.name}\n身份：${npc.title}\n外貌：${npc.appearance}\n人物设计：${npc.design}\n叙事边界：${npc.boundary}`,
        matchScenario: true,
        ignoreBudget: true,
        preventRecursion: true,
        order: 840,
        apiTargets: ['script', 'character'],
      },
    );
  for (const enemy of [...FROST_ENEMIES, ...FROST_BOSSES])
    add(
      { monsterId: enemy.id },
      {
        comment: '矿窟怪物图鉴：' + enemy.name,
        ignoreBudget: true,
        key: [enemy.id, enemy.name],
        content: `名称：${enemy.name}\n设定：${enemy.description}\n基础hp：${enemy.hp}；速度：${enemy.speed}\n${enemy.intents.map((move) => move.name + '：' + move.text).join('\n')}${enemy.enragedIntents ? '\n紧急肃清：hp低于60%或两门机炮均被击败时触发；进入后五回合循环，每回合额外5护盾。\n' + enemy.enragedIntents.map((move) => move.name + '：' + move.text).join('\n') : ''}\n只按真实战斗事件描写，不预写胜负。`,
        matchScenario: true,
        preventRecursion: true,
        order: 210,
        apiTargets: ['script', 'map'],
      },
    );
  for (const id of Object.keys(OFFICIAL_VISITORS)) {
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
  return book;
}
