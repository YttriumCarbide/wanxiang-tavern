import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ENEMIES,
  DEFINITIONS,
  ENCOUNTERS,
  encounterSpec,
  enemySlots,
  HEROES,
  BOSSES,
  BUFFS,
} from '../src/data.js';
import {
  newBattle,
  newEncounter,
  advance,
  preview,
  enemyTimeline,
  makeAction,
  getEnemies,
} from '../src/engine.js';
import { validateGameData } from '../src/validation.js';

test('starter enemies have stronger base stats while keeping predictable single actions', () => {
  for (const id of ['mossSlime', 'sprout', 'pebble']) {
    const enemy = DEFINITIONS[id];
    assert(enemy.hp >= 20 && enemy.hp <= 28);
    assert.equal(enemy.mp, 0);
    assert.equal(enemy.intents.length, 1);
    assert.deepEqual(enemy.buffs, {});
    assert(
      enemy.intents[0].effects.every(
        (effect) => effect.type === 'damage' && effect.value >= 5 && effect.value <= 6,
      ),
    );
    assert((enemy.intents[0].selfShield || 0) <= 3);
  }
  assert.deepEqual(newBattle().enemyIds, ['mossSlime', 'sprout']);
  assert.deepEqual(
    ENCOUNTERS.map((_, index) => encounterSpec(index).enemyIds.length),
    [2, 2, 2, 2, 3],
  );
});

test('one, two and three enemies occupy only their configured positions and timeline cells', () => {
  for (const ids of [['pebble'], ['mossSlime', 'sprout'], ['mossSlime', 'pebble', 'sprout']]) {
    const opening = newEncounter({ map: 'ruins', hpScale: 1, enemyIds: ids });
    assert.deepEqual(
      getEnemies(opening).map((enemy) => enemy.id),
      ids,
    );
    assert.equal(
      Object.values(opening.units).filter((unit) => unit.side === 'enemy').length,
      ids.length,
    );
    const state = advance(preview(opening, []));
    const slots = enemyTimeline(state);
    assert.equal(slots.length, 3 + ids.length);
    assert.equal(slots.filter(Boolean).length, ids.length);
    assert.equal(slots.filter((id) => !id).length, 3);
    const result = preview(state, []);
    assert.equal(result.events.filter((event) => event.type === 'enemy').length, ids.length);
    for (const id of ids) state.units[id].hp = 0;
    assert.equal(advance(preview(state, [])).phase, 'victory');
  }
  assert.deepEqual(enemySlots(['pebble']), [null, 'pebble', null]);
  assert.deepEqual(enemySlots(['mossSlime', 'sprout']), ['mossSlime', null, 'sprout']);
  assert.deepEqual(enemySlots(['mossSlime', 'pebble', 'sprout']), [
    'mossSlime',
    'pebble',
    'sprout',
  ]);
});

test('first encounter can be won using only free-of-mana basic attacks', () => {
  let state = newBattle();
  for (let round = 0; round < 6 && state.phase !== 'victory'; round++) {
    const actions = [];
    for (const actor of state.formation.slice(0, 3)) {
      const forecast = preview(state, actions);
      const target = getEnemies(state).find((enemy) => forecast.final.units[enemy.id].hp > 0);
      if (!target) break;
      for (let start = 0; start < forecast.slots.length; start++) {
        const action = makeAction(state, actor, 'attack', target.id, start);
        if (preview(state, [...actions, action]).valid) {
          actions.push(action);
          break;
        }
      }
    }
    state = advance(preview(state, actions));
  }
  assert.equal(state.phase, 'victory');
  assert(state.round <= 3, 'Starter encounter should be short without spending mana');
  for (const hero of HEROES) {
    assert(state.units[hero.id].hp > 0);
    assert.equal(state.units[hero.id].mp, state.units[hero.id].maxMp);
  }
});

test('empty, overfilled, duplicate and non-enemy encounter definitions are rejected', () => {
  for (const ids of [
    [],
    ['mossSlime', 'sprout', 'pebble', 'hound'],
    ['sprout', 'sprout'],
    ['aegis'],
  ]) {
    const config = structuredClone({
      heroes: HEROES,
      enemies: ENEMIES,
      bosses: BOSSES,
      buffs: BUFFS,
      encounters: ENCOUNTERS,
    });
    config.encounters[0].enemyIds = ids;
    assert(validateGameData(config).length > 0, JSON.stringify(ids));
  }
});
