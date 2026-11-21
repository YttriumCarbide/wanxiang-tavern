import test from 'node:test';
import assert from 'node:assert/strict';
import {
  statusStacks,
  regenHealAmount,
  generatedStatusValue,
  decayStatuses,
  upgradeLegacyStatuses,
} from '../src/status-rules.js';

test('statusStacks clamps undefined, negative, fractional and capped values', () => {
  assert.equal(statusStacks('weak', undefined), 0);
  assert.equal(statusStacks('weak', -3), 0);
  assert.equal(statusStacks('weak', 4.9), 4);
  assert.equal(statusStacks('haste', 9), 2);
  assert.equal(statusStacks('bind', 9), 1);
  assert.equal(statusStacks('overload', 9), 1);
  assert.equal(statusStacks('meteor', 9), 1);
  assert.equal(statusStacks('sacrifice', 9), 1);
  assert.equal(statusStacks('strength', 9), 9);
});

test('regenHealAmount computes bounded healing from max hp and regen', () => {
  assert.equal(regenHealAmount(1, 1), 1);
  assert.equal(regenHealAmount(100, 0), 0);
  assert.equal(regenHealAmount(0, 3), 0);
  assert.equal(regenHealAmount(100, 10), 30);
  assert.equal(regenHealAmount(100, 11), 30);
});

test('generatedStatusValue applies poison, bleed and pure buff rules', () => {
  assert.equal(generatedStatusValue('poison', 1), 3);
  assert.equal(generatedStatusValue('poison', 2), 4);
  assert.equal(generatedStatusValue('bleed', 2), 4);
  assert.equal(generatedStatusValue('weak', 1, true), 2);
  assert.equal(generatedStatusValue('vulnerable', 1, true), 2);
  assert.equal(generatedStatusValue('weak', 1, false), 1);
  assert.equal(generatedStatusValue('haste', 8), 2);
});

test('decayStatuses returns empty for no units and skips dead units', () => {
  assert.deepEqual(decayStatuses({}), []);
  const units = {
    dead: { id: 'dead', hp: 0, buffs: { poison: 2, slow: 3 } },
  };
  const changes = decayStatuses(units);
  assert.deepEqual(changes, []);
  assert.deepEqual(units.dead.buffs, { poison: 2, slow: 3 });
});

test('decayStatuses decays living units in iteration order and deletes expired keys', () => {
  const units = {
    first: {
      id: 'first',
      hp: 10,
      buffs: { weak: 1, poison: 2, flying: 1, blind: 1, slow: 1, strength: 2 },
    },
    second: { id: 'second', hp: 1, buffs: { slow: 3 } },
  };
  const changes = decayStatuses(units);
  assert.deepEqual(changes, [
    { id: 'first', buff: 'weak', before: 1, after: 0 },
    { id: 'first', buff: 'poison', before: 2, after: 1 },
    { id: 'first', buff: 'flying', before: 1, after: 0 },
    { id: 'first', buff: 'blind', before: 1, after: 0 },
    { id: 'second', buff: 'slow', before: 3, after: 2 },
  ]);
  assert.deepEqual(units.first.buffs, { poison: 1, slow: 1, strength: 2 });
  assert.deepEqual(units.second.buffs, { slow: 2 });
});

test('upgradeLegacyStatuses upgrades pure buffs and generated statuses without touching damage', () => {
  const combat = {
    skills: [
      {
        id: 'skill-pure',
        effects: [
          { type: 'buff', buff: 'weak', value: 1 },
          { type: 'buff', buff: 'vulnerable', value: 1 },
        ],
      },
      {
        id: 'skill-mixed',
        effects: [
          { type: 'damage', value: 5 },
          { type: 'buff', buff: 'weak', value: 1 },
        ],
      },
    ],
    openingIntent: {
      id: 'intent-open',
      effects: [{ type: 'buff', buff: 'poison', value: 1 }],
    },
    entrySkill: {
      id: 'skill-entry',
      effects: [{ type: 'buff', buff: 'bleed', value: 2 }],
    },
  };
  upgradeLegacyStatuses(combat);
  assert.deepEqual(combat.skills[0].effects, [
    { type: 'buff', buff: 'weak', value: 2 },
    { type: 'buff', buff: 'vulnerable', value: 2 },
  ]);
  assert.deepEqual(combat.skills[1].effects, [
    { type: 'damage', value: 5 },
    { type: 'buff', buff: 'weak', value: 1 },
  ]);
  assert.deepEqual(combat.openingIntent.effects, [{ type: 'buff', buff: 'poison', value: 3 }]);
  assert.deepEqual(combat.entrySkill.effects, [{ type: 'buff', buff: 'bleed', value: 4 }]);
});
