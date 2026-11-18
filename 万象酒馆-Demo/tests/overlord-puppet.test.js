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
import {
  overlordPhaseProfile,
  overlordReloadBark,
  overlordTargetStage,
} from '../src/overlord-mechanics.js';

test('alchemicalPuppet supports 3-phase Overlord escalation, break layer ramp, and buff ramp', () => {
  const def = DEFINITIONS.alchemicalPuppet;
  assert.equal(def.hp, 320);
  assert.equal(def.overlord, true);
  assert.equal(def.standOnCard, true);
  assert.deepEqual(def.overlordPhases, [0.66, 0.33]);
  assert.equal(overlordPhaseProfile(def, 1).bombSeconds, 40);
  assert.equal(overlordPhaseProfile(def, 2).bombSeconds, 30);
  assert.equal(overlordPhaseProfile(def, 3).bombSeconds, 20);
  assert.equal(overlordPhaseProfile(def, 1).breakLayers, 2);
  assert.equal(overlordPhaseProfile(def, 2).breakLayers, 2);
  assert.equal(overlordPhaseProfile(def, 3).breakLayers, 3);

  let state = newBattle(['alchemicalPuppet']);
  state.phase = 'plan';
  state.round = 1;
  assert.equal(state.units.alchemicalPuppet.bossStage, 1);
  assert.equal(state.units.alchemicalPuppet.breakWindow, null);

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
  assert(!/第二阶段|第三阶段|压迫/.test(String(phase2Event.label || '')));
  assert(!/第二阶段|第三阶段|压迫/.test(String(phase2Event.subtitle || '')));
  assert.equal(res.final.units.alchemicalPuppet.bossStage, 2);
  assert(res.final.units.alchemicalPuppet.block >= 12);
  assert.equal(res.final.units.alchemicalPuppet.buffs.artifact, 2);

  // Advance to round 2 and drop below 33% -> Phase 3
  state = advance(res);
  state.units.alchemicalPuppet.hp = Math.floor(state.units.alchemicalPuppet.maxHp * 0.3);
  res = preview(state, []);
  const phase3Event = res.events.find(
    (e) => e.type === 'bossPhase' && e.actor === 'alchemicalPuppet',
  );
  assert(phase3Event);
  assert.equal(phase3Event.phaseStage, 3);
  assert(!/第二阶段|第三阶段|压迫/.test(String(phase3Event.label || '')));
  assert.equal(res.final.units.alchemicalPuppet.bossStage, 3);
  assert(res.final.units.alchemicalPuppet.buffs.strength >= 1);
  assert.equal(res.final.units.alchemicalPuppet.buffs.artifact, 3);
});

test('artifact buff negates one whole debuff application regardless of stacks, consumes sequentially on separate hits, and persists across rounds', () => {
  const heroId = newBattle(['alchemicalPuppet']).formation[0];
  const baseHero = DEFINITIONS[heroId];
  const heroDefs = {
    [heroId]: {
      ...baseHero,
      skills: [
        ...baseHero.skills,
        {
          id: 'mass-bleed',
          name: '十重出血斩',
          ap: 1,
          mp: 0,
          target: 'enemy',
          effects: [{ type: 'buff', buff: 'bleed', value: 10 }],
        },
        {
          id: 'multi-debuff-barrage',
          name: '十连刻毒咒',
          ap: 1,
          mp: 0,
          target: 'enemy',
          effects: Array.from({ length: 10 }, () => ({ type: 'buff', buff: 'poison', value: 1 })),
        },
      ],
    },
  };
  let state = newBattle(['alchemicalPuppet'], heroDefs);
  state.phase = 'plan';
  state.round = 1;
  assert.equal(state.units.alchemicalPuppet.buffs.artifact, 1);

  // Single 10-stack debuff consumes 1 artifact and leaves bleed at 0
  const singleRes = preview(state, [
    makeAction(state, heroId, 'mass-bleed', 'alchemicalPuppet', 1),
  ]);
  assert.equal(singleRes.final.units.alchemicalPuppet.buffs.artifact || 0, 0);
  assert.equal(singleRes.final.units.alchemicalPuppet.buffs.bleed || 0, 0);
  const blockEv = singleRes.events.find((e) =>
    e.statusTriggers?.some((t) => t.type === 'artifactBlock' && t.id === 'alchemicalPuppet'),
  );
  assert(blockEv, 'artifactBlock statusTrigger should be recorded');

  // Persists across rounds without decay
  const persisted = advance(preview(state, []));
  assert.equal(persisted.units.alchemicalPuppet.buffs.artifact, 1);

  // 10 consecutive debuff applications against 2 artifact stacks -> blocks first 2, lets 8 through
  persisted.units.alchemicalPuppet.buffs.artifact = 2;
  const barrageRes = preview(persisted, [
    makeAction(persisted, heroId, 'multi-debuff-barrage', 'alchemicalPuppet', 1),
  ]);
  const poisonEv = barrageRes.events.find((e) => e.skill === 'multi-debuff-barrage');
  assert.equal(poisonEv.after.units.alchemicalPuppet.buffs.artifact || 0, 0);
  assert.equal(poisonEv.after.units.alchemicalPuppet.buffs.poison, 8);
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

test('alchemicalPuppet charge cycle opens Round 2 Break Window, cancels charged release + later actions when broken, closes immediately if unleashed, and provides reload barks', () => {
  const baseHero = DEFINITIONS.aegis;
  const heroDefs = {
    aegis: {
      ...baseHero,
      limit: 3,
      skills: [
        ...baseHero.skills,
        {
          id: 'fire-breaker',
          name: '熔炉裂斩',
          ap: 1,
          mp: 0,
          target: 'enemy',
          damageType: 'fire',
          effects: [{ type: 'damage', value: 12 }],
        },
        {
          id: 'lightning-breaker',
          name: '雷枢贯击',
          ap: 1,
          mp: 0,
          target: 'enemy',
          damageType: 'lightning',
          effects: [{ type: 'damage', value: 12 }],
        },
      ],
    },
  };
  let state = newBattle(['alchemicalPuppet'], heroDefs);
  state.phase = 'plan';
  state.round = 1;

  // Round 1 regIndex 0 uses Charge_Up -> opens chargingMove for Round 2
  const r1 = preview(state, []);
  const chargeEv = r1.events.find((e) => e.type === 'enemy' && e.chargeStarted);
  assert(chargeEv, 'Round 1 should execute alchemicalPuppet Charge_Up move');
  assert.equal(chargeEv.clip, 'Charge_Up');

  // Round 2 opens special break window and queues Charged Release at slot 2
  const r2 = advance(r1);
  assert.equal(r2.round, 2);
  assert(r2.units.alchemicalPuppet.breakWindow?.active);
  assert.equal(r2.units.alchemicalPuppet.breakWindow.majorWeakness, 'fire');
  const r2ReleaseIntent = intent(r2, 'alchemicalPuppet', 1);
  assert.equal(r2ReleaseIntent.isChargedRelease, true);

  // Trigger Phase 2 count (2 regular actions -> release at slot 2 + followup at slot 5) to verify ALL later actions cancel
  r2.units.alchemicalPuppet.bossStage = 2;
  r2.units.alchemicalPuppet.enraged = true;
  r2.units.alchemicalPuppet.breakWindow.majorWeakness = 'lightning';
  const slots2 = enemyTimeline(r2);
  assert.equal(slots2[2], 'alchemicalPuppet');
  assert.equal(slots2[5], 'alchemicalPuppet');

  // Strike with major weakness (lightning -> -2) at slot 1 BEFORE slot 2 release
  const brokenRun = preview(r2, [
    makeAction(r2, 'aegis', 'lightning-breaker', 'alchemicalPuppet', 1),
  ]);
  assert.equal(brokenRun.final.units.alchemicalPuppet.broken, true);
  const cancelledSlots = brokenRun.events.filter(
    (e) => e.type === 'skip' && e.actor === 'alchemicalPuppet' && e.broken,
  );
  assert.equal(cancelledSlots.length, 2, 'Charged release and follow-up attack must both cancel');

  // Next round Puppet recovers cleanly and continues acting
  const r3 = advance(brokenRun);
  assert.equal(r3.units.alchemicalPuppet.broken, false);
  const r3Run = preview(r3, []);
  assert(
    r3Run.events.some(
      (e) => e.type === 'enemy' && e.actor === 'alchemicalPuppet' && !e.fixedFirstSlot,
    ),
  );

  // If player waits until slot 3 (after slot 2 release fires), breakWindow vanishes when release fires
  const missedRun = preview(r2, [
    makeAction(r2, 'aegis', 'lightning-breaker', 'alchemicalPuppet', 3),
  ]);
  assert.equal(missedRun.final.units.alchemicalPuppet.broken, false);
  assert.equal(missedRun.final.units.alchemicalPuppet.breakWindow, null);

  assert(overlordReloadBark('alchemicalPuppet', 1).includes('刷新网页'));
  assert(overlordReloadBark('alchemicalPuppet', 2).includes('刷新'));
});
