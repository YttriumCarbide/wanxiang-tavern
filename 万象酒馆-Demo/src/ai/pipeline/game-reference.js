import { HEROES, BUFFS } from '../../data.js';
import { PORTRAIT_TEMPLATES } from '../../content/portrait-templates.js';
import { TRIGGER_EVENTS, TRIGGER_TARGETS, POSITIVE_BUFFS } from '../../triggers.js';

/** A classified design reference, derived from the shipped game rather than scattered prose. */
export function characterGameReference() {
  return {
    displayNotation: '所有技能说明用小写hp/sp；v4仅设计机制，基础值与效果数字由程序编译。',
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
      note: '只提供战斗职业与色板参考；默认立绘按weapon与setting.gender选择，不绑定官设身份',
    })),
    defaultPortraits: PORTRAIT_TEMPLATES,
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
      effects: '1~2项效果，写type/power，不填value；opposite对位为空时攻击落空，不寻找其他敌人。',
    },
    activeEffects: {
      count: [1, 2],
      damage: '对目标造成伤害，power选择low/standard/high；2AP程序给予显著更高伤害',
      heal: '回复目标hp，选择power档位',
      shield: '目标获得护盾，选择power档位',
      selfHeal: '施术者回复hp，选择power档位',
      selfMana: '施术者回复sp，选择power档位',
      buff: '选择buff与power，层数由程序决定；禁锢、敏捷、超限每次1层',
      cleanse: 'buffs数组列出需移除的状态ID',
    },
    statuses: Object.entries(BUFFS).map(([id, value]) => ({
      id,
      name: value.name,
      meaning: value.text,
      category: POSITIVE_BUFFS.includes(id) ? '增益' : '减益',
      note:
        id === 'slow'
          ? '只用于敌方，影响时间轴顺序'
          : '层数和结算由代码负责，不自行发明持续回合或触发条件',
    })),
    passives: {
      locations: ['前场', '后场', '全战斗', '战斗外'],
      unifiedRules: {
        events: TRIGGER_EVENTS,
        targets: TRIGGER_TARGETS,
        continuous:
          'mode=continuous只支持haste,strength,guard,iron持续光环；再生必须使用有次数限制的事件施加，按层衰减。',
        event:
          'mode=event，写event、scope与limit档位；scope为round/battle/expedition，limit为once/few/regular。',
        conditions:
          '每条规则最多一个条件；subject为self或target，默认self；front/rear/hasPositive/hasNegative/hasBuff/noBuff/hasShield，hpBelow/hpAbove/mpBelow/mpAbove的value为百分比，buff条件带buff/value，mark条件value为1~3。',
        recursion:
          '装备和被动产生的效果不会继续触发事件。每角色最多一种专属标记、上限3，每场清空。',
      },
      note: 'v4只用kind:passive/rules；不写旧passive/location/value格式。被动名称留在人设，实际说明由程序按编译规则生成。',
    },
    designRules: [
      '先按职业、性格、经历确定攻防与技能主题，再选已实现的效果和合理数值。',
      '两个技能槽均可选择主动或被动，普通攻击独立，顺序对应setting.skills；所有名称只在setting生成，data只选择机制、AP与强弱档位。',
      '不生成抽牌、额外AP、眩晕、复活、任意召唤、概率或自定义脚本。',
      'AI不填写实际基础数值；设定层主动写动作，被动写实际条件与效果；程序根据设计生成准确技能说明。',
    ],
  };
}
