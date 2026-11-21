import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFINITIONS, encounterSpec } from '../src/data.js';
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
import {
  explorationPreview,
  quickTestMillFrontier,
  quickTestRuinsFrontier,
} from '../src/exploration.js';
import { ruinsEncounterSpec } from '../src/content/ruins-encounters.js';
import { newExpedition, currentEncounterSpec } from '../src/expedition.js';
import { newLibrary, purgeLegacyRuinsProgress, restoreLibrary } from '../src/ai/library.js';
import {
  overlordDialoguePack,
  overlordPhaseProfile,
  overlordReloadBark,
  overlordSealedBark,
  overlordTargetStage,
  resolveOverlordId,
} from '../src/overlord-mechanics.js';

test('alchemicalPuppet supports 3-phase Overlord escalation, break layer ramp, and buff ramp', () => {
  const def = DEFINITIONS.alchemicalPuppet;
  assert.equal(def.hp, 314);
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
  assert.equal(
    encounterState.units.alchemicalPuppet.maxHp,
    Math.round(DEFINITIONS.alchemicalPuppet.hp * 1.35),
  );

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

test('apepLamb is a solo 3-phase Overlord with charge window, and all Overlords lock UI and expose rewritten dialogue packs', () => {
  const apep = DEFINITIONS.apepLamb;
  assert.equal(apep.hp, 314);
  assert.equal(apep.overlord, true);
  assert.deepEqual(apep.overlordPhases, [0.66, 0.33]);
  assert.deepEqual(ruinsEncounterSpec(5, 4).enemyIds, ['apepLamb']);
  assert.deepEqual(encounterSpec(4, 'apepLamb').enemyIds, ['apepLamb']);
  assert.deepEqual(currentEncounterSpec({ ...newExpedition('apepLamb'), index: 4 }).enemyIds, [
    'apepLamb',
  ]);
  assert.equal(apep.chargeMechanic.cadenceRounds, 3);
  assert.equal(overlordTargetStage({ hp: Math.floor(apep.hp * 0.65), maxHp: apep.hp }, apep), 2);
  assert.equal(overlordTargetStage({ hp: Math.floor(apep.hp * 0.32), maxHp: apep.hp }, apep), 3);

  const expectedOverlords = [
    ['alchemicalPuppet', 'alchemicalPuppet'],
    ['apepLamb', 'apepLamb'],
    ['moonCrown', 'moonEye'],
    ['moonEye', 'moonEye'],
    ['moonRoot', 'moonEye'],
    ['ares', 'ares'],
    ['radiantWyvern', 'radiantWyvern'],
  ];
  for (const [id, resolved] of expectedOverlords) {
    assert.equal(resolveOverlordId(id), resolved);
    const pack = overlordDialoguePack(id);
    assert(pack.entrance.length >= 1);
    assert(pack.domainLock && !/一二三阶段|压迫感/.test(pack.domainLock));
    assert(pack.phase2 && !/第三阶段/.test(pack.phase2));
    assert(pack.phase3 && !/第三阶段/.test(pack.phase3));
    assert(pack.defeat);
    assert(overlordSealedBark(id, 'settings').length > 4);
    assert(overlordReloadBark(id, 1).includes('刷新网页'));
    const state = advance(preview(newBattle([id]), []));
    const run = preview(state, []);
    const expectedLock = id === 'moonCrown' || id === 'moonRoot' ? 'moonEye' : id;
    if (id === 'moonCrown' || id === 'moonRoot') {
      const treeState = advance(preview(newBattle(['moonCrown', 'moonEye', 'moonRoot']), []));
      assert.equal(preview(treeState, []).final.overlordUiLocked, 'moonEye');
    } else {
      assert.equal(run.final.overlordUiLocked, expectedLock);
    }
  }
});

test('purgeLegacyRuinsProgress clears old ruins progress and quickTestApep swaps Ruins node 1 cleanly', () => {
  const fresh = newLibrary();
  assert.equal(fresh.migrations.ruinsResetV2, true);
  assert.equal(purgeLegacyRuinsProgress(fresh), false);

  const legacy = restoreLibrary(newLibrary());
  delete legacy.migrations;
  legacy.unlockedDungeons = ['mill', 'ruins', 'forest'];
  legacy.atlasDiscoveries = [
    { id: 'ruins', name: '界隙遗迹' },
    { id: 'forest', name: '月痕古林' },
  ];
  legacy.exploration.ruins.completed = 6;
  legacy.exploration.ruins.frontier = [{ id: 'old-ruins', sequence: 6 }];
  legacy.exploration.mill.completed = 4;
  legacy.overlandExploration = {
    routes: ['starbell->ruins', 'starbell->forest'],
    legs: ['starbell:ruins', 'starbell:forest'],
  };
  legacy.scripts = [
    { id: 'r1', exploration: { map: 'ruins', id: 'ruins-curse' } },
    { id: 'f1', exploration: { map: 'forest', id: 'forest-1' } },
  ];
  legacy.prepared = 'r1';
  legacy.history = [
    { id: 'r1', map: 'ruins' },
    { id: 'f1', map: 'forest' },
  ];

  assert.equal(purgeLegacyRuinsProgress(legacy), true);
  assert.equal(legacy.migrations.ruinsResetV2, true);
  assert.deepEqual(legacy.unlockedDungeons, ['mill', 'forest']);
  assert.deepEqual(legacy.atlasDiscoveries, [{ id: 'forest', name: '月痕古林' }]);
  assert.equal(legacy.exploration.ruins.completed, 0);
  assert.equal(legacy.exploration.ruins.frontier[0].sequence, 0);
  assert.equal(legacy.exploration.mill.completed, 4);
  assert.deepEqual(legacy.overlandExploration.routes, ['starbell->forest']);
  assert.deepEqual(legacy.overlandExploration.legs, ['starbell:forest']);
  assert.deepEqual(
    legacy.scripts.map((s) => s.id),
    ['f1'],
  );
  assert.equal(legacy.prepared, null);
  assert.deepEqual(
    legacy.history.map((h) => h.id),
    ['f1'],
  );
  assert.equal(purgeLegacyRuinsProgress(legacy), false);

  const normalPreview = explorationPreview(fresh.exploration.ruins, 'ruins', {
    developerMode: true,
    quickTestApep: false,
  });
  assert.equal(normalPreview[0].boss, 'bossGate');
  const quickPreview = explorationPreview(fresh.exploration.ruins, 'ruins', {
    developerMode: true,
    quickTestApep: true,
  });
  assert.equal(quickPreview[0].boss, 'apepLamb');
  assert.equal(quickPreview[0].quickTestBoss, true);
  const quickFrontier = quickTestRuinsFrontier(fresh.exploration.ruins, {
    developerMode: true,
    quickTestApep: true,
  });
  assert.equal(quickFrontier[0].boss, 'apepLamb');
});

test('resolveTheaterTheme supplies valid intro and epilogue artwork across all biomes including mill', async () => {
  const { MAP_IDS } = await import('../src/content/biomes.js');
  const { resolveTheaterTheme } = await import('../src/app/theater-themes.js');
  for (const map of [...MAP_IDS, 'unknown-custom-biome']) {
    for (const mode of ['intro', 'epilogue', 'event-opening', 'quest-opening']) {
      const theme = resolveTheaterTheme({ map, mode });
      assert.equal(typeof theme.artwork, 'string');
      assert(theme.artwork.length > 0, `Missing artwork for ${map}/${mode}`);
    }
  }
});

test('artifact buff is exclusive to alchemicalPuppet among Overlords', () => {
  for (const id of ['apepLamb', 'moonCrown', 'moonEye', 'moonRoot', 'ares', 'radiantWyvern']) {
    let state = newBattle([id]);
    assert.equal(
      state.units[id].buffs.artifact || 0,
      0,
      `${id} should not start with artifact buff`,
    );
    if (Array.isArray(DEFINITIONS[id].overlordPhases)) {
      state.phase = 'plan';
      state.units[id].hp = Math.floor(state.units[id].maxHp * 0.65);
      const p2 = preview(state, []);
      assert.equal(p2.final.units[id].buffs.artifact || 0, 0);
      const phaseEv = p2.events.find((e) => e.type === 'bossPhase' && e.actor === id);
      assert(phaseEv && !phaseEv.logs.some((log) => log.includes('人工制品')));
      const next = advance(p2);
      next.units[id].hp = Math.floor(next.units[id].maxHp * 0.3);
      const p3 = preview(next, []);
      assert.equal(p3.final.units[id].buffs.artifact || 0, 0);
    }
  }
  assert.equal(overlordPhaseProfile(DEFINITIONS.apepLamb, 2).artifactBonus, 0);
  assert.equal(overlordPhaseProfile(DEFINITIONS.apepLamb, 3).artifactBonus, 0);
  assert.equal(overlordPhaseProfile(DEFINITIONS.alchemicalPuppet, 2).artifactBonus, 1);
  assert.equal(overlordPhaseProfile(DEFINITIONS.alchemicalPuppet, 3).artifactBonus, 1);
});

test('cang-ming breaker emblem doubles shield damage, strips 1 extra break pip, heals all 6 allies via stripped shield, and drops mid-battle against alchemicalPuppet', async () => {
  const { BREAKER_EMBLEM_ID, BREAKER_SKILL } = await import('../src/emblems.js');
  const { grantMidBattlePuppetEmblem } = await import('../src/emblem-progression.js');
  const { RING_DESIGNS } = await import('../src/emblem-rings.js');
  const { emblemVisual } = await import('../src/app/emblem-icons.js');

  assert.equal(RING_DESIGNS[BREAKER_EMBLEM_ID].name, '裂匣之鸣');
  assert.equal(emblemVisual(BREAKER_EMBLEM_ID).color, '#f28b49');

  // 1) Passive: double shield damage + +1 extra break pip + shield break grants +6 shield to front row
  const state = newBattle(['warden'], {
    aegis: { ...structuredClone(DEFINITIONS.aegis), emblemId: BREAKER_EMBLEM_ID },
  });
  state.phase = 'plan';
  state.round = 2;
  const hero = state.formation[0];
  state.units[hero].combined = 3;
  state.units.warden.buffs = {};
  state.units.warden.block = 16;
  state.units.warden.hp = 100;
  state.units.warden.maxHp = 100;
  state.units.warden.breakWindow = {
    active: true,
    mode: 'octopath',
    current: 3,
    max: 3,
    majorWeakness: 'fire',
    minorWeaknesses: [],
    triggerActionIndex: 0,
  };
  state.units.warden.toughness = 3;
  const heroAtk = state.heroDefinitions[hero].attack; // 8 for aegis
  const hitRes = preview(state, [makeAction(state, hero, 'attack', 'warden', 0)]);
  const attackEvent = hitRes.events.find((e) => e.actor === hero && e.skill === 'attack');
  assert(attackEvent, 'hero basic attack event should exist');
  assert.equal(attackEvent.after.units.warden.block, Math.max(0, 16 - heroAtk * 2));
  assert.equal(attackEvent.after.units.warden.toughness, 2);
  assert(
    !(attackEvent.after.revealedWeaknesses?.warden || []).includes(
      state.heroDefinitions[hero].attackType,
    ),
    'extra breaker pip must not falsely reveal non-weaknesses',
  );
  for (const fid of state.formation.slice(0, 3)) {
    assert(attackEvent.after.units[fid].block >= 6, 'shield break should fortify all frontliners');
  }

  // 2) Active skill: strips all enemy shield, heals all 6 alive heroes (front + rear), clamps breakable toughness to 1
  const lib = newLibrary();
  const fullState = newBattle(['alchemicalPuppet'], {
    aegis: { ...structuredClone(DEFINITIONS.aegis), emblemId: BREAKER_EMBLEM_ID },
  });
  fullState.phase = 'plan';
  fullState.round = 2;
  const actor = fullState.formation[0];
  fullState.units[actor].combined = 3;
  fullState.units.alchemicalPuppet.block = 14;
  fullState.units.alchemicalPuppet.breakWindow = {
    active: true,
    mode: 'octopath',
    current: 7,
    max: 7,
    majorWeakness: 'fire',
    minorWeaknesses: ['brawl', 'axe', 'lightning'],
    triggerActionIndex: 1,
  };
  fullState.units.alchemicalPuppet.toughness = 7;
  for (const hid of fullState.formation) {
    fullState.units[hid].hp = Math.max(1, fullState.units[hid].hp - 12);
  }
  const beforeHps = Object.fromEntries(
    fullState.formation.map((hid) => [hid, fullState.units[hid].hp]),
  );
  const skillRes = preview(fullState, [
    makeAction(fullState, actor, BREAKER_SKILL.id, 'alchemicalPuppet', 1),
  ]);
  assert(skillRes.valid);
  const skillEvent = skillRes.events.find((e) => e.actor === actor && e.skill === BREAKER_SKILL.id);
  assert(skillEvent, 'breaker combine skill event should exist');
  assert.equal(skillEvent.after.units.alchemicalPuppet.block, 0);
  assert.equal(skillEvent.after.units.alchemicalPuppet.toughness, 1);
  assert.equal(skillEvent.after.units.alchemicalPuppet.breakWindow.current, 1);
  for (const hid of fullState.formation) {
    assert.equal(
      skillEvent.after.units[hid].hp,
      Math.min(fullState.units[hid].maxHp, beforeHps[hid] + 14),
    );
  }

  // 3) Mid-battle trigger on alchemicalPuppet opening break window / round 2
  const exp = newExpedition(
    'bossGate',
    {},
    quickTestMillFrontier(lib.exploration.mill, {
      developerMode: true,
      quickTest: true,
    })[0],
  );
  const battle = currentEncounterSpec(exp);
  const bState = newEncounter(battle);
  bState.phase = 'plan';
  bState.round = 2;
  bState.units.alchemicalPuppet.breakWindow = {
    active: true,
    mode: 'octopath',
    current: 7,
    max: 7,
    majorWeakness: 'fire',
    minorWeaknesses: ['brawl', 'axe', 'lightning'],
    triggerActionIndex: 1,
  };
  bState.units.alchemicalPuppet.toughness = 7;
  const arrival = grantMidBattlePuppetEmblem(lib, bState, exp, () => 0);
  assert(arrival && arrival.id === BREAKER_EMBLEM_ID);
  assert(lib.emblems.includes(BREAKER_EMBLEM_ID));
  assert(arrival.recipient?.actor);
  assert.equal(bState.units[arrival.recipient.actor].emblemCharge, 6);
  assert.equal(bState.heroDefinitions[arrival.recipient.actor].emblemId, BREAKER_EMBLEM_ID);
  assert.equal(
    grantMidBattlePuppetEmblem(lib, bState, exp, () => 0),
    null,
  );
});
