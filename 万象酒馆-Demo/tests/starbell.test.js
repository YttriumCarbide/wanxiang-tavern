import { CHAPTER_TASKS, chapterTaskTurn, acceptChapterTask } from '../src/chapters/starbell-rp.js';
import { starbellDefense } from '../src/chapters/starbell-defense.js';
import { createAdventureState } from '../src/adventure/state.js';
import { completeAdventureNode, chooseRest, expeditionNodeType } from '../src/expedition.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary, restoreLibrary, compileRoster } from '../src/ai/library.js';
import {
  restoreStarbell,
  chapterActions,
  applyChapterAction,
  chapterBattleResult,
  chapterDay,
  visitChapterScene,
  confirmChapterTask,
} from '../src/chapters/starbell-state.js';
import { chapterBattleSpec, chapterCompanion } from '../src/chapters/starbell-content.js';
import { newExpedition, beginEncounter, completeEncounter } from '../src/expedition.js';
import { restoreGrowth } from '../src/growth.js';
import { advance, preview } from '../src/engine.js';
import { buildPlan } from './planner.js';
import {
  CHAPTER_INVESTIGATIONS,
  startInvestigation,
  discoverChapterClue,
  investigationProgress,
} from '../src/chapters/starbell-investigation.js';

function findClues(state, key) {
  if (!CHAPTER_INVESTIGATIONS[key]) return;
  startInvestigation(state, key);
  for (const clue of CHAPTER_INVESTIGATIONS[key].clues.slice(0, 2))
    discoverChapterClue(state, key, clue.id);
}

function morning(state) {
  state.phase = 'morning';
  for (const scene of ['street', 'city-center', 'market', 'rampart'])
    visitChapterScene(state, scene);
  applyChapterAction(state, 'festival', 'city-center');
  applyChapterAction(state, 'fountain', 'city-center');
  applyChapterAction(state, 'revelation', 'tavern');
}
test('three-day chapter requires physical clues and real battle results, recruitment is optional', () => {
  const state = restoreStarbell();
  morning(state);
  assert.throws(() => applyChapterAction(state, 'next-day', 'tavern'));
  assert.throws(() => applyChapterAction(state, 'battle-scout', 'outskirts'));
  applyChapterAction(state, 'permit', 'rampart');
  completeTask(state, 'tracks', 'outskirts');
  assert.throws(() => chapterBattleResult(state, 'scout', true));
  applyChapterAction(state, 'battle-scout', 'outskirts');
  chapterBattleResult(state, 'scout', true);
  assert.equal(state.phase, 'day1done');
  applyChapterAction(state, 'mayor-absent', 'rampart');
  applyChapterAction(state, 'next-day', 'tavern');
  completeTask(state, 'warn', 'rampart');
  completeTask(state, 'tower', 'outskirts');
  applyChapterAction(state, 'battle-elite', 'outskirts');
  chapterBattleResult(state, 'elite', true);
  completeTask(state, 'defense', 'rampart');
  assert.equal(chapterDay(state), 2);
  applyChapterAction(state, 'next-day', 'tavern');
  assert.throws(() => applyChapterAction(state, 'battle-boss', 'rampart'));
  completeTask(state, 'evacuation', 'city-center');
  completeTask(state, 'aid', 'market');
  completeTask(state, 'barricade', 'rampart');
  applyChapterAction(state, 'battle-boss', 'rampart');
  chapterBattleResult(state, 'boss', true);
  assert.equal(state.phase, 'won');
  assert.deepEqual(state.recruited, []);
  assert.throws(() => chapterBattleResult(state, 'boss', true));
});
test('failure cannot unlock the next day, one encounter uses the original combat engine', () => {
  const state = restoreStarbell();
  morning(state);
  for (const [id, scene] of [
    ['permit', 'rampart'],
    ['tracks', 'outskirts'],
    ['battle-scout', 'outskirts'],
  ])
    Object.hasOwn(CHAPTER_TASKS, id)
      ? completeTask(state, id, scene)
      : applyChapterAction(state, id, scene);
  chapterBattleResult(state, 'scout', false);
  assert.equal(state.phase, 'failed');
  assert.equal(chapterDay(state), 1);
  assert.equal(chapterActions(state, 'tavern').length, 0);
  const library = newLibrary();
  for (const key of ['scout', 'elite', 'boss']) {
    const expedition = newExpedition('bossGate', compileRoster(library));
    expedition.chapter = { key, spec: chapterBattleSpec(key) };
    const battle = beginEncounter(expedition);
    assert(battle.enemyIds.every((id) => battle.units[id]?.hp > 0));
    assert.throws(() => completeEncounter(expedition, battle), /won/);
    battle.phase = 'victory';
    assert.equal(completeEncounter(expedition, battle).complete, true);
    assert.equal(expedition.status, 'complete');
    assert.throws(() => completeEncounter(expedition, battle), /recorded/);
  }
});
test('recruits persist as playable characters and unfinished personal stories remain after victory', () => {
  const library = newLibrary();
  const state = library.starbell;
  state.phase = 'won';
  state.flags = ['warn', 'elite'];
  for (const key of ['eirin', 'novi', 'mirei']) {
    const scene = key === 'eirin' ? 'rampart' : 'market';
    for (const action of ['meet', 'help', 'finish', 'invite'])
      applyChapterAction(state, `${action}-${key}`, scene);
    const member = chapterCompanion(key);
    assert(member.combat.customPortrait.includes('/npc-cards/'));
    assert(member.combat.customStanding.includes('/gal-npc-cast/'));
    assert.notEqual(member.combat.customPortrait, member.combat.customStanding);
    library.characters.push({ ...member, growth: restoreGrowth(null, member.id) });
  }
  const restored = restoreLibrary(library);
  assert.equal(restored.starbell.recruited.length, 3);
  for (let index = 0; index < 3; index++)
    restored.party[index] = `starbell-${['eirin', 'novi', 'mirei'][index]}`;
  const roster = compileRoster(restored);
  assert.deepEqual(
    Object.values(roster)
      .slice(0, 3)
      .map((hero) => hero.name),
    ['艾琳', '诺薇', '米蕾'],
  );
});
test('the opening chapter boss can be won with the existing party and no local recruits', () => {
  const library = newLibrary();
  const expedition = newExpedition('starbell-boss-0', compileRoster(library));
  expedition.chapter = { key: 'boss', spec: chapterBattleSpec('boss') };
  let battle = beginEncounter(expedition);
  for (let round = 0; round < 35 && !['victory', 'defeat'].includes(battle.phase); round++)
    battle = advance(preview(battle, buildPlan(battle)));
  assert.equal(battle.phase, 'victory');
});

function completeTask(state, key, scene) {
  findClues(state, key);
  const turn = chapterTaskTurn(state, key, '我根据实物线索提出行动并和相关人员核实。');
  assert.equal(
    acceptChapterTask(
      { inventory: {} },
      state,
      key,
      turn,
      {
        content: '实际行动取得了可核实的结果。',
        adventure: {
          episodeId: turn.episodeId,
          revision: turn.boss.revision,
          tasks: turn.goals.map((goal) => ({
            id: goal.id,
            status: 'completed',
            evidence: '本轮实施、核对并获得相关人员明确回应。',
          })),
          patches: [],
        },
      },
      crypto.randomUUID(),
    ),
    true,
  );
  confirmChapterTask(state, key, scene);
}
test('chapter RP preserves pending goals, rejects invalid data and restores confirmed evidence', () => {
  const state = restoreStarbell();
  morning(state);
  applyChapterAction(state, 'permit', 'rampart');
  assert.throws(() => applyChapterAction(state, 'tracks', 'outskirts'), /实际互动/);
  assert.throws(() => chapterTaskTurn(state, 'tracks', '直接宣布查清'), /线索/);
  startInvestigation(state, 'tracks');
  discoverChapterClue(state, 'tracks', 'scales');
  assert.equal(discoverChapterClue(state, 'tracks', 'scales'), null);
  assert.equal(investigationProgress(state, 'tracks').ready, false);
  assert.throws(() => chapterTaskTurn(state, 'tracks', '只凭一片鳞'), /线索/);
  discoverChapterClue(state, 'tracks', 'cart');
  const turn = chapterTaskTurn(state, 'tracks', '我先看一眼路边。');
  assert.deepEqual(
    turn.investigation.found.map((clue) => clue.id),
    ['scales', 'cart'],
  );
  assert(!JSON.stringify(turn.scene).includes('草茎朝道路'));
  assert(!JSON.stringify(turn.investigation).includes('point'));
  const pending = {
    content: '这里只发现了几道车辙，还不能确认去向。',
    adventure: { episodeId: turn.episodeId, revision: 0, tasks: [], patches: [] },
  };
  assert.equal(acceptChapterTask({}, state, 'tracks', turn, pending, 'turn-1'), false);
  assert.throws(() => confirmChapterTask(state, 'tracks', 'outskirts'), /尚未达成/);
  assert.throws(() =>
    acceptChapterTask(
      {},
      state,
      'tracks',
      turn,
      {
        ...pending,
        adventure: {
          ...pending.adventure,
          tasks: [{ id: 'made-up', status: 'completed', evidence: '自称完成' }],
        },
      },
      'turn-2',
    ),
  );
  assert.equal(state.tasks.tracks.history.length, 2);
  assert(!state.flags.includes('tracks'));
  completeTask(state, 'tracks', 'outskirts');
  const restored = restoreStarbell(state);
  assert.equal(restored.tasks.tracks.goals['goal-1'].status, 'completed');
  assert(restored.flags.includes('cart'));
});
test('the final invasion carries resources through the standard three battles and two RP nodes', () => {
  const chapter = starbellDefense(1);
  const trip = newExpedition('bossGate', compileRoster(newLibrary()));
  trip.chapter = chapter;
  trip.adventure = createAdventureState(chapter.book, trip.id);
  const types = [];
  for (let index = 0; index < 5; index++) {
    types.push(expeditionNodeType(trip));
    if (index === 1) {
      trip.adventure.event.resolved = true;
      completeAdventureNode(trip, chapter.book);
      continue;
    }
    if (index === 3) {
      for (const goal of Object.values(trip.adventure.goals)) goal.status = 'completed';
      completeAdventureNode(trip, chapter.book);
      continue;
    }
    const battle = beginEncounter(trip);
    battle.phase = 'victory';
    const outcome = completeEncounter(trip, battle);
    assert.equal(outcome.complete, index === 4);
    if (index === 2) {
      assert(trip.restPending);
      chooseRest(trip, 'sleep');
    }
  }
  assert.deepEqual(types, ['battle', 'event', 'elite', 'quest', 'boss']);
  assert.equal(trip.status, 'complete');
  assert.equal(trip.records.length, 5);
});
