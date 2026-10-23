import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, DEFINITIONS } from '../src/data.js';
import { newBattle, newEncounter, makeAction, makeSwap, preview, advance } from '../src/engine.js';
import { OVERLOAD_EMBLEM_ID, OVERLOAD_SKILL } from '../src/emblems.js';
import { statusIcons } from '../src/ui.js';

function battle() {
  const enemyDefinitions = Object.fromEntries(
    ['fixture-left', 'fixture-right'].map((id, index) => [
      id,
      {
        ...structuredClone(DEFINITIONS.hound),
        id,
        hp: 200,
        speed: index ? 1 : 2,
        buffs: {},
        intents: [{ name: '等待', slot: 0, effects: [{ type: 'damage', value: 1 }] }],
      },
    ]),
  );
  const heroes = Object.fromEntries(
    HEROES.map((hero) => [hero.id, { ...structuredClone(hero), buffs: {}, skills: [] }]),
  );
  return newBattle(Object.keys(enemyDefinitions), heroes, enemyDefinitions);
}

test('character-specific marks use the status strip with their real name, count and forecast, hiding zero', () => {
  const state = battle();
  const actor = state.formation[0];
  state.heroDefinitions[actor].mechanicMark = { name: '剑印<星>', max: 3 };
  state.units[actor].mark = 0;
  assert(!statusIcons(state, actor).includes('data-buff="mark"'));
  state.units[actor].mark = 2;
  const forecast = structuredClone(state);
  forecast.units[actor].mark = 0;
  const markup = statusIcons(state, actor, forecast);
  assert(markup.includes('data-buff="mark"'));
  assert(markup.includes('data-count="2"'));
  assert(markup.includes('剑印&lt;星&gt; 2/3'));
  assert(markup.includes('预计结算后 0/3'));
  assert(markup.includes('viewBox="0 0 64 64"'));
  assert(!markup.includes('剑印<星>'));
});

test('an opposite entry skill whiffs an empty or defeated column without retargeting, while its self effect still applies', () => {
  for (const deadColumn of [false, true]) {
    const state = battle();
    const incoming = state.formation[3];
    state.heroDefinitions[incoming].entrySkill = {
      id: 'entry-fixture',
      name: '对位斩',
      target: 'opposite',
      effects: [
        { type: 'damage', value: 9 },
        { type: 'selfShield', value: 6 },
      ],
    };
    state.units[incoming].entryReady = true;
    const column = deadColumn ? 0 : 1;
    if (deadColumn) state.units[state.enemyIds[0]].hp = 0;
    const before = structuredClone(state);
    const result = preview(state, [makeSwap(incoming, column, 0)]);
    assert(result.valid);
    for (const id of state.enemyIds) assert.equal(result.final.units[id].hp, state.units[id].hp);
    assert.equal(result.final.units[incoming].block, 6);
    assert.equal(result.final.units[incoming].entryReady, false);
    assert.deepEqual(result.events.find((event) => event.type === 'entrySkill').targets, []);
    assert.deepEqual(state, before, 'preview must never consume the actual readiness');
  }
});

test('overload granted earlier in the same plan doubles the next skill exactly once and emits authoritative repetition metadata', () => {
  const state = battle();
  state.phase = 'plan';
  state.round = 1;
  const actor = state.formation[0];
  const enemy = state.enemyIds[0];
  Object.assign(state.heroDefinitions[actor], {
    emblemId: OVERLOAD_EMBLEM_ID,
    limit: 2,
    skills: [
      {
        id: 'burst',
        name: '重击',
        ap: 1,
        mp: 4,
        target: 'enemy',
        effects: [{ type: 'damage', value: 10 }],
      },
    ],
  });
  state.units[actor].combined = 3;
  state.units[actor].mp = 30;
  const combineSkill = makeAction(state, actor, OVERLOAD_SKILL.id, actor, 0);
  const burst = makeAction(state, actor, 'burst', enemy, 1);
  const result = preview(state, [combineSkill, burst]);
  assert(result.valid);
  assert.equal(result.final.units[actor].mp, 22);
  assert.equal(result.final.units[enemy].hp, 176);
  assert.equal(result.final.units[actor].combineSkillUsed, true);
  assert(!result.final.units[actor].buffs.overload);
  const event = result.events.find((item) => item.actionId === burst.id && item.type === 'hero');
  assert.equal(event.repeatCount, 2);
  assert.deepEqual(event.costs, { mp: 8, hp: 0 });
  assert.equal(result.events.find((item) => item.actionId === combineSkill.id).repeatCount, 1);
  const next = advance(result);
  const ordinary = preview(next, [makeAction(next, actor, 'burst', enemy, 0)]);
  assert(ordinary.valid);
  assert.equal(ordinary.events.find((item) => item.type === 'hero').repeatCount, 1);
  assert(!preview(next, [makeAction(next, actor, OVERLOAD_SKILL.id, actor, 0)]).valid);
});

test('insufficient doubled cost leaves overload intact and does not claim that a skill repeated', () => {
  const state = battle();
  const actor = state.formation[0];
  state.heroDefinitions[actor].skills = [
    {
      id: 'burst',
      name: '重击',
      ap: 1,
      mp: 4,
      target: 'enemy',
      effects: [{ type: 'damage', value: 10 }],
    },
  ];
  state.units[actor].buffs.overload = 1;
  state.units[actor].mp = 7;
  const result = preview(state, [makeAction(state, actor, 'burst', state.enemyIds[0], 0)]);
  assert(!result.valid);
  assert.equal(result.final.units[actor].mp, 7);
  assert.equal(result.final.units[actor].buffs.overload, 1);
  assert(!result.events.some((event) => event.repeatCount === 2));
});

test('bind cancellation metadata follows the actual enemy slot and never marks an attack that already happened', () => {
  for (const beforeEnemy of [true, false]) {
    const state = battle();
    state.phase = 'plan';
    state.round = 1;
    const actor = state.formation[0];
    const enemy = state.enemyIds[0];
    if (!beforeEnemy) state.enemyDefinitions[enemy].speed = 5;
    state.heroDefinitions[actor].skills = [
      {
        id: 'bind',
        name: '禁锢',
        ap: 1,
        mp: 0,
        target: 'enemy',
        effects: [{ type: 'buff', buff: 'bind', value: 1 }],
      },
    ];
    const result = preview(state, [makeAction(state, actor, 'bind', enemy, beforeEnemy ? 0 : 1)]);
    assert(result.valid);
    const blocked = result.events.find(
      (event) => event.actor === enemy && event.blockedBy === 'bind',
    );
    assert.equal(!!blocked, beforeEnemy);
    if (blocked) assert.equal(result.slots[blocked.at], enemy);
    else assert(result.events.some((event) => event.actor === enemy && event.type === 'enemy'));
  }
});

test('a generated mark is bounded, consumed once across group targets and kept available to same-cast conditional effects', () => {
  const state = battle();
  const actor = state.formation[0];
  Object.assign(state.heroDefinitions[actor], {
    mechanicMark: { name: '剑印', max: 3 },
    basicAttackMark: 1,
    skills: [
      {
        id: 'marked',
        name: '剑印释放',
        ap: 1,
        mp: 0,
        target: 'allEnemies',
        effects: [
          { type: 'damage', value: 5, perMark: 2, consumeMark: true },
          { type: 'shield', value: 4, target: 'self', when: { type: 'mark', value: 3 } },
        ],
      },
    ],
  });
  state.units[actor].mark = 3;
  const result = preview(state, [makeAction(state, actor, 'marked', state.enemyIds[0], 0)]);
  assert(result.valid);
  for (const id of state.enemyIds) assert.equal(result.final.units[id].hp, 189);
  assert.equal(result.final.units[actor].mark, 0);
  assert.equal(result.final.units[actor].block, 4);
  assert.equal(state.units[actor].mark, 3, 'preview never consumes persistent combat state');
  const attack = preview(state, [makeAction(state, actor, 'attack', state.enemyIds[0], 0)]);
  assert.equal(attack.final.units[actor].mark, 3, 'the basic attack cannot exceed three marks');
  const nextBattle = newEncounter(
    { enemyIds: state.enemyIds, enemyDefinitions: state.enemyDefinitions, hpScale: 1 },
    result.final,
    1,
  );
  assert.equal(nextBattle.units[actor].mark, 0, 'marks are battle-local');
});

test('conditional target checks and independent effect targets use actual battle units', () => {
  const state = battle();
  const actor = state.formation[0];
  const enemy = state.enemyIds[0];
  const wounded = state.formation[1];
  state.units[wounded].hp = 1;
  state.units[enemy].buffs.bleed = 1;
  state.heroDefinitions[actor].skills = [
    {
      id: 'conditional',
      name: '追击援护',
      ap: 1,
      mp: 0,
      target: 'enemy',
      effects: [
        {
          type: 'damage',
          value: 12,
          when: { type: 'buff', buff: 'bleed', value: 1, subject: 'target' },
        },
        { type: 'heal', value: 8, target: 'lowestAlly' },
      ],
    },
  ];
  const result = preview(state, [makeAction(state, actor, 'conditional', enemy, 0)]);
  assert(result.valid);
  assert.equal(result.final.units[enemy].hp, 188);
  assert.equal(result.final.units[wounded].hp, 9);
  delete state.units[enemy].buffs.bleed;
  const ordinary = preview(state, [makeAction(state, actor, 'conditional', enemy, 0)]);
  assert.equal(ordinary.final.units[enemy].hp, 200);
});

test('an overloaded marked skill consumes its mark once and its second cast cannot reuse consumed stacks', () => {
  const state = battle();
  const actor = state.formation[0];
  Object.assign(state.heroDefinitions[actor], {
    mechanicMark: { name: '剑印', max: 3 },
    skills: [
      {
        id: 'marked',
        name: '剑印释放',
        ap: 1,
        mp: 0,
        target: 'enemy',
        effects: [{ type: 'damage', value: 5, perMark: 2, consumeMark: true }],
      },
    ],
  });
  state.units[actor].mark = 3;
  state.units[actor].buffs.overload = 1;
  const result = preview(state, [makeAction(state, actor, 'marked', state.enemyIds[0], 0)]);
  assert(result.valid);
  assert.equal(
    result.final.units[state.enemyIds[0]].hp,
    184,
    'first cast deals 11, second deals 5',
  );
  assert.equal(result.final.units[actor].mark, 0);
  assert.equal(result.events.find((event) => event.type === 'hero').repeatCount, 2);
});

test('after-attack rules observe the mark earned by that very basic attack', () => {
  const state = battle();
  const actor = state.formation[0];
  Object.assign(state.heroDefinitions[actor], {
    mechanicMark: { name: '剑印', max: 3 },
    basicAttackMark: 1,
    skills: [
      {
        id: 'mark-shield',
        name: '满印守护',
        passive: true,
        location: '全战斗',
        rules: [
          {
            mode: 'event',
            event: 'afterAttack',
            conditions: [{ type: 'mark', value: 3 }],
            target: 'self',
            effects: [{ type: 'shield', value: 4 }],
            scope: 'round',
            limit: 1,
          },
        ],
      },
    ],
  });
  state.units[actor].mark = 2;
  const result = preview(state, [makeAction(state, actor, 'attack', state.enemyIds[0], 0)]);
  assert(result.valid);
  assert.equal(result.final.units[actor].mark, 3);
  assert.equal(result.final.units[actor].block, 4);
});

test('round, battle and expedition rule limits have separate deterministic lifetimes', () => {
  for (const scope of ['round', 'battle', 'expedition']) {
    const state = battle();
    state.phase = 'plan';
    state.round = 1;
    const actor = state.formation[0];
    state.heroDefinitions[actor].skills = [
      {
        id: 'scope',
        name: '蓄力',
        passive: true,
        location: '全战斗',
        rules: [
          {
            mode: 'event',
            event: 'roundStart',
            conditions: [],
            target: 'self',
            effects: [{ type: 'shield', value: 3 }],
            limit: 1,
            scope,
          },
        ],
      },
    ];
    const initial = preview(state, []);
    assert(initial.events.some((event) => event.logs.some((line) => line.includes('蓄力'))));
    const nextRound = preview(advance(initial), []);
    const repeated = nextRound.events.some((event) =>
      event.logs.some((line) => line.includes('蓄力')),
    );
    assert.equal(repeated, scope === 'round');
    const nextBattle = newEncounter(
      { enemyIds: state.enemyIds, enemyDefinitions: state.enemyDefinitions, hpScale: 1 },
      initial.final,
      1,
    );
    nextBattle.phase = 'plan';
    nextBattle.round = 1;
    const resumed = preview(nextBattle, []);
    assert.equal(
      resumed.events.some((event) => event.logs.some((line) => line.includes('蓄力'))),
      scope !== 'expedition',
    );
  }
});
