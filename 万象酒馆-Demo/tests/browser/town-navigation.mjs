import assert from 'node:assert/strict';

/** Use the ledger in embedded cities; standalone and border scenes retain a local opener. */
export async function openCityDirectory(page) {
  const embedded = (await page.locator('#inn-frame iframe').count()) > 0;
  const street = embedded ? page.frameLocator('#inn-frame iframe') : page;
  if (embedded) {
    await page.waitForFunction(
      () => document.querySelector('#inn-frame iframe')?.contentWindow?.modelReady === true,
    );
  }
  const directory = street.locator('#street-city-submap');
  if (!(await directory.isVisible())) {
    const local = street.locator('#street-submap-open:not([hidden])');
    if (await local.isVisible()) {
      await local.click();
    } else if (embedded) {
      const ledgerEdge = page.locator('#ledger-city-directory-open');
      await ledgerEdge.waitFor({ state: 'visible' });
      await ledgerEdge.click();
    } else {
      await local.click();
    }
  }
  await directory.waitFor({ state: 'visible' });
  await directory.evaluate(async (dialog) => {
    // Native dialog entry motion temporarily translates its otherwise viewport-bounded box.
    await Promise.all(dialog.getAnimations().map((motion) => motion.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  return directory;
}

/** Use actual doors and map exits between free-roam town scenes. */
export async function travelTownScene(page, target, read = async () => {}) {
  const graph = {
    tavern: ['city-center'],
    'city-center': ['tavern', 'market', 'rampart'],
    market: ['tavern', 'city-center', 'rampart'],
    rampart: ['tavern', 'city-center', 'market', 'outskirts'],
    outskirts: ['tavern', 'rampart'],
  };
  for (let step = 0; step < 7; step++) {
    const current = await page.evaluate(() => {
      const frame = document.querySelector('#inn-frame iframe').contentWindow;
      const id = frame.streetPreview?.definition.id;
      return id === 'starlamp-street' || id === 'street' ? 'city-center' : id || 'tavern';
    });
    if (current === target) return;
    const queue = [[current]],
      seen = new Set([current]);
    let route;
    while (queue.length) {
      const path = queue.shift();
      if (path.at(-1) === target) {
        route = path;
        break;
      }
      for (const next of graph[path.at(-1)]) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push([...path, next]);
        }
      }
    }
    assert(route, 'a real route connects the requested scenes');
    const next = route[1];
    const frame = page.frameLocator('#inn-frame iframe');
    if (current === 'tavern') {
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('streetDoor'));
      await frame.locator('#street-open').click();
      const starbellExit = page.locator('[data-tavern-exit="city-center"]');
      const scene = frame.locator('#street-map-open');
      await Promise.race([starbellExit.waitFor(), scene.waitFor()]);
      if (await starbellExit.isVisible()) await starbellExit.click();
    } else {
      const targetPoint = await frame.locator('canvas').evaluate((canvas, next) => {
        const view = canvas.ownerDocument.defaultView.streetPreview;
        if (view.definition.returnDestination === next) return null;
        if (view.definition.illustration?.pureBackdrop) return { pureBackdrop: true };
        const point = view.definition.points.find((point) => point.destination === next);
        if (!point)
          throw Error(
            `No exit from ${view.definition.id} to ${next}; available: ${view.definition.points
              .map((point) => point.destination)
              .filter(Boolean)
              .join(',')}`,
          );
        const uv = view.definition.illustration.points[point.id];
        const aspect =
          view.model.panorama.material.map.image.width /
          view.model.panorama.material.map.image.height;
        const x = (uv[0] - 0.5) * aspect;
        view.look(-x / (0.35 * view.state().framing.width), 0);
        return { id: point.id, pureBackdrop: false };
      }, next);
      if (targetPoint?.pureBackdrop) {
        const directory = await openCityDirectory(page);
        await directory.locator(`[data-city-node="${next}"]`).click();
      } else if (targetPoint?.id) {
        await page.waitForFunction(
          () =>
            !document.querySelector('#inn-frame iframe').contentWindow.streetPreview.state().moving,
        );
        await frame.locator(`[data-hotspot="${targetPoint.id}"]`).click();
        if (await frame.locator('#inspection-return').isVisible())
          await frame.locator('#inspection-return').click();
      } else await frame.locator('#street-return').click();
    }
    await page.waitForFunction(
      (next) => {
        const frame = document.querySelector('#inn-frame iframe').contentWindow;
        const id = frame.streetPreview?.definition.id;
        return (
          frame.modelReady &&
          (next === 'tavern'
            ? !!frame.assetPreview
            : (['starlamp-street', 'street'].includes(id) ? 'city-center' : id) === next)
        );
      },
      next,
      { timeout: 60000 },
    );
    await page.waitForTimeout(100);
    await read();
  }
  throw Error('Scene route did not finish');
}
