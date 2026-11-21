import { OVERLORD_DIALOGUES, overlordReloadBark } from '../overlord-mechanics.js';

const RELOAD_WATCH_KEY = 'wanxiang.overlord-reload-watch.v1';

export function createOverlordReloadWatch({ context, currentOverlordDef, showLine, isDisposed }) {
  const { session } = context;
  let markedUnloadThisPage = false;
  let reloadBarkTimer = null;

  function cancelReloadBark() {
    clearTimeout(reloadBarkTimer);
    reloadBarkTimer = null;
  }

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
    if (!activeBoss || isDisposed()) return;
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
    if (isDisposed()) return;
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

  function checkReloadFourthWall() {
    if (isDisposed()) return false;
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
    const token = session.runtime.token;
    const expedition = session.journey.expedition;
    cancelReloadBark();
    reloadBarkTimer = setTimeout(() => {
      reloadBarkTimer = null;
      if (
        isDisposed() ||
        session.runtime.token !== token ||
        session.journey.expedition !== expedition
      ) {
        return;
      }
      void showLine(saved.bossName || '失败的炼金傀偶', text, {
        rankLabel: saved.rankLabel || '磨坊阁楼 · 失控炼金造物',
        tone: 'enraged',
        holdMs: 4200,
        interrupt: true,
      });
    }, 260);
    return true;
  }
  return {
    readReloadWatch,
    writeReloadWatch,
    clearReloadWatch,
    armReloadWatch,
    markReloadOnUnload,
    checkReloadFourthWall,
    cancelReloadBark,
  };
}
