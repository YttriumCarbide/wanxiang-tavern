import { createWorldLoadingOverlay } from '../shared/scene-loading.js';

/** Cover the viewport immediately with the universal loading scene while battle initializes. */
export async function worldBattleTransition(enter, signal = new AbortController().signal) {
  if (signal.aborted) return false;
  const overlay = createWorldLoadingOverlay('正在踏入异境战场');
  const veil = overlay.element;
  veil.classList.add('world-battle-transition');
  const trackEl = veil.querySelector('.wl-sword-track');
  const fillEl = veil.querySelector('.wl-sword-fill');
  const phaseEl = veil.querySelector('.scene-loading-phase');
  const detailsEl = veil.querySelector('.scene-loading-details span');
  const tagEl = veil.querySelector('.wl-percent-tag');
  if (phaseEl) phaseEl.textContent = '正在展开异境战局与敌阵模型…';
  if (tagEl) tagEl.textContent = 'BATTLEFIELD';
  if (trackEl) trackEl.classList.remove('is-indeterminate');
  if (fillEl) {
    fillEl.style.transition = 'none';
    fillEl.style.width = '18%';
  }
  if (detailsEl) detailsEl.textContent = '18%';
  overlay.show('正在踏入异境战场');
  veil.style.opacity = '1';
  const destinationDialog = document.querySelector('#destination-dialog');
  if (destinationDialog?.open) destinationDialog.close();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ready;
  const sceneReady = new Promise((resolve) => {
    ready = resolve;
  });
  let frame;
  let abort;
  const aborted = new Promise((resolve) => {
    abort = () => {
      cancelAnimationFrame(frame);
      overlay.dispose();
      resolve(false);
    };
  });
  signal.addEventListener('abort', abort, { once: true });
  try {
    veil.dataset.phase = 'loading';
    await Promise.race([
      new Promise((resolve) => {
        frame = requestAnimationFrame(resolve);
      }),
      aborted,
    ]);
    if (signal.aborted) return false;
    const holdMs = reduced ? 20 : 380;
    if (fillEl) {
      fillEl.style.transition = `width ${holdMs}ms cubic-bezier(.22,1,.36,1)`;
      fillEl.style.width = '88%';
    }
    if (detailsEl) detailsEl.textContent = '88%';
    const entering = Promise.resolve().then(() => !signal.aborted && enter(ready, signal));
    await Promise.race([sceneReady, entering, aborted]);
    if (signal.aborted) return false;
    if (fillEl) {
      fillEl.style.transition = `width ${reduced ? 10 : 140}ms ease-out`;
      fillEl.style.width = '100%';
    }
    if (detailsEl) detailsEl.textContent = '100%';
    veil.classList.add('complete');
    veil.dataset.phase = 'revealing';
    await veil
      .animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: reduced ? 10 : 220,
        easing: 'ease-out',
        fill: 'forwards',
      })
      .finished.catch(() => {});
    if (!signal.aborted) overlay.dispose();
    return await Promise.race([entering, aborted]);
  } finally {
    signal.removeEventListener('abort', abort);
    if (!signal.aborted) overlay.dispose();
  }
}
