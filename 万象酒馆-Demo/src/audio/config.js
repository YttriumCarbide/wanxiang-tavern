export const MUSIC = Object.freeze({
  inn: Object.freeze({
    file: './assets/audio/tavern.mp3',
    name: '万象酒馆一',
    category: 'tavern',
    badge: '酒馆',
    sceneLabel: '酒馆内随机',
  }),
  inn2: Object.freeze({
    file: './assets/audio/tavern-2.mp3',
    name: '万象酒馆二',
    category: 'tavern',
    badge: '酒馆',
    sceneLabel: '酒馆内随机',
  }),
  inn3: Object.freeze({
    file: './assets/audio/tavern-3.mp3',
    name: '万象酒馆三',
    category: 'tavern',
    badge: '酒馆',
    sceneLabel: '酒馆内随机',
  }),
  town: Object.freeze({
    file: './assets/audio/starbell-town.mp3',
    name: '星钟之地',
    category: 'town',
    badge: '城镇',
    sceneLabel: '星灯镇 · 外出漫游',
  }),
  battle: Object.freeze({
    file: './assets/audio/encounter.mp3',
    name: '征途的交锋',
    category: 'battle',
    badge: '遭遇',
    sceneLabel: '常规遭遇战',
  }),
  frostBattle: Object.freeze({
    file: './assets/audio/xueyuan.mp3',
    name: '霜原的回响',
    category: 'battle',
    badge: '遭遇',
    sceneLabel: '霜晶矿窟',
  }),
  forgeBattle: Object.freeze({
    file: './assets/audio/forge-encounter.mp3',
    name: '余烬的锻音',
    category: 'battle',
    badge: '遭遇',
    sceneLabel: '余烬铸坊',
  }),
  ruinsBoss: Object.freeze({
    file: './assets/audio/battle.m4a',
    name: '激战1',
    category: 'boss',
    badge: '首领',
    sceneLabel: '首领战随机',
  }),
  boss: Object.freeze({
    file: './assets/audio/boss.m4a',
    name: '激战2',
    category: 'boss',
    badge: '首领',
    sceneLabel: '首领战随机',
  }),
  boss3: Object.freeze({
    file: './assets/audio/boss-3.mp3',
    name: '激战3',
    category: 'boss',
    badge: '首领',
    sceneLabel: '首领战随机',
  }),
  puppetBoss: Object.freeze({
    file: './assets/audio/boss-puppet.mp3',
    name: '倒悬的发条',
    category: 'boss',
    badge: '霸主',
    sceneLabel: '失败的炼金傀偶',
  }),
  warlordBoss: Object.freeze({
    file: './assets/audio/boss-warlord.mp3',
    name: '暗鳞的咆哮',
    category: 'boss',
    badge: '霸主',
    sceneLabel: '初生暗鳞督军',
  }),
  wyvernBoss: Object.freeze({
    file: './assets/audio/boss-wyvern.mp3',
    name: '辉光的审判',
    category: 'boss',
    badge: '霸主',
    sceneLabel: '辉光亚龙',
  }),
  syndicateBoss: Object.freeze({
    file: './assets/audio/boss-syndicate.mp3',
    name: '星灯的暗影',
    category: 'boss',
    badge: '霸主',
    sceneLabel: '黑市霸主',
  }),
});

export const BGM_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'all', label: '全部' }),
  Object.freeze({ id: 'tavern', label: '酒馆' }),
  Object.freeze({ id: 'town', label: '城镇' }),
  Object.freeze({ id: 'battle', label: '战斗' }),
  Object.freeze({ id: 'boss', label: '首领' }),
]);

export const BGM_PLAYLIST = Object.freeze(
  Object.entries(MUSIC).map(([id, track]) => Object.freeze({ id, ...track })),
);

export const SCENE_TRACKS = Object.freeze({
  inn: Object.freeze(['inn', 'inn2', 'inn3']),
  town: Object.freeze(['town']),
  boss: Object.freeze(['ruinsBoss', 'boss', 'boss3']),
});

const TAVERN_SCENES = new Set([
  'tavern',
  'corridor',
  'guest-room',
  'master-bedroom',
  'inn',
  'gate',
]);

export function locationMusic(scene) {
  return !scene || TAVERN_SCENES.has(scene) ? 'inn' : 'town';
}

export const OVERLORD_MUSIC = Object.freeze({
  banditSyndicateKing: 'syndicateBoss',
  alchemicalPuppet: 'puppetBoss',
  darkscaleWarlord: 'warlordBoss',
  radiantWyvern: 'wyvernBoss',
});

/** Select music from the encounter's actual map, including repeated Boss definitions. */
export function encounterMusic({ map, boss, enemyIds } = {}) {
  const enemies = Array.isArray(enemyIds) ? enemyIds : [];
  for (const enemyId of enemies) {
    if (Object.hasOwn(OVERLORD_MUSIC, enemyId)) return OVERLORD_MUSIC[enemyId];
  }
  if (boss) return 'boss';
  return map === 'forge' ? 'forgeBattle' : map === 'frost' ? 'frostBattle' : 'battle';
}

export const DEFAULT_AUDIO = { music: 0.32, effects: 0.6, musicMuted: false, effectsMuted: false };

export function audioPreferences(value) {
  const input = value && typeof value === 'object' ? value : {};
  const volume = (key) =>
    typeof input[key] === 'number' && Number.isFinite(input[key])
      ? Math.max(0, Math.min(1, input[key]))
      : DEFAULT_AUDIO[key];
  return {
    music: volume('music'),
    effects: volume('effects'),
    musicMuted: input.musicMuted === true,
    effectsMuted: input.effectsMuted === true,
  };
}
