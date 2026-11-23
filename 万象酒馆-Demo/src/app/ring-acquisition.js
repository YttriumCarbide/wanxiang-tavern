import { EMBLEMS } from '../emblems.js';
import { RING_DESIGNS } from '../emblem-rings.js';
import { createEventScope } from '../shared/events.js';
import { createFrameBudget, deviceRenderQuality } from '../shared/render-budget.js';
import { createRingAcquisitionStage } from './ring-acquisition-stage.js';

const GATHER_END = 1.8;
const REVEAL_END = 4.4;
const MAX_STEP = 0.1;

function isValidId(id) {
  return (
    typeof id === 'string' &&
    Object.prototype.hasOwnProperty.call(EMBLEMS, id) &&
    Object.prototype.hasOwnProperty.call(RING_DESIGNS, id)
  );
}

function buildFallbackSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 200 200');
  svg.setAttribute('width', '200');
  svg.setAttribute('height', '200');
  svg.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS(ns, 'circle');
  ring.setAttribute('class', 'ring-acquisition-fallback-band');
  ring.setAttribute('cx', '100');
  ring.setAttribute('cy', '100');
  ring.setAttribute('r', '70');
  ring.setAttribute('fill', 'none');
  ring.setAttribute('stroke', 'currentColor');
  ring.setAttribute('stroke-width', '6');
  const gem = document.createElementNS(ns, 'polygon');
  gem.setAttribute('class', 'ring-acquisition-fallback-gem');
  gem.setAttribute('points', '100,40 130,70 100,100 70,70');
  gem.setAttribute('fill', 'currentColor');
  gem.setAttribute('opacity', '0.85');
  svg.append(ring, gem);
  return svg;
}

function buildDom(id) {
  const dialog = document.createElement('dialog');
  dialog.className = 'ring-acquisition';
  dialog.setAttribute('aria-label', '纹章士戒指获取');
  dialog.setAttribute('aria-modal', 'true');

  const canvas = document.createElement('canvas');
  canvas.className = 'ring-acquisition-canvas';
  canvas.setAttribute('aria-hidden', 'true');

  const fallback = document.createElement('div');
  fallback.className = 'ring-acquisition-fallback';
  fallback.hidden = true;
  fallback.setAttribute('aria-hidden', 'true');
  fallback.append(buildFallbackSvg());

  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'ring-acquisition-skip';
  skip.textContent = '跳过';

  const caption = document.createElement('div');
  caption.className = 'ring-acquisition-caption';
  const name = document.createElement('h1');
  name.className = 'ring-acquisition-name';
  name.textContent = EMBLEMS[id].emblem.name;
  caption.append(name);

  const cont = document.createElement('button');
  cont.type = 'button';
  cont.className = 'ring-acquisition-continue';
  cont.textContent = '继续';
  cont.hidden = true;

  dialog.append(canvas, fallback, skip, caption, cont);
  return { dialog, canvas, fallback, skip, cont, name };
}

export function createRingAcquisition() {
  let current = null;
  let disposed = false;

  function teardown(run) {
    if (!run || run.done) return;
    run.done = true;
    if (run.raf) cancelAnimationFrame(run.raf);
    run.raf = 0;
    run.scope.dispose();
    if (run.stage) {
      try {
        run.stage.dispose();
      } catch {
        /* ignore */
      }
      run.stage = null;
    }
    const { dialog } = run.dom;
    if (dialog.open) {
      try {
        dialog.close();
      } catch {
        /* ignore */
      }
    }
    dialog.remove();
    if (run.restoreFocus && run.restoreFocus.isConnected) {
      try {
        run.restoreFocus.focus();
      } catch {
        /* ignore */
      }
    }
    run.restoreFocus = null;
    run.resolve = null;
  }

  function settle(run, value) {
    if (!run || run.done) return;
    const resolve = run.resolve;
    teardown(run);
    if (current === run) current = null;
    if (resolve) resolve(value);
  }

  function renderFrame(run, elapsed) {
    if (run.fallback) return;
    const reduced = run.reduced;
    if (run.stage) {
      try {
        run.stage.render(elapsed, reduced);
      } catch {
        failStage(run);
        return;
      }
    }
    const phase = elapsed < GATHER_END ? 'gather' : elapsed < REVEAL_END ? 'reveal' : 'ready';
    run.dom.dialog.dataset.phase = phase;
    if (phase === 'ready' && !run.ready) enterReady(run);
  }

  function enterReady(run) {
    run.ready = true;
    run.elapsed = REVEAL_END;
    run.dom.skip.hidden = true;
    run.dom.cont.hidden = false;
    run.dom.cont.focus();
  }

  function failStage(run) {
    if (!run || run.done || run.fallback) return;
    run.fallback = true;
    if (run.stage) {
      try {
        run.stage.dispose();
      } catch {
        /* ignore */
      }
      run.stage = null;
    }
    run.dom.canvas.hidden = true;
    run.dom.fallback.hidden = false;
    run.dom.dialog.dataset.fallback = 'true';
    run.dom.dialog.dataset.phase = 'ready';
    run.dom.dialog.dataset.paused = 'true';
    enterReady(run);
    if (run.raf) {
      cancelAnimationFrame(run.raf);
      run.raf = 0;
    }
  }

  function stopLoop(run) {
    if (run.raf) {
      cancelAnimationFrame(run.raf);
      run.raf = 0;
    }
  }

  function startLoop(run) {
    if (run.done || run.raf || run.reduced || run.fallback) return;
    if (document.hidden) return;
    run.lastTime = 0;
    const tick = (now) => {
      if (run.done) return;
      run.raf = 0;
      if (document.hidden || run.reduced || run.fallback) return;
      if (!run.budget.accepts(now)) {
        run.raf = requestAnimationFrame(tick);
        return;
      }
      if (!run.lastTime) run.lastTime = now;
      let delta = (now - run.lastTime) / 1000;
      run.lastTime = now;
      if (!Number.isFinite(delta) || delta < 0) delta = 0;
      if (delta > MAX_STEP) delta = MAX_STEP;
      run.elapsed += delta;
      renderFrame(run, run.elapsed);
      if (!run.done && !run.fallback && !run.reduced) {
        run.raf = requestAnimationFrame(tick);
      }
    };
    run.raf = requestAnimationFrame(tick);
  }

  function finishNow(run) {
    if (run.done) return;
    run.elapsed = REVEAL_END;
    renderFrame(run, REVEAL_END);
    if (!run.reduced && !run.fallback) startLoop(run);
  }

  function play(id) {
    if (disposed) return Promise.resolve(false);
    if (!isValidId(id)) return Promise.resolve(false);
    if (current) settle(current, false);
    if (disposed) return Promise.resolve(false);

    const design = RING_DESIGNS[id];
    const dom = buildDom(id);
    const run = {
      id,
      dom,
      done: false,
      ready: false,
      fallback: false,
      reduced: false,
      elapsed: 0,
      lastTime: 0,
      raf: 0,
      stage: null,
      scope: createEventScope(),
      budget: createFrameBudget(deviceRenderQuality().fps),
      motion: null,
      onMotion: null,
      restoreFocus: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      resolve: null,
    };
    current = run;

    const root = dom.dialog;
    root.dataset.emblemId = id;
    root.dataset.phase = 'gather';
    root.dataset.fallback = 'false';
    root.dataset.paused = 'false';
    if (design && design.color) root.style.setProperty('--ring-accent', design.color);

    const promise = new Promise((resolve) => {
      run.resolve = resolve;
    });

    const motion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    run.motion = motion;
    run.reduced = !!(motion && motion.matches);
    root.dataset.reduced = run.reduced ? 'true' : 'false';

    const onContextLost = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      failStage(run);
    };
    run.scope.on(dom.canvas, 'webglcontextlost', onContextLost);

    const onSkip = () => {
      if (run.done) return;
      if (run.ready) return;
      finishNow(run);
    };
    const onContinue = () => {
      if (run.done) return;
      settle(run, true);
    };
    run.scope.on(dom.skip, 'click', onSkip);
    run.scope.on(dom.cont, 'click', onContinue);

    const onKeyDown = (event) => {
      if (run.done) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (event.repeat) return;
        if (run.ready) settle(run, true);
        else finishNow(run);
        return;
      }
      if (event.key === 'Tab') {
        event.preventDefault();
        (run.ready ? dom.cont : dom.skip).focus();
      }
      if (event.repeat && ['Enter', ' '].includes(event.key)) event.preventDefault();
      event.stopPropagation();
    };
    run.scope.on(root, 'keydown', onKeyDown, true);
    run.scope.on(root, 'keyup', (event) => event.stopPropagation());

    const onCancel = (event) => {
      event.preventDefault();
      if (run.done) return;
      if (run.ready) settle(run, true);
      else finishNow(run);
    };
    run.scope.on(root, 'cancel', onCancel);

    const onResize = () => {
      if (run.done) return;
      if (run.stage && typeof run.stage.resize === 'function') {
        try {
          run.stage.resize();
        } catch {
          failStage(run);
        }
      }
      if (run.stage) renderFrame(run, run.elapsed);
    };
    run.scope.on(window, 'resize', onResize);

    const onVisibility = () => {
      if (run.done) return;
      if (document.hidden) {
        root.dataset.paused = 'true';
        stopLoop(run);
      } else {
        root.dataset.paused = 'false';
        run.lastTime = 0;
        if (!run.reduced && !run.fallback) startLoop(run);
      }
    };
    run.scope.on(document, 'visibilitychange', onVisibility);

    const onPageHide = () => {
      if (run.done) return;
      settle(run, false);
    };
    run.scope.on(window, 'pagehide', onPageHide);

    if (motion) {
      run.onMotion = (event) => {
        if (run.done) return;
        run.reduced = !!event.matches;
        root.dataset.reduced = run.reduced ? 'true' : 'false';
        if (run.reduced) {
          stopLoop(run);
          if (run.elapsed < REVEAL_END) {
            run.elapsed = REVEAL_END;
          }
          renderFrame(run, run.elapsed);
        } else if (!run.fallback) {
          startLoop(run);
        }
      };
      run.scope.on(motion, 'change', run.onMotion);
    }

    document.body.append(root);
    try {
      root.showModal();
    } catch {
      settle(run, false);
      return promise;
    }

    try {
      run.stage = createRingAcquisitionStage(dom.canvas, id);
    } catch {
      failStage(run);
    }
    if (run.fallback) return promise;
    root.dataset.paused = String(document.hidden);

    if (run.reduced) {
      run.elapsed = REVEAL_END;
      renderFrame(run, REVEAL_END);
      try {
        dom.cont.focus();
      } catch {
        /* ignore */
      }
    } else {
      renderFrame(run, 0);
      try {
        dom.skip.focus();
      } catch {
        /* ignore */
      }
      startLoop(run);
    }

    return promise;
  }

  function cancel() {
    if (current) settle(current, false);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (current) settle(current, false);
  }

  function isOpen() {
    return !!(current && !current.done);
  }

  return { play, cancel, dispose, isOpen };
}
