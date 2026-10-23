import { BUFFS } from '../data.js';
import { TRIGGER_EVENTS, TRIGGER_TARGETS } from '../triggers.js';

const string = (maxLength, minLength = 1) => ({ type: 'string', minLength, maxLength });
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const choice = (values) => ({ type: 'string', enum: values });
const array = (items, minItems, maxItems) => ({ type: 'array', items, minItems, maxItems });
const object = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

function legacyCharacterSchema({ acceptLegacyNames = false } = {}) {
  const namedDescription = object({ name: string(30), description: string(1200) });
  const buff = choice(Object.keys(BUFFS));
  const effect = {
    anyOf: [
      ...['damage', 'heal', 'shield', 'selfHeal', 'selfMana', 'selfShield'].map((type) =>
        object({ type: { const: type, type: 'string' }, value: integer(1, 32) }),
      ),
      object({ type: { const: 'buff', type: 'string' }, buff, value: integer(1, 6) }),
      object({ type: { const: 'cleanse', type: 'string' }, buffs: array(buff, 1, 9) }),
    ],
  };
  const ability = (properties) => {
    const shape = object({ text: string(300), ...properties });
    if (acceptLegacyNames) shape.properties.name = string(30);
    return shape;
  };
  const active = ability({
    ap: integer(1, 2),
    mp: integer(0, 10),
    target: choice(['enemy', 'ally', 'self', 'allAllies', 'allEnemies']),
    effects: array(effect, 1, 4),
  });
  active.properties.hp = integer(1, 20);
  const passive = [
    ability({ passive: { type: 'boolean', const: true }, rules: array(triggerRuleSchema(), 1, 4) }),
    ability({
      passive: { type: 'boolean', const: true },
      location: choice(['前场', '后场', '全战斗']),
      buff: choice(['strength', 'guard', 'iron']),
      value: integer(1, 3),
    }),
    ability({
      passive: { type: 'boolean', const: true },
      location: choice(['前场', '后场', '全战斗']),
      teamFrontBuff: choice(['strength', 'guard', 'iron']),
      value: integer(1, 2),
    }),
    ability({
      passive: { type: 'boolean', const: true },
      location: { type: 'string', const: '后场' },
      endHeal: integer(1, 6),
    }),
    ability({
      passive: { type: 'boolean', const: true },
      location: { type: 'string', const: '战斗外' },
      bonusMp: integer(1, 6),
    }),
  ];
  const entrySkillShape = object({
    text: string(300),
    target: choice([
      'opposite',
      'enemy',
      'allEnemies',
      'allAllies',
      'lowestAlly',
      'lowestEnemy',
      'self',
    ]),
    effects: array(effect, 1, 3),
  });
  if (acceptLegacyNames) entrySkillShape.properties.name = string(30);
  const schema = object({
    schemaVersion: { type: 'integer', const: 3 },
    setting: object({
      name: string(30),
      gender: string(30),
      age: {
        description: '自由人物设定，可写文字或数字，也可留空或省略；不参与游戏数值及内容校验。',
      },
      appearance: string(2000),
      profession: namedDescription,
      personality: {
        ...string(2400),
        description:
          '性格必须直接写成字符串，如"严谨务实，习惯核实事实。"；不要写成{name,description}对象。',
      },
      history: string(2000),
      attack: namedDescription,
      skills: array(namedDescription, 2, 2),
      entrySkill: namedDescription,
    }),
    data: object({
      archetype: choice(['aegis', 'lyria', 'morrow', 'serin', 'vesper', 'rook']),
      hp: integer(20, 80),
      mp: integer(8, 40),
      attack: integer(3, 14),
      weapon: choice(['sword', 'staff', 'bow']),
      limit: integer(1, 2),
      skills: array({ anyOf: [active, ...passive] }, 2, 2),
      entrySkill: entrySkillShape,
    }),
  });
  schema.properties.setting.required = schema.properties.setting.required.filter(
    (key) => !['age', 'entrySkill'].includes(key),
  );
  schema.properties.data.required = schema.properties.data.required.filter(
    (key) => key !== 'entrySkill',
  );
  schema.properties.levelUpLines = array(string(300), 5, 5);
  schema.properties.arrivalDialogue = array(
    object({ speaker: choice(['character', 'player']), text: string(500) }),
    2,
    5,
  );
  if (acceptLegacyNames)
    Object.assign(schema.properties.data.properties, {
      name: string(30),
      title: string(30),
      attackName: string(30),
    });
  return schema;
}

export function triggerRuleSchema() {
  const condition = {
    type: 'object',
    properties: {
      type: choice([
        'front',
        'rear',
        'hasPositive',
        'hasNegative',
        'hasBuff',
        'noBuff',
        'hasShield',
        'hpBelow',
        'hpAbove',
        'mpBelow',
        'mpAbove',
        'roundAtLeast',
        'buff',
      ]),
      value: integer(0, 100),
      buff: choice(Object.keys(BUFFS)),
    },
    required: ['type'],
    additionalProperties: false,
  };
  const effect = {
    anyOf: [
      ...['damage', 'heal', 'mana', 'shield'].map((type) =>
        object({ type: { const: type }, value: integer(1, 20) }),
      ),
      object({ type: { const: 'buff' }, buff: choice(Object.keys(BUFFS)), value: integer(1, 3) }),
      object({ type: { const: 'cleanse' }, buffs: array(choice(Object.keys(BUFFS)), 1, 11) }),
    ],
  };
  const rule = object({
    mode: choice(['continuous', 'event']),
    event: choice(Object.keys(TRIGGER_EVENTS)),
    conditions: array(condition, 0, 6),
    target: choice(Object.keys(TRIGGER_TARGETS)),
    effects: array(effect, 1, 3),
    limit: integer(1, 50),
  });
  rule.required = ['mode', 'conditions', 'target', 'effects'];
  return rule;
}

/** Older v3 responses may repeat labels, but those fields are optional and never authoritative. */
export function characterInputSchema(version = 3) {
  const schema =
    version === 4 ? characterOutputSchema() : legacyCharacterSchema({ acceptLegacyNames: true });
  schema.properties.setting.properties.personality = {
    anyOf: [string(2400), object({ name: string(30), description: string(2400) })],
  };
  return schema;
}

/** Models choose a bounded design; executable numbers are generated by the program. */
export function characterOutputSchema({ version = 4, acceptLegacyNames = false } = {}) {
  if (version === 3) return legacyCharacterSchema({ acceptLegacyNames });
  const schema = legacyCharacterSchema();
  schema.properties.schemaVersion.const = 4;
  const condition = {
    type: 'object',
    properties: {
      type: choice([
        'front',
        'rear',
        'hasPositive',
        'hasNegative',
        'hasBuff',
        'noBuff',
        'hasShield',
        'hpBelow',
        'hpAbove',
        'mpBelow',
        'mpAbove',
        'buff',
        'mark',
      ]),
      subject: choice(['self', 'target']),
      value: integer(0, 100),
      buff: choice(Object.keys(BUFFS)),
    },
    required: ['type'],
    additionalProperties: false,
  };
  const effect = {
    type: 'object',
    properties: {
      type: choice(['damage', 'heal', 'shield', 'selfHeal', 'selfMana', 'buff', 'cleanse', 'mark']),
      power: choice(['low', 'standard', 'high']),
      buff: choice(Object.keys(BUFFS)),
      buffs: array(choice(Object.keys(BUFFS)), 1, 3),
      target: choice(['self', 'target', 'lowestAlly', 'allAllies', 'allEnemies']),
      when: condition,
      perMark: { type: 'boolean' },
      consumeMark: { type: 'boolean' },
    },
    required: ['type', 'power'],
    additionalProperties: false,
  };
  const effects = array(effect, 1, 2);
  const rule = object({
    mode: choice(['continuous', 'event']),
    event: choice(Object.keys(TRIGGER_EVENTS)),
    conditions: array(condition, 0, 1),
    target: choice(Object.keys(TRIGGER_TARGETS)),
    effects,
    limit: choice(['once', 'few', 'regular']),
    scope: choice(['round', 'battle', 'expedition']),
  });
  rule.required = ['mode', 'conditions', 'target', 'effects'];
  const activeDesign = object({
    kind: { type: 'string', const: 'active' },
    ap: integer(1, 2),
    cost: choice(['low', 'standard', 'high']),
    target: choice(['enemy', 'ally', 'self', 'allAllies', 'allEnemies']),
    effects,
  });
  activeDesign.properties.payment = choice(['sp', 'hp']);
  schema.properties.data = object({
    archetype: choice(['aegis', 'lyria', 'morrow', 'serin', 'vesper', 'rook']),
    weapon: choice(['sword', 'staff', 'bow']),
    profile: choice(['balanced', 'durable', 'caster', 'striker', 'support']),
    skills: array(
      {
        anyOf: [
          activeDesign,
          object({ kind: { type: 'string', const: 'passive' }, rules: array(rule, 1, 1) }),
        ],
      },
      2,
      2,
    ),
    entrySkill: object({
      target: choice([
        'opposite',
        'enemy',
        'lowestEnemy',
        'lowestAlly',
        'allEnemies',
        'allAllies',
        'self',
      ]),
      effects,
    }),
  });
  schema.properties.data.properties.mark = object({ name: string(15) });
  schema.properties.data.properties.basicAttackMark = { type: 'boolean' };
  schema.properties.setting.required = schema.properties.setting.required.filter(
    (key) => key !== 'entrySkill',
  );
  schema.properties.setting.required.push('entrySkill');
  return schema;
}
