import { guardMouseGestures } from './display.js';
import { createAudioMixer } from '../audio/mixer.js';
import { audioPreferences } from '../audio/config.js';
import { createEventScope } from '../shared/events.js';
import { createPopoverSurface } from '../shared/top-layer.js';
import { query as $ } from './dom.js';

const storageKey = 'wanxiang.audio.v1';
export function createAudio(context) {
  const storage = context.storage || localStorage;
  const events = createEventScope();
  let frameEvents = createEventScope(),
    childEvents = createEventScope();
  let stored;
  try {
    stored = JSON.parse(storage.getItem(storageKey));
  } catch {
    /* Use defaults. */
  }
  let preferences = audioPreferences(stored);
  function paint() {
    const state = mixer.status();
    $('#audio-toggle').classList.toggle(
      'audio-muted',
      preferences.musicMuted && preferences.effectsMuted,
    );
    for (const key of ['music', 'effects']) {
      $(`#audio-${key}`).value = String(Math.round(preferences[key] * 100));
      $(`#audio-${key}-value`).textContent = `${Math.round(preferences[key] * 100)}%`;
      const muted = preferences[`${key}Muted`];
      $(`#audio-${key}-mute`).textContent = muted ? '已关闭' : '已开启';
      $(`#audio-${key}-mute`).setAttribute('aria-pressed', String(muted));
    }
    $('#audio-state').textContent =
      state.error || (state.unlocked ? `当前曲目 · ${state.title}` : '点击页面后启用声音');
  }
  const mixer = createAudioMixer(preferences, paint);
  function save() {
    try {
      storage.setItem(storageKey, JSON.stringify(preferences));
    } catch {
      /* Storage may be unavailable. */
    }
    mixer.setPreferences(preferences);
  }
  let embedded = false;
  let onToggleRequest = null;
  const panelSurface = createPopoverSurface($('#audio-panel'));
  function setOpen(open) {
    const panel = $('#audio-panel');
    const button = $('#audio-toggle');
    if (embedded) {
      if (panel) panel.hidden = false;
      button?.setAttribute('aria-expanded', 'true');
      return;
    }
    if (panel) panel.hidden = !open;
    if (open) panelSurface.show();
    else panelSurface.hide();
    button?.setAttribute('aria-expanded', String(open));
  }
  const unlock = () => {
    void mixer.unlock();
  };
  events.on(document, 'pointerdown', unlock, { capture: true });
  events.on(
    document,
    'keydown',
    (event) => {
      if (event.repeat) return;
      unlock();
      if (!embedded && event.key === 'Escape') {
        setOpen(false);
        mixer.play('cancel');
      }
    },
    { capture: true },
  );
  events.on(document, 'visibilitychange', () => {
    if (document.hidden) mixer.suspend();
    else mixer.resume();
  });
  events.on($('#audio-toggle'), 'click', () => {
    if (embedded) onToggleRequest?.();
    else setOpen($('#audio-panel').hidden);
  });
  events.on(document, 'pointerdown', (event) => {
    if (!embedded && !event.target.closest('#audio-panel,#audio-toggle')) setOpen(false);
  });
  for (const key of ['music', 'effects']) {
    events.on($(`#audio-${key}`), 'input', (event) => {
      preferences = { ...preferences, [key]: Number(event.target.value) / 100 };
      save();
    });
    events.on($(`#audio-${key}-mute`), 'click', () => {
      preferences = { ...preferences, [`${key}Muted`]: !preferences[`${key}Muted`] };
      save();
    });
  }
  events.on(
    document,
    'click',
    (event) => {
      const button = event.target.closest('button,summary');
      if (!button || button.disabled || context.session.runtime.drag?.moved) return;
      const cue = button.matches('#gate-nav')
        ? 'gate'
        : button.matches('[data-unit],[data-rear],.time-cell')
          ? 'select'
          : button.matches('[data-skill]')
            ? 'skill'
            : button.matches('[data-remove],#clear')
              ? 'cancel'
              : 'click';
      mixer.play(cue);
    },
    { capture: true },
  );
  function detachFrame() {
    frameEvents.dispose();
    childEvents.dispose();
  }
  paint();
  return {
    play: mixer.play,
    combat: mixer.combat,
    status: mixer.status,
    setScene(scene) {
      if (scene !== 'inn') detachFrame();
      mixer.setScene(scene);
    },
    attachFrame(frame) {
      detachFrame();
      frameEvents = createEventScope();
      frameEvents.on(frame, 'load', () => {
        childEvents.dispose();
        childEvents = createEventScope();
        const child = frame.contentDocument;
        if (!child) return;
        guardMouseGestures(childEvents, child);
        childEvents.on(child, 'pointerdown', unlock, { capture: true });
        childEvents.on(child, 'keydown', unlock, { capture: true });
        childEvents.on(
          child,
          'click',
          (event) => {
            const button = event.target.closest('button');
            if (button && !button.disabled) mixer.play(button.id === 'enter' ? 'gate' : 'click');
          },
          { capture: true },
        );
      });
    },
    setEmbedded(active, openHandler = null) {
      embedded = active === true;
      onToggleRequest = openHandler;
      if (embedded) setOpen(true);
    },
    dispose() {
      events.dispose();
      detachFrame();
      mixer.dispose();
      setOpen(false);
    },
  };
}
