import { applyEnemyTaxonomy } from '../enemy-taxonomy.js';

const SILVER_CROWN_SYNDICATE_TITLE = '乌羽财团';

function makeSyndicateEnemy(config) {
  const enemy = {
    id: config.id,
    name: config.name,
    title: SILVER_CROWN_SYNDICATE_TITLE,
    portrait: config.slug,
    model: config.slug + '.glb',
    attackStyle: config.attackStyle,
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
  name: '银冠鬼拍主·白鸦公爵',
  category: 'other',
  title: SILVER_CROWN_SYNDICATE_TITLE,
  portrait: 'silver-crown-syndicate-archon',
  model: 'silver-crown-syndicate-archon.glb',
  color: '#eab308',
  description: '头戴镶金白羽双角礼帽与秘银鸦面，背悬黄金筹码轮盘，双持拍卖槌杖剑与三管转轮以太铳。',
  boss: true,
  overlord: true,
  standOnCard: true,
  intents: [{ name: '行动待定', text: '行动文本待定。' }],
};

export const SILVER_CROWN_SYNDICATE_ARCHIVE_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    [...SILVER_CROWN_SYNDICATE_ENEMIES, SILVER_CROWN_SYNDICATE_ARCHON].map((entry) => [
      entry.id,
      { ...entry, archiveSource: '银盾镇展览馆' },
    ]),
  ),
);
