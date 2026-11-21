import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, DEFINITIONS } from '../src/data.js';
import { newBattle, preview, makeAction } from '../src/engine.js';
import { officialCharacter } from '../src/ai/library.js';
import { conditionsMet, normalizeRules } from '../src/triggers.js';

function battle() {
  const definitions = Object.fromEntries(
    HEROES.map((hero) => [
      hero.id,
      { ...structuredClone(hero), buffs: {}, skills: [], equipment: [] },
    ]),
  );
  definitions.aegis = {
    ...officialCharacter('luo-gongxu').combat,
    id: 'aegis',
    equipment: [],
  };
  const state = newBattle(['hound'], definitions, {
    hound: {
      ...structuredClone(DEFINITIONS.hound),
      hp: 1000,
      speed: 1,
      buffs: {},
      tactic: { target: 'fixed' },
      intents: [{ name: 'audit', slot: 0, effects: [{ type: 'damage', value: 1 }] }],
    },
  });
  state.phase = 'plan';
  state.round = 1;
  Object.assign(state.units.aegis, { hp: 20, mp: 0 });
  return state;
}

function equipRule(state, rule) {
  state.heroDefinitions.aegis.equipment.push({
    id: 'audit',
    name: 'audit',
    rules: normalizeRules([rule]),
  });
}

function counterEvents(result) {
  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  const hit = result.events.find((event) => event.type === 'enemy');
  const counter = result.events.find((event) => event.type === 'counter');
  const recovery = result.events.find((event) => event.type === 'counterRecovery');
  assert.ok(hit);
  assert.ok(counter);
  assert.ok(recovery);
  return { hit, counter, recovery };
}

test('counter recovery uses actual enemy HP loss after shield absorption', () => {
  const state = battle();
  state.units.hound.block = 4;
  const { hit, counter, recovery } = counterEvents(preview(state, []));

  assert.equal(hit.after.units.aegis.hp, 19);
  assert.equal(hit.after.units.aegis.mp, 0);
  assert.equal(hit.after.units.hound.hp - counter.after.units.hound.hp, 5);
  assert.equal(counter.after.units.hound.block, 0);
  assert.equal(recovery.after.units.aegis.hp, 24);
  assert.equal(recovery.after.units.aegis.mp, 5);
});

test('plague seal blocks both HP and MP recovery from a successful counter', () => {
  const state = battle();
  state.sinkingPlague = {
    source: 'hound',
    ages: [0, 0, 0],
    frontStreak: { aegis: 2 },
    sealed: { aegis: true },
    backfieldTurns: {},
    corruptedSlot: null,
    stage2CorruptTick: 0,
  };
  const { hit, counter, recovery } = counterEvents(preview(state, []));

  assert.equal(hit.after.units.hound.hp - counter.after.units.hound.hp, 9);
  assert.equal(recovery.after.units.aegis.hp, hit.after.units.aegis.hp);
  assert.equal(recovery.after.units.aegis.mp, hit.after.units.aegis.mp);
  assert.equal(Boolean(recovery.after.units.aegis.counterDisabled), false);
});

test('counter recovery cannot revive an actor killed by its beforeAttack rule', () => {
  const state = battle();
  equipRule(state, {
    mode: 'event',
    event: 'beforeAttack',
    limit: 1,
    target: 'self',
    effects: [{ type: 'damage', value: 1000 }],
  });
  const result = preview(state, []);
  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  assert.ok(result.deaths.some((death) => death.id === 'aegis'));
  for (const event of result.events.filter((entry) =>
    ['counter', 'counterRecovery'].includes(entry.type),
  )) {
    assert.equal(event.after.units.aegis.hp, 0);
    assert.equal(event.after.units.aegis.mp, 0);
  }
  assert.equal(result.final.units.aegis.hp, 0);
  assert.equal(result.final.units.aegis.mp, 0);
  assert.equal(result.final.units.hound.hp, state.units.hound.hp);
  assert.equal(
    result.events.some((event) => event.type === 'counter'),
    false,
  );
});

test('kill rule can match a defeated target at zero HP and reward its living owner', () => {
  const state = battle();
  state.phase = 'opening';
  state.units.hound.hp = 1;
  equipRule(state, {
    mode: 'event',
    event: 'kill',
    limit: 1,
    target: 'self',
    conditions: [{ type: 'hpBelow', subject: 'target', value: 0 }],
    effects: [{ type: 'shield', value: 7 }],
  });
  const action = makeAction(state, 'aegis', 'attack', 'hound', 0);
  const result = preview(state, [action]);

  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  const attack = result.events.find((event) => event.actionId === action.id);
  assert.ok(attack);
  assert.equal(attack.after.units.hound.hp, 0);
  assert.equal(attack.after.units.aegis.hp, 20);
  assert.equal(attack.after.units.aegis.block, 7);
  assert.ok(
    attack.procs.some((proc) => proc.owner === 'aegis' && proc.key === 'equipment:audit:0'),
  );
});

test('defeated-target conditions require kill context and never enable a dead owner', () => {
  const state = battle();
  state.units.hound.hp = 0;
  const conditions = [{ type: 'hpBelow', subject: 'target', value: 0 }];
  assert.equal(conditionsMet(state, 'aegis', conditions, { target: 'hound' }), false);
  const context = { target: 'hound', allowDefeatedTarget: true };
  assert.equal(conditionsMet(state, 'aegis', conditions, context), true);
  state.units.aegis.hp = 0;
  assert.equal(conditionsMet(state, 'aegis', conditions, context), false);
});

for (const event of ['healed', 'manaRestored']) {
  test(`counter recovery does not recursively dispatch ${event} equipment rules`, () => {
    const state = battle();
    equipRule(state, {
      mode: 'event',
      event,
      limit: 1,
      target: 'allEnemies',
      effects: [{ type: 'damage', value: 1 }],
    });
    const { counter, recovery } = counterEvents(preview(state, []));
    assert.equal(recovery.after.units.hound.hp, counter.after.units.hound.hp);
    assert.equal(
      recovery.procs.some((proc) => proc.key === 'equipment:audit:0'),
      false,
    );
  });
}

test('countering stops for the battle when actual recovery fills mana', () => {
  const state = battle();
  state.units.hound.block = 4;
  state.units.aegis.mp = state.units.aegis.maxMp - 5;
  const { recovery } = counterEvents(preview(state, []));
  assert.equal(recovery.after.units.aegis.mp, state.units.aegis.maxMp);
  assert.equal(recovery.after.units.aegis.counterDisabled, true);
});

test('counter attack cancels when its beforeAttack rule defeats the target', () => {
  const state = battle();
  state.units.hound.hp = 1;
  state.heroDefinitions.aegis.equipment.push({
    id: 'audit-cancel',
    name: 'audit',
    rules: normalizeRules([
      {
        mode: 'event',
        event: 'beforeAttack',
        limit: 1,
        target: 'allEnemies',
        effects: [{ type: 'damage', value: 10 }],
      },
      {
        mode: 'event',
        event: 'afterAttack',
        limit: 1,
        target: 'self',
        effects: [{ type: 'shield', value: 7 }],
      },
    ]),
  });
  const result = preview(state, []);

  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  assert.equal(result.final.units.hound.hp, 0);
  assert.equal(result.final.units.aegis.block, 0);
  const enemyHit = result.events.find((event) => event.type === 'enemy');
  assert.ok(enemyHit);
  assert.equal(result.final.units.aegis.hp, enemyHit.after.units.aegis.hp);
  assert.equal(result.final.units.aegis.mp, enemyHit.after.units.aegis.mp);
  assert.equal(
    result.events.some((event) => event.type === 'counter'),
    false,
  );
  const procs = result.events.flatMap((event) => event.procs ?? []);
  assert.ok(procs.some((proc) => proc.key === 'equipment:audit-cancel:0'));
  assert.equal(
    procs.some((proc) => proc.key === 'equipment:audit-cancel:1'),
    false,
  );
});

for (const event of ['beforeAttack', 'afterAttack']) {
  test(`${event} extra damage does not count toward counter recovery`, () => {
    const state = battle();
    equipRule(state, {
      mode: 'event',
      event,
      limit: 1,
      target: 'allEnemies',
      effects: [{ type: 'damage', value: 3 }],
    });
    const { hit, counter, recovery } = counterEvents(preview(state, []));

    assert.equal(hit.after.units.hound.hp - counter.after.units.hound.hp, 12);
    assert.ok(counter.procs.some((proc) => proc.key === 'equipment:audit:0'));
    assert.equal(recovery.after.units.aegis.hp - counter.after.units.aegis.hp, 9);
    assert.equal(recovery.after.units.aegis.mp - counter.after.units.aegis.mp, 9);
  });
}

test('kill conditions can inspect defeated targets without applying effects to them', () => {
  const state = battle();
  state.phase = 'opening';
  state.units.hound.hp = 1;
  equipRule(state, {
    mode: 'event',
    event: 'kill',
    limit: 1,
    target: 'target',
    conditions: [{ type: 'hpBelow', subject: 'target', value: 0 }],
    effects: [{ type: 'shield', value: 7 }],
  });
  const action = makeAction(state, 'aegis', 'attack', 'hound', 0);
  const result = preview(state, [action]);

  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  assert.equal(result.final.units.hound.hp, 0);
  assert.equal(result.final.units.hound.block, 0);
  assert.equal(result.final.units.aegis.block, 0);
  assert.equal(
    conditionsMet(result.final, 'aegis', [{ type: 'hpBelow', subject: 'target', value: 0 }], {
      target: 'hound',
      allowDefeatedTarget: true,
    }),
    true,
  );
  const procs = result.events.flatMap((event) => event.procs ?? []);
  assert.equal(
    procs.some((proc) => proc.key === 'equipment:audit:0'),
    false,
  );
});
