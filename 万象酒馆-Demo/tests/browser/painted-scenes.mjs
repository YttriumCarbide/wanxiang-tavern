import assert from 'node:assert/strict';
import path from 'node:path';
import { openCityDirectory } from './town-navigation.mjs';

async function ready(page) {
  await page.waitForFunction(
    () => window.modelReady && window.streetPreview && !window.streetPreview.state().moving,
  );
}
async function drag(page, dx) {
  const size = page.viewportSize();
  await page.mouse.move(size.width / 2, size.height * 0.26);
  await page.mouse.down();
  await page.mouse.move(size.width / 2 + dx, size.height * 0.26, { steps: 10 });
  await page.mouse.up();
  await ready(page);
}
async function presentation(page) {
  return page.evaluate(() => {
    const view = window.streetPreview;
    let standing = 0;
    let visitors = 0;
    view.scene.traverse((mesh) => {
      if (mesh.userData.staticNpc) standing++;
      if (mesh.userData.visitor) visitors++;
    });
    const image = view.model.panorama.material.map.image;
    return {
      hotspots: document.querySelectorAll('[data-hotspot]').length,
      backdrop: view.definition.illustration.pureBackdrop === true,
      aspect: view.definition.illustration.aspect,
      standing,
      visitors,
      framing: view.state().framing,
      calls: view.renderer.info.render.calls,
      image: [image.naturalWidth, image.naturalHeight],
      texture: view.model.panorama.material.map.uuid,
      source: view.state().image,
    };
  });
}
function framing(frame) {
  const aspect = frame.aspect;
  const { x, y, width, height } = frame.framing;
  assert(x - width / 2 >= -aspect / 2 && x + width / 2 <= aspect / 2);
  assert(y - height / 2 >= -0.5 && y + height / 2 <= 0.5);
  assert(frame.calls <= 11, 'background remains within a small drawing budget');
}

/** Verify the shared Starbell painting, bounded input and real city directory navigation. */
export async function paintedSceneChecks({ browser, baseURL, output }, ids) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const mobile = await browser.newPage({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  const errors = [];
  const requests = [];
  for (const target of [page, mobile]) {
    target.on('pageerror', (error) => errors.push(error.message));
    target.on('response', (response) => {
      if (response.status() >= 400 && response.url().includes('/city-backgrounds/'))
        errors.push(`${response.status()} ${response.url()}`);
    });
    target.on('request', (request) => {
      if (request.url().includes('/api/ai/generate')) requests.push(request.url());
    });
  }
  const routes = {
    'city-center': 'market',
    market: 'rampart',
    rampart: 'outskirts',
    outskirts: 'rampart',
  };
  const results = [];
  try {
    for (const id of ids) {
      await page.goto(baseURL + '/street.html?scene=' + id);
      await ready(page);
      const initial = await presentation(page);
      framing(initial);
      assert.deepEqual(initial.image, [1672, 941]);
      assert(initial.source.endsWith('/city-backgrounds/starbell.png'));
      assert.equal(initial.backdrop, true);
      assert.equal(initial.aspect, 16 / 9);
      assert.equal(initial.hotspots, 0, id + ': pure backdrop has no hotspots');
      assert.equal(initial.visitors, 0, id + ': pure backdrop does not spawn visitor characters');
      assert.equal(initial.standing, 0, id + ': pure backdrop has no authored NPC cutouts');
      await page.screenshot({ path: path.join(output, id + '-center.png') });
      for (const [direction, offset] of [
        ['left', 260],
        ['right', -260],
      ]) {
        await page.evaluate(() => window.streetPreview.resetView());
        await ready(page);
        const start = (await presentation(page)).framing;
        await drag(page, offset);
        const frame = await presentation(page);
        framing(frame);
        assert.equal(frame.texture, initial.texture);
        assert.equal(frame.source, initial.source);
        const delta = frame.framing.x - start.x;
        assert(
          direction === 'left' ? delta < -0.01 : delta > 0.01,
          id + ': drag pans ' + direction,
        );
        await page.screenshot({ path: path.join(output, id + '-' + direction + '.png') });
      }
      await mobile.goto(baseURL + '/street.html?scene=' + id);
      await ready(mobile);
      const before = await presentation(mobile);
      framing(before);
      const cdp = await mobile.context().newCDPSession(mobile);
      try {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints: [{ x: 580, y: 120 }],
        });
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: 420, y: 138 }],
        });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      } finally {
        await cdp.detach();
      }
      await ready(mobile);
      const after = await presentation(mobile);
      framing(after);
      assert(
        Math.abs(after.framing.x - before.framing.x) > 0.04,
        'touch can pan the shared painting',
      );
      assert.equal(after.texture, before.texture);
      await mobile.evaluate(() => window.streetPreview.resetView());
      await ready(mobile);
      await mobile.screenshot({ path: path.join(output, id + '-mobile.png') });
      const destination = routes[id];
      await page.locator('#street-submap-open').click();
      await page
        .locator(`#street-city-submap[open] button[data-city-scene="${destination}"]`)
        .click();
      await page.waitForFunction((id) => window.streetPreview?.definition.id === id, destination);
      await ready(page);
      if (id === ids[0]) {
        await mobile.locator('#street-submap-open').tap();
        const directory = mobile.locator('#street-city-submap[open]');
        // The tap must open the dialog before the helper can fall back to a click.
        await directory.waitFor({ state: 'visible' });
        await openCityDirectory(mobile);
        const current = directory.locator('button[aria-current="location"]');
        assert.equal(await current.getAttribute('data-city-scene'), id);
        assert(await current.isDisabled());
        const box = await directory.boundingBox();
        const viewport = mobile.viewportSize();
        const dimensions = JSON.stringify({ box, viewport });
        assert(
          box &&
            box.x >= 0 &&
            box.y >= 0 &&
            box.x + box.width <= viewport.width &&
            box.y + box.height <= viewport.height,
          `${id}: mobile directory must fit inside the viewport: ${dimensions}`,
        );
        await directory.locator(`button[data-city-scene="${destination}"]`).tap();
        await mobile.waitForFunction(
          (id) => window.streetPreview?.definition.id === id,
          destination,
        );
        await ready(mobile);
      }
      results.push({
        id,
        destination,
        image: initial.image,
        calls: initial.calls,
      });
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    return results;
  } finally {
    await mobile.close();
    await page.close();
  }
}
