import { compileEnemyDesign } from '../enemy-base-values.js';
import { applyEnemyTaxonomy } from '../enemy-taxonomy.js';

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

  return applyEnemyTaxonomy(definition);
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
        name: '木盾剑士',
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
        name: '双刃剑士',
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
        category: 'other',
        color: '#b58d63',
        portrait: 'arena-q-iron-coach',
        model: 'arena-q-iron-coach.glb',
        archiveSource: ARCHIVE_SOURCE,
        description:
          '大骑士竞技场海选擂台守关教头，常年稳坐两动节奏：先以正常速度试探攻防，每回合末必于速度1蓄力挥出重棍轰台。',
        boss: true,
        overlord: true,
        standOnCard: true,
        nonVoxel: true,
        displayPlinth: false,
        mp: 0,
        hp: 260,
        speed: 6,
        limit: 1,
        actions: 2,
        enragedActions: 2,
        finalPhaseActions: 3,
        overlordPhases: Object.freeze([0.68, 0.34]),
        breakLayersByPhase: Object.freeze([2, 2, 3]),
        phaseShields: Object.freeze([0, 18, 26]),
        artifactByPhase: Object.freeze([0, 1, 2]),
        buffs: {},
        tactic: { target: 'fixed' },
        attackStyle: 'stone-slam',
        attackType: 'brawl',
        phaseMode: 'threshold',
        phaseThreshold: 0.68,
        weaknesses: ['spear', 'fire', 'lightning', 'light'],
        toughness: 2,
        archiveAnimationLabels: {
          Normal_Attack: '重棍抢攻 / 非弱点截击',
          Special_Attack: '铁臂蓄势横扫',
          Special_Action: '稳桩架势 / 阶段气魄',
          Talon_Rend: '速度1蓄力重击',
          Charge_Up: '擂台沉腰蓄势',
          Break_Stagger: '擂台破防失衡',
        },
        ironCoachMechanic: Object.freeze({
          normalPoolByPhase: Object.freeze([
            Object.freeze({
              attacks: Object.freeze([
                Object.freeze({
                  name: '重棍直击',
                  text: '以标准速度猛击中位造成16点伤害，并施加1层虚弱。',
                  slot: 1,
                  slots: [1],
                  damageType: 'brawl',
                  clip: 'Normal_Attack',
                  effects: [
                    { type: 'damage', target: 'opponents', value: 16 },
                    { type: 'buff', buff: 'weak', value: 1, target: 'opponents' },
                  ],
                }),
                Object.freeze({
                  name: '铁臂扫台',
                  text: '横扫左、右位各造成11点伤害。',
                  slots: [0, 2],
                  damageType: 'brawl',
                  clip: 'Normal_Attack',
                  effects: [{ type: 'damage', target: 'opponents', value: 11 }],
                }),
              ]),
              defenses: Object.freeze([
                Object.freeze({
                  name: '稳桩守势',
                  text: '沉腰摆出守擂架势，自身获得18点护盾与1层铁皮。',
                  slot: 1,
                  slots: [1],
                  clip: 'Special_Action',
                  effects: [
                    { type: 'shield', target: 'self', value: 18 },
                    { type: 'buff', buff: 'iron', value: 1, target: 'self' },
                  ],
                }),
              ]),
            }),
            Object.freeze({
              attacks: Object.freeze([
                Object.freeze({
                  name: '碎盾横扫',
                  text: '横扫左、右位各造成14点伤害并施加1层易伤。',
                  slots: [0, 2],
                  damageType: 'brawl',
                  clip: 'Special_Attack',
                  enraged: true,
                  effects: [
                    { type: 'damage', target: 'opponents', value: 14 },
                    { type: 'buff', buff: 'vulnerable', value: 1, target: 'opponents' },
                  ],
                }),
                Object.freeze({
                  name: '压迫连打',
                  text: '沉棍重敲中位造成19点伤害并施加2层流血。',
                  slot: 1,
                  slots: [1],
                  damageType: 'brawl',
                  clip: 'Normal_Attack',
                  enraged: true,
                  effects: [
                    { type: 'damage', target: 'opponents', value: 19 },
                    { type: 'buff', buff: 'bleed', value: 2, target: 'opponents' },
                  ],
                }),
              ]),
              defenses: Object.freeze([
                Object.freeze({
                  name: '铁壁聚气',
                  text: '立棍固防，自身获得22点护盾并提升1层力量。',
                  slot: 1,
                  slots: [1],
                  clip: 'Special_Action',
                  enraged: true,
                  effects: [
                    { type: 'shield', target: 'self', value: 22 },
                    { type: 'buff', buff: 'strength', value: 1, target: 'self' },
                  ],
                }),
              ]),
            }),
            Object.freeze({
              attacks: Object.freeze([
                Object.freeze({
                  name: '撼地狂扫',
                  text: '狂扫全前场各造成14点伤害并施加1层易伤。',
                  slots: [0, 1, 2],
                  damageType: 'brawl',
                  clip: 'Special_Attack',
                  enraged: true,
                  effects: [
                    { type: 'damage', target: 'opponents', value: 14 },
                    { type: 'buff', buff: 'vulnerable', value: 1, target: 'opponents' },
                  ],
                }),
                Object.freeze({
                  name: '霸王铁肘',
                  text: '贴身撞击中位造成22点伤害并施加3层流血。',
                  slot: 1,
                  slots: [1],
                  damageType: 'brawl',
                  clip: 'Normal_Attack',
                  enraged: true,
                  effects: [
                    { type: 'damage', target: 'opponents', value: 22 },
                    { type: 'buff', buff: 'bleed', value: 3, target: 'opponents' },
                  ],
                }),
              ]),
              defenses: Object.freeze([
                Object.freeze({
                  name: '不屈护台势',
                  text: '铁臂交叠死守中门，自身获得26点护盾与2层铁皮。',
                  slot: 1,
                  slots: [1],
                  clip: 'Special_Action',
                  enraged: true,
                  effects: [
                    { type: 'shield', target: 'self', value: 26 },
                    { type: 'buff', buff: 'iron', value: 2, target: 'self' },
                  ],
                }),
              ]),
            }),
          ]),
          chargeSlamsByPhase: Object.freeze([
            Object.freeze({
              name: '速度1蓄力 · 重棍崩台',
              text: '固定速度1在回合末抡棍下砸中位造成24点伤害并施加1层易伤；破防可将其彻底打断。',
              slot: 1,
              slots: [1],
              damageType: 'brawl',
              clip: 'Talon_Rend',
              fixedSpeed: 1,
              isCoachChargeSlam: true,
              effects: [
                { type: 'damage', target: 'opponents', value: 24 },
                { type: 'buff', buff: 'vulnerable', value: 1, target: 'opponents' },
              ],
            }),
            Object.freeze({
              name: '速度1蓄力 · 震台崩拳',
              text: '固定速度1砸击左、右位各造成18点伤害并施加2层易伤；非弱点攻击会触发教头截击反击。',
              slots: [0, 2],
              damageType: 'brawl',
              clip: 'Talon_Rend',
              fixedSpeed: 1,
              isCoachChargeSlam: true,
              enraged: true,
              effects: [
                { type: 'damage', target: 'opponents', value: 18 },
                { type: 'buff', buff: 'vulnerable', value: 2, target: 'opponents' },
              ],
            }),
            Object.freeze({
              name: '速度1蓄力 · 终结轰台',
              text: '固定速度1全力轰击全前场各造成19点伤害并施加2层虚弱与2层易伤。',
              slots: [0, 1, 2],
              damageType: 'brawl',
              clip: 'Talon_Rend',
              fixedSpeed: 1,
              isCoachChargeSlam: true,
              enraged: true,
              effects: [
                { type: 'damage', target: 'opponents', value: 19 },
                { type: 'buff', buff: 'weak', value: 2, target: 'opponents' },
                { type: 'buff', buff: 'vulnerable', value: 2, target: 'opponents' },
              ],
            }),
          ]),
          counterDamageByPhase: Object.freeze([0, 10, 13]),
          counterClip: 'Normal_Attack',
          counterDamageType: 'brawl',
          counterName: '教头截击',
        }),
        intents: [
          {
            name: '重棍直击',
            text: '猛击中位造成16点伤害，并施加1层虚弱。',
            slots: [1],
            damageType: 'brawl',
            clip: 'Normal_Attack',
            effects: [
              { type: 'damage', target: 'opponents', value: 16 },
              { type: 'buff', buff: 'weak', value: 1, target: 'opponents' },
            ],
          },
          {
            name: '稳桩守势',
            text: '自身获得18点护盾与1层铁皮。',
            slots: [1],
            clip: 'Special_Action',
            effects: [
              { type: 'shield', target: 'self', value: 18 },
              { type: 'buff', buff: 'iron', value: 1, target: 'self' },
            ],
          },
        ],
        enragedIntents: [
          {
            name: '碎盾横扫',
            text: '横扫左、右位各造成14点伤害并施加1层易伤。',
            slots: [0, 2],
            damageType: 'brawl',
            clip: 'Special_Attack',
            enraged: true,
            effects: [
              { type: 'damage', target: 'opponents', value: 14 },
              { type: 'buff', buff: 'vulnerable', value: 1, target: 'opponents' },
            ],
          },
          {
            name: '铁壁聚气',
            text: '自身获得22点护盾并提升1层力量。',
            slots: [1],
            clip: 'Special_Action',
            enraged: true,
            effects: [
              { type: 'shield', target: 'self', value: 22 },
              { type: 'buff', buff: 'strength', value: 1, target: 'self' },
            ],
          },
        ],
        finalPhaseIntents: [
          {
            name: '撼地狂扫',
            text: '狂扫全前场各造成14点伤害并施加1层易伤。',
            slots: [0, 1, 2],
            damageType: 'brawl',
            clip: 'Special_Attack',
            enraged: true,
            effects: [
              { type: 'damage', target: 'opponents', value: 14 },
              { type: 'buff', buff: 'vulnerable', value: 1, target: 'opponents' },
            ],
          },
          {
            name: '不屈护台势',
            text: '自身获得26点护盾与2层铁皮。',
            slots: [1],
            clip: 'Special_Action',
            enraged: true,
            effects: [
              { type: 'shield', target: 'self', value: 26 },
              { type: 'buff', buff: 'iron', value: 2, target: 'self' },
            ],
          },
        ],
      },
    ],
  ]),
);

const ARENA_QUALIFIER_LIST = Object.values(ARENA_QUALIFIER_ARCHIVE_DEFINITIONS);
export const ARENA_QUALIFIER_ENEMIES = Object.freeze(
  ARENA_QUALIFIER_LIST.filter((entry) => !entry.boss),
);
export const ARENA_QUALIFIER_BOSSES = Object.freeze(
  ARENA_QUALIFIER_LIST.filter((entry) => entry.boss),
);

export { ARENA_QUALIFIER_ARCHIVE_DEFINITIONS };
