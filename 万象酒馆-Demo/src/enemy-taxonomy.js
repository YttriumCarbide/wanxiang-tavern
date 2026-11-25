export const ENEMY_ARCHIVE_CATEGORIES = Object.freeze([
  { id: 'beast', label: '野兽/魔兽', species: ['猎犬', '巨蛇', '怪鸟'] },
  { id: 'insect', label: '虫甲/奇异', species: ['甲虫', '巨蜂', '史莱姆', '魔菇'] },
  { id: 'construct', label: '构装/机械', species: ['魔像', '机兵'] },
  { id: 'humanoid', label: '人形阵营', species: ['剑士', '弓手', '术士', '祭司'] },
  { id: 'spirit', label: '灵体/能量', species: ['魔灵'] },
  { id: 'other', label: '其他', species: [] },
]);

const CATEGORY_BY_SPECIES = new Map(
  ENEMY_ARCHIVE_CATEGORIES.flatMap(({ id, species }) =>
    species.map((baseSpecies) => [baseSpecies, id]),
  ),
);
const CATEGORY_IDS = new Set(ENEMY_ARCHIVE_CATEGORIES.map(({ id }) => id));

// Only reviewed matches are mapped. Unmapped official IDs stay in 其他.
const OFFICIAL_BASE_SPECIES = Object.freeze({
  mossSlime: '史莱姆',
  millMiniMoldSlime: '史莱姆',
  blackOoze: '史莱姆',
  drakeBadlandSlime: '史莱姆',
  sprout: '魔菇',
  fogSpore: '魔菇',
  pebble: '魔灵',
  riftMote: '魔灵',
  shardSprite: '魔灵',
  conduitWisp: '魔灵',
  cultistSpecter: '魔灵',
  pureCreationElemental: '魔灵',
  pureDestructionElemental: '魔灵',
  overloadCreationElemental: '魔灵',
  overloadDestructionElemental: '魔灵',
  hound: '猎犬',
  greyProwler: '猎犬',
  patrolHound: '猎犬',
  erosionHound: '猎犬',
  arenaQualifierHound: '猎犬',
  arenaQualifierHoundCaptain: '猎犬',
  warden: '魔像',
  hollowSentry: '魔像',
  corridorGuard: '魔像',
  ruinsMudGolem: '魔像',
  tombWarden: '魔像',
  ladderRockGiant: '魔像',
  hexer: '祭司',
  veilMender: '祭司',
  goblinShaman: '祭司',
  crystalBeetle: '甲虫',
  millMossBug: '甲虫',
  millShellBeetle: '甲虫',
  stoneBeetle: '甲虫',
  tombBeetle: '甲虫',
  drakeCrystalBeetle: '甲虫',
  cinderImp: '机兵',
  rustMiner: '机兵',
  railSpider: '机兵',
  crystalMiner: '机兵',
  partsCarrier: '机兵',
  lostWelder: '机兵',
  cargoCrawler: '机兵',
  insaneWorker: '机兵',
  scrapHound: '机兵',
  sentryDrone: '机兵',
  brassSeeker: '机兵',
  arenaClockworkLion: '机兵',
  syndicateGildedAutomaton: '机兵',
  dustHexer: '术士',
  barkAcolyte: '术士',
  greyStinger: '巨蜂',
  moonWorker: '巨蜂',
  hiveGuard: '巨蜂',
  trailArbalist: '弓手',
  scaleArcher: '弓手',
  banditPoacher: '弓手',
  arenaQualifierCrossbow: '弓手',
  syndicateRepeatingArbalest: '弓手',
  oathlessDuelist: '剑士',
  scaleWarrior: '剑士',
  banditCutthroat: '剑士',
  arenaInquisitorCaptain: '剑士',
  arenaQualifierWoodShield: '剑士',
  arenaQualifierKnives: '剑士',
  arenaQualifierSwordsman: '剑士',
  syndicateVelvetBlade: '剑士',
  syndicateBloodCroupier: '剑士',
  viperShadow: '巨蛇',
  drakeRattlesnake: '巨蛇',
  bicolorScalePython: '巨蛇',
  raptorStorm: '怪鸟',
  drakeBadlandFalcon: '怪鸟',
  chaosBadlandFalcon: '怪鸟',
});

export const ENEMY_DISPLAY_NAME_OVERRIDES = Object.freeze({
  mossSlime: '苔藓史莱姆',
  blackOoze: '黑液史莱姆',
  sprout: '腐木魔菇',
  fogSpore: '蓝瘴魔菇',
  pebble: '碎石魔灵',
  riftMote: '游隙魔灵',
  cinderImp: '灰炉机兵',
  viperShadow: '噬灵巨蛇',
  raptorStorm: '裂风怪鸟',
  stoneBeetle: '坑道甲虫',
  tombBeetle: '墓室甲虫',
  greyStinger: '灰翼巨蜂',
  trailArbalist: '逐迹弓手',
  veilMender: '蒙面祭司',
  moonWorker: '搬月巨蜂',
  scaleWarrior: '月瞳剑士',
  scaleArcher: '月瞳弓手',
  barkAcolyte: '木面术士',
  rustMiner: '锈蚀机兵',
  railSpider: '轨行机兵',
  shardSprite: '晶簇魔灵',
  partsCarrier: '偏航机兵',
  lostWelder: '无主机兵',
  scrapHound: '废铁机兵',
  sentryDrone: '裂镜机兵',
  conduitWisp: '导管魔灵',
  millMossBug: '苔背甲虫',
  brassSeeker: '黄铜机兵',
  cultistSpecter: '祭魂魔灵',
  drakeBadlandSlime: '龙化史莱姆',
  drakeRattlesnake: '龙铃巨蛇',
  drakeBadlandFalcon: '龙翎怪鸟',
  drakeCrystalBeetle: '龙晶甲虫',
  pureCreationElemental: '创生魔灵',
  pureDestructionElemental: '毁灭魔灵',
  banditCutthroat: '截道剑士',
  banditPoacher: '偷猎弓手',
  goblinShaman: '骨杖祭司',
  erosionHound: '蚀鳞猎犬',
});

export const ENEMY_LEGACY_DISPLAY_NAME_OVERRIDES = Object.freeze({
  mossSlime: '苔团',
  blackOoze: '黑液幼体',
  sprout: '迷路小蕈',
  fogSpore: '蓝瘴囊菇',
  pebble: '碎石幼灵',
  riftMote: '游隙浮灵',
  cinderImp: '灰炉小偶',
  viperShadow: '蛇印噬灵蛇',
  raptorStorm: '鸟印裂风怪鸟',
  stoneBeetle: '坑道石甲虫',
  tombBeetle: '墓室金甲虫',
  greyStinger: '灰翼针蜂',
  trailArbalist: '逐迹弩手',
  veilMender: '蒙面疗愈者',
  moonWorker: '搬月工蜂',
  scaleWarrior: '月瞳蜥蜴刃兵',
  scaleArcher: '月瞳蜥蜴弓手',
  barkAcolyte: '木面护林侍徒',
  rustMiner: '锈蚀采矿机',
  railSpider: '轨行蜘蛛',
  shardSprite: '游离晶簇',
  partsCarrier: '偏航搬运机',
  lostWelder: '无主焊工',
  scrapHound: '废铁巡猎机',
  sentryDrone: '裂镜侦察机',
  conduitWisp: '导管晶灵',
  millMossBug: '苔背虫',
  brassSeeker: '黄铜巡察机',
  cultistSpecter: '祭坛侍僧残魂',
  drakeBadlandSlime: '荒地史莱姆（龙化）',
  drakeRattlesnake: '荒地响尾蛇（龙化）',
  drakeBadlandFalcon: '荒地猎鹰（龙化）',
  drakeCrystalBeetle: '龙晶背甲虫',
  pureCreationElemental: '纯净创生元素',
  pureDestructionElemental: '纯净毁灭元素',
  banditCutthroat: '荒路截道贼',
  banditPoacher: '黑林偷猎弓手',
  goblinShaman: '哥布林骨杖祭司',
  erosionHound: '裂隙蚀鳞猎犬',
});

export function enemyCategoryForSpecies(baseSpecies) {
  return CATEGORY_BY_SPECIES.get(baseSpecies);
}

export function isEnemyCategory(category) {
  return CATEGORY_IDS.has(category);
}

export function enemyTaxonomy({ id, baseSpecies, category }) {
  const species = Object.hasOwn(OFFICIAL_BASE_SPECIES, id)
    ? OFFICIAL_BASE_SPECIES[id]
    : baseSpecies;
  const speciesCategory = enemyCategoryForSpecies(species);
  if (speciesCategory) return { category: speciesCategory, baseSpecies: species };
  return { category: isEnemyCategory(category) ? category : 'other' };
}

export function applyEnemyTaxonomy(entry) {
  const taxonomy = enemyTaxonomy(entry);
  const definition = { ...entry, ...taxonomy };
  if (!taxonomy.baseSpecies) delete definition.baseSpecies;
  return definition;
}
