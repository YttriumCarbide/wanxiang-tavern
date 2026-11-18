import { createEventScope } from '../shared/events.js';
import { html } from '../shared/html.js';
import { createPopoverSurface } from '../shared/top-layer.js';
import { escapeText } from '../ui.js';
import {
  OVERLORD_DIALOGUES,
  overlordPhaseProfile,
  overlordSealedBark,
} from '../overlord-mechanics.js';
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
  let lineToken = 0;
  let activeBombKey = '';
  let bombStartAt = 0;
  let bombDeadlineAt = 0;
  let bombDurationMs = 0;
  let bombTargetId = '';
  let bombRaf = 0;
  let bombTriggered = false;
  let lastCriticalTickSec = -1;

  const cutsceneLayer = document.createElement('section');
  cutsceneLayer.id = 'overlord-cutscene-layer';
  cutsceneLayer.className = 'overlord-cutscene-layer';
  cutsceneLayer.hidden = true;
  cutsceneLayer.setAttribute('aria-live', 'assertive');
  cutsceneLayer.innerHTML = html`
    <div class="overlord-dark-veil" aria-hidden="true"></div>
    <div class="overlord-slash-beam" aria-hidden="true"></div>
    <div class="overlord-white-flash" aria-hidden="true"></div>
    <div class="overlord-phase-scroll">
      <small data-scroll-rank></small>
      <strong data-scroll-title></strong>
      <span data-scroll-sub></span>
    </div>
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

  function clearDialogue() {
    lineToken++;
    dialogueBar.classList.remove('is-entering', 'is-leaving');
    dialogueSurface.hide();
    dialogueBar.hidden = true;
  }

  async function showLine(speaker, text, { rankLabel = '', tone = 'boss', holdMs = 3400 } = {}) {
    if (disposed || !text) return;
    const myToken = ++lineToken;
    const speed = Math.max(0.5, session.battle.speed || 1);
    const activeBoss = currentOverlordDef();
    const pack = OVERLORD_DIALOGUES[activeBoss?.id] || OVERLORD_DIALOGUES.alchemicalPuppet;
    dialogueBar.querySelector('[data-dl-rank]').textContent =
      rankLabel || pack.rankLabel || '♛ 霸主降临';
    dialogueBar.querySelector('[data-dl-speaker]').textContent =
      speaker || activeBoss?.def?.name || '霸主';
    dialogueBar.querySelector('[data-dl-text]').innerHTML = formatKeywordText(text);
    dialogueBar.dataset.tone = tone;
    dialogueBar.classList.remove('is-leaving', 'is-glitch');
    void dialogueBar.offsetWidth;
    dialogueBar.classList.add('is-entering', 'is-glitch');
    dialogueBar.hidden = false;
    dialogueSurface.hide();
    dialogueSurface.show();
    await sleep(Math.round(holdMs / speed));
    if (disposed || myToken !== lineToken) return;
    dialogueBar.classList.remove('is-entering');
    dialogueBar.classList.add('is-leaving');
    await sleep(240);
    if (disposed || myToken !== lineToken) return;
    dialogueSurface.hide();
    dialogueBar.hidden = true;
    dialogueBar.classList.remove('is-leaving');
  }

  async function showSequence(items, holdMs = 3100) {
    if (disposed || !items?.length) return;
    const myToken = ++lineToken;
    const speed = Math.max(0.5, session.battle.speed || 1);
    const activeBoss = currentOverlordDef();
    const pack = OVERLORD_DIALOGUES[activeBoss?.id] || OVERLORD_DIALOGUES.alchemicalPuppet;
    for (const item of items) {
      if (disposed || myToken !== lineToken) return;
      dialogueBar.querySelector('[data-dl-rank]').textContent =
        item.rankLabel || pack.rankLabel || '♛ 霸主降临';
      dialogueBar.querySelector('[data-dl-speaker]').textContent =
        item.speaker || activeBoss?.def?.name || '霸主';
      dialogueBar.querySelector('[data-dl-text]').innerHTML = formatKeywordText(item.text);
      dialogueBar.dataset.tone = item.tone || 'boss';
      dialogueBar.classList.remove('is-leaving', 'is-glitch');
      void dialogueBar.offsetWidth;
      dialogueBar.classList.add('is-entering', 'is-glitch');
      dialogueBar.hidden = false;
      dialogueSurface.hide();
      dialogueSurface.show();
      await sleep(Math.round(holdMs / speed));
      if (disposed || myToken !== lineToken) return;
      dialogueBar.classList.remove('is-entering');
      dialogueBar.classList.add('is-leaving');
      await sleep(200);
    }
    if (!disposed && myToken === lineToken) {
      dialogueSurface.hide();
      dialogueBar.hidden = true;
      dialogueBar.classList.remove('is-leaving');
    }
  }

  async function playPhaseCutscene({
    bossId,
    rankLabel = '♛ OVERLORD AWAKENING',
    title = '',
    subtitle = '',
    tone = 'phase',
    roarText = '',
  }) {
    if (disposed) return;
    const speed = Math.max(0.5, session.battle.speed || 1);
    const center = session.runtime.view?.unitScreenCenter?.(bossId) || { x: 50, y: 38 };
    cutsceneLayer.style.setProperty('--spot-x', `${center.x}%`);
    cutsceneLayer.style.setProperty('--spot-y', `${center.y}%`);
    cutsceneLayer.dataset.tone = tone;
    cutsceneLayer.querySelector('[data-scroll-rank]').textContent = rankLabel;
    cutsceneLayer.querySelector('[data-scroll-title]').textContent = title;
    cutsceneLayer.querySelector('[data-scroll-sub]').textContent = subtitle;
    cutsceneLayer.classList.remove('is-dim', 'is-slash', 'is-impact', 'is-out');
    cutsceneLayer.hidden = false;
    cutsceneSurface.show();
    void cutsceneLayer.offsetWidth;

    if (!reduced) {
      session.runtime.view?.playOverlordClip?.(bossId, 'Special_Action', speed);
      cutsceneLayer.classList.add('is-dim');
      await sleep(Math.round(240 / speed));
      if (disposed) return;

      cutsceneLayer.classList.add('is-slash');
      await sleep(Math.round(230 / speed));
      if (disposed) return;

      context.audio?.play?.('combine');
      session.runtime.view?.triggerImpact?.({ heavy: true, hitStopMs: 105 });
      $('#battle')?.classList.remove('overlord-heavy-shake');
      void $('#battle')?.offsetWidth;
      $('#battle')?.classList.add('overlord-heavy-shake');
      cutsceneLayer.classList.add('is-impact');
      if (roarText)
        void showLine(context.roster?.get?.(bossId)?.name, roarText, {
          tone: 'enraged',
          holdMs: 3600,
        });
      await sleep(Math.round(1150 / speed));
      if (disposed) return;

      cutsceneLayer.classList.add('is-out');
      await sleep(Math.round(260 / speed));
    } else {
      cutsceneLayer.classList.add('is-dim', 'is-impact');
      if (roarText)
        void showLine(context.roster?.get?.(bossId)?.name, roarText, {
          tone: 'enraged',
          holdMs: 2600,
        });
      await sleep(600);
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
    const pack = OVERLORD_DIALOGUES[activeBoss.id] || OVERLORD_DIALOGUES.alchemicalPuppet;
    await playPhaseCutscene({
      bossId: activeBoss.id,
      rankLabel: pack.rankLabel || '♛ 霸主讨伐',
      title: `${activeBoss.def.name} · 显现`,
      subtitle: '定式金链啮合 · 三阶段压迫战开始',
      tone: 'entrance',
      roarText: pack.entrance?.[0] || `${activeBoss.def.name}封锁了阁楼的退路！`,
    });
    if (disposed || session.runtime.mode !== 'battle') return;
    if (pack.entrance?.length > 1) {
      await showSequence(
        pack.entrance.slice(1).map((line) => ({
          speaker: activeBoss.def.name,
          text: line,
          tone: 'enraged',
        })),
        3200,
      );
    }
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
    const activeBoss = currentOverlordDef();
    const id = bossId || activeBoss?.id || 'alchemicalPuppet';
    const pack = OVERLORD_DIALOGUES[id] || OVERLORD_DIALOGUES.alchemicalPuppet;
    const name = activeBoss?.def?.name || context.roster?.get?.(id)?.name || '失败的炼金傀偶';
    void showLine(name, pack.domainLock, { tone: 'enraged', holdMs: 3600 });
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
      if (typeof pack.bombArmed === 'function') {
        void showLine(ownerName, pack.bombArmed(targetName, bomb.durationSec), {
          tone: 'enraged',
          holdMs: 3200,
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
      const roarText = event.phaseStage >= 3 ? pack.phase3 : pack.phase2;
      await playPhaseCutscene({
        bossId: event.actor,
        rankLabel: pack.rankLabel || '♛ 霸主转阶段',
        title: event.label || overlordPhaseProfile(activeBoss?.def, event.phaseStage).title,
        subtitle: event.subtitle || '',
        tone: event.phaseStage >= 3 ? 'critical' : 'phase',
        roarText,
      });
    } else if (event.type === 'bombDetonate') {
      const targetId = event.targets?.[0] || event.bomb?.target;
      const targetName = context.roster?.get?.(targetId)?.name || targetId || '前排目标';
      const line =
        typeof pack.bombDetonate === 'function'
          ? pack.bombDetonate(targetName, event.damage || 0)
          : event.label;
      void showLine(actorName, line, { tone: 'enraged', holdMs: 3400 });
    } else if (event.type === 'bombDefuse') {
      const targetId = event.targets?.[0] || event.bomb?.target;
      const targetName = context.roster?.get?.(targetId)?.name || targetId || '目标';
      const line = typeof pack.bombDefuse === 'function' ? pack.bombDefuse(targetName) : '';
      if (line) void showLine(actorName, line, { tone: 'boss', holdMs: 2600 });
    } else if (event.fixedSlotBroken && event.blockedBy === 'bind') {
      void showLine(actorName, pack.broken, { tone: 'party', holdMs: 3200 });
    }
  }

  async function onVictory() {
    applySeal(false);
    disarmBombTimer({ resetKey: true });
    const activeBoss = currentOverlordDef();
    if (!activeBoss) return false;
    const pack = OVERLORD_DIALOGUES[activeBoss.id] || OVERLORD_DIALOGUES.alchemicalPuppet;
    if (pack.defeat) {
      await showLine(activeBoss.def.name, pack.defeat, { tone: 'boss', holdMs: 1800 });
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
    });
  }

  events.on(window, 'click', handleSealedInteraction, { capture: true });
  events.on(window, 'pointerdown', handleSealedInteraction, { capture: true });
  events.on(window, 'keydown', handleSealedInteraction, { capture: true });

  function reset() {
    introPlayedKey = '';
    clearDialogue();
    disarmBombTimer({ resetKey: true });
    applySeal(false);
    cutsceneSurface.hide();
    cutsceneLayer.hidden = true;
    $('#battle')?.classList.remove('overlord-heavy-shake');
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
