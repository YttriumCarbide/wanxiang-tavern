import { createOverlordReloadWatch } from './overlord-reload-watch.js';
import { createEventScope } from '../shared/events.js';
import { html } from '../shared/html.js';
import { createPopoverSurface } from '../shared/top-layer.js';
import { escapeText } from '../ui.js';
import { APEP_ID, apepAttack, apepPlague } from '../apep-presentation.js';
import {
  OVERLORD_DIALOGUES,
  overlordDialoguePack,
  overlordPhaseProfile,
  overlordSealedBark,
} from '../overlord-mechanics.js';
import {
  OVERLORD_TUTORIALS,
  detectOverlordTutorialTrigger,
} from '../content/overlord-tutorials.js';
import { query as $, sleep } from './dom.js';

const SEALED_TARGETS = Object.freeze([
  ['#saves-open', 'saves'],
  ['#ai-open', 'settings'],
  ['#party-toggle', 'party'],
  ['#back-inn', 'retreat'],
  ['#story-toggle', 'story'],
  ['#generation-review', 'review'],
  ['#ledger-handle', 'ledger'],
]);

function formatKeywordText(text) {
  return escapeText(String(text || '')).replace(
    /【([^】]+)】/g,
    (_, inner) => html`<em class="overlord-kw">【${inner}】</em>`,
  );
}

/** Coordinates Overlord cutscenes, exclusive subtitles, live time-bomb countdowns, and fourth-wall UI seals. */
export function createOverlordBattle(context) {
  const { session } = context;
  const events = createEventScope();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let disposed = false;
  let introPlayedKey = '';
  let dialogueQueue = [];
  let dialogueRunning = false;
  let cancelSleep = null;
  let closeToken = 0;
  let domainLockedRound = -1;
  let activeBombKey = '';
  let bombStartAt = 0;
  let bombDeadlineAt = 0;
  let bombDurationMs = 0;
  let bombTargetId = '';
  let bombRaf = 0;
  let bombTriggered = false;
  let bombPausedAt = 0;
  let lastCriticalTickSec = -1;
  const {
    readReloadWatch,
    writeReloadWatch,
    clearReloadWatch,
    armReloadWatch,
    markReloadOnUnload,
    checkReloadFourthWall,
    cancelReloadBark,
  } = createOverlordReloadWatch({
    context,
    currentOverlordDef,
    showLine,
    isDisposed: () => disposed,
  });

  const tutorialDialog = document.createElement('dialog');
  tutorialDialog.id = 'overlord-tutorial-dialog';
  tutorialDialog.className = 'overlord-tutorial-dialog';
  tutorialDialog.setAttribute('aria-labelledby', 'overlord-tutorial-title');
  document.body.append(tutorialDialog);
  events.on(tutorialDialog, 'close', () => {
    if (!disposed) context.emblems?.check?.();
  });

  const cutsceneLayer = document.createElement('section');
  let cutsceneToken = 0;
  cutsceneLayer.id = 'overlord-cutscene-layer';
  cutsceneLayer.className = 'overlord-cutscene-layer';
  cutsceneLayer.hidden = true;
  cutsceneLayer.setAttribute('aria-live', 'assertive');
  cutsceneLayer.innerHTML = html`
    <div class="overlord-dark-veil" aria-hidden="true"></div>
    <div class="apep-eclipse-disc" aria-hidden="true"></div>
    <div class="overlord-slash-beam" aria-hidden="true"></div>
    <div class="overlord-white-flash" aria-hidden="true"></div>
  `;
  document.body.append(cutsceneLayer);
  const cutsceneSurface = createPopoverSurface(cutsceneLayer);

  const dialogueBar = document.createElement('aside');
  dialogueBar.id = 'overlord-dialogue-bar';
  dialogueBar.className = 'overlord-dialogue-bar';
  dialogueBar.hidden = true;
  dialogueBar.setAttribute('aria-live', 'polite');
  dialogueBar.innerHTML = html`
    <div class="overlord-dialogue-frame">
      <div class="overlord-dialogue-meta">
        <span class="overlord-dialogue-crown" aria-hidden="true">♛</span>
        <small data-dl-rank></small>
        <strong data-dl-speaker></strong>
      </div>
      <p class="overlord-dialogue-text" data-dl-text></p>
    </div>
  `;
  document.body.append(dialogueBar);
  const dialogueSurface = createPopoverSurface(dialogueBar);

  const bombVignette = document.createElement('div');
  bombVignette.id = 'overlord-bomb-vignette';
  bombVignette.className = 'overlord-bomb-vignette';
  bombVignette.hidden = true;
  bombVignette.setAttribute('aria-hidden', 'true');
  document.body.append(bombVignette);

  const plagueEdge = document.createElement('div');
  plagueEdge.id = 'apep-plague-edge';
  plagueEdge.className = 'apep-plague-edge';
  plagueEdge.hidden = true;
  plagueEdge.setAttribute('aria-hidden', 'true');
  plagueEdge.innerHTML = html`
    <div class="apep-plague-edge-vignette"></div>
    <div class="apep-plague-edge-veins"></div>
    <div class="apep-plague-edge-pulse"></div>
  `;
  document.body.append(plagueEdge);
  let lastCorruptBarkKey = '';

  function battleKey() {
    const state = session.battle.state;
    const exp = session.journey.expedition;
    if (!state || !exp) return '';
    return `${exp.id || 'run'}:${state.encounter ?? 0}:${exp.overlandBattle?.overland?.leg || ''}`;
  }

  function currentOverlordDef() {
    const state = session.battle.state;
    if (!state?.enemyIds?.length) return null;
    const overlords = [];
    for (const id of state.enemyIds) {
      const def = state.enemyDefinitions?.[id] || context.roster?.get?.(id);
      if (def?.overlord) overlords.push({ id, def, unit: state.units?.[id] });
    }
    if (!overlords.length) return null;
    return (
      overlords.find((entry) => entry.id === 'moonEye' && entry.unit?.hp > 0) ||
      overlords.find((entry) => entry.unit?.hp > 0) ||
      overlords[0]
    );
  }

  function wakeDialogueSleep() {
    const fn = cancelSleep;
    cancelSleep = null;
    fn?.();
  }

  function interruptibleSleep(ms) {
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (cancelSleep === finish) cancelSleep = null;
        resolve();
      };
      const timer = setTimeout(finish, ms);
      cancelSleep = finish;
    });
  }

  function clearDialogue() {
    closeToken++;
    dialogueQueue = [];
    dialogueRunning = false;
    wakeDialogueSleep();
    dialogueBar.classList.remove('is-entering', 'is-leaving', 'is-swapping', 'is-glitch');
    dialogueSurface.hide();
    dialogueBar.hidden = true;
  }

  async function drainDialogueQueue() {
    if (dialogueRunning || disposed) return;
    dialogueRunning = true;
    const myCloseToken = closeToken;
    const activeBoss = currentOverlordDef();
    const pack = OVERLORD_DIALOGUES[activeBoss?.id] || OVERLORD_DIALOGUES.alchemicalPuppet;

    try {
      while (!disposed && myCloseToken === closeToken && dialogueQueue.length) {
        const item = dialogueQueue.shift();
        if (!item?.text) continue;
        const speed = Math.max(0.5, session.battle.speed || 1);
        const holdMs = Math.round((item.holdMs || 3200) / speed);
        const alreadyVisible = !dialogueBar.hidden;

        dialogueBar.querySelector('[data-dl-rank]').textContent =
          item.rankLabel || pack.rankLabel || '磨坊阁楼 · 失控炼金造物';
        dialogueBar.querySelector('[data-dl-speaker]').textContent =
          item.speaker || activeBoss?.def?.name || '失败的炼金傀偶';
        dialogueBar.querySelector('[data-dl-text]').innerHTML = formatKeywordText(item.text);
        dialogueBar.dataset.tone = item.tone || 'boss';
        dialogueBar.dataset.overlordTheme = activeBoss?.id === APEP_ID ? 'apep' : '';
        dialogueBar.classList.remove('is-leaving', 'is-glitch', 'is-swapping');
        void dialogueBar.offsetWidth;

        if (alreadyVisible) {
          dialogueBar.classList.add('is-swapping');
        } else {
          dialogueBar.classList.add('is-entering', 'is-glitch');
          dialogueBar.hidden = false;
          dialogueSurface.show();
        }
        await interruptibleSleep(holdMs);
      }

      if (!disposed && myCloseToken === closeToken && !dialogueBar.hidden) {
        dialogueBar.classList.remove('is-entering', 'is-swapping', 'is-glitch');
        dialogueBar.classList.add('is-leaving');
        await interruptibleSleep(220);
        if (!disposed && myCloseToken === closeToken && !dialogueQueue.length) {
          dialogueSurface.hide();
          dialogueBar.hidden = true;
          dialogueBar.classList.remove('is-leaving');
        }
      }
    } finally {
      dialogueRunning = false;
      if (!disposed && myCloseToken === closeToken && dialogueQueue.length) {
        void drainDialogueQueue();
      }
    }
  }

  function enqueueLines(items, { interrupt = false } = {}) {
    if (disposed) return Promise.resolve();
    const valid = (items || []).filter(
      (item) => item && typeof item.text === 'string' && item.text,
    );
    if (!valid.length) return Promise.resolve();
    if (interrupt) {
      dialogueQueue = [...valid];
      wakeDialogueSleep();
    } else {
      dialogueQueue.push(...valid);
    }
    return drainDialogueQueue();
  }

  function showLine(
    speaker,
    text,
    { rankLabel = '', tone = 'boss', holdMs = 3200, interrupt = false } = {},
  ) {
    return enqueueLines([{ speaker, text, rankLabel, tone, holdMs }], { interrupt });
  }

  async function playPhaseCutscene({ bossId, tone = 'phase', roarLines = [] }) {
    if (disposed) return;
    const ticket = ++cutsceneToken;
    const apep = bossId === APEP_ID;
    const speed = Math.max(0.5, session.battle.speed || 1);
    const center = session.runtime.view?.unitScreenCenter?.(bossId) || { x: 50, y: 38 };
    cutsceneLayer.style.setProperty('--spot-x', `${center.x}%`);
    cutsceneLayer.style.setProperty('--spot-y', `${center.y}%`);
    cutsceneLayer.dataset.tone = tone;
    cutsceneLayer.dataset.overlordTheme = apep ? 'apep' : '';
    cutsceneLayer.classList.remove('is-dim', 'is-slash', 'is-impact', 'is-out');
    cutsceneLayer.hidden = false;
    cutsceneSurface.show();
    void cutsceneLayer.offsetWidth;

    const lines = (roarLines || []).filter(Boolean);
    if (!reduced) {
      const clip = apep
        ? tone === 'entrance'
          ? 'Apep_Entrance'
          : 'Apep_Eclipse'
        : 'Special_Action';
      session.runtime.view?.playOverlordClip?.(bossId, clip, speed);
      cutsceneLayer.classList.add('is-dim');
      await sleep(Math.round((apep ? 360 : 220) / speed));
      if (disposed || ticket !== cutsceneToken) return;

      cutsceneLayer.classList.add('is-slash');
      await sleep(Math.round((apep ? 390 : 210) / speed));
      if (disposed || ticket !== cutsceneToken) return;

      context.audio?.play?.(apep ? 'apep-eclipse' : 'combine');
      session.runtime.view?.triggerImpact?.({ heavy: true, hitStopMs: 105 });
      $('#battle')?.classList.remove('overlord-heavy-shake');
      void $('#battle')?.offsetWidth;
      $('#battle')?.classList.add('overlord-heavy-shake');
      cutsceneLayer.classList.add('is-impact');
      if (lines.length) {
        const speaker = context.roster?.get?.(bossId)?.name;
        void enqueueLines(
          lines.map((text, idx) => ({
            speaker,
            text,
            tone: idx > 0 ? 'enraged' : 'boss',
            holdMs: 3200,
          })),
          { interrupt: true },
        );
      }
      await sleep(Math.round((apep ? 790 : 620) / speed));
      if (disposed || ticket !== cutsceneToken) return;

      cutsceneLayer.classList.add('is-out');
      await sleep(Math.round(220 / speed));
    } else {
      cutsceneLayer.classList.add('is-dim', 'is-impact');
      if (lines.length) {
        const speaker = context.roster?.get?.(bossId)?.name;
        void enqueueLines(
          lines.map((text) => ({ speaker, text, tone: 'enraged', holdMs: 2600 })),
          { interrupt: true },
        );
      }
      await sleep(450);
    }

    if (disposed || ticket !== cutsceneToken) return;
    $('#battle')?.classList.remove('overlord-heavy-shake');
    cutsceneSurface.hide();
    cutsceneLayer.hidden = true;
    cutsceneLayer.classList.remove('is-dim', 'is-slash', 'is-impact', 'is-out');
  }

  async function entrance() {
    const activeBoss = currentOverlordDef();
    const key = battleKey();
    if (
      !activeBoss ||
      !key ||
      introPlayedKey === key ||
      session.battle.state?.phase === 'victory'
    ) {
      return;
    }
    introPlayedKey = key;
    const prevWatch = readReloadWatch();
    armReloadWatch(activeBoss);
    const pack = OVERLORD_DIALOGUES[activeBoss.id] || OVERLORD_DIALOGUES.alchemicalPuppet;
    const lines = [...(pack.entrance || [`${activeBoss.def.name}封锁了阁楼的退路！`])];
    if (
      prevWatch?.bossId === activeBoss.id &&
      prevWatch.reenteredPending &&
      pack.reenterAfterReload
    ) {
      lines.push(pack.reenterAfterReload);
      const nextWatch = readReloadWatch();
      if (nextWatch) {
        writeReloadWatch({ ...nextWatch, reenteredPending: false });
      }
    }
    await playPhaseCutscene({
      bossId: activeBoss.id,
      tone: 'entrance',
      roarLines: lines,
    });
  }

  function applySeal(locked) {
    const active = Boolean(locked && session.runtime.mode === 'battle');
    document.body.classList.toggle('overlord-ui-locked', active);
    if (active) {
      context.ledger?.close?.();
      const storyFeed = $('#story-feed');
      if (storyFeed?.open) storyFeed.close();
      const savesDialog = $('#saves-dialog');
      if (savesDialog?.open) savesDialog.close();
      const aiDialog = $('#ai-dialog');
      if (aiDialog?.open) aiDialog.close();
    }
    for (const [selector, sealKey] of SEALED_TARGETS) {
      const el = document.querySelector(selector);
      if (!el) continue;
      if (active) {
        el.dataset.overlordSealed = sealKey;
        el.setAttribute('aria-disabled', 'true');
      } else {
        delete el.dataset.overlordSealed;
        el.removeAttribute('aria-disabled');
        el.classList.remove('sealed-rattle');
      }
    }
  }

  function triggerDomainLock(bossId) {
    applySeal(true);
    domainLockedRound = session.battle.state?.round ?? 1;
    const activeBoss = currentOverlordDef();
    const id = bossId || activeBoss?.id || 'alchemicalPuppet';
    const pack = OVERLORD_DIALOGUES[id] || OVERLORD_DIALOGUES.alchemicalPuppet;
    const name = activeBoss?.def?.name || context.roster?.get?.(id)?.name || '失败的炼金傀偶';
    void showLine(name, pack.domainLock, { tone: 'enraged', holdMs: 3200, interrupt: false });
  }

  function clearBombDom() {
    document.body.classList.remove(
      'overlord-bomb-active',
      'overlord-bomb-warning',
      'overlord-bomb-critical',
    );
    bombVignette.hidden = true;
    const commitBtn = $('#commit');
    if (commitBtn) {
      commitBtn.classList.remove('has-alchemical-bomb', 'is-warning', 'is-critical');
      commitBtn.style.removeProperty('--bomb-progress');
      commitBtn.querySelector('.commit-bomb-badge')?.remove();
    }
  }

  function disarmBombTimer({ resetKey = true } = {}) {
    if (bombRaf) {
      cancelAnimationFrame(bombRaf);
      bombRaf = 0;
    }
    if (resetKey) {
      activeBombKey = '';
      bombStartAt = 0;
      bombDeadlineAt = 0;
      bombDurationMs = 0;
      bombTargetId = '';
      bombTriggered = false;
      bombPausedAt = 0;
      lastCriticalTickSec = -1;
    }
    clearBombDom();
  }

  function renderBombTick(now) {
    const state = session.battle.state;
    const bomb = state?.activeAlchemicalBomb;
    if (
      disposed ||
      session.runtime.mode !== 'battle' ||
      session.battle.playing ||
      state?.phase !== 'plan' ||
      !bomb
    ) {
      disarmBombTimer({ resetKey: true });
      return;
    }
    const paused = tutorialDialog.open || document.body.classList.contains('gal-playing');
    if (paused) {
      if (!bombPausedAt) bombPausedAt = now;
    } else if (bombPausedAt) {
      const pauseDelta = Math.max(0, now - bombPausedAt);
      bombDeadlineAt += pauseDelta;
      bombStartAt += pauseDelta;
      bombPausedAt = 0;
    }
    const effectiveNow = paused ? bombPausedAt : now;
    const remainMs = Math.max(0, bombDeadlineAt - effectiveNow);
    const remainSec = remainMs / 1000;
    const fraction = bombDurationMs > 0 ? Math.max(0, Math.min(1, remainMs / bombDurationMs)) : 0;
    const warning = remainSec <= 15 && remainSec > 5;
    const critical = remainSec <= 5;

    document.body.classList.add('overlord-bomb-active');
    document.body.classList.toggle('overlord-bomb-warning', warning);
    document.body.classList.toggle('overlord-bomb-critical', critical);
    bombVignette.hidden = !critical;

    const formatted = `${remainSec.toFixed(1)}s`;
    for (const el of document.querySelectorAll(`[data-bomb-readout="${bombTargetId}"]`)) {
      if (el.textContent !== formatted) el.textContent = formatted;
      const badge = el.closest('.alchemical-bomb-badge');
      badge?.classList.toggle('is-warning', warning);
      badge?.classList.toggle('is-critical', critical);
    }

    const commitBtn = $('#commit');
    if (commitBtn) {
      commitBtn.classList.add('has-alchemical-bomb');
      commitBtn.classList.toggle('is-warning', warning);
      commitBtn.classList.toggle('is-critical', critical);
      commitBtn.style.setProperty('--bomb-progress', fraction.toFixed(4));
      let chip = commitBtn.querySelector('.commit-bomb-badge');
      if (!chip) {
        chip = document.createElement('span');
        chip.className = 'commit-bomb-badge';
        commitBtn.append(chip);
      }
      const nextText = `⏱ ${formatted}`;
      if (chip.textContent !== nextText) chip.textContent = nextText;
    }

    if (!paused && critical) {
      const ceilSec = Math.ceil(remainSec);
      if (ceilSec > 0 && ceilSec !== lastCriticalTickSec) {
        lastCriticalTickSec = ceilSec;
        context.audio?.play?.('drag');
      }
    }

    if (!paused && remainMs <= 0 && !bombTriggered) {
      bombTriggered = true;
      disarmBombTimer({ resetKey: false });
      state.bombExpired = true;
      const invalidIds = new Set((session.battle.forecast?.invalid || []).map((item) => item.id));
      if (invalidIds.size) {
        session.battle.plan = session.battle.plan.filter((action) => !invalidIds.has(action.id));
      }
      context.planning?.recompute?.();
      if (session.battle.forecast && !session.battle.forecast.valid) {
        session.battle.plan = [];
        context.planning?.recompute?.();
      }
      void context.playback?.commit?.({ forcedByBomb: true });
      return;
    }

    bombRaf = requestAnimationFrame(renderBombTick);
  }

  function syncPlague(battleEl, active, state) {
    const commit = $('#commit');
    const current = active && apepPlague(session.battle.display || state);
    const forecast = session.battle.playing ? null : session.battle.forecast;
    const next = active && apepPlague(forecast?.final);
    if (!current && !next) {
      delete battleEl.dataset.apepPlague;
      plagueEdge.hidden = true;
      delete plagueEdge.dataset.mode;
      delete plagueEdge.dataset.rearDanger;
      if (commit) {
        delete commit.dataset.apepPlague;
        commit.querySelector('.commit-plague-readout')?.remove();
      }
      return;
    }
    const mode = current ? 'active' : 'preview';
    battleEl.dataset.apepPlague = mode;
    const field = current || next;
    const maxAge = Math.max(0, ...(field?.ages || [0]));
    const sealedActive = Object.values(field?.sealed || {}).some(Boolean);
    const bossStage =
      state?.units?.[APEP_ID]?.bossStage || (state?.units?.[APEP_ID]?.enraged ? 2 : 1);
    const intensity = Math.min(
      1,
      0.28 +
        maxAge * 0.14 +
        (sealedActive ? 0.25 : 0) +
        (bossStage >= 3 ? 0.24 : bossStage === 2 ? 0.12 : 0),
    );
    plagueEdge.hidden = false;
    plagueEdge.dataset.mode = mode;
    plagueEdge.dataset.rearDanger = sealedActive ? '1' : '0';
    plagueEdge.style.setProperty(
      '--plague-intensity',
      mode === 'preview' ? '0.26' : intensity.toFixed(2),
    );
    if (
      current &&
      !session.battle.playing &&
      state?.phase === 'plan' &&
      Number.isInteger(current.corruptedSlot)
    ) {
      const key = `${battleKey()}:corrupt`;
      if (lastCorruptBarkKey !== key) {
        lastCorruptBarkKey = key;
        const pack = overlordDialoguePack(APEP_ID);
        if (pack.corruptSlot) {
          const bossName = context.roster?.get?.(APEP_ID)?.name || '阿佩普的羔羊';
          void showLine(bossName, pack.corruptSlot, {
            tone: 'enraged',
            holdMs: 2800,
            interrupt: false,
          });
        }
      }
    }
    if (!commit) return;
    commit.dataset.apepPlague = mode;
    let chip = commit.querySelector('.commit-plague-readout');
    if (!chip) {
      chip = document.createElement('span');
      chip.className = 'commit-plague-readout';
      commit.append(chip);
    }
    const tick = forecast?.events?.find(
      (event) => event.type === 'sinkingPlague' && event.actor === APEP_ID,
    );
    const amounts = (tick?.statusTriggers || [])
      .filter(({ type }) => type === 'sinkingPlague')
      .map(({ value }) => value);
    const smallest = Math.min(...amounts);
    const largest = Math.max(...amounts);
    chip.textContent = amounts.length
      ? `沉疫 −${smallest === largest ? largest : `${smallest}–${largest}`}`
      : '沉疫';
    chip.title = '回合末 · 边缘沉疫全队同伤 / 前场连承2回合禁盾禁疗禁回蓝（退回后场解除）';
  }

  function sync() {
    if (disposed) return;
    const state = session.battle.state;
    const active =
      session.runtime.mode === 'battle' && state && !['victory', 'defeat'].includes(state.phase);
    applySeal(Boolean(active && state.overlordUiLocked));

    const activeBoss = currentOverlordDef();
    if (active && activeBoss) {
      armReloadWatch(activeBoss);
    } else if (state && ['victory', 'defeat'].includes(state.phase) && activeBoss) {
      clearReloadWatch();
    }
    const battleEl = $('#battle');
    if (battleEl) {
      syncPlague(battleEl, active, state);
      if (active && activeBoss?.unit) {
        const apep = activeBoss.id === APEP_ID;
        const displayed = (apep && session.battle.display?.units[activeBoss.id]) || activeBoss.unit;
        const stage = displayed.bossStage || (displayed.enraged ? 2 : 1);
        battleEl.dataset.overlordStage = String(overlordPhaseProfile(activeBoss.def, stage).stage);
        battleEl.dataset.overlordTheme = activeBoss.id === APEP_ID ? 'apep' : '';
      } else {
        delete battleEl.dataset.overlordStage;
        delete battleEl.dataset.overlordTheme;
      }
    }

    const bomb = state?.activeAlchemicalBomb;
    if (!active || session.battle.playing || state.phase !== 'plan' || !bomb) {
      if (bombRaf || document.body.classList.contains('overlord-bomb-active')) {
        disarmBombTimer({ resetKey: true });
      }
      return;
    }

    const nextKey = `${battleKey()}:${bomb.round}:${bomb.target}:${bomb.durationSec}`;
    if (activeBombKey !== nextKey) {
      activeBombKey = nextKey;
      bombDurationMs = Math.max(1000, Number(bomb.durationSec || 40) * 1000);
      bombStartAt = performance.now();
      bombDeadlineAt = bombStartAt + bombDurationMs;
      bombTargetId = bomb.target;
      bombTriggered = false;
      bombPausedAt = 0;
      lastCriticalTickSec = -1;
      const targetName = context.roster?.get?.(bomb.target)?.name || bomb.target;
      const pack = overlordDialoguePack(bomb.owner);
      const ownerName = context.roster?.get?.(bomb.owner)?.name || '失败的炼金傀偶';
      if (typeof pack.bombArmed === 'function' && (bomb.round ?? -2) !== domainLockedRound) {
        void showLine(ownerName, pack.bombArmed(targetName, bomb.durationSec), {
          tone: 'enraged',
          holdMs: 3000,
          interrupt: false,
        });
      }
    }
    if (!bombRaf && !bombTriggered) {
      renderBombTick(performance.now());
    }
  }

  async function onEvent(event) {
    if (disposed || !event) return;
    const activeBoss = currentOverlordDef();
    const bossBroken =
      activeBoss &&
      event.statusTriggers?.some(
        (signal) => signal.type === 'break' && signal.id === activeBoss.id,
      );
    const pack = overlordDialoguePack(bossBroken ? activeBoss.id : event.actor || activeBoss?.id);
    const actorName =
      context.roster?.get?.(event.actor)?.name || activeBoss?.def?.name || '失败的炼金傀偶';
    if (event.overlordDomainLock) {
      triggerDomainLock(event.actor);
    }
    if (event.clearedCorruptedSlot && pack.slowBreakSlot) {
      void showLine(actorName, pack.slowBreakSlot, {
        tone: 'boss',
        holdMs: 2600,
        interrupt: false,
      });
    }
    if (event.type === 'bossPhase' && (event.overlord || event.actor === APEP_ID)) {
      const battleEl = $('#battle');
      if (battleEl && event.phaseStage) battleEl.dataset.overlordStage = String(event.phaseStage);
      const roarText = event.phaseStage >= 3 ? pack.phase3 : pack.phase2;
      await playPhaseCutscene({
        bossId: event.actor,
        tone: event.phaseStage >= 3 ? 'critical' : 'phase',
        roarLines: [roarText],
      });
    } else if (apepAttack(event)?.type === 'plague') {
      const first = apepPlague(event.after)?.ages.every((age) => age === 0);
      if (first)
        void showLine(actorName, pack.plague, { tone: 'enraged', holdMs: 2700, interrupt: true });
    } else if (event.type === 'sinkingPlague' && event.actor === APEP_ID) {
      if (!reduced) {
        $('#commit')?.animate(
          [
            { boxShadow: 'inset 0 -1px 0 #f4a394, 0 0 3px #a3485b', offset: 0 },
            { boxShadow: 'inset 0 -12px 17px #c85a74ae, 0 0 25px #e05e78aa', offset: 0.2 },
            { boxShadow: 'inset 0 -2px 0 #b25f75, 0 0 12px #a5445b48' },
          ],
          { duration: 640 / Math.max(0.5, session.battle.speed), easing: 'ease-out' },
        );
      }
      const fieldAfter = apepPlague(event.after);
      const age = fieldAfter?.ages?.[0];
      const hasSealed = Object.values(fieldAfter?.sealed || {}).some(Boolean);
      if (hasSealed && pack.rearPlagueAlert) {
        void showLine(actorName, pack.rearPlagueAlert, { tone: 'enraged', holdMs: 2600 });
      } else if (age === 2 && pack.plagueTick) {
        void showLine(actorName, pack.plagueTick, { tone: 'enraged', holdMs: 2200 });
      }
    } else if (event.type === 'bombDetonate') {
      const targetId = event.targets?.[0] || event.bomb?.target;
      const targetName = context.roster?.get?.(targetId)?.name || targetId || '前排目标';
      const line =
        typeof pack.bombDetonate === 'function'
          ? pack.bombDetonate(targetName, event.damage || 0)
          : event.label;
      void showLine(actorName, line, { tone: 'enraged', holdMs: 3200, interrupt: true });
    } else if (event.type === 'bombDefuse') {
      const targetId = event.targets?.[0] || event.bomb?.target;
      const targetName = context.roster?.get?.(targetId)?.name || targetId || '目标';
      const line = typeof pack.bombDefuse === 'function' ? pack.bombDefuse(targetName) : '';
      if (line) void showLine(actorName, line, { tone: 'boss', holdMs: 2600, interrupt: false });
    } else if (event.chargeStarted && pack.chargeStart) {
      void showLine(actorName, pack.chargeStart, {
        tone: 'enraged',
        holdMs: 3200,
        interrupt: false,
      });
    } else if (bossBroken && pack.breakShatter) {
      void showLine(activeBoss.def.name, pack.breakShatter, {
        tone: 'party',
        holdMs: 3200,
        interrupt: true,
      });
    } else if (event.fixedSlotBroken && event.blockedBy === 'bind') {
      void showLine(actorName, pack.broken, { tone: 'party', holdMs: 3200, interrupt: false });
    }
  }

  async function onVictory() {
    clearReloadWatch();
    applySeal(false);
    disarmBombTimer({ resetKey: true });
    delete $('#battle')?.dataset.overlordStage;
    const activeBoss = currentOverlordDef();
    if (!activeBoss) return false;
    const pack = OVERLORD_DIALOGUES[activeBoss.id] || OVERLORD_DIALOGUES.alchemicalPuppet;
    if (pack.defeat) {
      await showLine(activeBoss.def.name, pack.defeat, {
        tone: 'boss',
        holdMs: 1800,
        interrupt: true,
      });
    }
    return true;
  }

  function handleSealedInteraction(event) {
    if (disposed || !document.body.classList.contains('overlord-ui-locked')) return;
    const sealed = event.target?.closest?.('[data-overlord-sealed]');
    if (!sealed) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === 'pointerdown') return;
    sealed.classList.remove('sealed-rattle');
    void sealed.offsetWidth;
    sealed.classList.add('sealed-rattle');
    context.audio?.play?.('drag');
    const activeBoss = currentOverlordDef();
    const id = activeBoss?.id || session.battle.state?.overlordUiLocked || 'alchemicalPuppet';
    const name = activeBoss?.def?.name || context.roster?.get?.(id)?.name || '失败的炼金傀偶';
    void showLine(name, overlordSealedBark(id, sealed.dataset.overlordSealed), {
      tone: 'enraged',
      holdMs: 3000,
      interrupt: true,
    });
  }

  events.on(window, 'click', handleSealedInteraction, { capture: true });
  events.on(window, 'pointerdown', handleSealedInteraction, { capture: true });
  events.on(window, 'keydown', handleSealedInteraction, { capture: true });
  events.on(window, 'pagehide', (event) => {
    if (!event.persisted) markReloadOnUnload();
  });

  function checkMechanicTutorial(result, nextState) {
    if (
      disposed ||
      session.runtime.mode !== 'battle' ||
      ['apep-vfx-test', 'animation-fixture'].includes(session.journey?.expedition?.id)
    ) {
      return false;
    }
    const bossId = detectOverlordTutorialTrigger(result, nextState);
    if (!bossId) return false;
    const library = session.ai?.library;
    if (!library) return false;
    library.seenOverlordTutorials ||= [];
    if (library.seenOverlordTutorials.includes(bossId)) return false;
    const spec = OVERLORD_TUTORIALS[bossId];
    if (!spec) return false;
    library.seenOverlordTutorials.push(bossId);
    context.generation?.save?.();
    tutorialDialog.style.setProperty('--tutorial-accent', spec.accent || '#e2b95a');
    tutorialDialog.dataset.overlordId = spec.id;
    tutorialDialog.innerHTML = html`<div class="overlord-tutorial-frame">
      <header class="overlord-tutorial-head">
        <img
          class="overlord-tutorial-portrait"
          src="${spec.portrait}"
          alt="${escapeText(spec.bossName)}"
        />
        <div class="overlord-tutorial-titles">
          <small>${escapeText(spec.rankLabel)} · 霸主机制解析</small>
          <h2 id="overlord-tutorial-title">${escapeText(spec.headline)}</h2>
          <p>${escapeText(spec.intro)}</p>
        </div>
        <button id="overlord-tutorial-x" type="button" aria-label="关闭机制解析">×</button>
      </header>
      <div class="overlord-tutorial-body">
        <figure class="overlord-tutorial-diagram">${spec.diagramSvg}</figure>
        <div class="overlord-tutorial-cards">
          ${spec.mechanics
            .map(
              (item) =>
                html`<article class="overlord-tut-card">
                  <span class="overlord-tut-tag">${escapeText(item.tag)}</span>
                  <h3>${escapeText(item.title)}</h3>
                  <p>${escapeText(item.summary)}</p>
                  <div class="overlord-tut-counter">
                    <b>应对思路</b>
                    <span>${escapeText(item.counter)}</span>
                  </div>
                </article>`,
            )
            .join('')}
        </div>
      </div>
      <footer class="overlord-tutorial-foot">
        <p class="overlord-tut-takeaway">★ ${escapeText(spec.keyTakeaway)}</p>
        <button id="overlord-tutorial-close" type="button" class="primary">
          明白了 · 继续迎战
        </button>
      </footer>
    </div>`;
    const dismiss = () => {
      if (tutorialDialog.open) tutorialDialog.close();
    };
    tutorialDialog.querySelector('#overlord-tutorial-close').onclick = dismiss;
    tutorialDialog.querySelector('#overlord-tutorial-x').onclick = dismiss;
    if (!tutorialDialog.open) tutorialDialog.showModal();
    return true;
  }

  function reset() {
    cancelReloadBark();
    cutsceneToken++;
    introPlayedKey = '';
    domainLockedRound = -1;
    lastCorruptBarkKey = '';
    bombPausedAt = 0;
    if (tutorialDialog.open) tutorialDialog.close();
    clearDialogue();
    disarmBombTimer({ resetKey: true });
    applySeal(false);
    cutsceneSurface.hide();
    cutsceneLayer.hidden = true;
    plagueEdge.hidden = true;
    delete plagueEdge.dataset.mode;
    delete plagueEdge.dataset.rearDanger;
    const battleEl = $('#battle');
    if (battleEl) {
      battleEl.classList.remove('overlord-heavy-shake');
      delete battleEl.dataset.overlordStage;
      delete battleEl.dataset.overlordTheme;
      syncPlague(battleEl, false, null);
    }
  }

  /** Test & automation helper for time-bomb deadline acceleration without mutating combat math. */
  function expireBombNowForTest() {
    if (!activeBombKey) return false;
    bombDeadlineAt = performance.now() - 50;
    return true;
  }

  return {
    isOverlordBattle: () => Boolean(currentOverlordDef()),
    isSealed: () => document.body.classList.contains('overlord-ui-locked'),
    isTutorialOpen: () => tutorialDialog.open,
    entrance,
    checkReloadFourthWall,
    cancelReloadBark,
    checkMechanicTutorial,
    sync,
    onEvent,
    onVictory,
    disarmBombTimer: () => disarmBombTimer({ resetKey: true }),
    applySeal,
    clearSeal: () => applySeal(false),
    expireBombNowForTest,
    reset,
    dispose() {
      disposed = true;
      events.dispose();
      reset();
      tutorialDialog.remove();
      cutsceneLayer.remove();
      dialogueBar.remove();
      bombVignette.remove();
      plagueEdge.remove();
    },
  };
}
