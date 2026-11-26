import { restoreLibrary, compileRoster } from '../ai/library.js';
import { applyDiningToBattle, consumeDiningForBattle, diningBattleCompleted } from '../dining.js';
import { claimCompletionExperience, applyEncounterGrowth } from '../growth.js';
import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from '../content/journey-rules.js';
import { preview, getEnemies } from '../engine.js';
import {
  newExpedition,
  beginEncounter,
  completeEncounter,
  currentEncounterSpec,
  expeditionNodeType,
  completeAdventureNode,
} from '../expedition.js';
import { createAdventureState, lockBoss } from '../adventure/state.js';
import { adventureResumeStage } from '../adventure/snapshot.js';
import { restoreAdventureResources } from '../adventure/restore-resources.js';
import { eventReward } from '../adventure/rewards.js';
import { createSceneLoading, syncLoadingOverlayState } from '../shared/scene-loading.js';
import { ADVENTURE_NODE_LABELS } from '../adventure/definition.js';
import { REGIONS } from '../content/regions.js';
import { createBattleView } from '../scene.js';
import { roundBanner } from '../motion.js';
import { query as $ } from './dom.js';
import { encounterMusic, locationMusic } from '../audio/config.js';
import { claimBattleRewards } from '../rewards.js';
import { dungeonLoot, settleEther } from '../archives.js';
import { resetRelationshipGains } from '../relationships.js';
import { recordSettlement } from '../companion-events.js';
import { developerOption } from '../generation-options.js';
import {
  grantVictoryOverlordEmblem,
  prepareBossEmblem,
  prepareCorridorRing,
} from '../emblem-progression.js';
import { encounterLevel } from '../enemy-growth.js';
import { EMBLEM_ID, EMBLEMS } from '../emblems.js';
import { recollectionEther } from '../recollections.js';
import { worldBattleTransition } from './world-battle-transition.js';
import { refreshWorldSkirmishes } from '../skirmishes.js';
import { mergeRevealedWeaknessMap } from '../octopath.js';
import { recordSeenMonsters } from '../archive-enemies.js';
import { isTestScriptRecord, purgeScriptFromLibrary } from '../memory.js';

/** @param {import('./context.js').AppContext} context */
export function createJourney(context) {
  const { session } = context;
  let settlingBattle = null;
  let transition = null;

  function cancelTransition() {
    transition?.abort();
    transition = null;
  }

  async function transitionToBattle(enter) {
    cancelTransition();
    const current = new AbortController();
    transition = current;
    try {
      return await worldBattleTransition(enter, current.signal);
    } finally {
      if (transition === current) transition = null;
    }
  }

  function savePreparedBattle() {
    session.runtime.adventureCheckpointLoading = true;
    try {
      context.generation.save();
    } finally {
      session.runtime.adventureCheckpointLoading = false;
    }
  }
  async function startDeveloperBattle(spec) {
    if (!session.runtime.developerSandbox || session.runtime.mode !== 'inn')
      throw Error('请先在测试档的酒馆里开始直达战。');
    const library = session.ai.library;
    const roster = compileRoster(library);
    const expedition = newExpedition('bossGate', roster);
    expedition.index = FINAL_ENCOUNTER;
    expedition.developerEncounter = structuredClone(spec);
    session.ai.activeScript = null;
    session.journey.selectedNode = null;
    session.journey.expedition = expedition;
    await transitionToBattle((ready, signal) => enterBattle(true, ready, signal));
  }
  async function startBattle(continuing = false) {
    if (session.runtime.disposed || session.runtime.mode === 'loading' || session.battle.playing)
      return;
    if (session.runtime.needsStart) return context.onboarding.open();
    if (!continuing && context.daily && !context.daily.allowDungeon()) return;
    if (
      !continuing &&
      context.onboarding &&
      !context.onboarding.allowPortal('script', { entering: Boolean(session.ai.library.prepared) })
    )
      return;
    if (
      session.ai.library.campaign &&
      !continuing &&
      !session.ai.library.prepared &&
      !session.journey.selectedNode?.replay
    ) {
      context.destinations.open();
      return;
    }
    if (!continuing && session.runtime.mode === 'inn')
      return transitionToBattle((ready, signal) => enterBattle(continuing, ready, signal));
    cancelTransition();
    return enterBattle(continuing);
  }
  async function enterBattle(continuing, ready, signal) {
    const token = session.runtime.token;
    const current = () =>
      !session.runtime.disposed && !signal?.aborted && token === session.runtime.token;
    const newTrip = !continuing || !session.journey.expedition;
    context.shop?.close();
    context.dining?.close();
    session.runtime.mode = 'loading';
    context.generation.refreshReview();
    if (newTrip) {
      try {
        const roster = await context.generation.prepare();
        if (!current()) return;
        resetRelationshipGains(session.ai.library);
        context.chat?.enteredDungeon();
        if (!session.journey.selectedNode?.replay) context.onboarding?.tripStarted();
        session.journey.expedition = newExpedition(
          session.journey.bossChoice,
          roster,
          session.journey.selectedNode
            ? {
                ...session.journey.selectedNode,
                ...(session.ai.activeScript?.encounters
                  ? { encounters: session.ai.activeScript.encounters }
                  : {}),
              }
            : null,
        );
        if (session.ai.activeScript?.adventure)
          session.journey.expedition.adventure = createAdventureState(
            session.ai.activeScript,
            session.journey.expedition.id,
          );
        if (session.ai.activeScript?.adventure && session.journey.selectedNode?.replay) {
          const state = session.journey.expedition.adventure;
          const final = session.ai.activeScript.adventureFinal;
          state.event = {
            ...state.event,
            ...(final?.event || {}),
            choiceId:
              final?.event?.choiceId || session.ai.activeScript.adventure.event.choices[0].id,
            resolved: true,
            rewardClaimed: false,
          };
          for (const goal of Object.values(state.goals)) goal.status = 'completed';
          state.history = final?.history || [];
          state.readyPrompted = true;
        }
        if (
          session.ai.activeScript?.adventure &&
          session.journey.selectedNode?.tutorial &&
          session.ai.library.campaign
        )
          session.ai.library.campaign.adventureTutorial = true;
        if (session.journey.selectedNode?.replay)
          session.journey.expedition.recollectionEther = recollectionEther(
            session.ai.library,
            session.journey.selectedNode,
          );
        context.daily?.departed();
      } catch (failure) {
        if (!current()) return;
        session.runtime.mode = 'inn';
        context.shell.toast('剧本准备失败：' + failure.message);
        void context.generation.open('剧本准备失败：' + failure.message);
        return;
      }
    }
    if (session.ai.activeScript?.adventure) {
      const record = session.ai.library.history.find(
        (item) => item.runId === session.ai.activeScript.runId,
      );
      if (record) record.adventureVersion = 1;
    }
    session.journey.expedition.partyIds ||= [...session.ai.library.party];
    if (['event', 'quest'].includes(expeditionNodeType(session.journey.expedition))) {
      await context.adventure.enter();
      return;
    }
    context.adventure.leave();
    if ($('#destination-dialog')?.open) $('#destination-dialog').close();
    document.body.classList.add('in-battle');
    const trip = session.journey.expedition;
    if (continuing) applyEncounterGrowth(trip, session.ai.library.characters);
    const corridorRingGranted = prepareCorridorRing(session.ai.library, trip);
    const bossEmblemGranted = prepareBossEmblem(session.ai.library, trip);
    session.battle.state = beginEncounter(trip);
    if (corridorRingGranted) {
      context.emblems?.queueRingAward(EMBLEM_ID, trip.corridorRing.actor);
    }
    if (bossEmblemGranted) {
      const { id, recipient } = trip.emblemArrival;
      context.emblems?.queueRingAward(id, recipient?.actor);
    }
    recordSeenMonsters(session.ai.library, getEnemies(session.battle.state));
    session.battle.state.revealedWeaknesses = mergeRevealedWeaknessMap(
      session.ai.library.discoveredWeaknesses,
      session.battle.state.revealedWeaknesses,
    );
    applyDiningToBattle(
      session.ai.library,
      session.battle.state,
      session.journey.expedition.partyIds,
      false,
    );
    session.battle.state.items = structuredClone(session.ai.library.inventory.items);
    session.battle.plan = [];
    session.battle.forecast = preview(session.battle.state, session.battle.plan);
    session.selection.selected = session.ai.library.campaign
      ? session.battle.state.formation.find(Boolean)
      : 'morrow';
    session.selection.target = getEnemies(session.battle.state)[0].id;
    session.selection.pending = null;
    session.battle.history = [];
    session.battle.display = null;
    session.battle.activeCell = -1;
    session.selection.selectedCell = -1;
    session.selection.interactionStep = null;
    session.selection.inspectedEnemy = null;
    savePreparedBattle();
    await mountEncounter(false, ready, signal);
  }
  async function startOverlandBattle(overlandBattle) {
    if (
      (session.runtime.mode !== 'inn' && !overlandBattle.forceTransition) ||
      session.battle.playing ||
      session.runtime.needsStart
    )
      return false;
    return transitionToBattle((ready, signal) =>
      enterOverlandBattle(overlandBattle, ready, signal),
    );
  }
  async function enterOverlandBattle(overlandBattle, ready, signal) {
    const library = session.ai.library;
    const partyIds = overlandBattle.overland?.partyIds;
    const party = partyIds
      ? Array.from({ length: 6 }, (_, index) => partyIds[index] || null)
      : library.party;
    const roster = compileRoster(
      partyIds
        ? { ...library, party, campaign: library.campaign || { protagonistId: partyIds[0] } }
        : library,
    );
    context.chat.leave();
    context.gal.cancel();
    context.shop.close();
    context.dining.close();
    session.ai.activeScript = null;
    session.ai.chat.quick = [];
    session.journey.selectedNode = null;
    const continuing = Boolean(overlandBattle.continuing && session.journey.expedition?.carried);
    const expedition = continuing
      ? session.journey.expedition
      : newExpedition(
          overlandBattle.spec.boss ? overlandBattle.spec.enemyIds[0] : 'bossGate',
          roster,
        );
    if (continuing) {
      delete expedition.pendingResult;
      expedition.status = 'active';
      expedition.index = overlandBattle.skirmishRun?.waveIndex ?? expedition.index + 1;
      expedition.boss = overlandBattle.spec.boss ? overlandBattle.spec.enemyIds[0] : 'bossGate';
      applyEncounterGrowth(expedition, library.characters);
    } else {
      expedition.partyIds = [...party];
    }
    expedition.overlandBattle = structuredClone(overlandBattle);
    session.journey.expedition = expedition;
    session.runtime.mode = 'loading';
    document.body.classList.add('in-battle');
    session.battle.state = beginEncounter(session.journey.expedition);
    recordSeenMonsters(session.ai.library, getEnemies(session.battle.state));
    session.battle.state.revealedWeaknesses = mergeRevealedWeaknessMap(
      session.ai.library.discoveredWeaknesses,
      session.battle.state.revealedWeaknesses,
    );
    applyDiningToBattle(
      session.ai.library,
      session.battle.state,
      session.journey.expedition.partyIds,
      false,
    );
    session.battle.state.items = structuredClone(session.ai.library.inventory.items);
    session.battle.plan = [];
    session.battle.forecast = preview(session.battle.state, []);
    session.battle.history = [];
    session.battle.display = null;
    session.battle.activeCell = -1;
    session.selection.selected = session.battle.state.formation.find(Boolean);
    session.selection.target = getEnemies(session.battle.state)[0]?.id;
    session.selection.pending = null;
    return await mountEncounter(false, ready, signal);
  }
  async function mountEncounter(resuming = false, ready, signal) {
    context.emblems?.cancelRingFeedback();
    context.overlordBattle?.cancelReloadBark();
    $('#drag-menu').hidden = true;
    $('#speed').hidden = false;
    $('#inn').hidden = true;
    $('#battle').hidden = false;
    context.daily?.refresh?.();
    $('#back-inn').hidden = !developerOption(session.ai.generationOptions, 'allowRetreat');
    context.ledger?.sync();
    const spec = currentEncounterSpec(session.journey.expedition, session.battle.state.encounter);
    $('#mode-label').textContent = session.journey.expedition.developerEncounter
      ? `测试遭遇 · ${spec.name}`
      : session.journey.expedition.overlandBattle
        ? `旅途遭遇 · ${spec.name} · Lv.${spec.level}`
        : session.journey.expedition.adventure
          ? `${spec.name} · 第 ${session.battle.state.encounter + 1}/${ENCOUNTER_COUNT} 节点 · ${ADVENTURE_NODE_LABELS[session.battle.state.encounter]}`
          : session.journey.expedition.exploration
            ? `${REGIONS[spec.map].name} · 第 ${session.battle.state.encounter + 1}/${ENCOUNTER_COUNT} 战 · ${spec.name}`
            : `第 ${session.battle.state.encounter + 1}/${ENCOUNTER_COUNT} 战 · ${spec.name}`;
    $('#scene-loading').hidden = false;
    const loading = createSceneLoading($('#scene-loading'), `正在进入${spec.name}`, {
      assetStore: context.assets,
      persistent: true,
      onReturn: () => returnInn(),
    });
    $('#inn-frame').replaceChildren();
    session.runtime.view?.dispose();
    const load = ++session.runtime.token;
    const current = () =>
      load === session.runtime.token && !session.runtime.disposed && !signal?.aborted;
    context.renderer.render();
    try {
      const loaded = await createBattleView($('#stage'), context.selection.selectUnit, {
        loading,
        map: session.battle.state.map,
        enemyIds: session.battle.state.enemyIds,
        formation: session.battle.state.formation,
        heroDefinitions: session.battle.state.heroDefinitions,
        enemyDefinitions: session.battle.state.enemyDefinitions,
      });
      if (!current()) {
        loading.dispose();
        loaded.dispose();
        $('#scene-loading').hidden = true;
        syncLoadingOverlayState();
        return false;
      }
      session.runtime.view = loaded;
      await loading.finish(loaded.renderer, loaded.scene, loaded.camera);
      if (!current()) {
        $('#scene-loading').hidden = true;
        syncLoadingOverlayState();
        return false;
      }
      context.audio.setScene(
        encounterMusic({
          ...spec,
          enemyIds: spec.enemyIds?.length ? spec.enemyIds : session.battle.state.enemyIds,
        }),
      );
      $('#scene-loading').hidden = true;
      syncLoadingOverlayState();
      $('#battle').classList.add('entering');
      context.renderer.render();
      const entrance = $('#battle')
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity);
      await Promise.all([
        loaded.whenSettled(),
        ...entrance.map((animation) => animation.finished.catch(() => {})),
      ]);
      if (!current()) return false;
      $('#battle').classList.remove('entering');
      session.runtime.mode = 'battle';
      ready?.();
      document.dispatchEvent(new Event('world-battle-ready'));
      consumeDiningForBattle(
        session.ai.library,
        session.battle.state,
        session.journey.expedition.partyIds,
      );
      context.generation.save();
      context.renderer.render({ animate: false });
      context.backpack?.render();
      context.battleReading?.render();
      context.overlordBattle?.sync();
      context.generation.refreshReview();
      if (
        session.journey.expedition.overlandBattle ||
        (session.journey.expedition.developerEncounter && !resuming)
      ) {
        if (context.overlordBattle?.isOverlordBattle?.()) void context.overlordBattle.entrance();
        else roundBanner('先手准备 · 1 AP');
        context.battleBarks?.roundOneStart();
        return true;
      }
      if (resuming) {
        context.generation.refreshStory();
        context.onboarding?.resumed();
        context.emblems?.check();
        context.overlordBattle?.sync();
        return true;
      }
      await context.generation.showScene(session.battle.state.encounter, 'before');
      if (!current()) return false;
      context.generation.openStory(true);
      await context.generation.storyClosed();
      if (!current()) return false;
      context.onboarding?.battleStarted();
      context.companionEvents?.battleStarted();
      context.emblems?.check();
      if (context.overlordBattle?.isOverlordBattle?.()) {
        await context.overlordBattle.entrance();
      } else {
        roundBanner(spec.boss ? `最终战 · ${spec.name}` : '先手准备 · 1 AP');
        context.battleBarks?.roundOneStart();
      }
      return current();
    } catch (e) {
      if (!current()) return false;
      loading.fail(e);
      console.error(e);
      return false;
    }
  }
  async function resume(snapshot) {
    cancelTransition();
    session.ai.library = restoreLibrary(snapshot.library);
    restoreAdventureResources(snapshot, session.ai.library);
    session.battle.state = snapshot.state;
    recordSeenMonsters(session.ai.library, getEnemies(snapshot.state));
    session.battle.plan = snapshot.plan || [];
    session.battle.history = snapshot.history || [];
    session.battle.forecast = preview(snapshot.state, session.battle.plan);
    if (!session.battle.forecast.valid) {
      session.battle.plan = [];
      session.battle.forecast = preview(snapshot.state, []);
    }
    session.journey = snapshot.journey;
    session.ai.activeScript = snapshot.activeScript;
    if (snapshot.activeScript?.id) {
      const index = session.ai.library.scripts.findIndex(
        (book) => book.id === snapshot.activeScript.id,
      );
      if (index >= 0) session.ai.library.scripts[index] = session.ai.activeScript;
    }
    session.ai.storyView = snapshot.storyView;
    session.ai.chat.quick = snapshot.quick || [];
    const trip = session.journey.expedition;
    const resumeStage = adventureResumeStage(trip, snapshot.state);
    if (resumeStage === 'event') {
      await context.adventure.enter(true);
      return;
    }
    session.selection.selected = snapshot.state.formation.find(Boolean);
    session.selection.target = getEnemies(snapshot.state)[0]?.id;
    session.runtime.mode = 'loading';
    document.body.classList.add('in-battle');
    savePreparedBattle();
    await mountEncounter(true);
    if (session.journey.expedition !== trip || session.runtime.mode !== 'battle') return;
    context.generation.save();
    if (resumeStage === 'settlement' || trip.pendingResult) await showResult();
  }
  function returnInn({ developerReset = false, skirmishRetreat = null } = {}) {
    if (session.battle.playing) return;
    const reset = developerReset === true && session.runtime.developerSandbox;
    const settled =
      ['victory', 'defeat'].includes(session.battle.state.phase) &&
      (session.journey.expedition?.status === 'complete' ||
        session.battle.state.phase === 'defeat');
    const expedition = session.journey.expedition;
    const retreating =
      skirmishRetreat &&
      expedition === skirmishRetreat &&
      expedition.overlandBattle?.skirmishRun &&
      session.runtime.mode === 'battle' &&
      session.battle.state.phase === 'victory' &&
      expedition.pendingResult?.won === true &&
      expedition.pendingResult.complete === false;
    if (
      ['battle', 'event'].includes(session.runtime.mode) &&
      !settled &&
      !retreating &&
      !reset &&
      !developerOption(session.ai.generationOptions, 'allowRetreat')
    ) {
      context.shell.toast('副本进行中，完成结算后才能返回酒馆。');
      return;
    }
    if (
      ['battle', 'event'].includes(session.runtime.mode) &&
      context.onboarding &&
      !reset &&
      !retreating &&
      !session.journey.expedition?.developerEncounter &&
      !context.onboarding.allowReturn()
    )
      return;
    const testRun = isTestScriptRecord(session.ai.activeScript);
    const defeatedRun =
      session.battle.state?.phase === 'defeat' || expedition?.pendingResult?.won === false;
    if (
      ['battle', 'event'].includes(session.runtime.mode) &&
      session.ai.activeScript &&
      !session.ai.activeScript.recollection &&
      !testRun &&
      !defeatedRun &&
      settled
    ) {
      session.ai.library.tavernChat.push({
        id: crypto.randomUUID(),
        role: 'system',
        divider: true,
        content: '从《' + session.ai.activeScript.title + '》副本回来。',
      });
    }
    if (
      ['battle', 'event'].includes(session.runtime.mode) &&
      session.ai.activeScript &&
      !session.ai.activeScript.recollection &&
      (!settled || defeatedRun || testRun)
    ) {
      const book = session.ai.activeScript;
      purgeScriptFromLibrary(session.ai.library, book);
      session.ai.library.archives.items = session.ai.library.archives.items.filter(
        (item) => item.source?.runId !== book.runId,
      );
      for (const npc of session.ai.library.archives.npcs)
        npc.sources = (npc.sources || []).filter((source) => source.runId !== book.runId);
      session.ai.library.archives.npcs = session.ai.library.archives.npcs.filter(
        (npc) => npc.sources.length,
      );
      session.ai.library.prepared = null;
    }
    cancelTransition();
    context.backpack?.close();
    context.overlordBattle?.reset();
    context.battleBarks?.clear();
    context.chapterTheater?.cancel();
    context.adventure.leave();
    context.companionEvents?.leave();
    context.emblems?.leave();
    context.chat?.leave();
    context.generation.cancelScene();
    session.runtime.token++;
    session.runtime.view?.dispose();
    session.runtime.view = null;
    session.runtime.mode = 'inn';
    session.journey.selectedNode = null;
    context.generation.setSummonVisible(false);
    const overlandBattle = session.journey.expedition?.overlandBattle;
    const returnTo = overlandBattle?.returnScene || (session.journey.expedition ? 'gate' : null);
    context.audio.setScene(
      returnTo && !['gate', 'tavern'].includes(returnTo) ? locationMusic(returnTo) : 'inn',
    );
    document.body.classList.remove('in-battle', 'ring-cabinet-open', 'inn-scene-loading');
    $('#scene-loading').hidden = true;
    syncLoadingOverlayState();
    context.daily?.refresh?.();
    $('#speed').hidden = true;
    $('#drag-menu').hidden = true;
    session.selection.interactionStep = null;
    session.selection.selectedCell = -1;
    $('#result').open && $('#result').close();
    $('#battle').hidden = true;
    $('#inn').hidden = false;
    $('#back-inn').hidden = true;
    $('#mode-label').textContent = '';
    context.ledger?.sync();
    context.shell.mountInn(returnTo);
    context.onboarding?.refresh();
    context.companionEvents?.returned();
    context.daily?.returning();
    context.generation.save();
    context.workshop?.unlockTutorial();
    if (!session.journey.expedition?.exploration?.quickTestBoss)
      void context.mapExpansion?.extend(session.journey.expedition?.exploration);
    void context.memory?.autoSummarize();
    return true;
  }
  async function showResult() {
    const battle = session.battle.state;
    if (settlingBattle === battle) return;
    settlingBattle = battle;
    try {
      if (session.journey.expedition.overlandBattle)
        return await context.daily.finishOverlandBattle();
      if (session.journey.expedition.pendingResult)
        return await presentResult(session.journey.expedition.pendingResult);
      if (!['victory', 'defeat'].includes(battle.phase)) return;
      await settleEncounter(battle, session.journey.expedition);
    } finally {
      if (settlingBattle === battle) settlingBattle = null;
    }
  }

  async function settleEncounter(battle, trip) {
    const isCurrentBattle = () =>
      !session.runtime.disposed &&
      session.runtime.mode === 'battle' &&
      session.journey.expedition === trip &&
      session.battle.state === battle;
    if (battle.phase === 'victory') {
      try {
        await context.battleBarks?.battleWon();
        if (!isCurrentBattle()) return;
        await context.generation.showScene(battle.encounter, 'after');
        if (isCurrentBattle() && battle.encounter === FINAL_ENCOUNTER) {
          await context.generation.playEpilogue?.();
        }
      } catch (error) {
        context.developer?.report(error);
        console.error('Post-victory presentation error:', error);
      }
    }
    if (!isCurrentBattle()) return;
    const won = battle.phase === 'victory';
    const testRun = isTestScriptRecord(session.ai.activeScript);
    if (!won || testRun) {
      purgeScriptFromLibrary(session.ai.library, session.ai.activeScript);
    }
    const spec = currentEncounterSpec(trip, battle.encounter);
    const explored = trip.exploration;
    const replay = explored?.replay;
    const runId = session.ai.activeScript?.runId;
    if ((battle.encounter === FINAL_ENCOUNTER || !won) && runId) {
      if (!(await context.lootConflicts.resolve(runId)) || !isCurrentBattle()) return;
    }
    const next = won ? completeEncounter(trip, battle) : null;
    const complete = next?.complete;
    if (won) {
      const unlockedEmblem = grantVictoryOverlordEmblem(
        session.ai.library,
        session.battle.state,
        session.journey.expedition,
      );
      if (unlockedEmblem) {
        context.emblems?.queueRingAward(unlockedEmblem.id, unlockedEmblem.recipient?.actor, battle);
        const embName = EMBLEMS[unlockedEmblem.id]?.emblem?.name || unlockedEmblem.id;
        const ringTitle = unlockedEmblem.recipient
          ? `${embName}（已由${unlockedEmblem.recipient.name}装备）`
          : embName;
        context.shell?.toast?.(`击破霸主觉醒纹章戒指：${ringTitle}`);
      }
    }
    if (next) claimBattleRewards(session.ai.library, next.rewardId, next.rewards);
    diningBattleCompleted(
      session.ai.library,
      `${session.journey.expedition.id}:${session.battle.state.encounter}`,
    );
    if (
      complete &&
      !replay &&
      !explored?.quickTestBoss &&
      runId &&
      session.ai.library.campaign &&
      !session.ai.library.campaign.completed &&
      !dungeonLoot(session.ai.library, runId).some((item) => item.value > 0)
    ) {
      session.ai.library.archives.items.push({
        id: `tutorial-ether-${runId}`,
        name: '守门者残晶',
        map: spec.map,
        level: encounterLevel(spec),
        quality: 'uncommon',
        description: '遗迹守门者留下的晶体',
        value: 10,
        source: {
          runId,
          scriptId: session.ai.activeScript.id,
          title: session.ai.activeScript.title,
          encounter: FINAL_ENCOUNTER,
          map: spec.map,
        },
        converted: false,
      });
    }
    const levelUps = complete
      ? claimCompletionExperience(session.ai.library, session.journey.expedition)
      : [];
    const awards = [...(session.journey.expedition.experienceAwards || []), ...levelUps];
    session.journey.expedition.experienceAwards = [];
    session.journey.expedition.levelUps = [];
    const loot = runId ? dungeonLoot(session.ai.library, runId) : [];
    const ether = replay
      ? complete
        ? session.journey.expedition.recollectionEther
        : 0
      : complete && runId
        ? settleEther(session.ai.library, runId)
        : 0;
    if (complete && !replay) {
      if (session.journey.expedition.adventure) {
        const record = session.ai.library.history.find((item) => item.runId === runId);
        if (record) record.adventureFinal = structuredClone(session.journey.expedition.adventure);
      }
      recordSettlement(session.ai.library, runId || session.journey.expedition.id);
    }
    const result = {
      won,
      complete,
      encounter: session.battle.state.encounter,
      rewards: next?.rewards,
      ether,
      loot: loot.filter((item) => item.source.encounter === session.battle.state.encounter),
      awards,
    };
    trip.pendingResult = result;
    if (complete && explored && !replay && !explored.quickTestBoss) {
      refreshWorldSkirmishes(session.ai.library, runId || Date.now());
      context.generation.explorationWon(explored, { ether });
      context.quests?.battleWon(explored);
    }
    const ringArrival = won
      ? [trip.emblemArrival, battle.midBattleEmblemArrival].find(
          (arrival) => arrival && !arrival.shown,
        )
      : null;
    if (ringArrival) ringArrival.shown = true;
    context.generation.save();
    if (ringArrival) {
      await context.emblems?.presentRingAward(ringArrival.id);
      if (!isCurrentBattle()) return;
    }
    context.audio.play(won ? 'victory' : 'defeat');
    return presentResult(result);
  }
  async function presentResult(result) {
    const trip = session.journey.expedition;
    await context.settlement.show({
      ...result,
      onward() {
        if (session.journey.expedition !== trip || trip.pendingResult !== result) return;
        delete trip.pendingResult;
        $('#result').close();
        context.generation.showScene(session.battle.state.encounter, 'interlude');
        void startBattle(true);
      },
      back: returnInn,
      backLabel: '返回酒馆',
      journal: session.ai.activeScript ? context.generation.openStory : null,
      retreat: developerOption(session.ai.generationOptions, 'allowRetreat'),
    });
    context.onboarding?.battleWon(result.won && result.complete);
  }
  async function continueAdventure() {
    const expedition = session.journey.expedition;
    if (session.runtime.mode !== 'event' || !expedition?.adventure) return;
    try {
      if (
        expedition.index === 1 &&
        session.ai.activeScript.recollection &&
        !expedition.adventure.event.rewardClaimed
      ) {
        claimBattleRewards(session.ai.library, `${expedition.id}:event-2`, eventReward(expedition));
        expedition.adventure.event.rewardClaimed = true;
      }
      if (expedition.index === 3) {
        lockBoss(expedition, session.ai.activeScript);
        if (!expedition.adventure.questRewardClaimed) {
          claimBattleRewards(session.ai.library, `${expedition.id}:quest-4`, {
            summonContracts: 0,
            gold: 20,
          });
          expedition.adventure.questRewardClaimed = true;
        }
      }
      completeAdventureNode(expedition, session.ai.activeScript);
      context.adventure.leave();
      await startBattle(true);
    } catch (failure) {
      context.shell.toast(failure.message);
    }
  }
  return {
    startBattle,
    startDeveloperBattle,
    startOverlandBattle,
    returnInn,
    showResult,
    resume,
    continueAdventure,
    dispose() {
      cancelTransition();
    },
  };
}
