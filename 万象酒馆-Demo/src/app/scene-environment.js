import { normalizeSceneEnvironment } from '../scene-environment.js';
import { createEventScope } from '../shared/events.js';

const INTRO_TIME = 2400;

/** A text-only introduction and persistent location cue, usable in any scene host. */
export function createSceneEnvironment(host) {
  const document = host.ownerDocument;
  const events = createEventScope();
  const root = document.createElement('aside');
  root.className = 'scene-environment';
  root.setAttribute('aria-label', '地点环境');
  root.hidden = true;
  root.innerHTML = `<button class="scene-environment-toggle" type="button" aria-expanded="false">
      <span class="scene-environment-title"></span>
      <span class="scene-environment-preview" aria-hidden="true"></span>
      <span class="scene-environment-mark" aria-hidden="true">＋</span>
    </button>
    <p class="scene-environment-text" tabindex="0" hidden></p>`;
  host.append(root);
  const toggle = root.querySelector('.scene-environment-toggle');
  const title = root.querySelector('.scene-environment-title');
  const preview = root.querySelector('.scene-environment-preview');
  const mark = root.querySelector('.scene-environment-mark');
  const text = root.querySelector('.scene-environment-text');
  text.id = `scene-environment-${crypto.randomUUID()}`;
  toggle.setAttribute('aria-controls', text.id);
  const reducedMotion = document.defaultView.matchMedia('(prefers-reduced-motion: reduce)');
  let dockTimer = null;
  let exitAnimation = null;

  function setState(state) {
    root.dataset.state = state;
    const expanded = state !== 'docked';
    toggle.setAttribute('aria-expanded', String(expanded));
    mark.textContent = expanded ? '−' : '＋';
    text.hidden = !expanded;
    preview.hidden = expanded;
  }

  function stopDocking() {
    clearTimeout(dockTimer);
    dockTimer = null;
  }

  function cancelExit() {
    exitAnimation?.cancel();
    exitAnimation = null;
  }

  function hide() {
    cancelExit();
    root.hidden = true;
    delete root.dataset.place;
    delete root.dataset.state;
    title.textContent = preview.textContent = text.textContent = '';
  }

  function clear({ immediate = false } = {}) {
    stopDocking();
    if (
      immediate ||
      root.hidden ||
      reducedMotion.matches ||
      typeof root.animate !== 'function' ||
      !root.getClientRects().length
    ) {
      hide();
      return;
    }
    if (exitAnimation) return;
    root.inert = true;
    const opacity = document.defaultView.getComputedStyle(root).opacity;
    const animation = root.animate([{ opacity }, { opacity: 0 }], {
      duration: 180,
      easing: 'ease-in',
      fill: 'forwards',
    });
    exitAnimation = animation;
    void animation.finished.then(
      () => {
        if (exitAnimation === animation) hide();
      },
      () => {},
    );
  }

  events.on(toggle, 'click', () => {
    stopDocking();
    setState(root.dataset.state === 'docked' ? 'expanded' : 'docked');
  });
  events.on(root, 'keydown', (event) => {
    if (event.key !== 'Escape' || root.dataset.state === 'docked') return;
    event.preventDefault();
    event.stopPropagation();
    stopDocking();
    setState('docked');
    toggle.focus({ preventScroll: true });
  });
  events.on(root, 'focusout', (event) => {
    if (
      !root.inert &&
      !root.contains(event.relatedTarget) &&
      root.dataset.state === 'intro' &&
      dockTimer === null
    )
      setState('docked');
  });

  return {
    show(value, { intro = true } = {}) {
      const lead = normalizeSceneEnvironment(value);
      if (!lead) return clear();
      const samePlace = !exitAnimation && !root.hidden && root.dataset.place === lead.placeId;
      if (samePlace && title.textContent === lead.title && text.textContent === lead.text) return;
      cancelExit();
      root.inert = false;
      root.dataset.place = lead.placeId;
      title.textContent = lead.title;
      preview.textContent = text.textContent = lead.text;
      text.scrollTop = 0;
      // New prose for the same venue does not restart the entrance or docking timer.
      if (samePlace) return;
      stopDocking();
      setState(intro ? 'intro' : 'docked');
      root.hidden = false;
      if (intro) {
        dockTimer = setTimeout(() => {
          dockTimer = null;
          if (!root.contains(document.activeElement)) setState('docked');
        }, INTRO_TIME);
      }
    },
    clear,
    dispose() {
      clear({ immediate: true });
      events.dispose();
      root.remove();
    },
  };
}
