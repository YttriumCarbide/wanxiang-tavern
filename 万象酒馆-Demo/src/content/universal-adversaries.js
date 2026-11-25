import { applyEnemyTaxonomy } from '../enemy-taxonomy.js';

/** Unaffiliated creatures and constructs; their origin is deliberately left to each world. */
function creature(id, name, color, hp, speed, attackStyle, tactic, description, intents) {
  return applyEnemyTaxonomy({
    id,
    name,
    title: '通用 / ' + tactic.role,
    description,
    color,
    portrait: id.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()),
    model: id.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()) + '.glb',
    hp,
    mp: 0,
    speed,
    attackStyle,
    limit: 1,
    buffs: {},
    tactic,
    intents,
  });
}

const damage = (value) => ({ type: 'damage', value });
const buff = (key, value, target = 'opponents') => ({ type: 'buff', buff: key, value, target });
const move = (name, text, effects, extra = {}) => ({ name, text, slot: 1, effects, ...extra });

export const UNIVERSAL_ENEMIES = [
  creature(
    'greyProwler',
    '灰脊猎犬',
    '#a99883',
    66,
    4,
    'patrol-pounce',
    { role: '负伤追猎', target: 'wounded' },
    '以气味追踪伤者的灰毛猎兽。没有所属与固定产地，常与其他猎食者结伴。',
    [
      move('追伤扑咬', '锁定回合开始时hp最低的前场位置：16伤害、4流血。', [
        damage(16),
        buff('bleed', 4),
      ]),
      move('低伏撕咬', '锁定回合开始时hp最低的前场位置：18伤害。', [damage(18)]),
    ],
  ),
  creature(
    'facetSkitter',
    '棱壳甲虫',
    '#83b6b4',
    76,
    2,
    'beetle-burrow',
    { role: '低血防御', target: 'exposed', mode: 'survivor' },
    '背甲由交错晶质薄片构成的游虫。受重伤后会收紧甲壳，短暂修复裂口。',
    [
      move('棱角切割', '攻击回合开始时护盾最少的前场位置：16伤害、4流血。', [
        damage(16),
        buff('bleed', 4),
      ]),
      move('闭壳修复', 'hp不高于45%且没有护盾时：自身获得15护盾、4再生。', [
        { type: 'shield', value: 15, target: 'self' },
        buff('regen', 4, 'self'),
      ]),
    ],
  ),
  {
    ...creature(
      'hollowSentry',
      '空壳魔像',
      '#83909c',
      98,
      2,
      'warden-fist',
      { role: '护盾压制', target: 'shielded', mode: 'breaker' },
      '由坚硬外壳与微光核心驱动的无主守卫。优先敲击防护最厚的位置，1铁皮按4护盾比较。',
      [
        move('重拳校准', '锁定回合开始时护盾与铁皮防护最高的位置：17伤害。', [damage(17)]),
        move('碎盾重锤', '目标防护达到6时改用重锤：26伤害；1铁皮按4护盾比较。', [damage(26)]),
      ],
    ),
    elite: true,
    title: '精英 / 空壳魔像',
  },
  creature(
    'veilMender',
    '蒙面祭司',
    '#b8b093',
    64,
    3,
    'seeker-pulse',
    { role: '敌方治疗', target: 'exposed', mode: 'medic' },
    '提着药匣、以布遮面的流浪治疗者。先照顾重伤的同行者，无人受伤时才出手。',
    [
      move('微光投射', '无人重伤时攻击护盾最少的位置：12伤害、2虚弱。', [
        damage(12),
        buff('weak', 2),
      ]),
      move('紧急包扎', '每隔一回合可为hp比例不高于60%的敌方单位回复18hp。', [
        { type: 'heal', value: 18, target: 'lowestAlly' },
      ]),
    ],
  ),
  creature(
    'dustHexer',
    '尘符术士',
    '#a38cac',
    72,
    3,
    'specter-wail',
    { role: '强者干扰', target: 'empowered' },
    '将尘埃和符片缠在衣上的无名施术者。会辨认对手身上的强化，优先施加咒缚。',
    [
      move('钝化符缚', '锁定回合开始时强化最多的位置：2虚弱、2易伤。', [
        buff('weak', 2),
        buff('vulnerable', 2),
      ]),
      move('符尘刺击', '锁定回合开始时强化最多的位置：15伤害。', [damage(15)]),
    ],
  ),
  creature(
    'greyStinger',
    '灰翼巨蜂',
    '#c0b279',
    58,
    5,
    'storm-dive',
    { role: '持续施毒', target: 'unpoisoned' },
    '薄翼、细针与环状腹甲组成的群居飞虫。会寻找尚未中毒的目标，避免浪费毒液。',
    [
      move('寻隙毒针', '优先锁定回合开始时未中毒的位置：11伤害、5中毒。', [
        damage(11),
        buff('poison', 5),
      ]),
      move('振翼突刺', '优先锁定回合开始时未中毒的位置：16伤害。', [damage(16)]),
    ],
  ),
  creature(
    'trailArbalist',
    '逐迹弓手',
    '#9c977f',
    72,
    2,
    'ballista-bolt',
    { role: '蓄力狙击', target: 'charged', mode: 'artillery' },
    '携带折叠弩与旧披肩的沉默猎手。先拉弦蓄力，再向sp储量最多的位置发射重矢。',
    [
      move('稳固拉弦', '奇数回合架弩：自身获得10护盾、1力量。', [
        { type: 'shield', value: 10, target: 'self' },
        buff('strength', 1, 'self'),
      ]),
      move('穿隙重矢', '偶数回合射击回合开始时sp最多的位置：25伤害、2易伤。', [
        damage(25),
        buff('vulnerable', 2),
      ]),
    ],
  ),
  creature(
    'shellGatherer',
    '缀壳拾荒者',
    '#ac9472',
    82,
    2,
    'stone-slam',
    { role: '同伴护持', target: 'exposed', mode: 'protector' },
    '背负层层旧壳的拾荒生物。会把碎壳搭在最虚弱的同伴身前，独处时用前肢自卫。',
    [
      move('壳片砸落', '攻击回合开始时护盾最少的位置：17伤害。', [damage(17)]),
      move('为伤者覆甲', '每隔一回合可为受伤且护盾不足4的敌方同伴提供15护盾。', [
        { type: 'shield', value: 15, target: 'lowestAlly' },
      ]),
    ],
  ),
  creature(
    'riftMote',
    '游隙魔灵',
    '#99abc9',
    62,
    4,
    'tide-ribbon',
    { role: '扩散骚扰', target: 'empowered' },
    '碎片围绕一团微光漂浮的无定形生命。可在不同环境中凝聚，对能量变化尤为敏感。',
    [
      move('碎光牵引', '锁定回合开始时强化最多的位置：14伤害、1易伤。', [
        damage(14),
        buff('vulnerable', 1),
      ]),
      move('离散光雨', '隔回合散开碎片，攻击三个前场位置，各10伤害。', [damage(10)], {
        slots: [0, 1, 2],
      }),
    ],
  ),
  {
    ...creature(
      'oathlessDuelist',
      '无誓剑士',
      '#9d9aaf',
      95,
      4,
      'shadow-strike',
      { role: '防守反击', target: 'exposed', mode: 'duelist' },
      '没有徽记与誓言的蒙甲旅人。先稳住防御，再寻找护盾薄弱的位置连续施压。',
      [
        move('斜刃守备', '每三个回合先守备一次：自身获得14护盾。', [
          { type: 'shield', value: 14, target: 'self' },
        ]),
        move('试隙斩', '其余回合锁定护盾最少的位置：20伤害、2虚弱。', [
          damage(20),
          buff('weak', 2),
        ]),
      ],
    ),
    elite: true,
    title: '精英 / 无誓剑士',
  },
];

function boss(entry, enragedIntents) {
  return {
    ...entry,
    boss: true,
    actions: 2,
    enragedActions: 3,
    splitActions: true,
    phaseMode: 'threshold',
    phaseThreshold: 0.5,
    enragedIntents,
  };
}

export const UNIVERSAL_BOSSES = [
  boss(
    creature(
      'manyShellBeast',
      '多壳巨兽',
      '#a29983',
      295,
      2,
      'beast-roar',
      { role: '范围压制 / 负伤追击', target: 'wounded', mode: 'beast' },
      '披着多层风化甲壳的巨兽，没有固定的元素属性。多人挡路时横扫，落单时专注追击。',
      [
        move('裂壳横扫', '有至少两名前场角色时横扫三个位置，各11伤害。', [damage(11)], {
          slots: [0, 1, 2],
        }),
        move('独猎重噬', '前场只剩一人时，锁定该位置：20伤害、3流血。', [
          damage(20),
          buff('bleed', 3),
        ]),
      ],
    ),
    [
      move('狂裂横扫', '有至少两名前场角色时横扫三个位置，各13伤害。', [damage(13)], {
        slots: [0, 1, 2],
      }),
      move('裂牙追猎', '前场只剩一人时，锁定该位置：22伤害、4流血。', [
        damage(22),
        buff('bleed', 4),
      ]),
    ],
  ),
  boss(
    creature(
      'unmooredJudge',
      '无界裁定者',
      '#9ca5b9',
      275,
      4,
      'colossus-beam',
      { role: '强化判读 / 破盾', target: 'empowered', mode: 'judge' },
      '悬浮面甲、环形肩铠与平衡臂组成的无主构装体。将最显著的防护或强化判定为威胁。',
      [
        move('强者裁定', '锁定回合开始时强化最多的位置：14伤害、2虚弱。', [
          damage(14),
          buff('weak', 2),
        ]),
        move('壁垒裁定', '有人防护达到8时，锁定防护最高的位置：22伤害；1铁皮按4护盾比较。', [
          damage(22),
        ]),
      ],
    ),
    [
      move(
        '双向裁定',
        '锁定强化最多的位置与相邻一格，各13伤害、2虚弱。',
        [damage(13), buff('weak', 2)],
        { adjacent: true },
      ),
      move('壁垒终裁', '有人防护达到8时，锁定防护最高的位置：25伤害；1铁皮按4护盾比较。', [
        damage(25),
      ]),
    ],
  ),
  boss(
    creature(
      'returningCore',
      '归环之核',
      '#81b7ae',
      268,
      2,
      'astral-cascade',
      { role: '同伴修复 / 周期爆发', target: 'charged', mode: 'core' },
      '围绕悬空晶核缓慢自转的三组残环。会修复受损同行者，蓄能后释放明显可预见的光潮。',
      [
        move('聚环蓄能', '每三个回合蓄能一次：自身获得16护盾。', [
          { type: 'shield', value: 16, target: 'self' },
        ]),
        move('光潮扩散', '蓄能后攻击三个前场位置，各10伤害。', [damage(10)], { slots: [0, 1, 2] }),
        move('返光修补', '每三个回合最多修复一次：敌方hp比例最低且不足50%的单位回复24hp。', [
          { type: 'heal', value: 24, target: 'lowestAlly' },
        ]),
      ],
    ),
    [
      move('过载聚环', '每三个回合蓄能一次：自身获得20护盾。', [
        { type: 'shield', value: 20, target: 'self' },
      ]),
      move(
        '逆环光潮',
        '蓄能后攻击三个前场位置，各12伤害、1易伤。',
        [damage(12), buff('vulnerable', 1)],
        { slots: [0, 1, 2] },
      ),
      move('返光修补', '每三个回合最多修复一次：敌方hp比例最低且不足50%的单位回复24hp。', [
        { type: 'heal', value: 24, target: 'lowestAlly' },
      ]),
    ],
  ),
];
