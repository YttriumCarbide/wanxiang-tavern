import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, DEFINITIONS } from '../src/data.js';
import { newBattle, preview, makeAction, makeEngage } from '../src/engine.js';
import { EMBLEM_ID, canCombine } from '../src/emblems.js';
import { validateAction } from '../src/validation.js';

function battle() {
  const heroes = Object.fromEntries(
    HEROES.map((hero) => [
      hero.id,
      {
        ...structuredClone(hero),
        hp: 100,
        mp: 100,
        attack: 10,
        limit: 3,
        buffs: {},
        skills: [],
      },
    ]),
  );
  heroes.aegis.emblemId = EMBLEM_ID;
  return newBattle(['hound'], heroes, {
    hound: {
      ...structuredClone(DEFINITIONS.hound),
      hp: 100,
      speed: 1,
      buffs: {},
      intents: [{ name: 'Test', slot: 0, effects: [{ type: 'shield', value: 0, target: 'self' }] }],
    },
  });
}

function resolve(state, plan = []) {
  const result = preview(state, plan);
  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  return result;
}

test('zero charge prevents combining and attacks saturate charge at six', () => {
  const state = battle();
  state.units.aegis.emblemCharge = 0;
  assert.equal(canCombine(state, 'aegis'), false);
  const rejected = preview(state, [makeEngage('aegis', 0)]);
  assert.equal(rejected.valid, false);
  assert.equal(rejected.final.units.aegis.emblemCharge, 0);
  assert.equal(rejected.final.units.aegis.combined, undefined);

  const attack = makeAction(state, 'aegis', 'attack', 'hound', 0);
  assert.equal(resolve(state, [attack]).final.units.aegis.emblemCharge, 1);

  state.units.aegis.emblemCharge = 6;
  assert.equal(canCombine(state, 'aegis'), true);
  assert.equal(resolve(state, [attack]).final.units.aegis.emblemCharge, 6);
});

test('an invalid engage follow-up is rejected before consuming charge', () => {
  const state = battle();
  state.units.aegis.emblemCharge = 6;
  const marker = makeEngage('aegis', 0);
  marker.followUp = { skill: 'attack', target: 'aegis' };
  const before = structuredClone(state);

  assert.equal(typeof validateAction(state, marker), 'string');
  const result = preview(state, [marker]);

  assert.equal(result.valid, false);
  assert.equal(
    result.events.some((event) => event.type === 'engage'),
    false,
  );
  assert.equal(result.final.units.aegis.emblemCharge, 6);
  assert.equal(result.final.units.aegis.combined, undefined);
  assert.deepEqual(state, before);
});

test('engage and its follow-up share one slot and consume one ordinary action', () => {
  const state = battle();
  state.units.aegis.emblemCharge = 6;
  const marker = makeEngage('aegis', 0);
  marker.followUp = { skill: 'attack', target: 'hound' };
  const before = structuredClone(state);
  const result = resolve(state, [marker]);
  const events = result.events.filter((event) => event.actionId === marker.id);

  assert.deepEqual(
    events.map((event) => event.type),
    ['engage', 'hero'],
  );
  assert.deepEqual(
    events.map((event) => event.at),
    [0, 0],
  );
  assert.deepEqual(
    events.map((event) => event.actor),
    ['aegis', 'aegis'],
  );
  assert.equal(events[0].after.units.aegis.used, 0);
  assert.equal(result.final.units.aegis.used, 1);
  assert.equal(result.final.units.aegis.emblemCharge, 0);
  assert.equal(result.final.units.aegis.combined, 3);
  assert.equal(result.final.units.hound.hp, 90);
  assert.deepEqual(state, before);
});

test('a combined lethal attack clamps enemy HP and preserves source state and plan', () => {
  const state = battle();
  state.units.aegis.combined = 3;
  state.units.hound.hp = 3;
  state.units.hound.block = 2;
  const action = makeAction(state, 'aegis', 'attack', 'hound', 0);
  const before = structuredClone(state);
  const originalAction = structuredClone(action);
  const result = resolve(state, [action]);

  assert.equal(result.final.units.hound.hp, 0);
  assert.equal(result.final.units.hound.block, 0);
  assert.equal(result.outcome, 'victory');
  assert.equal(result.deaths.filter((death) => death.id === 'hound').length, 1);
  assert.equal(result.final.units.aegis.hp, 100);
  assert.deepEqual(state, before);
  assert.deepEqual(action, originalAction);
  assert.deepEqual(resolve(state, [action]), result);
});

test('balance keeps a dead position share and applies each living position shield separately', () => {
  const state = battle();
  state.phase = 'plan';
  state.round = 1;
  state.enemyDefinitions.hound.intents = [
    {
      name: 'Test',
      slots: [0, 1],
      effects: [{ type: 'damage', value: 9 }],
    },
  ];
  state.units.hound.buffs.balance = 1;
  const [left, middle, right] = state.formation;
  state.units[left].block = 5;
  state.units[middle].hp = 0;
  state.units[middle].block = 7;
  state.units[right].block = 3;
  const before = structuredClone(state);
  const result = resolve(state);
  const event = result.events.find((entry) => entry.type === 'enemy' && entry.actor === 'hound');

  assert.ok(event);
  assert.equal(event.after.units[left].hp, 100);
  assert.equal(event.after.units[left].block, 0);
  assert.equal(event.after.units[middle].hp, 0);
  assert.equal(event.after.units[middle].block, 7);
  assert.equal(event.after.units[right].hp, 99);
  assert.equal(event.after.units[right].block, 0);
  assert.equal(
    result.deaths.some((death) => death.id === middle),
    false,
  );
  assert.deepEqual(state, before);
});
