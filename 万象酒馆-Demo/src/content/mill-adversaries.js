const hit = (value) => ({ type: 'damage', value });
const buff = (key, value, target = 'opponents') => ({ type: 'buff', buff: key, value, target });
const selfShieldEffect = (value) => ({ type: 'shield', value, target: 'self' });

function move(name, text, effects, extra = {}) {
  return { name, text, effects, ...extra };
}

function adversary(id, name, config, intents, extra = {}) {
  return {
    id,
    name,
    color: config.color,
    portrait: config.portrait,
    model: `${config.portrait}.glb`,
    attackStyle: config.attackStyle,
    attackType: config.attackType,
    weaknesses: config.weaknesses,
    toughness: config.toughness,
    hp: config.hp,
    mp: 0,
    speed: config.speed,
    title: config.title,
    buffs: config.buffs || {},
    intents,
    ...(extra.enragedIntents ? { phaseMode: 'threshold', phaseThreshold: 0.5 } : {}),
    tactic: config.tactic || { target: 'exposed' },
    ...extra,
  };
}

export const MILL_ENEMIES = [
  adversary(
    'millMossBug',
    '苔背虫',
    {
      title: '磨坊外围 / 腐叶软甲虫',
      color: '#7ea16b',
      portrait: 'mill-moss-bug',
      attackStyle: 'beetle-burrow',
      attackType: 'brawl',
      weaknesses: ['fire', 'wind', 'sword'],
      toughness: 2,
      hp: 20,
      speed: 2,
    },
    [
      move('苔壳轻撞', '顶起湿滑苔背撞击目标并叠加2护盾。', [hit(5)], {
        slot: 0,
        selfShield: 2,
      }),
      move('孢粉震落', '抖落背甲青苔微尘轻扫前两格各4伤害。', [hit(4)], {
        slots: [0, 1],
      }),
    ],
  ),
  adversary(
    'millCanalFrog',
    '水渠青蛙',
    {
      title: '磨坊水渠 / 鼓囊蛙群',
      color: '#6b9e78',
      portrait: 'mill-canal-frog',
      attackStyle: 'ooze-splash',
      attackType: 'brawl',
      weaknesses: ['lightning', 'spear', 'ice'],
      toughness: 2,
      hp: 22,
      speed: 3,
      tactic: { target: 'fixed' },
    },
    [
      move('长舌突袭', '自水渠浅草间弹射黏舌，稳稳扑击正前格。', [hit(5)], {
        slot: 0,
      }),
      move('鼓腹跃撞', '憋气蓄劲后压向前排左格造成6伤害。', [hit(6)], {
        slot: 0,
      }),
    ],
  ),
  adversary(
    'millShellBeetle',
    '大壳甲虫',
    {
      title: '磨坊砾径 / 硬壳甲虫',
      color: '#5c715e',
      portrait: 'mill-shell-beetle',
      attackStyle: 'stone-slam',
      attackType: 'axe',
      weaknesses: ['brawl', 'axe', 'fire'],
      toughness: 3,
      hp: 28,
      speed: 1,
    },
    [
      move('重壳撞击', '沉肩撞击6伤害，同时获3护盾。', [hit(6)], {
        slot: 0,
        selfShield: 3,
      }),
      move('硬甲缩防', '缩入厚甲反震两格各5伤害并获4护盾。', [hit(5)], {
        slots: [0, 1],
        selfShield: 4,
      }),
    ],
    { tactic: { target: 'fixed' } },
  ),
  adversary(
    'millNettle',
    '伤人荨麻',
    {
      title: '磨坊篱笆 / 刺毒棘丛',
      color: '#739f49',
      portrait: 'mill-nettle',
      attackStyle: 'spore-volley',
      attackType: 'wind',
      weaknesses: ['fire', 'axe', 'wind'],
      toughness: 2,
      hp: 24,
      speed: 3,
    },
    [
      move('刺藤抽打', '带倒刺的藤蔓鞭打正前目标并附加1层流血。', [hit(5), buff('bleed', 1)], {
        slot: 0,
      }),
      move('麻刺扫枝', '拂散细碎棘刺轻擦前两格各4伤害。', [hit(4)], {
        slots: [0, 1],
      }),
    ],
  ),
  adversary(
    'millVolePup',
    '巨型田鼠幼崽',
    {
      title: '磨坊粮袋 / 饥饿幼鼠',
      color: '#9c8669',
      portrait: 'mill-vole-pup',
      attackStyle: 'patrol-pounce',
      attackType: 'spear',
      weaknesses: ['fire', 'spear', 'lightning'],
      toughness: 2,
      hp: 20,
      speed: 4,
    },
    [
      move('门牙啃咬', '窜向中位敏捷撕咬4伤害。', [hit(4)], {
        slot: 1,
      }),
      move('乱窜扑咬', '顶着麦糠胡乱冲扑正前5伤害。', [hit(5)], {
        slot: 0,
      }),
    ],
  ),
  adversary(
    'millStrayCat',
    '流浪野猫',
    {
      title: '磨坊篱院 / 饥饿野猫',
      color: '#b59268',
      portrait: 'mill-stray-cat',
      attackStyle: 'claw-pounce',
      attackType: 'sword',
      weaknesses: ['wind', 'brawl', 'spear'],
      toughness: 2,
      hp: 24,
      speed: 4,
    },
    [
      move('利爪连抓', '贴近正前挥出快爪造成5伤害。', [hit(5)], {
        slot: 0,
      }),
      move('弓背扑击', '掠过前两格撕扯各5伤害。', [hit(5)], {
        slots: [0, 1],
      }),
    ],
  ),
  adversary(
    'millDustBat',
    '灰尘蝠',
    {
      title: '磨坊梁架 / 粉尘蝠群',
      color: '#8f8b84',
      portrait: 'mill-dust-bat',
      attackStyle: 'storm-dive',
      attackType: 'wind',
      weaknesses: ['wind', 'light', 'sword'],
      toughness: 2,
      hp: 22,
      speed: 5,
    },
    [
      move('面尘掠袭', '卷起陈年面粉俯冲中位造成5伤害。', [hit(5)], {
        slot: 1,
      }),
      move('灰雾尖啸', '振翅扬尘掠过两格造成4伤害并附加1层虚弱。', [hit(4), buff('weak', 1)], {
        slots: [0, 1],
      }),
    ],
  ),
  adversary(
    'millGiantVole',
    '巨型田鼠',
    {
      title: '精英 / 硕大麦仓田鼠',
      color: '#8c6f52',
      portrait: 'mill-giant-vole',
      attackStyle: 'patrol-pounce',
      attackType: 'brawl',
      weaknesses: ['fire', 'spear', 'axe'],
      toughness: 4,
      hp: 56,
      speed: 4,
      tactic: { target: 'wounded' },
    },
    [
      move('巨颚突撞', '挟带沉重身躯冲撞前两格各8伤害。', [hit(8)], {
        slots: [0, 1],
      }),
      move('麦仓蛮冲', '拖着硬毛横冲直撞全前排各7伤害并获3护盾。', [hit(7)], {
        slots: [0, 1, 2],
        selfShield: 3,
      }),
    ],
    { elite: true },
  ),
  adversary(
    'millMiniMoldSlime',
    '小型霉斑史莱姆',
    {
      title: '精英 / 潮湿霉菌团块',
      color: '#6b8f5e',
      portrait: 'mill-mini-mold-slime',
      attackStyle: 'slime-bounce',
      attackType: 'special-magic',
      weaknesses: ['fire', 'light', 'lightning'],
      toughness: 4,
      hp: 54,
      speed: 2,
      tactic: { target: 'exposed' },
    },
    [
      move(
        '霉菌酸溅',
        '喷吐发苦绿斑溅射前两格各7伤害并附加2层中毒。',
        [hit(7), buff('poison', 2)],
        {
          slots: [0, 1],
        },
      ),
      move('菌膜吸润', '吸收地面水渍重塑黏躯造成6伤害并自愈5生命。', [hit(6)], {
        slot: 0,
        selfHeal: 5,
      }),
    ],
    { elite: true },
  ),
  adversary(
    'millPaleSlug',
    '灰白蛞蝓',
    {
      title: '精英 / 阴湿巨型蛞蝓',
      color: '#c4c2b4',
      portrait: 'mill-pale-slug',
      attackStyle: 'mud-slam',
      attackType: 'dark',
      weaknesses: ['fire', 'lightning', 'axe'],
      toughness: 5,
      hp: 62,
      speed: 1,
      tactic: { target: 'fixed' },
    },
    [
      move(
        '冷黏碾压',
        '拖曳厚重黏液缓步压过前两格各8伤害并附加1层虚弱。',
        [hit(8), buff('weak', 1)],
        {
          slots: [0, 1],
        },
      ),
      move('厚膜裹躯', '分泌泛灰黏盾撞击正前7伤害并获6护盾。', [hit(7)], {
        slot: 0,
        selfShield: 6,
      }),
    ],
    { elite: true },
  ),
];

export const MILL_BOSSES = [
  adversary(
    'millVoleAlpha',
    '田鼠头鼠',
    {
      title: '外围首领 / 断耳铁甲鼠王',
      color: '#876045',
      portrait: 'mill-vole-alpha',
      attackStyle: 'corridor-cleave',
      attackType: 'axe',
      weaknesses: ['fire', 'axe', 'lightning'],
      toughness: 6,
      hp: 84,
      speed: 2,
      tactic: { target: 'fixed' },
    },
    [
      move('废铁护额撞击', '顶起生锈铁皮猛撞正前7伤害，同时叠加6护盾。', [hit(7)], {
        slot: 0,
        selfShield: 6,
      }),
      move('鼠群横扫', '指挥周围幼鼠合力撕咬前两格各8伤害。', [hit(8)], {
        slots: [0, 1],
      }),
    ],
    {
      boss: true,
      enragedIntents: [
        move(
          '断耳狂噬',
          '红眼尖啸扑向两翼造成10伤害，并附加1层流血。',
          [hit(10), buff('bleed', 1)],
          { slots: [0, 1], enraged: true },
        ),
        move('鼠王铁壁呼号', '嘶吼震落麦袋扑击全前排8伤害，自身获8护盾。', [hit(8)], {
          slots: [0, 1, 2],
          selfShield: 8,
          enraged: true,
        }),
      ],
    },
  ),
  adversary(
    'millRoachSwarm',
    '硬翅蟑螂群',
    {
      title: '主厅首领 / 倾袋虫潮集群',
      color: '#6b4e38',
      portrait: 'mill-roach-swarm',
      attackStyle: 'viper-fang',
      attackType: 'brawl',
      weaknesses: ['fire', 'wind', 'brawl'],
      toughness: 6,
      hp: 132,
      speed: 4,
      tactic: { target: 'exposed' },
    },
    [
      move(
        '麦袋倾覆',
        '撞倒鼓胀面袋扬尘扑击前两格各10伤害并附加1层虚弱。',
        [hit(10), buff('weak', 1)],
        {
          slots: [0, 1],
        },
      ),
      move('群甲结阵', '硬翅叠成盾潮冲撞正前11伤害并获10护盾。', [hit(11)], {
        slot: 0,
        selfShield: 10,
      }),
      move('甲壳潮涌', '黑色虫群漫过前排全格造成9伤害。', [hit(9)], {
        slots: [0, 1, 2],
      }),
    ],
    {
      boss: true,
      enragedIntents: [
        move('黑翅狂噬', '虫群沸腾扑向三格各11伤害并附加2层流血。', [hit(11), buff('bleed', 2)], {
          slots: [0, 1, 2],
          enraged: true,
        }),
        move(
          '死灰复涌',
          '残虫聚集重整阵线造成10伤害并获10护盾与1层力量。',
          [hit(10), buff('strength', 1, 'self')],
          {
            slots: [0, 1],
            selfShield: 10,
            enraged: true,
          },
        ),
      ],
    },
  ),
  adversary(
    'millVampireBat',
    '吸血灰尘蝠',
    {
      title: '二楼首领 / 梁间猩红巨蝠',
      color: '#9c4c58',
      portrait: 'mill-vampire-bat',
      attackStyle: 'shadow-strike',
      attackType: 'dark',
      weaknesses: ['light', 'wind', 'spear'],
      toughness: 6,
      hp: 146,
      speed: 5,
      tactic: { target: 'wounded' },
    },
    [
      move('翼影吸血', '从旧木梁无声俯冲咬击11伤害并吸取7生命。', [hit(11)], {
        slot: 1,
        selfHeal: 7,
      }),
      move(
        '梁间隐伏',
        '收翼盘旋于高梁之上，为自身附加1层飞行并掠击8伤害。',
        [hit(8), buff('flying', 1, 'self')],
        {
          slot: 0,
        },
      ),
      move('利齿裂伤', '尖啸着掠过两翼造成10伤害并附加3层流血。', [hit(10), buff('bleed', 3)], {
        slots: [0, 1],
      }),
    ],
    {
      boss: true,
      enragedIntents: [
        move('猩红俯冲', '狂躁扑击两格各13伤害并吸取9生命。', [hit(13)], {
          slots: [0, 1],
          selfHeal: 9,
          enraged: true,
        }),
        move(
          '尘旋吸血',
          '煽动积灰旋涡横扫三格各11伤害并获1层飞行。',
          [hit(11), buff('flying', 1, 'self')],
          {
            slots: [0, 1, 2],
            enraged: true,
          },
        ),
      ],
    },
  ),
  adversary(
    'millMoldSlimeBoss',
    '霉斑史莱姆',
    {
      title: '酒窖首领 / 钱箱孢子母体',
      color: '#567a4c',
      portrait: 'mill-mold-slime-boss',
      attackStyle: 'ooze-splash',
      attackType: 'special-magic',
      weaknesses: ['fire', 'light', 'axe'],
      toughness: 7,
      hp: 156,
      speed: 2,
      tactic: { target: 'fixed' },
    },
    [
      move('钱箱砸压', '挥动嵌在体内的旧铁钱箱重砸11伤害并获10护盾。', [hit(11)], {
        slot: 0,
        selfShield: 10,
      }),
      move(
        '酒窖霉雾',
        '爆裂孢子菇丛席卷前排全格10伤害并附加3层中毒。',
        [hit(10), buff('poison', 3)],
        {
          slots: [0, 1, 2],
        },
      ),
      move('吞噬菌毯', '裹紧酿酒桶残片猛撞两格各10伤害并自愈8生命。', [hit(10)], {
        slots: [0, 1],
        selfHeal: 8,
      }),
    ],
    {
      boss: true,
      enragedIntents: [
        move(
          '腐绿潮溢',
          '酒窖霉潮漫溢三格各12伤害，附加3层中毒与1层易伤。',
          [hit(12), buff('poison', 3), buff('vulnerable', 1)],
          {
            slots: [0, 1, 2],
            enraged: true,
          },
        ),
        move('孢核固结', '自愈11生命并叠加13护盾，撞击正前11伤害。', [hit(11)], {
          slot: 0,
          selfShield: 13,
          selfHeal: 11,
          enraged: true,
        }),
      ],
    },
  ),
  adversary(
    'alchemicalPuppet',
    '失败的炼金傀偶',
    {
      title: '阁楼霸主 / 失控炼金试作品',
      color: '#9f87c4',
      portrait: 'alchemical-puppet',
      attackStyle: 'colossus-beam',
      attackType: 'special-weapon',
      weaknesses: ['fire', 'brawl', 'axe', 'lightning'],
      toughness: 7,
      hp: 360,
      speed: 3,
      buffs: { artifact: 1 },
      tactic: { target: 'fixed' },
    },
    [
      move(
        '失衡木杆横扫',
        '挥动悬吊失衡的笨重长木杆猛击相邻两格各11伤害并附加1层虚弱。',
        [hit(11), buff('weak', 1)],
        {
          slot: 0,
          adjacent: true,
          damageType: 'brawl',
          clip: 'Normal_Attack',
        },
      ),
      move(
        '重力铁钳猛砸',
        '生锈铁钳借逆重力重锤中位17伤害并附加1层易伤。',
        [hit(17), buff('vulnerable', 1)],
        {
          slot: 1,
          damageType: 'axe',
          clip: 'Normal_Attack',
        },
      ),
      move(
        '发条错位重整',
        '背部时钟齿轮狂转上弦、炼金核心闪烁稳固躯壳：获得16护盾、1层力量与1层铁皮。',
        [selfShieldEffect(16), buff('strength', 1, 'self'), buff('iron', 1, 'self')],
        { slot: 0, clip: 'Special_Action' },
      ),
    ],
    {
      boss: true,
      overlord: true,
      standOnCard: true,
      actions: 1,
      enragedActions: 2,
      finalPhaseActions: 2,
      overlordPhases: Object.freeze([0.66, 0.33]),
      toughnessByPhase: Object.freeze([7, 9, 10]),
      breakLayersByPhase: Object.freeze([2, 2, 3]),
      phaseShields: Object.freeze([0, 16, 22]),
      artifactByPhase: Object.freeze([0, 1, 1]),
      chargeMechanic: Object.freeze({
        cadenceRounds: 3,
        chargeMove: Object.freeze({
          id: 'puppet-core-charge',
          name: '炉心逆重蓄能',
          text: '双钳收拢胸口炉心逆向拧死发条，获得14护盾并积蓄毁灭能量；下回合露出元素破绽，并于时间轴靠前位置释放【湮灭炼金坍缩】。',
          slot: 1,
          selfShield: 14,
          effects: [],
          clip: 'Charge_Up',
          isCharge: true,
        }),
        releaseMovesByPhase: Object.freeze([
          move(
            '湮灭炼金坍缩',
            '失控炉心引爆蓄积的逆重熔流轰击全前排22伤害，并附加1层易伤与1层虚弱。',
            [hit(22), buff('vulnerable', 1), buff('weak', 1)],
            {
              slots: [0, 1, 2],
              damageType: 'special-magic',
              clip: 'Special_Attack',
              isChargedRelease: true,
            },
          ),
          move(
            '湮灭炼金坍缩',
            '双倍过载的炼金坍缩焰浪轰击全前排26伤害，并附加1层易伤与1层虚弱。',
            [hit(26), buff('vulnerable', 1), buff('weak', 1)],
            {
              slots: [0, 1, 2],
              enraged: true,
              damageType: 'special-magic',
              clip: 'Special_Attack',
              isChargedRelease: true,
            },
          ),
          move(
            '终极炼金坍缩',
            '彻底失控的炉心洪流吞没全前排造成30伤害，并附加1层易伤与1层虚弱。',
            [hit(30), buff('vulnerable', 1), buff('weak', 1)],
            {
              slots: [0, 1, 2],
              enraged: true,
              damageType: 'special-magic',
              clip: 'Special_Attack',
              isChargedRelease: true,
            },
          ),
        ]),
      }),
      fixedFirstSlot: Object.freeze({
        id: 'alchemical-time-bomb',
        name: '定式投弹 · 炼金怀表',
        text: '先制投出定时炼金炸弹；下回合限时内未确认结算将当场引爆造成高额伤害并强制结束回合。',
        clip: 'Bomb_Toss',
        unSlowable: true,
        hideSpeed: true,
        breakable: true,
        bombSecondsByPhase: Object.freeze([40, 30, 20]),
      }),
      enragedIntents: [
        move(
          '逆重齿轮坠击',
          '反重力核心骤然过载倒悬轰落，横扫全前排12伤害并附加1层易伤。',
          [hit(12), buff('vulnerable', 1)],
          { slots: [0, 1, 2], enraged: true, damageType: 'special-weapon', clip: 'Special_Attack' },
        ),
        move(
          '双臂错位连槌',
          '失衡木杆与铁钳错位狂砸左格造成16伤害并附加4层流血。',
          [hit(16), buff('bleed', 4)],
          { slot: 0, enraged: true, damageType: 'axe', clip: 'Normal_Attack' },
        ),
        move('失控发条超频', '发条暴走震荡全前排10伤害，同时获得18护盾与1层铁皮。', [hit(10)], {
          slots: [0, 1, 2],
          selfShield: 18,
          selfBuff: { iron: 1 },
          enraged: true,
          damageType: 'special-weapon',
          clip: 'Special_Action',
        }),
      ],
      finalPhaseIntents: [
        move(
          '终焉逆重崩落',
          '临爆核心失重倾坠轰击全前排14伤害并附加1层易伤。',
          [hit(14), buff('vulnerable', 1)],
          { slots: [0, 1, 2], enraged: true, damageType: 'special-weapon', clip: 'Special_Attack' },
        ),
        move(
          '熔炉铁钳处决',
          '过载铁钳贯砸中格20伤害并撕裂造成5层流血。',
          [hit(20), buff('bleed', 5)],
          { slot: 1, enraged: true, damageType: 'axe', clip: 'Normal_Attack' },
        ),
        move(
          '过载核心喷涌',
          '紫绿炼金焰浪席卷相邻两格15伤害并附加1层虚弱，同时获得14护盾。',
          [hit(15), buff('weak', 1)],
          {
            slot: 1,
            adjacent: true,
            selfShield: 14,
            enraged: true,
            damageType: 'special-magic',
            clip: 'Special_Attack',
          },
        ),
      ],
    },
  ),
];
