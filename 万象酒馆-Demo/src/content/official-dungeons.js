import { CORRIDOR_RING_GUIDANCE } from './corridor-ring.js';

const OUTLINE_PREAMBLE = `大纲以第三人称改写，<user>仅在本大纲中代指玩家创建的主角；生成正文时按该主角的实际姓名、设定与自然称呼叙述，不照抄代称。这是完整连续的大纲参考，保留人物、线索与事件的先后关系；文风与细节由当前预设决定。由AI根据实际战斗进度自行安排事件的叙述位置，在本次回复中讲完本次旅程，不预先按场次切分大纲。战斗名单、场次、胜负和已发生事实以本次请求的数据为准。`;

export const TUTORIAL_DUNGEON = {
  id: 'ruins-tutorial',
  name: '新手教程 · 界隙遗迹初探',
  key: 'official-dungeon:ruins-tutorial',
  outline: `【官设副本大纲：新手教程 · 界隙遗迹初探】
${OUTLINE_PREAMBLE}

<user>在万象酒馆接受伊蒂丝的邀请，与她一起穿过副本之门，落在界隙遗迹外环回廊的外围。青灰色的残垣断壁散布在四周，岁月的痕迹留在石墙与地面上。遗迹门口，一位老人正清扫这里。他秃着头，自称“灰”，说自己只是一个糟老头子。伊蒂丝称他为“灰伯”，带着<user>上前友好交流。灰伯感慨，已经这么久没有人来过了。伊蒂丝向他说明，<user>此行准备进入遗迹，处理遗迹可能产生的危害。灰伯很高兴，希望<user>能够成功。<user>与伊蒂丝清理回廊外围的怪物，逐步来到回廊入口。入口外围的砖墙上留着壁画。<user>看不到壁画，伊蒂丝向<user>解释，其绘画风格似乎与古埃及壁画相近，但建筑朝向与她所知的古埃及金字塔截然相反：按这里讨论的墓室朝向线索，它原本应当面对日出方向，这里却不是。更古怪的是，壁画中的“拉”似乎正在遭到残害。这些是伊蒂丝对遗迹的观察与疑问，不是已经查明的真相。两人看壁画入迷时，藏在暗处的猎犬突然偷袭。应对袭击并完成战斗后，<user>与伊蒂丝继续深入回廊。内部的战斗中，伊蒂丝施放技能的动静惊动了外围的机关石像；石像走到回廊入口，挡住了进一步探索的道路。为了继续深入，<user>与伊蒂丝清理这尊难缠的机关石像。战斗结束后，两人完成初步探索任务，可以返回万象酒馆。关于壁画、朝向与“拉”的疑问暂作线索保留，不在本次初探中擅自揭晓。`,
};

export const CORRIDOR_DUNGEON = {
  id: 'ruins-corridor',
  name: '回廊内部 · 石像守卫与巡游猎犬',
  key: 'official-dungeon:ruins-corridor',
  outline: `【官设副本大纲：回廊内部 · 石像守卫与巡游猎犬】
${OUTLINE_PREAMBLE}

<user>召唤了第一个同伴后，准备再次进入遗迹。遗迹的探索才刚开始，远远达不到改变时间线的地步。于是再次进入，来到回廊内部。<user>与伊蒂丝查看回廊内部的壁画时，发现这些壁画让人不安，从蛇偷吃苹果到蛇吞下太阳，这时<user>小队遭到了盘踞在这里的狗群偷袭，最后处理了巡游猎犬偷袭后，继续探索回廊。回廊的蜿蜒曲折，像是一条盘踞的蛇。很快<user>与伊蒂丝穿过回廊清理了小怪，来到遗迹大厅门口，有着紧闭的石门，<user>与伊蒂丝在石门前试图破解机关失败引来反击，于是大战发射各种机关的石门，准备将其物理摧毁进入大厅。${CORRIDOR_RING_GUIDANCE}

重要事件：
1.继续深入回廊内部，看壁画时被猎犬偷袭
4.来到遗迹门口破解谜题，谜题失败
5.石门雷锁骤亮，蓄势释放足以重伤同伴的开幕雷击；<user>意外从门前裂缝中取得均衡纹章士檀虹羽的戒指，戒指自行戴在主角手上且六格充能全满。伊蒂丝立刻指导主角结合并对机关石门使用结合技“平衡”，分散雷击，随后物理摧毁门的防御机关和门本身。此戒指是一次性的剧情获得，不再作为可折算以太的普通掉落重复生成。`,
};

export const HALL_DUNGEON = {
  id: 'ruins-hall',
  name: '尘封大厅',
  key: 'official-dungeon:ruins-hall',
  outline: `【官设副本大纲：尘封大厅】
${OUTLINE_PREAMBLE}

<user>与伊蒂丝走进大厅，里面看似安静实则险象环生。黑暗中时不时就有跳出的怪物，<user>小队谨慎前行清理怪物，很快来到一处断崖，两艘不知道为何能飞行的木船可以渡过悬崖，两艘木船有着蛇和鸟的印记，你们坐上了鸟的船结果落地后冲进了更多怪物的岔路，拼尽全力才击败他们。

重要事件：
1.清理怪物时发现断壁和木船
2.木船飞过悬崖后进入更多怪物的包围圈
5.击败怪物的头领，度过大厅`,
};

export const SINKHOLE_DUNGEON = {
  id: 'ruins-sinkhole',
  name: '中庭沉坑',
  key: 'official-dungeon:ruins-sinkhole',
  outline: `【官设副本大纲：中庭沉坑】
${OUTLINE_PREAMBLE}

<user>与伊蒂丝走过大厅，避开各种出现的陷阱后发现大厅后的应该是祭坛，但本来应该是摆放祭坛底座上空空如也，踩上去发现是空心的发现向下有通路，通路内部是个迷宫，在伊蒂丝通过气流的感知下，找到正确的道路和斩杀一些石甲虫之类的小怪，发现来到了一处大房间，这里有着一尊三角形头颅，可以发射激光和冲锋的黄铜独眼巨像，击败他后发现体内有着一柄有着裂纹的铜钥匙。

重要事件：
1.击碎地板来到地下迷宫
5.从迷宫中找到正确的通路击败黄铜巨像，拿到钥匙`,
};

export const TOMB_DUNGEON = {
  id: 'ruins-tomb',
  name: '核心墓室 · 余烬祭司苏醒',
  key: 'official-dungeon:ruins-tomb',
  outline: `【官设副本大纲：核心墓室 · 余烬祭司苏醒】
${OUTLINE_PREAMBLE}

<user>与伊蒂丝用带裂纹的铜钥匙打开核心墓室。墓室中央停放着一具石棺，棺底刻着仍在运转的魔法纹路。<user>的进入打断了纹路的供能，石棺开启，余烬祭司苏醒。他浑浑噩噩，似乎没有清醒的意识，口中不断呢喃着神秘的字符。<user>与伊蒂丝击败余烬祭司。战斗结束后，两人意识到他身为祭司却供奉着不明对象，关于“他祭祀的究竟是什么”的疑问浮现。

重要事件：
1.用铜钥匙打开核心墓室，进入墓室，打断棺底魔法纹路供能
2.墓室的防御装置启动，出现石像石甲虫，祭司逐渐苏醒，说出断断续续的神秘字符
5.击败余烬祭司`,
};

export const CURSE_DUNGEON = {
  id: 'ruins-curse',
  name: '灰的真相 · 诅咒显现',
  key: 'official-dungeon:ruins-curse',
  outline: `【官设副本大纲：灰的真相 · 诅咒显现】
${OUTLINE_PREAMBLE}

<user>与伊蒂丝击败余烬祭司后，灰出现在他们身后。他坦白自己是被某种不可名状的东西诅咒的存在：这座遗迹的真正用途，是利用祭司吸收这个星球的能量，再将能量献祭给灰，而灰是那个邪神吸收这个位面能量的载体——正因如此，这个星球才一直都是瘟疫战乱，而这片区域也因为没有人能够造出远洋的大型航船，是个无人岛。灰认为你的实力可以足够解决释放诅咒，于是释放诅咒变成一个扭曲的黑色怪物。<user>与伊蒂丝击败怪物后，灰恢复成普通老人的模样，向<user>道谢，随后化作灰烬消散。

重要事件：
1.灰出现在墓室，坦白诅咒与遗迹献祭的真相
2.灰释放诅咒，变成扭曲的黑色怪物，黑色物质滴落形成小怪
3.击败黑色怪物-阿佩普的羔羊
5.灰恢复普通老人模样，向<user>道谢后化作灰烬消散`,
};

export const OFFICIAL_DUNGEONS = [TUTORIAL_DUNGEON, CORRIDOR_DUNGEON];
export const EXPANDED_DUNGEONS = [HALL_DUNGEON, SINKHOLE_DUNGEON, TOMB_DUNGEON, CURSE_DUNGEON];
export const ALL_OFFICIAL_DUNGEONS = [...OFFICIAL_DUNGEONS, ...EXPANDED_DUNGEONS];

export function officialDungeonFor(exploration) {
  if (exploration?.world) return null;
  if (exploration?.map !== 'ruins') return null;
  if (exploration.tutorial === true || exploration.sequence === 0) return TUTORIAL_DUNGEON;
  switch (exploration.sequence) {
    case 1:
      return CORRIDOR_DUNGEON;
    case 2:
      return HALL_DUNGEON;
    case 3:
      return SINKHOLE_DUNGEON;
    case 4:
      return TOMB_DUNGEON;
    case 5:
      return CURSE_DUNGEON;
    default:
      return null;
  }
}
