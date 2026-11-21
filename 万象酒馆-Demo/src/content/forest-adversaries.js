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
  const extra = args[9] || {};
  return {
    ...entry,
    tactic: args[8] || { target: 'fixed' },
    boss: true,
    phaseMode: extra.enragedIntents ? 'threshold' : 'cycle',
    ...extra,
  };
}
export const FOREST_ENEMIES = [
  creature(
    'livingVine',
    '缚猎活藤',
    68,
    3,
    'vine',
    '#729e77',
    '藤节扣着遗落药篓，根须会循脚步震动收紧；切断绑在同一根主藤上的结点即可解救采药人。',
    [
      move('缠踝收紧', '锁定护盾最少的位置：13伤害、1禁锢。', [damage(13), buff('bind', 1)]),
      move('藤鞭扫击', '横扫相邻位置，各14伤害。', [damage(14)], { adjacent: true }),
    ],
  ),
  creature(
    'moonMoth',
    '荧屑夜蛾',
    54,
    4,
    'moth',
    '#82c5d0',
    '翅面沾着蓝色月痕粉，受扰时沿拖拽痕迹扑飞，荧光并非森林原有的萤火。',
    [move('荧粉扑落', '优先干扰强化最多的位置：11伤害、2虚弱。', [damage(11), buff('weak', 2)])],
    { target: 'empowered' },
  ),
  creature(
    'bogLeech',
    '瘴泽吸蛭',
    76,
    3,
    'worm',
    '#6b8874',
    '藏在湿泥边缘的粗大吸蛭，身体鼓起时会回流黏液修补伤口。',
    [
      move('吸附噬咬', '追击当前hp最低的位置：16伤害，并为自己回复8hp。', [
        damage(16),
        { type: 'heal', value: 8, target: 'self' },
      ]),
    ],
    { target: 'wounded' },
  ),
  creature(
    'fogSpore',
    '蓝瘴囊菇',
    64,
    2,
    'mushroom',
    '#81a9c3',
    '孢囊被蓝瘴撑得半透明，蜂群刻意避开它喷出的低空雾流，可据此追查毒沼节点。',
    [
      move('瘴囊鼓胀', '优先给未中毒的位置施加6中毒。', [buff('poison', 6)]),
      move('菌柄推撞', '喷雾后抬起菌柄：14伤害。', [damage(14)]),
    ],
    { target: 'unpoisoned' },
  ),
  {
    ...creature(
      'bogDrifter',
      '迷瘴泥兽',
      122,
      2,
      'mud',
      '#678a83',
      '失去方向感的泥壳魔物，体表苔痕总向同一个节点流动，受伤后会本能收紧泥甲。',
      [
        move('泥甲横撞', '撞击护盾最少的位置：20伤害。', [damage(20)]),
        move('泥壳蜷护', 'hp不足45%且无护盾时先获得18护盾。', [
          { type: 'shield', value: 18, target: 'self' },
        ]),
      ],
      { target: 'exposed', mode: 'survivor' },
    ),
    elite: true,
    title: '精英 / 瘴林泥沼兽',
    openingIntent: move(
      '泥潮先涌',
      '开场喷吐毒泥，对中位造成18伤害、4中毒并获得12护盾。',
      [damage(18), buff('poison', 4)],
      { slot: 1, selfShield: 12 },
    ),
  },
  creature(
    'moonWorker',
    '搬月工蜂',
    68,
    4,
    'bee',
    '#c8b45e',
    '前足抱着蓝色碎片，腹部刻纹与蜂后同步闪亮；会寻找尚未中毒的人而非反复浪费毒液。',
    [move('护运毒针', '优先锁定未中毒位置：13伤害、5中毒。', [damage(13), buff('poison', 5)])],
    { target: 'unpoisoned' },
  ),
  {
    ...creature(
      'hiveGuard',
      '蜡甲巢卫',
      134,
      2,
      'bee',
      '#b19153',
      '蜂蜡在胸腹形成六棱甲板，巢室受袭时优先为伤重的同类筑蜡墙。',
      [
        move('巢口冲撞', '撞击暴露位置：21伤害。', [damage(21)]),
        move('筑蜡护巢', '同类受伤且缺少护盾时给予hp比例最低同类18护盾。', [
          { type: 'shield', value: 18, target: 'lowestAlly' },
        ]),
      ],
      { target: 'exposed', mode: 'protector' },
    ),
    elite: true,
    title: '精英 / 铁蜡禁卫',
    openingIntent: move(
      '重蜡闭门',
      '开场筑起蜂蜡壁垒，对暴露位置造成18伤害并获得14护盾。',
      [damage(18)],
      {
        selfShield: 14,
      },
    ),
  },
  creature(
    'honeyLarva',
    '蜜囊幼虫',
    82,
    2,
    'worm',
    '#d0b975',
    '背着半透明蜜囊的粗短幼虫，消化月痕后分泌异常蜜汁，会先治疗同巢伤员。',
    [
      move('酸蜜喷吐', '无人重伤时攻击暴露位置：14伤害、2易伤。', [
        damage(14),
        buff('vulnerable', 2),
      ]),
      move('封伤蜜浆', '奇数回合若同类hp不高于60%，为最低hp比例同类回复20hp。', [
        { type: 'heal', value: 20, target: 'lowestAlly' },
      ]),
    ],
    { target: 'exposed', mode: 'medic' },
  ),
  {
    ...creature(
      'scaleShield',
      '月瞳蜥蜴盾卫',
      140,
      2,
      'lizard',
      '#719b8d',
      '环形盾面刻着陌生城徽，月牙瞳孔会在受击时收窄；总先守住受伤的同袍。',
      [
        move('盾沿重击', '攻击暴露位置：20伤害。', [damage(20)]),
        move('交盾掩护', '优先为伤重且无护盾的同袍增加20护盾。', [
          { type: 'shield', value: 20, target: 'lowestAlly' },
        ]),
      ],
      { target: 'exposed', mode: 'protector' },
    ),
    elite: true,
    title: '精英 / 古城金盾长',
    buffs: { iron: 1 },
    openingIntent: move('古城盾誓', '开场举盾迎击暴露位置造成18伤害，全员获得12护盾。', [
      damage(18),
      { type: 'shield', value: 12, target: 'allAllies' },
    ]),
  },
  creature(
    'scaleWarrior',
    '月瞳蜥蜴刃兵',
    92,
    3,
    'lizard',
    '#8a9b69',
    '颈鳞嵌着统一制式的铜扣，依照短促军号夹击，会对厚盾改用破甲动作。',
    [
      move('交错突刺', '攻击护盾较厚的位置：20伤害。', [damage(20)]),
      move('鳞刃破隙', '护盾较厚时先施加2易伤再造成16伤害。', [buff('vulnerable', 2), damage(16)]),
    ],
    { target: 'shielded', mode: 'breaker' },
  ),
  creature(
    'scaleArcher',
    '月瞳蜥蜴弓手',
    76,
    4,
    'lizard',
    '#a2ac7d',
    '尾端系着方向标，弓弦沿古城廊柱布阵；偏向瞄准sp较高的施术者所在位置。',
    [
      move('循能穿箭', '锁定回合开始时sp最高的位置：18伤害、2虚弱。', [
        damage(18),
        buff('weak', 2),
      ]),
    ],
    { target: 'charged' },
  ),
  creature(
    'twistedSapling',
    '扭枝月树',
    102,
    2,
    'tree',
    '#7b9475',
    '根须托着扭曲树干移动，离开湿土便难以借力；石砖边缘会留下反复拖行的根痕。',
    [
      move('根须挥击', '对相邻位置各造成16伤害。', [damage(16)], { adjacent: true }),
      move('树皮缩护', '收起外层枝条，为自己获得14护盾。', [
        { type: 'shield', value: 14, target: 'self' },
      ]),
    ],
    { target: 'exposed', mode: 'beast' },
  ),
  {
    ...creature(
      'rootHauler',
      '驮土根行者',
      146,
      1,
      'root',
      '#8c8570',
      '根束拖着一团湿土为同类铺路，坚硬砖面会让它运来的土团散开。',
      [
        move('土团抛砸', '对中间位置造成23伤害。', [damage(23)], { slot: 1 }),
        move('湿土覆根', '为所有同类施加5再生。', [buff('regen', 5, 'allAllies')]),
      ],
      { target: 'fixed' },
    ),
    elite: true,
    title: '精英 / 圣林载土巨灵',
    openingIntent: move(
      '沉土先落',
      '开场掷出湿土压制中位造成20伤害，自身获得14护盾。',
      [damage(20)],
      {
        slot: 1,
        selfShield: 14,
      },
    ),
  },
  creature(
    'barkAcolyte',
    '木面护林侍徒',
    82,
    3,
    'cultist',
    '#879675',
    '木面具的嘴被根丝缝住，靠摇动铜铃传令；先削弱强化明显的闯入者。',
    [
      move('缝口咒铃', '锁定强化最多的位置：2虚弱、2易伤。', [
        buff('weak', 2),
        buff('vulnerable', 2),
      ]),
      move('根线抽打', '对同一战术目标造成17伤害。', [damage(17)]),
    ],
    { target: 'empowered' },
  ),
  {
    ...creature(
      'rootSentry',
      '树须守卫',
      152,
      2,
      'root',
      '#7c8c7e',
      '从埋地导管中钻出的根须护卫，根心包着银蓝支架，表明母树同时使用活体组织与精密构装。',
      [
        move('锚须穿刺', '锁定护盾最少的位置：22伤害、5流血。', [damage(22), buff('bleed', 5)]),
        move('根盘合拢', '为自身获得20护盾。', [{ type: 'shield', value: 20, target: 'self' }]),
      ],
      { target: 'exposed', mode: 'survivor' },
    ),
    elite: true,
    title: '精英 / 银络根心守卫',
    openingIntent: move(
      '银络急刺',
      '开场锁定护盾最少的位置造成20伤害、4流血，自身获得12护盾。',
      [damage(20), buff('bleed', 4)],
      { selfShield: 12 },
    ),
  },
  creature(
    'moonTendril',
    '月华导藤',
    86,
    3,
    'vine',
    '#82b1b1',
    '导藤内流动着有节律的蓝光，缠住古城遗物时会读取并回传亮纹，无法仅靠元素相克处理。',
    [
      move('光络鞭打', '锁定sp最高的位置：17伤害、2虚弱。', [damage(17), buff('weak', 2)]),
      move('导藤收束', '对锁定的高sp位置施加1禁锢。', [buff('bind', 1)]),
    ],
    { target: 'charged' },
  ),
];
export const FOREST_BOSSES = [
  boss(
    'mossGulon',
    '苔背巨蛙·咕隆',
    240,
    2,
    'frog',
    '#7d9f73',
    '背苔里扎着数根蓝光蜂针，愤怒的鼓鸣掩盖着仓促逃命的惊惧；击败后才看清蜂毒造成的伤口。',
    [
      move('惊跃踏泥', '对两侧位置各造成12伤害。', [damage(12)], { slots: [0, 2] }),
      move('鼓囊重撞', '对中间位置造成16伤害，并为自己获得10护盾。', [damage(16)], {
        slot: 1,
        selfShield: 10,
      }),
      move('毒刺甩苔', '对左侧位置造成13伤害、3中毒。', [damage(13), buff('poison', 3)], {
        slot: 0,
      }),
    ],
    { target: 'fixed' },
    {
      actions: 2,
      enragedActions: 3,
      splitActions: true,
      phaseThreshold: 0.5,
      enragedIntents: [
        move('狂跃碎泥', '对所有前场造成10伤害。', [damage(10)], { slots: [0, 1, 2] }),
        move(
          '毒囊冲撞',
          '对中间位置造成17伤害、4中毒，并获得12护盾。',
          [damage(17), buff('poison', 4)],
          {
            slot: 1,
            selfShield: 12,
          },
        ),
        move('乱蛙震扑', '对两侧位置各造成13伤害，自身获得10护盾。', [damage(13)], {
          slots: [0, 2],
          selfShield: 10,
        }),
      ],
    },
  ),
  boss(
    'bogElemental',
    '毒沼泥核',
    278,
    1,
    'mud',
    '#6c9b94',
    '三处毒沼支流汇成的元素生命，月苓的药剂能显露其流动核心，普通攻击同样能破坏裸露泥核。',
    [
      move('蓝瘴奔涌', '对所有前场造成9伤害和3中毒。', [damage(9), buff('poison', 3)], {
        slots: [0, 1, 2],
      }),
      move('泥核压陷', '对中位造成17伤害并施加1禁锢。', [damage(17), buff('bind', 1)], { slot: 1 }),
      move('沉泥回流', '为自己回复20hp。', [{ type: 'heal', value: 20, target: 'self' }]),
    ],
    { target: 'fixed' },
    {
      actions: 2,
      enragedActions: 3,
      splitActions: true,
      phaseThreshold: 0.5,
      enragedIntents: [
        move('浊流倾泻', '对所有前场造成10伤害和4中毒。', [damage(10), buff('poison', 4)], {
          slots: [0, 1, 2],
        }),
        move('泥渊吞压', '对中位造成19伤害、1禁锢，并回复14hp。', [damage(19), buff('bind', 1)], {
          slot: 1,
          selfHeal: 14,
        }),
        move('腐核聚流', '对两侧各造成13伤害，并回复16hp。', [damage(13)], {
          slots: [0, 2],
          selfHeal: 16,
        }),
      ],
    },
  ),
  boss(
    'moonQueen',
    '月纹蜂后',
    295,
    2,
    'bee',
    '#d1b96a',
    '胸前月纹把蜂巢当成碎片传送网络；不靠蛮力追击，而以蜂蜡封路与毒针轮换压迫。',
    [
      move('御巢毒雨', '对所有前场造成8伤害、3中毒。', [damage(8), buff('poison', 3)], {
        slots: [0, 1, 2],
      }),
      move('月纹长针', '对中位造成16伤害、2易伤。', [damage(16), buff('vulnerable', 2)], {
        slot: 1,
      }),
      move('蜡巢封护', '为全部同巢单位增加14护盾。', [
        { type: 'shield', value: 14, target: 'allAllies' },
      ]),
    ],
    { target: 'fixed' },
    {
      actions: 2,
      enragedActions: 3,
      splitActions: true,
      phaseThreshold: 0.5,
      enragedIntents: [
        move('狂巢毒暴雨', '对所有前场造成10伤害、4中毒。', [damage(10), buff('poison', 4)], {
          slots: [0, 1, 2],
        }),
        move('穿心月针', '对中位造成20伤害、2易伤。', [damage(20), buff('vulnerable', 2)], {
          slot: 1,
        }),
        move('蜂群统御', '为全部同巢单位增加14护盾与1力量。', [
          { type: 'shield', value: 14, target: 'allAllies' },
          buff('strength', 1, 'allAllies'),
        ]),
      ],
    },
  ),
  boss(
    'scaleCaptain',
    '月瞳近卫队长',
    320,
    2,
    'lizard',
    '#7f9f92',
    '甲裙刻着逐级军衔，月牙瞳孔随口令明灭；队长守护的是一座仍有秩序运转的古城。',
    [
      move('近卫合击', '对两侧各造成12伤害。', [damage(12)], { slots: [0, 2] }),
      move('破门斩击', '瞄准中位，先给予2易伤再造成16伤害。', [buff('vulnerable', 2), damage(16)], {
        slot: 1,
      }),
      move('列阵守城', '为所有同袍增加1力量、1铁皮。', [
        buff('strength', 1, 'allAllies'),
        buff('iron', 1, 'allAllies'),
      ]),
    ],
    { target: 'fixed' },
    {
      actions: 2,
      enragedActions: 3,
      splitActions: true,
      phaseThreshold: 0.5,
      enragedIntents: [
        move('月刃双斩', '对两侧各造成14伤害、2流血。', [damage(14), buff('bleed', 2)], {
          slots: [0, 2],
        }),
        move('裂甲破阵', '瞄准中位造成20伤害、2易伤。', [damage(20), buff('vulnerable', 2)], {
          slot: 1,
        }),
        move(
          '死守古城号令',
          '对全体前场造成9伤害，全军获得10护盾与1力量。',
          [
            damage(9),
            { type: 'shield', value: 10, target: 'allAllies' },
            buff('strength', 1, 'allAllies'),
          ],
          { slots: [0, 1, 2] },
        ),
      ],
    },
  ),
  boss(
    'maskedForester',
    '木面护林主祭',
    268,
    2,
    'cultist',
    '#92a579',
    '面具背后根须与皮肤相连，把保护林地曲解为不许任何生命离开；失去土路后仍以铜铃驱赶树怪拼命。',
    [
      move('围林咒缚', '对两侧各造成10伤害、2虚弱。', [damage(10), buff('weak', 2)], {
        slots: [0, 2],
      }),
      move('根誓倾轧', '对中间位置造成17伤害。', [damage(17)], { slot: 1 }),
      move(
        '困兽号令',
        '为同类提供14护盾，自身获得12护盾。',
        [{ type: 'shield', value: 14, target: 'allAllies' }],
        {
          selfShield: 12,
        },
      ),
    ],
    { target: 'fixed' },
    {
      actions: 2,
      enragedActions: 3,
      splitActions: true,
      phaseThreshold: 0.5,
      enragedIntents: [
        move('森域禁铃', '对所有前场造成10伤害、2虚弱。', [damage(10), buff('weak', 2)], {
          slots: [0, 1, 2],
        }),
        move('狂根撕裂', '对中间位置造成15伤害、2易伤。', [damage(15), buff('vulnerable', 2)], {
          slot: 1,
        }),
        move(
          '誓林余威',
          '对两侧造成10伤害，并为同类提供14护盾。',
          [damage(10), { type: 'shield', value: 14, target: 'allAllies' }],
          { slots: [0, 2] },
        ),
      ],
    },
  ),
  boss(
    'moonCrown',
    '月蚀树冠',
    210,
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
    { overlord: true, standOnCard: true },
  ),
  boss(
    'moonEye',
    '月之魔眼',
    260,
    1,
    'eye',
    '#a0c6d1',
    '中央金属虹膜嵌入活体树干；第1回合激光每次循环按前次的150%增强，第3回合蓄力不攻击。',
    [
      move('贯中月光', '第1回合瞄准中位：初次21伤害，以后每个循环增加50%。', [damage(21)], {
        slot: 1,
      }),
      move('巡林飞弹', '第2回合对所有前场造成11伤害。', [damage(11)], { slots: [0, 1, 2] }),
      move('魔眼蓄能', '第3回合蓄力，本回合不产生效果。', [], { charging: true }),
    ],
    { mode: 'moon-tree', part: 'eye' },
    { overlord: true, standOnCard: true },
  ),
  boss(
    'moonRoot',
    '月痕树根',
    285,
    1,
    'root',
    '#879d92',
    '右侧粗根缠着分流机械，既能扫击两翼也能修复整株母树；其治疗按各部位最大hp分别计算。',
    [
      move('两翼根扫', '第1回合对两侧各造成10伤害。', [damage(10)], { slots: [0, 2] }),
      move('蓄根推挤', '第2回合蓄力同时对两侧各造成7伤害。', [damage(7)], { slots: [0, 2] }),
      move('根脉再构', '第3回合为所有存活敌方同伴回复各自最大hp的20%。', [
        { type: 'heal', value: 0, maxHpPercent: 0.2, target: 'allAllies' },
      ]),
    ],
    { mode: 'moon-tree', part: 'root' },
    { overlord: true, standOnCard: true },
  ),
];
