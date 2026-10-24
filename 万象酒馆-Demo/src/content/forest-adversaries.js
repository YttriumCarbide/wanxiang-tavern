const damage = (value) => ({ type: 'damage', value });
const buff = (key, value, target = 'opponents') => ({ type: 'buff', buff: key, value, target });
const move = (name, text, effects, extra = {}) => ({ name, text, slot: 1, effects, ...extra });
function creature(
  id,
  name,
  hp,
  speed,
  shape,
  color,
  description,
  intents,
  tactic = { target: 'exposed' },
) {
  const portrait = id.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  return {
    id,
    name,
    hp,
    speed,
    shape,
    color,
    description,
    portrait,
    model: portrait + '.glb',
    mp: 0,
    limit: 1,
    buffs: {},
    title: '月痕古林 / ' + name,
    attackStyle:
      shape === 'bee'
        ? 'storm-dive'
        : shape === 'lizard'
          ? 'corridor-cleave'
          : shape === 'eye'
            ? 'colossus-beam'
            : shape === 'frog'
              ? 'slime-bounce'
              : 'mud-slam',
    intents,
    tactic,
  };
}
function boss(...args) {
  const entry = creature(...args);
  return {
    ...entry,
    tactic: args[8] || { target: 'fixed' },
    boss: true,
    phaseMode: 'cycle',
  };
}
export const FOREST_ENEMIES = [
  creature(
    'livingVine',
    '缚猎活藤',
    36,
    3,
    'vine',
    '#729e77',
    '藤节扣着遗落药篓，根须会循脚步震动收紧；切断绑在同一根主藤上的结点即可解救采药人。',
    [
      move('缠踝收紧', '锁定护盾最少的位置：7伤害、1禁锢。', [damage(7), buff('bind', 1)]),
      move('藤鞭扫击', '横扫相邻位置，各8伤害。', [damage(8)], { adjacent: true }),
    ],
  ),
  creature(
    'moonMoth',
    '荧屑夜蛾',
    28,
    4,
    'moth',
    '#82c5d0',
    '翅面沾着蓝色月痕粉，受扰时沿拖拽痕迹扑飞，荧光并非森林原有的萤火。',
    [move('荧粉扑落', '优先干扰强化最多的位置：5伤害、2虚弱。', [damage(5), buff('weak', 2)])],
    { target: 'empowered' },
  ),
  creature(
    'bogLeech',
    '瘴泽吸蛭',
    40,
    3,
    'worm',
    '#6b8874',
    '藏在湿泥边缘的粗大吸蛭，身体鼓起时会回流黏液修补伤口。',
    [
      move('吸附噬咬', '追击当前hp最低的位置：9伤害，并为自己回复4hp。', [
        damage(9),
        { type: 'heal', value: 4, target: 'self' },
      ]),
    ],
    { target: 'wounded' },
  ),
  creature(
    'fogSpore',
    '蓝瘴囊菇',
    34,
    2,
    'mushroom',
    '#81a9c3',
    '孢囊被蓝瘴撑得半透明，蜂群刻意避开它喷出的低空雾流，可据此追查毒沼节点。',
    [
      move('瘴囊鼓胀', '优先给未中毒的位置施加5中毒。', [buff('poison', 5)]),
      move('菌柄推撞', '喷雾后抬起菌柄：8伤害。', [damage(8)]),
    ],
    { target: 'unpoisoned' },
  ),
  creature(
    'bogDrifter',
    '迷瘴泥兽',
    46,
    2,
    'mud',
    '#678a83',
    '失去方向感的泥壳魔物，体表苔痕总向同一个节点流动，受伤后会本能收紧泥甲。',
    [
      move('泥甲横撞', '撞击护盾最少的位置：10伤害。', [damage(10)]),
      move('泥壳蜷护', 'hp不足45%且无护盾时先获得9护盾。', [
        { type: 'shield', value: 9, target: 'self' },
      ]),
    ],
    { target: 'exposed', mode: 'survivor' },
  ),
  creature(
    'moonWorker',
    '搬月工蜂',
    36,
    4,
    'bee',
    '#c8b45e',
    '前足抱着蓝色碎片，腹部刻纹与蜂后同步闪亮；会寻找尚未中毒的人而非反复浪费毒液。',
    [move('护运毒针', '优先锁定未中毒位置：7伤害、4中毒。', [damage(7), buff('poison', 4)])],
    { target: 'unpoisoned' },
  ),
  creature(
    'hiveGuard',
    '蜡甲巢卫',
    54,
    2,
    'bee',
    '#b19153',
    '蜂蜡在胸腹形成六棱甲板，巢室受袭时优先为伤重的同类筑蜡墙。',
    [
      move('巢口冲撞', '撞击暴露位置：11伤害。', [damage(11)]),
      move('筑蜡护巢', '同类受伤且缺少护盾时给予hp比例最低同类10护盾。', [
        { type: 'shield', value: 10, target: 'lowestAlly' },
      ]),
    ],
    { target: 'exposed', mode: 'protector' },
  ),
  creature(
    'honeyLarva',
    '蜜囊幼虫',
    44,
    2,
    'worm',
    '#d0b975',
    '背着半透明蜜囊的粗短幼虫，消化月痕后分泌异常蜜汁，会先治疗同巢伤员。',
    [
      move('酸蜜喷吐', '无人重伤时攻击暴露位置：8伤害、2易伤。', [
        damage(8),
        buff('vulnerable', 2),
      ]),
      move('封伤蜜浆', '奇数回合若同类hp不高于60%，为最低hp比例同类回复13hp。', [
        { type: 'heal', value: 13, target: 'lowestAlly' },
      ]),
    ],
    { target: 'exposed', mode: 'medic' },
  ),
  creature(
    'scaleShield',
    '月瞳蜥蜴盾卫',
    56,
    2,
    'lizard',
    '#719b8d',
    '环形盾面刻着陌生城徽，月牙瞳孔会在受击时收窄；总先守住受伤的同袍。',
    [
      move('盾沿重击', '攻击暴露位置：10伤害。', [damage(10)]),
      move('交盾掩护', '优先为伤重且无护盾的同袍增加12护盾。', [
        { type: 'shield', value: 12, target: 'lowestAlly' },
      ]),
    ],
    { target: 'exposed', mode: 'protector' },
  ),
  creature(
    'scaleWarrior',
    '月瞳蜥蜴刃兵',
    49,
    3,
    'lizard',
    '#8a9b69',
    '颈鳞嵌着统一制式的铜扣，依照短促军号夹击，会对厚盾改用破甲动作。',
    [
      move('交错突刺', '攻击护盾较厚的位置：12伤害。', [damage(12)]),
      move('鳞刃破隙', '护盾较厚时先施加2易伤再造成9伤害。', [buff('vulnerable', 2), damage(9)]),
    ],
    { target: 'shielded', mode: 'breaker' },
  ),
  creature(
    'scaleArcher',
    '月瞳蜥蜴弓手',
    39,
    4,
    'lizard',
    '#a2ac7d',
    '尾端系着方向标，弓弦沿古城廊柱布阵；偏向瞄准sp较高的施术者所在位置。',
    [
      move('循能穿箭', '锁定回合开始时sp最高的位置：11伤害、2虚弱。', [
        damage(11),
        buff('weak', 2),
      ]),
    ],
    { target: 'charged' },
  ),
  creature(
    'twistedSapling',
    '扭枝月树',
    54,
    2,
    'tree',
    '#7b9475',
    '根须托着扭曲树干移动，离开湿土便难以借力；石砖边缘会留下反复拖行的根痕。',
    [
      move('根须挥击', '对相邻位置各造成9伤害。', [damage(9)], { adjacent: true }),
      move('树皮缩护', '收起外层枝条，为自己获得8护盾。', [
        { type: 'shield', value: 8, target: 'self' },
      ]),
    ],
    { target: 'exposed', mode: 'beast' },
  ),
  creature(
    'rootHauler',
    '驮土根行者',
    62,
    1,
    'root',
    '#8c8570',
    '根束拖着一团湿土为同类铺路，坚硬砖面会让它运来的土团散开。',
    [
      move('土团抛砸', '对中间位置造成13伤害。', [damage(13)], { slot: 1 }),
      move('湿土覆根', '为所有同类施加3再生。', [buff('regen', 3, 'allAllies')]),
    ],
    { target: 'fixed' },
  ),
  creature(
    'barkAcolyte',
    '木面护林侍徒',
    43,
    3,
    'cultist',
    '#879675',
    '木面具的嘴被根丝缝住，靠摇动铜铃传令；先削弱强化明显的闯入者。',
    [
      move('缝口咒铃', '锁定强化最多的位置：2虚弱、2易伤。', [
        buff('weak', 2),
        buff('vulnerable', 2),
      ]),
      move('根线抽打', '对同一战术目标造成10伤害。', [damage(10)]),
    ],
    { target: 'empowered' },
  ),
  creature(
    'rootSentry',
    '树须守卫',
    64,
    2,
    'root',
    '#7c8c7e',
    '从埋地导管中钻出的根须护卫，根心包着银蓝支架，表明母树同时使用活体组织与精密构装。',
    [
      move('锚须穿刺', '锁定护盾最少的位置：12伤害、3流血。', [damage(12), buff('bleed', 3)]),
      move('根盘合拢', '为自身获得10护盾。', [{ type: 'shield', value: 10, target: 'self' }]),
    ],
    { target: 'exposed', mode: 'survivor' },
  ),
  creature(
    'moonTendril',
    '月华导藤',
    46,
    3,
    'vine',
    '#82b1b1',
    '导藤内流动着有节律的蓝光，缠住古城遗物时会读取并回传亮纹，无法仅靠元素相克处理。',
    [
      move('光络鞭打', '锁定sp最高的位置：10伤害、2虚弱。', [damage(10), buff('weak', 2)]),
      move('导藤收束', '对锁定的高sp位置施加1禁锢。', [buff('bind', 1)]),
    ],
    { target: 'charged' },
  ),
];
export const FOREST_BOSSES = [
  boss(
    'mossGulon',
    '苔背巨蛙·咕隆',
    116,
    2,
    'frog',
    '#7d9f73',
    '背苔里扎着数根蓝光蜂针，愤怒的鼓鸣掩盖着仓促逃命的惊惧；击败后才看清蜂毒造成的伤口。',
    [
      move('惊跃踏泥', '对两侧位置各造成10伤害。', [damage(10)], { slots: [0, 2] }),
      move('鼓囊重撞', '对中间位置造成16伤害，并为自己获得6护盾。', [damage(16)], {
        slot: 1,
        selfShield: 6,
      }),
    ],
  ),
  boss(
    'bogElemental',
    '毒沼泥核',
    142,
    1,
    'mud',
    '#6c9b94',
    '三处毒沼支流汇成的元素生命，月苓的药剂能显露其流动核心，普通攻击同样能破坏裸露泥核。',
    [
      move('蓝瘴奔涌', '对所有前场造成7伤害和3中毒。', [damage(7), buff('poison', 3)], {
        slots: [0, 1, 2],
      }),
      move('泥核压陷', '对中位造成18伤害并施加1禁锢。', [damage(18), buff('bind', 1)], { slot: 1 }),
      move('沉泥回流', '为自己回复20hp。', [{ type: 'heal', value: 20, target: 'self' }]),
    ],
  ),
  boss(
    'moonQueen',
    '月纹蜂后',
    156,
    2,
    'bee',
    '#d1b96a',
    '胸前月纹把蜂巢当成碎片传送网络；不靠蛮力追击，而以蜂蜡封路与毒针轮换压迫。',
    [
      move('御巢毒雨', '对所有前场造成8伤害、3中毒。', [damage(8), buff('poison', 3)], {
        slots: [0, 1, 2],
      }),
      move('月纹长针', '对中位造成20伤害、2易伤。', [damage(20), buff('vulnerable', 2)], {
        slot: 1,
      }),
      move('蜡巢封护', '为全部同巢单位增加10护盾。', [
        { type: 'shield', value: 10, target: 'allAllies' },
      ]),
    ],
  ),
  boss(
    'scaleCaptain',
    '月瞳近卫队长',
    170,
    2,
    'lizard',
    '#7f9f92',
    '甲裙刻着逐级军衔，月牙瞳孔随口令明灭；队长守护的是一座仍有秩序运转的古城。',
    [
      move('近卫合击', '对两侧各造成13伤害。', [damage(13)], { slots: [0, 2] }),
      move('破门斩击', '瞄准中位，先给予2易伤再造成17伤害。', [buff('vulnerable', 2), damage(17)], {
        slot: 1,
      }),
      move('列阵守城', '为所有同袍增加1力量、1铁皮。', [
        buff('strength', 1, 'allAllies'),
        buff('iron', 1, 'allAllies'),
      ]),
    ],
  ),
  boss(
    'maskedForester',
    '木面护林主祭',
    166,
    2,
    'cultist',
    '#92a579',
    '面具背后根须与皮肤相连，把保护林地曲解为不许任何生命离开；失去土路后仍以铜铃驱赶树怪拼命。',
    [
      move('围林咒缚', '对两侧各造成9伤害、2虚弱。', [damage(9), buff('weak', 2)], {
        slots: [0, 2],
      }),
      move('根誓倾轧', '对中间位置造成22伤害。', [damage(22)], { slot: 1 }),
      move('困兽号令', '为同类增加2力量，自身获得8护盾。', [buff('strength', 2, 'allAllies')], {
        selfShield: 8,
      }),
    ],
  ),
  boss(
    'moonCrown',
    '月蚀树冠',
    110,
    1,
    'crown',
    '#84b5aa',
    '左侧冠层同时散布生机与瘟疫，叶片下的培养囊按三回合循环开合。',
    [
      move('瘟疫播种', '第1回合随机给一名前场施加易伤/虚弱/禁锢/流血/中毒之一。', [
        buff('weak', 2),
      ]),
      move('生机授予', '第2回合给所有敌方同伴随机施加铁皮/再生/敏捷/力量之一。', [
        buff('regen', 4, 'allAllies'),
      ]),
      move(
        '月疫共鸣',
        '第3回合所有同伴获得1力量、1铁皮，所有玩家前场获得2易伤、2虚弱。',
        [
          buff('strength', 1, 'allAllies'),
          buff('iron', 1, 'allAllies'),
          buff('vulnerable', 2),
          buff('weak', 2),
        ],
        { slots: [0, 1, 2] },
      ),
    ],
    { mode: 'moon-tree', part: 'crown' },
  ),
  boss(
    'moonEye',
    '月之魔眼',
    130,
    1,
    'eye',
    '#a0c6d1',
    '中央金属虹膜嵌入活体树干；第1回合激光每次循环按前次的150%增强，第3回合蓄力不攻击。',
    [
      move('贯中月光', '第1回合瞄准中位：初次21伤害，以后每个循环增加50%。', [damage(21)], {
        slot: 1,
      }),
      move('巡林飞弹', '第2回合对所有前场造成8伤害。', [damage(8)], { slots: [0, 1, 2] }),
      move('魔眼蓄能', '第3回合蓄力，本回合不产生效果。', [], { charging: true }),
    ],
    { mode: 'moon-tree', part: 'eye' },
  ),
  boss(
    'moonRoot',
    '月痕树根',
    150,
    1,
    'root',
    '#879d92',
    '右侧粗根缠着分流机械，既能扫击两翼也能修复整株母树；其治疗按各部位最大hp分别计算。',
    [
      move('两翼根扫', '第1回合对两侧各造成7伤害。', [damage(7)], { slots: [0, 2] }),
      move('蓄根推挤', '第2回合蓄力同时对两侧各造成4伤害。', [damage(4)], { slots: [0, 2] }),
      move('根脉再构', '第3回合为所有存活敌方同伴回复各自最大hp的20%。', [
        { type: 'heal', value: 0, maxHpPercent: 0.2, target: 'allAllies' },
      ]),
    ],
    { mode: 'moon-tree', part: 'root' },
  ),
];
