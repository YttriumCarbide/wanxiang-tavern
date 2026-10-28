import { defaultProtagonist } from './content/qingyuan.js';
import { EDITH } from './content/edith.js';
import { PANDORA } from './content/pandora.js';
import { CHANGJING_YUEXI } from './content/changjing-yuexi.js';
import { POSITIVE_BUFFS } from './triggers.js';
import { generatedStatusValue } from './status-rules.js';
import { finalSkillText, finalPassiveText } from './skill-text.js';

const RARITY_WEIGHTS = Object.freeze({ common: 55, rare: 30, epic: 12, legendary: 3 });
const COMPLEXITIES = Object.freeze([
  { level: 1, name: '直接效果', weight: 5 },
  { level: 2, name: '复合效果', weight: 30 },
  { level: 3, name: '条件强化', weight: 30 },
  { level: 4, name: '事件触发', weight: 22 },
  { level: 5, name: '积累与消耗', weight: 9 },
  { level: 6, name: '轻量联动', weight: 4 },
]);

function hash(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
function roll(seed, key, minimum, maximum) {
  return minimum + (hash(`${seed}:${key}`) % (maximum - minimum + 1));
}
function weighted(seed, key, entries) {
  let value = roll(seed, key, 0, entries.reduce((sum, [, weight]) => sum + weight, 0) - 1);
  return entries.find(([, weight]) => (value -= weight) < 0)[0];
}

/** One set of permissions for the request facts, narrowed output schema and compiler. */
export function characterDesignLimits(complexity) {
  return {
    effectsPerSkill: complexity === 1 ? 1 : 2,
    conditionsPerRule: complexity >= 3 ? 1 : 0,
    rulesPerPassive: 1,
    passiveModes: complexity >= 4 ? ['continuous', 'event'] : ['continuous'],
    conditionalEffects: complexity >= 3,
    markTypes: complexity >= 5 ? 1 : 0,
    maxMark: 3,
  };
}

export function characterConstraintText(plan) {
  const limits = characterDesignLimits(plan.complexity);
  return [
    `当前机制复杂度：第${plan.complexity}档「${plan.complexityName}」。这是已确定的上限，不能自行提升，也不要求用满。`,
    `每技能/入场技最多${limits.effectsPerSkill}项效果；每个被动最多1条规则；每条规则最多${limits.conditionsPerRule}个条件。`,
    limits.passiveModes.includes('event')
      ? '允许continuous持续光环和event事件被动；event必须同时填写event、scope、limit。'
      : '本次禁止event事件被动，rules[].mode只能是continuous，不得填写event、scope、limit。攻击后、受伤时、回合开始/结束时触发全部禁止，包括「回合结束且在前场获得护盾」。',
    limits.conditionalEffects
      ? '允许一个条件判断；「处于前场」是条件，「回合结束时」是事件，前场条件不能让低于4档的角色获得事件触发权限。'
      : '本次conditions必须为空数组，不得使用when条件强化。',
    'continuous仅允许力量strength、铁皮iron、守势guard、敏捷haste正面状态光环；不能持续造成伤害、回血、回sp、获得护盾或授予再生。护盾shield不是铁皮iron。',
    limits.markTypes
      ? '专属标记最多一种、最多3层，积累与消耗必须符合本档结构。'
      : '本次禁止mark、basicAttackMark、perMark、consumeMark及mark条件。',
  ].join('\n');
}

/** Authored base definitions only; no save, level, equipment or generated guest participates. */
export function officialStatReferences() {
  return [defaultProtagonist().combat, EDITH, CHANGJING_YUEXI, PANDORA].map((hero) => ({
    name: hero.name,
    hp: hero.hp,
    sp: hero.mp,
    attack: hero.attack,
    actions: hero.limit,
    skills: hero.skills
      .filter((skill) => !skill.passive)
      .map((skill) => ({
        name: skill.name,
        ap: skill.ap,
        sp: skill.mp,
        ...(skill.hp ? { hpCost: skill.hp } : {}),
        target: skill.target,
        effects: structuredClone(skill.effects),
      })),
  }));
}

export function characterGenerationPlan(input = {}) {
  const seed = hash(input.rollId || input.brief || 'wanxiang-character');
  const rarity = Object.hasOwn(RARITY_WEIGHTS, input.rarity)
    ? input.rarity
    : weighted(seed, 'rarity', Object.entries(RARITY_WEIGHTS));
  const tier = Object.keys(RARITY_WEIGHTS).indexOf(rarity);
  const complexity =
    Number.isInteger(input.complexity) && input.complexity >= 1 && input.complexity <= 6
      ? input.complexity
      : weighted(
          seed,
          'complexity',
          COMPLEXITIES.map(({ level, weight }) => [level, weight]),
        );
  const protagonist = input.purpose === 'protagonist';
  const limit = protagonist || roll(seed, 'actions', 1, 100) <= [8, 18, 32, 50][tier] ? 2 : 1;
  const attack = protagonist
    ? roll(seed, 'attack', 9, 11)
    : roll(seed, 'attack', 6 + Math.floor(tier / 2), 8 + tier);
  return {
    version: 1,
    seed,
    rarity,
    protagonist,
    complexity,
    complexityName: COMPLEXITIES[complexity - 1].name,
    complexityProbabilities: Object.fromEntries(
      COMPLEXITIES.map(({ level, weight }) => [level, weight]),
    ),
    fixed: { attack, limit },
    skillKindWeights: { active: 80, passive: 20 },
    preferredSkillKinds: [0, 1].map((slot) =>
      roll(seed, 'skill-kind-' + slot, 1, 100) <= 80 ? 'active' : 'passive',
    ),
    activeDesignFocus: [
      '进攻和自身续航的取舍，用独立效果目标区分伤害对象与回复对象',
      '保护或援助队友，并选择自己承担费用或获得后续收益',
      '单体重击与群体压制形成不同用途，而不是单纯改伤害数值',
      '以自身hp/sp消耗、低费高费构成实际资源决策',
      ...(complexity >= 3
        ? [
            '根据自身或目标的状态、护盾、资源比例选择触发强化',
            '前后场条件或回合条件使同一技能有不同使用时机',
          ]
        : []),
      ...(complexity >= 5 ? ['围绕唯一标记安排积累与消耗，不能另造资源系统'] : []),
    ][roll(seed, 'design-focus', 0, complexity >= 5 ? 6 : complexity >= 3 ? 5 : 3)],
    probabilities: RARITY_WEIGHTS,
    profiles: {
      balanced: { hp: [46 + tier * 3, 54 + tier * 3], sp: [20 + tier * 2, 26 + tier * 2] },
      durable: { hp: [54 + tier * 3, 62 + tier * 3], sp: [18 + tier, 22 + tier] },
      caster: { hp: [40 + tier * 2, 48 + tier * 2], sp: [28 + tier * 2, 34 + tier * 2] },
      striker: { hp: [42 + tier * 2, 50 + tier * 2], sp: [18 + tier * 2, 24 + tier * 2] },
      support: { hp: [42 + tier * 2, 50 + tier * 2], sp: [26 + tier * 2, 32 + tier * 2] },
    },
    limits: characterDesignLimits(complexity),
    costBands: { low: [5, 7], standard: [8, 11], high: [12, 15] },
    officialReferences: officialStatReferences(),
    guidance:
      'AI只选定位、主动/被动、1或2AP、费用档位和效果强弱档位，不填写具体hp/mp/attack/limit或效果value。程序使用固定种子编译，预览、刷新与本地重校验不重抽。2AP获得显著更高效果预算；群体、附加状态、强控制与被动占用预算。',
  };
}

function assertDesign(value, message) {
  if (!value) throw Error('角色机制设计不符：' + message);
}
function validateComplexity(data, plan) {
  const abilities = [...data.skills, data.entrySkill];
  const marked = !!data.mark || data.basicAttackMark;
  assertDesign(!marked || (data.mark && plan.complexity >= 5), '本档不允许专属标记');
  for (const ability of abilities) {
    const lists =
      ability.kind === 'passive' ? ability.rules.map((rule) => rule.effects) : [ability.effects];
    if (ability.kind === 'active' && ability.ap === 2)
      assertDesign(
        ability.effects.some(
          (effect) =>
            ['damage', 'heal', 'shield', 'selfHeal', 'selfMana'].includes(effect.type) ||
            (effect.type === 'buff' && !['bind', 'haste', 'overload'].includes(effect.buff)),
        ),
        '2AP技能必须包含可提高数值的效果，不能只重复同强度禁锢、敏捷、超限或净化',
      );
    if (ability.kind === 'passive') {
      for (const rule of ability.rules) {
        assertDesign(rule.conditions.length <= 1, '每条规则最多一个条件');
        assertDesign(!rule.conditions.length || plan.complexity >= 3, '本档不允许条件');
        if (rule.conditions.some((condition) => condition.type === 'mark'))
          assertDesign(data.mark && plan.complexity >= 5, '标记条件需要本角色专属标记');
        assertDesign(
          plan.limits.passiveModes.includes(rule.mode),
          `本档不允许事件被动：当前第${plan.complexity}档「${plan.complexityName}」，事件被动需要第4档起；请改用本档允许的主动效果或持续正面状态光环，并同步修改技能描述`,
        );
        if (rule.mode === 'event')
          assertDesign(rule.event && rule.limit && rule.scope, '事件被动必须指定事件、次数和范围');
        assertDesign(
          !rule.conditions.length || !rule.effects.some((effect) => effect.when),
          '每条规则最多一个条件，不能再嵌套效果条件',
        );
        assertDesign(
          rule.event !== 'kill' ||
            !rule.conditions.some((condition) => condition.subject === 'target'),
          '击杀后目标已濒死，不能再判断目标条件',
        );
      }
    }
    for (const list of lists) {
      assertDesign(list.length <= plan.limits.effectsPerSkill, '效果数量超过本档上限');
      for (const effect of list) {
        assertDesign(!effect.when || plan.complexity >= 3, '本档不允许条件强化');
        const usesMark =
          effect.type === 'mark' ||
          effect.perMark ||
          effect.consumeMark ||
          effect.when?.type === 'mark';
        assertDesign(
          !usesMark || (data.mark && plan.complexity >= 5),
          '标记效果需要本角色专属标记',
        );
        assertDesign(!effect.consumeMark || effect.perMark, '消耗标记必须用于本次标记强化');
        assertDesign(
          !effect.perMark || ['damage', 'heal', 'shield'].includes(effect.type),
          '标记只强化伤害、治疗或护盾',
        );
      }
    }
  }
  if (plan.complexity === 5 && marked) {
    const markAbilities = abilities.filter(
      (ability) =>
        ability.rules?.some((rule) =>
          rule.conditions.some((condition) => condition.type === 'mark'),
        ) ||
        (ability.effects || ability.rules?.flatMap((rule) => rule.effects) || []).some(
          (effect) => effect.type === 'mark' || effect.perMark || effect.when?.type === 'mark',
        ),
    );
    assertDesign(
      markAbilities.length <= 1,
      '第五档只允许普攻积累与一个技能消耗；跨技能联动需要第六档',
    );
  }
  if (marked) {
    const all = abilities.flatMap(
      (ability) => ability.effects || ability.rules?.flatMap((rule) => rule.effects) || [],
    );
    assertDesign(
      data.basicAttackMark || all.some((effect) => effect.type === 'mark'),
      '标记必须有积累入口',
    );
    assertDesign(
      all.some((effect) => effect.perMark || effect.when?.type === 'mark') ||
        abilities.some((ability) =>
          ability.rules?.some((rule) =>
            rule.conditions.some((condition) => condition.type === 'mark'),
          ),
        ),
      '标记必须参与技能效果',
    );
  }
}

/** Compile one bounded design into the same immutable combat definitions as official characters. */
export function compileCharacterDesign(raw, input = {}) {
  if (raw.schemaVersion !== 4) return raw;
  const plan = characterGenerationPlan(input);
  const source = raw.data;
  validateComplexity(source, plan);
  const tier = Object.keys(RARITY_WEIGHTS).indexOf(plan.rarity);
  const profile = plan.profiles[source.profile];
  assertDesign(profile, '职业定位无效');
  const passiveCount = source.skills.filter((skill) => skill.kind === 'passive').length;
  const numericEffect = (effect, ability, key, passive = false) => {
    const power = ['low', 'standard', 'high'].indexOf(effect.power);
    assertDesign(power >= 0, '效果强度档位无效');
    if (effect.type === 'buff') assertDesign(effect.buff, '状态效果缺少buff');
    if (effect.type === 'cleanse') assertDesign(effect.buffs?.length, '净化效果缺少buffs');
    const target = effect.target === 'target' ? ability.target : effect.target || ability.target;
    const enemyTarget = ['enemy', 'allEnemies', 'lowestEnemy', 'opposite', 'attacker'].includes(
      target,
    );
    const allyTarget = [
      'self',
      'ally',
      'allAllies',
      'frontAllies',
      'rearAllies',
      'lowestAlly',
    ].includes(target);
    const beneficial =
      ['heal', 'shield', 'cleanse'].includes(effect.type) ||
      (effect.type === 'buff' && [...POSITIVE_BUFFS, 'overload'].includes(effect.buff));
    const harmful =
      effect.type === 'damage' ||
      (effect.type === 'buff' && ![...POSITIVE_BUFFS, 'overload'].includes(effect.buff));
    assertDesign(!beneficial || !enemyTarget, '治疗、护盾和正面状态必须指向友方');
    assertDesign(!harmful || !allyTarget, '伤害和负面状态必须指向敌方');
    const allTargets = ['allAllies', 'allEnemies', 'frontAllies', 'rearAllies'].includes(
      effect.target || ability.target,
    );
    const count = ability.effects?.length || 1;
    const cost = ['low', 'standard', 'high'].indexOf(ability.cost || 'standard');
    const base = passive ? 2 + power : 7 + power * 2 + tier + cost;
    const apFactor = ability.ap === 2 ? 1.95 : 1;
    const scopeFactor = allTargets ? 0.57 : 1;
    const secondaryFactor = count > 1 ? 0.84 : 1;
    const passiveFactor = passive ? 1 : 1 - passiveCount * 0.08;
    const computed = Math.max(
      1,
      Math.round(base * apFactor * scopeFactor * secondaryFactor * passiveFactor),
    );
    const budget =
      ability.ap === 2 && !passive
        ? Math.max(allTargets ? 12 : 20, computed)
        : Math.min(passive ? 8 : 16, computed);
    const value = roll(plan.seed, key, Math.max(1, budget - 1), Math.min(32, budget + 1));
    const result =
      effect.type === 'cleanse'
        ? { type: 'cleanse', buffs: [...new Set(effect.buffs)] }
        : {
            type: effect.type,
            value:
              effect.type === 'buff'
                ? ['bind', 'haste', 'overload'].includes(effect.buff)
                  ? 1
                  : ability.ap === 2
                    ? power === 2
                      ? 3
                      : 2
                    : power === 2
                      ? 2
                      : 1
                : effect.type === 'mark'
                  ? 1
                  : effect.type === 'selfMana'
                    ? ability.ap === 2
                      ? roll(plan.seed, key + ':mana', 8, 10)
                      : Math.max(1, Math.min(passive ? 2 : 6, Math.round(value * 0.5)))
                    : value,
            ...(effect.type === 'buff' ? { buff: effect.buff } : {}),
          };
    if (effect.type === 'buff') {
      const pure = ability.effects?.every(
        (item) => item.type === 'buff' && ['weak', 'vulnerable'].includes(item.buff),
      );
      result.value = generatedStatusValue(effect.buff, result.value, pure);
    }
    if (effect.type === 'mark') {
      assertDesign(!effect.target || effect.target === 'self', '专属标记只积累在自身');
      result.target = 'self';
    } else if (effect.target) result.target = effect.target;
    if (effect.when) result.when = structuredClone(effect.when);
    if (effect.perMark)
      result.perMark = roll(plan.seed, key + ':mark', 2, ability.ap === 2 ? 4 : 3);
    if (effect.consumeMark) result.consumeMark = true;
    return result;
  };
  const compileAbility = (ability, index) => {
    if (ability.kind === 'passive') {
      const rules = ability.rules.map((rule, ruleIndex) => {
        if (rule.mode === 'continuous')
          assertDesign(
            rule.effects.every(
              (effect) =>
                effect.type === 'buff' &&
                ['haste', 'strength', 'guard', 'iron'].includes(effect.buff) &&
                !effect.perMark &&
                !effect.when &&
                !effect.target,
            ),
            '持续被动只支持正面状态光环',
          );
        const result = {
          mode: rule.mode,
          conditions: structuredClone(rule.conditions),
          target: rule.target,
          effects: rule.effects.map((effect, effectIndex) =>
            numericEffect(effect, rule, `skill:${index}:rule:${ruleIndex}:${effectIndex}`, true),
          ),
          ...(rule.mode === 'event'
            ? {
                event: rule.event,
                scope: rule.scope,
                limit: { once: 1, few: 2, regular: 3 }[rule.limit],
              }
            : {}),
        };
        return result;
      });
      const result = { passive: true, rules };
      result.text = finalPassiveText(result);
      return result;
    }
    const abilityEffects = ability.effects.map((effect, effectIndex) =>
      numericEffect(effect, ability, `skill:${index}:${effectIndex}`),
    );
    const strongControl = ability.effects.some(
      (effect) => effect.type === 'buff' && ['bind', 'overload'].includes(effect.buff),
    );
    const costTier = ['low', 'standard', 'high'].indexOf(ability.cost || 'standard');
    const costly =
      ability.ap === 2 ||
      ['allEnemies', 'allAllies'].includes(ability.target) ||
      ability.effects.some((effect) => effect.power === 'high' || effect.perMark);
    const band = Math.max(costTier, strongControl ? 2 : costly ? 1 : 0);
    const mp = roll(
      plan.seed,
      `skill:${index}:cost`,
      ...[
        [5, 7],
        [8, 11],
        [12, 15],
      ][band],
    );
    const hpCost =
      ability.payment === 'hp'
        ? Math.max(strongControl ? 12 : 0, 4 + costTier * 2 + (ability.ap === 2 ? 2 : 0))
        : 0;
    const result = {
      ap: ability.ap,
      mp,
      ...(hpCost ? { hp: hpCost } : {}),
      target: ability.target,
      effects: abilityEffects,
    };
    result.text = finalSkillText(result);
    return result;
  };
  const skills = source.skills.map(compileAbility);
  const entrySkill = compileAbility({ ...source.entrySkill, ap: 1, cost: 'low' }, 'entry');
  delete entrySkill.ap;
  delete entrySkill.mp;
  const hp = plan.protagonist
    ? roll(plan.seed, 'hp', 64, 74)
    : roll(plan.seed, 'hp:' + source.profile, ...profile.hp);
  const mp = plan.protagonist
    ? roll(plan.seed, 'mp', 26, 34)
    : roll(plan.seed, 'mp:' + source.profile, ...profile.sp);
  return {
    ...raw,
    schemaVersion: 3,
    data: {
      archetype: source.archetype,
      weapon: source.weapon,
      hp: Math.min(80, hp),
      mp: Math.min(40, mp),
      attack: plan.fixed.attack,
      limit: plan.fixed.limit,
      skills,
      entrySkill,
      ...(source.mark ? { mechanicMark: { name: source.mark.name, max: 3 } } : {}),
      ...(source.basicAttackMark ? { basicAttackMark: 1 } : {}),
    },
  };
}
