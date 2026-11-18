import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFINITIONS } from '../src/data.js';
import {
  newBattle,
  newEncounter,
  enemyTimeline,
  intent,
  preview,
  advance,
  makeAction,
} from '../src/engine.js';
import { playbackBeats } from '../src/playback-timing.js';
import { explorationPreview, quickTestMillFrontier } from '../src/exploration.js';
import { newExpedition, currentEncounterSpec } from '../src/expedition.js';
import { newLibrary } from '../src/ai/library.js';
import { overlordPhaseProfile, overlordTargetStage } from '../src/overlord-mechanics.js';

test('alchemicalPuppet supports 3-phase Overlord escalation, toughness reforging, and buff ramp', () => {
  const def = DEFINITIONS.alchemicalPuppet;
  assert.equal(def.hp, 320);
  assert.equal(def.overlord, true);
  assert.equal(def.standOnCard, true);
  assert.deepEqual(def.overlordPhases, [0.66, 0.33]);
  assert.equal(overlordPhaseProfile(def, 1).bombSeconds, 40);
  assert.equal(overlordPhaseProfile(def, 2).bombSeconds, 30);
  assert.equal(overlordPhaseProfile(def, 3).bombSeconds, 20);

  let state = newBattle(['alchemicalPuppet']);
  state.phase = 'plan';
  state.round = 1;
  assert.equal(state.units.alchemicalPuppet.bossStage, 1);
  assert.equal(state.units.alchemicalPuppet.maxToughness, 7);

  // Drop below 66% -> Phase 2
  state.units.alchemicalPuppet.hp = Math.floor(state.units.alchemicalPuppet.maxHp * 0.65);
  assert.equal(overlordTargetStage(state.units.alchemicalPuppet, def), 2);
  let res = preview(state, []);
  const phase2Event = res.events.find(
    (e) => e.type === 'bossPhase' && e.actor === 'alchemicalPuppet',
  );
  assert(phase2Event);
  assert.equal(phase2Event.phaseStage, 2);
  assert.equal(phase2Event.overlord, true);
  assert.equal(res.final.units.alchemicalPuppet.bossStage, 2);
  assert.equal(res.final.units.alchemicalPuppet.maxToughness, 9);
  assert(res.final.units.alchemicalPuppet.block >= 12);

  // Advance to round 2 and drop below 33% -> Phase 3
  state = advance(res);
  state.units.alchemicalPuppet.hp = Math.floor(state.units.alchemicalPuppet.maxHp * 0.3);
  res = preview(state, []);
  const phase3Event = res.events.find(
    (e) => e.type === 'bossPhase' && e.actor === 'alchemicalPuppet',
  );
  assert(phase3Event);
  assert.equal(phase3Event.phaseStage, 3);
  assert.equal(res.final.units.alchemicalPuppet.bossStage, 3);
  assert.equal(res.final.units.alchemicalPuppet.maxToughness, 10);
  assert(res.final.units.alchemicalPuppet.buffs.strength >= 1);
});

test('gold-chain slot 0 is immune to slow but can be broken by weakness BREAK stun (unless breakable:false)', () => {
  let state = newBattle(['alchemicalPuppet']);
  state.phase = 'plan';
  state.round = 1;
  state.units.alchemicalPuppet.buffs.slow = 10;

  const slotsSlowed = enemyTimeline(state, { alchemicalPuppet: 10 });
  assert.equal(slotsSlowed[0], 'alchemicalPuppet');
  const firstIntent = intent(state, 'alchemicalPuppet', 0);
  assert.equal(firstIntent.fixedFirstSlot, true);
  assert.equal(firstIntent.clip, 'Bomb_Toss');
  // Regular attack pushed to end by slow
  assert.equal(slotsSlowed.at(-1), 'alchemicalPuppet');

  // First normal action arms time-bomb & triggers UI lock
  let res = preview(state, []);
  assert.equal(res.final.overlordUiLocked, 'alchemicalPuppet');
  assert(res.final.pendingAlchemicalBomb, 'Slot 0 should arm pending time-bomb');
  const firstSlotEvent = res.events.find(
    (e) => e.type === 'enemy' && e.actor === 'alchemicalPuppet' && e.fixedFirstSlot,
  );
  assert.equal(firstSlotEvent.overlordDomainLock, true);

  // Weakness break sets bind on next round -> breaks slot 0 chain & skips arming bomb
  const stunnedState = newBattle(['alchemicalPuppet']);
  stunnedState.phase = 'plan';
  stunnedState.round = 1;
  stunnedState.units.alchemicalPuppet.broken = true;
  stunnedState.units.alchemicalPuppet.buffs.bind = 1;
  res = preview(stunnedState, []);
  const skipEvent = res.events.find(
    (e) => e.type === 'skip' && e.actor === 'alchemicalPuppet' && e.at === 0,
  );
  assert(skipEvent);
  assert.equal(skipEvent.fixedSlotBroken, true);
  assert.equal(res.final.pendingAlchemicalBomb, undefined);

  // Contract check: breakable:false fixedFirstSlot is immune to bind
  const unbreakableState = newBattle(
    ['alchemicalPuppet'],
    {},
    {
      alchemicalPuppet: {
        ...DEFINITIONS.alchemicalPuppet,
        fixedFirstSlot: { ...DEFINITIONS.alchemicalPuppet.fixedFirstSlot, breakable: false },
      },
    },
  );
  unbreakableState.phase = 'plan';
  unbreakableState.round = 1;
  unbreakableState.units.alchemicalPuppet.broken = true;
  unbreakableState.units.alchemicalPuppet.buffs.bind = 1;
  res = preview(unbreakableState, []);
  assert(res.final.pendingAlchemicalBomb, 'breakable:false must ignore bind stun');
});

test('time-bomb arming, safe commit defusal, expired detonation, and beat ordering', () => {
  let state = newBattle(['alchemicalPuppet']);
  state.phase = 'plan';
  state.round = 1;
  const r1 = preview(state, []);
  state = advance(r1);
  assert(state.activeAlchemicalBomb);
  assert.equal(state.activeAlchemicalBomb.durationSec, 40);

  // Safe commit before expiration defuses cleanly
  const hero = state.formation[0];
  const r2Safe = preview(state, [makeAction(state, hero, 'attack', 'alchemicalPuppet', 1)]);
  const defuseEv = r2Safe.events.find((e) => e.type === 'bombDefuse');
  assert(defuseEv);
  assert.equal(defuseEv.at, 0);
  const safeBeats = playbackBeats(r2Safe);
  assert.equal(safeBeats[0].events[0].type, 'bombDefuse');

  // Expired timer detonates high damage + 2 vulnerable
  const targetId = state.activeAlchemicalBomb.target;
  const beforeHp = state.units[targetId].hp;
  state.bombExpired = true;
  const r2Blast = preview(state, []);
  const blastEv = r2Blast.events.find((e) => e.type === 'bombDetonate');
  assert(blastEv);
  assert.equal(blastEv.at, 0);
  assert(blastEv.damage >= 18);
  assert(r2Blast.final.units[targetId].hp < beforeHp || r2Blast.final.units[targetId].hp === 0);
  if (blastEv.after.units[targetId].hp > 0) {
    assert(blastEv.after.units[targetId].buffs.vulnerable >= 2);
    assert(r2Blast.final.units[targetId].buffs.vulnerable >= 1);
  }
  const blastBeats = playbackBeats(r2Blast);
  assert.equal(blastBeats[0].events[0].type, 'bombDetonate');
});

test('quickTest option non-destructively swaps mill node 1 to Overlord direct battle and restores cleanly', () => {
  const lib = newLibrary();
  const rawPreview = explorationPreview(lib.exploration.mill, 'mill', {
    developerMode: true,
    quickTest: false,
  });
  assert.equal(rawPreview[0].boss, 'millVoleAlpha');
  assert.equal(rawPreview[4].boss, 'alchemicalPuppet');

  const swappedPreview = explorationPreview(lib.exploration.mill, 'mill', {
    developerMode: true,
    quickTest: true,
  });
  assert.equal(swappedPreview[0].label, '1');
  assert.equal(swappedPreview[0].boss, 'alchemicalPuppet');
  assert.equal(swappedPreview[0].overlord, true);
  assert.equal(swappedPreview[0].quickTestBoss, true);
  assert.equal(swappedPreview[4].label, '4');
  assert.equal(swappedPreview[4].boss, 'millVoleAlpha');

  const frontier = quickTestMillFrontier(lib.exploration.mill, {
    developerMode: true,
    quickTest: true,
  });
  assert.equal(frontier[0].quickTestBoss, true);
  const exp = newExpedition('bossGate', {}, frontier[0]);
  assert.equal(exp.index, 4, 'Quick test must jump directly to encounter 4 (final boss)');
  const spec = currentEncounterSpec(exp);
  assert.deepEqual(spec.enemyIds, ['alchemicalPuppet']);
  const encounterState = newEncounter(spec);
  assert.equal(encounterState.units.alchemicalPuppet.maxHp, Math.round(320 * 1.35));

  // Verify saved library exploration was never mutated
  assert.equal(lib.exploration.mill.frontier[0].boss, 'millVoleAlpha');
});
