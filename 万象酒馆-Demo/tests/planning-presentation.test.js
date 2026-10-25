import test from 'node:test';
import assert from 'node:assert/strict';
import { newBattle, advance, preview, makeAction, makeSwap } from '../src/engine.js';
import { reorderPlan } from '../src/plan-order.js';
import { HEROES, ENEMIES, BOSSES, BUFFS } from '../src/data.js';
import { attackStyle, ATTACK_TIMING, WEAPONS, ENEMY_ATTACKS } from '../src/combat-art.js';
import { icon } from '../src/buff-art.js';

const normal = () => advance(preview(newBattle(['pebble']), []));
test('dropping onto an occupied action exchanges both positions without mutating the original', () => {
  const state = normal();
  const plan = [
    makeAction(state, 'morrow', 'attack', 'pebble', 0),
    makeAction(state, 'aegis', 'attack', 'pebble', 1),
  ];
  const original = structuredClone(plan);
  const changed = reorderPlan(state, plan, plan[0].id, 1);
  assert.equal(changed.swapped, true);
  assert.equal(changed.forecast.valid, true);
  assert.deepEqual(
    changed.plan.map((action) => action.start),
    [1, 0],
  );
  assert.deepEqual(plan, original);
  assert.deepEqual(reorderPlan(state, changed.plan, plan[0].id, 0).plan, original);
});

test('exchanges reject enemy cells, unequal durations that do not fit, and attacks before reserve entry', () => {
  const state = normal();
  const mixed = [
    makeAction(state, 'lyria', 'blade-dance', 'pebble', 0),
    makeAction(state, 'morrow', 'attack', 'pebble', 3),
  ];
  assert(preview(state, mixed).valid);
  assert(reorderPlan(state, mixed, mixed[0].id, 3).error);
  const dependent = [makeSwap('rook', 0, 0), makeAction(state, 'rook', 'attack', 'pebble', 1)];
  assert(preview(state, dependent).valid);
  assert.match(reorderPlan(state, dependent, dependent[0].id, 1).error, /后场/);
  assert(reorderPlan(state, dependent, dependent[1].id, 2).error);
  const moved = reorderPlan(state, [mixed[1]], mixed[1].id, 0);
  assert.equal(moved.plan[0].start, 0);
  assert.equal(moved.swapped, false);
});

test('all companions use three weapon presentations and every enemy resolves a supported motion family', () => {
  assert.deepEqual(new Set(HEROES.map((hero) => hero.weapon)), new Set(WEAPONS));
  for (const hero of HEROES) {
    assert.equal(attackStyle({ type: 'hero', actor: hero.id }), hero.weapon);
    assert(ATTACK_TIMING[hero.weapon] >= 600);
  }
  const enemies = [...ENEMIES, ...BOSSES];
  for (const enemy of enemies) {
    assert(ENEMY_ATTACKS.includes(enemy.attackStyle));
    assert.equal(attackStyle({ type: 'enemy', actor: enemy.id }), enemy.attackStyle);
  }
  assert.equal(attackStyle({ type: 'poison', actor: null }), null);
  const state = newBattle();
  assert.equal(
    preview(state, [makeAction(state, 'morrow', 'delay', 'mossSlime', 0)]).events[0].skill,
    'delay',
  );
});

test('every buff uses a distinct multicolor 64px illustration without altering its wrapper size', () => {
  const drawings = Object.keys(BUFFS).concat('shield').map(icon);
  assert.equal(new Set(drawings).size, Object.keys(BUFFS).length + 1);
  for (const drawing of drawings) {
    assert(drawing.includes('viewBox="0 0 64 64"'));
    assert((drawing.match(/<path/g) || []).length >= 3);
    assert(new Set(drawing.match(/#[a-f0-9]{6}/g)).size >= 3);
  }
});
