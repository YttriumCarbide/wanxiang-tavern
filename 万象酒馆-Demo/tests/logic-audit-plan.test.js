import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFINITIONS } from '../src/data.js';
import { EMBLEM_ID } from '../src/emblems.js';
import { newBattle, preview, makeAction, makeEngage } from '../src/engine.js';
import { validateAction } from '../src/validation.js';

function chargedBattle() {
  const state = newBattle(['hound'], {
    aegis: { ...structuredClone(DEFINITIONS.aegis), emblemId: EMBLEM_ID },
  });
  state.units.aegis.emblemCharge = 6;
  return state;
}

function combinedAttack() {
  const marker = makeEngage('aegis', 0);
  marker.followUp = { skill: 'attack', target: 'hound' };
  return marker;
}

for (const start of [2 ** 53, Number.MAX_VALUE]) {
  test(`action validation rejects unsafe integer start ${start} before simulation`, () => {
    const state = chargedBattle();
    const action = makeAction(state, 'aegis', 'attack', 'hound', start);
    assert.equal(Number.isInteger(start), true);
    assert.equal(Number.isSafeInteger(start), false);
    // Never pass this action into preview: a future AP change could make its slot loop hang.
    assert.notEqual(validateAction(state, action), null);
  });
}

test('action validation accepts the ordinary integer start control', () => {
  const state = chargedBattle();
  const action = makeAction(state, 'aegis', 'attack', 'hound', 0);
  assert.equal(validateAction(state, action), null);
});

for (const ap of [0, NaN, Infinity]) {
  test(`compound action validation cannot hide invalid outer AP ${ap}`, () => {
    const state = chargedBattle();
    const marker = combinedAttack();
    marker.ap = ap;
    marker.followUp.ap = 1;
    // Check the boundary directly; an infinite AP must never reach a simulation loop.
    assert.notEqual(validateAction(state, marker), null);
  });
}

test('nested AP cannot turn a zero-slot combined attack into a valid preview', () => {
  const state = chargedBattle();
  const marker = combinedAttack();
  marker.ap = 0;
  marker.followUp.ap = 1;
  const result = preview(state, [marker]);
  assert.equal(result.valid, false);
  assert(result.invalid.some((entry) => entry.id === marker.id));
});

test('nested start cannot replace a compound action scheduling position', () => {
  const state = chargedBattle();
  const marker = combinedAttack();
  marker.followUp.start = 1;
  const result = preview(state, [marker]);
  if (!result.valid) return;
  const actions = result.events.filter((event) => ['engage', 'hero'].includes(event.type));
  assert.equal(actions.length, 2);
  assert(actions.every((event) => event.at === marker.start));
});

test('nested ID cannot replace the outer identity or bypass duplicate detection', () => {
  const state = chargedBattle();
  const marker = combinedAttack();
  const ordinary = makeAction(state, 'aegis', 'attack', 'hound', 0);
  marker.id = ordinary.id;
  marker.followUp.id = 'nested-identity';
  const seen = new Set([ordinary.id]);
  assert.notEqual(validateAction(state, marker, seen), null);

  // A fresh outer ID does not make an independently supplied inner identity legitimate.
  marker.id = 'outer-identity';
  const result = preview(state, [marker]);
  if (!result.valid) return;
  const actions = result.events.filter((event) => ['engage', 'hero'].includes(event.type));
  assert.equal(actions.length, 2);
  assert(actions.every((event) => event.actionId === marker.id));
});

test('ordinary compound attack uses its one validated outer identity and slot', () => {
  const state = chargedBattle();
  const marker = combinedAttack();
  assert.equal(validateAction(state, marker), null);
  const result = preview(state, [marker]);
  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  const actions = result.events.filter((event) => ['engage', 'hero'].includes(event.type));
  assert.equal(actions.filter((event) => event.type === 'engage').length, 1);
  assert.equal(actions.filter((event) => event.type === 'hero').length, 1);
  assert(actions.every((event) => event.actionId === marker.id && event.at === marker.start));
  assert.equal(result.final.units.aegis.emblemCharge, 0);
  assert.equal(result.final.units.aegis.combined, 3);
});

test('preview leaves input state and compound plan unchanged and repeats identically', () => {
  const state = chargedBattle();
  const plan = [combinedAttack()];
  const before = structuredClone({ state, plan });
  const first = preview(state, plan);
  assert.equal(first.valid, true, JSON.stringify(first.invalid));
  assert.deepEqual({ state, plan }, before);
  const second = preview(state, plan);
  assert.deepEqual(second, first);
  assert.deepEqual({ state, plan }, before);
});

test('a safe but out-of-timeline start is rejected before reserving slots', () => {
  const state = chargedBattle();
  const action = makeAction(state, 'aegis', 'attack', 'hound', Number.MAX_SAFE_INTEGER);
  const result = preview(state, [action]);
  assert.equal(result.valid, false);
  assert(result.invalid.some((entry) => entry.id === action.id));
});

function regularChargedBattle() {
  const state = chargedBattle();
  state.phase = 'plan';
  state.round = 1;
  state.heroDefinitions.aegis.limit = 3;
  state.enemyDefinitions.hound = { ...structuredClone(DEFINITIONS.hound), speed: 1 };
  state.units.hound.hp = 1000;
  state.units.hound.maxHp = 1000;
  return state;
}

test('a legal two-AP follow-up keeps its outer AP and leaves the third player slot usable', () => {
  const state = regularChargedBattle();
  state.heroDefinitions.aegis.skills = [
    structuredClone(DEFINITIONS.lyria.skills.find((skill) => skill.id === 'blade-dance')),
  ];
  const marker = makeEngage('aegis', 0);
  marker.ap = 2;
  marker.followUp = { skill: 'blade-dance', target: 'hound' };
  const attack = makeAction(state, 'aegis', 'attack', 'hound', 2);
  const result = preview(state, [marker, attack]);
  assert.equal(validateAction(state, marker), null);
  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  const followUp = result.events.find(
    (event) => event.type === 'hero' && event.actionId === marker.id,
  );
  assert.equal(followUp?.skill, 'blade-dance');
  assert.equal(followUp?.at, 0);
  assert(result.events.some((event) => event.type === 'hero' && event.actionId === attack.id));
});

test('a combined attack and another ordinary attack retain separate IDs', () => {
  const state = regularChargedBattle();
  const marker = combinedAttack();
  const attack = makeAction(state, 'aegis', 'attack', 'hound', 1);
  const result = preview(state, [marker, attack]);
  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  assert.deepEqual(
    result.events.filter((event) => event.type === 'hero').map((event) => event.actionId),
    [marker.id, attack.id],
  );
});
