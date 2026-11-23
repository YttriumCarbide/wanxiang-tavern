import EMBLEMS from '../emblems.js';
import EMBLEM_CINEMATIC_THEMES from './emblem-cinematic-themes.js';
import { createRingAcquisitionStage } from './ring-acquisition-stage.js';
import { createEventScope } from '../shared/events.js';
import { createFrameBudget, deviceRenderQuality } from '../shared/render-budget.js';

const DURATION = 2;
const REDUCED_DURATION = 0.5;

function findEmblem(id) {
  return EMBLEMS.find((emblem) => emblem.id === id) || null;
}

export function createEmblemSkillCinematic() {
  let current = null;
  let disposed = false;

  function settle(result) {
    if (!current) return;
    const session = current;
    current = null;
    session.finish(result);
  }

  function preview(id) {
    if (disposed) return Promise.resolve(false);
    const emblem = findEmblem(id);
    if (!emblem || !emblem.skill) return Promise.resolve(false);
    if (current) settle(false);
    return open(emblem);
  }

  function open(emblem) {
    const skill = emblem.skill;
    const theme = EMBLEM_CINEMATIC_THEMES[emblem.id] || EMBLEM_CINEMATIC_THEMES.default || { color: '#c9a86a' };
    const scope = createEventScope();
    const quality = deviceRenderQuality();
    const budget = createFrameBudget(quality.fps);
    const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');

    const root = document.createElement('dialog');
    root.className = 'emblem-skill-cinematic';
    root.setAttribute('aria-label', skill.name);
    root.dataset.emblemId = emblem.id;
    root.dataset.skillId = skill.id;
    root.dataset.phase = 'opening';
    root.style.setProperty('--emblem-accent', theme.color);

    const canvas = document.createElement('canvas');
    canvas.className = 'emblem-skill-canvas';

    const title = document.createElement('h1');
    title.className = 'emblem-skill-title';
    title.textContent = skill.name;

    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'emblem-skill-skip';
    skip.textContent = '跳过';

    root.append(canvas, title, skip);
    document.body.append(root);

    let stage = null;
    let raf = 0;
    let lastTime = 0;
    let elapsed = 0;
    let reduced = reducedQuery.matches;
    let finished = false;
    let resolvePromise;
    const promise = new Promise((resolve) => { resolvePromise = resolve; });

    function setPhase(phase) {
      if (root.dataset.phase !== phase) root.dataset.phase = phase;
    }

    function disableAnimations() {
      root.style.setProperty('animation', 'none');
      root.querySelectorAll('*').forEach((node) => {
        node.style.setProperty('animation', 'none');
      });
    }

    function fallback() {
      if (stage) {
        try { stage.dispose(); } catch { /* stage boundary */ }
        stage = null;
      }
      canvas.hidden = true;
      root.dataset.fallback = 'true';
    }

    function renderStatic() {
      if (!stage) return;
      try {
        stage.render(1, true);
      } catch {
        fallback();
      }
    }

    function stopRaf() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function finish(result) {
      if (finished) return;
      finished = true;
      stopRaf();
      scope.dispose();
      if (stage) {
        try { stage.forceContextLoss(); } catch { /* stage boundary */ }
        try { stage.dispose(); } catch { /* stage boundary */ }
        stage = null;
      }
      if (root.open) {
        try { root.close(); } catch { /* DOM boundary */ }
      }
      root.remove();
      resolvePromise(result);
    }

    function tick(now) {
      raf = 0;
      if (finished) return;
      if (!lastTime) lastTime = now;
      const delta = Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      elapsed += delta;

      if (reduced) {
        if (elapsed >= REDUCED_DURATION) {
          finish(true);
          return;
        }
        setPhase('impact');
        renderStatic();
        raf = requestAnimationFrame(tick);
        return;
      }

      if (elapsed >= DURATION) {
        finish(true);
        return;
      }

      if (elapsed < 0.25) setPhase('opening');
      else if (elapsed < 1.65) setPhase('impact');
      else setPhase('closing');

      if (budget.accepts(now) && stage) {
        try {
          stage.render(elapsed, false);
        } catch {
          fallback();
        }
      }
      raf = requestAnimationFrame(tick);
    }

    function startRaf() {
      if (raf || finished) return;
      lastTime = 0;
      raf = requestAnimationFrame(tick);
    }

    function applyReduced() {
      if (reduced) {
        disableAnimations();
        renderStatic();
      }
    }

    scope.on(skip, 'click', (event) => {
      event.stopPropagation();
      finish(true);
    });

    scope.on(root, 'keydown', (event) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        event.stopPropagation();
        skip.focus();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
        return;
      }
      if (event.repeat) return;
    });

    scope.on(root, 'cancel', (event) => {
      event.preventDefault();
      finish(true);
    });

    scope.on(document, 'visibilitychange', () => {
      if (document.hidden) {
        stopRaf();
      } else {
        startRaf();
      }
    });

    scope.on(window, 'pagehide', () => {
      finish(false);
    });

    scope.on(window, 'resize', () => {
      if (!stage) return;
      try {
        stage.resize();
        stage.render(reduced ? 1 : elapsed, reduced);
      } catch {
        fallback();
      }
    });

    const onReducedChange = (event) => {
      if (event.matches && !reduced) {
        reduced = true;
        applyReduced();
      }
    };
    if (reducedQuery.addEventListener) {
      scope.on(reducedQuery, 'change', onReducedChange);
    }

    try {
      root.showModal();
    } catch {
      scope.dispose();
      root.remove();
      return Promise.resolve(false);
    }

    skip.focus();

    try {
      stage = createRingAcquisitionStage(canvas, emblem.id, { skill: true });
    } catch {
      stage = null;
      fallback();
    }

    if (stage) {
      try {
        stage.resize();
      } catch {
        fallback();
      }
    }

    if (reduced) {
      applyReduced();
    }

    current = { finish };
    startRaf();
    return promise;
  }

  function play(event) {
    if (disposed) return false;
    if (!event || event.type !== 'hero' || !event.skill) return false;
    const emblem = EMBLEMS.find((item) => item.skill && item.skill.id === event.skill);
    if (!emblem) return false;
    preview(emblem.id);
    return true;
  }

  function cancel() {
    if (current) settle(false);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (current) settle(false);
  }

  function isOpen() {
    return Boolean(current);
  }

  return { play, preview, cancel, dispose, isOpen };
}