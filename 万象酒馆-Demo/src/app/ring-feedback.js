import { emblemVisualFor } from '../emblems.js';

const CHARGE_STEPS = 6;
const AWARD_PHASE_MS = { flight: 470, land: 210, full: 500, settle: 230 };
const AWARD_CHARGE_BEATS = [115, 105, 100, 95, 85, 75];
const STATIC_AWARD_MS = 72;

function actorAnchor(battle, actor) {
  const id = CSS.escape(actor);
  return battle.querySelector(`#stage [data-unit="${id}"], .rear-card[data-rear="${id}"]`);
}

/** Only committed combat events and newly granted rings reach this presenter. */
export function createRingFeedback({ session, audio }) {
  const active = new Map();
  const pendingWaits = new WeakMap();
  const skipControls = new WeakMap();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;

  function remove(root) {
    if (active.get(root.dataset.actor) === root) active.delete(root.dataset.actor);
    const stop = pendingWaits.get(root);
    pendingWaits.delete(root);
    stop?.();
    root.remove();
    const clearSkip = skipControls.get(root);
    skipControls.delete(root);
    clearSkip?.();
  }

  function offerSkip(root) {
    // Keep the effect aria-hidden and pointer-transparent; only this sibling takes input.
    const previousFocus = document.activeElement;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ring-feedback-skip';
    button.textContent = '跳过演出';
    button.addEventListener('click', () => remove(root), { once: true });
    skipControls.set(root, () => {
      const restoreFocus = document.activeElement === button;
      button.remove();
      if (
        restoreFocus &&
        !disposed &&
        !session.runtime.disposed &&
        previousFocus?.isConnected &&
        !previousFocus.disabled &&
        previousFocus.getClientRects().length
      ) {
        previousFocus.focus({ preventScroll: true });
      }
    });
    root.after(button);
  }

  function place(root, battle = root.parentElement) {
    if (!battle || battle.hidden || battle.classList.contains('entering')) return false;
    const anchor = actorAnchor(battle, root.dataset.actor);
    if (!anchor || getComputedStyle(anchor).visibility !== 'visible') return false;
    const rect = anchor.getBoundingClientRect();
    const board = battle.getBoundingClientRect();
    if (!rect.width || !rect.height || !board.width || !board.height) return false;
    root.style.setProperty('--ring-anchor-x', `${rect.left - board.left + rect.width / 2}px`);
    root.style.setProperty('--ring-anchor-y', `${rect.top - board.top + rect.height * 0.48}px`);
    root.style.setProperty('--ring-board-width', `${board.width}px`);
    root.style.setProperty('--ring-board-height', `${board.height}px`);
    if (root.classList.contains('is-award')) {
      root.classList.toggle('is-rear', anchor.classList.contains('rear-card'));
      root.style.setProperty('--ring-card-width', `${rect.width}px`);
      root.style.setProperty('--ring-card-height', `${rect.height}px`);
    }
    return true;
  }

  function create(actor, emblemId, { award = false } = {}) {
    const battle = document.querySelector('#battle');
    if (
      !emblemId ||
      !battle ||
      disposed ||
      session.runtime.disposed ||
      session.runtime.mode !== 'battle'
    )
      return null;
    const root = document.createElement('span');
    root.className = 'ring-feedback';
    if (award) root.classList.add('is-award');
    root.dataset.actor = actor;
    root.setAttribute('aria-hidden', 'true');
    root.dataset.emblem = emblemId;
    const visual = emblemVisualFor(emblemId);
    root.style.setProperty('--ring-jewel', visual.primary);
    root.style.setProperty('--ring-glow', visual.glow);
    root.style.setProperty('--ring-light', visual.core);
    root.style.setProperty('--ring-shadow', visual.deep);
    const jewelry =
      '<span class="ring-feedback__rim"><span class="ring-feedback__sweep"></span></span>' +
      '<span class="ring-feedback__core"></span>';
    root.innerHTML =
      '<span class="ring-feedback__piece ring-feedback__trail"></span>' +
      '<span class="ring-feedback__piece ring-feedback__meter" hidden>' +
      (award ? `<span class="ring-feedback__artifact">${jewelry}</span>` : jewelry) +
      '<i class="ring-feedback__cell"></i>'.repeat(CHARGE_STEPS) +
      '</span>';
    if (award) {
      root.style.setProperty('--ring-reflection', visual.secondary);
      root.querySelectorAll('.ring-feedback__cell').forEach((cell, index) => {
        // Reserve a frame for the new charge value to paint before the next beat.
        const igniteTime = AWARD_CHARGE_BEATS[index] - 16;
        cell.style.setProperty('--ring-cell-ignite', `${igniteTime}ms`);
      });
      root.insertAdjacentHTML(
        'afterbegin',
        '<span class="ring-feedback__piece ring-feedback__aperture"></span>' +
          '<span class="ring-feedback__piece ring-feedback__radiance"></span>' +
          '<span class="ring-feedback__piece ring-feedback__focus"></span>',
      );
    }
    if (!place(root, battle)) return null;
    const previous = active.get(actor);
    if (previous) remove(previous);
    battle.append(root);
    active.set(actor, root);
    return root;
  }

  function current(root) {
    return (
      active.get(root.dataset.actor) === root &&
      root.isConnected &&
      !session.runtime.disposed &&
      session.runtime.mode === 'battle' &&
      place(root)
    );
  }

  function wait(root, duration) {
    // Each root awaits at most one timed stage at a time.
    return new Promise((resolve) => {
      function finish() {
        window.clearTimeout(timer);
        pendingWaits.delete(root);
        resolve();
      }
      const timer = window.setTimeout(finish, duration);
      pendingWaits.set(root, finish);
    });
  }

  function playCue(cue) {
    try {
      audio.play(cue);
    } catch (error) {
      // A failed audio device must not hold the reward narration or the next round.
      console.warn('Ring feedback audio failed:', error);
    }
  }

  function showPhase(root, phase, duration = 0, cue) {
    root.style.setProperty('--ring-phase-duration', `${duration}ms`);
    if (phase === 'charging') root.style.setProperty('--ring-charge-duration', `${duration}ms`);
    root.classList.toggle('is-bursting', phase === 'full');
    root.dataset.phase = phase;
    if (cue) playCue(cue);
  }

  function fill(root, amount) {
    root.dataset.charge = String(amount);
    if (root.classList.contains('is-award')) {
      root.style.setProperty('--ring-charge-fraction', String(amount / CHARGE_STEPS));
    }
    root.querySelector('.ring-feedback__meter').hidden = false;
    root.querySelectorAll('.ring-feedback__cell').forEach((cell, index) => {
      cell.classList.toggle('is-lit', index < amount);
    });
  }

  async function burst(root) {
    if (!current(root)) return false;
    // Combat has already resolved: announce this crossing now, not six beats later.
    fill(root, CHARGE_STEPS);
    const duration = reduced.matches ? 300 : 620;
    showPhase(root, 'full', duration, 'ring-charge-full');
    await wait(root, duration);
    return current(root);
  }

  function stageFlight(root) {
    const { width, height } = root.parentElement.getBoundingClientRect();
    const y = root.offsetTop;
    const dx = Math.min(width * 0.24, 224) * (root.offsetLeft > width / 2 ? -1 : 1);
    const fromAbove = y > height * 0.38;
    const room = fromAbove ? y : height - y;
    const rise = Math.min(height * 0.24, 132, Math.max(0, room - 32));
    const dy = fromAbove ? -rise : rise;
    const midX = dx * 0.54;
    const midY = dy * 0.31;
    root.style.setProperty('--flight-x', `${dx}px`);
    root.style.setProperty('--flight-y', `${dy}px`);
    root.style.setProperty('--flight-mid-x', `${midX}px`);
    root.style.setProperty('--flight-mid-y', `${midY}px`);
    root.style.setProperty('--trail-start-angle', `${Math.atan2(dy - midY, dx - midX)}rad`);
    root.style.setProperty('--trail-catch-angle', `${Math.atan2(midY, midX)}rad`);
  }

  function hasRecipient(state, actor, emblemId) {
    return (
      actor &&
      emblemId &&
      state?.formation.includes(actor) &&
      state.units[actor]?.hp > 0 &&
      state.heroDefinitions?.[actor]?.emblemId === emblemId
    );
  }

  async function acquired(emblemId, actor) {
    const state = session.battle.state;
    if (!hasRecipient(state, actor, emblemId)) return false;
    let root;
    let deadline;
    function currentAward() {
      return (
        session.battle.state === state && hasRecipient(state, actor, emblemId) && current(root)
      );
    }
    function waitBeat(duration) {
      deadline += duration;
      return wait(root, Math.max(0, deadline - performance.now()));
    }
    async function holdPhase(phase, cue) {
      const duration = AWARD_PHASE_MS[phase];
      showPhase(root, phase, duration, cue);
      await waitBeat(duration);
      return currentAward();
    }
    try {
      root = create(actor, emblemId, { award: true });
      if (!root) return false;
      if (!reduced.matches) {
        offerSkip(root);
        fill(root, 0);
        stageFlight(root);
        // The presentation has a fixed budget even if a frame or CSS animation is late.
        deadline = performance.now();
        if (!(await holdPhase('flight', 'ring-arrival'))) return false;
        if (!reduced.matches && !(await holdPhase('land'))) return false;
      }
      if (!reduced.matches && deadline !== undefined) {
        const chargeTime = AWARD_CHARGE_BEATS.reduce((sum, beat) => sum + beat, 0);
        showPhase(root, 'charging', chargeTime);
        for (const [index, beat] of AWARD_CHARGE_BEATS.entries()) {
          if (reduced.matches) break;
          if (!currentAward()) return false;
          fill(root, index + 1);
          await waitBeat(beat);
          if (!currentAward()) return false;
        }
      }
      fill(root, CHARGE_STEPS);
      if (reduced.matches || deadline === undefined) {
        showPhase(root, 'full');
        if (deadline === undefined) playCue('ring-arrival');
        playCue('ring-charge-full');
        await wait(root, STATIC_AWARD_MS);
        return currentAward();
      }
      if (!(await holdPhase('full', 'ring-charge-full'))) return false;
      return await holdPhase('settle');
    } catch (error) {
      console.warn('Ring award presentation failed:', error);
      return false;
    } finally {
      if (root) remove(root);
    }
  }

  async function event(event, before) {
    const after = event?.after;
    if (!before?.units || !after?.units) return false;
    const charged = (after.formation || []).filter((actor) => {
      const unit = after.units[actor];
      return (
        before.units[actor] &&
        unit?.hp > 0 &&
        after.heroDefinitions?.[actor]?.emblemId &&
        (before.units[actor].emblemCharge || 0) < CHARGE_STEPS &&
        unit.emblemCharge === CHARGE_STEPS
      );
    });
    const effects = charged
      .map((actor) => create(actor, after.heroDefinitions[actor].emblemId))
      .filter(Boolean);
    await Promise.all(effects.map((root) => burst(root).finally(() => remove(root))));
    return effects.length > 0;
  }

  function cancel() {
    for (const root of active.values()) remove(root);
  }
  return {
    acquired,
    event,
    cancel,
    dispose() {
      disposed = true;
      cancel();
    },
  };
}
