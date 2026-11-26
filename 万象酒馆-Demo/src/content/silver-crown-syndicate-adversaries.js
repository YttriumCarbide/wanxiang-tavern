import { applyEnemyTaxonomy } from '../enemy-taxonomy.js';

const SILVER_CROWN_SYNDICATE_TITLE = '乌羽秘会';
const SILVER_CROWN_ARCHIVE_SOURCE = '银冠城-白鸦展览馆';

function makeSyndicateEnemy(config) {
  const enemy = {
    id: config.id,
    name: config.name,
    title: SILVER_CROWN_SYNDICATE_TITLE,
    archiveSource: SILVER_CROWN_ARCHIVE_SOURCE,
    portrait: config.slug,
    model: config.slug + '.glb',
    attackStyle: config.attackStyle,
    attackType: config.attackType,
    weaknesses: config.weaknesses,
    toughness: config.toughness,
    color: config.color,
    hp: config.hp,
    speed: config.speed,
    description: config.description,
    mp: 0,
    buffs: {},
    limit: 1,
    tactic: { target: 'fixed' },
    intents: config.intents,
  };
  if (config.elite) {
    enemy.elite = true;
  }
  return applyEnemyTaxonomy(enemy);
}

export const SILVER_CROWN_SYNDICATE_ENEMIES = [
  makeSyndicateEnemy({
    id: 'syndicateVelvetBlade',
    slug: 'syndicate-velvet-blade',
    name: '银渠剑士',
    attackStyle: 'shadow-strike',
    attackType: 'sword',
    weaknesses: ['spear', 'fire', 'light'],
    toughness: 2,
    color: '#4f72a8',
    hp: 66,
    speed: 4,
    description:
      '孔雀蓝丝绒短燕尾服、银边白鸦短披肩和镂空秘银鸦喙假面，双手反握带翡翠毒槽的弯钩刺剑。',
    intents: [
      {
        name: '翡翠双钩',
        text: '对中位连续攻击2次，每次造成8点伤害，随后施加3层中毒。',
        slot: 1,
        effects: [
          { type: 'damage', value: 8 },
          { type: 'damage', value: 8 },
          { type: 'buff', buff: 'poison', value: 3, target: 'opponents' },
        ],
      },
      {
        name: '交刃割袭',
        text: '对左、右位各造成10点伤害，并各施加2层流血。',
        slots: [0, 2],
        effects: [
          { type: 'damage', value: 10 },
          { type: 'buff', buff: 'bleed', value: 2, target: 'opponents' },
        ],
      },
    ],
  }),
  makeSyndicateEnemy({
    id: 'syndicateRepeatingArbalest',
    slug: 'syndicate-repeating-arbalest',
    name: '乌羽弓手',
    attackStyle: 'ballista-bolt',
    attackType: 'special-weapon',
    weaknesses: ['sword', 'wind', 'lightning'],
    toughness: 2,
    color: '#be4b86',
    hp: 62,
    speed: 4,
    description: '深紫红高领风衣与紫晶单眼瞄准镜，左臂架着带旋转弹鼓的黄铜连弩。',
    intents: [
      {
        name: '弹鼓三连射',
        text: '对中位连续射击3次，每次造成5点伤害。',
        slot: 1,
        effects: [
          { type: 'damage', value: 5 },
          { type: 'damage', value: 5 },
          { type: 'damage', value: 5 },
        ],
      },
      {
        name: '金羽破甲矢',
        text: '对左、右位各造成11点伤害，并各施加1层易伤。',
        slots: [0, 2],
        effects: [
          { type: 'damage', value: 11 },
          { type: 'buff', buff: 'vulnerable', value: 1, target: 'opponents' },
        ],
      },
    ],
  }),
  makeSyndicateEnemy({
    id: 'syndicateMintChemist',
    slug: 'syndicate-mint-chemist',
    name: '伪币熔银毒师',
    attackStyle: 'ooze-splash',
    attackType: 'special-magic',
    weaknesses: ['fire', 'ice', 'sword'],
    toughness: 1,
    color: '#2ca687',
    hp: 67,
    speed: 3,
    description: '身穿防酸白皮围裙与蓝绒长袍，背负黄铜双联蒸馏釜，手持熔币铁钳和王水玻璃球。',
    intents: [
      {
        name: '王水蚀甲球',
        text: '对左、中位各造成11点伤害，并各施加2层易伤。',
        slots: [0, 1],
        effects: [
          { type: 'damage', value: 11 },
          { type: 'buff', buff: 'vulnerable', value: 2, target: 'opponents' },
        ],
      },
      {
        name: '双釜毒雾',
        text: '对全前场各造成6点伤害，并各施加3层中毒。',
        slots: [0, 1, 2],
        effects: [
          { type: 'damage', value: 6 },
          { type: 'buff', buff: 'poison', value: 3, target: 'opponents' },
        ],
      },
    ],
  }),
  makeSyndicateEnemy({
    id: 'syndicateVaultEnforcer',
    slug: 'syndicate-vault-enforcer',
    name: '金库银铠重卫',
    attackStyle: 'gate-crush',
    attackType: 'brawl',
    weaknesses: ['axe', 'lightning', 'fire'],
    toughness: 2,
    color: '#aabbd1',
    hp: 86,
    speed: 2,
    description: '披挂带银币纹章的秘银重甲与紫金绶带，左执密码圆门盾，右持八棱铸银战锤。',
    intents: [
      {
        name: '铸银破甲锤',
        text: '对中位造成20点伤害，并施加2层易伤。',
        slot: 1,
        effects: [
          { type: 'damage', value: 20 },
          { type: 'buff', buff: 'vulnerable', value: 2, target: 'opponents' },
        ],
      },
      {
        name: '金库门盾推',
        text: '对中、右位各造成11点伤害，自身获得16点护盾。',
        slots: [1, 2],
        effects: [
          { type: 'damage', value: 11 },
          { type: 'shield', value: 16, target: 'self' },
        ],
      },
    ],
  }),
  makeSyndicateEnemy({
    id: 'syndicateBloodCroupier',
    slug: 'syndicate-blood-croupier',
    name: '血筹码典仪官',
    attackStyle: 'shadow-strike',
    attackType: 'sword',
    weaknesses: ['light', 'spear', 'fire', 'wind'],
    toughness: 3,
    color: '#d68b66',
    hp: 128,
    speed: 3,
    description: '头戴鎏金礼帽，手持镶紫钻的鉴宝手杖剑，周身环绕黄金筹码与塔罗刀牌。',
    elite: true,
    intents: [
      {
        name: '血筹码飞轮',
        text: '对全前场各造成12点伤害，并各施加3层流血。',
        slots: [0, 1, 2],
        effects: [
          { type: 'damage', value: 12 },
          { type: 'buff', buff: 'bleed', value: 3, target: 'opponents' },
        ],
      },
      {
        name: '紫钻杖剑',
        text: '对中位造成23点伤害，并施加2层虚弱。',
        slot: 1,
        effects: [
          { type: 'damage', value: 23 },
          { type: 'buff', buff: 'weak', value: 2, target: 'opponents' },
        ],
      },
    ],
  }),
  makeSyndicateEnemy({
    id: 'syndicateGildedAutomaton',
    slug: 'syndicate-gilded-automaton',
    name: '鎏金鸦首护法机兵',
    attackStyle: 'warden-fist',
    attackType: 'spear',
    weaknesses: ['lightning', 'axe', 'brawl', 'fire'],
    toughness: 3,
    color: '#d6ad54',
    hp: 145,
    speed: 2,
    description: '白瓷与鎏金鸦首面甲下是翡翠发条炉心，右臂装有压币钻枪，左臂展开为鸦翼刀盾。',
    elite: true,
    intents: [
      {
        name: '螺旋压币钻',
        text: '对中位连续攻击2次，每次造成12点伤害，随后施加2层易伤。',
        slot: 1,
        effects: [
          { type: 'damage', value: 12 },
          { type: 'damage', value: 12 },
          { type: 'buff', buff: 'vulnerable', value: 2, target: 'opponents' },
        ],
      },
      {
        name: '秘银鸦翼盾',
        text: '对左、右位各造成14点伤害，自身获得20点护盾。',
        slots: [0, 2],
        effects: [
          { type: 'damage', value: 14 },
          { type: 'shield', value: 20, target: 'self' },
        ],
      },
    ],
  }),
];

export const SILVER_CROWN_SYNDICATE_ARCHON = {
  id: 'silverCrownSyndicateArchon',
  name: '秘藏馆主·白鸦',
  category: 'other',
  title: SILVER_CROWN_SYNDICATE_TITLE,
  archiveSource: SILVER_CROWN_ARCHIVE_SOURCE,
  portrait: 'silver-crown-syndicate-archon',
  model: 'silver-crown-syndicate-archon.glb',
  color: '#eab308',
  description:
    '银冠城奇珍展览馆的神秘馆主，头戴镶金白羽双角礼帽与秘银鸦面，背悬鎏金藏品轮盘，双手持鉴宝手杖剑与三管转轮以太铳。',
  boss: true,
  overlord: true,
  standOnCard: true,
  mp: 0,
  hp: 250,
  speed: 6,
  limit: 1,
  actions: 2,
  enragedActions: 3,
  finalPhaseActions: 4,
  overlordPhases: Object.freeze([0.68, 0.34]),
  breakLayersByPhase: Object.freeze([4, 6, 6]),
  phaseShields: Object.freeze([0, 20, 30]),
  artifactByPhase: Object.freeze([0, 1, 2]),
  buffs: {},
  tactic: { target: 'fixed' },
  attackStyle: 'shadow-strike',
  attackType: 'sword',
  phaseMode: 'threshold',
  phaseThreshold: 0.68,
  weaknesses: ['light', 'brawl', 'lightning', 'fire'],
  toughness: 4,
  archiveAnimationLabels: {
    Normal_Attack: '鉴宝杖剑连斩',
    Special_Attack: '三管以太齐射 / 赝品拒收点射',
    Special_Action: '展品品鉴 / 阶段加护',
    Talon_Rend: '永久封柜 · 录入馆藏',
    Charge_Up: '馆藏落印 · 展柜蓄势',
    Break_Stagger: '展柜碎裂失衡',
  },
  collectorMechanic: Object.freeze({
    rejectMultiplier: 0.6,
    appraiseMultiplier: 1.35,
    counterDamageByPhase: Object.freeze([5, 6, 7]),
    counterClip: 'Special_Attack',
    counterDamageType: 'special-weapon',
    counterName: '赝品拒收 · 以太点射',
  }),
  chargeMechanic: Object.freeze({
    cadenceRounds: 2,
    firstChargeRound: 1,
    chargeMove: Object.freeze({
      id: 'collector-archive-charge',
      name: '馆藏落印 · 展柜蓄势',
      text: '敲响鉴宝槌为展示台落印，自身获得12护盾；下回合露出高韧性馆藏破绽并准备【永久封柜 · 录入馆藏】。未收录的新属性打击可造成+35%伤害与双倍削韧（同属性每回合仅限1次破防）。',
      slot: 1,
      slots: [1],
      selfShield: 12,
      effects: [],
      clip: 'Charge_Up',
      isCharge: true,
    }),
    releaseMovesByPhase: Object.freeze([
      Object.freeze({
        name: '永久封柜 · 录入馆藏',
        text: '挥动金槌十字封存全前场，对所有前场各造成10点伤害、施加1层易伤并获得12点护盾。',
        slots: [0, 1, 2],
        damageType: 'special-magic',
        clip: 'Talon_Rend',
        isChargedRelease: true,
        selfShield: 12,
        effects: [
          { type: 'damage', target: 'opponents', value: 10 },
          { type: 'buff', buff: 'vulnerable', value: 1, target: 'opponents' },
        ],
      }),
      Object.freeze({
        name: '永久封柜 · 鎏金藏品',
        text: '天平失衡落下镇馆封印，全前场各受12点伤害、施加2层易伤，自身获得15点护盾。',
        slots: [0, 1, 2],
        enraged: true,
        damageType: 'special-magic',
        clip: 'Talon_Rend',
        isChargedRelease: true,
        selfShield: 15,
        effects: [
          { type: 'damage', target: 'opponents', value: 12 },
          { type: 'buff', buff: 'vulnerable', value: 2, target: 'opponents' },
        ],
      }),
      Object.freeze({
        name: '永久封柜 · 镇馆孤品',
        text: '倾泻全部展柜以太光束封锁全前场，各造成13点伤害、施加2层易伤与1层虚弱并获18点护盾。',
        slots: [0, 1, 2],
        enraged: true,
        damageType: 'special-magic',
        clip: 'Talon_Rend',
        isChargedRelease: true,
        selfShield: 18,
        effects: [
          { type: 'damage', target: 'opponents', value: 13 },
          { type: 'buff', buff: 'vulnerable', value: 2, target: 'opponents' },
          { type: 'buff', buff: 'weak', value: 1, target: 'opponents' },
        ],
      }),
    ]),
  }),
  intents: [
    {
      name: '三管齐射 · 广域压制',
      text: '高速扣动三管转轮以太铳横扫全前场，各造成5点伤害并施加1层易伤。',
      slots: [0, 1, 2],
      damageType: 'special-weapon',
      clip: 'Special_Attack',
      effects: [
        { type: 'damage', target: 'opponents', value: 5 },
        { type: 'buff', buff: 'vulnerable', value: 1, target: 'opponents' },
      ],
    },
    {
      name: '鉴宝杖剑 · 双弧斩',
      text: '持杖剑疾掠左、右位各造成7点伤害并施加2层流血。',
      slots: [0, 2],
      damageType: 'sword',
      clip: 'Normal_Attack',
      effects: [
        { type: 'damage', target: 'opponents', value: 7 },
        { type: 'buff', buff: 'bleed', value: 2, target: 'opponents' },
      ],
    },
    {
      name: '防腐雾幕 · 展示框定',
      text: '喷洒凝滞封存雾笼罩全前场各造成4点伤害并施加1层虚弱，自身获得10点护盾。',
      slots: [0, 1, 2],
      damageType: 'dark',
      clip: 'Special_Action',
      selfShield: 10,
      effects: [
        { type: 'damage', target: 'opponents', value: 4 },
        { type: 'buff', buff: 'weak', value: 1, target: 'opponents' },
      ],
    },
  ],
  enragedIntents: [
    {
      name: '三色以太齐射',
      text: '全前场承受三色交织弹幕各6点伤害，附加1层易伤与2层流血。',
      slots: [0, 1, 2],
      damageType: 'special-weapon',
      clip: 'Special_Attack',
      enraged: true,
      effects: [
        { type: 'damage', target: 'opponents', value: 6 },
        { type: 'buff', buff: 'vulnerable', value: 1, target: 'opponents' },
        { type: 'buff', buff: 'bleed', value: 2, target: 'opponents' },
      ],
    },
    {
      name: '馆藏编号斩',
      text: '斜斩中、右位各造成8点伤害并施加2层流血。',
      slots: [1, 2],
      damageType: 'sword',
      clip: 'Normal_Attack',
      enraged: true,
      effects: [
        { type: 'damage', target: 'opponents', value: 8 },
        { type: 'buff', buff: 'bleed', value: 2, target: 'opponents' },
      ],
    },
    {
      name: '镀金天平失衡',
      text: '雷弧顺展台倾泻全前场各5点伤害并施加1层虚弱，自身获得12点护盾。',
      slots: [0, 1, 2],
      damageType: 'lightning',
      clip: 'Special_Action',
      selfShield: 12,
      enraged: true,
      effects: [
        { type: 'damage', target: 'opponents', value: 5 },
        { type: 'buff', buff: 'weak', value: 1, target: 'opponents' },
      ],
    },
  ],
  finalPhaseIntents: [
    {
      name: '全馆展品齐鸣',
      text: '展柜共鸣轰击全前场各6点伤害，附加2层易伤与2层流血。',
      slots: [0, 1, 2],
      damageType: 'special-weapon',
      clip: 'Special_Attack',
      enraged: true,
      effects: [
        { type: 'damage', target: 'opponents', value: 6 },
        { type: 'buff', buff: 'vulnerable', value: 2, target: 'opponents' },
        { type: 'buff', buff: 'bleed', value: 2, target: 'opponents' },
      ],
    },
    {
      name: '白鸦裁定十字斩',
      text: '杖剑与以太铳交错贯穿左、右位各9点伤害并附加3层流血。',
      slots: [0, 2],
      damageType: 'sword',
      clip: 'Normal_Attack',
      enraged: true,
      effects: [
        { type: 'damage', target: 'opponents', value: 9 },
        { type: 'buff', buff: 'bleed', value: 3, target: 'opponents' },
      ],
    },
    {
      name: '永恒防腐密室',
      text: '封存领域席卷全前场各5点伤害并施加2层虚弱，自身获得14点护盾。',
      slots: [0, 1, 2],
      damageType: 'dark',
      clip: 'Special_Action',
      selfShield: 14,
      enraged: true,
      effects: [
        { type: 'damage', target: 'opponents', value: 5 },
        { type: 'buff', buff: 'weak', value: 2, target: 'opponents' },
      ],
    },
  ],
};

export const SILVER_CROWN_SYNDICATE_BOSSES = Object.freeze([SILVER_CROWN_SYNDICATE_ARCHON]);

export const SILVER_CROWN_SYNDICATE_ARCHIVE_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    [...SILVER_CROWN_SYNDICATE_ENEMIES, SILVER_CROWN_SYNDICATE_ARCHON].map((entry) => [
      entry.id,
      entry,
    ]),
  ),
);
