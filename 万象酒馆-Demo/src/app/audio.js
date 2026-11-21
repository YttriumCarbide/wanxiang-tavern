import { guardMouseGestures } from './display.js';
import { createAudioMixer } from '../audio/mixer.js';
import {
  BGM_CATEGORIES,
  BGM_PLAYLIST,
  MUSIC,
  SCENE_TRACKS,
  audioPreferences,
} from '../audio/config.js';
import { createEventScope } from '../shared/events.js';
import { html } from '../shared/html.js';
import { createPopoverSurface } from '../shared/top-layer.js';
import { escapeText } from '../ui.js';
import { query as $ } from './dom.js';

const storageKey = 'wanxiang.audio.v1';
const unlockedStorageKey = 'wanxiang.bgm-unlocked.v1';

function describeStatus(state, preferences, unlockedSet) {
  if (state.error) return state.error;
  if (!state.unlocked) {
    return '点击页面以启用声音，播放过的曲目将自动收录';
  }
  const mutedNote = preferences.musicMuted ? '（音乐已静音）' : '';
  if (state.previewTrack) {
    return `正在试听${mutedNote} · 生效曲目为「${state.activeTitle}」`;
  }
  if (state.pinnedTrack) {
    return `手动指定生效${mutedNote} · 不随场景自动切曲`;
  }
  const pool = SCENE_TRACKS[state.scene];
  if ((pool?.length || 0) > 1) {
    const unlockedCount = pool.filter((id) => unlockedSet.has(id)).length;
    const prefix = state.scene === 'boss' ? '首领战随机轮播' : '酒馆内随机轮播';
    return `${prefix}${mutedNote} · 已解锁 ${unlockedCount}/${pool.length} 首`;
  }
  const sceneLabel = MUSIC[state.activeTrack]?.sceneLabel || state.activeTitle;
  return `随场景自动切曲${mutedNote} · ${sceneLabel}`;
}

export function createAudio(context) {
  const storage = context.storage || localStorage;
  const events = createEventScope();
  let frameEvents = createEventScope(),
    childEvents = createEventScope(),
    activeCategory = 'all',
    renderedUnlockedKey = null;
  let stored;
  try {
    stored = JSON.parse(storage.getItem(storageKey));
  } catch {
    /* Use defaults. */
  }
  let storedUnlocked = [];
  try {
    const parsed = JSON.parse(storage.getItem(unlockedStorageKey));
    if (Array.isArray(parsed)) storedUnlocked = parsed;
  } catch {
    /* Start with no unlocked tracks until played by the system. */
  }
  let preferences = audioPreferences(stored);
  const categoryHost = $('#audio-categories');
  const playlistHost = $('#audio-playlist');
  const categoryButtons = new Map();
  const trackRows = new Map();

  if (categoryHost) {
    categoryHost.innerHTML = BGM_CATEGORIES.map(
      (cat) =>
        html`<button
          type="button"
          class="audio-cat-btn"
          role="tab"
          aria-selected="false"
          data-audio-cat="${escapeText(cat.id)}"
        >
          ${escapeText(cat.label)}
        </button>`,
    ).join('');
    for (const button of categoryHost.querySelectorAll('[data-audio-cat]')) {
      categoryButtons.set(button.dataset.audioCat, button);
    }
  }

  function syncUnlockedRows(unlockedIds, unlockedSet) {
    if (!playlistHost) return;
    const nextKey = unlockedIds.join(',');
    if (nextKey === renderedUnlockedKey) return;
    const hadPrevious = renderedUnlockedKey !== null;
    renderedUnlockedKey = nextKey;
    if (hadPrevious || unlockedIds.length > 0) {
      try {
        storage.setItem(unlockedStorageKey, JSON.stringify(unlockedIds));
      } catch {
        /* Storage may be unavailable. */
      }
    }
    const unlockedTracks = BGM_PLAYLIST.filter((track) => unlockedSet.has(track.id));
    playlistHost.innerHTML = unlockedTracks
      .map(
        (track) =>
          html`<li
            class="audio-track-item"
            data-track-id="${escapeText(track.id)}"
            data-category="${escapeText(track.category)}"
          >
            <div class="audio-track-info">
              <div class="audio-track-title-row">
                <span class="audio-track-name">${escapeText(track.name)}</span>
                <em class="audio-track-badge">${escapeText(track.badge)}</em>
              </div>
              <small class="audio-track-scene">${escapeText(track.sceneLabel)}</small>
            </div>
            <div class="audio-track-actions">
              <button
                type="button"
                class="audio-track-btn is-preview"
                data-audio-preview="${escapeText(track.id)}"
                aria-pressed="false"
              >
                试听
              </button>
              <button
                type="button"
                class="audio-track-btn is-apply"
                data-audio-select="${escapeText(track.id)}"
                aria-pressed="false"
              >
                切换
              </button>
            </div>
          </li>`,
      )
      .join('');
    trackRows.clear();
    for (const row of playlistHost.querySelectorAll('[data-track-id]')) {
      trackRows.set(row.dataset.trackId, {
        row,
        previewBtn: row.querySelector('[data-audio-preview]'),
        applyBtn: row.querySelector('[data-audio-select]'),
      });
    }
  }

  function paint() {
    const state = mixer.status();
    const unlockedIds = state.unlockedTracks || [];
    const unlockedSet = new Set(unlockedIds);
    syncUnlockedRows(unlockedIds, unlockedSet);

    const toggle = $('#audio-toggle');
    toggle?.classList.toggle('audio-muted', preferences.musicMuted && preferences.effectsMuted);
    toggle?.classList.toggle('audio-previewing', Boolean(state.previewTrack));
    for (const key of ['music', 'effects']) {
      $(`#audio-${key}`).value = String(Math.round(preferences[key] * 100));
      $(`#audio-${key}-value`).textContent = `${Math.round(preferences[key] * 100)}%`;
      const muted = preferences[`${key}Muted`];
      $(`#audio-${key}-mute`).textContent = muted ? '已关闭' : '已开启';
      $(`#audio-${key}-mute`).setAttribute('aria-pressed', String(muted));
    }
    const modeBadge = $('#audio-mode-badge');
    if (modeBadge) {
      modeBadge.textContent =
        state.mode === 'preview'
          ? '试听中'
          : state.mode === 'manual'
            ? '手动指定'
            : (SCENE_TRACKS[state.scene]?.length || 0) > 1
              ? state.scene === 'boss'
                ? '首领随机'
                : '酒馆随机'
              : '随场景自动';
      modeBadge.dataset.mode = state.mode;
    }
    const nowTitle = $('#audio-now-title');
    if (nowTitle) {
      const displayTrackId =
        state.previewTrack ||
        state.track ||
        (unlockedSet.has(state.activeTrack) ? state.activeTrack : null);
      nowTitle.textContent = state.previewTrack
        ? `试听 · ${state.previewTitle}`
        : displayTrackId
          ? MUSIC[displayTrackId]?.name || state.activeTitle
          : '待启用背景音乐';
    }
    $('#audio-state').textContent = describeStatus(state, preferences, unlockedSet);
    const playlistCount = $('#audio-playlist-count');
    if (playlistCount) {
      playlistCount.textContent = `${unlockedSet.size}/${BGM_PLAYLIST.length}`;
    }
    const shuffleBtn = $('#audio-shuffle');
    const stopPreviewBtn = $('#audio-stop-preview');
    const autoSceneBtn = $('#audio-auto-scene');
    if (shuffleBtn) {
      const unlockedPoolCount = (SCENE_TRACKS[state.scene] || []).filter((id) =>
        unlockedSet.has(id),
      ).length;
      shuffleBtn.hidden = Boolean(state.previewTrack || state.pinnedTrack) || unlockedPoolCount < 2;
    }
    if (stopPreviewBtn) stopPreviewBtn.hidden = !state.previewTrack;
    if (autoSceneBtn) autoSceneBtn.hidden = !state.pinnedTrack;

    for (const [categoryId, button] of categoryButtons) {
      const selected = categoryId === activeCategory;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-selected', String(selected));
    }
    const playingId = state.track || state.previewTrack || state.activeTrack;
    let visibleCount = 0;
    for (const [id, entry] of trackRows) {
      const visible = activeCategory === 'all' || entry.row.dataset.category === activeCategory;
      if (visible) visibleCount++;
      const isPlaying = playingId === id;
      const isActive = state.activeTrack === id;
      const isPinned = state.pinnedTrack === id;
      const isPreview = state.previewTrack === id;
      entry.row.hidden = !visible;
      entry.row.classList.toggle('is-playing', isPlaying);
      entry.row.classList.toggle('is-active', isActive);
      entry.row.classList.toggle('is-pinned', isPinned);
      entry.row.classList.toggle('is-preview', isPreview);
      if (entry.previewBtn) {
        entry.previewBtn.textContent = isPreview ? '停止' : '试听';
        entry.previewBtn.setAttribute('aria-pressed', String(isPreview));
      }
      if (entry.applyBtn) {
        entry.applyBtn.textContent = isPinned ? '生效中' : isActive ? '当前' : '切换';
        entry.applyBtn.disabled = isPinned;
        entry.applyBtn.setAttribute('aria-pressed', String(isActive));
      }
    }
    const emptyEl = $('#audio-playlist-empty');
    if (playlistHost) playlistHost.hidden = visibleCount === 0;
    if (emptyEl) {
      emptyEl.hidden = visibleCount > 0;
      emptyEl.textContent =
        unlockedIds.length === 0
          ? '暂未解锁曲目 · 系统实际播放过的配乐会自动收录于此'
          : '当前分类暂未收录已解锁曲目';
    }
  }
  const mixer = createAudioMixer(preferences, paint, { unlockedTracks: storedUnlocked });
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
    if (!open) mixer.stopPreview();
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
        if (!$('#audio-panel')?.hidden) mixer.play('cancel');
        setOpen(false);
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
  events.on($('#audio-close'), 'click', () => {
    setOpen(false);
  });
  events.on(document, 'pointerdown', (event) => {
    if (!embedded && !event.target.closest('#audio-panel,#audio-toggle')) setOpen(false);
  });
  events.on($('#audio-shuffle'), 'click', () => {
    unlock();
    mixer.shuffleSceneTrack();
  });
  events.on($('#audio-stop-preview'), 'click', () => {
    unlock();
    mixer.stopPreview();
  });
  events.on($('#audio-auto-scene'), 'click', () => {
    unlock();
    mixer.clearPinnedTrack();
  });
  events.on(categoryHost, 'click', (event) => {
    const button = event.target.closest('[data-audio-cat]');
    if (!button) return;
    activeCategory = button.dataset.audioCat;
    paint();
  });
  events.on(playlistHost, 'click', (event) => {
    const previewBtn = event.target.closest('[data-audio-preview]');
    if (previewBtn) {
      unlock();
      mixer.preview(previewBtn.dataset.audioPreview);
      return;
    }
    const selectBtn = event.target.closest('[data-audio-select]');
    if (selectBtn) {
      unlock();
      mixer.selectTrack(selectBtn.dataset.audioSelect);
    }
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
    previewTrack: mixer.preview,
    stopPreview: mixer.stopPreview,
    selectTrack: mixer.selectTrack,
    clearPinnedTrack: mixer.clearPinnedTrack,
    shuffleSceneTrack: mixer.shuffleSceneTrack,
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
