import { createEventScope } from '../shared/events.js';
import { html } from '../shared/html.js';
import { createPopoverSurface } from '../shared/top-layer.js';
import { escapeText } from '../ui.js';
import {
  OVERLORD_DIALOGUES,
  overlordPhaseProfile,
  overlordReloadBark,
  overlordSealedBark,
} from '../overlord-mechanics.js';
import { query as $, sleep } from './dom.js';

const RELOAD_WATCH_KEY = 'wanxiang.overlord-reload-watch.v1';

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
  let lastCriticalTickSec = -1;
  let markedUnloadThisPage = false;

  function readReloadWatch() {
    for (const store of [globalThis.localStorage, context.storage]) {
      try {
        const raw = store?.getItem?.(RELOAD_WATCH_KEY);
        if (raw) return JSON.parse(raw);
      } catch {
        // Storage may be unavailable in restricted harnesses.
      }
    }
    return null;
  }

  function writeReloadWatch(payload) {
    const json = JSON.stringify(payload);
    for (const store of [globalThis.localStorage, context.storage]) {
      try {
        store?.setItem?.(RELOAD_WATCH_KEY, json);
      } catch {
        // Ignore quota or restricted storage errors.
      }
    }
  }

  function clearReloadWatch() {
    for (const store of [globalThis.localStorage, context.storage]) {
      try {
        store?.removeItem?.(RELOAD_WATCH_KEY);
      } catch {
        // Ignore restricted storage errors.
      }
    }
  }

  function armReloadWatch(activeBoss) {
    if (!activeBoss || disposed) return;
    const prev = readReloadWatch();
    const pack = OVERLORD_DIALOGUES[activeBoss.id] || OVERLORD_DIALOGUES.alchemicalPuppet;
    writeReloadWatch({
      bossId: activeBoss.id,
      bossName: activeBoss.def?.name || '失败的炼金傀偶',
      rankLabel: pack.rankLabel || '磨坊阁楼 · 失控炼金造物',
      armed: true,
      reloadedPending: Boolean(prev?.reloadedPending),
      reenteredPending: Boolean(prev?.reenteredPending),
      reloadCount: Number(prev?.reloadCount) || 0,
    });
  }

  function markReloadOnUnload() {
    if (disposed) return;
    const state = session.battle.state;
    const activeBoss = currentOverlordDef();
    if (
      session.runtime.mode !== 'battle' ||
      !activeBoss ||
      !state ||
      ['victory', 'defeat'].includes(state.phase)
    ) {
      return;
    }
    const prev = readReloadWatch();
    const pack = OVERLORD_DIALOGUES[activeBoss.id] || OVERLORD_DIALOGUES.alchemicalPuppet;
    const nextCount = (Number(prev?.reloadCount) || 0) + (markedUnloadThisPage ? 0 : 1);
    markedUnloadThisPage = true;
    const payload = JSON.stringify({
      bossId: activeBoss.id,
      bossName: activeBoss.def?.name || prev?.bossName || '失败的炼金傀偶',
      rankLabel: pack.rankLabel || prev?.rankLabel || '磨坊阁楼 · 失控炼金造物',
      armed: true,
      reloadedPending: true,
      reenteredPending: Boolean(prev?.reenteredPending),
      reloadCount: nextCount,
    });
    try {
      globalThis.localStorage?.setItem?.(RELOAD_WATCH_KEY, payload);
    } catch {
      // Ignore restricted storage errors.
    }
    try {
      context.storage?.setItem?.(RELOAD_WATCH_KEY, payload);
    } catch {
      // Ignore restricted storage errors.
    }
  }

  const cutsceneLayer = document.createElement('section');
  cutsceneLayer.id = 'overlord-cutscene-layer';
  cutsceneLayer.className = 'overlord-cutscene-layer';
  cutsceneLayer.hidden = true;
  cutsceneLayer.setAttribute('aria-live', 'assertive');
  cutsceneLayer.innerHTML = html`
    <div class="overlord-dark-veil" aria-hidden="true"></div>
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

  function battleKey() {
    const state = session.battle.state;
    const exp = session.journey.expedition;
    if (!state || !exp) return '';
    return `${exp.id || 'run'}:${state.encounter ?? 0}:${exp.overlandBattle?.overland?.leg || ''}`;
  }

  function currentOverlordDef() {
    const state = session.battle.state;
    if (!state?.enemyIds?.length) return null;
    for (const id of state.enemyIds) {
      const def = state.enemyDefinitions?.[id] || context.roster?.get?.(id);
      if (def?.overlord) return { id, def, unit: state.units?.[id] };
    }
    return null;
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
    const speed = Math.max(0.5, session.battle.speed || 1);
    const center = session.runtime.view?.unitScreenCenter?.(bossId) || { x: 50, y: 38 };
    cutsceneLayer.style.setProperty('--spot-x', `${center.x}%`);
    cutsceneLayer.style.setProperty('--spot-y', `${center.y}%`);
    cutsceneLayer.dataset.tone = tone;
    cutsceneLayer.classList.remove('is-dim', 'is-slash', 'is-impact', 'is-out');
    cutsceneLayer.hidden = false;
    cutsceneSurface.show();
    void cutsceneLayer.offsetWidth;

    const lines = (roarLines || []).filter(Boolean);
    if (!reduced) {
      session.runtime.view?.playOverlordClip?.(bossId, 'Special_Action', speed);
      cutsceneLayer.classList.add('is-dim');
      await sleep(Math.round(220 / speed));
      if (disposed) return;

      cutsceneLayer.classList.add('is-slash');
      await sleep(Math.round(210 / speed));
      if (disposed) return;

      context.audio?.play?.('combine');
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
      await sleep(Math.round(620 / speed));
      if (disposed) return;

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

    if (disposed) return;
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
    if (prevWatch?.reenteredPending && pack.reenterAfterReload) {
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
    const remainMs = Math.max(0, bombDeadlineAt - now);
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

    if (critical) {
      const ceilSec = Math.ceil(remainSec);
      if (ceilSec > 0 && ceilSec !== lastCriticalTickSec) {
        lastCriticalTickSec = ceilSec;
        context.audio?.play?.('drag');
      }
    }

    if (remainMs <= 0 && !bombTriggered) {
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
      if (active && activeBoss?.unit) {
        const stage = overlordPhaseProfile(activeBoss.def, activeBoss.unit.bossStage || 1).stage;
        battleEl.dataset.overlordStage = String(stage);
      } else {
        delete battleEl.dataset.overlordStage;
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
      lastCriticalTickSec = -1;
      const targetName = context.roster?.get?.(bomb.target)?.name || bomb.target;
      const pack = OVERLORD_DIALOGUES[bomb.owner] || OVERLORD_DIALOGUES.alchemicalPuppet;
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
    const pack =
      OVERLORD_DIALOGUES[event.actor || activeBoss?.id] || OVERLORD_DIALOGUES.alchemicalPuppet;
    const actorName =
      context.roster?.get?.(event.actor)?.name || activeBoss?.def?.name || '失败的炼金傀偶';
    if (event.overlordDomainLock) {
      triggerDomainLock(event.actor);
    }
    if (event.type === 'bossPhase' && event.overlord) {
      const battleEl = $('#battle');
      if (battleEl && event.phaseStage) battleEl.dataset.overlordStage = String(event.phaseStage);
      const roarText = event.phaseStage >= 3 ? pack.phase3 : pack.phase2;
      await playPhaseCutscene({
        bossId: event.actor,
        tone: event.phaseStage >= 3 ? 'critical' : 'phase',
        roarLines: [roarText],
      });
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
    } else if (
      event.statusTriggers?.some((st) => st.type === 'break' && st.id === activeBoss?.id) &&
      pack.breakShatter
    ) {
      void showLine(actorName, pack.breakShatter, {
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
  events.on(window, 'pagehide', markReloadOnUnload);
  events.on(window, 'beforeunload', markReloadOnUnload);

  function checkReloadFourthWall() {
    if (disposed) return false;
    const saved = readReloadWatch();
    if (!saved) return false;
    let isReloadNav;
    try {
      const navEntry = performance?.getEntriesByType?.('navigation')?.[0];
      isReloadNav = navEntry?.type === 'reload';
    } catch {
      isReloadNav = false;
    }
    if (!saved.reloadedPending && !(saved.armed && isReloadNav)) return false;
    const count = Math.max(1, Number(saved.reloadCount) || 1);
    writeReloadWatch({
      ...saved,
      armed: Boolean(currentOverlordDef()),
      reloadedPending: false,
      reenteredPending: true,
      reloadCount: count,
    });
    const text = overlordReloadBark(saved.bossId, count);
    setTimeout(() => {
      if (disposed) return;
      void showLine(saved.bossName || '失败的炼金傀偶', text, {
        rankLabel: saved.rankLabel || '磨坊阁楼 · 失控炼金造物',
        tone: 'enraged',
        holdMs: 4200,
        interrupt: true,
      });
    }, 260);
    return true;
  }

  function reset() {
    introPlayedKey = '';
    domainLockedRound = -1;
    clearDialogue();
    disarmBombTimer({ resetKey: true });
    applySeal(false);
    cutsceneSurface.hide();
    cutsceneLayer.hidden = true;
    const battleEl = $('#battle');
    if (battleEl) {
      battleEl.classList.remove('overlord-heavy-shake');
      delete battleEl.dataset.overlordStage;
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
    entrance,
    checkReloadFourthWall,
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
      cutsceneLayer.remove();
      dialogueBar.remove();
      bombVignette.remove();
    },
  };
}
