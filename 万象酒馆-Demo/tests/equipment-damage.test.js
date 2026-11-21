import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEquipment } from '../src/equipment-combat.js';

function damageSkill(effects, extra = {}) {
  return {
    id: 'skill-1',
    name: 'Test Skill',
    type: 'damage',
    ap: 1,
    mana: 0,
    target: 'enemy',
    effects,
    ...extra,
  };
}

function baseCombat(skills, extra = {}) {
  return {
    hp: 100,
    mp: 50,
    attack: 10,
    limit: 3,
    skills,
    ...extra,
  };
}

test('single-hit skills receive one equipment damage bonus', () => {
  const combat = baseCombat([damageSkill([{ type: 'damage', value: 10, target: 'enemy' }])]);
  const result = applyEquipment(combat, [{ stats: { skillDamage: 5 } }]);
  assert.equal(result.skills[0].effects[0].value, 15);
});

test('splitting a skill into three hits does not multiply its equipment bonus', () => {
  const combat = baseCombat([
    damageSkill([
      { type: 'damage', value: 3, target: 'enemy' },
      { type: 'damage', value: 3, target: 'enemy' },
      { type: 'damage', value: 4, target: 'enemy' },
    ]),
  ]);
  const result = applyEquipment(combat, [{ stats: { skillDamage: 5 } }]);
  const total = result.skills[0].effects.reduce((sum, e) => sum + e.value, 0);
  assert.equal(total, 15);
});

test('distinct effect targets and conditions share the skill damage bonus', () => {
  const combat = baseCombat([
    damageSkill([
      { type: 'damage', value: 3, target: 'enemy' },
      { type: 'damage', value: 3, target: 'self', when: { type: 'hasShield' } },
      { type: 'damage', value: 4, target: 'enemy', when: { type: 'hpBelow', value: 50 } },
    ]),
  ]);
  const result = applyEquipment(combat, [{ stats: { skillDamage: 5 } }]);
  const total = result.skills[0].effects.reduce((sum, e) => sum + e.value, 0);
  assert.equal(total, 15);
});

test('fixed damage remains fixed with equipment skill damage', () => {
  const combat = baseCombat([
    damageSkill([{ type: 'damage', value: 10, target: 'enemy', flat: true }]),
  ]);
  const result = applyEquipment(combat, [{ stats: { skillDamage: 5 } }]);
  assert.equal(result.skills[0].effects[0].value, 10);
});

test('skills that opt out of equipment damage remain unchanged', () => {
  const combat = baseCombat([
    damageSkill([{ type: 'damage', value: 10, target: 'enemy' }], { skillDamageBonus: false }),
  ]);
  const result = applyEquipment(combat, [{ stats: { skillDamage: 5 } }]);
  assert.equal(result.skills[0].effects[0].value, 10);
});

test('applying equipment does not mutate combat or equipment definitions', () => {
  const combat = baseCombat([damageSkill([{ type: 'damage', value: 10, target: 'enemy' }])]);
  const equipment = [{ stats: { skillDamage: 5 } }];
  const combatSnapshot = structuredClone(combat);
  const equipmentSnapshot = structuredClone(equipment);
  applyEquipment(combat, equipment);
  assert.deepEqual(combat, combatSnapshot);
  assert.deepEqual(equipment, equipmentSnapshot);
});

test('equipment attack scaling preserves authored fixed damage', () => {
  const combat = baseCombat([
    damageSkill([
      { type: 'damage', value: 10, target: 'enemy' },
      { type: 'damage', value: 7, target: 'enemy', flat: true },
    ]),
  ]);
  const result = applyEquipment(combat, [{ stats: { attack: 5 } }]);
  assert.equal(result.skills[0].effects[0].value, 15);
  assert.equal(result.skills[0].effects[1].value, 7);
});
