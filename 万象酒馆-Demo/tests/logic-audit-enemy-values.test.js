import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compileEnemyDesign,
  ENEMY_BASE_REVISION,
  restoreEnemyBaseValues,
} from '../src/enemy-base-values.js';
import { encounterLevel, enemyGrowth } from '../src/enemy-growth.js';
import { normalizeEnemy } from '../src/worlds.js';
import { worldFixture } from './fixtures/multiverse.js';

function tieredEnemy() {
  const enemy = structuredClone(worldFixture().enemies[0]);
  delete enemy.hp;
  enemy.tier = 'medium';
  enemy.speed = 3;
  enemy.intents = [
    {
      name: 'Test',
      slots: [0],
      effects: [{ type: 'damage', target: 'opponents', power: 'low' }],
    },
  ];
  delete enemy.enragedIntents;
  return enemy;
}

test('legacy ruins encounters without sequence use the first encounter level', () => {
  assert.equal(encounterLevel({ map: 'ruins' }), 20);
});

for (const target of ['self', 'allAllies', 'lowestAlly']) {
  test(`new enemy damage rejects allied target ${target}`, () => {
    const enemy = tieredEnemy();
    assert.doesNotThrow(() => normalizeEnemy(enemy));
    enemy.intents[0].effects[0].target = target;
    assert.throws(() => normalizeEnemy(enemy), /目标/);
  });
}

test('new enemy buffs reject inherited Object prototype names', () => {
  const enemy = tieredEnemy();
  enemy.intents[0].effects = [{ type: 'buff', buff: 'strength', target: 'self', power: 'low' }];
  assert.doesNotThrow(() => normalizeEnemy(enemy));

  enemy.intents[0].effects[0].buff = 'constructor';
  assert.throws(() => normalizeEnemy(enemy), /敌人状态无效/);
});

test('compilation preserves both phase inputs and remains deterministic', () => {
  const enemy = tieredEnemy();
  const enragedIntents = structuredClone(enemy.intents);
  enragedIntents[0].slots = [0, 2];
  enragedIntents[0].effects.push({
    type: 'buff',
    buff: 'weak',
    target: 'opponents',
    power: 'medium',
  });
  const before = structuredClone({ intents: enemy.intents, enragedIntents });
  const compile = () =>
    compileEnemyDesign(enemy.id, enemy.tier, enemy.speed, enemy.intents, enragedIntents, true);

  const first = compile();
  assert.deepEqual({ intents: enemy.intents, enragedIntents }, before);
  assert.deepEqual(compile(), first);
  assert.deepEqual({ intents: enemy.intents, enragedIntents }, before);
  assert.equal(first.intents[0].effects[0].type, 'damage');
  assert.equal(first.enragedIntents[0].effects[1].buff, 'weak');
  assert(first.hp > 0);
  assert(first.intents[0].effects[0].value > 0);
});

test('legacy migration handles opening and enraged attacks once while preserving flat damage', () => {
  const enemy = structuredClone(worldFixture().enemies[0]);
  delete enemy.baseRevision;
  const move = structuredClone(enemy.intents[0]);
  move.text = 'Test';
  move.effects = [
    { type: 'damage', target: 'opponents', value: 3 },
    { type: 'damage', target: 'opponents', value: 5, flat: true },
    { type: 'heal', target: 'self', value: 4 },
  ];
  enemy.openingIntent = structuredClone(move);
  enemy.intents = [structuredClone(move)];
  enemy.enragedIntents = [structuredClone(move)];
  const before = structuredClone(enemy);

  const migrated = restoreEnemyBaseValues(enemy);
  assert.equal(migrated.hp, 144);
  assert.equal(migrated.baseRevision, ENEMY_BASE_REVISION);
  for (const intent of [migrated.openingIntent, ...migrated.intents, ...migrated.enragedIntents]) {
    assert.deepEqual(
      intent.effects.map((effect) => effect.value),
      [4, 5, 4],
    );
  }
  const migratedBefore = structuredClone(migrated);
  const repeated = restoreEnemyBaseValues(migrated);
  assert.deepEqual(repeated, migratedBefore);
  assert.deepEqual(migrated, migratedBefore);
  assert.deepEqual(enemy, before);
});

test('legacy boss migration changes hp once and preserves damage in both phases', () => {
  const enemy = structuredClone(worldFixture().enemies[2]);
  delete enemy.baseRevision;
  enemy.enragedIntents = structuredClone(enemy.intents);
  const before = structuredClone(enemy);

  const migrated = restoreEnemyBaseValues(enemy);
  assert.equal(migrated.hp, 230);
  assert.equal(migrated.baseRevision, ENEMY_BASE_REVISION);
  assert.deepEqual(migrated.intents, before.intents);
  assert.deepEqual(migrated.enragedIntents, before.enragedIntents);
  assert.deepEqual(restoreEnemyBaseValues(migrated), migrated);
  assert.deepEqual(enemy, before);
});

test('A11 encounterLevel treats invalid sequences as undefined', () => {
  for (const sequence of [undefined, -1, 0.5, NaN, Infinity, -Infinity, '2', null]) {
    assert.equal(encounterLevel({ map: 'ruins', sequence }), 20);
  }
});

test('A11 prototype-like map names use the unknown-map level and finite growth', () => {
  for (const map of ['constructor', '__proto__', 'toString']) {
    const entry = { map, sequence: 0, seed: 37 };
    assert.equal(encounterLevel(entry), 10);
    const growth = enemyGrowth(entry, 0, 'hound');
    assert.equal(Number.isSafeInteger(growth.level), true);
    assert(growth.level >= 9 && growth.level <= 11);
    assert.equal(Number.isFinite(growth.hpScale), true);
    assert.equal(Number.isFinite(growth.damageScale), true);
    assert(growth.hpScale > 0 && growth.damageScale > 0);
  }
});

test('A11 encounterLevel maps a normal ruins sequence', () => {
  const expected = [
    [0, 20],
    [1, 21],
    [2, 21],
    [3, 22],
    [4, 22],
    [5, 23],
    [6, 28],
  ];
  for (const [sequence, level] of expected) {
    assert.equal(encounterLevel({ map: 'ruins', sequence }), level);
  }
});

test('A11 explicit level overrides invalid sequence and levelOffset', () => {
  assert.equal(encounterLevel({ map: 'ruins', sequence: NaN, levelOffset: 5, level: 7 }), 7);
});

test('A11 explicit level clamps to the valid range', () => {
  assert.equal(encounterLevel({ map: 'ruins', level: 0 }), 1);
  assert.equal(encounterLevel({ map: 'ruins', level: 100 }), 99);
});

test('A11 levelOffset shifts the ruins encounter level', () => {
  assert.equal(encounterLevel({ map: 'ruins', sequence: 5, levelOffset: 2 }), 22);
  assert.equal(encounterLevel({ map: 'ruins', levelOffset: -99 }), 1);
});

test('A11 endless mode ignores levelOffset', () => {
  assert.equal(encounterLevel({ map: 'ruins', sequence: 0, levelOffset: 2, endless: true }), 20);
});

test('A12 positive effects accept allied targets', () => {
  const specs = [
    { type: 'heal' },
    { type: 'shield' },
    { type: 'mana' },
    { type: 'buff', buff: 'strength' },
  ];
  for (const spec of specs) {
    for (const target of ['self', 'allAllies', 'lowestAlly']) {
      const enemy = tieredEnemy();
      enemy.intents[0].effects = [{ ...spec, target, power: 'low' }];
      assert.doesNotThrow(() => normalizeEnemy(enemy));
    }
  }
});

test('A12 positive effects reject opponent targets', () => {
  const cases = [
    { type: 'heal', target: 'opponents' },
    { type: 'shield', target: 'opponents' },
    { type: 'mana', target: 'opponents' },
    { type: 'buff', buff: 'strength', target: 'opponents' },
  ];
  for (const effect of cases) {
    const enemy = tieredEnemy();
    enemy.intents[0].effects = [{ ...effect, power: 'low' }];
    assert.throws(() => normalizeEnemy(enemy), /目标|正面状态/);
  }
});

test('A12 negative buffs accept opponents but reject allied targets', () => {
  for (const buff of ['weak', 'poison']) {
    const accepted = tieredEnemy();
    accepted.intents[0].effects = [{ type: 'buff', buff, target: 'opponents', power: 'low' }];
    assert.doesNotThrow(() => normalizeEnemy(accepted));

    for (const target of ['self', 'allAllies', 'lowestAlly']) {
      const rejected = tieredEnemy();
      rejected.intents[0].effects = [{ type: 'buff', buff, target, power: 'low' }];
      assert.throws(() => normalizeEnemy(rejected), /目标|正面状态/);
    }
  }
});

test('A12 restoring preserves a legacy hostile damage target', () => {
  for (const target of ['self', 'allAllies', 'lowestAlly']) {
    const enemy = normalizeEnemy(tieredEnemy());
    enemy.intents[0].effects = [{ type: 'damage', target, value: 3 }];
    const restored = normalizeEnemy(enemy, { restoring: true });
    assert.equal(restored.intents[0].effects[0].target, target);
  }
});

test('A12 restoring preserves legacy hostile buffs on self', () => {
  const enemy = normalizeEnemy(tieredEnemy());
  enemy.intents[0].effects = [{ type: 'buff', buff: 'weak', target: 'self', value: 1 }];
  const restored = normalizeEnemy(enemy, { restoring: true });
  assert.equal(restored.intents[0].effects[0].target, 'self');
});

test('A13 new tiered normalization rejects prototype buff names', () => {
  for (const buff of ['constructor', 'toString', '__proto__']) {
    const enemy = tieredEnemy();
    enemy.intents[0].effects = [{ type: 'buff', buff, target: 'self', power: 'low' }];
    assert.throws(() => normalizeEnemy(enemy), /敌人状态无效/);
  }
});

test('A13 restoring drops invalid prototype buffs but keeps valid damage', () => {
  for (const buff of ['constructor', 'toString', '__proto__']) {
    const enemy = normalizeEnemy(tieredEnemy());
    enemy.intents[0].effects = [
      { type: 'damage', target: 'opponents', value: 3 },
      { type: 'buff', buff, target: 'self', value: 1 },
    ];
    const restored = normalizeEnemy(enemy, { restoring: true });
    assert.equal(restored.intents[0].effects.length, 1);
    assert.equal(restored.intents[0].effects[0].type, 'damage');
  }
});
