import { emblemVisualFor } from '../emblems.js';

const CHARGE_STEPS = 6;
const AWARD_CHARGE_BEATS = [330, 300, 280, 260, 240, 270];

function actorAnchor(battle, actor) {
  const id = CSS.escape(actor);
  return battle.querySelector(`#stage [data-unit="${id}"], .rear-card[data-rear="${id}"]`);
}

/** Only committed combat events and newly granted rings reach this presenter. */
export function createRingFeedback({ session, audio }) {
  const active = new Map();
  const pendingWaits = new WeakMap();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false;

  function remove(root) {
    if (active.get(root.dataset.actor) === root) active.delete(root.dataset.actor);
    const stop = pendingWaits.get(root);
    pendingWaits.delete(root);
    stop?.();
    root.remove();
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
    root.innerHTML =
      '<span class="ring-feedback__piece ring-feedback__trail"></span>' +
      '<span class="ring-feedback__piece ring-feedback__meter" hidden>' +
      '<span class="ring-feedback__rim"><span class="ring-feedback__sweep"></span></span>' +
      '<span class="ring-feedback__core"></span>' +
      '<i class="ring-feedback__cell"></i>'.repeat(CHARGE_STEPS) +
      '</span>';
    if (award) {
      root.insertAdjacentHTML(
        'afterbegin',
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

  function waitForAnimation(root, animation) {
    pendingWaits.set(root, () => animation.cancel());
    return animation.finished.catch(() => {}).finally(() => pendingWaits.delete(root));
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

  function playPhase(root, meter, phase, duration, cue) {
    root.style.setProperty('--ring-phase-duration', `${duration}ms`);
    root.classList.toggle('is-bursting', phase === 'full');
    root.dataset.phase = phase;
    // Await the visual beat when supported; old WebViews use the same timed CSS.
    const animation = meter
      .getAnimations?.()
      .find((effect) => effect.animationName === `ring-feedback-award-${phase}`);
    if (cue) playCue(cue);
    return animation ? waitForAnimation(root, animation) : wait(root, duration);
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
    await playPhase(
      root,
      root.querySelector('.ring-feedback__meter'),
      'full',
      reduced.matches ? 300 : 620,
      'ring-charge-full',
    );
    return current(root);
  }

  function stageFlight(root, meter) {
    const { width, height } = root.parentElement.getBoundingClientRect();
    const dx = Math.min(width * 0.19, 156) * (root.offsetLeft > width / 2 ? -1 : 1);
    const overhead = Math.max(0, root.offsetTop - meter.offsetWidth * 0.76);
    const dy = -Math.min(height * 0.16, 108, overhead);
    root.style.setProperty('--flight-x', `${dx}px`);
    root.style.setProperty('--flight-y', `${dy}px`);
    root.style.setProperty('--flight-mid-x', `${dx * 0.54}px`);
    root.style.setProperty('--flight-mid-y', `${-Math.min(overhead, -dy * 0.68 + 12)}px`);
    root.style.setProperty('--trail-angle', `${Math.atan2(dy, dx)}rad`);
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
    function currentAward() {
      return (
        session.battle.state === state && hasRecipient(state, actor, emblemId) && current(root)
      );
    }
    try {
      root = create(actor, emblemId, { award: true });
      if (!root) return false;
      const meter = root.querySelector('.ring-feedback__meter');
      if (!reduced.matches) {
        fill(root, 0);
        stageFlight(root, meter);
        await playPhase(root, meter, 'flight', 480, 'ring-arrival');
        if (!currentAward()) return false;
      }
      if (reduced.matches) {
        fill(root, 0);
        root.dataset.phase = 'charging';
        playCue('ring-arrival');
        await wait(root, 180);
        if (!currentAward()) return false;
      }
      if (!reduced.matches) {
        const chargeTime = AWARD_CHARGE_BEATS.reduce((sum, beat) => sum + beat, 0);
        root.style.setProperty('--ring-charge-duration', `${chargeTime}ms`);
        root.dataset.phase = 'charging';
        for (const [index, beat] of AWARD_CHARGE_BEATS.entries()) {
          if (reduced.matches) break;
          if (!currentAward()) return false;
          fill(root, index + 1);
          await wait(root, beat);
        }
      }
      if (!currentAward()) return false;
      fill(root, CHARGE_STEPS);
      await playPhase(root, meter, 'full', reduced.matches ? 360 : 580, 'ring-charge-full');
      if (!currentAward()) return false;
      if (!reduced.matches) await playPhase(root, meter, 'settle', 255);
      return currentAward();
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
