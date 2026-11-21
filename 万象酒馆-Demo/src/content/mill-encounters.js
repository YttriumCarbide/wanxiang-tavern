export const TUTORIAL_TARGETS = Object.freeze({
  vulnerable: 'millNettle',
  slow: 'millGiantVole',
  armour: 'millVoleAlpha',
});

export const MILL_ROUTES = Object.freeze([
  {
    id: 'mill-1-canal',
    nodeId: 'mill-1-canal',
    ordinal: '1',
    kind: 'mainline',
    name: '绿蕨磨坊 · 外围水渠与篱笆',
    siteName: '外围水渠与篱笆',
    hookTitle: '田鼠泛滥',
    boss: 'millVoleAlpha',
    battles: [
      { name: '外围水渠', enemyIds: ['millCanalFrog', 'millMossBug'] },
      { name: '荆棘篱笆', enemyIds: ['millNettle', 'millVolePup'] },
      { name: '蓄水闸口', enemyIds: ['millGiantVole', 'millMossBug'] },
      { name: '杂物篱院', enemyIds: ['millStrayCat', 'millShellBeetle'] },
      { name: '篱笆鼠巢', enemyIds: ['millVolePup', 'millVoleAlpha', 'millCanalFrog'] },
    ],
    tutorialBattles: [
      { name: '水渠浅坡', enemyIds: ['millCanalFrog'] },
      { name: '破损木篱', enemyIds: ['millNettle', 'millVolePup'] },
      { name: '石渠挡道处', enemyIds: ['millGiantVole'] },
      { name: '磨坊门槛前', enemyIds: ['millStrayCat', 'millShellBeetle'] },
      { name: '篱笆鼠巢', enemyIds: ['millVolePup', 'millVoleAlpha', 'millCanalFrog'] },
    ],
  },
  {
    id: 'mill-2-hall',
    nodeId: 'mill-2-hall',
    ordinal: '2',
    kind: 'mainline',
    name: '绿蕨磨坊 · 磨坊主厅',
    siteName: '磨坊主厅',
    hookTitle: '狼籍一片的磨坊主厅',
    boss: 'millRoachSwarm',
    battles: [
      { name: '坍塌木门', enemyIds: ['millMossBug', 'millVolePup'] },
      { name: '散落麦袋区', enemyIds: ['millNettle', 'millStrayCat'] },
      { name: '断裂石磨盘', enemyIds: ['millGiantVole', 'millShellBeetle'] },
      { name: '旧面粉栈道', enemyIds: ['millMiniMoldSlime', 'millDustBat'] },
      { name: '倾袋虫巢', enemyIds: ['millMossBug', 'millRoachSwarm', 'millShellBeetle'] },
    ],
  },
  {
    id: 'mill-a-cellar',
    nodeId: 'mill-a-cellar',
    ordinal: 'a',
    kind: 'branch',
    name: '绿蕨磨坊 · 酒窖前的地下通道',
    siteName: '酒窖前的地下通道',
    hookTitle: '酒窖霉潮',
    boss: 'millMoldSlimeBoss',
    battles: [
      { name: '斜木窖门', enemyIds: ['millCanalFrog', 'millMossBug'] },
      { name: '潮湿石阶', enemyIds: ['millPaleSlug', 'millCanalFrog'] },
      { name: '霉斑橡木架', enemyIds: ['millMiniMoldSlime', 'millShellBeetle'] },
      { name: '积水短道', enemyIds: ['millPaleSlug', 'millMiniMoldSlime'] },
      { name: '旧钱箱酒窖', enemyIds: ['millMiniMoldSlime', 'millMoldSlimeBoss', 'millPaleSlug'] },
    ],
  },
  {
    id: 'mill-3-loft',
    nodeId: 'mill-3-loft',
    ordinal: '3',
    kind: 'mainline',
    name: '绿蕨磨坊 · 磨坊二楼',
    siteName: '磨坊二楼',
    hookTitle: '二楼的阴影',
    boss: 'millVampireBat',
    battles: [
      { name: '吱呀木梯', enemyIds: ['millDustBat', 'millStrayCat'] },
      { name: '旧麦仓隔间', enemyIds: ['millVolePup', 'millGiantVole'] },
      { name: '散落阵图桌', enemyIds: ['millDustBat', 'millPaleSlug'] },
      { name: '垂影主梁', enemyIds: ['millStrayCat', 'millDustBat', 'millShellBeetle'] },
      { name: '梁间蝠巢', enemyIds: ['millDustBat', 'millVampireBat', 'millStrayCat'] },
    ],
  },
  {
    id: 'mill-4-attic',
    nodeId: 'mill-4-attic',
    ordinal: '4',
    kind: 'mainline',
    name: '绿蕨磨坊 · 磨坊阁楼齿轮室',
    siteName: '磨坊阁楼齿轮室',
    hookTitle: '磨坊阁楼的咔哒声',
    boss: 'alchemicalPuppet',
    battles: [
      { name: '窄木梯口', enemyIds: ['millDustBat', 'millShellBeetle'] },
      { name: '铜齿传动架', enemyIds: ['millMiniMoldSlime', 'millDustBat'] },
      { name: '废液焦痕区', enemyIds: ['millPaleSlug', 'millGiantVole'] },
      { name: '失重木梁下', enemyIds: ['millDustBat', 'millGiantVole', 'millShellBeetle'] },
      { name: '阁楼炼金核心室', enemyIds: ['alchemicalPuppet'] },
    ],
  },
]);

export const MILL_ENEMY_IDS = Object.freeze([
  'millMossBug',
  'millCanalFrog',
  'millShellBeetle',
  'millNettle',
  'millVolePup',
  'millStrayCat',
  'millDustBat',
  'millGiantVole',
  'millMiniMoldSlime',
  'millPaleSlug',
]);

export function millEncounterSpec(sequence, index, { tutorial = false } = {}) {
  const route = MILL_ROUTES[sequence];
  if (!route) throw Error('绿蕨磨坊关卡序号无效');
  const battles = tutorial && route.tutorialBattles ? route.tutorialBattles : route.battles;
  const battle = battles[index];
  if (!battle) throw Error('绿蕨磨坊战斗场次无效');
  const useTutorialVulnerable = Boolean(tutorial && sequence === 0 && index === 1);
  return {
    map: 'mill',
    name: route.name,
    subtitle: route.hookTitle,
    hpScale: 1,
    enemyIds: [...battle.enemyIds],
    boss: index === 4,
    environment: {},
    ...(tutorial && sequence === 0 ? { occupiedOpeningTarget: index === 1 } : {}),
    initialEnemyBuffs: useTutorialVulnerable
      ? { [TUTORIAL_TARGETS.vulnerable]: { vulnerable: 1 } }
      : {},
  };
}
