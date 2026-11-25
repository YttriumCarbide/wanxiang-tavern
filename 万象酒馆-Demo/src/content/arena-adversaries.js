import { compileEnemyDesign } from '../enemy-base-values.js';
import { applyEnemyTaxonomy } from '../enemy-taxonomy.js';

function buildArenaEnemy(config) {
  const {
    id,
    name,
    slug,
    title,
    color,
    speed,
    tier,
    attackStyle,
    attackType,
    weaknesses,
    toughness,
    intents,
    elite = false,
    standOnCard = false,
  } = config;

  const compiled = compileEnemyDesign(id, tier, speed, intents, undefined, false);

  const compiledIntents = compiled.intents.map((intent, index) => {
    const source = intents[index];
    if (source && source.damageType) {
      return {
        ...intent,
        damageType: source.damageType,
      };
    }
    return intent;
  });

  return {
    id,
    name,
    title,
    color,
    portrait: slug,
    model: `${slug}.glb`,
    attackStyle,
    attackType,
    weaknesses,
    toughness,
    hp: compiled.hp,
    mp: 0,
    speed,
    limit: 1,
    buffs: {},
    tactic: { target: 'fixed' },
    displayPlinth: false,
    intents: compiledIntents,
    elite,
    standOnCard,
    nonVoxel: false,
  };
}

const arenaEnemies = [
  buildArenaEnemy({
    id: 'arenaRetiarius',
    name: '沙场网斗士',
    slug: 'arena-retiarius',
    title: '首都内部竞技场 / 轻甲角斗',
    color: '#e0ad3e',
    speed: 4,
    tier: 'medium',
    attackStyle: 'patrol-pounce',
    attackType: 'spear',
    weaknesses: ['axe', 'lightning', 'fire'],
    toughness: 3,
    intents: [
      {
        name: '三叉戟刺击',
        slots: [1],
        effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
      },
      {
        name: '投网',
        slots: [0, 2],
        effects: [
          { type: 'damage', target: 'opponents', power: 'low' },
          { type: 'buff', target: 'opponents', power: 'low', buff: 'bind' },
        ],
      },
    ],
    elite: false,
    standOnCard: false,
  }),
  buildArenaEnemy({
    id: 'arenaClockworkLion',
    name: '发条机兵',
    slug: 'arena-clockwork-lion',
    title: '首都内部竞技场 / 炼金战兽',
    color: '#ffe37d',
    speed: 4,
    tier: 'medium',
    attackStyle: 'claw-pounce',
    attackType: 'brawl',
    weaknesses: ['spear', 'lightning', 'ice'],
    toughness: 3,
    intents: [
      {
        name: '扑咬',
        slots: [0],
        effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
      },
      {
        name: '炉心吐息',
        slots: [1, 2],
        damageType: 'fire',
        effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
      },
    ],
    elite: false,
    standOnCard: false,
  }),
  buildArenaEnemy({
    id: 'arenaBeastmaster',
    name: '铁笼驯兽官',
    slug: 'arena-beastmaster',
    title: '首都内部竞技场 / 驯兽控场',
    color: '#b31935',
    speed: 3,
    tier: 'medium',
    attackStyle: 'patrol-pounce',
    attackType: 'lightning',
    weaknesses: ['sword', 'ice', 'wind'],
    toughness: 3,
    intents: [
      {
        name: '金属鞭击',
        slots: [0, 1],
        effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
      },
      {
        name: '震兽号角',
        slots: [1],
        effects: [{ type: 'buff', target: 'allAllies', power: 'low', buff: 'strength' }],
      },
    ],
    elite: false,
    standOnCard: false,
  }),
  buildArenaEnemy({
    id: 'arenaHoplite',
    name: '银星重盾卫',
    slug: 'arena-hoplite',
    title: '首都内部竞技场 / 重盾壁垒',
    color: '#c2cde0',
    speed: 2,
    tier: 'medium',
    attackStyle: 'patrol-pounce',
    attackType: 'spear',
    weaknesses: ['axe', 'lightning', 'dark'],
    toughness: 4,
    intents: [
      {
        name: '短矛突刺',
        slots: [1],
        effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
      },
      {
        name: '塔盾防御',
        slots: [1],
        effects: [
          { type: 'shield', target: 'self', power: 'medium' },
          { type: 'buff', target: 'self', power: 'low', buff: 'guard' },
        ],
      },
    ],
    elite: false,
    standOnCard: false,
  }),
  buildArenaEnemy({
    id: 'arenaChariotJuggernaut',
    name: '重装战轮破阵者',
    slug: 'arena-chariot-juggernaut',
    title: '首都内部竞技场 / 双持狂战',
    color: '#e0ad3e',
    speed: 2,
    tier: 'high',
    attackStyle: 'corridor-cleave',
    attackType: 'axe',
    weaknesses: ['spear', 'ice', 'lightning'],
    toughness: 5,
    intents: [
      {
        name: '双斧横扫',
        slots: [0, 2],
        effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
      },
      {
        name: '战轮冲撞',
        slots: [1],
        effects: [
          { type: 'damage', target: 'opponents', power: 'high' },
          { type: 'buff', target: 'opponents', power: 'low', buff: 'weak' },
        ],
      },
    ],
    elite: true,
    standOnCard: true,
  }),
  buildArenaEnemy({
    id: 'arenaInquisitorCaptain',
    name: '万圣裁决卫队长',
    slug: 'arena-inquisitor-captain',
    title: '首都内部竞技场 / 皇家督战',
    color: '#e8eef7',
    speed: 3,
    tier: 'high',
    attackStyle: 'corridor-cleave',
    attackType: 'sword',
    weaknesses: ['axe', 'dark', 'wind'],
    toughness: 5,
    intents: [
      {
        name: '重剑斩击',
        slots: [1],
        effects: [{ type: 'damage', target: 'opponents', power: 'high' }],
      },
      {
        name: '裁决光环',
        slots: [0, 1, 2],
        damageType: 'light',
        effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
      },
    ],
    elite: true,
    standOnCard: true,
  }),
];

const arenaChampion = {
  id: 'arenaGrandChampion',
  name: '帝都大冠军·奥勒留',
  title: '首都内部竞技场 / 帝国巅峰',
  color: '#e0ad3e',
  portrait: 'arena-grand-champion',
  model: 'arena-grand-champion.glb',
  boss: true,
  overlord: true,
  standOnCard: true,
  nonVoxel: true,
  displayPlinth: false,
  archiveAnimationLabels: { Talon_Rend: '终极处决' },
  intents: [{ name: '行动待定', text: '行动文本待定。' }],
};

export const ARENA_ARCHIVE_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    [...arenaEnemies, arenaChampion].map((entry) => [
      entry.id,
      applyEnemyTaxonomy({ ...entry, archiveSource: '首都内部竞技场' }),
    ]),
  ),
);
