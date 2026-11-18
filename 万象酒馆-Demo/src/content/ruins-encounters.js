import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from './journey-rules.js';

/** Six authored adventures, each with five battles. No random cast selection in these chapters. */
export const RUINS_ROUTES = Object.freeze([
  {
    id: 'ruins-tutorial',
    name: '界隙遗迹初探',
    boss: 'bossGate',
    battles: [
      { enemyIds: ['mossSlime'], reason: '残垣石缝中的苔团，用于先手、行动次数和换位躲避教学。' },
      {
        enemyIds: ['pebble', 'patrolHound'],
        reason: '外围石灵与巡游猎犬；石灵护甲有破绽，用于易伤增伤教学。',
      },
      {
        enemyIds: ['warden'],
        reason: '精英遗迹石卫镇守核心通路，保留可被后移的行动，教学迟缓药水。',
      },
      {
        enemyIds: ['patrolHound', 'pebble'],
        reason: '壁画附近的猎犬与石灵伏击，教学同时查看两名敌人的意图。',
      },
      {
        enemyIds: ['bossGate'],
        reason:
          '被技能动静惊动的外围巨像以多动姿态封住回廊入口，承担护盾、阶段切换和魔力药水教学。',
      },
    ],
  },
  {
    id: 'ruins-corridor',
    name: '回廊内部',
    boss: 'ruinsGate',
    battles: [
      {
        enemyIds: ['patrolHound', 'stoneBallista'],
        reason: '回廊外段的巡游猎犬与暗弩机关，构成常规先遣阻截。',
      },
      {
        enemyIds: ['patrolHound', 'pebble'],
        reason: '弯折通路上的猎犬与碎石灵，体现回廊曲折与伏击节奏。',
      },
      {
        enemyIds: ['corridorGuard', 'stoneBallista'],
        reason: '精英回廊石卫亲率机关弩阵死守内门前庭，压迫感显著提升。',
      },
      {
        enemyIds: ['stoneBallista', 'pebble'],
        reason: '破解石门前夕的残存暗弩与碎石哨兵。',
      },
      {
        enemyIds: ['patrolHound', 'ruinsGate', 'stoneBallista'],
        reason: '物理摧毁多动机关石门；两侧猎犬与弩阵配合石门本体协同防守。',
      },
    ],
  },
  {
    id: 'ruins-hall',
    name: '尘封大厅',
    boss: 'chasmBeast',
    battles: [
      {
        enemyIds: ['viperShadow', 'raptorStorm'],
        reason: '大厅入口外围游荡的毒蛇与怪鸟群。',
      },
      {
        enemyIds: ['viperShadow', 'patrolHound'],
        reason: '断崖渡口附近的蛇类异兽与巡游猎犬，呼应蛇鸟印记。',
      },
      {
        enemyIds: ['shadowStalker', 'raptorStorm'],
        reason: '乘船渡崖后遭遇精英裂隙猎杀者截击，高频流血与破甲突袭后排。',
      },
      {
        enemyIds: ['viperShadow', 'raptorStorm'],
        reason: '岔路深处的常规蛇鸟守卫群。',
      },
      {
        enemyIds: ['raptorStorm', 'chasmBeast', 'viperShadow'],
        reason: '裂渊兽首携风蛇头领一齐扑杀；多动连击与撕裂考验队伍站位轮换。',
      },
    ],
  },
  {
    id: 'ruins-sinkhole',
    name: '中庭沉坑',
    boss: 'brassColossus',
    battles: [
      {
        enemyIds: ['stoneBeetle', 'brassSeeker'],
        reason: '击碎空心地板进入地下后，先遭遇甲虫与黄铜巡察机。',
      },
      {
        enemyIds: ['stoneBeetle', 'pebble'],
        reason: '迷宫岔道的石甲虫与碎石集群，为精英遭遇热身。',
      },
      {
        enemyIds: ['ruinsMudGolem', 'brassSeeker'],
        reason: '精英灰岩巨傀堵死核心水道，配合巡察机形成攻防一体防线。',
      },
      {
        enemyIds: ['stoneBeetle', 'brassSeeker'],
        reason: '通向大房间前的常规甲虫与巡察机械清理战。',
      },
      {
        enemyIds: ['stoneBeetle', 'brassColossus', 'brassSeeker'],
        reason: '三角头黄铜独眼巨像以多动聚能激光与冲锋守住大房间；铜钥匙只在击败后取得。',
      },
    ],
  },
  {
    id: 'ruins-tomb',
    name: '核心墓室',
    boss: 'cinderPriest',
    battles: [
      {
        enemyIds: ['tombBeetle', 'cultistSpecter'],
        reason: '铜钥匙开启墓室后，金甲虫与侍僧残魂率先惊醒。',
      },
      {
        enemyIds: ['tombBeetle', 'stoneBeetle'],
        reason: '陪葬虫群成群涌出，试图拖延队伍深入主墓室。',
      },
      {
        enemyIds: ['tombWarden', 'cultistSpecter'],
        reason: '精英刻纹守墓魔像挡在石棺之前，联合残魂执行皇家墓门戒律。',
      },
      {
        enemyIds: ['tombBeetle', 'cultistSpecter'],
        reason: '棺底余烬纹路驱使残余甲虫与咒文残魂作最后阻拦。',
      },
      {
        enemyIds: ['tombBeetle', 'cinderPriest', 'cultistSpecter'],
        reason: '石棺中的余烬大祭司携多动死咒正式苏醒；击败后才追问其祭祀对象。',
      },
    ],
  },
  {
    id: 'ruins-curse',
    name: '诅咒显现',
    boss: 'apepLamb',
    battles: [
      {
        enemyIds: ['blackOoze', 'cultistSpecter'],
        reason: '灰现身坦白时，泄出的黑液惊动墓室残魂，开始表现诅咒失控。',
      },
      {
        enemyIds: ['blackOoze', 'voidParasite'],
        reason: '灰释放诅咒后黑色物质形成幼体，寄生物追随能量涌出。',
      },
      {
        enemyIds: ['shadowStalker', 'voidParasite'],
        reason: '被邪神诅咒侵蚀的精英暗影猎杀者携虚空寄生物扑出截杀。',
      },
      {
        enemyIds: ['shadowStalker', 'voidParasite', 'blackOoze'],
        reason: '邪能寄生物、黑色物质与残存魔怪拱卫异变本体；前四战肃清阻路群落。',
      },
      {
        enemyIds: ['apepLamb'],
        reason: '阿佩普的羔羊作为独尊邪神化身降临单人深渊战场；击溃后灰才会恢复人形并化灰消散。',
      },
    ],
  },
]);

import { TUTORIAL_TARGETS } from './mill-encounters.js';

export { TUTORIAL_TARGETS };
export const RUINS_ENEMY_IDS = Object.freeze(
  [
    ...new Set(RUINS_ROUTES.flatMap((route) => route.battles.flatMap((battle) => battle.enemyIds))),
  ].filter((id) => !RUINS_ROUTES.some((route) => route.boss === id)),
);

export function ruinsEncounterSpec(sequence, index, { tutorial = false } = {}) {
  const route = RUINS_ROUTES[sequence];
  if (!route || !Number.isInteger(index) || index < 0 || index >= ENCOUNTER_COUNT)
    throw Error('遗迹剧本或战斗序号无效');
  return {
    name: route.name,
    map: 'ruins',
    enemyIds: [...route.battles[index].enemyIds],
    hpScale: 1,
    ...(tutorial
      ? {
          occupiedOpeningTarget: index === 1,
          initialEnemyBuffs:
            index === 1 ? { [TUTORIAL_TARGETS.vulnerable]: { vulnerable: 1 } } : {},
        }
      : {}),
    boss: index === FINAL_ENCOUNTER,
    environment: {},
    description: route.battles[index].reason,
  };
}
