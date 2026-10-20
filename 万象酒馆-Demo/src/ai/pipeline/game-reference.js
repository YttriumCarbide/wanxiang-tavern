import { HEROES, BUFFS } from '../../data.js';
import { TRIGGER_EVENTS, TRIGGER_TARGETS, POSITIVE_BUFFS } from '../../triggers.js';

/** A classified design reference, derived from the shipped game rather than scattered prose. */
export function characterGameReference() {
  return {
    resources: {
      hp: { range: [20, 80], meaning: '生命上限，不能因职业强度把所有属性填满' },
      mp: { range: [8, 40], meaning: '蓝量上限，战斗和战间不自动补满' },
      attack: { range: [3, 14], meaning: '普攻基础伤害' },
      limit: { values: [1, 2], meaning: '每回合角色可行动次数' },
    },
    actionEconomy: {
      openingAP: 1,
      roundAP: 3,
      exchangeCostAP: 1,
      basicAttack: { ap: 1, mp: 0, target: 'enemy' },
      skillAP: [1, 2],
      skillMP: [0, 10],
      skillHP: {
        optional: true,
        range: [1, 20],
        meaning: '生命消耗不受护盾或铁皮减免，生命必须严格大于消耗',
      },
      twoAP: '占据连续两个我方时间格，不是一次多出两个行动',
      targets: {
        enemy: '一个敌人',
        ally: '一个存活队友',
        self: '自己',
        allAllies: '全部存活队友',
        allEnemies: '全部存活敌人',
      },
    },
    animation: {
      sword: '近战剑类演出，可承载合理的盾撞或重装冲击设定',
      bow: '搭箭、射击的弓类演出',
      staff: '法杖或媒介施法演出',
    },
    appearanceTemplates: HEROES.map((hero) => ({
      id: hero.id,
      title: hero.title,
      weapon: hero.weapon,
      note: '仅选当前立绘与色板，不强迫原世界职业相同',
    })),
    entrySkill: {
      rule: '每个角色都必须有且仅有一个专属入场技（必填，包括主角与召唤角色）',
      meaning: '在后排待满一个整回合后换入前排自动触发，不消耗额外AP或行动点',
      targets: {
        opposite: '正对位的敌方单位（推荐剑士/刺客精准破阵打击）',
        lowestEnemy: '生命最低的敌方单位（推荐游侠/刺客残血斩杀）',
        lowestAlly: '生命比例最低的友方单位（推荐医护战地急救）',
        allEnemies: '所有敌方单位（大范围压制、虚弱或迟缓）',
        allAllies: '所有友方单位（全员护盾或全员回血）',
        self: '自己（换入时自身强化或获得护盾）',
      },
      effects: '1~3项效果（damage/heal/shield/buff/selfShield等）',
    },
    activeEffects: {
      count: [1, 4],
      damage: '对目标造成基础伤害，value整数1～32',
      heal: '回复目标生命，value整数1～32',
      shield: '目标获得护盾，value整数1～32',
      selfHeal: '施术者自己回复生命，value整数1～32',
      selfMana: '施术者自己回复法力，value整数1～32，不超过法力上限',
      buff: '给目标添加指定buff层数，value整数1～6',
      cleanse: 'buffs数组列出需移除的状态ID',
    },
    statuses: Object.entries(BUFFS).map(([id, value]) => ({
      id,
      name: value.name,
      meaning: value.text,
      category: ['strength', 'guard', 'regen', 'iron'].includes(id) ? '增益' : '减益',
      note:
        id === 'slow'
          ? '只用于敌方，影响时间轴顺序'
          : '层数和结算由代码负责，不自行发明持续回合或触发条件',
    })),
    passives: {
      unifiedRules: {
        format: {
          passive: true,
          text: '实际效果',
          rules: [
            {
              mode: 'event',
              event: 'damageTaken',
              conditions: [{ type: 'front' }],
              target: 'self',
              effects: [{ type: 'heal', value: 2 }],
              limit: 3,
            },
          ],
        },
        events: TRIGGER_EVENTS,
        targets: TRIGGER_TARGETS,
        continuous:
          'mode=continuous，条件满足时提供正面状态光环，不写event和limit；支持' +
          POSITIVE_BUFFS.join(','),
        conditions:
          '全部AND；front/rear/hasPositive/hasNegative/hasBuff/noBuff/hasShield；hpBelow/hpAbove/mpBelow/mpAbove带value百分比；roundAtLeast带value；buff带buff/value。判断当前实际状态，不将光环再次当成条件。',
        recursion:
          '装备和被动产生的伤害、治疗、法力及buff都不会再次触发事件；单趟limit跨战斗共享，最多50次。',
      },
      locations: ['前场', '后场', '全战斗', '战斗外'],
      chooseOneEffectOnly: [
        {
          fields: ['buff', 'value'],
          allowedBuffs: ['strength', 'guard', 'iron'],
          value: [1, 3],
          locations: ['前场', '后场', '全战斗'],
          meaning: '位置满足时本人持续获得对应增益',
        },
        {
          fields: ['teamFrontBuff', 'value'],
          allowedBuffs: ['strength', 'guard', 'iron'],
          value: [1, 2],
          locations: ['前场', '后场', '全战斗'],
          meaning: '施术者位置满足时，给我方前场提供光环',
        },
        {
          fields: ['endHeal'],
          value: [1, 3],
          location: '后场',
          meaning: '正常回合末帮助生命比例最低且仍存活的受伤队友',
        },
        {
          fields: ['bonusMp'],
          value: [1, 6],
          location: '战斗外',
          meaning: '整备时增加本人的蓝量上限，战斗中不回蓝',
        },
      ],
      noActiveFields: ['ap', 'mp', 'target', 'effects'],
      note: '新设计优先使用unifiedRules；旧四种被动仍兼容。持续光环支持正面状态，负面状态只能通过事件施加。',
    },
    designRules: [
      '先按职业、性格、经历确定攻防与技能主题，再选已实现的效果和合理数值。',
      '两个技能槽至少一个主动，顺序对应setting.skills；所有名称只在setting生成，data只填写数值与可执行规则。',
      '不生成抽牌、额外AP、眩晕、复活、任意召唤、概率或自定义脚本。',
      '数值只存在数据层，设定层动作描写不写AP、蓝量、伤害与状态层数。',
    ],
  };
}
