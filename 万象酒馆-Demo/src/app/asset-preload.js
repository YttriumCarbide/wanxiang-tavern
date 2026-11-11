import { portraitUrl } from '../portraits.js';

/** Disk-only, one request at a time: do not decode every large portrait into phone memory. */
export function createPortraitPreloader(context) {
  const seen = new Set();
  const pending = [];
  let running = false;
  let stopped = false;
  let idle = null;
  async function run() {
    idle = null;
    if (running || stopped || document.hidden || context.session.runtime.mode !== 'inn') return;
    running = true;
    try {
      while (
        pending.length &&
        !stopped &&
        !document.hidden &&
        context.session.runtime.mode === 'inn'
      ) {
        const file = pending.shift();
        try {
          await context.assets.read(file);
          seen.add(file);
        } catch {
          /* Optional art retries the next time the player enters the inn. */
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } finally {
      running = false;
    }
  }
  async function warm() {
    if (stopped) return;
    try {
      const catalog = await context.assets.manifest();
      if (stopped) return;
      const files = [
        ...catalog.characterArt,
        ...context.session.ai.library.characters.map((entry) => portraitUrl(entry.combat)),
        ...context.session.ai.library.characters
          .map((entry) => entry.combat.customStanding)
          .filter(Boolean),
      ];
      for (const file of new Set(files))
        if (!seen.has(file) && !pending.includes(file)) pending.push(file);
      if (!running && idle === null) idle = setTimeout(() => void run(), 400);
    } catch {
      /* A scene error already offers retry; background work stays silent. */
    }
  }
  context.events.on(window, 'message', (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== document.querySelector('#inn-frame iframe')?.contentWindow
    )
      return;
    if (event.data?.type === 'scene-ready' && event.data.scene === 'tavern') void warm();
  });
  context.events.on(document, 'visibilitychange', () => {
    if (!document.hidden) void warm();
  });
  return {
    warm,
    state: () => ({ cached: seen.size, pending: pending.length, running }),
    dispose() {
      stopped = true;
      clearTimeout(idle);
      pending.length = 0;
    },
  };
}
