/** First summoned companion; the slot ID remains stable across saved parties. */
export const CHANGJING_YUEXI = {
  id: 'aegis',
  name: '长景月汐',
  title: '星月剑士',
  weapon: 'sword',
  portrait: 'changjing-yuexi.png',
  color: '#b8b4e7',
  hp: 48,
  mp: 18,
  attack: 6,
  attackName: '霜月斩',
  limit: 1,
  skills: [
    {
      id: 'bastion',
      name: '剑华——满月',
      ap: 1,
      mp: 3,
      target: 'enemy',
      text: '以大幅横斩攻击一名敌人，造成10伤害并附加2层易伤。',
      effects: [
        { type: 'damage', value: 10 },
        { type: 'buff', buff: 'vulnerable', value: 2 },
      ],
    },
    {
      id: 'meteor-stance',
      name: '剑姿——流星',
      ap: 1,
      mp: 7,
      target: 'self',
      text: '获得2层力量、1层铁皮、1层敏捷；本场普通攻击额外攻击一次，重复施放不增加额外攻击次数。',
      effects: [
        { type: 'buff', buff: 'strength', value: 2 },
        { type: 'buff', buff: 'iron', value: 1 },
        { type: 'buff', buff: 'haste', value: 1 },
        { type: 'buff', buff: 'meteor', value: 1 },
      ],
    },
  ],
  entrySkill: {
    id: 'falling-starlight',
    name: '霜月·星陨穿刺',
    text: '换入时对正对位敌人造成10点伤害并施加2层易伤。',
    target: 'opposite',
    effects: [
      { type: 'damage', value: 10 },
      { type: 'buff', buff: 'vulnerable', value: 2 },
    ],
  },
};

export const CHANGJING_YUEXI_SETTING = {
  name: '长景月汐',
  gender: '女',
  age: '成年',
  appearance:
    '身穿华丽而惹火的晚礼服长裙，皮肤白皙，佩戴弯月形白玉发卡。行走时，脚下与身后会有星座、星图般的细光短暂浮现。礼服的华丽与她想立刻踏上旅途的神情相映。她会好奇地打量陌生陈设，转身时裙摆与星光一同轻轻散开，剑并不总要握在手里。随身长剑名为“霜月”，剑身刻有密集星辰纹路，是她的伴生之剑；它可随时化作星图消散，也能让她从虚空中重新抓出。',

  personality:
    '性格开朗，喜欢游山玩水与激烈战斗，讨厌各种皇室礼仪，对新奇事物十分感兴趣。虽然已经成年，却完全不了解男女之事，对相关话题有强烈好奇心；这种无知不影响她作为星月剑士的判断和战斗能力。相比端坐宫廷，她更愿意主动探索陌生世界，和同行者分享发现。她说起山川、遗迹或新鲜见闻时兴致很高，谈到层层礼节却会失去耐心；她向往亲自经历的自由，并不要求同伴继续以宫廷方式对待自己。',
  history:
    '她出生于西方魔法世界的一个王国，降生之日引起星月共鸣。国王将她视作王国的珍宝，严密保护，她的日常被皇室礼仪课程填满。可她从小的梦想就是带上伴生剑霜月离开皇宫，亲自游历山川，经历真正的冒险。一天，舞会刚刚结束，她再次尝试趁乱逃出皇宫；就在行踪被发现时，一阵白光闪过。眼前不再是宫殿，她已经站在万象酒馆的召唤之门前。她终于离开了熟悉的皇室生活，面对眼前的陌生天地，冒险的愿望依旧强烈。',
  attack: {
    name: '霜月斩',
    description:
      '从虚空抓出刻满星纹的霜月，借短暂浮现的星图找准敌人的破绽，以月光凝成的锋芒完成一次利落斩击。',
  },
  skills: [
    {
      name: '剑华——满月',
      description:
        '舒展身体完成大面积横斩，剑锋在一个目标身前划出满月般的弧线，身后留下大片星图。星辉标记防御薄弱处；这一剑的战斗目标仍为单体。',
    },
    {
      name: '剑姿——流星',
      description:
        '将星辰之力加持自身，让步伐与出剑衔接得更轻快敏捷。细光顺着裙摆与脚下星图移动，为接下来的连续行动留出余地。',
    },
  ],
  entrySkill: {
    name: '霜月·星陨穿刺',
    description:
      '踏入前场的一瞬展开夜空星图，伴生剑霜月于虚空划出星陨剑芒直穿正对位敌方单位，造成10点伤害并附加1层易伤。',
  },
};
