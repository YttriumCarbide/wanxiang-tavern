/** Unaffiliated creatures and constructs; their origin is deliberately left to each world. */
function creature(id, name, color, hp, speed, attackStyle, tactic, description, intents) {
  return {
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
  };
}

const damage = (value) => ({ type: 'damage', value });
const buff = (key, value, target = 'opponents') => ({ type: 'buff', buff: key, value, target });
const move = (name, text, effects, extra = {}) => ({ name, text, slot: 1, effects, ...extra });

export const UNIVERSAL_ENEMIES = [
  creature(
    'greyProwler',
    '灰脊猎犬',
    '#a99883',
    43,
    4,
    'patrol-pounce',
    { role: '负伤追猎', target: 'wounded' },
    '以气味追踪伤者的灰毛猎兽。没有所属与固定产地，常与其他猎食者结伴。',
    [
      move('追伤扑咬', '锁定回合开始时hp最低的前场位置：11伤害、3流血。', [
        damage(11),
        buff('bleed', 3),
      ]),
      move('低伏撕咬', '锁定回合开始时hp最低的前场位置：13伤害。', [damage(13)]),
    ],
  ),
  creature(
    'facetSkitter',
    '棱壳游虫',
    '#83b6b4',
    50,
    2,
    'beetle-burrow',
    { role: '低血防御', target: 'exposed', mode: 'survivor' },
    '背甲由交错晶质薄片构成的游虫。受重伤后会收紧甲壳，短暂修复裂口。',
    [
      move('棱角切割', '攻击回合开始时护盾最少的前场位置：11伤害、3流血。', [
        damage(11),
        buff('bleed', 3),
      ]),
      move('闭壳修复', 'hp不高于45%且没有护盾时：自身获得10护盾、3再生。', [
        { type: 'shield', value: 10, target: 'self' },
        buff('regen', 3, 'self'),
      ]),
    ],
  ),
  creature(
    'hollowSentry',
    '空壳哨兵',
    '#83909c',
    62,
    2,
    'warden-fist',
    { role: '护盾压制', target: 'shielded', mode: 'breaker' },
    '由坚硬外壳与微光核心驱动的无主守卫。优先敲击防护最厚的位置，1铁皮按4护盾比较。',
    [
      move('重拳校准', '锁定回合开始时护盾与铁皮防护最高的位置：12伤害。', [damage(12)]),
      move('碎盾重锤', '目标防护达到6时改用重锤：19伤害；1铁皮按4护盾比较。', [damage(19)]),
    ],
  ),
  creature(
    'veilMender',
    '蒙面疗愈者',
    '#b8b093',
    41,
    3,
    'seeker-pulse',
    { role: '敌方治疗', target: 'exposed', mode: 'medic' },
    '提着药匣、以布遮面的流浪治疗者。先照顾重伤的同行者，无人受伤时才出手。',
    [
      move('微光投射', '无人重伤时攻击护盾最少的位置：8伤害、1虚弱。', [
        damage(8),
        buff('weak', 1),
      ]),
      move('紧急包扎', '每隔一回合可为hp比例不高于60%的敌方单位回复12hp。', [
        { type: 'heal', value: 12, target: 'lowestAlly' },
      ]),
    ],
  ),
  creature(
    'dustHexer',
    '尘符术士',
    '#a38cac',
    46,
    3,
    'specter-wail',
    { role: '强者干扰', target: 'empowered' },
    '将尘埃和符片缠在衣上的无名施术者。会辨认对手身上的强化，优先施加咒缚。',
    [
      move('钝化符缚', '锁定回合开始时强化最多的位置：2虚弱、2易伤。', [
        buff('weak', 2),
        buff('vulnerable', 2),
      ]),
      move('符尘刺击', '锁定回合开始时强化最多的位置：10伤害。', [damage(10)]),
    ],
  ),
  creature(
    'greyStinger',
    '灰翼针蜂',
    '#c0b279',
    36,
    5,
    'storm-dive',
    { role: '持续施毒', target: 'unpoisoned' },
    '薄翼、细针与环状腹甲组成的群居飞虫。会寻找尚未中毒的目标，避免浪费毒液。',
    [
      move('寻隙毒针', '优先锁定回合开始时未中毒的位置：7伤害、4中毒。', [
        damage(7),
        buff('poison', 4),
      ]),
      move('振翼突刺', '优先锁定回合开始时未中毒的位置：11伤害。', [damage(11)]),
    ],
  ),
  creature(
    'trailArbalist',
    '逐迹弩手',
    '#9c977f',
    46,
    2,
    'ballista-bolt',
    { role: '蓄力狙击', target: 'charged', mode: 'artillery' },
    '携带折叠弩与旧披肩的沉默猎手。先拉弦蓄力，再向sp储量最多的位置发射重矢。',
    [
      move('稳固拉弦', '奇数回合架弩：自身获得6护盾、1力量。', [
        { type: 'shield', value: 6, target: 'self' },
        buff('strength', 1, 'self'),
      ]),
      move('穿隙重矢', '偶数回合射击回合开始时sp最多的位置：18伤害、1易伤。', [
        damage(18),
        buff('vulnerable', 1),
      ]),
    ],
  ),
  creature(
    'shellGatherer',
    '缀壳拾荒者',
    '#ac9472',
    53,
    2,
    'stone-slam',
    { role: '同伴护持', target: 'exposed', mode: 'protector' },
    '背负层层旧壳的拾荒生物。会把碎壳搭在最虚弱的同伴身前，独处时用前肢自卫。',
    [
      move('壳片砸落', '攻击回合开始时护盾最少的位置：12伤害。', [damage(12)]),
      move('为伤者覆甲', '每隔一回合可为受伤且护盾不足4的敌方同伴提供10护盾。', [
        { type: 'shield', value: 10, target: 'lowestAlly' },
      ]),
    ],
  ),
  creature(
    'riftMote',
    '游隙浮灵',
    '#99abc9',
    38,
    4,
    'tide-ribbon',
    { role: '扩散骚扰', target: 'empowered' },
    '碎片围绕一团微光漂浮的无定形生命。可在不同环境中凝聚，对能量变化尤为敏感。',
    [
      move('碎光牵引', '锁定回合开始时强化最多的位置：9伤害、1易伤。', [
        damage(9),
        buff('vulnerable', 1),
      ]),
      move('离散光雨', '隔回合散开碎片，攻击三个前场位置，各6伤害。', [damage(6)], {
        slots: [0, 1, 2],
      }),
    ],
  ),
  creature(
    'oathlessDuelist',
    '无誓行者',
    '#9d9aaf',
    55,
    4,
    'shadow-strike',
    { role: '防守反击', target: 'exposed', mode: 'duelist' },
    '没有徽记与誓言的蒙甲旅人。先稳住防御，再寻找护盾薄弱的位置连续施压。',
    [
      move('斜刃守备', '每三个回合先守备一次：自身获得8护盾。', [
        { type: 'shield', value: 8, target: 'self' },
      ]),
      move('试隙斩', '其余回合锁定护盾最少的位置：14伤害、1虚弱。', [damage(14), buff('weak', 1)]),
    ],
  ),
];

function boss(entry, enragedIntents) {
  return { ...entry, boss: true, phaseThreshold: 0.5, enragedIntents };
}

export const UNIVERSAL_BOSSES = [
  boss(
    creature(
      'manyShellBeast',
      '多壳巨兽',
      '#a29983',
      207,
      2,
      'beast-roar',
      { role: '范围压制 / 负伤追击', target: 'wounded', mode: 'beast' },
      '披着多层风化甲壳的巨兽，没有固定的元素属性。多人挡路时横扫，落单时专注追击。',
      [
        move('裂壳横扫', '有至少两名前场角色时横扫三个位置，各10伤害。', [damage(10)], {
          slots: [0, 1, 2],
        }),
        move('独猎重噬', '前场只剩一人时，锁定该位置：19伤害、3流血。', [
          damage(19),
          buff('bleed', 3),
        ]),
      ],
    ),
    [
      move('狂裂横扫', '有至少两名前场角色时横扫三个位置，各13伤害。', [damage(13)], {
        slots: [0, 1, 2],
      }),
      move('裂牙追猎', '前场只剩一人时，锁定该位置：23伤害、4流血。', [
        damage(23),
        buff('bleed', 4),
      ]),
    ],
  ),
  boss(
    creature(
      'unmooredJudge',
      '无界裁定者',
      '#9ca5b9',
      190,
      4,
      'colossus-beam',
      { role: '强化判读 / 破盾', target: 'empowered', mode: 'judge' },
      '悬浮面甲、环形肩铠与平衡臂组成的无主构装体。将最显著的防护或强化判定为威胁。',
      [
        move('强者裁定', '锁定回合开始时强化最多的位置：14伤害、1虚弱。', [
          damage(14),
          buff('weak', 1),
        ]),
        move('壁垒裁定', '有人防护达到8时，锁定防护最高的位置：21伤害；1铁皮按4护盾比较。', [
          damage(21),
        ]),
      ],
    ),
    [
      move(
        '双向裁定',
        '锁定强化最多的位置与相邻一格，各12伤害、1虚弱。',
        [damage(12), buff('weak', 1)],
        { adjacent: true },
      ),
      move('壁垒终裁', '有人防护达到8时，锁定防护最高的位置：26伤害；1铁皮按4护盾比较。', [
        damage(26),
      ]),
    ],
  ),
  boss(
    creature(
      'returningCore',
      '归环之核',
      '#81b7ae',
      224,
      2,
      'astral-cascade',
      { role: '同伴修复 / 周期爆发', target: 'charged', mode: 'core' },
      '围绕悬空晶核缓慢自转的三组残环。会修复受损同行者，蓄能后释放明显可预见的光潮。',
      [
        move('聚环蓄能', '每三个回合蓄能一次：自身获得12护盾、1力量。', [
          { type: 'shield', value: 12, target: 'self' },
          buff('strength', 1, 'self'),
        ]),
        move('光潮扩散', '蓄能后攻击三个前场位置，各9伤害。', [damage(9)], { slots: [0, 1, 2] }),
        move('返光修补', '每三个回合最多修复一次：敌方hp比例最低且不足50%的单位回复16hp。', [
          { type: 'heal', value: 16, target: 'lowestAlly' },
        ]),
      ],
    ),
    [
      move('过载聚环', '每三个回合蓄能一次：自身获得16护盾、1力量。', [
        { type: 'shield', value: 16, target: 'self' },
        buff('strength', 1, 'self'),
      ]),
      move(
        '逆环光潮',
        '蓄能后攻击三个前场位置，各12伤害、1易伤。',
        [damage(12), buff('vulnerable', 1)],
        { slots: [0, 1, 2] },
      ),
      move('返光修补', '每三个回合最多修复一次：敌方hp比例最低且不足50%的单位回复16hp。', [
        { type: 'heal', value: 16, target: 'lowestAlly' },
      ]),
    ],
  ),
];
