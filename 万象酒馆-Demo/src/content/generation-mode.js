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
      '【旁白】石阶一路向下延伸，潮冷的风顺着砖缝往外渗。【对白:伊蒂丝】前面看着有点不对劲，先小心摸过去看看；真要动起手来，我顶在前面。',
      '【旁白】绕过塌了一半的拱门，墙根处意外留着块干爽落脚地。【对白:伊蒂丝】前面通道黑灯瞎火的，正好歇口气清点一下手头的补给。',
      '【对白:伊蒂丝】前边拐角有巡逻的石像在挪窝。老办法，先看清它们打算朝哪挥过来，再决定抢哪格动手。',
      '【旁白】甬道走到尽头忽然分成三条岔口，石壁上的风化痕深浅各异。【对白:伊蒂丝】看来不止一条活路可走。拿个主意吧，我们听你的。',
      '【旁白】穿过最后一道爬满细纹的高门，深处沉甸甸的压迫感顺着地面震了过来。【对白:伊蒂丝】正主多半蹲在里面了，稳住架势，准备迎战。',
    ],
    data: {
      title: '旅途测试',
      tags: [],
      npcs: [],
      items: [],
      nextHook: { setting: '' },
      prologue:
        '黎明尚沉在云层之外，界隙外的残垣还凝着昨夜未散的寒霜。风沿着崩塌百年的石阶幽幽穿行，将旧碑文磨成半截模糊的刻痕。\n\n门扉在微光中无声敞开，幽深回廊尽头隐约震落一缕沉铁余响。披风掠过石槛的刹那，新的战局已然拉开序幕。',
      battleLines: {
        bossIntro: '擅闯禁忌回廊者，就此化作石尘吧！',
        partyReply: '小心它的重击，盯紧破绽一起压过去！',
        bossEnraged: '残存的魔力正在暴走——全员注意防御！',
        bossDefeat: '石壁崩裂的回响归于死寂……终于结束了。',
      },
      epilogueGal:
        '【旁白】石尘缓缓落定，原本震颤不止的厅堂终于恢复平静。【对白:伊蒂丝】大家都还好吗？刚才那一下险些没挡住。【旁白】众人借着微弱的火光简单包扎，将残留的线索收入行囊。',
      epilogueProse:
        '走出昏暗的通道时，天边已泛起一线微白。风吹散了衣襟上的石粉与硝烟，众人的脚步重新踏上碎石小径，只余手中尚带微温的线索悄然指向下一段未知的风波。',
      adventure: {
        event: {
          title: '旅途片刻',
          description: '在短暂的安静里，决定怎样度过这段同行的时光。',
          choices: [
            {
              label: '整理沿途物资',
              detail: '和同行者分享发现，收好能使用的东西。',
            },
            {
              label: '一起检查药箱',
              detail: '和同行者核对补给，讨论后面的安排。',
            },
          ],
        },
        quest: {
          title: '前路的线索',
          overview: [
            { location: '岔路旁', detail: '一座废弃岗亭，门槛留着新旧交错的脚印。' },
            { location: '墙边', detail: '几块写满地名的木牌靠在一起。' },
            { location: '树林里', detail: '偶尔传来人们的交谈声。' },
            { location: '路面', detail: '几道车辙从碎石间穿过，深浅不一。' },
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
