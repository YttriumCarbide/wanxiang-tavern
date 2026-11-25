const hit = (value) => ({ type: 'damage', value });
const buff = (key, value, target = 'opponents') => ({ type: 'buff', buff: key, value, target });
const heal = (value, target = 'self') => ({ type: 'heal', value, target });
const move = (name, text, effects, extra = {}) => ({
  name,
  text,
  slot: 1,
  effects,
  ...extra,
});

function slug(id) {
  return id.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
}

function ladderMob(
  id,
  name,
  tierLabel,
  attackStyle,
  color,
  hp,
  speed,
  description,
  intents,
  extra = {},
) {
  const art = slug(id);
  return {
    id,
    attackStyle,
    name,
    title: `${tierLabel} / ${name}`,
    color,
    portrait: art,
    model: `${art}.glb`,
    description,
    hp,
    mp: 0,
    speed,
    limit: 1,
    buffs: {},
    tactic: { target: 'exposed' },
    intents,
    ...extra,
  };
}

function ladderBoss(
  id,
  name,
  attackStyle,
  color,
  hp,
  speed,
  description,
  intents,
  enragedIntents,
  extra = {},
) {
  const art = slug(id);
  return {
    id,
    attackStyle,
    name,
    title: extra.overlord ? `霸主 / ${name}` : `天梯首领 / ${name}`,
    boss: true,
    actions: 2,
    enragedActions: 3,
    splitActions: true,
    phaseMode: 'threshold',
    phaseThreshold: 0.5,
    color,
    portrait: art,
    model: `${art}.glb`,
    description,
    hp,
    mp: 0,
    speed,
    limit: 1,
    buffs: {},
    tactic: { target: 'fixed' },
    intents,
    enragedIntents,
    ...extra,
  };
}

export const LADDER_ENEMIES = [
  ladderMob(
    'drakeBadlandSlime',
    '龙化史莱姆',
    '天梯外围',
    'slime-bounce',
    '#c9a85c',
    74,
    3,
    '汲取天梯龙气后角质化的荒地史莱姆，体表凝出金褐龙鳞结晶，弹跳撞击裹挟灼热龙压。',
    [
      move('龙压扑弹', '扑向中位造成15伤害、1易伤。', [hit(15), buff('vulnerable', 1)]),
      move('鳞泥喷溅', '左中位各11伤害，自身获得10护盾。', [hit(11)], {
        slots: [0, 1],
        selfShield: 10,
      }),
    ],
  ),
  ladderMob(
    'drakeBadlandScorpion',
    '荒地毒蝎（龙化）',
    '天梯外围',
    'viper-fang',
    '#8d6b4a',
    84,
    4,
    '受龙力异化的巨螯毒蝎，尾刺泛着淡金毒芒，专盯护盾薄弱的目标连续蜇刺。',
    [
      move('龙毒尾刺', '对薄盾目标造成14伤害、5中毒。', [hit(14), buff('poison', 5)]),
      move('双螯钳碎', '对右侧目标造成17伤害、2虚弱。', [hit(17), buff('weak', 2)], { slot: 2 }),
    ],
  ),
  ladderMob(
    'drakeRattlesnake',
    '龙铃巨蛇',
    '天梯外围',
    'viper-fang',
    '#b59a5b',
    72,
    4,
    '尾环化成晶质龙骨铃铛的荒地蝰蛇，震铃扰乱心神后迅猛撕咬渗血。',
    [
      move('晶铃突咬', '对伤者造成14伤害、4流血。', [hit(14), buff('bleed', 4)]),
      move('蜕鳞闪避', '自身获11护盾，扫击两侧各10伤害。', [hit(10)], {
        slots: [0, 2],
        selfShield: 11,
      }),
    ],
    { tactic: { target: 'wounded' } },
  ),
  ladderMob(
    'drakeBadlandFalcon',
    '龙翎怪鸟',
    '天梯外围',
    'storm-dive',
    '#7aa2c4',
    78,
    5,
    '翅羽生出金属龙翎的高空猛禽，顺着天梯上升气流高速俯冲掠杀。',
    [
      move('龙翎俯冲', '高速猛扑目标造成18伤害、2易伤。', [hit(18), buff('vulnerable', 2)]),
      move('罡风掠翼', '横扫左中右三格各10伤害。', [hit(10)], { slots: [0, 1, 2] }),
    ],
  ),
  ladderMob(
    'ladderCarrionBat',
    '天梯食腐蝠',
    '攀升通道',
    'parasite-leech',
    '#7d5c78',
    68,
    5,
    '栖息在天梯暗窟岩壁的食腐飞蝠，翼膜挂着坠落者的骨片，借吸血维生。',
    [
      move('蚀血蝠吻', '造成14伤害并吸取7点生命。', [hit(14), heal(7)]),
      move('尖啸震荡', '音波震击两侧各11伤害、2虚弱。', [hit(11), buff('weak', 2)], {
        slots: [0, 2],
      }),
    ],
  ),
  ladderMob(
    'ladderCliffLizard',
    '天梯攀岩巨蜥',
    '攀升通道',
    'patrol-pounce',
    '#798e6b',
    88,
    3,
    '生有吸盘巨爪的石崖猎手，在禁飞井道的垂直浮石间如履平地般突袭攀登者。',
    [
      move('岩壁飞扑', '造成18伤害、3流血。', [hit(18), buff('bleed', 3)]),
      move('石脊反冲', '撞击中位造成15伤害并获得12护盾。', [hit(15)], { slot: 1, selfShield: 12 }),
    ],
  ),
  ladderMob(
    'drakeCrystalBeetle',
    '龙晶甲虫',
    '攀升通道',
    'crystal-ram',
    '#8ec8d8',
    98,
    2,
    '啃食天梯结晶岩髓生长的甲虫，背壳镶满黑白色龙晶簇，防御极厚。',
    [
      move('晶铠冲撞', '获得15护盾并撞击中位17伤害。', [hit(17)], { slot: 1, selfShield: 15 }),
      move('龙晶折射', '散射晶刺击伤左中位各12伤害。', [hit(12)], { slots: [0, 1] }),
    ],
    { buffs: { iron: 1 } },
  ),
  ladderMob(
    'pureCreationElemental',
    '创生魔灵',
    '攀升通道',
    'seeker-pulse',
    '#e8dcb5',
    80,
    4,
    '白龙清圣乙太聚拢而成的棱光核心体，能以纯粹创生辉光修补同伴并灼烧外敌。',
    [
      move('清光脉动', '造成15伤害、2虚弱。', [hit(15), buff('weak', 2)]),
      move('生息调律', '为生命最低友方回复16生命，自身获12护盾。', [heal(16, 'lowestAlly')], {
        selfShield: 12,
      }),
    ],
    { tactic: { target: 'exposed', mode: 'medic' } },
  ),
  ladderMob(
    'pureDestructionElemental',
    '毁灭魔灵',
    '攀升通道',
    'ember-bolt',
    '#8f56a8',
    80,
    4,
    '黑龙终焉乙太凝成的深紫裂解核，边缘绕着旋转暗环，专攻高护盾与高强化目标。',
    [
      move('寂灭射线', '对强化最多者造成19伤害、2易伤。', [hit(19), buff('vulnerable', 2)]),
      move('暗能裂环', '轰击全体前场各12伤害。', [hit(12)], { slots: [0, 1, 2] }),
    ],
    { tactic: { target: 'empowered' } },
  ),
  ladderMob(
    'chaosBadlandFalcon',
    '荒地猎鹰（混沌化）',
    '精英 / 混沌龙禽',
    'storm-dive',
    '#8b78b8',
    126,
    5,
    '吞食过量混沌云幕紊流的双冠猛禽，羽间缠绕黑白紊乱电弧，行动迅疾难防。',
    [
      move('混沌裂空斩', '对三格前场各14伤害、2易伤。', [hit(14), buff('vulnerable', 2)], {
        slots: [0, 1, 2],
      }),
      move('黑白旋羽刺', '锁定最脆目标造成24伤害、4流血。', [hit(24), buff('bleed', 4)]),
    ],
    { elite: true, title: '精英 / 荒地猎鹰（混沌化）', tactic: { target: 'wounded' } },
  ),
  ladderMob(
    'relicHermitCrab',
    '遗骸寄居巨蟹',
    '精英 / 骨碑甲壳',
    'stone-slam',
    '#9b8b72',
    148,
    2,
    '背负半截起源纪石碑与远古龙骨的巨蟹，重钳既能碾碎盾牌又能缩入碑甲回护。',
    [
      move('碑岩震砸', '攻击护盾最高者造成26伤害，自身获18护盾。', [hit(26)], {
        selfShield: 18,
      }),
      move('千钧夹碎', '重钳钳击中位22伤害、2虚弱。', [hit(22), buff('weak', 2)], { slot: 1 }),
    ],
    {
      elite: true,
      title: '精英 / 遗骸寄居巨蟹',
      buffs: { iron: 1 },
      tactic: { target: 'shielded' },
    },
  ),
  ladderMob(
    'bicolorScalePython',
    '双色龙鳞巨蟒',
    '精英 / 黑白双鳞',
    'beast-roar',
    '#9aa8b8',
    138,
    3,
    '左半身银白右半身漆黑的盘踞巨蟒，蛇尾绞杀附带剧毒，眼眸闪烁黑白龙压。',
    [
      move('双色绞缠', '对左中位各16伤害、1禁锢。', [hit(16), buff('bind', 1)], { slots: [0, 1] }),
      move('阴阳毒噬', '猛咬中位24伤害、5中毒。', [hit(24), buff('poison', 5)], { slot: 1 }),
    ],
    { elite: true, title: '精英 / 双色龙鳞巨蟒' },
  ),
  ladderMob(
    'overloadCreationElemental',
    '过载创生元素',
    '精英 / 过载圣核',
    'astral-cascade',
    '#f2df9b',
    130,
    4,
    '过度汲取索拉恩白光的圣辉元素体，外环铭文高速旋转，能一边疗愈全军一边齐射光矢。',
    [
      move('超载光矢', '横扫全前场各15伤害、2虚弱。', [hit(15), buff('weak', 2)], {
        slots: [0, 1, 2],
      }),
      move(
        '过载生息环',
        '自身获得20护盾与2力量，友方全体回复16生命。',
        [heal(16, 'allAllies'), buff('strength', 2, 'self')],
        { selfShield: 20 },
      ),
    ],
    { elite: true, title: '精英 / 过载创生元素', tactic: { target: 'exposed', mode: 'medic' } },
  ),
  ladderMob(
    'overloadDestructionElemental',
    '过载毁灭元素',
    '精英 / 过载湮核',
    'void-collapse',
    '#a3488c',
    134,
    4,
    '坍缩成黑紫日环的高能毁灭元素，以强效易伤和撕裂伤害轰击整条战线。',
    [
      move('黑耀崩环', '对全前场造成17伤害、2易伤。', [hit(17), buff('vulnerable', 2)], {
        slots: [0, 1, 2],
      }),
      move('终末湮灭炮', '贯穿高护盾目标30伤害。', [hit(30)]),
    ],
    { elite: true, title: '精英 / 过载毁灭元素', tactic: { target: 'shielded' } },
  ),
  ladderMob(
    'ladderRockGiant',
    '天梯岩巨人',
    '精英 / 浮石巨躯',
    'warden-fist',
    '#8c8478',
    168,
    2,
    '由天梯坠落的千斤巨石顺应龙脉磁力拼合而成的巨像，双拳如陨石锤地。',
    [
      move('坠岩天锤', '猛砸中位28伤害、1禁锢。', [hit(28), buff('bind', 1)], { slot: 1 }),
      move('石壁护体', '获得26护盾与1层铁皮，顺势扫击两侧各14伤害。', [hit(14)], {
        slots: [0, 2],
        selfShield: 26,
        selfBuff: { iron: 1 },
      }),
    ],
    { elite: true, title: '精英 / 天梯岩巨人', buffs: { iron: 2 } },
  ),
];

export const LADDER_BOSSES = [
  ladderBoss(
    'bicolorSingularityLizard',
    '双色奇点·猎蜥',
    'beast-roar',
    '#9d86c4',
    315,
    4,
    '因黑白龙气失衡而吞噬同类融合成的双头龙蜥霸主，脊背高耸晶化棘刺，交替喷吐灼光与蚀暗吐息。',
    [
      move('奇点双颚咬', '对中位造成26伤害、4流血。', [hit(26), buff('bleed', 4)], { slot: 1 }),
      move(
        '黑白吐息扫掠',
        '对全前场造成15伤害、2易伤，自身获18护盾。',
        [hit(15), buff('vulnerable', 2)],
        { slots: [0, 1, 2], selfShield: 18 },
      ),
    ],
    [
      move('极昼极夜狂咬', '对伤者造成34伤害、5流血。', [hit(34), buff('bleed', 5)], {
        slot: 0,
      }),
      move(
        '奇点坍缩啸叫',
        '全体20伤害、2虚弱、2易伤。',
        [hit(20), buff('weak', 2), buff('vulnerable', 2)],
        { slots: [0, 1, 2] },
      ),
    ],
  ),
  ladderBoss(
    'eclipseWatcher',
    '日蚀守望者',
    'colossus-beam',
    '#c99b52',
    345,
    2,
    '起源纪镇守天梯残碑石门的巨型守门构装体，胸口嵌着日蚀金环核心，举戟裁决一切擅闯门扉者。',
    [
      move('日轮光戟斩', '对左中位各19伤害，自身获20护盾。', [hit(19)], {
        slots: [0, 1],
        selfShield: 20,
      }),
      move('日蚀聚能束', '瞄准中位发射裁决射线31伤害、2虚弱。', [hit(31), buff('weak', 2)], {
        slot: 1,
      }),
    ],
    [
      move('天蚀全周扫描', '全体22伤害、2易伤，自身获1铁皮。', [hit(22), buff('vulnerable', 2)], {
        slots: [0, 1, 2],
        selfBuff: { iron: 1 },
      }),
      move('起源断罪重劈', '轰击中位38伤害、1禁锢。', [hit(38), buff('bind', 1)], { slot: 1 }),
    ],
    { buffs: { iron: 1 } },
  ),
  ladderBoss(
    'abyssDevourerPython',
    '噬渊巨蟒',
    'void-collapse',
    '#6c5898',
    340,
    3,
    '盘踞在攀升通道背光深窟中的吞石古蟒，腹腔吞咽着半消化的浮岩与晶骸，每一次翻身都在啃蚀崖壁。',
    [
      move('深窟吞噬咬', '咬碎右位28伤害并吸取15生命。', [hit(28), heal(15)], { slot: 2 }),
      move('暗渊毒雾吐息', '全前场15伤害、5中毒。', [hit(15), buff('poison', 5)], {
        slots: [0, 1, 2],
      }),
    ],
    [
      move(
        '噬岩风暴卷',
        '全前场19伤害、4流血、1禁锢。',
        [hit(19), buff('bleed', 4), buff('bind', 1)],
        { slots: [0, 1, 2] },
      ),
      move('巨蟒绝命吞', '扑咬中位37伤害并回复22生命。', [hit(37), heal(22)], { slot: 1 }),
    ],
  ),
  ladderBoss(
    'radiantWyvern',
    '辉光亚龙',
    'astral-cascade',
    '#f4d57e',
    440,
    4,
    '仅在正午烈日贯通天梯井道时降临向阳岩台的天空霸主，浑身覆满白金与流金交织的耀光龙鳞，展翼之时如同白昼坠地。',
    [
      move(
        '耀光翼斩',
        '宽大光翼横扫三格各18伤害，自身获得22护盾与1层飞行。',
        [hit(18), buff('flying', 1, 'self')],
        { slots: [0, 1, 2], selfShield: 22 },
      ),
      move(
        '索拉恩圣炎',
        '龙颚蓄满日光吐息轰击中位34伤害、2易伤。',
        [hit(34), buff('vulnerable', 2)],
        { slot: 1 },
      ),
    ],
    [
      move(
        '正午白昼降临',
        '全前场22伤害、2虚弱、2易伤，自身获1力量。',
        [hit(22), buff('weak', 2), buff('vulnerable', 2)],
        { slots: [0, 1, 2], selfBuff: { strength: 1 } },
      ),
      move('辉光龙爪裂天', '高空俯冲撕裂中位42伤害、5流血。', [hit(42), buff('bleed', 5)], {
        slot: 1,
      }),
    ],
    {
      overlord: true,
      standOnCard: true,
      actions: 2,
      enragedActions: 3,
      finalPhaseActions: 3,
      overlordPhases: [0.66, 0.33],
      phaseShields: [0, 26, 36],
      breakLayersByPhase: [2, 3, 4],
      buffs: { flying: 1 },
      finalPhaseIntents: [
        move(
          '极昼炽阳坠落',
          '天阶耀光倾泻全前场各25伤害、2虚弱、2易伤，自身获得1力量与24护盾。',
          [hit(25), buff('weak', 2), buff('vulnerable', 2)],
          { slots: [0, 1, 2], selfShield: 24, selfBuff: { strength: 1 }, enraged: true },
        ),
        move(
          '圣炎断罪俯冲',
          '真龙扑碎中位46伤害、5流血与1禁锢。',
          [hit(46), buff('bleed', 5), buff('bind', 1)],
          { slot: 1, enraged: true },
        ),
      ],
    },
  ),
  ladderBoss(
    'dragonscaleSandworm',
    '龙鳞沙虫',
    'mud-slam',
    '#b88c58',
    360,
    2,
    '沿天梯外围沙海不断吞噬外溢龙气的超巨型沙虫，体节包裹层层硬化龙鳞环，口器如旋转钻井。',
    [
      move('潜沙钻袭', '自地底钻出顶击左中位各20伤害，自身获24护盾。', [hit(20)], {
        slots: [0, 1],
        selfShield: 24,
      }),
      move('龙气吞吐震波', '全前场17伤害、4中毒、1力量加身。', [hit(17), buff('poison', 4)], {
        slots: [0, 1, 2],
        selfBuff: { strength: 1 },
      }),
    ],
    [
      move('沙暴绞肉涡旋', '全前场21伤害、4流血。', [hit(21), buff('bleed', 4)], {
        slots: [0, 1, 2],
      }),
      move('巨颚碾压', '猛噬中位39伤害并恢复20生命。', [hit(39), heal(20)], { slot: 1 }),
    ],
  ),
  ladderBoss(
    'ladderWebSpider',
    '天梯魔蛛',
    'beetle-burrow',
    '#6e6888',
    325,
    4,
    '栖息于攀升通道悬壁石隙与浮石阴影间的巨型魔蛛首领，背甲刻满暗金龙纹，能吐出堪比精钢的龙丝布下覆崖天罗，将误触丝网的攀登者拖入暗巢吞食。',
    [
      move(
        '龙丝天罗网',
        '横扫全前场造成16伤害与1层禁锢，自身获20护盾。',
        [hit(16), buff('bind', 1)],
        {
          slots: [0, 1, 2],
          selfShield: 20,
        },
      ),
      move(
        '深窟蚀毒牙',
        '重咬中位造成26伤害与5中毒、2易伤。',
        [hit(26), buff('poison', 5), buff('vulnerable', 2)],
        { slot: 1 },
      ),
    ],
    [
      move(
        '千丝裂甲阵',
        '全前场20伤害、2虚弱、1禁锢。',
        [hit(20), buff('weak', 2), buff('bind', 1)],
        { slots: [0, 1, 2] },
      ),
      move(
        '巨蛛噬髓穿刺',
        '贯刺中位36伤害并回复18生命，施加6中毒。',
        [hit(36), heal(18), buff('poison', 6)],
        { slot: 1 },
      ),
    ],
  ),
  ladderBoss(
    'ladderCrowman',
    '天梯鸦人',
    'storm-dive',
    '#5c6884',
    330,
    5,
    '潜伏在攀升通道迷雾与背光石台间的诡谲鸟首人形首领，咽喉能逼真模仿人类攀登者的求救与呼喊声，将闻声驰援的旅人诱入浮石死角后俯冲猎食。',
    [
      move(
        '拟声哀鸣诱捕',
        '模仿人类求救呼喊惑乱战阵，对全前场造成16伤害、2虚弱、1易伤。',
        [hit(16), buff('weak', 2), buff('vulnerable', 1)],
        { slots: [0, 1, 2] },
      ),
      move(
        '黑羽断喉袭',
        '自盲区骤扑中位28伤害与4流血，自身获1层飞行与18护盾。',
        [hit(28), buff('bleed', 4)],
        { slot: 1, selfShield: 18, selfBuff: { flying: 1 } },
      ),
    ],
    [
      move(
        '百口同悲回响',
        '多重拟人惨叫震荡浮石井道，全前场20伤害、2易伤、1禁锢。',
        [hit(20), buff('vulnerable', 2), buff('bind', 1)],
        { slots: [0, 1, 2] },
      ),
      move(
        '鸦喙裂心俯冲',
        '收翼俯冲撕裂右位37伤害、5流血，并吸取16生命。',
        [hit(37), buff('bleed', 5), heal(16)],
        { slot: 2 },
      ),
    ],
    { buffs: { flying: 1 } },
  ),
];
