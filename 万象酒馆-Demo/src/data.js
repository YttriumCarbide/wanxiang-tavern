import { CHANGJING_YUEXI } from './content/changjing-yuexi.js';
import { EXTRA_ENEMIES, EXTRA_BOSSES } from './content/new-adversaries.js';
export const BUFFS = {
  haste: {
    name: '敏捷',
    icon: '捷',
    text: '每层增加1次每回合行动上限，最多增加2次；仍消耗正常AP。',
  },
  bind: {
    name: '禁锢',
    icon: '禁',
    text: '取消敌人本回合尚未执行的行动，回合结束解除；层数不延长持续时间。',
  },
  strength: { name: '力量', icon: '力', text: '每次攻击增加层数对应的伤害' },
  guard: { name: '守势', icon: '守', text: '获得护盾时增加层数对应的护盾' },
  weak: { name: '虚弱', icon: '弱', text: '攻击伤害减少25%' },
  vulnerable: { name: '易伤', icon: '伤', text: '受到攻击伤害增加50%' },
  regen: { name: '再生', icon: '生', text: '回合末先回复生命，濒死单位无法回复' },
  poison: { name: '中毒', icon: '毒', text: '回合末再生后失去层数对应的生命' },
  slow: { name: '迟缓', icon: '缓', text: '减少敌人速度，实时后移敌方行动' },
  bleed: {
    name: '流血',
    icon: '血',
    text: '每次行动前失去层数对应的生命，因本次流血濒死则取消行动',
  },
  iron: { name: '铁皮', icon: '铁', text: '每次受到攻击减少层数对应的伤害' },
};
export const HEROES = [
  CHANGJING_YUEXI,
  {
    id: 'lyria',
    weapon: 'sword',
    name: '绯璃',
    title: '剑姬',
    color: '#d48c98',
    portrait: 'swordswoman',
    hp: 36,
    mp: 18,
    limit: 2,
    attack: 8,
    attackName: '斩击',
    skills: [
      {
        id: 'blade-dance',
        name: '二重刃舞',
        ap: 2,
        mp: 3,
        target: 'enemy',
        text: '造成18伤害，施加2流血。',
        effects: [
          { type: 'damage', value: 18 },
          { type: 'buff', buff: 'bleed', value: 2 },
        ],
      },
      {
        id: 'edge',
        name: '战锋',
        passive: true,
        location: '前场',
        text: '身处前场时获得1力量。',
        buff: 'strength',
        value: 1,
      },
    ],
  },
  {
    id: 'morrow',
    weapon: 'staff',
    name: '时砂',
    title: '时术师',
    color: '#89c6cd',
    portrait: 'chronomancer',
    hp: 30,
    mp: 26,
    limit: 1,
    attack: 5,
    attackName: '砂针',
    skills: [
      {
        id: 'delay',
        name: '迟滞',
        ap: 1,
        mp: 3,
        target: 'enemy',
        text: '施加2迟缓与1虚弱，后移敌人行动。',
        effects: [
          { type: 'buff', buff: 'slow', value: 2 },
          { type: 'buff', buff: 'weak', value: 1 },
        ],
      },
      {
        id: 'hourglass',
        name: '凝固时刻',
        ap: 2,
        mp: 5,
        target: 'enemy',
        text: '造成10伤害，施加3迟缓。',
        effects: [
          { type: 'damage', value: 10 },
          { type: 'buff', buff: 'slow', value: 3 },
        ],
      },
    ],
  },
  {
    id: 'serin',
    weapon: 'staff',
    name: '塞琳',
    title: '祈愈师',
    color: '#b7cb98',
    portrait: 'healer',
    hp: 32,
    mp: 26,
    limit: 1,
    attack: 4,
    attackName: '光矢',
    skills: [
      {
        id: 'prayer',
        name: '春息祈祷',
        ap: 1,
        mp: 3,
        target: 'ally',
        text: '回复10生命，施加2再生。',
        effects: [
          { type: 'heal', value: 10 },
          { type: 'buff', buff: 'regen', value: 2 },
        ],
      },
      {
        id: 'comfort',
        name: '后援慰藉',
        passive: true,
        location: '后场',
        text: '身处后场时，回合末为生命最低的存活队友额外回复2生命。',
        endHeal: 2,
      },
    ],
  },
  {
    id: 'vesper',
    weapon: 'staff',
    name: '鸦隐',
    title: '咒术师',
    color: '#b39acb',
    portrait: 'warlock',
    hp: 30,
    mp: 24,
    limit: 1,
    attack: 5,
    attackName: '蚀影',
    skills: [
      {
        id: 'corrosion',
        name: '侵蚀印记',
        ap: 1,
        mp: 3,
        target: 'enemy',
        text: '施加3中毒与2易伤。',
        effects: [
          { type: 'buff', buff: 'poison', value: 3 },
          { type: 'buff', buff: 'vulnerable', value: 2 },
        ],
      },
      {
        id: 'raven-ward',
        name: '鸦羽护身',
        passive: true,
        location: '全战斗',
        text: '本场战斗中持续获得1铁皮。',
        buff: 'iron',
        value: 1,
      },
    ],
  },
  {
    id: 'rook',
    weapon: 'bow',
    name: '游隼',
    title: '游侠',
    color: '#cfb782',
    portrait: 'ranger',
    hp: 34,
    mp: 18,
    limit: 2,
    attack: 7,
    attackName: '穿弦',
    skills: [
      {
        id: 'snipe',
        name: '压制射击',
        ap: 1,
        mp: 2,
        target: 'enemy',
        text: '造成9伤害，施加2虚弱。',
        effects: [
          { type: 'damage', value: 9 },
          { type: 'buff', buff: 'weak', value: 2 },
        ],
      },
      {
        id: 'provisions',
        name: '远行整备',
        passive: true,
        location: '战斗外',
        text: '在酒馆整备时增加4点蓝量上限，进入副本时填满；战斗中不回蓝。',
        bonusMp: 4,
      },
    ],
  },
];
export const ENEMIES = [
  {
    id: 'mossSlime',
    attackStyle: 'slime-bounce',
    name: '苔团',
    title: '弱怪 / 简单攻击',
    color: '#91bb78',
    portrait: 'moss-slime',
    hp: 22,
    mp: 0,
    speed: 3,
    limit: 1,
    buffs: {},
    intents: [
      {
        name: '轻撞左位',
        slot: 0,
        text: '攻击左位6伤害',
        effects: [{ type: 'damage', value: 6 }],
      },
    ],
  },
  {
    id: 'sprout',
    attackStyle: 'mushroom-bonk',
    name: '迷路小蕈',
    title: '弱怪 / 缓慢攻击',
    color: '#d1a776',
    portrait: 'sprout',
    hp: 20,
    mp: 0,
    speed: 1,
    limit: 1,
    buffs: {},
    intents: [
      {
        name: '敲打右位',
        slot: 2,
        text: '攻击右位5伤害',
        effects: [{ type: 'damage', value: 5 }],
      },
    ],
  },
  {
    id: 'pebble',
    attackStyle: 'pebble-shards',
    name: '碎石幼灵',
    title: '弱怪 / 薄盾',
    color: '#a9b3b6',
    portrait: 'pebble',
    hp: 28,
    mp: 0,
    speed: 2,
    limit: 1,
    buffs: {},
    intents: [
      {
        name: '缩壳碰撞',
        slot: 1,
        text: '获得3护盾，攻击中位6伤害',
        selfShield: 3,
        effects: [{ type: 'damage', value: 6 }],
      },
    ],
  },
  {
    id: 'hound',
    attackStyle: 'claw-pounce',
    name: '裂隙猎犬',
    title: '快速 / 流血',
    color: '#b46e57',
    portrait: 'hound',
    hp: 36,
    mp: 0,
    speed: 5,
    limit: 1,
    buffs: {},
    intents: [
      {
        name: '撕咬左位',
        slot: 0,
        text: '攻击左位12伤害，施加1流血',
        effects: [
          { type: 'damage', value: 12 },
          { type: 'buff', buff: 'bleed', value: 1 },
        ],
      },
      {
        name: '扑袭右位',
        slot: 2,
        text: '攻击右位13伤害',
        effects: [{ type: 'damage', value: 13 }],
      },
    ],
  },
  {
    id: 'warden',
    attackStyle: 'stone-slam',
    name: '遗迹石卫',
    title: '耐久 / 护盾',
    color: '#8d9fa6',
    portrait: 'golem',
    hp: 55,
    mp: 0,
    speed: 3,
    limit: 1,
    buffs: { iron: 1 },
    intents: [
      {
        name: '筑壳震击',
        slot: 1,
        text: '获得7护盾，再攻击中位9伤害',
        selfShield: 7,
        effects: [{ type: 'damage', value: 9 }],
      },
      {
        name: '重锤左位',
        slot: 0,
        text: '攻击左位16伤害，施加1易伤',
        effects: [
          { type: 'damage', value: 16 },
          { type: 'buff', buff: 'vulnerable', value: 1 },
        ],
      },
    ],
  },
  {
    id: 'hexer',
    attackStyle: 'ember-bolt',
    name: '余烬祭司',
    title: '法术 / 中毒',
    color: '#b097c6',
    portrait: 'cultist',
    hp: 36,
    mp: 0,
    speed: 1,
    limit: 1,
    buffs: {},
    intents: [
      {
        name: '毒焰右位',
        slot: 2,
        text: '攻击右位8伤害，施加2中毒',
        effects: [
          { type: 'damage', value: 8 },
          { type: 'buff', buff: 'poison', value: 2 },
        ],
      },
      {
        name: '衰败中位',
        slot: 1,
        text: '攻击中位9伤害，施加1虚弱',
        effects: [
          { type: 'damage', value: 9 },
          { type: 'buff', buff: 'weak', value: 1 },
        ],
      },
    ],
  },
  ...EXTRA_ENEMIES,
];
export const BOSSES = [
  {
    id: 'bossGate',
    attackStyle: 'gate-crush',
    name: '缚界巨像',
    title: 'Boss / 石卫与界门核心',
    boss: true,
    color: '#dfb46d',
    portrait: 'boss-gate',
    hp: 110,
    mp: 0,
    speed: 3,
    limit: 1,
    buffs: { iron: 1 },
    phaseThreshold: 0.5,
    intents: [
      { name: '重铠震击中位', slot: 1, selfShield: 10, effects: [{ type: 'damage', value: 14 }] },
      {
        name: '两翼崩塌',
        slots: [0, 2],
        effects: [
          { type: 'damage', value: 9 },
          { type: 'buff', buff: 'vulnerable', value: 1 },
        ],
      },
    ],
    enragedIntents: [
      {
        name: '裂核重锤中位',
        slot: 1,
        selfBuff: { strength: 1 },
        effects: [
          { type: 'damage', value: 16 },
          { type: 'buff', buff: 'bleed', value: 2 },
        ],
      },
      { name: '崩解全场', slots: [0, 1, 2], effects: [{ type: 'damage', value: 9 }] },
    ],
  },
  {
    id: 'bossBloom',
    attackStyle: 'spore-volley',
    name: '夜蕈母体',
    title: 'Boss / 古林孢子与再生',
    boss: true,
    color: '#bdaaed',
    portrait: 'boss-bloom',
    hp: 100,
    mp: 0,
    speed: 4,
    limit: 1,
    buffs: { regen: 2 },
    phaseThreshold: 0.5,
    intents: [
      {
        name: '毒花右位',
        slot: 2,
        effects: [
          { type: 'damage', value: 10 },
          { type: 'buff', buff: 'poison', value: 3 },
        ],
      },
      {
        name: '缠根左中位',
        slots: [0, 1],
        effects: [
          { type: 'damage', value: 8 },
          { type: 'buff', buff: 'bleed', value: 1 },
        ],
      },
    ],
    enragedIntents: [
      {
        name: '孢子风全场',
        slots: [0, 1, 2],
        effects: [
          { type: 'damage', value: 6 },
          { type: 'buff', buff: 'poison', value: 2 },
        ],
      },
      {
        name: '噬生左位',
        slot: 0,
        selfHeal: 8,
        effects: [
          { type: 'damage', value: 15 },
          { type: 'buff', buff: 'weak', value: 1 },
        ],
      },
    ],
  },
  ...EXTRA_BOSSES,
];
export const DEFINITIONS = Object.fromEntries(
  [...HEROES, ...ENEMIES, ...BOSSES].map((d) => [d.id, d]),
);
export const ENCOUNTERS = [
  {
    name: '遗迹外厅',
    map: 'ruins',
    enemyIds: ['mossSlime', 'sprout'],
    hpScale: 1,
    description: '两只弱小生物挡在门口。观察攻击位置，练习普通攻击与换位。',
  },
  {
    name: '霜晶矿窟',
    map: 'frost',
    enemyIds: ['pebble', 'sprout'],
    hpScale: 1,
    description: '碎石幼灵和小蕈守着回廊。石灵会给自己加盾，试试连续行动。',
  },
  {
    name: '余烬铸坊',
    map: 'forge',
    enemyIds: ['cinderImp', 'pebble'],
    hpScale: 0.8,
    description: '灰炉小偶在锻台间弹射火星，与碎石幼灵一同守住铸坊。',
  },
  {
    name: '潮汐星殿',
    map: 'tide',
    enemyIds: ['crystalBeetle', 'tideJelly'],
    hpScale: 0.8,
    description: '晶背甲虫与潮灯水母守在星盘旁，注意薄盾和微量中毒。',
  },
  {
    name: '封印核心',
    map: 'ruins',
    boss: true,
    hpScale: 0.65,
    description: '最终对决。敌人降到半血后更换意图。',
  },
];
export function encounterSpec(index, boss = 'bossGate') {
  if (!Number.isInteger(index) || !ENCOUNTERS[index]) throw Error('战斗序号无效');
  const spec = { ...ENCOUNTERS[index] };
  if (spec.boss) {
    spec.name = DEFINITIONS[boss].name;
    spec.map = boss === 'bossBloom' ? 'forest' : boss === 'bossTide' ? 'tide' : 'ruins';
    spec.enemyIds =
      boss === 'bossBloom'
        ? ['warden', boss, 'hound']
        : boss === 'bossTide'
          ? ['tideJelly', boss, 'crystalBeetle']
          : ['hound', boss, 'hexer'];
  } else spec.enemyIds = [...spec.enemyIds];
  return spec;
}
/** Empty enemy positions keep their stone bases; one enemy is centered, two use the wings. */
export function enemySlots(ids) {
  if (ids.length === 1) return [null, ids[0], null];
  if (ids.length === 2) return [ids[0], null, ids[1]];
  return [...ids];
}
export const positionText = (move) =>
  (move.slots || [move.slot]).map((i) => ['左', '中', '右'][i]).join('、') + '位';
export const BASIC = { id: 'attack', name: '普通攻击', ap: 1, mp: 0, target: 'enemy' };
export function ability(id, skillId, definitions = DEFINITIONS) {
  const d = definitions[id];
  if (!d) return undefined;
  if (skillId === 'attack')
    return { ...BASIC, name: d.attackName, effects: [{ type: 'damage', value: d.attack }] };
  return d.skills?.find((s) => s.id === skillId && !s.passive);
}
