import assert from 'node:assert/strict';

/** Use actual doors and map exits between free-roam town scenes. */
export async function travelTownScene(page, target, read = async () => {}) {
  const graph = {
    tavern: ['street'],
    street: ['tavern', 'city-center'],
    'city-center': ['street', 'market', 'rampart'],
    market: ['city-center', 'rampart'],
    rampart: ['city-center', 'market', 'outskirts'],
    outskirts: ['rampart'],
  };
  for (let step = 0; step < 7; step++) {
    const current = await page.evaluate(() => {
      const frame = document.querySelector('#inn-frame iframe').contentWindow;
      const id = frame.streetPreview?.definition.id;
      return id === 'starlamp-street' ? 'street' : id || 'tavern';
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
      const starbellExit = page.locator('[data-tavern-exit="street"]');
      const scene = frame.locator('#street-map-open');
      await Promise.race([starbellExit.waitFor(), scene.waitFor()]);
      if (await starbellExit.isVisible()) await starbellExit.click();
    } else {
      const point = await frame.locator('canvas').evaluate((canvas, next) => {
        const view = canvas.ownerDocument.defaultView.streetPreview;
        if (view.definition.returnDestination === next) return null;
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
        return point.id;
      }, next);
      if (point) {
        await page.waitForFunction(
          () =>
            !document.querySelector('#inn-frame iframe').contentWindow.streetPreview.state().moving,
        );
        await frame.locator(`[data-hotspot="${point}"]`).click();
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
            : (id === 'starlamp-street' ? 'street' : id) === next)
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
