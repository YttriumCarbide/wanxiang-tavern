import { chapterBattleSpec } from './starbell-content.js';
import { normalizeAdventureDefinition } from '../adventure/definition.js';
import { CHAPTER_TASKS } from './starbell-rp.js';
import { CHAPTER_DEFENSE_STORIES } from './starbell-dialogue.js';

/** The final invasion uses the same battle/event/elite/quest/boss expedition as a dungeon. */
export function starbellDefense(attempt, chapter = 1) {
  const id = `starbell-${attempt}-defense`;
  const encounters = [
    chapterBattleSpec('scout'),
    chapterBattleSpec('scout'),
    chapterBattleSpec('elite'),
    chapterBattleSpec('elite'),
    chapterBattleSpec('boss'),
  ];
  encounters[0].name = '城门外 · 第一波蚀鳞';
  encounters[2].name = '街垒前 · 蚀鳞突破';
  const book = {
    id,
    runId: id,
    chapter: Math.max(0, chapter - 1),
    schemaVersion: 5,
    title: '星灯未熄 · 守住这一夜',
    map: 'ruins',
    tags: ['星钟城', '星灯祭', '蚀鳞'],
    npcs: [],
    items: [],
    nextHook: { setting: '蚀鳞留下的行进痕迹，仍然延伸向更远的地方。' },
    story: [...CHAPTER_DEFENSE_STORIES],
    adventure: normalizeAdventureDefinition({
      event: {
        title: '灯下的物资',
        description: '警钟声中，居民正在把最后一批物资搬进安全的地方。你们可以决定怎样帮助他们。',
        choices: [
          { label: '帮助搬运沉重的物资', detail: '和搬运工一起让出通道，尽量保存还能使用的物品。' },
          {
            label: '照顾暂时掉队的居民',
            detail: '留意体力不足的人，与同行者一起陪他们走完这段路。',
          },
        ],
      },
      quest: {
        ...CHAPTER_TASKS.defense,
        title: '最后一段撤离',
        description:
          '钟楼下摆着几份刚送来的名单，同一个人被两处登记，有一家却只写着姓。各街区的负责人赶来报信，说话又快又急，谁也不肯先走。城门那边还需要援手，守在这里的人也不知该把后来的人带往哪里。抱着包裹的老人一遍遍问孙女有没有来过，旁边的守卫翻着纸，迟迟答不上来。得先把这些人安顿好，再和守备队说清由谁留下、由谁接应。',
        commonState: '守备与居民安置已有明确安排，主角团准备面对城门前的首领。',
        goals: [
          { objective: '协助各街区完成最后的人员安置', required: true },
          { objective: '与守备队确认接下来的分工', required: true },
        ],
        overview: [
          { location: '钟楼下', detail: '几份名单摆在长凳上，标记方法不一样。' },
          { location: '巷口', detail: '一位抱着包裹的老人仍在张望。' },
          { location: '门廊', detail: '几名守卫刚放下盾，正在等新的口讯。' },
          { location: '推车旁', detail: '备用灯和水桶挤在一处，车轮卡着一块小石头。' },
        ],
      },
    }),
  };
  return {
    key: 'boss',
    day: 3,
    returnScene: 'city-center',
    fullTrip: true,
    spec: encounters[0],
    encounters,
    book,
  };
}
