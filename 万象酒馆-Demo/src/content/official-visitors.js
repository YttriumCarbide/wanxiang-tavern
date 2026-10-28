export const OFFICIAL_VISITORS = {
  'luo-gongxu': {
    combat: {
      id: 'luo-gongxu',
      name: '骆公绪',
      title: '持节将军',
      hp: 60,
      mp: 23,
      attack: 7,
      attackName: '节钺刺击',
      limit: 1,
      weapon: 'sword',
      portrait: 'luo-gongxu-v1.png',
      color: '#a8c6aa',
      buffs: {},
      skills: [
        {
          id: 'junlue',
          name: '均略',
          ap: 1,
          mp: 11,
          target: 'enemy',
          text: '造成9伤害，目标下次攻击只能指向自己；目标下次获得正面状态或护盾时，自己也获得同等增益。',
          mechanic: 'junlue',
          effects: [{ type: 'damage', value: 9 }],
        },
        {
          id: 'yiming',
          name: '毅明',
          passive: true,
          location: '全战斗',
          mechanic: 'luo-counter',
          text: '成为敌人攻击目标并结算后，对其进行一次普通攻击，回复等同实际hp伤害的sp。若以此回满sp，本场不再触发。',
        },
      ],
      entrySkill: {
        id: 'luo-entry',
        name: '持节立阵',
        target: 'self',
        mechanic: 'luo-entry',
        text: '获得等于普攻基础伤害的护盾，下次普通攻击伤害翻倍；毅明反击也会消耗此效果。',
        effects: [{ type: 'shield', value: 7 }],
      },
    },
    setting: {
      name: '骆公绪',
      gender: '男',
      age: '28',
      appearance: '身着绿白中式袍甲，衣甲整洁而无夸饰，手持节钺，腰间系着记载军需与民情的简册。',

      personality:
        '仁爱正直，出身世家而挂念百姓之苦。待人谦和有礼，先听同伴意见再补充看法；说话简明稳重，常先问伤员与百姓是否安置妥当。决策优先降低损失、取得稳定收益，处理匪患与山越诸部时主张招降而非屠杀。',
      history:
        '来自长安之乱未曾发生、大汉后来重新一统的古武世界。驻扎南方期间事必躬亲，以安抚和补给治理地方，战力虽不及北境名将，却是足以托付退路的坚实后卫。',
      attack: { name: '节钺刺击', description: '横节护身，待对手露出空隙，以节钺前端直刺破绽。' },
      skills: [
        {
          name: '均略',
          description:
            '挥钺牵制敌方，将它的下一次攻势引向自己，并观察其整备动作，取得同样的防护或强化。',
        },
        {
          name: '毅明',
          description:
            '承受敌人指向自己的攻击后，以普通攻击反击并按实际伤害回复sp；因此回满sp后，本场停止反击。',
        },
      ],
      entrySkill: {
        name: '持节立阵',
        description: '以节钺架起护势，获得等于普攻伤害的护盾，并强化下一次普通攻击。',
      },
    },
  },
  'silica-laps': {
    combat: {
      id: 'silica-laps',
      name: '西莉卡·梵·拉普斯',
      title: '灵核收割者／美食家',
      hp: 44,
      mp: 26,
      attack: 6,
      attackName: '餐前微调·银刃破空',
      limit: 1,
      weapon: 'sword',
      portrait: 'silica-laps-v2.png',
      color: '#cfa9dc',
      buffs: {},
      skills: [
        {
          id: 'soul-banquet',
          name: '同袍之奉·晨间摘果',
          ap: 2,
          mp: 10,
          target: 'ally',
          mechanic: 'soul-banquet',
          text: '选择一名存活的前场队友，抽取其50%的hp/sp上限、普攻和技能伤害，自身获得对应属性及其随机一个主动技能。本次探索限一次，不能选择自己；不改变AP、行动次数或buff。',
          effects: [],
        },
        {
          id: 'soul-revive',
          name: '绝处逢生·重构恢复',
          mechanic: 'soul-revive',
          ap: 2,
          mp: 12,
          target: 'ally',
          text: '复活一名濒死队友，清除其状态并回满hp/sp；该队友本次探索随机失去一个技能，hp/sp上限、普攻和技能伤害降低20%。灵核已被抽取或已支付过此代价的队友不能成为目标。',
          effects: [{ type: 'heal', value: 1 }],
        },
      ],
      entrySkill: {
        id: 'silica-entry',
        name: '餐前凝魄',
        target: 'self',
        text: '自身获得6护盾，回复3sp。',
        effects: [
          { type: 'shield', value: 6 },
          { type: 'mana', value: 3 },
        ],
      },
    },
    setting: {
      name: '西莉卡·梵·拉普斯',
      gender: '女',
      age: '140',
      appearance:
        '淡紫近粉的波浪长发，头生末端微卷的半透明恶魔角，角上泛着微光。粉白同心圆瞳孔，穿轻便的深色礼服式工作装，腰侧悬着银制小刀与封存灵核投影的水晶器皿。',

      personality:
        '神经质、自私而乐天，说话娇柔有礼，喜欢用味道评价魔力、战术和记忆；常先关心新力量的口感，再追问代价由谁支付。越危急越兴奋，但她的力量交易不涉及性或身体器官。',
      history:
        '来自泛生界，当地灵核投影能够暂时剥离、重构并补足濒死者的生命。她曾为族内搜集不同的魔力样本，尝遍熟悉的力量后走向界外，把旅途当作一场漫长的品鉴。',
      attack: {
        name: '餐前微调·银刃破空',
        description: '银刀在指间翻转，划出短促弧线，切断敌方暴露的能量节点。',
      },
      skills: [
        {
          name: '同袍之奉·晨间摘果',
          description:
            '主动选择一名前场同伴抽取灵核投影，以自身承载其一半属性与随机一份主动技能记忆，代价和收获只在本次探索保留。',
        },
        {
          name: '绝处逢生·重构恢复',
          description:
            '以灵核重构濒死同伴，恢复资源，但对方要以部分属性和一个技能抵偿，本次探索不能再次支付同一代价。',
        },
      ],
      entrySkill: { name: '餐前凝魄', description: '用残存灵光凝成护罩，将逸散能量重新收拢。' },
    },
  },
};
