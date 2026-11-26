import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { legacySession } from './legacy-session.mjs';
import { openCityDirectory } from './town-navigation.mjs';

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
    assert.equal(
      initial.roster.length,
      0,
      'the pure-backdrop city-center overview stays scenic without visitors',
    );
    assert(Math.abs(initial.aspect - 16 / 9) < 0.02, 'city overview keeps native 16:9 aspect');
    assert.equal(await page.locator('.street-controls').count(), 0);
    assert.equal((await page.locator('#street-return').innerText()).trim(), '返回酒馆');
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
    const beforeVertical = await snapshot();
    await drag(page, 0, 140);
    const afterVertical = await snapshot();
    bounded(afterVertical);
    assert(
      Math.abs(afterVertical.state.framing.y - beforeVertical.state.framing.y) > 0.015,
      'free dragging allows gentle vertical sway as well as horizontal looking',
    );
    await page.evaluate(() => window.streetPreview.resetView());
    await settled();
    await page.mouse.move(980, 360, { steps: 6 });
    await page.waitForTimeout(260);
    const pannedHover = await snapshot();
    assert(pannedHover.state.framing.x > 0.01, 'mouse move pans smoothly over the 16:9 backdrop');
    const dockBtnBox = await page.locator('#street-return').boundingBox();
    await page.mouse.move(
      dockBtnBox.x + dockBtnBox.width / 2,
      dockBtnBox.y + dockBtnBox.height / 2,
      { steps: 4 },
    );
    await page.waitForTimeout(260);
    const hoverButton = await snapshot();
    assert(
      Math.abs(hoverButton.state.framing.x) > 0.004,
      'hovering bottom HUD buttons does not snap camera back to center',
    );
    await page.screenshot({ path: path.join(output, 'illustrated-street.png') });
    await page.evaluate(() => window.streetPreview.resetView());
    await settled();
    await drag(page, 160, 30);
    const dragged = await snapshot();
    bounded(dragged);
    assert(Math.abs(dragged.state.framing.x) > 0.04);
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
    const directoryViewport = page.viewportSize();
    await page.setViewportSize({ width: directoryViewport.width, height: 560 });
    const directory = await openCityDirectory(page);
    assert.equal(
      await page
        .locator('#street-city-submap [data-city-node="black-market"]')
        .getAttribute('data-kind'),
      'dungeon',
    );
    assert.equal(
      await page
        .locator('#street-city-submap [data-city-node="city-center"]')
        .getAttribute('data-kind'),
      'stop',
    );
    assert(
      (await directory.locator('[data-city-category="places"]').count()) > 0 &&
        (await directory.locator('[data-city-category="facilities"]').count()) > 0 &&
        (await directory.locator('[data-city-category="dungeons"]').count()) > 0,
      'City directory lists places, facilities and dungeons',
    );
    const scroll = await directory.evaluate((dialog) => {
      const list = dialog.querySelector('#street-city-submap-canvas');
      const { top, bottom, left, right, width, height } = dialog.getBoundingClientRect();
      list.scrollTop = list.scrollHeight;
      const atEnd = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
      const lastCategory = list.querySelector('[data-city-category="dungeons"]');
      return {
        box: { left, right, top, bottom, width, height },
        viewport: { width: innerWidth, height: innerHeight },
        bounded: top >= 0 && bottom <= innerHeight,
        scrollable: list.scrollHeight > list.clientHeight,
        atEnd,
        lastCategoryVisible:
          lastCategory.getBoundingClientRect().bottom <= list.getBoundingClientRect().bottom,
      };
    });
    assert(
      scroll.bounded,
      'the directory dialog is constrained to the viewport: ' +
        JSON.stringify({ box: scroll.box, viewport: scroll.viewport }),
    );
    assert(scroll.scrollable && scroll.atEnd, 'the directory content scrolls to its last row');
    assert(scroll.lastCategoryVisible, 'the dungeon category is visible at the scroll boundary');
    await page.screenshot({ path: path.join(output, 'starbell-submap.png') });
    await page.locator('#street-city-submap-close').click();
    await page.locator('#street-city-submap').waitFor({ state: 'hidden' });
    await openCityDirectory(page);
    await page.keyboard.press('Escape');
    await page.locator('#street-city-submap').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => document.activeElement?.id === 'street-submap-open');
    await page.setViewportSize(directoryViewport);
    assert.equal(
      await page.locator('body.leaving').count(),
      0,
      'Closing the directory does not travel',
    );
    const gestureStartedTravel = await page.evaluate(async () => {
      const dialog = document.getElementById('street-map');
      document.getElementById('street-map-open').click();
      const managed = { type: 'daily-managed', outing: { turns: 0 } };
      window.postMessage(managed, location.origin);
      await new Promise((resolve) =>
        window.addEventListener('message', function onMessage(event) {
          if (event.data?.type !== 'daily-managed') return;
          window.removeEventListener('message', onMessage);
          resolve();
        }),
      );
      const pin = dialog.querySelector('[data-atlas-landmark="mill"]');
      const dispatch = (type, pointerId, x) =>
        pin.dispatchEvent(
          new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId, clientX: x }),
        );
      dispatch('pointerdown', 1, 20);
      dispatch('pointercancel', 1, 20);
      const walker = dialog.querySelector('.street-atlas-walker');
      const cancelled = walker.classList.contains('is-walking');
      dispatch('pointerdown', 1, 20);
      dispatch('pointerdown', 2, 80);
      dispatch('pointermove', 2, 140);
      dispatch('pointerup', 2, 140);
      dispatch('pointerup', 1, 20);
      const pinched = walker.classList.contains('is-walking');
      dialog.close();
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
      return { cancelled, pinched, sceneReady: Boolean(window.streetPreview) };
    });
    assert.deepEqual(gestureStartedTravel, { cancelled: false, pinched: false, sceneReady: true });
    const beforeKey = await snapshot();
    await page.keyboard.press('ArrowRight');
    await settled();
    assert((await snapshot()).state.framing.x > beforeKey.state.framing.x);
    await page.keyboard.press('ArrowUp');
    await settled();
    bounded(await snapshot());

    // The overview suppresses hotspot buttons; open its existing points via the scene preview.
    const inspector = page.locator('#street-inspector');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const normalClose = await inspector.evaluate(async (panel) => {
      const view = window.streetPreview;
      const close = panel.querySelector('#inspection-close');
      view.inspect('clock');
      await Promise.all(panel.getAnimations().map((animation) => animation.finished));
      close.focus();
      close.click();
      const style = getComputedStyle(panel);
      const during = {
        painted: !panel.hidden && style.display !== 'none' && Number(style.opacity) > 0,
        inert: panel.inert && style.pointerEvents === 'none',
        closed: view.state().active === null && !panel.contains(document.activeElement),
      };
      const animations = panel.getAnimations();
      await Promise.all(animations.map((animation) => animation.finished));
      return { ...during, animated: animations.length > 0, hidden: panel.hidden && !panel.inert };
    });
    assert.deepEqual(normalClose, {
      painted: true,
      inert: true,
      closed: true,
      animated: true,
      hidden: true,
    });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedClose = await inspector.evaluate((panel) => {
      window.streetPreview.inspect('clock');
      panel.querySelector('#inspection-close').click();
      return panel.hidden && !panel.inert && panel.getAnimations().length === 0;
    });
    assert(reducedClose, 'Reduced motion hides the inspector immediately');

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const interruptedClose = await inspector.evaluate(async (panel) => {
      const view = window.streetPreview;
      const close = panel.querySelector('#inspection-close');
      view.inspect('clock');
      close.click();
      const firstExit = panel.getAnimations()[0]?.finished;
      view.inspect('fountain');
      await Promise.allSettled([
        firstExit,
        ...panel.getAnimations().map((animation) => animation.finished),
      ]);
      const reopened =
        Boolean(firstExit) && !panel.hidden && !panel.inert && view.state().active === 'fountain';

      close.click();
      const secondExit = panel.getAnimations()[0]?.finished;
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
      await secondExit?.catch(() => {});
      return {
        reopened,
        disposed:
          Boolean(secondExit) &&
          !window.streetPreview &&
          panel.hidden &&
          !panel.inert &&
          panel.getAnimations().length === 0,
      };
    });
    assert.deepEqual(interruptedClose, { reopened: true, disposed: true });

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
      await mobile.evaluate(() => window.streetPreview.resetView());
      await settled(mobile);
      await drag(mobile, 220);
      bounded(await snapshot(mobile));
      await mobile.screenshot({ path: path.join(output, 'illustrated-mobile-city.png') });
      assert.equal((await mobile.locator('#street-return').innerText()).trim(), '返回酒馆');
      await mobile.locator('#street-return').click();
      await mobile.waitForURL('**/tavern.html?return=city-center');
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
    const streetDoor = page.frameLocator('#inn-frame iframe').locator('#street-open');
    await streetDoor.waitFor({ state: 'visible' });
    assert.equal((await streetDoor.textContent()).trim(), '◇ 推门外出');
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
    await page.locator('[data-tavern-exit="city-center"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.state()
          .sceneId === 'city-center',
    );
    assert.equal(
      (await page.frameLocator('#inn-frame iframe').locator('#street-return').innerText()).trim(),
      '返回酒馆',
    );
    await page.frameLocator('#inn-frame iframe').locator('#street-return').click();
    await page.waitForFunction(() => {
      const win = document.querySelector('#inn-frame iframe')?.contentWindow;
      return win?.modelReady && win?.assetPreview?.getState().current === 'streetDoor';
    });
    await canvas.evaluate(() => window.assetPreview.placeNow('streetDoor'));
    await page.frameLocator('#inn-frame iframe').locator('#street-open').click();
    await page.locator('[data-tavern-exit="city-center"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.state()
          .sceneId === 'city-center',
    );
    // Open black-market via city submap and verify seamless Top-Layer transition on open & close
    await page.evaluate(() => {
      const log = (window.__cutsceneTrack = {
        active: true,
        openSawUncoveredDialog: false,
        closeSawUncoveredGap: false,
        ledgerVisibleDuringCurtain: false,
      });
      const step = () => {
        if (!log.active) return;
        const dlg = document.querySelector('#destination-dialog');
        const curtain = document.querySelector('.world-loading-scene:not([hidden])');
        const ledgerHandle = document.querySelector('#ledger-handle');
        const curtainCovering =
          curtain &&
          !curtain.hidden &&
          curtain.matches(':popover-open') &&
          parseFloat(getComputedStyle(curtain).opacity) >= 0.85;
        if (curtain && !curtain.hidden && ledgerHandle && !ledgerHandle.hidden) {
          log.ledgerVisibleDuringCurtain = true;
        }
        if (log.phase === 'opening' && dlg?.open && !log.openRecordedFirst) {
          log.openRecordedFirst = true;
          if (!curtainCovering) log.openSawUncoveredDialog = true;
        }
        if (log.phase === 'closing' && log.closeStarted && !dlg?.open && !log.closeRecordedFirst) {
          log.closeRecordedFirst = true;
          if (!curtainCovering) log.closeSawUncoveredGap = true;
        }
        if (log.phase === 'closing' && dlg?.open) log.closeStarted = true;
        requestAnimationFrame(step);
      };
      log.phase = 'opening';
      requestAnimationFrame(step);
    });
    const embeddedDirectory = await openCityDirectory(page);
    await embeddedDirectory.locator('[data-city-node="black-market"]').click();
    await page.locator('#destination-dialog[data-discovery="true"]').waitFor({ state: 'visible' });
    await page.waitForFunction(
      () => !document.querySelector('.world-loading-scene:not([hidden])'),
      { timeout: 10000 },
    );
    await page.evaluate(() => {
      window.__cutsceneTrack.phase = 'closing';
      window.__cutsceneTrack.closeStarted = Boolean(
        document.querySelector('#destination-dialog')?.open,
      );
    });
    await page.locator('#destination-close').click();
    await page.waitForFunction(
      () =>
        !document.querySelector('#destination-dialog')?.open &&
        !document.querySelector('.world-loading-scene:not([hidden])'),
      { timeout: 10000 },
    );
    const cutsceneReport = await page.evaluate(() => {
      window.__cutsceneTrack.active = false;
      return window.__cutsceneTrack;
    });
    assert.equal(
      cutsceneReport.openSawUncoveredDialog,
      false,
      'Opening dialog must happen behind opaque Top-Layer curtain',
    );
    assert.equal(
      cutsceneReport.closeSawUncoveredGap,
      false,
      'Closing dialog must happen behind opaque Top-Layer curtain',
    );
    assert.equal(
      cutsceneReport.ledgerVisibleDuringCurtain,
      false,
      '#ledger-handle must hide while curtain is shown',
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
      .locator('#bookshelf-archives')
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
