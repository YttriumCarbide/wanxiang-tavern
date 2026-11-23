import { compileEnemyDesign } from '../enemy-base-values.js';

const ARCHIVE_SOURCE = '首都内部竞技场 · 海选赛';

function buildQualifier(config) {
  const {
    id,
    name,
    slug,
    color,
    tier,
    designTier,
    attackStyle,
    attackType,
    weaknesses,
    rawIntents,
    toughness,
  } = config;

  const isBoss = tier === 'boss';
  const isElite = tier === 'elite';
  const compiled = compileEnemyDesign(id, designTier, 3, rawIntents, undefined, isBoss);

  const definition = {
    id,
    name,
    color,
    portrait: slug,
    model: `${slug}.glb`,
    archiveSource: ARCHIVE_SOURCE,
    displayPlinth: false,
    standOnCard: isBoss,
    nonVoxel: false,
    elite: isElite,
    boss: isBoss,
    overlord: false,
    mp: 0,
    speed: 3,
    limit: 1,
    buffs: {},
    tactic: { target: 'fixed' },
    hp: compiled.hp,
    intents: compiled.intents,
    weaknesses,
    toughness,
    attackStyle,
    attackType,
  };

  if (isBoss) {
    definition.phaseMode = 'cycle';
  }

  return definition;
}

const ARENA_QUALIFIER_ARCHIVE_DEFINITIONS = Object.freeze(
  Object.fromEntries([
    [
      'arenaQualifierStick',
      buildQualifier({
        id: 'arenaQualifierStick',
        name: '木棍新手',
        slug: 'arena-q-stick',
        color: '#b78b51',
        tier: 'minion',
        designTier: 'low',
        attackStyle: 'corridor-cleave',
        attackType: 'brawl',
        weaknesses: ['sword', 'fire', 'wind'],
        toughness: 1,
        rawIntents: [
          {
            name: '木棍横挥',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
          },
          {
            name: '举棍防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierWoodShield',
      buildQualifier({
        id: 'arenaQualifierWoodShield',
        name: '木盾短剑手',
        slug: 'arena-q-wood-shield',
        color: '#6d8b69',
        tier: 'minion',
        designTier: 'low',
        attackStyle: 'corridor-cleave',
        attackType: 'sword',
        weaknesses: ['axe', 'fire', 'lightning'],
        toughness: 1,
        rawIntents: [
          {
            name: '短剑突刺',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
          },
          {
            name: '举盾防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierSlinger',
      buildQualifier({
        id: 'arenaQualifierSlinger',
        name: '皮兜投石手',
        slug: 'arena-q-slinger',
        color: '#bd8667',
        tier: 'minion',
        designTier: 'low',
        attackStyle: 'ballista-bolt',
        attackType: 'bow',
        weaknesses: ['sword', 'ice', 'wind'],
        toughness: 1,
        rawIntents: [
          {
            name: '皮兜投石',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
          },
          {
            name: '收兜防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierStaff',
      buildQualifier({
        id: 'arenaQualifierStaff',
        name: '练习长棍手',
        slug: 'arena-q-staff',
        color: '#81939c',
        tier: 'minion',
        designTier: 'low',
        attackStyle: 'corridor-cleave',
        attackType: 'brawl',
        weaknesses: ['axe', 'fire', 'lightning'],
        toughness: 1,
        rawIntents: [
          {
            name: '长棍直击',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
          },
          {
            name: '收棍防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierKnives',
      buildQualifier({
        id: 'arenaQualifierKnives',
        name: '双木刀学徒',
        slug: 'arena-q-knives',
        color: '#a66b56',
        tier: 'minion',
        designTier: 'low',
        attackStyle: 'corridor-cleave',
        attackType: 'sword',
        weaknesses: ['spear', 'ice', 'wind'],
        toughness: 1,
        rawIntents: [
          {
            name: '双木刀连斩',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
          },
          {
            name: '交叉格挡',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierPitchfork',
      buildQualifier({
        id: 'arenaQualifierPitchfork',
        name: '草叉参赛者',
        slug: 'arena-q-pitchfork',
        color: '#b7a775',
        tier: 'minion',
        designTier: 'low',
        attackStyle: 'corridor-cleave',
        attackType: 'spear',
        weaknesses: ['sword', 'fire', 'wind'],
        toughness: 1,
        rawIntents: [
          {
            name: '草叉前刺',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
          },
          {
            name: '横叉防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierNet',
      buildQualifier({
        id: 'arenaQualifierNet',
        name: '粗网捕手',
        slug: 'arena-q-net',
        color: '#749798',
        tier: 'minion',
        designTier: 'low',
        attackStyle: 'corridor-cleave',
        attackType: 'brawl',
        weaknesses: ['axe', 'fire', 'lightning'],
        toughness: 1,
        rawIntents: [
          {
            name: '粗网抽打',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
          },
          {
            name: '收网防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierSmith',
      buildQualifier({
        id: 'arenaQualifierSmith',
        name: '铁匠学徒',
        slug: 'arena-q-smith',
        color: '#a58162',
        tier: 'minion',
        designTier: 'low',
        attackStyle: 'corridor-cleave',
        attackType: 'axe',
        weaknesses: ['spear', 'ice', 'wind'],
        toughness: 1,
        rawIntents: [
          {
            name: '铁锤下砸',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
          },
          {
            name: '横锤防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierHound',
      buildQualifier({
        id: 'arenaQualifierHound',
        name: '驯养猎犬',
        slug: 'arena-q-hound',
        color: '#b38358',
        tier: 'minion',
        designTier: 'low',
        attackStyle: 'patrol-pounce',
        attackType: 'brawl',
        weaknesses: ['spear', 'fire', 'ice'],
        toughness: 1,
        rawIntents: [
          {
            name: '扑咬',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
          },
          {
            name: '伏低防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierRam',
      buildQualifier({
        id: 'arenaQualifierRam',
        name: '训练山羊',
        slug: 'arena-q-ram',
        color: '#b2b3a5',
        tier: 'minion',
        designTier: 'low',
        attackStyle: 'patrol-pounce',
        attackType: 'brawl',
        weaknesses: ['axe', 'fire', 'lightning'],
        toughness: 1,
        rawIntents: [
          {
            name: '低头顶撞',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
          },
          {
            name: '收蹄防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierSpear',
      buildQualifier({
        id: 'arenaQualifierSpear',
        name: '老练短矛手',
        slug: 'arena-q-spear',
        color: '#8b9ba3',
        tier: 'elite',
        designTier: 'medium',
        attackStyle: 'corridor-cleave',
        attackType: 'spear',
        weaknesses: ['sword', 'fire', 'wind'],
        toughness: 2,
        rawIntents: [
          {
            name: '短矛连刺',
            slots: [0, 1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '竖矛防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierAxes',
      buildQualifier({
        id: 'arenaQualifierAxes',
        name: '双斧搏斗手',
        slug: 'arena-q-axes',
        color: '#b57962',
        tier: 'elite',
        designTier: 'medium',
        attackStyle: 'corridor-cleave',
        attackType: 'axe',
        weaknesses: ['spear', 'ice', 'wind'],
        toughness: 2,
        rawIntents: [
          {
            name: '双斧劈砍',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '交叉斧挡',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierIronShield',
      buildQualifier({
        id: 'arenaQualifierIronShield',
        name: '铁沿盾斗士',
        slug: 'arena-q-iron-shield',
        color: '#7f969a',
        tier: 'elite',
        designTier: 'medium',
        attackStyle: 'corridor-cleave',
        attackType: 'brawl',
        weaknesses: ['axe', 'fire', 'lightning'],
        toughness: 2,
        rawIntents: [
          {
            name: '盾沿撞击',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '举盾防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierCrossbow',
      buildQualifier({
        id: 'arenaQualifierCrossbow',
        name: '轻弩射手',
        slug: 'arena-q-crossbow',
        color: '#81906b',
        tier: 'elite',
        designTier: 'medium',
        attackStyle: 'ballista-bolt',
        attackType: 'bow',
        weaknesses: ['sword', 'ice', 'wind'],
        toughness: 2,
        rawIntents: [
          {
            name: '轻弩齐射',
            slots: [0, 1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '收弩防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierBoxer',
      buildQualifier({
        id: 'arenaQualifierBoxer',
        name: '缠手拳斗士',
        slug: 'arena-q-boxer',
        color: '#b58b69',
        tier: 'elite',
        designTier: 'medium',
        attackStyle: 'corridor-cleave',
        attackType: 'brawl',
        weaknesses: ['spear', 'fire', 'ice'],
        toughness: 2,
        rawIntents: [
          {
            name: '缠手直拳',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '抱架防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierPoleMaster',
      buildQualifier({
        id: 'arenaQualifierPoleMaster',
        name: '短袍棍师',
        slug: 'arena-q-pole-master',
        color: '#927eaa',
        tier: 'elite',
        designTier: 'medium',
        attackStyle: 'corridor-cleave',
        attackType: 'brawl',
        weaknesses: ['axe', 'fire', 'lightning'],
        toughness: 2,
        rawIntents: [
          {
            name: '长棍横扫',
            slots: [0, 1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '收棍防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierFlail',
      buildQualifier({
        id: 'arenaQualifierFlail',
        name: '链锤角斗士',
        slug: 'arena-q-flail',
        color: '#b29b6a',
        tier: 'elite',
        designTier: 'medium',
        attackStyle: 'corridor-cleave',
        attackType: 'axe',
        weaknesses: ['sword', 'ice', 'wind'],
        toughness: 2,
        rawIntents: [
          {
            name: '链锤抡击',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '收链防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierTrapper',
      buildQualifier({
        id: 'arenaQualifierTrapper',
        name: '捕兽老手',
        slug: 'arena-q-trapper',
        color: '#7f986e',
        tier: 'elite',
        designTier: 'medium',
        attackStyle: 'corridor-cleave',
        attackType: 'spear',
        weaknesses: ['axe', 'fire', 'lightning'],
        toughness: 2,
        rawIntents: [
          {
            name: '长杆戳击',
            slots: [0, 1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '横杆防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierBoar',
      buildQualifier({
        id: 'arenaQualifierBoar',
        name: '披甲斗猪',
        slug: 'arena-q-boar',
        color: '#9a8271',
        tier: 'elite',
        designTier: 'medium',
        attackStyle: 'patrol-pounce',
        attackType: 'brawl',
        weaknesses: ['spear', 'fire', 'ice'],
        toughness: 2,
        rawIntents: [
          {
            name: '披甲冲撞',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '伏身防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierSwordsman',
      buildQualifier({
        id: 'arenaQualifierSwordsman',
        name: '护具剑士',
        slug: 'arena-q-swordsman',
        color: '#8b92b1',
        tier: 'elite',
        designTier: 'medium',
        attackStyle: 'corridor-cleave',
        attackType: 'sword',
        weaknesses: ['axe', 'ice', 'wind'],
        toughness: 2,
        rawIntents: [
          {
            name: '护具剑斩',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '举剑防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierTowerCaptain',
      buildQualifier({
        id: 'arenaQualifierTowerCaptain',
        name: '木塔盾队长',
        slug: 'arena-q-tower-captain',
        color: '#729193',
        tier: 'boss',
        designTier: 'high',
        attackStyle: 'corridor-cleave',
        attackType: 'brawl',
        weaknesses: ['axe', 'fire', 'lightning'],
        toughness: 3,
        rawIntents: [
          {
            name: '塔盾冲撞',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'high' }],
          },
          {
            name: '举盾防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierPikeCaptain',
      buildQualifier({
        id: 'arenaQualifierPikeCaptain',
        name: '长枪队长',
        slug: 'arena-q-pike-captain',
        color: '#969aa6',
        tier: 'boss',
        designTier: 'high',
        attackStyle: 'corridor-cleave',
        attackType: 'spear',
        weaknesses: ['sword', 'fire', 'wind'],
        toughness: 3,
        rawIntents: [
          {
            name: '长枪横扫',
            slots: [0, 1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '竖枪防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierMaul',
      buildQualifier({
        id: 'arenaQualifierMaul',
        name: '石锤壮汉',
        slug: 'arena-q-maul',
        color: '#a9826c',
        tier: 'boss',
        designTier: 'high',
        attackStyle: 'stone-slam',
        attackType: 'axe',
        weaknesses: ['spear', 'ice', 'wind'],
        toughness: 3,
        rawIntents: [
          {
            name: '石锤重砸',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'high' }],
          },
          {
            name: '横锤防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierBladeCaptain',
      buildQualifier({
        id: 'arenaQualifierBladeCaptain',
        name: '双刀领队',
        slug: 'arena-q-blade-captain',
        color: '#a46f68',
        tier: 'boss',
        designTier: 'high',
        attackStyle: 'corridor-cleave',
        attackType: 'sword',
        weaknesses: ['spear', 'ice', 'wind'],
        toughness: 3,
        rawIntents: [
          {
            name: '双刀连斩',
            slots: [0, 1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '交叉格挡',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierHoundCaptain',
      buildQualifier({
        id: 'arenaQualifierHoundCaptain',
        name: '猎犬领队',
        slug: 'arena-q-hound-captain',
        color: '#8b9d72',
        tier: 'boss',
        designTier: 'high',
        attackStyle: 'claw-pounce',
        attackType: 'brawl',
        weaknesses: ['spear', 'fire', 'ice'],
        toughness: 3,
        rawIntents: [
          {
            name: '猎犬扑咬',
            slots: [1],
            effects: [{ type: 'damage', target: 'opponents', power: 'high' }],
          },
          {
            name: '伏低防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierVeteran',
      buildQualifier({
        id: 'arenaQualifierVeteran',
        name: '补甲老兵',
        slug: 'arena-q-veteran',
        color: '#8d8c9e',
        tier: 'boss',
        designTier: 'high',
        attackStyle: 'corridor-cleave',
        attackType: 'sword',
        weaknesses: ['axe', 'fire', 'lightning'],
        toughness: 3,
        rawIntents: [
          {
            name: '补甲剑击',
            slots: [0, 1],
            effects: [{ type: 'damage', target: 'opponents', power: 'medium' }],
          },
          {
            name: '举剑防守',
            slots: [1],
            effects: [{ type: 'shield', target: 'self', power: 'low' }],
          },
        ],
      }),
    ],
    [
      'arenaQualifierIronCoach',
      {
        id: 'arenaQualifierIronCoach',
        name: '海选擂主·铁臂教头',
        color: '#b58d63',
        portrait: 'arena-q-iron-coach',
        model: 'arena-q-iron-coach.glb',
        archiveSource: ARCHIVE_SOURCE,
        boss: true,
        overlord: true,
        standOnCard: true,
        nonVoxel: true,
        displayPlinth: false,
        archiveAnimationLabels: { Talon_Rend: '重棍下砸' },
        intents: [{ name: '行动待定', text: '行动文本待定。' }],
      },
    ],
  ]),
);

export { ARENA_QUALIFIER_ARCHIVE_DEFINITIONS };
