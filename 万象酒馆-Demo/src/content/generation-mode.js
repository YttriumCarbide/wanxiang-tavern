import { ENCOUNTER_COUNT } from './journey-rules.js';
/** Local story used when the player disables dungeon AI in game settings. */
export function combatTestScript(map = 'ruins') {
  return {
    schemaVersion: 3,
    story: Array(ENCOUNTER_COUNT).fill('◇ ── □ ── ◇\n［战斗测试占位剧本］'),
    data: {
      title: '战斗测试',
      synopsis: '本地占位文本，不请求剧本 API。',
      setting: '战斗测试期间，剧本暂用相同的占位符。',
      tags: [],
      npcs: [],
      nextHook: { setting: '◇ ── □ ── ◇', map, artNodes: [] },
    },
  };
}

/** Developer skip keeps all five node types playable without calling a model. */
export function adventureTestScript(map = 'ruins') {
  return {
    schemaVersion: 5,
    story: [
      '【对白:伊蒂丝】先看看前方的动静。遇到危险时，我们一起应对。',
      '【旁白】沿途有一处可以短暂停留的角落。【对白:伊蒂丝】先歇一会儿，还是检查一下带来的物资？',
      '【对白:伊蒂丝】前面有新的守卫。先观察它们，再决定怎样行动。',
      '【旁白】去路在这里分成了几条。【对白:伊蒂丝】不一定只有一种办法。说说你的打算吧。',
      '【旁白】一行人终于抵达了最后的入口。【对白:伊蒂丝】接下来，就由我们一起面对。',
    ],
    data: {
      title: '旅途测试',
      tags: [],
      npcs: [],
      items: [],
      nextHook: { setting: '' },
      adventure: {
        event: {
          title: '旅途片刻',
          description: '在短暂的安静里，决定怎样度过这段同行的时光。',
          choices: [
            {
              label: '整理沿途物资',
              detail: '和同行者分享发现，收好能使用的东西。',
              reward: { gold: 20, items: [] },
            },
            {
              label: '一起检查药箱',
              detail: '确认补给，将一瓶生命药水放进背包。',
              reward: { gold: 0, items: [{ id: 'health-potion', count: 1 }] },
            },
          ],
        },
        quest: {
          title: '前路的线索',
          overview: [
            { location: '岔路旁', detail: '一座废弃岗亭，门槛留着新旧交错的脚印。' },
            { location: '墙边', detail: '几块写满地名的木牌靠在一起。' },
            { location: '树林里', detail: '偶尔传来人们的交谈声。' },
          ],
          description:
            '走过回廊后，队伍在一处分岔口停了下来。地图上原本相连的道路如今被坍塌的石墙隔开，没人能确定哪条路仍通向深处。同行者暂时收起武器，把沿途的发现放在一起商量；不远处偶尔传来交谈声，却看不见说话的人。此地还算安静，大家有时间歇脚、观察，也可以谈谈接下来的打算。怎样继续前行，需要由你们自己决定。',
          commonState: '队伍已经抵达最后入口，进入方式由实际RP决定。',
          goals: [
            { objective: '找到继续前进的路', required: true },
            {
              objective: '了解这里曾发生的事',
              required: false,
            },
          ],
        },
      },
    },
    map,
  };
}
