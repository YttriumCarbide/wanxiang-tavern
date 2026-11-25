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

function commonMob(
  id,
  name,
  faction,
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
    title: `${faction} / ${name}`,
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

function commonBoss(
  id,
  name,
  faction,
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
    title: `首领 / ${faction}·${name}`,
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

export const COMMON_ENEMIES = [
  // ---- 盗贼（Bandits）----
  commonMob(
    'banditCutthroat',
    '截道剑士',
    '盗贼团',
    'shadow-strike',
    '#9e6b56',
    58,
    4,
    '蒙面短袍的官道亡命徒，擅长从侧翼突刺抹喉，专门盯防疏于防御的队友。',
    [
      move('黑刃突刺', '瞄准薄盾位置造成14伤害、3流血。', [hit(14), buff('bleed', 3)]),
      move('飞刀牵制', '造成11伤害、2虚弱。', [hit(11), buff('weak', 2)]),
    ],
  ),
  commonMob(
    'banditPoacher',
    '偷猎弓手',
    '盗贼团',
    'ballista-bolt',
    '#728a5c',
    54,
    4,
    '携带带倒钩猎弩的盗猎者，习惯瞄准高蓝量施法者点射倒刺箭。',
    [
      move('倒钩毒箭', '点射造成13伤害、3中毒。', [hit(13), buff('poison', 3)]),
      move('连弦齐射', '对两侧造成10伤害。', [hit(10)], { slots: [0, 2] }),
    ],
    { tactic: { target: 'charged' } },
  ),
  commonMob(
    'banditBruiser',
    '碎颅重锤匪',
    '盗贼团',
    'corridor-cleave',
    '#8f7560',
    76,
    2,
    '身披拼接铁肩甲的高大悍匪，双手抡起铁箍战锤正面破盾。',
    [
      move('破盾重锤', '猛砸高护盾目标造成18伤害、2易伤。', [hit(18), buff('vulnerable', 2)]),
      move('铁甲横挡', '自身获14护盾，扫击左中位各10伤害。', [hit(10)], {
        slots: [0, 1],
        selfShield: 14,
      }),
    ],
    { tactic: { target: 'shielded' } },
  ),
  commonMob(
    'banditAlchemist',
    '黑市掷弹手',
    '盗贼团',
    'cinder-spark',
    '#a87c4f',
    56,
    3,
    '腰挂黑火药瓶与烟熏袋的地下调剂师，抛洒劣质炼金炸弹干扰前排阵型。',
    [
      move('焦油爆裂瓶', '对左中右三格造成9伤害、2虚弱。', [hit(9), buff('weak', 2)], {
        slots: [0, 1, 2],
      }),
      move('淬毒烟囊', '对中位造成13伤害、4中毒。', [hit(13), buff('poison', 4)], { slot: 1 }),
    ],
  ),
  commonMob(
    'banditExecutioner',
    '疤面劫掠头目',
    '精英 / 盗贼团',
    'corridor-cleave',
    '#b55848',
    118,
    3,
    '披着荒狼毛皮斗篷的悍匪头目，挥舞宽刃斩首斧，一旦闻到血腥味便越战越狂。',
    [
      move('嗜血劈斩', '对伤者造成22伤害、4流血。', [hit(22), buff('bleed', 4)]),
      move('掠夺号令', '对两翼造成14伤害，自身获16护盾与1力量。', [hit(14)], {
        slots: [0, 2],
        selfShield: 16,
        selfBuff: { strength: 1 },
      }),
    ],
    { elite: true, title: '精英 / 疤面劫掠头目', tactic: { target: 'wounded' } },
  ),

  // ---- 哥布林（Goblins）----
  commonMob(
    'goblinScavenger',
    '哥布林拾荒兵',
    '哥布林',
    'patrol-pounce',
    '#6e9854',
    48,
    4,
    '戴着生锈铁锅当头盔的矮小绿皮杂兵，手举绑骨长矛借群势乱刺。',
    [
      move('乱矛捅刺', '戳击目标造成13伤害、2流血。', [hit(13), buff('bleed', 2)]),
      move('铁锅抱头', '获得12护盾并轻敲中位9伤害。', [hit(9)], { slot: 1, selfShield: 12 }),
    ],
  ),
  commonMob(
    'goblinSlinger',
    '哥布林投石手',
    '哥布林',
    'pebble-shards',
    '#849c52',
    45,
    4,
    '躲在同伴身后甩动皮绳投石的狡猾哥布林，专挑低防目标砸石击晕。',
    [
      move('尖石投掷', '造成13伤害、2易伤。', [hit(13), buff('vulnerable', 2)]),
      move('散石乱飞', '向三格丢出碎石各8伤害。', [hit(8)], { slots: [0, 1, 2] }),
    ],
  ),
  commonMob(
    'goblinShaman',
    '骨杖祭司',
    '哥布林',
    'specter-wail',
    '#629c78',
    52,
    3,
    '戴着野兽头骨面具、手持铃铛骨杖的部落巫医，擅长熬制草药毒汤救护部下。',
    [
      move('苦毒咒烟', '喷吐紫绿诅咒造成11伤害、3中毒。', [hit(11), buff('poison', 3)]),
      move('祖灵药膏', '为生命最低友方回复16生命、施加3层再生。', [
        heal(16, 'lowestAlly'),
        buff('regen', 3, 'lowestAlly'),
      ]),
    ],
    { tactic: { target: 'exposed', mode: 'medic' } },
  ),
  commonMob(
    'goblinSapper',
    '哥布林爆破工兵',
    '哥布林',
    'tomb-flare',
    '#b87642',
    54,
    4,
    '背着冒火星黑火药桶与大号引信剪的狂热哥布林，冲上去就是一记烈焰爆破。',
    [
      move('火药桶炸击', '对左中位各13伤害、2虚弱。', [hit(13), buff('weak', 2)], {
        slots: [0, 1],
      }),
      move('火花乱抛', '造成15伤害、3流血。', [hit(15), buff('bleed', 3)]),
    ],
  ),
  commonMob(
    'goblinWolfRider',
    '哥布林座狼骑手',
    '精英 / 哥布林',
    'claw-pounce',
    '#7c8e58',
    112,
    5,
    '跨坐凶暴灰背座狼的部落斥候精锐，座狼扑咬配合骑手短矛形成高机动连击。',
    [
      move('狼骑突袭', '扑咬伤者造成21伤害、4流血。', [hit(21), buff('bleed', 4)]),
      move('野狼横撞', '撞击三格前场各13伤害、2易伤。', [hit(13), buff('vulnerable', 2)], {
        slots: [0, 1, 2],
      }),
    ],
    { elite: true, title: '精英 / 哥布林座狼骑手', tactic: { target: 'wounded' } },
  ),

  // ---- 蚀鳞（Erosion-Scales）----
  commonMob(
    'erosionCrawler',
    '蚀鳞爬行兽',
    '蚀鳞裂隙',
    'claw-pounce',
    '#68587a',
    68,
    4,
    '从往生界裂隙爬出的低阶四足蚀鳞，背生锯齿黑紫骨刺，受创时裂纹微亮。',
    [
      move('黑棘爪撕', '造成15伤害、3流血。', [hit(15), buff('bleed', 3)]),
      move('裂隙俯冲', '对左中位各11伤害。', [hit(11)], { slots: [0, 1] }),
    ],
  ),
  commonMob(
    'erosionSpitter',
    '蚀鳞喷吐者',
    '蚀鳞裂隙',
    'ooze-splash',
    '#7a5288',
    62,
    3,
    '颈侧膨大毒囊翻涌黑紫浊液的蚀鳞怪，从远处喷吐强酸毒液腐蚀甲胄。',
    [
      move('蚀骨酸液', '造成13伤害、4中毒、1易伤。', [
        hit(13),
        buff('poison', 4),
        buff('vulnerable', 1),
      ]),
      move('腐雾弥散', '全体前场各8伤害、2虚弱。', [hit(8), buff('weak', 2)], { slots: [0, 1, 2] }),
    ],
  ),
  commonMob(
    'erosionHound',
    '蚀鳞猎犬',
    '蚀鳞裂隙',
    'patrol-pounce',
    '#8c4862',
    64,
    5,
    '失去双眼的无面黑鳞猎犬，仅靠感知乙太波动撕咬伤痕累累的冒险者。',
    [
      move('蚀脉狂咬', '对伤者造成17伤害、4流血。', [hit(17), buff('bleed', 4)]),
      move('影鳞穿梭', '造成14伤害并获得10护盾。', [hit(14)], { selfShield: 10 }),
    ],
    { tactic: { target: 'wounded' } },
  ),
  commonMob(
    'erosionWing',
    '蚀鳞掠空蝠',
    '蚀鳞裂隙',
    'storm-dive',
    '#6e5a8c',
    58,
    5,
    '生有紫黑色骨翼膜的白骨飞兽，围绕战阵上空高速盘旋骚扰两翼。',
    [
      move('暮翼斩击', '掠击两侧各12伤害、2虚弱。', [hit(12), buff('weak', 2)], { slots: [0, 2] }),
      move('黑羽俯刺', '俯冲造成14伤害，自身获1层飞行。', [hit(14), buff('flying', 1, 'self')]),
    ],
  ),
  commonMob(
    'erosionJuggernaut',
    '蚀鳞重甲狂兽',
    '精英 / 蚀鳞裂隙',
    'warden-fist',
    '#5d4c78',
    138,
    2,
    '浑身覆盖层层叠叠黑耀石重鳞的半人形巨兽，双臂化作锯齿骨刃与重盾。',
    [
      move('黑鳞碎阵锤', '猛击中位造成25伤害、1禁锢。', [hit(25), buff('bind', 1)], { slot: 1 }),
      move('硬鳞壁垒', '自身获22护盾与1层铁皮，顺势震伤两侧各13伤害。', [hit(13)], {
        slots: [0, 2],
        selfShield: 22,
        selfBuff: { iron: 1 },
      }),
    ],
    { elite: true, title: '精英 / 蚀鳞重甲狂兽', buffs: { iron: 1 } },
  ),
];

export const COMMON_BOSSES = [
  commonBoss(
    'banditSyndicateKing',
    '暗巷匪王·黑鸦',
    '盗贼团',
    'shadow-strike',
    '#8e5268',
    314,
    6,
    '盘踞星钟城暗巷黑市深处的暗器宗师与地下匪首，身披黑羽大氅，出手疾若鬼魅；每回合初按局势更换一匣特制暗器，以高频连袭令敌阵顷刻浸满剧毒、流血与破绽。',
    [
      move('乌羽疾刺', '瞬步探刺中位造成7伤害，并附带本回合锁定暗器效果。', [hit(7)], {
        slot: 1,
        damageType: 'special-weapon',
        clip: 'Normal_Attack',
      }),
      move('暗巷双镖', '甩手双掷暗器掠击两翼各5伤害，并附带本回合锁定暗器效果。', [hit(5)], {
        slots: [0, 2],
        damageType: 'special-weapon',
        clip: 'Normal_Attack',
      }),
      move('黑鸦暗铳', '近身拔出袖底短铳点射中位9伤害，并附带本回合锁定暗器效果。', [hit(9)], {
        slot: 1,
        damageType: 'special-weapon',
        clip: 'Special_Attack',
      }),
      move(
        '影氅换位',
        '翻卷黑羽大氅斜削左中两格各5伤害并获8护盾，并附带本回合锁定暗器效果。',
        [hit(5)],
        {
          slots: [0, 1],
          selfShield: 8,
          damageType: 'dark',
          clip: 'Special_Action',
        },
      ),
    ],
    [
      move(
        '夜枭扇刃雨',
        '腾身挥洒扇形暗器雨横扫全前场各5伤害，并附带本回合锁定暗器效果。',
        [hit(5)],
        {
          slots: [0, 1, 2],
          enraged: true,
          damageType: 'special-weapon',
          clip: 'Special_Action',
        },
      ),
      move('掠影断喉刺', '绕侧闪袭左位要害8伤害，并附带本回合锁定暗器效果。', [hit(8)], {
        slot: 0,
        enraged: true,
        damageType: 'sword',
        clip: 'Normal_Attack',
      }),
      move('双翼追魂镖', '交叉连掷暗器封锁两翼各6伤害，并附带本回合锁定暗器效果。', [hit(6)], {
        slots: [0, 2],
        enraged: true,
        damageType: 'special-weapon',
        clip: 'Normal_Attack',
      }),
      move('处决匕影', '疾影突刺中位破绽10伤害，并附带本回合锁定暗器效果。', [hit(10)], {
        slot: 1,
        enraged: true,
        damageType: 'dark',
        clip: 'Talon_Rend',
      }),
    ],
    {
      overlord: true,
      standOnCard: true,
      title: '黑市霸主 / 暗巷匪王',
      actions: 3,
      enragedActions: 4,
      finalPhaseActions: 5,
      splitActions: true,
      phaseMode: 'threshold',
      phaseThreshold: 0.66,
      overlordPhases: Object.freeze([0.66, 0.33]),
      toughness: 7,
      toughnessByPhase: Object.freeze([7, 8, 9]),
      breakLayersByPhase: Object.freeze([2, 3, 3]),
      phaseShields: Object.freeze([0, 700, 950]),
      weaknesses: ['sword', 'fire', 'lightning', 'brawl'],
      hiddenWeaponMechanic: Object.freeze({
        mode: 'non-repeating-cycle',
        stacksPerHit: 1,
        flatStacks: true,
        weapons: Object.freeze([
          Object.freeze({ id: 'poison-needle', name: '淬毒针', buff: 'poison', color: '#58d68d' }),
          Object.freeze({ id: 'bleed-blade', name: '裂血刃', buff: 'bleed', color: '#ef5350' }),
          Object.freeze({ id: 'numb-dart', name: '麻痹镖', buff: 'weak', color: '#a569bd' }),
          Object.freeze({
            id: 'pierce-awl',
            name: '破甲锥',
            buff: 'vulnerable',
            color: '#f5b041',
          }),
        ]),
      }),
      finalPhaseIntents: [
        move('千鸦骤雨', '暴雨般密集暗器覆盖全前场各5伤害，并附带本回合锁定暗器效果。', [hit(5)], {
          slots: [0, 1, 2],
          enraged: true,
          damageType: 'special-weapon',
          clip: 'Special_Action',
        }),
        move('残影左袭', '鬼魅折返疾刺左位7伤害，并附带本回合锁定暗器效果。', [hit(7)], {
          slot: 0,
          enraged: true,
          damageType: 'special-weapon',
          clip: 'Normal_Attack',
        }),
        move('残影右袭', '瞬间错身疾刺右位7伤害，并附带本回合锁定暗器效果。', [hit(7)], {
          slot: 2,
          enraged: true,
          damageType: 'special-weapon',
          clip: 'Normal_Attack',
        }),
        move('鸦王黑铳连射', '疾退连射两翼各6伤害并获6护盾，并附带本回合锁定暗器效果。', [hit(6)], {
          slots: [0, 2],
          selfShield: 6,
          enraged: true,
          damageType: 'special-weapon',
          clip: 'Special_Attack',
        }),
        move(
          '绝命冷月斩',
          '倾尽全速的一记冷月绝斩直取中位11伤害，并附带本回合锁定暗器效果。',
          [hit(11)],
          {
            slot: 1,
            enraged: true,
            damageType: 'dark',
            clip: 'Talon_Rend',
          },
        ),
      ],
    },
  ),
  commonBoss(
    'goblinKingGorg',
    '碎铁哥布林王',
    '哥布林',
    'warden-fist',
    '#7ca24c',
    252,
    3,
    '把废弃攻城盾与齿轮战锤焊接在身上的巨型哥布林领主，戴着镀金王冠统率群落冲锋。',
    [
      move('废铁重砸', '砸击中位造成22伤害、1禁锢。', [hit(22), buff('bind', 1)], { slot: 1 }),
      move('王权号角', '自身获得20护盾与1力量，全体前场各12伤害。', [hit(12)], {
        slots: [0, 1, 2],
        selfShield: 20,
        selfBuff: { strength: 1 },
      }),
    ],
    [
      move('碎铁暴走车轮', '践踏全前场各17伤害、2易伤。', [hit(17), buff('vulnerable', 2)], {
        slots: [0, 1, 2],
      }),
      move('狼王夺命锤', '重砸中位35伤害，自身获16护盾。', [hit(35)], { slot: 1, selfShield: 16 }),
    ],
    { buffs: { iron: 1 } },
  ),
  commonBoss(
    'erosionRiftTyrant',
    '裂隙蚀鳞暴君',
    '蚀鳞裂隙',
    'void-collapse',
    '#7c428f',
    285,
    3,
    '高阶蚀鳞聚合诞生的灾厄暴君，背后展开三对紫黑晶体棘翼，不断向现世喷吐浊暗瘴气。',
    [
      move('暗瘴潮汐', '全前场15伤害、4中毒。', [hit(15), buff('poison', 4)], {
        slots: [0, 1, 2],
      }),
      move('裂渊晶爪', '撕裂中位27伤害、4流血。', [hit(27), buff('bleed', 4)], { slot: 1 }),
    ],
    [
      move(
        '虚空破界波',
        '全前场19伤害、2虚弱、2易伤。',
        [hit(19), buff('weak', 2), buff('vulnerable', 2)],
        { slots: [0, 1, 2] },
      ),
      move('蚀脉虹吸', '猛击中位37伤害并汲取22生命。', [hit(37), heal(22)], { slot: 1 }),
    ],
    { buffs: { iron: 1 } },
  ),
];
