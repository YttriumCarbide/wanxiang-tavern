import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { legacySession } from './legacy-session.mjs';

/** Explicit art workflow: camera-projected clean cube faces, never a resized panorama crop. */
export async function exportSceneReferences(page, output) {
  const viewport = page.viewportSize();
  await page.setViewportSize({ width: 1024, height: 1024 });
  const masking = await page.addStyleTag({
    content: 'body > :not(canvas) { visibility: hidden !important; }',
  });
  await page.evaluate(() => {
    const view = window.streetPreview;
    window.referenceFov = view.camera.fov;
    view.camera.fov = 90;
    view.camera.updateProjectionMatrix();
    window.referenceVisibility = view.scene.children.map((object) => ({
      object,
      visible: object.visible,
    }));
    for (const { object } of window.referenceVisibility)
      object.visible = object.name === 'Painted_Street_Panorama';
  });
  try {
    for (const [name, yaw] of [
      ['front', 0],
      ['right', -Math.PI / 2],
      ['back', Math.PI],
      ['left', Math.PI / 2],
    ]) {
      await page.evaluate(
        (yaw) => window.streetPreview.look(yaw, window.streetPreview.definition.detailPitch || 0),
        yaw,
      );
      await page.waitForTimeout(100);
      const png = await page.evaluate(() => {
        const view = window.streetPreview;
        view.renderer.render(view.scene, view.camera);
        return view.renderer.domElement.toDataURL('image/png').split(',')[1];
      });
      await writeFile(path.join(output, `reference-${name}.png`), Buffer.from(png, 'base64'));
    }
  } finally {
    await masking.evaluate((element) => element.remove());
    await page.evaluate(() => {
      for (const { object, visible } of window.referenceVisibility) object.visible = visible;
      delete window.referenceVisibility;
      window.streetPreview.camera.fov = window.referenceFov;
      delete window.referenceFov;
      window.streetPreview.camera.updateProjectionMatrix();
      window.streetPreview.look(0);
    });
    await page.setViewportSize(viewport);
  }
}

export async function streetChecks({ browser, baseURL, output }) {
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => errors.push(error.message));
  const seen = new Set();
  async function settled(target = page) {
    await target.waitForFunction(
      () => window.modelReady && window.streetPreview && !window.streetPreview.state().moving,
    );
  }
  async function snapshot(target = page) {
    return target.evaluate(async () => {
      const THREE = await import('/vendor/build/three.module.js');
      const view = window.streetPreview;
      view.scene.updateMatrixWorld(true);
      return {
        state: view.state(),
        roster: view
          .visitors()
          .characters.map((actor) => ({ id: actor.key, position: actor.position }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        feet: view.visitors().characters.map((actor) => {
          const foot = new THREE.Vector3(...actor.position).project(view.camera);
          return { x: (foot.x + 1) / 2, y: (1 - foot.y) / 2 };
        }),
        texture: view.model.panorama.material.map.uuid,
        aspect:
          view.model.panorama.material.map.image.width /
          view.model.panorama.material.map.image.height,
        fade: Number(getComputedStyle(document.querySelector('.street-fade')).opacity),
      };
    });
  }
  function bounded(frame) {
    const { x, y, width, height } = frame.state.framing;
    assert(
      x - width / 2 >= -frame.aspect / 2 && x + width / 2 <= frame.aspect / 2,
      'horizontal framing stays inside the painting',
    );
    assert(
      y - height / 2 >= -0.5 && y + height / 2 <= 0.5,
      'vertical framing stays inside the painting',
    );
  }
  async function drag(target, deltaX, deltaY = 0) {
    const viewport = target.viewportSize();
    await target.mouse.move(viewport.width / 2, viewport.height * 0.3);
    await target.mouse.down();
    await target.mouse.move(viewport.width / 2 + deltaX, viewport.height * 0.3 + deltaY, {
      steps: 10,
    });
    await target.mouse.up();
    await settled(target);
  }
  try {
    await page.goto(baseURL + '/street.html');
    await settled();
    const initial = await snapshot();
    assert.equal(initial.roster.length, 2);
    assert(initial.aspect >= 2.2, 'native overlapping panels retain a wide continuous scene');
    assert.equal(await page.locator('.street-controls').count(), 0);
    assert.equal(await page.locator('.street-controls').count(), 0);
    await page.mouse.move(640, 190);
    await page.mouse.down();
    await page.mouse.move(1050, 190, { steps: 8 });
    await page.waitForTimeout(60);
    const middle = await snapshot();
    assert(middle.state.framing.x < initial.state.framing.x);
    assert.equal(middle.fade, 0, 'free looking never blanks the scene');
    assert.equal(middle.texture, initial.texture);
    await page.mouse.up();
    await settled();
    await page.evaluate(() => window.streetPreview.resetView());
    await settled();
    for (const [name, delta] of [
      ['entrance', 1800],
      ['street', 0],
      ['courtyard', -1800],
    ]) {
      await page.evaluate(() => window.streetPreview.resetView());
      await settled();
      if (delta) await drag(page, delta);
      const frame = await snapshot();
      bounded(frame);
      assert.deepEqual(frame.roster, initial.roster, 'looking never moves or reassigns characters');
      assert.equal(frame.texture, initial.texture);
      assert(frame.state.rendering.calls <= 11);
      if (delta)
        assert(
          Math.abs(frame.state.framing.panX) > 0.15,
          'free dragging moves through the connected painting',
        );
      const visible = frame.feet.filter((foot) => foot.x > 0.06 && foot.x < 0.94);
      assert(visible.length >= 1 && visible.every((foot) => foot.y > 0.55 && foot.y < 0.92));
      await page.screenshot({ path: path.join(output, 'illustrated-' + name + '.png') });
      const points = await page.evaluate(() =>
        window.streetPreview.definition.points.filter(
          (point) => !point.immediate && window.streetPreview.state().visible.includes(point.id),
        ),
      );
      for (const point of points) {
        await page.locator('[data-hotspot="' + point.id + '"]').click();
        assert.equal(await page.locator('#inspection-name').textContent(), point.name);
        await page.locator('#inspection-close').click();
        seen.add(point.id);
      }
    }
    assert.equal(seen.size, 4, 'every investigation stays reachable through free looking');
    await page.evaluate(() => window.streetPreview.resetView());
    await settled();
    await drag(page, 160, 30);
    const dragged = await snapshot();
    bounded(dragged);
    assert(Math.abs(dragged.state.framing.x) > 0.04);
    const landmark = await page.locator('[data-hotspot="arch"]').boundingBox();
    const projected = await page.evaluate(async () => {
      const THREE = await import('/vendor/build/three.module.js');
      const view = window.streetPreview;
      const point = new THREE.Vector3(...view.model.pointAnchor('arch')).project(view.camera);
      return { x: ((point.x + 1) * innerWidth) / 2, y: ((1 - point.y) * innerHeight) / 2 };
    });
    assert(
      Math.abs(landmark.x + landmark.width / 2 - projected.x) < 2 &&
        Math.abs(landmark.y + landmark.height / 2 - projected.y) < 2,
      'hotspots stay attached to the painting while dragging',
    );
    await page.screenshot({ path: path.join(output, 'illustrated-dragged.png') });
    await page.waitForTimeout(180);
    assert.equal(
      (await snapshot()).state.frames,
      dragged.state.frames,
      'motion stops drawing once settled',
    );
    await drag(page, 0, -1200);
    const verticalLow = await snapshot();
    bounded(verticalLow);
    await drag(page, 0, 1200);
    const verticalHigh = await snapshot();
    bounded(verticalHigh);
    assert(
      Math.abs(verticalHigh.state.framing.y - verticalLow.state.framing.y) > 0.025,
      'vertical dragging visibly changes framing',
    );
    await page.evaluate(() => window.streetPreview.resetView());
    await settled();
    await page.evaluate(() => {
      window.visitorClick = null;
      window.addEventListener('message', (event) => {
        if (event.data?.type === 'tavern-talk') window.visitorClick = event.data.characterId;
      });
    });
    const actorPoint = await page.evaluate(() => {
      const view = window.streetPreview;
      let result;
      view.scene.traverse((mesh) => {
        if (result || !mesh.userData.visitor || !mesh.parent.visible) return;
        const point = mesh.parent.position.clone();
        point.y += 0.18;
        point.project(view.camera);
        if (Math.abs(point.x) < 0.8)
          result = { x: ((point.x + 1) * innerWidth) / 2, y: ((1 - point.y) * innerHeight) / 2 };
      });
      return result;
    });
    await page.mouse.click(actorPoint.x, actorPoint.y);
    await page.waitForFunction(() => !!window.visitorClick);
    const clicked = await page.evaluate(() => window.visitorClick);
    assert(initial.roster.some((actor) => actor.id === clicked));
    const beforeKey = await snapshot();
    await page.keyboard.press('ArrowRight');
    await settled();
    assert((await snapshot()).state.framing.x > beforeKey.state.framing.x);
    await page.keyboard.press('ArrowUp');
    await settled();
    bounded(await snapshot());

    const mobile = await browser.newPage({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
    });
    mobile.on('pageerror', (error) => errors.push(error.message));
    try {
      await mobile.goto(baseURL + '/street.html');
      await settled(mobile);
      const before = await snapshot(mobile);
      const cdp = await mobile.context().newCDPSession(mobile);
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: 600, y: 190 }],
      });
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: 450, y: 210 }],
      });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await settled(mobile);
      const after = await snapshot(mobile);
      bounded(after);
      assert(Math.abs(after.state.framing.x - before.state.framing.x) > 0.04);
      assert.equal(after.texture, before.texture);
      for (const [name, delta] of [
        ['entrance', 1800],
        ['street', 0],
        ['courtyard', -1800],
      ]) {
        await mobile.evaluate(() => window.streetPreview.resetView());
        await settled(mobile);
        if (delta) await drag(mobile, delta);
        const frame = await snapshot(mobile);
        bounded(frame);
        const visible = frame.feet.filter((foot) => foot.x > 0.06 && foot.x < 0.94);
        assert(visible.length >= 1 && visible.every((foot) => foot.y > 0.5 && foot.y < 0.95));
        await mobile.screenshot({ path: path.join(output, 'illustrated-mobile-' + name + '.png') });
      }
      await mobile.locator('[data-hotspot="notice"]').click();
      await mobile
        .locator('#street-inspector')
        .evaluate((element) =>
          Promise.all(element.getAnimations().map((animation) => animation.finished)),
        );
      const bounds = await mobile.locator('#street-inspector').boundingBox();
      assert(
        bounds.x >= 0 &&
          bounds.y >= 0 &&
          bounds.x + bounds.width <= 845 &&
          bounds.y + bounds.height <= 391,
      );
      await mobile.locator('#street-return').click();
      await mobile.waitForURL('**/tavern.html?return=street');
      await mobile.waitForFunction(() => window.modelReady);
      assert.equal(
        await mobile.evaluate(() => window.assetPreview.getState().current),
        'streetDoor',
      );
    } finally {
      await mobile.close();
    }

    // Use the actual game's iframe; the shell, roster and save owner survive the round trip.
    await legacySession(page);
    await page.goto(baseURL + '/?display=landscape');
    const canvas = page.frameLocator('#inn-frame iframe').locator('canvas');
    await canvas.evaluate(
      () =>
        new Promise((resolve) => {
          const check = () => (window.modelReady ? resolve() : requestAnimationFrame(check));
          check();
        }),
    );
    await canvas.evaluate(() => window.assetPreview.placeNow('streetDoor'));
    await page
      .frameLocator('#inn-frame iframe')
      .locator('#street-open')
      .waitFor({ state: 'visible' });
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(output, 'tavern-exterior-door.png') });
    const clearance = await canvas.evaluate(async () => {
      const THREE = await import('/vendor/build/three.module.js');
      const view = window.assetPreview;
      const room = new THREE.Box3().setFromObject(view.model);
      const ray = new THREE.Raycaster();
      const hits = [];
      for (const x of [0.8, 1.4, 2.0]) {
        ray.set(new THREE.Vector3(x, 1.5, 3.1), new THREE.Vector3(0, -1, 0));
        hits.push(ray.intersectObject(view.model, true)[0]?.point.y);
      }
      return { width: room.max.x - room.min.x, hits };
    });
    assert(clearance.width > 14.6, 'main hall expanded while preserving furniture sizes');
    assert(
      clearance.hits.every((y) => y >= -0.05 && y <= 0.09),
      'approach is clear of furniture',
    );
    await page.frameLocator('#inn-frame iframe').locator('#street-open').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#inn-frame iframe')].some(
        (el) => el.contentWindow?.streetPreview,
      ),
    );
    await page
      .frameLocator('#inn-frame iframe')
      .locator('canvas')
      .evaluate(() => {
        const view = window.streetPreview;
        const point = view.definition.points.find((entry) => entry.destination === 'city-center');
        view.look(Math.atan2(-point.anchor[0], -point.anchor[2]), 0);
      });
    await page.frameLocator('#inn-frame iframe').locator('[data-hotspot="arch"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.state()
          .sceneId === 'city-center',
    );
    await page.frameLocator('#inn-frame iframe').locator('#street-return').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.state()
          .sceneId === 'starlamp-street',
    );
    await page.frameLocator('#inn-frame iframe').locator('#street-return').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow?.assetPreview?.getState()
          .current === 'streetDoor',
    );
    await canvas.evaluate(
      () =>
        new Promise((resolve) => {
          const check = () => (window.modelReady ? resolve() : requestAnimationFrame(check));
          check();
        }),
    );
    assert.equal(await canvas.evaluate(() => window.assetPreview.getState().current), 'streetDoor');
    await canvas.evaluate(() => window.assetPreview.placeNow('bookshelf'));
    await page
      .frameLocator('#inn-frame iframe')
      .locator('#bookshelf-records')
      .waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    return {
      hotspots: [...seen],
      sharedPainting: true,
      freeLooking: true,
      noViewPresets: true,
      mobileTouch: true,
      tavernReturn: true,
      clearance,
    };
  } finally {
    await page.close();
  }
}
