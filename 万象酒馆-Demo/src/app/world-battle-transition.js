function captureScene() {
  const frame = document.querySelector('#inn-frame iframe');
  try {
    const view = frame?.contentWindow?.streetPreview || frame?.contentWindow?.assetPreview;
    if (view) view.renderer.render(view.scene, view.camera);
    const source = frame?.contentDocument?.querySelector('canvas');
    if (!source?.width) return null;
    const image = document.createElement('canvas');
    image.width = source.width;
    image.height = source.height;
    image.getContext('2d').drawImage(source, 0, 0);
    return image;
  } catch {
    return null;
  }
}

/** Pixelate the actual exterior image while battle loads, then uncover the settled battle. */
export async function worldBattleTransition(enter) {
  const veil = document.createElement('div');
  veil.className = 'world-battle-transition';
  veil.setAttribute('aria-hidden', 'true');
  const image = captureScene();
  const canvas = document.createElement('canvas');
  canvas.width = innerWidth;
  canvas.height = innerHeight;
  const paint = canvas.getContext('2d');
  const sample = document.createElement('canvas');
  veil.append(canvas);
  document.body.append(veil);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let ready;
  const sceneReady = new Promise((resolve) => {
    ready = resolve;
  });
  document.addEventListener('world-battle-ready', ready, { once: true });
  function mosaic(cell) {
    veil.dataset.cellSize = String(Math.round(cell));
    if (!image) return;
    sample.width = Math.max(1, Math.ceil(canvas.width / cell));
    sample.height = Math.max(1, Math.ceil(canvas.height / cell));
    sample.getContext('2d').drawImage(image, 0, 0, sample.width, sample.height);
    paint.imageSmoothingEnabled = false;
    paint.drawImage(sample, 0, 0, canvas.width, canvas.height);
  }
  try {
    mosaic(1);
    const started = performance.now();
    veil.dataset.phase = 'pixelating';
    await new Promise((resolve) => {
      function tick(now) {
        const progress = reduced ? 1 : Math.min(1, (now - started) / 720);
        mosaic(1 + 55 * progress * progress);
        if (progress < 1) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });
    veil.dataset.phase = 'loading';
    const entering = Promise.resolve().then(enter);
    await Promise.race([sceneReady, entering]);
    veil.dataset.phase = 'revealing';
    await veil
      .animate(
        [
          { opacity: 1, filter: 'blur(0)' },
          { opacity: 0, filter: 'blur(5px)' },
        ],
        { duration: reduced ? 1 : 520, easing: 'ease-out', fill: 'forwards' },
      )
      .finished.catch(() => {});
    veil.remove();
    return await entering;
  } finally {
    document.removeEventListener('world-battle-ready', ready);
    veil.remove();
    canvas.width = canvas.height = sample.width = sample.height = 1;
  }
}
