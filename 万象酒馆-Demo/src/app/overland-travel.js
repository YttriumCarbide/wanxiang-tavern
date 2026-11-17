import { escapeText } from '../ui.js';
import {
  normalizeOverlandStory,
  normalizeOverlandTheater,
  overlandOrigin,
  overlandPlan,
  overlandRunPlan,
} from '../overland-travel.js';
import { archiveOverlandLoot, dungeonLoot, settleEther } from '../archives.js';
import { settingOnly } from '../ai/contracts.js';
import { parseGalText } from '../gal.js';
import { gameTime, memoryChat, withInvitationMemories } from '../memory.js';
import { applyFutureDialogue, dialogueTargets } from './future-dialogue.js';
import { prepareFreeDcContext, resolveFixedChoiceCheck } from '../dc-rp.js';
import {
  buildSkirmishEncounterPlan,
  isOverlandRouteKnown,
  markOverlandRouteExplored,
  settleSkirmishVictory,
} from '../skirmishes.js';
import { INGREDIENTS } from '../content/dining.js';
import { IMPERIAL_DUNGEONS } from '../content/imperial-network.js';
import { unlockDungeonMap } from '../exploration.js';
import { learning } from '../campaign.js';

export function createOverlandTravel(
  context,
  { active, intent, scene, navigate, save, render, spendTurns },
) {
  const { session } = context;
  const owner = 'overland-travel';
  const stagePanel = document.querySelector('#gal-stage');
  const form = document.createElement('form');
  form.id = 'overland-rp';
  form.hidden = true;
  const skirmishDialog = document.createElement('dialog');
  skirmishDialog.id = 'skirmish-dialog';
  skirmishDialog.className = 'skirmish-dialog';
  skirmishDialog.setAttribute('aria-labelledby', 'skirmish-dialog-title');
  document.body.append(skirmishDialog);
  let dismissedSkirmish = null;
  form.innerHTML = `<header class="invite-meta">
    <span class="invite-progress" aria-live="polite"></span>
    <div class="invite-actions"><button type="button" data-overland-continue></button></div></header>
    <div class="invite-choices" aria-label="本幕建议行动" hidden></div>
    <div class="invite-reply">
      <textarea id="overland-input" rows="3" maxlength="3000" required
        aria-label="旅途回应" placeholder="你想怎么应对眼前的旅途奇遇？"></textarea>
      <button id="overland-send" type="submit" aria-label="回应">回应</button>
    </div>
    <p class="invite-error" role="status"></p>`;
  const field = form.querySelector('textarea');
  const choices = form.querySelector('.invite-choices');
  const notice = form.querySelector('.invite-error');
  const outing = () =>
    active()?.kind === 'outing' && active().stage === 'roaming' ? active() : null;
  const run = () => outing()?.overland;
  const stage = (current) => overlandRunPlan(current).stages[current.index];
  const actHistory = (current) =>
    (current?.history || [])
      .filter((item) => item.index === current.index)
      .map(({ role, content }) => ({ role, content }));
  let request = null;
  let rpRequest = null;
  let workspace = false;
  let reading = false;
  let fighting = false;

  function sceneDialogue(current) {
    const act = current?.acts?.[current.index];
    if (!act || current.phase === 'depart' || (current.phase === 'intro' && reading)) return [];
    const dialogue = parseGalText(act.story);
    const history = actHistory(current);
    for (const [index, message] of history.entries()) {
      if (message.role === 'user') dialogue.push({ speaker: '玩家', text: message.content });
      else if (!reading || index !== history.length - 1)
        dialogue.push(...parseGalText(message.content));
    }
    return dialogue;
  }

  function updateForm() {
    const current = run();
    if (!current || form.hidden) return;
    const act = current.acts[current.index];
    const turns = Math.floor(actHistory(current).length / 2);
    const last = current.index + 1 === current.acts.length;
    form.querySelector('.invite-progress').textContent =
      `第 ${current.index + 1}/${current.acts.length} 幕 · ${stage(current).to.name} · ${act.title}${turns ? ` · 已互动 ${turns} 轮` : ''}`;
    const cont = form.querySelector('[data-overland-continue]');
    cont.textContent = last ? '抵达终点 →' : '继续赶路 →';
    const hasLegacyOutcomes = Boolean(act.choices?.some((item) => item.outcome));
    const locked = Boolean(rpRequest || reading || current.phase !== 'choice' || hasLegacyOutcomes);
    field.disabled = locked;
    form.querySelector('[type="submit"]').disabled = locked;
    cont.disabled = Boolean(rpRequest || reading || current.phase !== 'choice');
    const available = !locked && !turns ? act.choices || [] : [];
    choices.hidden = !available.length;
    choices.replaceChildren(
      ...available.map((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.overlandChoice = item.id || '';
        button.textContent = item.label;
        return button;
      }),
    );
  }

  function openWorkspace(current) {
    if (workspace || run() !== current) return;
    workspace = true;
    form.hidden = false;
    field.value = current.draft || '';
    notice.textContent = '';
    context.gal.workspace({
      owner,
      title: current.acts[current.index].title,
      actors: partyIds(),
      followSpeakers: true,
      composer: [form],
      onLayout({ height }) {
        stagePanel?.style.setProperty('--daily-invite-composer', `${height}px`);
      },
      transcript: () => sceneDialogue(current),
      onClose() {
        stagePanel?.style.removeProperty('--daily-invite-composer');
        workspace = false;
        form.hidden = true;
        form.remove();
        rpRequest?.abort();
        render();
      },
    });
    updateForm();
  }

  async function playOverlandEpilogue(current) {
    if (!current || current.epilogueShown) return;
    if (!current.epilogueGal && !current.epilogueProse) return;
    current.epilogueShown = true;
    save();
    const heading = `外传 ｜ ${current.acts[0]?.title || '旅途归处'}`;
    if (current.epilogueGal && context.gal?.enabled) {
      reading = true;
      updateForm();
      try {
        await context.gal.play(current.epilogueGal, {
          owner,
          title: heading,
          mandatory: true,
        });
      } finally {
        reading = false;
        updateForm();
      }
      if (session.runtime.disposed) return;
      (current.lines ||= []).push({
        speaker: '旁白',
        text: current.epilogueGal,
        encounter: current.acts.length - 1,
        stage: 'after',
      });
    }
    if (current.epilogueProse && context.chapterTheater && !session.runtime.disposed) {
      await context.chapterTheater.play({
        heading,
        prose: current.epilogueProse,
        buttonLabel: '返回酒馆 ›',
        mode: 'overland-epilogue',
        map: current.discovery?.map || 'ruins',
        place: stage(current)?.to?.name || '',
        act: current.acts.length,
      });
      if (session.runtime.disposed) return;
      (current.lines ||= []).push({
        speaker: '尾声',
        text: current.epilogueProse,
        encounter: current.acts.length - 1,
        stage: 'after',
      });
    }
  }

  function continueJourney(current) {
    if (run() !== current || current.phase !== 'choice' || rpRequest || reading) return;
    rpRequest?.abort();
    context.gal.cancel(owner);
    void settle(current, true);
  }

  function partyIds() {
    const library = session.ai.library;
    const activeParty = (library.party || [])
      .filter((id) => library.characters.some((member) => member.id === id))
      .slice(0, 6);
    if (activeParty.length) return activeParty;
    return [
      ...new Set([
        library.campaign?.protagonistId || library.party.find(Boolean),
        ...(outing()?.companions || []),
      ]),
    ]
      .filter((id) => library.characters.some((member) => member.id === id))
      .slice(0, 6);
  }

  async function start(to, options = {}) {
    const fromTavern = options.fromTavern === true && !outing() && !active();
    const library = session.ai.library;
    const dungeonSite = IMPERIAL_DUNGEONS.find((item) => item.id === to) || null;
    const tutorialRuinsWalk = Boolean(dungeonSite?.id === 'ruins' && learning(library));
    if (
      (!tutorialRuinsWalk && !fromTavern && !outing()) ||
      request ||
      run() ||
      session.runtime.mode !== 'inn'
    )
      return;
    let entry = outing();
    const originScene = entry ? scene() : options.destination || 'street';
    let control;
    try {
      const discovery = library.atlasDiscoveries?.find(({ id }) => id === to);
      const origin = overlandOrigin(originScene);
      const plan = overlandPlan(origin, to, discovery);
      control = new AbortController();
      request = control;
      render();
      const known = isOverlandRouteKnown(library, origin, plan.to);
      const destination = plan.stages.at(-1).to.name;
      if (dungeonSite) {
        if (!tutorialRuinsWalk && !entry) entry = options.ensureOuting?.();
        markOverlandRouteExplored(library, plan);
        const newlyUnlocked = unlockDungeonMap(library, dungeonSite.id);
        if (entry && outing() === entry) {
          spendTurns(plan.turns);
          entry.scene = dungeonSite.id;
          entry.overlandReached = true;
        }
        dismissedSkirmish = null;
        save();
        navigate(dungeonSite.id);
        context.daily.arriveDungeon?.(dungeonSite.id);
        context.shell.toast(
          newlyUnlocked ? `已抵达${destination}，并已将该遗迹加入副本之门` : `已抵达${destination}`,
        );
        render();
        return;
      }
      const playerIntent = await intent.ask(
        '确认外出路线',
        `前往 ${destination} · ${plan.turns} 回合`,
        { fastTravelLabel: known ? '熟路直行（跳过外出 API）' : '' },
      );
      if (playerIntent === null || control.signal.aborted) return;
      if (entry && outing() !== entry) return;
      if (playerIntent?.fast) {
        if (!entry) entry = options.ensureOuting?.();
        if (!entry || outing() !== entry) return;
        const finalStage = plan.stages.at(-1);
        spendTurns(plan.turns);
        markOverlandRouteExplored(library, plan);
        const reachedDiscovery = discovery && finalStage?.to?.id === discovery.id;
        entry.scene = (reachedDiscovery ? finalStage.from : finalStage.to).id;
        entry.overlandReached = true;
        dismissedSkirmish = null;
        save();
        navigate(entry.scene);
        if (reachedDiscovery) context.daily.arriveDiscovery(discovery.id);
        context.shell.toast(`已沿熟路抵达${destination}`);
        render();
        queueMicrotask(() => checkSkirmish(entry.scene));
        return;
      }
      const party = partyIds()
        .map((id) => library.characters.find((item) => item.id === id))
        .filter(Boolean)
        .map(settingOnly);
      const result = await context.apiClient.request(
        'generate/script',
        withInvitationMemories(
          'script',
          {
            overland: { from: plan.from, to: plan.to, discovery },
            party,
            protagonistId: library.campaign?.protagonistId,
            playerIntent,
          },
          library,
        ),
        { signal: control.signal },
      );
      if (control.signal.aborted) return;
      if (!entry) entry = options.ensureOuting?.();
      if (!entry || outing() !== entry) return;
      entry.overland = {
        id: crypto.randomUUID(),
        from: plan.from,
        to: plan.to,
        ...(discovery ? { discovery } : {}),
        acts: normalizeOverlandStory({ acts: result.acts }, plan),
        ...normalizeOverlandTheater(result),
        ...(Array.isArray(result.items) && result.items.length ? { items: result.items } : {}),
        index: 0,
        phase: 'depart',
        gameTime: gameTime(session.ai.library.daily),
      };
      save();
      resume();
    } catch (failure) {
      if (!control?.signal.aborted) context.shell.toast(failure.message);
    } finally {
      if (request === control) request = null;
      render();
    }
  }

  function resume() {
    const current = run();
    if (!current) return false;
    const entry = outing();
    const leg = stage(current);
    if (current.phase === 'depart') {
      spendTurns(leg.turns);
      entry.scene = leg.to.id === current.discovery?.id ? leg.from.id : leg.to.id;
      current.phase = 'intro';
      save();
    }
    const previous = scene();
    navigate(entry.scene);
    if (previous === entry.scene) queueMicrotask(() => arrive(scene()));
    return true;
  }

  async function settle(current, won, continueNow = true) {
    if (run() !== current) return false;
    const entry = outing();
    const leg = stage(current);
    if (!won || current.index + 1 === current.acts.length) {
      if (won && !current.epilogueShown) {
        await playOverlandEpilogue(current);
        if (run() !== current || session.runtime.disposed) return false;
      }
      const library = session.ai.library;
      if (current.lines?.length && !library.history.some((record) => record.runId === current.id)) {
        const location = stage(current).to.name;
        library.history.push({
          kind: 'overland',
          runId: current.id,
          title: `外出 · ${current.acts[0].title}`,
          place: location,
          people: partyIds()
            .map((id) => library.characters.find((member) => member.id === id)?.setting.name)
            .filter(Boolean),
          complete: true,
          finishedAt: Date.now(),
          gameTime: current.gameTime || gameTime(library.daily),
          lines: current.lines,
        });
      }
      if (won) markOverlandRouteExplored(library, overlandRunPlan(current));
      const reachedDiscovery = won && leg.to.id === current.discovery?.id;
      entry.scene = (won && !reachedDiscovery ? leg.to : leg.from).id;
      entry.overlandReached = true;
      dismissedSkirmish = null;
      delete entry.overland;
      if (continueNow) navigate(entry.scene);
      if (reachedDiscovery) context.daily.arriveDiscovery(current.discovery.id);
      context.shell.toast(won ? `已抵达${leg.to.name}` : `行程结束，退回${leg.from.name}`);
      if (won && continueNow) queueMicrotask(() => checkSkirmish(entry.scene));
    } else {
      current.index++;
      current.phase = 'depart';
      delete current.choice;
      if (continueNow) resume();
    }
    save();
    if (!entry.overland) void context.memory?.autoSummarize();
    render();
    return true;
  }

  async function arrive(at) {
    const current = run();
    if (!current || reading || at !== outing().scene || session.runtime.mode !== 'inn') return;
    const act = current.acts[current.index];
    const currentStage = stage(current);
    if (current.phase === 'choice') {
      if (currentStage.type === 'event' && !act?.choices?.some((item) => item.outcome)) {
        openWorkspace(current);
      }
      return;
    }
    if (!['intro', 'outcome'].includes(current.phase)) return;
    const phase = current.phase;
    const text =
      phase === 'intro'
        ? act.story
        : act.choices.find((item) => item.id === current.choice).outcome;
    if (
      phase === 'intro' &&
      currentStage.type === 'event' &&
      !act.choices?.some((item) => item.outcome)
    ) {
      openWorkspace(current);
    }
    reading = true;
    updateForm();
    let complete = false;
    try {
      if (
        current.index === 0 &&
        phase === 'intro' &&
        current.prologue &&
        !current.prologueShown &&
        context.chapterTheater
      ) {
        current.prologueShown = true;
        save();
        await context.chapterTheater.play({
          heading: `外传 ｜ ${act.title}`,
          prose: current.prologue,
          buttonLabel: '踏上旅途 ›',
          mode: 'overland-intro',
          map: current.discovery?.map || 'ruins',
          place: currentStage?.to?.name || '',
          act: 1,
        });
        if (run() !== current || session.runtime.disposed) return;
      }
      const playback = context.gal.play(text, {
        owner,
        title: act.title,
        mandatory: true,
        onComplete: () => {
          complete = true;
        },
      });
      if (current.index === 0 && phase === 'intro') context.mapExpansion?.discover(current);
      await playback;
    } finally {
      reading = false;
    }
    if (!complete || run() !== current) return;
    (current.lines ||= []).push({ speaker: '旁白', text, encounter: current.index, stage: phase });
    if (phase === 'outcome') {
      await settle(current, true);
    } else {
      current.phase = currentStage.type === 'event' ? 'choice' : 'battle';
      save();
      updateForm();
      render();
    }
  }

  async function submitRp(rawText, options = {}) {
    const current = run();
    const text = rawText.trim();
    if (!current || !text || rpRequest || reading || session.runtime.mode !== 'inn') return;
    const act = current.acts[current.index];
    if (current.phase !== 'choice' || act?.choices?.some((item) => item.outcome)) return;
    const library = session.ai.library;
    const fullMembers = partyIds()
      .map((id) => library.characters.find((member) => member.id === id))
      .filter(Boolean);
    const people = fullMembers.map(settingOnly);
    const protagonistId = library.campaign?.protagonistId;
    const choiceSpec = options.choice || null;
    const choiceIndex = Number.isInteger(options.choiceIndex) ? options.choiceIndex : 0;
    let chosenMember = fullMembers[0] || null;
    let choiceCheck = null;
    if (choiceSpec) {
      const dcSpec = choiceSpec.dcCheck || {
        attr: ['str', 'wis', 'dex', 'cha'][choiceIndex % 4],
        dc: [8, 9, 10, 8][choiceIndex % 4],
      };
      chosenMember =
        fullMembers.find((member) => member.id === dcSpec.actor) || fullMembers[0] || null;
      choiceCheck = resolveFixedChoiceCheck({
        library,
        member: chosenMember,
        choice: { ...choiceSpec, dcCheck: dcSpec },
        seed: `${current.id}:${current.index}:${choiceSpec.id || choiceIndex}`,
      });
    }
    const leg = stage(current);
    const control = new AbortController();
    rpRequest = control;
    current.draft = text;
    notice.textContent = '';
    context.gal.waiting();
    updateForm();
    let replyText = null;
    let lastResult = null;
    let lastResponseId = '';
    let ok = false;
    try {
      const result = await context.apiClient.request(
        'generate/quick-chat',
        {
          text,
          characters: people,
          selected: people.map(({ id }) => id),
          environment: `${leg.from.name} → ${leg.to.name}（${act.title}）`,
          history: memoryChat(actHistory(current)),
          dialogueScenes: dialogueTargets(dialogueScenes()),
          dialogueContext: dialogueContext(),
          protagonistId,
          relationships: library.relationships,
          ...(choiceCheck
            ? { dcContext: { mode: 'fixed', choiceCheck } }
            : {
                dcContext: {
                  mode: 'free',
                  forced: false,
                  ...prepareFreeDcContext(library, fullMembers, Math.random, leg?.level || 3),
                },
              }),
        },
        { signal: control.signal },
      );
      if (control.signal.aborted || run() !== current) return;
      if (!result?.content) throw Error('旅途回应缺少正文');
      const turnIndex = Math.floor(actHistory(current).length / 2) + 1;
      const responseId = `${current.id}:${current.index}:${turnIndex}`;
      context.quests?.collect(result.quest, responseId, scene());
      applyFutureDialogue(
        dialogueScenes(),
        result.dialogue,
        responseId,
        people.find((person) => person.id === protagonistId),
      );
      (current.history ||= []).push(
        { role: 'user', content: text, index: current.index },
        { role: 'assistant', content: result.content, index: current.index },
      );
      replyText = result.display || result.content;
      lastResult = result;
      lastResponseId = responseId;
      recordDialogue(text, replyText, responseId);
      current.draft = '';
      field.value = '';
      save();
      ok = true;
    } catch (failure) {
      if (run() === current && !control.signal.aborted) {
        notice.textContent = failure.message;
        if (form.hidden) context.shell.toast(failure.message);
      }
    } finally {
      if (rpRequest === control) rpRequest = null;
      context.gal.settled(owner);
      updateForm();
      render();
    }
    if (!ok || !replyText || run() !== current) return;
    reading = true;
    updateForm();
    let dcOutcomeSummary = null;
    try {
      if (context.dice && lastResult && (choiceCheck || lastResult.dcOutcome?.triggered)) {
        dcOutcomeSummary = await context.dice.playReply(
          lastResult,
          { owner, title: act.title, mandatory: true },
          {
            style: 'free',
            actionText: text,
            fixedCheck: choiceCheck,
            member: chosenMember,
            claimId: lastResponseId,
          },
        );
      } else {
        await context.gal.play(replyText, { owner, title: act.title, mandatory: true });
      }
    } finally {
      reading = false;
      updateForm();
      render();
    }
    if (dcOutcomeSummary?.ambush && run() === current && !fighting && leg) {
      const ambushPlan = buildSkirmishEncounterPlan(
        {
          id: `ambush-${lastResponseId}`,
          nodeId: leg.to.id,
          ecology: 'plains',
          level: leg.level || 2,
          tier: 'elite',
          seed: lastResponseId.length * 97 + current.index,
        },
        leg.level || 2,
      );
      const wave = ambushPlan.encounters[0];
      fighting = true;
      try {
        await context.journey.startOverlandBattle({
          overland: { run: current.id, leg: leg.id, partyIds: partyIds(), ambush: true },
          returnScene: leg.to.id,
          spec: {
            name: `${act.title} · 突发遭遇`,
            map: 'forest',
            enemyIds: wave.enemies,
            level: wave.level,
            growthEntry: {
              level: wave.level,
              seed: ambushPlan.rewards.ether * 31,
              sequence: 0,
              map: 'forest',
            },
          },
        });
      } finally {
        fighting = false;
      }
    }
  }

  async function act(choice) {
    const current = run();
    if (!current || session.runtime.mode !== 'inn') return;
    const leg = stage(current);
    const actItem = current.acts[current.index];
    if (current.phase === 'choice') {
      if (choice === 'rp') {
        openWorkspace(current);
        return;
      }
      if (choice === 'continue') {
        continueJourney(current);
        return;
      }
      const picked = actItem.choices?.find((item) => item.id === choice);
      if (!picked) return;
      if (picked.outcome) {
        current.choice = picked.id;
        current.phase = 'outcome';
        save();
        render();
        await arrive(scene());
      } else {
        openWorkspace(current);
        await submitRp(picked.label, {
          choice: picked,
          choiceIndex: actItem.choices.indexOf(picked),
        });
      }
    } else if (current.phase === 'battle' && choice === 'fight' && !fighting) {
      fighting = true;
      try {
        await context.journey.startOverlandBattle({
          overland: { run: current.id, leg: leg.id, partyIds: partyIds() },
          battleLines: current.acts[current.index].battleLines || null,
          returnScene: leg.to.id,
          spec: {
            name: current.acts[current.index].title,
            map: 'forest',
            enemyIds: leg.enemyIds,
            level: leg.level,
            growthEntry: { level: leg.level, seed: 2601, sequence: 0, map: 'forest' },
          },
        });
      } finally {
        fighting = false;
      }
    }
  }

  async function launchSkirmishWave(plan, waveIndex, returnScene) {
    if (fighting) return;
    const wave = plan.encounters?.[waveIndex];
    if (!wave) return;
    fighting = true;
    try {
      await context.journey.startOverlandBattle({
        skirmishRun: { nodeId: plan.nodeId, plan, waveIndex },
        forceTransition: waveIndex > 0,
        returnScene,
        spec: {
          name: `${plan.label} · 第 ${waveIndex + 1}/${plan.encounters.length} 波 (${wave.name})`,
          map: 'forest',
          enemyIds: wave.enemies,
          level: wave.level,
          boss: wave.boss,
          growthEntry: {
            level: wave.level,
            seed: 3100 + waveIndex,
            sequence: waveIndex,
            map: 'forest',
          },
        },
      });
    } finally {
      fighting = false;
    }
  }

  function checkSkirmish(sceneId) {
    const library = session.ai.library;
    if (
      !outing() ||
      run() ||
      request ||
      fighting ||
      skirmishDialog.open ||
      session.runtime.mode !== 'inn' ||
      dismissedSkirmish === sceneId
    )
      return;
    const node = library.skirmishes?.nodes?.[sceneId];
    if (!node) return;
    const plan = buildSkirmishEncounterPlan(node);
    const ingNames = Object.keys(plan.rewards.ingredients || {})
      .map((id) => INGREDIENTS[id]?.name || id)
      .join('、');
    skirmishDialog.innerHTML = `<div class="skirmish-card">
      <small>WILD SKIRMISH · ${node.tier === 'boss' ? '首领级游荡遭遇' : '三波魔物巡逻'}</small>
      <h3 id="skirmish-dialog-title">${escapeText(plan.label)}（Lv.${plan.level}）</h3>
      <p>前路巡逻魔物正在集结（连续 ${plan.encounters.length} 波交锋）。获胜可获得金币 ${plan.rewards.gold}、以太 ${plan.rewards.ether}${ingNames ? `，以及食材 ${escapeText(ingNames)}` : ''}${plan.rewards.gems?.length ? ' 与宝石碎片' : ''}。</p>
      <div class="skirmish-actions">
        <button type="button" data-skirmish-skip>绕行避开</button>
        <button type="button" class="primary" data-skirmish-fight>迎战 ${plan.encounters.length} 波巡逻</button>
      </div>
    </div>`;
    skirmishDialog.querySelector('[data-skirmish-skip]').onclick = () => {
      dismissedSkirmish = sceneId;
      skirmishDialog.close();
    };
    skirmishDialog.querySelector('[data-skirmish-fight]').onclick = () => {
      skirmishDialog.close();
      void launchSkirmishWave(plan, 0, sceneId);
    };
    skirmishDialog.showModal();
  }

  async function finishBattle() {
    const expedition = session.journey.expedition;
    const skirmishRun = expedition.overlandBattle?.skirmishRun;
    if (skirmishRun) {
      const won = session.battle.state.phase === 'victory';
      const totalWaves = skirmishRun.plan.encounters.length;
      const isFinalWave = skirmishRun.waveIndex + 1 >= totalWaves;
      if (!expedition.pendingResult) {
        if (won) await context.battleBarks?.battleWon();
        let settled = false;
        if (won && isFinalWave) {
          settleSkirmishVictory(session.ai.library, skirmishRun.plan);
          settled = true;
        }
        expedition.status = !won || isFinalWave ? (won ? 'complete' : 'failed') : 'in-progress';
        expedition.pendingResult = {
          won,
          complete: !won || isFinalWave,
          encounter: skirmishRun.waveIndex,
          awards: expedition.experienceAwards || [],
          ether: settled ? skirmishRun.plan.rewards.ether : 0,
          rewards: settled ? skirmishRun.plan.rewards : undefined,
          loot: [],
        };
        context.audio.play(won ? 'victory' : 'defeat');
        save();
        context.checkpoint.saveNow();
      }
      await context.settlement.show({
        ...expedition.pendingResult,
        onwardLabel: `迎战第 ${skirmishRun.waveIndex + 2}/${totalWaves} 波`,
        onward:
          won && !isFinalWave
            ? () => {
                document.querySelector('#result').close();
                void launchSkirmishWave(
                  skirmishRun.plan,
                  skirmishRun.waveIndex + 1,
                  expedition.overlandBattle.returnScene,
                );
              }
            : undefined,
        retreat: won && !isFinalWave,
        backLabel: won && isFinalWave ? '收下战利品' : '撤回原地',
        back() {
          document.querySelector('#result').close();
          context.journey.returnInn();
          context.daily.refresh?.();
          context.checkpoint.saveNow();
        },
      });
      return;
    }
    const current = run();
    const won = session.battle.state.phase === 'victory';
    if (!expedition.pendingResult) {
      if (won) await context.battleBarks?.battleWon();
      const leg = current ? stage(current) : null;
      const runId = current && leg ? `overland:${current.id}:${leg.id}` : null;
      if (won && runId && current?.items?.length) {
        archiveOverlandLoot(session.ai.library, {
          runId,
          title: current.acts[current.index]?.title || leg.to?.name || '外出行程',
          leg,
          items: current.items,
        });
        if (!(await context.lootConflicts.resolve(runId))) return;
      }
      const loot = won && runId ? dungeonLoot(session.ai.library, runId) : [];
      const ether = won && runId ? settleEther(session.ai.library, runId) : 0;
      expedition.status = won ? 'complete' : 'failed';
      expedition.pendingResult = {
        won,
        complete: true,
        encounter: 0,
        awards: expedition.experienceAwards || [],
        ether,
        loot,
      };
      context.audio.play(won ? 'victory' : 'defeat');
      save();
      context.checkpoint.saveNow();
    }
    if (
      won &&
      current?.id === expedition.overlandBattle.overland.run &&
      stage(current).id === expedition.overlandBattle.overland.leg &&
      current.index + 1 === current.acts.length &&
      !current.epilogueShown
    ) {
      await playOverlandEpilogue(current);
      if (session.runtime.disposed) return;
    }
    await context.settlement.show({
      ...expedition.pendingResult,
      backLabel: won ? '继续行程' : '退回上一站',
      back() {
        if (
          current?.id === expedition.overlandBattle.overland.run &&
          stage(current).id === expedition.overlandBattle.overland.leg
        ) {
          void settle(current, won, false);
          expedition.overlandBattle.returnScene = outing()?.scene;
        }
        context.journey.returnInn();
        context.checkpoint.saveNow();
      },
    });
  }

  function status() {
    if (request && !run()) return '<span>正在生成外出剧本…</span>';
    const current = run();
    if (!current) return '';
    const act = current.acts[current.index];
    const header = `<span>第 ${current.index + 1}／${current.acts.length} 幕 · ${escapeText(act.title)}</span>`;
    if (current.phase === 'choice') {
      if (act.choices?.some((item) => item.outcome)) {
        return (
          header +
          act.choices
            .map(
              (item) =>
                `<button type="button" data-daily="travel:${item.id}">${escapeText(item.label)}</button>`,
            )
            .join('')
        );
      }
      const turns = actHistory(current).length;
      const last = current.index + 1 === current.acts.length;
      const suggestions =
        !turns && act.choices?.length
          ? act.choices
              .map(
                (item) =>
                  `<button type="button" data-daily="travel:${item.id}">${escapeText(item.label)}</button>`,
              )
              .join('')
          : '';
      return (
        header +
        '<button type="button" data-daily="travel:rp">继续扮演</button>' +
        suggestions +
        `<button type="button" data-daily="travel:continue">${last ? '抵达终点' : '继续赶路'}</button>`
      );
    }
    if (current.phase === 'battle')
      return header + '<button type="button" data-daily="travel:fight">迎战</button>';
    return header;
  }

  function dialogueContext() {
    const current = run();
    if (!current) return null;
    const leg = stage(current);
    const act = current.acts[current.index];
    return {
      title: act.title,
      from: leg.from.name,
      place: leg.to.name,
      ...(leg.via?.length ? { via: leg.via } : {}),
      opening: act.story,
      history: (current.lines || []).slice(-8),
    };
  }

  function dialogueScenes() {
    const current = run();
    if (!current || reading) return [];
    return current.acts.flatMap((act, index) => {
      if (index < current.index) return [];
      const scenes = [];
      if (index > current.index || current.phase === 'depart') {
        scenes.push({
          id: `overland-${index}-intro`,
          text: act.story,
          limit: 5000,
          write(text) {
            act.story = text;
          },
        });
      }
      if (index > current.index || ['depart', 'intro', 'choice'].includes(current.phase)) {
        for (const choice of act.choices || []) {
          if (!choice.outcome) continue;
          scenes.push({
            id: `overland-${index}-${choice.id}`,
            text: choice.outcome,
            limit: 2400,
            write(text) {
              choice.outcome = text;
            },
          });
        }
      }
      return scenes;
    });
  }

  function recordDialogue(text, reply, chatId) {
    const current = run();
    if (!current) return;
    current.lines = (current.lines || []).filter((line) => !chatId || line.chatId !== chatId);
    current.lines.push(
      { speaker: '玩家', text, encounter: current.index, stage: 'quick-chat', chatId },
      { speaker: '旁白', text: reply, encounter: current.index, stage: 'quick-chat', chatId },
    );
    save();
  }

  context.events.on(field, 'input', () => {
    const current = run();
    if (current) current.draft = field.value;
  });
  context.events.on(form, 'submit', async (event) => {
    event.preventDefault();
    await submitRp(field.value);
  });
  context.events.on(form, 'click', (event) => {
    const current = run();
    if (!current || rpRequest || reading) return;
    if (event.target.closest('[data-overland-continue]')) {
      continueJourney(current);
      return;
    }
    const picked = event.target.closest('[data-overland-choice]');
    if (picked && !field.disabled) {
      const actItem = current.acts[current.index];
      const list = actItem?.choices || [];
      const pickedId = picked.dataset.overlandChoice || '';
      let idx = list.findIndex((item) => item.id && item.id === pickedId);
      if (idx < 0) idx = list.findIndex((item) => item.label === picked.textContent);
      const choiceSpec = list[idx];
      field.value = picked.textContent;
      void submitRp(field.value, choiceSpec ? { choice: choiceSpec, choiceIndex: idx } : {});
    }
  });

  return {
    start,
    resume,
    arrive,
    act,
    finishBattle,
    checkSkirmish,
    status,
    run,
    dialogueContext,
    dialogueScenes,
    recordDialogue,
    busy: () => Boolean(request || rpRequest || run()),
    dispose() {
      request?.abort();
      rpRequest?.abort();
      context.gal.cancel(owner);
      form.remove();
      skirmishDialog.remove();
    },
  };
}
