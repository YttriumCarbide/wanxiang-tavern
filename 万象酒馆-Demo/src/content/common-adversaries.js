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
    '荒路截道贼',
    '盗贼团',
    'shadow-strike',
    '#9e6b56',
    36,
    4,
    '蒙面短袍的官道亡命徒，擅长从侧翼突刺抹喉，专门盯防疏于防御的队友。',
    [
      move('黑刃突刺', '瞄准薄盾位置造成9伤害、2流血。', [hit(9), buff('bleed', 2)]),
      move('飞刀牵制', '造成7伤害、1虚弱。', [hit(7), buff('weak', 1)]),
    ],
  ),
  commonMob(
    'banditPoacher',
    '黑林偷猎弓手',
    '盗贼团',
    'ballista-bolt',
    '#728a5c',
    34,
    4,
    '携带带倒钩猎弩的盗猎者，习惯瞄准高蓝量施法者点射倒刺箭。',
    [
      move('倒钩毒箭', '点射造成8伤害、2中毒。', [hit(8), buff('poison', 2)]),
      move('连弦齐射', '对两侧造成6伤害。', [hit(6)], { slots: [0, 2] }),
    ],
    { tactic: { target: 'charged' } },
  ),
  commonMob(
    'banditBruiser',
    '碎颅重锤匪',
    '盗贼团',
    'corridor-cleave',
    '#8f7560',
    48,
    2,
    '身披拼接铁肩甲的高大悍匪，双手抡起铁箍战锤正面破盾。',
    [
      move('破盾重锤', '猛砸高护盾目标造成12伤害、1易伤。', [hit(12), buff('vulnerable', 1)]),
      move('铁甲横挡', '自身获9护盾，扫击左中位各6伤害。', [hit(6)], {
        slots: [0, 1],
        selfShield: 9,
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
    35,
    3,
    '腰挂黑火药瓶与烟熏袋的地下调剂师，抛洒劣质炼金炸弹干扰前排阵型。',
    [
      move('焦油爆裂瓶', '对左中右三格造成5伤害、1虚弱。', [hit(5), buff('weak', 1)], {
        slots: [0, 1, 2],
      }),
      move('淬毒烟囊', '对中位造成8伤害、3中毒。', [hit(8), buff('poison', 3)], { slot: 1 }),
    ],
  ),
  commonMob(
    'banditExecutioner',
    '疤面劫掠头目',
    '精英 / 盗贼团',
    'corridor-cleave',
    '#b55848',
    74,
    3,
    '披着荒狼毛皮斗篷的悍匪头目，挥舞宽刃斩首斧，一旦闻到血腥味便越战越狂。',
    [
      move('嗜血劈斩', '对伤者造成15伤害、3流血。', [hit(15), buff('bleed', 3)]),
      move('掠夺号令', '对两翼造成9伤害，自身获10护盾与1力量。', [hit(9)], {
        slots: [0, 2],
        selfShield: 10,
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
    30,
    4,
    '戴着生锈铁锅当头盔的矮小绿皮杂兵，手举绑骨长矛借群势乱刺。',
    [
      move('乱矛捅刺', '戳击目标造成8伤害、1流血。', [hit(8), buff('bleed', 1)]),
      move('铁锅抱头', '获得8护盾并轻敲中位5伤害。', [hit(5)], { slot: 1, selfShield: 8 }),
    ],
  ),
  commonMob(
    'goblinSlinger',
    '哥布林投石手',
    '哥布林',
    'pebble-shards',
    '#849c52',
    28,
    4,
    '躲在同伴身后甩动皮绳投石的狡猾哥布林，专挑低防目标砸石击晕。',
    [
      move('尖石投掷', '造成8伤害、1易伤。', [hit(8), buff('vulnerable', 1)]),
      move('散石乱飞', '向三格丢出碎石各4伤害。', [hit(4)], { slots: [0, 1, 2] }),
    ],
  ),
  commonMob(
    'goblinShaman',
    '哥布林骨杖祭司',
    '哥布林',
    'specter-wail',
    '#629c78',
    32,
    3,
    '戴着野兽头骨面具、手持铃铛骨杖的部落巫医，擅长熬制草药毒汤救护部下。',
    [
      move('苦毒咒烟', '喷吐紫绿诅咒造成6伤害、2中毒。', [hit(6), buff('poison', 2)]),
      move('祖灵药膏', '为生命最低友方回复10生命、施加2层再生。', [
        heal(10, 'lowestAlly'),
        buff('regen', 2, 'lowestAlly'),
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
    33,
    4,
    '背着冒火星黑火药桶与大号引信剪的狂热哥布林，冲上去就是一记烈焰爆破。',
    [
      move('火药桶炸击', '对左中位各8伤害、1虚弱。', [hit(8), buff('weak', 1)], { slots: [0, 1] }),
      move('火花乱抛', '造成10伤害、2流血。', [hit(10), buff('bleed', 2)]),
    ],
  ),
  commonMob(
    'goblinWolfRider',
    '哥布林座狼骑手',
    '精英 / 哥布林',
    'claw-pounce',
    '#7c8e58',
    70,
    5,
    '跨坐凶暴灰背座狼的部落斥候精锐，座狼扑咬配合骑手短矛形成高机动连击。',
    [
      move('狼骑突袭', '扑咬伤者造成14伤害、3流血。', [hit(14), buff('bleed', 3)]),
      move('野狼横撞', '撞击三格前场各8伤害、1易伤。', [hit(8), buff('vulnerable', 1)], {
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
    42,
    4,
    '从往生界裂隙爬出的低阶四足蚀鳞，背生锯齿黑紫骨刺，受创时裂纹微亮。',
    [
      move('黑棘爪撕', '造成10伤害、2流血。', [hit(10), buff('bleed', 2)]),
      move('裂隙俯冲', '对左中位各7伤害。', [hit(7)], { slots: [0, 1] }),
    ],
  ),
  commonMob(
    'erosionSpitter',
    '蚀鳞喷吐者',
    '蚀鳞裂隙',
    'ooze-splash',
    '#7a5288',
    38,
    3,
    '颈侧膨大毒囊翻涌黑紫浊液的蚀鳞怪，从远处喷吐强酸毒液腐蚀甲胄。',
    [
      move('蚀骨酸液', '造成8伤害、3中毒、1易伤。', [
        hit(8),
        buff('poison', 3),
        buff('vulnerable', 1),
      ]),
      move('腐雾弥散', '全体前场各5伤害、1虚弱。', [hit(5), buff('weak', 1)], { slots: [0, 1, 2] }),
    ],
  ),
  commonMob(
    'erosionHound',
    '裂隙蚀鳞猎犬',
    '蚀鳞裂隙',
    'patrol-pounce',
    '#8c4862',
    40,
    5,
    '失去双眼的无面黑鳞猎犬，仅靠感知乙太波动撕咬伤痕累累的冒险者。',
    [
      move('蚀脉狂咬', '对伤者造成11伤害、3流血。', [hit(11), buff('bleed', 3)]),
      move('影鳞穿梭', '造成9伤害并获得6护盾。', [hit(9)], { selfShield: 6 }),
    ],
    { tactic: { target: 'wounded' } },
  ),
  commonMob(
    'erosionWing',
    '蚀鳞掠空蝠',
    '蚀鳞裂隙',
    'storm-dive',
    '#6e5a8c',
    36,
    5,
    '生有紫黑色骨翼膜的白骨飞兽，围绕战阵上空高速盘旋骚扰两翼。',
    [
      move('暮翼斩击', '掠击两侧各8伤害、1虚弱。', [hit(8), buff('weak', 1)], { slots: [0, 2] }),
      move('黑羽俯刺', '俯冲造成9伤害，自身获1层飞行。', [hit(9), buff('flying', 1, 'self')]),
    ],
  ),
  commonMob(
    'erosionJuggernaut',
    '蚀鳞重甲狂兽',
    '精英 / 蚀鳞裂隙',
    'warden-fist',
    '#5d4c78',
    88,
    2,
    '浑身覆盖层层叠叠黑耀石重鳞的半人形巨兽，双臂化作锯齿骨刃与重盾。',
    [
      move('黑鳞碎阵锤', '猛击中位造成17伤害、1禁锢。', [hit(17), buff('bind', 1)], { slot: 1 }),
      move('硬鳞壁垒', '自身获15护盾与1层铁皮，顺势震伤两侧各8伤害。', [hit(8)], {
        slots: [0, 2],
        selfShield: 15,
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
    158,
    4,
    '统领多支黑林劫匪与城郊暗桩的传奇刺客首领，披着黑羽大氅，双持涂毒细剑与暗藏火铳。',
    [
      move('乌羽双刺', '锁定薄盾位置两翼连刺各11伤害、2流血。', [hit(11), buff('bleed', 2)], {
        slots: [0, 2],
      }),
      move('黑鸦暗铳', '对中位造成16伤害、2易伤。', [hit(16), buff('vulnerable', 2)], { slot: 1 }),
    ],
    [
      move('夜枭连斩风暴', '横扫三格前场各11伤害、3流血。', [hit(11), buff('bleed', 3)], {
        slots: [0, 1, 2],
      }),
      move('处决匕影', '对伤者发动必杀连刺22伤害、2虚弱。', [hit(22), buff('weak', 2)], {
        slot: 1,
      }),
    ],
  ),
  commonBoss(
    'goblinKingGorg',
    '碎铁哥布林王',
    '哥布林',
    'warden-fist',
    '#7ca24c',
    165,
    3,
    '把废弃攻城盾与齿轮战锤焊接在身上的巨型哥布林领主，戴着镀金王冠统率群落冲锋。',
    [
      move('废铁重砸', '砸击中位造成15伤害、1禁锢。', [hit(15), buff('bind', 1)], { slot: 1 }),
      move('王权号角', '自身获得14护盾与1力量，全体前场各8伤害。', [hit(8)], {
        slots: [0, 1, 2],
        selfShield: 14,
        selfBuff: { strength: 1 },
      }),
    ],
    [
      move('碎铁暴走车轮', '践踏全前场各12伤害、2易伤。', [hit(12), buff('vulnerable', 2)], {
        slots: [0, 1, 2],
      }),
      move('狼王夺命锤', '重砸中位24伤害，自身获10护盾。', [hit(24)], { slot: 1, selfShield: 10 }),
    ],
    { buffs: { iron: 1 } },
  ),
  commonBoss(
    'erosionRiftTyrant',
    '裂隙蚀鳞暴君',
    '蚀鳞裂隙',
    'void-collapse',
    '#7c428f',
    188,
    3,
    '高阶蚀鳞聚合诞生的灾厄暴君，背后展开三对紫黑晶体棘翼，不断向现世喷吐浊暗瘴气。',
    [
      move('暗瘴潮汐', '全前场10伤害、3中毒。', [hit(10), buff('poison', 3)], {
        slots: [0, 1, 2],
      }),
      move('裂渊晶爪', '撕裂中位18伤害、3流血。', [hit(18), buff('bleed', 3)], { slot: 1 }),
    ],
    [
      move(
        '虚空破界波',
        '全前场13伤害、2虚弱、2易伤。',
        [hit(13), buff('weak', 2), buff('vulnerable', 2)],
        { slots: [0, 1, 2] },
      ),
      move('蚀脉虹吸', '猛击中位25伤害并汲取14生命。', [hit(25), heal(14)], { slot: 1 }),
    ],
    { buffs: { iron: 1 } },
  ),
];
