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
import { eventReward } from '../adventure/rewards.js';
import { createSceneLoading } from '../shared/scene-loading.js';
import { ADVENTURE_NODE_LABELS } from '../adventure/definition.js';
import { REGIONS } from '../content/regions.js';
import { createBattleView } from '../scene.js';
import { roundBanner } from '../motion.js';
import { query as $ } from './dom.js';
import { encounterMusic } from '../audio/config.js';
import { claimBattleRewards } from '../rewards.js';
import { dungeonLoot, settleEther } from '../archives.js';
import { resetRelationshipGains } from '../relationships.js';
import { recordSettlement } from '../companion-events.js';
import { developerOption } from '../generation-options.js';
import { prepareCorridorRing, prepareBossEmblem } from '../emblem-progression.js';
import { recollectionEther } from '../recollections.js';
import { worldBattleTransition } from './world-battle-transition.js';
import { STARBELL_ENABLED } from '../chapters/starbell-state.js';

/** @param {import('./context.js').AppContext} context */
export function createJourney(context) {
  const { session } = context;
  async function startBattle(continuing = false) {
    if (session.runtime.disposed || session.runtime.mode === 'loading' || session.battle.playing)
      return;
    if (session.runtime.needsStart) return context.onboarding.open();
    if (!continuing && context.daily && !context.daily.allowDungeon()) return;
    if (!continuing && context.onboarding && !context.onboarding.allowPortal('script')) return;
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
      return worldBattleTransition(() => enterBattle(continuing));
    return enterBattle(continuing);
  }
  async function enterBattle(continuing) {
    const newTrip = !continuing || !session.journey.expedition;
    context.shop?.close();
    context.dining?.close();
    session.runtime.mode = 'loading';
    context.generation.refreshReview();
    if (newTrip) {
      try {
        const roster = await context.generation.prepare();
        resetRelationshipGains(session.ai.library);
        context.chat?.enteredDungeon();
        if (!session.journey.selectedNode?.replay) context.onboarding?.tripStarted();
        if (session.runtime.disposed) return;
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
    document.body.classList.add('in-battle');
    if (continuing) applyEncounterGrowth(session.journey.expedition, session.ai.library.characters);
    if (prepareCorridorRing(session.ai.library, session.journey.expedition))
      context.generation.save();
    if (prepareBossEmblem(session.ai.library, session.journey.expedition))
      context.generation.save();
    session.battle.state = beginEncounter(session.journey.expedition);
    applyDiningToBattle(
      session.ai.library,
      session.battle.state,
      session.journey.expedition.partyIds,
      false,
    );
    context.generation.save();
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
    await mountEncounter();
  }
  async function startChapterBattle(chapter) {
    if (session.runtime.mode !== 'inn' || session.battle.playing || session.runtime.needsStart)
      return false;
    return worldBattleTransition(() => enterChapterBattle(chapter));
  }
  async function enterChapterBattle(chapter) {
    const library = session.ai.library;
    const partyIds = chapter.overland?.partyIds;
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
    session.ai.activeScript = chapter.book ? structuredClone(chapter.book) : null;
    session.ai.chat.quick = [];
    session.journey.selectedNode = null;
    session.journey.expedition = newExpedition(
      chapter.spec.boss ? chapter.spec.enemyIds[0] : 'bossGate',
      roster,
    );
    session.journey.expedition.chapter = structuredClone(chapter);
    if (chapter.fullTrip) {
      session.ai.activeScript.runId = session.journey.expedition.id;
      session.journey.expedition.adventure = createAdventureState(
        session.ai.activeScript,
        session.journey.expedition.id,
      );
      session.ai.library.history.push({
        runId: session.journey.expedition.id,
        scriptId: session.ai.activeScript.id,
        title: session.ai.activeScript.title,
        chapter: session.ai.activeScript.chapter,
        map: 'ruins',
        lines: [],
        played: [],
        complete: false,
        tags: session.ai.activeScript.tags,
        adventureVersion: 1,
      });
      context.generation.reset();
    }
    session.journey.expedition.partyIds = [...party];
    session.runtime.mode = 'loading';
    document.body.classList.add('in-battle');
    session.battle.state = beginEncounter(session.journey.expedition);
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
    await mountEncounter();
    return true;
  }
  async function mountEncounter(resuming = false) {
    $('#drag-menu').hidden = true;
    $('#speed').hidden = false;
    $('#inn').hidden = true;
    $('#battle').hidden = false;
    $('#party-toggle').hidden = true;
    $('#ai-open').hidden = true;
    $('#back-inn').hidden = !developerOption(session.ai.generationOptions, 'allowRetreat');
    const spec = currentEncounterSpec(session.journey.expedition, session.battle.state.encounter);
    $('#mode-label').textContent = session.journey.expedition.chapter?.overland
      ? `旅途遭遇 · ${spec.name} · Lv.${spec.level}`
      : session.journey.expedition.chapter
        ? `星灯未熄 · 第${session.journey.expedition.chapter.day}天 · ${spec.name}`
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
      if (load !== session.runtime.token) {
        loading.dispose();
        loaded.dispose();
        return;
      }
      session.runtime.view = loaded;
      await loading.finish(loaded.renderer, loaded.scene, loaded.camera);
      context.audio.setScene(encounterMusic(spec));
      $('#scene-loading').hidden = true;
      $('#battle').classList.add('entering');
      context.renderer.render();
      const entrance = $('#battle')
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity);
      await Promise.all([
        loaded.whenSettled(),
        ...entrance.map((animation) => animation.finished.catch(() => {})),
      ]);
      if (load !== session.runtime.token || session.runtime.disposed) return;
      $('#battle').classList.remove('entering');
      session.runtime.mode = 'battle';
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
      context.generation.refreshReview();
      if (session.journey.expedition.chapter && !session.journey.expedition.chapter.fullTrip) {
        roundBanner(spec.boss ? `守城决战 · ${spec.name}` : '先手准备 · 1 AP');
        context.chapter.refresh();
        return;
      }
      if (resuming) {
        context.generation.refreshStory();
        context.onboarding?.resumed();
        context.emblems?.check();
        return;
      }
      await context.generation.showScene(session.battle.state.encounter, 'before');
      if (!(
        session.journey.expedition.exploration?.tutorial && session.battle.state.encounter === 0
      )) {
        context.generation.openStory(true);
        await context.generation.storyClosed();
      }
      if (load !== session.runtime.token || session.runtime.disposed) return;
      context.onboarding?.battleStarted();
      context.companionEvents?.battleStarted();
      context.emblems?.check();
      roundBanner(spec.boss ? `最终战 · ${spec.name}` : '先手准备 · 1 AP');
    } catch (e) {
      loading.fail(e);
      console.error(e);
    }
  }
  async function resume(snapshot) {
    session.ai.library = restoreLibrary(snapshot.library);
    session.battle.state = snapshot.state;
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
    if (
      !STARBELL_ENABLED &&
      session.journey.expedition?.chapter &&
      !session.journey.expedition.chapter.overland
    ) {
      // Retain the checkpoint's authored progress while returning to ordinary exploration.
      session.runtime.mode = 'loading';
      returnInn();
      return;
    }
    if (['event', 'quest'].includes(expeditionNodeType(session.journey.expedition))) {
      if (session.journey.expedition.pendingResult) {
        session.runtime.mode = 'loading';
        document.body.classList.add('in-battle');
        await mountEncounter(true);
        await showResult();
        return;
      }
      await context.adventure.enter(true);
      return;
    }
    session.selection.selected = snapshot.state.formation.find(Boolean);
    session.selection.target = getEnemies(snapshot.state)[0]?.id;
    session.runtime.mode = 'loading';
    document.body.classList.add('in-battle');
    await mountEncounter(true);
    context.generation.save();
    if (session.journey.expedition.pendingResult) await showResult();
  }
  function returnInn() {
    if (session.battle.playing) return;
    const settled =
      ['victory', 'defeat'].includes(session.battle.state.phase) &&
      (session.journey.expedition?.status === 'complete' ||
        session.battle.state.phase === 'defeat');
    if (
      ['battle', 'event'].includes(session.runtime.mode) &&
      !settled &&
      !developerOption(session.ai.generationOptions, 'allowRetreat')
    ) {
      context.shell.toast('副本进行中，完成结算后才能返回酒馆。');
      return;
    }
    if (
      ['battle', 'event'].includes(session.runtime.mode) &&
      context.onboarding &&
      !context.onboarding.allowReturn()
    )
      return;
    if (
      ['battle', 'event'].includes(session.runtime.mode) &&
      session.ai.activeScript &&
      !session.ai.activeScript.recollection
    ) {
      session.ai.library.tavernChat.push({
        id: crypto.randomUUID(),
        role: 'system',
        divider: true,
        content: '从《' + session.ai.activeScript.title + '》副本回来。',
      });
      context.generation.save();
    }
    if (
      !settled &&
      ['battle', 'event'].includes(session.runtime.mode) &&
      session.ai.activeScript &&
      !session.ai.activeScript.recollection
    ) {
      const book = session.ai.activeScript;
      session.ai.library.history = session.ai.library.history.filter(
        (record) => record.runId !== book.runId,
      );
      session.ai.library.scripts = session.ai.library.scripts.filter(
        (entry) => entry.id !== book.id,
      );
      session.ai.library.archives.items = session.ai.library.archives.items.filter(
        (item) => item.source?.runId !== book.runId,
      );
      for (const npc of session.ai.library.archives.npcs)
        npc.sources = (npc.sources || []).filter((source) => source.runId !== book.runId);
      session.ai.library.archives.npcs = session.ai.library.archives.npcs.filter(
        (npc) => npc.sources.length,
      );
      session.ai.library.prepared = null;
      context.generation.save();
    }
    context.backpack?.close();
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
    context.audio.setScene('inn');
    document.body.classList.remove('in-battle');
    $('#speed').hidden = true;
    $('#drag-menu').hidden = true;
    session.selection.interactionStep = null;
    session.selection.selectedCell = -1;
    $('#result').open && $('#result').close();
    $('#battle').hidden = true;
    $('#inn').hidden = false;
    $('#party-toggle').hidden = false;
    $('#ai-open').hidden = false;
    $('#back-inn').hidden = true;
    $('#mode-label').textContent = '';
    const chapter = session.journey.expedition?.chapter;
    context.shell.mountInn(chapter?.returnScene || (session.journey.expedition ? 'gate' : null));
    context.chapter?.returned(chapter);
    context.onboarding?.refresh();
    context.companionEvents?.returned();
    context.daily?.returning();
    void context.memory?.autoSummarize();
  }
  async function showResult() {
    if (session.journey.expedition.chapter?.overland) return context.daily.finishOverlandBattle();
    if (session.journey.expedition.chapter && !session.journey.expedition.chapter.fullTrip)
      return context.chapter.finishBattle();
    if (session.journey.expedition.pendingResult)
      return presentResult(session.journey.expedition.pendingResult);
    if (session.battle.state.phase === 'victory')
      await context.generation.showScene(session.battle.state.encounter, 'after');
    if (session.runtime.disposed || session.runtime.mode !== 'battle') return;
    const won = session.battle.state.phase === 'victory',
      spec = currentEncounterSpec(session.journey.expedition, session.battle.state.encounter),
      next = won ? completeEncounter(session.journey.expedition, session.battle.state) : null,
      complete = next?.complete;
    if (next) {
      claimBattleRewards(session.ai.library, next.rewardId, next.rewards);
      context.generation.save();
    }
    const explored = session.journey.expedition.exploration;
    diningBattleCompleted(
      session.ai.library,
      `${session.journey.expedition.id}:${session.battle.state.encounter}`,
    );
    context.generation.save();
    const replay = explored?.replay;
    const runId = session.ai.activeScript?.runId;
    if (
      complete &&
      !replay &&
      runId &&
      session.ai.library.campaign &&
      !session.ai.library.campaign.completed &&
      !dungeonLoot(session.ai.library, runId).some((item) => item.value > 0)
    ) {
      session.ai.library.archives.items.push({
        id: `tutorial-ether-${runId}`,
        name: '守门者残晶',
        map: spec.map,
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
    if ((complete || !won) && runId && !(await context.lootConflicts.resolve(runId))) return;
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
      context.generation.save();
    }
    if (won && complete && explored && !replay)
      context.generation.explorationWon(explored, { ether });
    context.audio.play(won ? 'victory' : 'defeat');
    const result = {
      won,
      complete,
      encounter: session.battle.state.encounter,
      rewards: next?.rewards,
      ether,
      loot: loot.filter((item) => item.source.encounter === session.battle.state.encounter),
      awards,
    };
    session.journey.expedition.pendingResult = result;
    if (session.journey.expedition.chapter?.fullTrip && (complete || !won))
      context.chapter.finalTripResult(won);
    context.generation.save();
    context.checkpoint.saveNow();
    return presentResult(result);
  }
  async function presentResult(result) {
    await context.settlement.show({
      ...result,
      onward() {
        delete session.journey.expedition.pendingResult;
        $('#result').close();
        context.generation.showScene(session.battle.state.encounter, 'interlude');
        void startBattle(true);
      },
      back: returnInn,
      backLabel: session.journey.expedition.chapter ? '结束战斗' : '返回酒馆',
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
      context.generation.save();
      await startBattle(true);
    } catch (failure) {
      context.shell.toast(failure.message);
    }
  }
  return { startBattle, startChapterBattle, returnInn, showResult, resume, continueAdventure };
}
