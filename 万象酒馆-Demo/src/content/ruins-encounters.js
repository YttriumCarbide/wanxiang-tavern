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
      { enemyIds: ['warden'], reason: '巡逻石卫拦住通路，保留能明确后移的行动，教学迟缓药水。' },
      {
        enemyIds: ['patrolHound', 'corridorGuard'],
        reason: '壁画附近的猎犬伏击与石卫封锁，教学同时查看两名敌人的意图。',
      },
      {
        enemyIds: ['bossGate'],
        reason: '被技能动静惊动的外围巨像封住回廊入口，承担护盾、阶段切换和魔力药水教学。',
      },
    ],
  },
  {
    id: 'ruins-corridor',
    name: '回廊内部',
    boss: 'ruinsGate',
    battles: [
      {
        enemyIds: ['patrolHound', 'corridorGuard'],
        reason: '回廊内部的巡游猎犬与持盾石卫，呼应看壁画时遭遇偷袭。',
      },
      {
        enemyIds: ['patrolHound', 'stoneBallista'],
        reason: '弯折通路上的猎犬和防卫机关，体现回廊曲折与死角。',
      },
      {
        enemyIds: ['corridorGuard', 'pebble'],
        reason: '石卫与碎石机关阻拦继续深入，保持古代石质防御主题。',
      },
      {
        enemyIds: ['stoneBallista', 'corridorGuard'],
        reason: '破解石门机关失败后，暗弩和守卫开始反击。',
      },
      {
        enemyIds: ['corridorGuard', 'ruinsGate', 'stoneBallista'],
        reason: '物理摧毁机关石门；两侧弩阵与石卫保护门体，不再使用缚界巨像代替石门。',
      },
    ],
  },
  {
    id: 'ruins-hall',
    name: '尘封大厅',
    boss: 'chasmBeast',
    battles: [
      {
        enemyIds: ['shadowStalker', 'corridorGuard'],
        reason: '大厅暗处的跳行者与残存石卫，呼应黑暗中不断出现的袭击。',
      },
      {
        enemyIds: ['viperShadow', 'raptorStorm'],
        reason: '断崖渡口附近的蛇、鸟异兽，呼应两艘木船上的蛇鸟印记。',
      },
      {
        enemyIds: ['raptorStorm', 'shadowStalker'],
        reason: '乘鸟船渡崖后落入怪物岔路，怪鸟与暗影伏击者接连围堵。',
      },
      {
        enemyIds: ['viperShadow', 'raptorStorm', 'shadowStalker'],
        reason: '岔路深处形成包围，使用三类大厅与断崖怪物，体现落地后敌人更多。',
      },
      {
        enemyIds: ['raptorStorm', 'chasmBeast', 'viperShadow'],
        reason: '裂渊兽首是断崖怪群头领；击败它才度过大厅，不提前出现墓室祭司。',
      },
    ],
  },
  {
    id: 'ruins-sinkhole',
    name: '中庭沉坑',
    boss: 'brassColossus',
    battles: [
      {
        enemyIds: ['stoneBeetle', 'ruinsMudGolem'],
        reason: '击碎空心地板进入地下后，遭遇石甲虫与泥石傀儡。',
      },
      {
        enemyIds: ['stoneBeetle', 'brassSeeker'],
        reason: '迷宫岔道的石甲虫和黄铜巡察机，呼应地下通路与古代机械。',
      },
      {
        enemyIds: ['ruinsMudGolem', 'brassSeeker'],
        reason: '泥石堵路、巡察机扫描，衬托伊蒂丝依据气流寻找通路。',
      },
      {
        enemyIds: ['stoneBeetle', 'brassSeeker', 'ruinsMudGolem'],
        reason: '通向大房间的最后防线，以虫群、傀儡和黄铜机械组成守备。',
      },
      {
        enemyIds: ['stoneBeetle', 'brassColossus', 'brassSeeker'],
        reason: '三角头黄铜独眼巨像以激光和冲锋守住大房间；铜钥匙只在击败后取得。',
      },
    ],
  },
  {
    id: 'ruins-tomb',
    name: '核心墓室',
    boss: 'cinderPriest',
    battles: [
      {
        enemyIds: ['tombBeetle', 'tombWarden'],
        reason: '铜钥匙打开墓室、供能中断后，金甲虫与守墓魔像启动防卫。',
      },
      {
        enemyIds: ['tombWarden', 'cultistSpecter'],
        reason: '守墓魔像和侍僧残魂守住石棺周围，祭司仍在逐渐苏醒。',
      },
      {
        enemyIds: ['tombBeetle', 'cultistSpecter'],
        reason: '棺底纹路牵动金甲虫与咒文残魂，延续防卫装置和祭祀主题。',
      },
      {
        enemyIds: ['tombBeetle', 'tombWarden', 'cultistSpecter'],
        reason: '石棺前的完整守祭阵容，给苏醒中的祭司留下危机递进。',
      },
      {
        enemyIds: ['tombWarden', 'cinderPriest', 'cultistSpecter'],
        reason: '石棺中的余烬大祭司正式苏醒；击败后才追问其祭祀对象，不提前揭开灰的真相。',
      },
    ],
  },
  {
    id: 'ruins-curse',
    name: '灰的真相 · 诅咒显现',
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
        enemyIds: ['blackOoze', 'voidParasite', 'cultistSpecter'],
        reason: '诅咒扩散牵动残魂，黑液与寄生物构成主要威胁。',
      },
      {
        enemyIds: ['voidParasite', 'cultistSpecter'],
        reason: '邪能寄生物与祭祀残魂拱卫异变本体，为最后正面对抗清开道路。',
      },
      {
        enemyIds: ['blackOoze', 'apepLamb', 'voidParasite'],
        reason: '阿佩普的羔羊是灰异变后的本体；只有最终击败后，灰才恢复人形、道谢并化灰消散。',
      },
    ],
  },
]);

export const TUTORIAL_TARGETS = Object.freeze({
  vulnerable: 'pebble',
  slow: 'warden',
  armour: 'bossGate',
});
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
    hpScale: tutorial ? (index === 0 ? 1.875 : 0.975) : 1,
    ...(tutorial
      ? {
          bossHpScale: 0.85,
          enemyDamageScale: 1,
          occupiedOpeningTarget: index === 1,
          initialEnemyBuffs:
            index === 1 ? { [TUTORIAL_TARGETS.vulnerable]: { vulnerable: 1 } } : {},
        }
      : {}),
    boss: index === FINAL_ENCOUNTER,
    environment: tutorial ? { shield: 2, regen: 1 } : {},
    description: route.battles[index].reason,
  };
}
