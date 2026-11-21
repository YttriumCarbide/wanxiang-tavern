import test from 'node:test';
import assert from 'node:assert/strict';
import { newBattle } from '../src/engine.js';
import { definitionsFor } from '../src/catalog.js';
import { tacticalDecision, lockEnemyDecisions } from '../src/enemy-tactics.js';
import { nextBossStage } from '../src/ares.js';

function fixture() {
  const state = newBattle(['greyProwler']);
  state.round = 1;
  for (const id of state.formation.slice(0, 3)) {
    Object.assign(state.units[id], { hp: 20, mp: 0, block: 0, buffs: {} });
  }
  const definitions = definitionsFor(state);
  const original = definitions.greyProwler;
  const definition = {
    ...original,
    boss: false,
    tactic: { mode: 'artillery', target: 'charged' },
    intents: [original.intents[0], original.intents[0]],
  };
  return { state, definitions, definition };
}

test('equal target scores prefer lower hp, then the leftmost formation slot', () => {
  const { state, definition } = fixture();
  const [left, middle, right] = state.formation;
  state.units[left].hp = 20;
  state.units[middle].hp = 10;
  state.units[right].hp = 10;

  assert.equal(tacticalDecision(state, 'greyProwler', definition).slot, 1);

  state.units[left].hp = 10;
  assert.equal(tacticalDecision(state, 'greyProwler', definition).slot, 0);
});

test('dead front units and living rear units cannot win tactical targeting', () => {
  const { state, definition } = fixture();
  const [rear, dead, living] = state.formation;
  state.formation = [dead, living, null, rear];
  state.units[dead].hp = 0;
  state.units[dead].mp = 100;
  state.units[rear].mp = 200;
  state.units[living].mp = 1;

  const decision = tacticalDecision(state, 'greyProwler', definition);
  assert.equal(decision.slot, 1);
  assert.deepEqual(decision.slots, [1]);
});

test('an empty or entirely dead front has a deterministic fallback target', () => {
  const { state, definition } = fixture();
  for (const id of state.formation.slice(0, 3)) {
    state.units[id].hp = 0;
  }

  const deadFront = tacticalDecision(state, 'greyProwler', definition);
  assert.equal(deadFront.slot, 1);
  assert.deepEqual(deadFront.slots, [1]);

  state.formation = [null, null, null, ...state.formation.slice(3)];
  const emptyFront = tacticalDecision(state, 'greyProwler', definition);
  assert.deepEqual(emptyFront, deadFront);
});

test('adjacent targeting stays within the front at both outer edges', () => {
  const { state, definition } = fixture();
  definition.intents = definition.intents.map((move) => ({
    ...move,
    adjacent: true,
  }));

  for (const [slot, expected] of [
    [0, [0, 1]],
    [2, [2, 1]],
  ]) {
    for (const id of state.formation.slice(0, 3)) {
      state.units[id].mp = 0;
    }
    state.units[state.formation[slot]].mp = 10;

    const decision = tacticalDecision(state, 'greyProwler', definition);
    assert.equal(decision.slot, slot);
    assert.deepEqual(decision.slots, expected);
  }
});

test('locking decisions is repeatable and preserves units, formation and definitions', () => {
  const { state, definitions, definition } = fixture();
  const catalog = { ...definitions, greyProwler: definition };
  const unitsBefore = structuredClone(state.units);
  const formationBefore = structuredClone(state.formation);
  const definitionsBefore = structuredClone(catalog);
  const expected = tacticalDecision(state, 'greyProwler', definition);

  lockEnemyDecisions(state, catalog);
  assert.deepEqual(state.enemyDecisions, { greyProwler: expected });

  const firstLock = structuredClone(state.enemyDecisions);
  lockEnemyDecisions(state, catalog);

  assert.deepEqual(state.enemyDecisions, firstLock);
  assert.deepEqual(state.units, unitsBefore);
  assert.deepEqual(state.formation, formationBefore);
  assert.deepEqual(catalog, definitionsBefore);
});

test('a regular boss enters phase two at its exact hp threshold and retains enrage', () => {
  const { state, definition } = fixture();
  const boss = {
    ...definition,
    boss: true,
    phaseMode: undefined,
    overlordPhases: undefined,
    phaseThreshold: 0.5,
    enragedIntents: definition.intents,
  };
  const unit = state.units.greyProwler;
  unit.maxHp = 100;
  unit.enraged = false;

  for (const [hp, stage, transition] of [
    [51, 1, 0],
    [50, 2, 2],
    [49, 2, 2],
  ]) {
    unit.hp = hp;
    const decision = tacticalDecision(state, 'greyProwler', boss);
    assert.equal(decision.bossStage, stage);
    assert.equal(decision.enraged, stage === 2);
    assert.equal(nextBossStage(state, 'greyProwler', boss), transition);
  }

  unit.hp = 100;
  unit.enraged = true;
  assert.equal(tacticalDecision(state, 'greyProwler', boss).bossStage, 2);
  assert.equal(nextBossStage(state, 'greyProwler', boss), 0);
});
