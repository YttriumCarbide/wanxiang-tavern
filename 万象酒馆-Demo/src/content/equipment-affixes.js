export const EQUIPMENT_AFFIX_REGISTRY = Object.freeze({
  'affix-offense': Object.freeze({
    id: 'affix-offense',
    label: '攻击',
    statsPerPoint: Object.freeze({
      attack: 0.4,
    }),
    passives: Object.freeze([
      Object.freeze({
        required: 3,
        rules: Object.freeze([
          Object.freeze({
            mode: 'event',
            event: 'afterAttack',
            target: 'self',
            conditions: Object.freeze([]),
            effects: Object.freeze([
              Object.freeze({
                type: 'buff',
                buff: 'strength',
                value: 1,
              }),
            ]),
            limit: 1,
            scope: 'battle',
          }),
        ]),
      }),
      Object.freeze({
        required: 6,
        rules: Object.freeze([
          Object.freeze({
            mode: 'event',
            event: 'battleStart',
            target: 'self',
            conditions: Object.freeze([]),
            effects: Object.freeze([
              Object.freeze({
                type: 'shield',
                value: 3,
              }),
            ]),
            limit: 1,
            scope: 'battle',
          }),
        ]),
      }),
    ]),
  }),
  'affix-guard': Object.freeze({
    id: 'affix-guard',
    label: '护盾',
    statsPerPoint: Object.freeze({
      hp: 2,
    }),
    passives: Object.freeze([
      Object.freeze({
        required: 3,
        rules: Object.freeze([
          Object.freeze({
            mode: 'event',
            event: 'battleStart',
            target: 'self',
            conditions: Object.freeze([]),
            effects: Object.freeze([
              Object.freeze({
                type: 'shield',
                value: 4,
              }),
            ]),
            limit: 1,
            scope: 'battle',
          }),
        ]),
      }),
      Object.freeze({
        required: 6,
        rules: Object.freeze([
          Object.freeze({
            mode: 'event',
            event: 'damageTaken',
            target: 'self',
            conditions: Object.freeze([]),
            effects: Object.freeze([
              Object.freeze({
                type: 'shield',
                value: 3,
              }),
            ]),
            limit: 2,
            scope: 'battle',
          }),
        ]),
      }),
    ]),
  }),
  'affix-focus': Object.freeze({
    id: 'affix-focus',
    label: '法力',
    statsPerPoint: Object.freeze({
      mp: 1,
    }),
    passives: Object.freeze([
      Object.freeze({
        required: 3,
        rules: Object.freeze([
          Object.freeze({
            mode: 'event',
            event: 'skillCast',
            target: 'self',
            conditions: Object.freeze([]),
            effects: Object.freeze([
              Object.freeze({
                type: 'mana',
                value: 2,
              }),
            ]),
            limit: 1,
            scope: 'battle',
          }),
        ]),
      }),
      Object.freeze({
        required: 6,
        rules: Object.freeze([
          Object.freeze({
            mode: 'event',
            event: 'skillCast',
            target: 'self',
            conditions: Object.freeze([]),
            effects: Object.freeze([
              Object.freeze({
                type: 'shield',
                value: 3,
              }),
            ]),
            limit: 2,
            scope: 'battle',
          }),
        ]),
      }),
    ]),
  }),
  'affix-renewal': Object.freeze({
    id: 'affix-renewal',
    label: '回复',
    statsPerPoint: Object.freeze({
      hp: 2,
    }),
    passives: Object.freeze([
      Object.freeze({
        required: 3,
        rules: Object.freeze([
          Object.freeze({
            mode: 'event',
            event: 'roundEnd',
            target: 'self',
            conditions: Object.freeze([
              Object.freeze({
                type: 'hpBelow',
                value: 50,
              }),
            ]),
            effects: Object.freeze([
              Object.freeze({
                type: 'heal',
                value: 4,
              }),
            ]),
            limit: 1,
            scope: 'battle',
          }),
        ]),
      }),
      Object.freeze({
        required: 6,
        rules: Object.freeze([
          Object.freeze({
            mode: 'event',
            event: 'enterRear',
            target: 'self',
            conditions: Object.freeze([]),
            effects: Object.freeze([
              Object.freeze({
                type: 'heal',
                value: 4,
              }),
            ]),
            limit: 2,
            scope: 'expedition',
          }),
        ]),
      }),
    ]),
  }),
});
