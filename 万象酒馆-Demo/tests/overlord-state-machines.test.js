import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, DEFINITIONS } from '../src/data.js';
import {
  newEncounter,
  newBattle,
  preview,
  advance,
  makeAction,
  enemyTimeline,
} from '../src/engine.js';
import { SUPREME_EMBLEM_ID, SUPREME_SKILL, DRAGON_EMBLEM_ID } from '../src/emblems.js';
import { NEGATIVE_STATUSES } from '../src/status-rules.js';
import { clearBattleMechanics } from '../src/emblem-mechanics.js';

function fixture(bossId, changes = {}, emblem = null, level = 10) {
  const heroes = Object.fromEntries(
    HEROES.map((hero) => [
      hero.id,
      {
        ...structuredClone(hero),
        hp: 5000,
        mp: 100,
        limit: 6,
        buffs: {},
        skills: [],
      },
    ]),
  );
  if (emblem) heroes.aegis.emblemId = emblem;
  const def = {
    ...structuredClone(DEFINITIONS[bossId] || DEFINITIONS.darkscaleWarlord),
    id: bossId,
    actions: 1,
    enragedActions: 1,
    finalPhaseActions: 1,
    phaseShields: [0, 0, 0],
    buffs: {},
    intents: [{ name: 'fixture', slot: 0, effects: [{ type: 'damage', value: 10 }] }],
    enragedIntents: null,
    finalPhaseIntents: null,
    ...changes,
  };
  const state = newEncounter(
    {
      enemyIds: [bossId],
      enemyDefinitions: { [bossId]: def },
      growthEntry: { level, seed: 1 },
      level,
    },
    null,
    0,
    heroes,
  );
  state.phase = 'plan';
  state.round = 1;
  return state;
}

function resolve(state, plan = []) {
  const result = preview(state, plan);
  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  return result;
}

function enemyEvents(result, id) {
  return result.events.filter((event) => event.type === 'enemy' && event.actor === id);
}

function availableSlot(state, reserved = []) {
  const unavailable = new Set(reserved);
  const slot = enemyTimeline(state).findIndex(
    (id, index) => id === null && !unavailable.has(index),
  );
  assert.notEqual(slot, -1, 'at least one player action slot must be available');
  return slot;
}

test('confusion redirects the syndicate king’s hidden weapon debuff with the hit', () => {
  const boss = 'banditSyndicateKing';
  const state = newBattle([boss, 'pebble']);
  state.phase = 'plan';
  state.round = 1;
  state.units[boss].buffs.confusion = 1;
  state.units.pebble.hp = state.units.pebble.maxHp = 500;
  const result = resolve(state);
  const lock = result.events.find((event) => event.type === 'hiddenWeaponLock');
  const hit = enemyEvents(result, boss).find((event) => event.confusionTarget);
  assert(lock && hit);
  assert.deepEqual(hit.targets, ['pebble']);
  assert(
    hit.statusApplications.some(
      ({ target, buff }) => target === 'pebble' && buff === lock.weapon.buff,
    ),
  );
});

test('hidden weapons cycle deterministically through a 4-weapon permutation without rerolling on preview', () => {
  const bossId = 'banditSyndicateKing';
  const state = fixture(bossId, {
    hp: 10000,
    actions: 3,
    intents: [
      { name: 'fixture', slot: 0, slots: [0, 1, 2], effects: [{ type: 'damage', value: 1 }] },
    ],
  });
  state.seed = 37;
  const seen = [];
  let current = state;
  for (let round = 1; round <= 8; round++) {
    const input = structuredClone(current);
    const first = resolve(current);
    const second = resolve(current);
    assert.deepEqual(first.final, second.final, `round ${round} final deterministic`);
    assert.deepEqual(first.events, second.events, `round ${round} events deterministic`);
    assert.deepEqual(current, input, `round ${round} input unchanged`);
    const lock = first.events.find((event) => event.type === 'hiddenWeaponLock');
    assert(lock, `round ${round} has hiddenWeaponLock`);
    const weapon = first.final.activeHiddenWeapons[bossId];
    assert.equal(lock.actor, bossId);
    assert.equal(lock.weapon.id, weapon.id);
    assert.equal(weapon.round, round);
    seen.push(weapon.id);
    if (round > 1) assert.notEqual(seen[round - 1], seen[round - 2], 'adjacent ids differ');
    const next = advance(first);
    assert.equal(next.round, round + 1);
    assert(next.activeHiddenWeapons[bossId], 'next round weapon initialized');
    const nextInput = structuredClone(next);
    const nextPreview = resolve(next);
    assert.equal(
      nextPreview.final.activeHiddenWeapons[bossId].id,
      next.activeHiddenWeapons[bossId].id,
    );
    assert.deepEqual(next, nextInput);
    current = next;
  }
  assert.equal(new Set(seen.slice(0, 4)).size, 4, 'first four are a permutation');
  assert.deepEqual(seen.slice(4, 8), seen.slice(0, 4), 'repeat cycle');

  const opening = newBattle(
    [bossId],
    Object.fromEntries(
      HEROES.map((hero) => [
        hero.id,
        { ...structuredClone(hero), hp: 5000, mp: 100, buffs: {}, skills: [] },
      ]),
    ),
    {
      [bossId]: {
        ...structuredClone(DEFINITIONS[bossId]),
        hp: 10000,
        actions: 3,
        intents: [
          { name: 'fixture', slot: 0, slots: [0, 1, 2], effects: [{ type: 'damage', value: 1 }] },
        ],
      },
    },
  );
  opening.seed = 37;
  const opened = advance(resolve(opening, []));
  assert.equal(opened.activeHiddenWeapons[bossId].round, 1);
});

test('hidden weapon buff stacks are fixed at 1 regardless of damage scale and only on damage moves', () => {
  for (const level of [1, 10]) {
    const bossId = 'banditSyndicateKing';
    const state = fixture(
      bossId,
      {
        hp: 10000,
        actions: 1,
        intents: [
          {
            name: 'fixture',
            slot: 0,
            slots: [0, 1, 2, 3],
            effects: [{ type: 'damage', value: 1 }],
          },
        ],
      },
      null,
      level,
    );
    const result = resolve(state);
    const lock = result.events.find((event) => event.type === 'hiddenWeaponLock');
    assert(lock);
    const buff = lock.weapon.buff;
    const event = enemyEvents(result, bossId)[0];
    assert(event);
    for (const slot of [0, 1, 2]) {
      const id = result.final.formation[slot];
      assert.equal(event.after.units[id].buffs[buff], 1, `level ${level} front ${slot}`);
    }
    const rearId = result.final.formation[3];
    assert(event.after.units[rearId].hp < state.units[rearId].hp, 'rear target is hit');
    assert.equal(
      event.after.units[rearId].buffs[buff],
      undefined,
      'rear hits do not receive the weapon',
    );
    for (const slot of [4, 5]) {
      const id = result.final.formation[slot];
      assert.equal(event.after.units[id].buffs[buff], undefined, `level ${level} rear ${slot}`);
    }

    const pure = fixture(
      bossId,
      {
        hp: 10000,
        actions: 1,
        intents: [
          { name: 'fixture', slot: 0, effects: [{ type: 'shield', value: 0, target: 'self' }] },
        ],
      },
      null,
      level,
    );
    const pureResult = resolve(pure);
    const pureLock = pureResult.events.find((event) => event.type === 'hiddenWeaponLock');
    const pureBuff = pureLock.weapon.buff;
    const pureEvent = enemyEvents(pureResult, bossId)[0];
    for (const slot of [0, 1, 2]) {
      const id = pureResult.final.formation[slot];
      assert.equal(
        pureEvent.after.units[id].buffs[pureBuff],
        undefined,
        'non-damage move applies nothing',
      );
    }
  }
});

test('blind misses and rear hits never receive hidden weapon stacks', () => {
  const bossId = 'banditSyndicateKing';
  const state = fixture(bossId, {
    hp: 10000,
    buffs: { blind: 1 },
    actions: 1,
    intents: [
      { name: 'fixture', slot: 0, slots: [0, 1, 3], effects: [{ type: 'damage', value: 1 }] },
    ],
  });
  const result = resolve(state);
  const lock = result.events.find((event) => event.type === 'hiddenWeaponLock');
  const event = enemyEvents(result, bossId)[0];
  assert(lock && event?.blindTarget, 'blind selects one front target to miss');
  const buff = lock.weapon.buff;
  assert.equal(event.after.units[event.blindTarget].hp, state.units[event.blindTarget].hp);
  assert.equal(event.after.units[event.blindTarget].buffs[buff], undefined);
  const rearId = state.formation[3];
  assert(event.after.units[rearId].hp < state.units[rearId].hp, 'rear target is hit');
  assert.equal(event.after.units[rearId].buffs[buff], undefined);
});

test('supreme reflection accumulates three negative statuses and moon eye halves boss hp without later decay', () => {
  const bossId = 'banditSyndicateKing';
  const state = fixture(
    bossId,
    {
      hp: 10000,
      actions: 3,
      intents: [
        { name: 'fixture', slot: 0, slots: [0, 1, 2], effects: [{ type: 'damage', value: 1 }] },
      ],
    },
    SUPREME_EMBLEM_ID,
  );
  state.units.aegis.combined = 6;
  let current = state;
  let third;
  for (let round = 1; round <= 3; round++) {
    third = resolve(current);
    current = advance(third);
  }
  const bossBuffs = third.final.units[bossId].buffs;
  const distinct = NEGATIVE_STATUSES.filter((status) => (bossBuffs[status] || 0) > 0);
  assert(distinct.length >= 3, 'boss has at least three negative statuses');
  for (const slot of [0, 1, 2]) {
    const id = third.final.formation[slot];
    const buffs = third.final.units[id].buffs;
    for (const status of NEGATIVE_STATUSES) assert.equal(buffs[status], undefined, 'front clean');
  }
  assert.equal(current.units.aegis.combined, 3, 'combined decremented once per round');
  const before = structuredClone(current);
  const input = structuredClone(current);
  const result = resolve(current, [
    makeAction(current, 'aegis', SUPREME_SKILL.id, bossId, availableSlot(current)),
  ]);
  const eyeEvent = result.events.find(
    (event) =>
      event.type === 'hero' &&
      event.actor === 'aegis' &&
      event.after.units[bossId].hp <= before.units[bossId].hp,
  );
  assert(eyeEvent);
  assert.equal(
    eyeEvent.after.units[bossId].hp,
    before.units[bossId].hp - Math.floor(before.units[bossId].hp / 2),
  );
  assert.deepEqual(current, input, 'input unchanged');
});

test('authored level-10 bandit reflects three weapon types into a usable moon eye in three rounds', () => {
  const bossId = 'banditSyndicateKing';
  const heroes = Object.fromEntries(
    HEROES.map((hero) => [
      hero.id,
      { ...structuredClone(hero), hp: 50000, mp: 100, limit: 6, buffs: {}, skills: [] },
    ]),
  );
  heroes.aegis.emblemId = SUPREME_EMBLEM_ID;
  let state = newEncounter(
    {
      enemyIds: [bossId],
      map: 'black-market',
      level: 10,
      growthEntry: { level: 10, seed: 37 },
    },
    null,
    0,
    heroes,
  );
  state.seed = 37;
  state.units.aegis.combined = 6;
  state = advance(resolve(state));
  let third;
  for (let round = 1; round <= 3; round += 1) {
    third = resolve(state);
    assert(
      third.events.some((event) => event.type === 'hiddenWeaponLock'),
      `round ${round} should lock an authored hidden weapon`,
    );
    state = advance(third);
  }

  const distinct = NEGATIVE_STATUSES.filter(
    (status) => (third.final.units[bossId].buffs[status] || 0) > 0,
  );
  assert(distinct.length >= 3, `expected three reflected kinds, got ${distinct.join(',')}`);
  for (const slot of [0, 1, 2]) {
    const hero = state.units[state.formation[slot]];
    for (const status of NEGATIVE_STATUSES) assert.equal(hero.buffs[status], undefined);
  }
  assert(state.units.aegis.combined > 0, 'Jiu-Qi remains combined');

  const before = structuredClone(state);
  const eye = resolve(state, [
    makeAction(state, 'aegis', SUPREME_SKILL.id, bossId, availableSlot(state)),
  ]);
  const eyeEvent = eye.events.find(
    (event) => event.type === 'hero' && event.actor === 'aegis' && event.skill === SUPREME_SKILL.id,
  );
  assert(eyeEvent, 'moon eye resolves against the authored boss');
  assert.equal(
    eyeEvent.after.units[bossId].hp,
    before.units[bossId].hp - Math.floor(before.units[bossId].hp / 2),
  );
});

test('eclipsescale clean round end grants iron capped at 4 and shield scaled by damageScale', () => {
  const bossId = 'fixture-eclipsescale';
  const heroes = Object.fromEntries(
    HEROES.map((hero) => [
      hero.id,
      { ...structuredClone(hero), hp: 5000, mp: 100, limit: 6, buffs: {}, skills: [] },
    ]),
  );
  const def = {
    ...structuredClone(DEFINITIONS[bossId] || DEFINITIONS.darkscaleWarlord),
    id: bossId,
    actions: 1,
    enragedActions: 1,
    finalPhaseActions: 1,
    phaseShields: [0, 0, 0],
    buffs: {},
    intents: [
      { name: 'fixture', slot: 0, effects: [{ type: 'shield', value: 0, target: 'self' }] },
    ],
    enragedIntents: null,
    finalPhaseIntents: null,
  };
  const state = newBattle([bossId], heroes, { [bossId]: def });
  state.phase = 'plan';
  state.round = 1;
  state.units[bossId].damageScale = 1.8;
  let current = state;
  for (let round = 1; round <= 5; round++) {
    const result = resolve(current);
    const unit = result.final.units[bossId];
    assert.equal(unit.buffs.iron || 0, Math.min(4, round), `round ${round} iron`);
    assert.equal(unit.block, 11, `round ${round} block`);
    current = advance(result);
  }

  const poisoned = fixture(bossId, {
    actions: 1,
    intents: [
      { name: 'fixture', slot: 0, effects: [{ type: 'shield', value: 0, target: 'self' }] },
    ],
  });
  poisoned.units[bossId].damageScale = 1.8;
  poisoned.units[bossId].buffs.poison = 1;
  const poisonResult = resolve(poisoned);
  assert.equal(poisonResult.final.units[bossId].buffs.iron || 0, 0);
  assert.equal(poisonResult.final.units[bossId].block, 0);
  assert.equal(poisonResult.final.units[bossId].buffs.poison || 0, 0);

  const broken = fixture(bossId, {
    actions: 1,
    intents: [
      { name: 'fixture', slot: 0, effects: [{ type: 'shield', value: 0, target: 'self' }] },
    ],
  });
  broken.units[bossId].damageScale = 1.8;
  broken.units[bossId].broken = true;
  const brokenResult = resolve(broken);
  assert.equal(brokenResult.final.units[bossId].buffs.iron || 0, 0);
});

test('iron bonus attack damage scales with iron stacks', () => {
  const bossId = 'darkscaleWarlord';
  const low = fixture(bossId, {
    actions: 1,
    intents: [{ name: 'fixture', slot: 0, effects: [{ type: 'damage', value: 10 }] }],
  });
  const high = fixture(bossId, {
    actions: 1,
    intents: [{ name: 'fixture', slot: 0, effects: [{ type: 'damage', value: 10 }] }],
  });
  high.units[bossId].buffs.iron = 4;
  const lowResult = resolve(low);
  const highResult = resolve(high);
  const lowEvent = enemyEvents(lowResult, bossId)[0];
  const highEvent = enemyEvents(highResult, bossId)[0];
  const target = lowResult.final.formation[0];
  const lowLoss = low.units[target].hp - lowEvent.after.units[target].hp;
  const highLoss = high.units[target].hp - highEvent.after.units[target].hp;
  assert.equal(lowLoss, 18);
  assert.equal(highLoss, 24);
  assert(highLoss > lowLoss);
});

test('dragon curse applies vulnerable weak slow once per round and consumes iron', () => {
  const bossId = 'darkscaleWarlord';
  const state = fixture(
    bossId,
    {
      actions: 1,
      intents: [
        { name: 'fixture', slot: 0, effects: [{ type: 'shield', value: 0, target: 'self' }] },
      ],
    },
    DRAGON_EMBLEM_ID,
  );
  state.units.aegis.combined = 3;
  state.units[bossId].buffs.iron = 4;
  state.heroDefinitions.aegis.skills = [
    {
      id: 'debuffs',
      name: 'fixture',
      ap: 1,
      mp: 0,
      target: 'enemy',
      effects: [
        { type: 'buff', buff: 'vulnerable', value: 1 },
        { type: 'buff', buff: 'weak', value: 1 },
        { type: 'buff', buff: 'slow', value: 1 },
      ],
    },
  ];
  const plan = [
    makeAction(state, 'aegis', 'attack', bossId, availableSlot(state)),
    makeAction(state, 'aegis', 'debuffs', bossId, availableSlot(state, [availableSlot(state)])),
  ];
  const result = resolve(state, plan);
  const attackEvent = result.events.find(
    (event) => event.type === 'hero' && event.actor === 'aegis' && event.skill === 'attack',
  );
  assert(attackEvent, 'attack event present');
  const afterAttack = attackEvent.after.units[bossId];
  assert(afterAttack.hp > 0, 'boss survives');
  assert((afterAttack.buffs.vulnerable || 0) > 0);
  assert((afterAttack.buffs.weak || 0) > 0);
  assert((afterAttack.buffs.slow || 0) > 0);
  assert.equal(afterAttack.buffs.iron || 0, 2);
  assert.equal(
    result.final.units[bossId].buffs.iron || 0,
    2,
    'iron consumed only once in same round',
  );
});

test('break clears iron and round end does not regrow it', () => {
  const bossId = 'darkscaleWarlord';
  const state = fixture(bossId, {
    actions: 1,
    speed: 1,
    intents: [
      { name: 'fixture', slot: 0, effects: [{ type: 'shield', value: 0, target: 'self' }] },
    ],
  });
  state.units[bossId].buffs.iron = 4;
  state.units[bossId].breakWindow = {
    active: true,
    mode: 'octopath',
    current: 1,
    max: 1,
    majorWeakness: 'fire',
    minorWeaknesses: [],
    triggerActionIndex: 0,
  };
  state.units[bossId].toughness = 1;
  state.units[bossId].maxToughness = 1;
  state.heroDefinitions.aegis.skills = [
    {
      id: 'break-hit',
      name: 'fixture',
      ap: 1,
      mp: 0,
      target: 'enemy',
      damageType: 'fire',
      effects: [{ type: 'damage', value: 1 }],
    },
  ];
  const slot = availableSlot(state);
  assert.ok(slot < enemyTimeline(state).indexOf(bossId), 'hit before the break window closes');
  const result = resolve(state, [makeAction(state, 'aegis', 'break-hit', bossId, slot)]);
  assert.equal(result.final.units[bossId].broken, true);
  assert.equal(result.final.units[bossId].buffs.iron || 0, 0);
  const next = advance(result);
  assert.equal(next.units[bossId].buffs.iron || 0, 0);
});

test('warlord rally summons capped minions on cadence without minion actions in summoning round', () => {
  const bossId = 'darkscaleWarlord';
  const state = fixture(bossId, {
    actions: 2,
    intents: [{ name: 'fixture', slot: 0, warlordRally: true, effects: [] }],
    eclipsescaleConfig: { gainShieldOnCleanRoundEnd: 0, gainIronOnCleanRoundEnd: 0 },
  });
  const first = resolve(state);
  const firstSummons = first.final.enemyIds.filter((id) => id !== bossId);
  assert.equal(firstSummons.length, 2, 'rally fills two available slots');
  for (const id of firstSummons) {
    assert.equal(first.final.units[id].maxHp, 58);
    assert.equal(enemyEvents(first, id).length, 0, 'no minion action in summoning round');
  }

  const full = fixture(bossId, {
    actions: 1,
    intents: [{ name: 'fixture', slot: 0, warlordRally: true, effects: [] }],
  });
  for (const id of ['filler-a', 'filler-b']) {
    full.enemyDefinitions[id] = { ...structuredClone(DEFINITIONS.hound), id };
    full.units[id] = { ...structuredClone(full.units[bossId]), id, buffs: {} };
    full.enemyIds.push(id);
  }
  const fullResult = resolve(full);
  assert.deepEqual(
    fullResult.final.enemyIds,
    full.enemyIds,
    'full slots preserve existing enemies',
  );

  let next = advance(first);
  for (const id of firstSummons) {
    next.units[id].hp = 0;
    next.units[id].withdrawn = true;
  }
  next.enemyIds = next.enemyIds.filter((id) => !firstSummons.includes(id));
  const round2 = resolve(next);
  assert.equal(round2.final.enemyIds.length, 1, 'cadence blocks a summon on round 2');

  next = advance(round2);
  const round3 = resolve(next);
  const spawned = round3.final.enemyIds.filter((id) => id !== bossId);
  assert.equal(spawned.length, 2, 'the next cadence round fills two available slots');
  for (const id of spawned) {
    const unit = round3.final.units[id];
    assert.equal(unit.speciesKey, 'riftDarkDust');
    assert.equal(unit.level, 10);
    assert.equal(unit.maxHp, 58);
    assert.equal(unit.damageScale, 1.8);
    assert.equal(round3.final.enemyDefinitions[id].speciesId, 'riftDarkDust');
    assert.equal(enemyEvents(round3, id).length, 0, 'no minion action in summoning round');
  }
  next = advance(round3);
  next.enemyDefinitions[bossId].intents = [
    { name: 'fixture', slot: 0, warlordConsume: true, effects: [] },
  ];
  next.enemyDefinitions[bossId].actions = 1;
  const consume = resolve(next);
  const consumeEvent = enemyEvents(consume, bossId)[0];
  assert(consumeEvent, 'owner consumes the summons');
  for (const id of spawned) {
    assert.equal(consume.final.units[id].hp, 0);
    assert.equal(consume.final.units[id].withdrawn, true);
    assert(
      enemyEvents(consume, id).every((event) => event.at <= consumeEvent.at),
      'minions cannot act after the consuming move',
    );
  }
});

test('warlord consume absorbs minions for block and strength and does not gain when none remain', () => {
  const bossId = 'darkscaleWarlord';
  const state = fixture(bossId, {
    actions: 2,
    intents: [{ name: 'fixture', slot: 0, warlordRally: true, effects: [] }],
    eclipsescaleConfig: { gainShieldOnCleanRoundEnd: 0, gainIronOnCleanRoundEnd: 0 },
  });
  const first = resolve(state);
  let next = advance(first);
  next.enemyDefinitions[bossId].intents = [
    { name: 'fixture', slot: 0, warlordConsume: true, effects: [] },
  ];
  next.enemyDefinitions[bossId].actions = 1;
  const consume = resolve(next);
  const ownerEvent = enemyEvents(consume, bossId)[0];
  assert.equal(ownerEvent.after.units[bossId].block, 28);
  assert.equal(ownerEvent.after.units[bossId].buffs.strength, 2);
  const dust = consume.final.enemyIds.filter((id) => id !== bossId);
  assert.equal(dust.length, 0);
  for (const id of first.final.enemyIds.filter((id) => id !== bossId)) {
    assert.equal(consume.final.units[id].hp, 0);
    assert.equal(consume.final.units[id].withdrawn, true);
  }
  const turn3 = advance(consume);
  const again = resolve(turn3);
  const againEvent = enemyEvents(again, bossId)[0];
  assert.equal(againEvent.after.units[bossId].buffs.strength, 2);
  assert.equal(resolve(advance(again)).valid, true);
});

test('clearBattleMechanics removes active hidden weapons and victory does not carry them', () => {
  const bossId = 'banditSyndicateKing';
  const state = fixture(bossId, {
    hp: 10000,
    actions: 3,
    intents: [
      { name: 'fixture', slot: 0, slots: [0, 1, 2], effects: [{ type: 'damage', value: 1 }] },
    ],
  });
  const locked = advance(resolve(state));
  assert(locked.activeHiddenWeapons[bossId]);
  const cleaned = structuredClone(locked);
  clearBattleMechanics(cleaned);
  const weapons = cleaned.activeHiddenWeapons;
  assert(!weapons || !weapons[bossId], 'old owner cannot remain');
  const fresh = newEncounter(
    {
      enemyIds: [bossId],
      enemyDefinitions: { [bossId]: structuredClone(DEFINITIONS[bossId]) },
      growthEntry: { level: 10, seed: 1 },
      level: 10,
    },
    locked,
    0,
    Object.fromEntries(
      HEROES.map((hero) => [
        hero.id,
        { ...structuredClone(hero), hp: 5000, mp: 100, buffs: {}, skills: [] },
      ]),
    ),
  );
  assert.equal(fresh.phase, 'opening');
  assert(!fresh.activeHiddenWeapons || !fresh.activeHiddenWeapons[bossId]);

  const kill = fixture(bossId, {
    hp: 1,
    actions: 1,
    intents: [{ name: 'fixture', slot: 0, effects: [{ type: 'damage', value: 1 }] }],
  });
  kill.heroDefinitions.aegis.skills = [
    {
      id: 'finish',
      name: 'fixture',
      ap: 1,
      mp: 0,
      target: 'enemy',
      effects: [{ type: 'damage', value: 9999 }],
    },
  ];
  const victory = resolve(kill, [makeAction(kill, 'aegis', 'finish', bossId, availableSlot(kill))]);
  assert.equal(victory.final.units[bossId].hp, 0);
  const after = advance(victory);
  assert.equal(after.phase, 'victory');
  assert(!after.activeHiddenWeapons || !after.activeHiddenWeapons[bossId]);
});
