const deepFreeze = (value) => {
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }
  return Object.freeze(value);
};

export const STRESS_ROSTERS = deepFreeze([
  {
    id: 'vanguard',
    members: ['qingyuan', 'morrow', 'vesper'],
  },
  {
    id: 'arcanist',
    members: ['morrow', 'lyria', 'serin', 'rook'],
  },
  {
    id: 'support',
    members: ['serin', 'rook'],
  },
]);

export const STRESS_AFFIXES = deepFreeze([
  {
    id: 'none',
    stats: {},
    rules: [],
  },
  {
    id: 'battle-start',
    stats: {
      hp: 3,
    },
    rules: [
      {
        mode: 'event',
        event: 'battleStart',
        target: 'self',
        effects: [
          {
            type: 'shield',
            value: 5,
          },
        ],
        limit: 1,
        scope: 'round',
        conditions: [],
      },
    ],
  },
  {
    id: 'damage-dealt',
    stats: {
      hp: 3,
    },
    rules: [
      {
        mode: 'event',
        event: 'damageDealt',
        target: 'self',
        effects: [
          {
            type: 'shield',
            value: 3,
          },
        ],
        limit: 1,
        scope: 'round',
        conditions: [],
      },
    ],
  },
  {
    id: 'damage-taken',
    stats: {
      hp: 3,
    },
    rules: [
      {
        mode: 'event',
        event: 'damageTaken',
        target: 'self',
        effects: [
          {
            type: 'shield',
            value: 4,
          },
        ],
        limit: 1,
        scope: 'round',
        conditions: [],
      },
    ],
  },
  {
    id: 'mana-spent',
    stats: {
      hp: 3,
    },
    rules: [
      {
        mode: 'event',
        event: 'manaSpent',
        target: 'self',
        effects: [
          {
            type: 'mana',
            value: 2,
          },
        ],
        limit: 1,
        scope: 'round',
        conditions: [],
      },
    ],
  },
  {
    id: 'round-end',
    stats: {
      hp: 3,
    },
    rules: [
      {
        mode: 'event',
        event: 'roundEnd',
        target: 'lowestAlly',
        effects: [
          {
            type: 'heal',
            value: 4,
          },
        ],
        limit: 1,
        scope: 'round',
        conditions: [],
      },
    ],
  },
]);
