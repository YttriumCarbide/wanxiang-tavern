import assert from 'node:assert/strict';
import path from 'node:path';

async function ready(page) {
  await page.waitForFunction(
    () => window.modelReady && window.streetPreview && !window.streetPreview.state().moving,
  );
}
async function focus(page, id) {
  await page.evaluate((id) => {
    const view = window.streetPreview;
    const anchor = view.model.pointAnchor(id);
    view.look(-anchor[0] / (view.state().framing.width * 0.35), 0);
  }, id);
  await ready(page);
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
  return page.evaluate(async () => {
    const THREE = await import('/vendor/build/three.module.js');
    const { standingFrame } = await import('/src/tavern/standing-frame.js');
    const view = window.streetPreview;
    view.scene.updateMatrixWorld(true);
    const people = [];
    view.scene.traverse((mesh) => {
      const id = mesh.userData.staticNpc || mesh.userData.visitor;
      if (!id || !mesh.parent.visible) return;
      const foot = mesh.parent.position.clone().project(view.camera);
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      const sample = document.createElement('canvas');
      sample.width = 96;
      sample.height = 144;
      const paint = sample.getContext('2d', { willReadFrequently: true });
      paint.drawImage(mesh.material.map.image, 0, 0, 96, 144);
      const body = standingFrame(paint.getImageData(0, 0, 96, 144).data, 96, 144, 1);
      const height = box.max.y - box.min.y;
      const top = new THREE.Vector3(0, box.max.y - body.top * height, 0)
        .applyMatrix4(mesh.matrixWorld)
        .project(view.camera);
      const bottom = new THREE.Vector3(0, box.max.y - body.foot * height, 0)
        .applyMatrix4(mesh.matrixWorld)
        .project(view.camera);
      people.push({
        id,
        npc: !!mesh.userData.staticNpc,
        position: mesh.parent.position.toArray(),
        x: (foot.x + 1) / 2,
        y: (1 - foot.y) / 2,
        height: Math.abs(top.y - bottom.y) / 2,
      });
    });
    const image = view.model.panorama.material.map.image;
    return {
      people,
      framing: view.state().framing,
      calls: view.renderer.info.render.calls,
      image: [image.naturalWidth, image.naturalHeight],
      texture: view.model.panorama.material.map.uuid,
    };
  });
}
function framing(frame) {
  const aspect = frame.image[0] / frame.image[1];
  const { x, y, width, height } = frame.framing;
  assert(x - width / 2 >= -aspect / 2 && x + width / 2 <= aspect / 2);
  assert(y - height / 2 >= -0.5 && y + height / 2 <= 0.5);
  assert(frame.calls <= 11, 'background and people remain within a small drawing budget');
}

/** Real rendered landmarks, chapter NPCs and touch framing for the four repainted places. */
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
    target.on('request', (request) => {
      if (request.url().includes('/api/ai/generate')) requests.push(request.url());
    });
  }
  const results = [];
  try {
    for (const id of ids) {
      await page.goto(baseURL + '/street.html?scene=' + id);
      await ready(page);
      const initial = await presentation(page);
      framing(initial);
      assert(initial.image[0] >= 3700 && initial.image[1] >= 1254);
      assert.equal(
        initial.people.length,
        2,
        id + ': two grounded people, without duplicate decorative figures',
      );
      assert(
        initial.people.every(
          (person) =>
            person.y > 0.62 && person.y < 0.951 && person.height > 0.18 && person.height < 0.43,
        ),
      );
      const heights = initial.people.map((person) => person.height);
      assert(
        Math.max(...heights) / Math.min(...heights) > 1.1,
        'near and far standing areas use distinct scales',
      );
      await page.screenshot({ path: path.join(output, id + '-center.png') });
      for (const [direction, offset] of [
        ['left', 1800],
        ['right', -1800],
      ]) {
        await page.evaluate(() => window.streetPreview.resetView());
        await ready(page);
        await drag(page, offset);
        const frame = await presentation(page);
        framing(frame);
        assert.equal(frame.texture, initial.texture);
        assert.deepEqual(
          frame.people.map(({ id, position }) => ({ id, position })),
          initial.people.map(({ id, position }) => ({ id, position })),
        );
        await page.screenshot({ path: path.join(output, id + '-' + direction + '.png') });
      }
      const points = await page.evaluate(() => window.streetPreview.definition.points);
      const visited = [];
      for (const point of points) {
        await focus(page, point.id);
        const button = page.locator('[data-hotspot="' + point.id + '"]');
        await button.waitFor({ state: 'visible' });
        if (point.immediate) continue;
        await button.click();
        assert.equal(await page.locator('#inspection-name').textContent(), point.name);
        await page.locator('#inspection-close').click();
        visited.push(point.id);
      }
      for (const person of initial.people.filter((person) => person.npc)) {
        await focus(page, person.id);
        const body = await page.evaluate((id) => {
          const view = window.streetPreview;
          const mesh = view.model.characters.find((mesh) => mesh.userData.staticNpc === id);
          const point = mesh.parent.position.clone();
          point.y += 0.16;
          point.project(view.camera);
          return { x: ((point.x + 1) * innerWidth) / 2, y: ((1 - point.y) * innerHeight) / 2 };
        }, person.id);
        await page.mouse.click(body.x, body.y);
        await page.locator('#street-inspector').waitFor({ state: 'visible' });
        assert.equal(
          await page.locator('#inspection-name').textContent(),
          points.find((point) => point.id === person.id).name,
        );
        await page.locator('#inspection-close').click();
        await page.screenshot({ path: path.join(output, id + '-' + person.id + '-standing.png') });
      }
      await mobile.goto(baseURL + '/street.html?scene=' + id);
      await ready(mobile);
      const before = await presentation(mobile);
      framing(before);
      assert(
        before.people.every((person) => person.y > 0.5 && person.y < 0.9),
        'phone framing keeps standing feet inside the painting',
      );
      const cdp = await mobile.context().newCDPSession(mobile);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 580, y: 120 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 420, y: 138 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await ready(mobile);
      const after = await presentation(mobile);
      framing(after);
      assert(Math.abs(after.framing.x - before.framing.x) > 0.04, 'touch can pan the full scene');
      await mobile.evaluate(() => window.streetPreview.resetView());
      await ready(mobile);
      await mobile.screenshot({ path: path.join(output, id + '-mobile.png') });
      const inspect = points.find((point) => !point.immediate);
      await focus(mobile, inspect.id);
      await mobile.locator('[data-hotspot="' + inspect.id + '"]').click();
      await mobile
        .locator('#street-inspector')
        .evaluate((element) =>
          Promise.all(element.getAnimations().map((animation) => animation.finished)),
        );
      const box = await mobile.locator('#street-inspector').boundingBox();
      assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= 845 && box.y + box.height <= 391);
      const exit = points.find((point) => point.immediate);
      await focus(page, exit.id);
      await page.locator('[data-hotspot="' + exit.id + '"]').click();
      const destination = exit.destination === 'street' ? 'starlamp-street' : exit.destination;
      await page.waitForFunction((id) => window.streetPreview?.definition.id === id, destination);
      await ready(page);
      assert.equal(
        await page.evaluate(() => window.streetPreview.definition.id),
        destination,
        'the original route still opens the intended scene',
      );
      results.push({
        id,
        visited,
        npcs: initial.people.filter((person) => person.npc).map((person) => person.id),
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
