import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFINITIONS, HEROES } from '../src/data.js';
import {
  advance,
  enemyActionsCount,
  enemyIntents,
  enemyTimeline,
  makeAction,
  makeSwap,
  newBattle,
  preview,
  syncEnemyBreakWindows,
} from '../src/engine.js';
import { partyAvailableDamageTypes } from '../src/octopath.js';
import { refreshIronCoachFrontWeakness } from '../src/battle-overlord-mechanics.js';
import { createOverlordReloadWatch } from '../src/app/overlord-reload-watch.js';
import { OVERLORD_DIALOGUES, overlordDialoguePack } from '../src/overlord-mechanics.js';
import {
  OVERLORD_TUTORIALS,
  detectOverlordTutorialTrigger,
} from '../src/content/overlord-tutorials.js';
import { attackStyle } from '../src/combat-art.js';
import { overlordMechanicBadges } from '../src/battle-overlord-badges.js';
import { enemyBreakBar } from '../src/ui.js';
import { MUSIC, OVERLORD_MUSIC } from '../src/audio/config.js';
import { DAMAGE_TYPE_IDS } from '../src/damage-types.js';
import { BIOMES } from '../src/content/biomes.js';
import {
  isTestScriptRecord,
  journeyMemories,
  pendingAdventureMemories,
  pendingMemories,
  purgeScriptFromLibrary,
} from '../src/memory.js';
import { validateGameData } from '../src/validation.js';

function freeSlots(s) {
  return enemyTimeline(s)
    .map((e, i) => (e ? -1 : i))
    .filter((i) => i >= 0);
}

function makeMixedRoster() {
  const mkHero = (id, name, slotWeapon, skillTypeA, skillTypeB) => ({
    ...HEROES[0],
    id,
    name,
    hp: 160,
    maxHp: 160,
    mp: 60,
    maxMp: 60,
    attack: 12,
    weapon: 'sword',
    attackType: slotWeapon,
    skills: [
      {
        id: `${id}-a`,
        name: `${name}技一`,
        ap: 1,
        mp: 0,
        target: 'enemy',
        damageType: skillTypeA,
        effects: [{ type: 'damage', value: 14 }],
      },
      {
        id: `${id}-b`,
        name: `${name}技二`,
        ap: 1,
        mp: 0,
        target: 'enemy',
        damageType: skillTypeB,
        effects: [{ type: 'damage', value: 18 }],
      },
    ],
    entrySkill: {
      id: `${id}-entry`,
      name: `${name}入场`,
      target: 'enemy',
      damageType: skillTypeA,
      effects: [{ type: 'damage', value: 10 }],
    },
  });

  return {
    lyria: mkHero('lyria', '莉亚', 'sword', 'fire', 'light'),
    morrow: mkHero('morrow', '莫罗', 'spear', 'ice', 'spear'),
    serin: mkHero('serin', '瑟琳', 'brawl', 'lightning', 'brawl'),
    vesper: mkHero('vesper', '维斯珀', 'dark', 'dark', 'wind'),
    rook: mkHero('rook', '鲁克', 'axe', 'axe', 'special-weapon'),
    aegis: mkHero('aegis', '长景月汐', 'special-magic', 'special-magic', 'ice'),
  };
}

test('Overlord metadata, dialogues, tutorials, music, camera framing and data validation are complete', () => {
  assert.deepEqual(validateGameData(), []);

  for (const id of ['arenaQualifierIronCoach', 'silverCrownSyndicateArchon']) {
    const def = DEFINITIONS[id];
    assert.equal(def.boss, true);
    assert.equal(def.overlord, true);
    assert(Array.isArray(def.overlordPhases) && def.overlordPhases.length === 2);
    assert(OVERLORD_DIALOGUES[id]);
    assert.equal(overlordDialoguePack(id).rankLabel.length > 0, true);
    assert(OVERLORD_TUTORIALS[id]);
    const trackKey = OVERLORD_MUSIC[id];
    assert(trackKey && MUSIC[trackKey]?.file?.endsWith('.mp3'));
  }

  assert.equal(DEFINITIONS.arenaQualifierIronCoach.speed, 6);
  assert.equal(DEFINITIONS.silverCrownSyndicateArchon.intents[0].effects[0].value, 5);
  assert.equal(BIOMES['duel-arena'].battleHeadroom, undefined);
  assert.equal(BIOMES['silver-shield-exhibition'].battleHeadroom, undefined);
});

test('Iron Coach schedules 2->2->3 fast+speed-1 actions and avoids repeating majorWeakness', () => {
  const roster = makeMixedRoster();
  let state = newBattle(['arenaQualifierIronCoach'], roster);
  state = advance(preview(state, []));
  assert.equal(state.round, 1);

  assert.equal(enemyActionsCount(state, 'arenaQualifierIronCoach'), 2);
  const s1Slots = enemyTimeline(state);
  const s1CoachIndices = s1Slots
    .map((id, idx) => (id === 'arenaQualifierIronCoach' ? idx : -1))
    .filter((idx) => idx >= 0);
  assert.equal(s1CoachIndices.length, 2);
  assert.equal(s1CoachIndices[0] <= 2, true, 'non-charge action acts early under speed 6');
  assert.equal(s1CoachIndices[1], s1Slots.length - 1);

  const s1Intents = enemyIntents(state, 'arenaQualifierIronCoach');
  assert.equal(s1Intents.length, 2);
  assert.equal(s1Intents[1].isCoachChargeSlam, true);
  assert.equal(s1Intents[1].clip, 'Talon_Rend');
  assert.equal(s1Intents[1].fixedSpeed, 1);

  // Stage 1: plain break (2 layers) — 2 direct hits break him & cancel charge slam.
  assert.equal(state.units.arenaQualifierIronCoach.breakWindow?.mode, 'plain');
  assert.equal(state.units.arenaQualifierIronCoach.breakWindow?.max, 2);
  const [slotA, slotB] = freeSlots(state);
  const breakRes = preview(state, [
    makeAction(state, 'lyria', 'lyria-a', 'arenaQualifierIronCoach', slotA),
    makeAction(state, 'morrow', 'morrow-a', 'arenaQualifierIronCoach', slotB),
  ]);
  assert(breakRes.valid);
  assert.equal(breakRes.final.units.arenaQualifierIronCoach.broken, true);
  const skips = breakRes.events.filter(
    (e) => e.type === 'skip' && e.actor === 'arenaQualifierIronCoach',
  );
  assert(skips.length >= 1);

  // Stage 3: expands to 3 actions/round with non-repeating majorWeakness across rounds.
  state.units.arenaQualifierIronCoach.hp = Math.floor(
    state.units.arenaQualifierIronCoach.maxHp * 0.25,
  );
  state.units.arenaQualifierIronCoach.bossStage = 3;
  state.units.arenaQualifierIronCoach.enraged = true;
  assert.equal(enemyActionsCount(state, 'arenaQualifierIronCoach'), 3);
  const s3Slots = enemyTimeline(state);
  const s3CoachIndices = s3Slots
    .map((id, idx) => (id === 'arenaQualifierIronCoach' ? idx : -1))
    .filter((idx) => idx >= 0);
  assert.equal(s3CoachIndices.length, 3);
  assert.equal(s3CoachIndices[2], s3Slots.length - 1);
  const s3Intents = enemyIntents(state, 'arenaQualifierIronCoach');
  assert.equal(s3Intents[2].isCoachChargeSlam, true);

  const seenMajors = [];
  for (let r = 0; r < 3; r++) {
    syncEnemyBreakWindows(state);
    seenMajors.push(state.units.arenaQualifierIronCoach.breakWindow?.majorWeakness);
    state = advance(preview(state, []));
  }
  assert.equal(new Set(seenMajors).size, 3, 'Stage 2/3 majorWeakness should avoid repeats');
});

test('Iron Coach Stage 2 locks majorWeakness to front-row pool, refreshes on swap, and counters non-weakness', () => {
  const roster = makeMixedRoster();
  let state = newBattle(['arenaQualifierIronCoach'], roster);
  state = advance(preview(state, []));
  state.units.arenaQualifierIronCoach.hp = Math.floor(
    state.units.arenaQualifierIronCoach.maxHp * 0.55,
  );
  state.units.arenaQualifierIronCoach.bossStage = 2;
  state.units.arenaQualifierIronCoach.enraged = true;
  syncEnemyBreakWindows(state);

  const bw2 = state.units.arenaQualifierIronCoach.breakWindow;
  assert.equal(bw2?.mode, 'special');
  assert.equal(bw2?.max, 2);

  const frontPoolBefore = partyAvailableDamageTypes(state, roster, { frontOnly: true });
  assert(frontPoolBefore.includes(bw2.majorWeakness));

  bw2.majorWeakness = 'fire';
  bw2.minorWeaknesses = ['ice', 'lightning'];
  state.units.arenaQualifierIronCoach.weaknesses = ['fire', 'ice', 'lightning'];

  const [slotA] = freeSlots(state);
  const nonWeakResult = preview(state, [
    makeAction(state, 'morrow', 'morrow-b', 'arenaQualifierIronCoach', slotA),
  ]);
  assert(nonWeakResult.valid);
  const counterEvent = nonWeakResult.events.find(
    (e) => e.type === 'counter' && e.actor === 'arenaQualifierIronCoach',
  );
  assert(counterEvent, 'Stage 2 Iron Coach should counter non-weakness direct hit');
  assert.equal(counterEvent.isOverlordCounter, true);
  assert.equal(counterEvent.clip, 'Normal_Attack');
  assert.equal(counterEvent.overlordCounterReason, 'non-weakness');
  assert.equal(attackStyle(counterEvent), 'stone-slam');

  const swapRes = preview(state, [makeSwap('vesper', 1, slotA)]);
  assert(swapRes.valid);
  const swappedState = structuredClone(state);
  swappedState.formation = ['aegis', 'vesper', 'morrow', 'serin', 'lyria', 'rook'];
  refreshIronCoachFrontWeakness(swappedState, { ...DEFINITIONS, ...roster });
  const bwAfterSwap = swappedState.units.arenaQualifierIronCoach.breakWindow;
  const frontPoolAfter = partyAvailableDamageTypes(swappedState, roster, { frontOnly: true });
  assert.notEqual(bwAfterSwap.majorWeakness, 'fire');
  assert(frontPoolAfter.includes(bwAfterSwap.majorWeakness));
  assert.equal(bwAfterSwap.current, 2);

  // Card info badge text was removed per user request.
  const badgeHtml = overlordMechanicBadges(
    state,
    'arenaQualifierIronCoach',
    DEFINITIONS.arenaQualifierIronCoach,
  );
  assert(!badgeHtml.includes('overlord-coach-badge'));
  assert(detectOverlordTutorialTrigger(nonWeakResult, state) === 'arenaQualifierIronCoach');
});

test('White Crow collects top-1 + full-pool random extras, shows crossed-out rail (max 4), and limits breaks per attr', () => {
  const roster = makeMixedRoster();
  let state = newBattle(['silverCrownSyndicateArchon'], roster);
  state = advance(preview(state, []));
  assert.equal(state.round, 1);

  assert.equal(enemyActionsCount(state, 'silverCrownSyndicateArchon'), 2);
  assert.equal(state.units.silverCrownSyndicateArchon.breakWindow, null);
  const r1Intents = enemyIntents(state, 'silverCrownSyndicateArchon');
  assert.equal(r1Intents[1].isCharge, true);
  assert.equal(r1Intents[1].clip, 'Charge_Up');

  const [r1A, r1B] = freeSlots(state);
  const round1Res = preview(state, [
    makeAction(state, 'lyria', 'lyria-b', 'silverCrownSyndicateArchon', r1A),
    makeAction(state, 'morrow', 'morrow-a', 'silverCrownSyndicateArchon', r1B),
  ]);
  assert(round1Res.valid);
  const r2State = advance(round1Res);
  assert.equal(r2State.round, 2);

  const archive1 = r2State.activeCollectorArchive?.silverCrownSyndicateArchon;
  assert.deepEqual(archive1?.collected, ['light']);

  const bw2 = r2State.units.silverCrownSyndicateArchon.breakWindow;
  assert.equal(bw2?.mode, 'collector');
  assert.equal(bw2?.max, 4);
  const r2Intents = enemyIntents(r2State, 'silverCrownSyndicateArchon');
  assert.equal(r2Intents[1].isChargedRelease, true);
  assert.equal(r2Intents[1].clip, 'Talon_Rend');

  // Verify collector crossed-out rail renders without any text box badge under unit-name.
  const breakRail = enemyBreakBar(
    DEFINITIONS.silverCrownSyndicateArchon,
    r2State.units.silverCrownSyndicateArchon,
    r2State.units.silverCrownSyndicateArchon,
    'fire',
  );
  assert(breakRail.includes('data-break-mode="collector"'));
  assert(breakRail.includes('is-crossed'));
  const badgeHtml = overlordMechanicBadges(
    r2State,
    'silverCrownSyndicateArchon',
    DEFINITIONS.silverCrownSyndicateArchon,
  );
  assert(!badgeHtml.includes('overlord-collector-badge'));

  // Test rejection counter & 0 break.
  const [r2A] = freeSlots(r2State);
  const rejectRes = preview(r2State, [
    makeAction(r2State, 'lyria', 'lyria-b', 'silverCrownSyndicateArchon', r2A),
  ]);
  assert(rejectRes.valid);
  const rejectCounter = rejectRes.events.find(
    (e) => e.type === 'counter' && e.actor === 'silverCrownSyndicateArchon',
  );
  assert(rejectCounter);
  assert.equal(rejectCounter.after?.units?.silverCrownSyndicateArchon?.breakWindow?.current, 4);
  assert.equal(rejectCounter.overlordCounterReason, 'collected-reject');
  assert.equal(attackStyle(rejectCounter), 'shadow-strike');

  // Test same attribute hits once per round (-2, not -4).
  r2State.formation = ['lyria', 'morrow', 'aegis', 'serin', 'vesper', 'rook'];
  const [sameA, sameB] = freeSlots(r2State);
  const sameAttrRes = preview(r2State, [
    makeAction(r2State, 'morrow', 'morrow-a', 'silverCrownSyndicateArchon', sameA),
    makeAction(r2State, 'aegis', 'aegis-b', 'silverCrownSyndicateArchon', sameB),
  ]);
  assert(sameAttrRes.valid);
  const lastIceAction = sameAttrRes.events
    .filter((e) => e.type === 'hero' && (e.actor === 'morrow' || e.actor === 'aegis'))
    .at(-1);
  assert.equal(lastIceAction?.after?.units?.silverCrownSyndicateArchon?.breakWindow?.current, 2);

  // Crossed-out display is capped strictly at 4 icons even with many excluded entries.
  const cappedBar = enemyBreakBar(
    DEFINITIONS.silverCrownSyndicateArchon,
    {
      ...r2State.units.silverCrownSyndicateArchon,
      breakWindow: {
        ...bw2,
        collectedTypes: ['light', 'fire', 'ice'],
        usedTypes: ['sword', 'spear', 'axe'],
      },
    },
    r2State.units.silverCrownSyndicateArchon,
    null,
  );
  assert.equal((cappedBar.match(/class="enemy-weakness-pill is-crossed/g) || []).length, 4);

  // Non-charge round also displays collector-archive rail cleanly.
  const normalRoundBar = enemyBreakBar(
    DEFINITIONS.silverCrownSyndicateArchon,
    {
      ...r2State.units.silverCrownSyndicateArchon,
      breakWindow: null,
      collectorArchivedTypes: ['light', 'wind', 'dark'],
    },
    r2State.units.silverCrownSyndicateArchon,
    null,
  );
  assert(normalRoundBar.includes('data-break-mode="collector-archive"'));
  assert.equal((normalRoundBar.match(/class="enemy-weakness-pill is-crossed/g) || []).length, 3);

  // Stage 2 (+1 random from all 12 types) & Stage 3 (+2 random from all 12 types).
  r2State.units.silverCrownSyndicateArchon.hp = Math.floor(
    r2State.units.silverCrownSyndicateArchon.maxHp * 0.55,
  );
  r2State.units.silverCrownSyndicateArchon.bossStage = 2;
  r2State.units.silverCrownSyndicateArchon.enraged = true;
  r2State.collectorDamageByType = { silverCrownSyndicateArchon: { fire: 30 } };
  const s2Next = advance(preview(r2State, []));
  assert.equal(s2Next.activeCollectorArchive.silverCrownSyndicateArchon.collected.length, 2);
  assert(
    s2Next.activeCollectorArchive.silverCrownSyndicateArchon.collected.every((t) =>
      DAMAGE_TYPE_IDS.includes(t),
    ),
  );

  s2Next.units.silverCrownSyndicateArchon.hp = Math.floor(
    s2Next.units.silverCrownSyndicateArchon.maxHp * 0.25,
  );
  s2Next.units.silverCrownSyndicateArchon.bossStage = 3;
  s2Next.collectorDamageByType = { silverCrownSyndicateArchon: { lightning: 40 } };
  const s3Next = advance(preview(s2Next, []));
  assert.equal(s3Next.activeCollectorArchive.silverCrownSyndicateArchon.collected.length, 3);
  assert.equal(enemyActionsCount(s3Next, 'silverCrownSyndicateArchon'), 4);
  assert(detectOverlordTutorialTrigger(rejectRes, r2State) === 'silverCrownSyndicateArchon');
});

test('Test scripts and defeated runs stay out of memory, summary queue, and are purged cleanly', () => {
  const testBook = { id: 'script-test', runId: 'run-test', title: '旅途测试', testScript: true };
  assert.equal(isTestScriptRecord(testBook), true);
  assert.equal(isTestScriptRecord({ title: '战斗测试' }), true);
  assert.equal(isTestScriptRecord({ exploration: { quickTestBoss: true } }), true);

  const library = {
    prepared: 'script-test',
    scripts: [
      { id: 'script-test', title: '旅途测试' },
      { id: 'script-real', title: '正式剧本' },
    ],
    history: [
      {
        runId: 'run-test',
        scriptId: 'script-test',
        title: '旅途测试',
        testScript: true,
        complete: true,
        lines: [{ speaker: '旁白', text: '测试片段' }],
      },
      {
        runId: 'run-defeat',
        scriptId: 'script-defeat',
        title: '战败剧本',
        complete: false,
        failed: true,
        lines: [{ speaker: '旁白', text: '败退片段' }],
      },
      {
        runId: 'run-win',
        scriptId: 'script-real',
        title: '正式通关',
        adventureVersion: 1,
        complete: true,
        lines: [{ speaker: '旁白', text: '正式胜出' }],
      },
    ],
  };

  assert.deepEqual(
    pendingMemories(library).map((m) => m.id),
    [],
  );
  assert.deepEqual(
    pendingAdventureMemories(library).map((m) => m.label),
    ['正式通关'],
  );
  assert.deepEqual(
    journeyMemories(library).map((m) => m.title),
    ['正式通关'],
  );

  purgeScriptFromLibrary(library, testBook);
  assert.equal(library.prepared, null);
  assert.equal(
    library.scripts.some((s) => s.id === 'script-test'),
    false,
  );
  assert.equal(
    library.history.some((h) => h.runId === 'run-test'),
    false,
  );
});

test('Overlord reload watch skips test sessions and stays clear after returning to inn', () => {
  const store = new Map();
  let testMode = true;
  let mode = 'battle';
  const watch = createOverlordReloadWatch({
    context: {
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, val) => store.set(key, String(val)),
        removeItem: (key) => store.delete(key),
      },
      session: {
        runtime: {
          get mode() {
            return mode;
          },
          token: 1,
        },
        battle: { state: { phase: 'plan' } },
        journey: { expedition: null },
      },
    },
    currentOverlordDef: () => ({
      id: 'arenaQualifierIronCoach',
      def: DEFINITIONS.arenaQualifierIronCoach,
    }),
    showLine: () => Promise.resolve(),
    isDisposed: () => false,
    isTestSession: () => testMode,
  });

  watch.armReloadWatch({ id: 'arenaQualifierIronCoach', def: DEFINITIONS.arenaQualifierIronCoach });
  watch.markReloadOnUnload();
  assert.equal(watch.readReloadWatch(), null);
  assert.equal(watch.checkReloadFourthWall(), false);

  testMode = false;
  watch.armReloadWatch({ id: 'arenaQualifierIronCoach', def: DEFINITIONS.arenaQualifierIronCoach });
  watch.markReloadOnUnload();
  assert.equal(watch.readReloadWatch()?.reloadedPending, true);

  mode = 'inn';
  watch.clearReloadWatch();
  assert.equal(watch.readReloadWatch(), null);
  assert.equal(watch.checkReloadFourthWall(), false);
});
