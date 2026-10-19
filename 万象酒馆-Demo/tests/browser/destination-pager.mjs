import { legacySession } from './legacy-session.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { REGIONS } from '../../src/content/regions.js';

/** Centered environment → hand-drawn parchment; no dungeon is replayed in this interface suite. */
export async function destinationPagerChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 }, hasTouch: true });
  const errors = [];
  let generations = 0;
  let entrance;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/ai/generate/*', async (route) => {
    generations++;
    await route.abort();
  });
  async function openGate() {
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('gate'));
    await frame.locator('#enter').click();
    await page.locator('#destination-dialog[data-stage="region"]').waitFor({ state: 'visible' });
  }
  async function ready(map) {
    await page.locator('#destination-preview[data-ready="' + map + '"]').waitFor();
    await page.waitForTimeout(650);
  }
  async function centeredWindow() {
    const box = await page.locator('#destination-dialog').boundingBox();
    const viewport = page.viewportSize();
    assert(box.x >= 8 && box.y >= 8, 'Keep the tavern visible around the window');
    assert(box.width < viewport.width && box.height < viewport.height);
    assert(Math.abs(box.x * 2 + box.width - viewport.width) < 2);
    assert(Math.abs(box.y * 2 + box.height - viewport.height) < 2);
  }
  async function expandMap() {
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-dialog[data-stage="route"]').waitFor();
    assert.equal(await page.locator('.destination-node').count(), 6);
    assert.deepEqual(await page.locator('.destination-node-mark em').allTextContents(), [
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
    ]);
    assert(!(await page.locator('#destination-world-screen').isVisible()));
    assert(!(await page.locator('#destination-region-confirm').isVisible()));
    const dialog = await page.locator('#destination-dialog').boundingBox();
    const map = await page.locator('#destination-map').boundingBox();
    assert(Math.abs(map.width - dialog.width) < 3);
    assert(Math.abs(map.height - dialog.height) < 3);
    const background = await page
      .locator('.destination-map-canvas')
      .evaluate((element) => getComputedStyle(element).backgroundImage);
    assert(background.includes('exploration-parchment.png'));
  }
  async function reachable(selectors) {
    const viewport = page.viewportSize();
    for (const selector of selectors) {
      const box = await page.locator(selector).boundingBox();
      assert(
        box &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= viewport.width &&
          box.y + box.height <= viewport.height,
        selector + ' must stay reachable',
      );
      assert(box.width >= 32 && box.height >= 32);
    }
  }
  try {
    await legacySession(page);
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    await openGate();
    await centeredWindow();
    const before = await page.evaluate(() => demo.getExploration());
    await expandMap();
    assert.equal(await page.locator('[data-map-node] em').first().textContent(), '1');
    assert(!(await page.locator('[data-map-node]').first().innerText()).includes('新手教程'));
    await page.locator('#destination-back').click();
    for (const [index, map] of Object.keys(REGIONS).entries()) {
      await ready(map);
      assert.equal(await page.locator('#destination-region-name').textContent(), REGIONS[map].name);
      assert(
        (await page.locator('#destination-region-confirm').textContent()).includes(
          REGIONS[map].name,
        ),
      );
      const selectedRegion = page.locator(`[data-region="${map}"][aria-pressed="true"]`);
      assert.equal(await selectedRegion.count(), 1);
      assert.notEqual(
        await selectedRegion.evaluate((element) => getComputedStyle(element).backgroundColor),
        'rgba(0, 0, 0, 0)',
      );
      assert.equal(
        await page.locator('#destination-region-count').textContent(),
        String(index + 1).padStart(2, '0') +
          ' / ' +
          String(Object.keys(REGIONS).length).padStart(2, '0'),
      );
      assert(!(await page.locator('#destination-map').isVisible()));
      assert(!(await page.locator('#destination-start').isVisible()));
      const preview = await page.locator('#destination-preview').boundingBox();
      assert(
        preview.width > 850 && preview.height > 300,
        'Environment preview should dominate the first screen',
      );
      await page.locator('#destination-region-next').click();
    }
    await ready('ruins');
    await page.locator('#destination-region-next').click({ clickCount: 3, delay: 30 });
    await ready('forge');
    await page.locator('#destination-region-next').focus();
    await page.keyboard.press('ArrowLeft');
    await ready('frost');
    await page.screenshot({ path: path.join(output, 'destination-environment-window.png') });
    await expandMap();
    entrance = await page
      .locator('[data-map-node]')
      .first()
      .evaluate((element) => ({
        id: element.dataset.mapNode,
        left: element.style.left,
        top: element.style.top,
      }));
    await page.keyboard.press('ArrowRight');
    assert.equal(
      await page.locator('#destination-dialog').getAttribute('data-region'),
      'frost',
      'Map arrows must pan, not change the chosen environment',
    );
    await page.locator('#destination-back').click();
    await ready('frost');
    assert.deepEqual(
      await page.evaluate(() => demo.getExploration()),
      before,
      'Browsing and confirming must not advance any route',
    );
    // Extend a saved route with production rules to verify the drawing, without playing a dungeon.
    await page.evaluate(async () => {
      const { completeExploration } = await import('/src/exploration.js');
      const key = 'wanxiang.worldbooks.v1';
      const library = JSON.parse(localStorage.getItem(key));
      for (let step = 0; step < 4; step++)
        completeExploration(library.exploration, library.exploration.frost.frontier[0]);
      localStorage.setItem(key, JSON.stringify(library));
    });
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await openGate();
    await page.locator('[data-region="frost"]').click();
    await ready('frost');
    await expandMap();
    assert.equal(await page.locator('.destination-node.cleared').count(), 4);
    assert.equal(
      await page.locator('.destination-node.cleared').first().locator('em').textContent(),
      '1',
    );
    assert.equal(await page.locator('[data-map-node]:not([disabled])').count(), 1);
    assert.equal(
      await page.locator('.destination-map-canvas .destination-trail').count(),
      (await page.locator('[data-map-node]').count()) - 1,
    );
    assert.deepEqual(
      await page.locator('[data-map-node="' + entrance.id + '"]').evaluate((element) => ({
        id: element.dataset.mapNode,
        left: element.style.left,
        top: element.style.top,
      })),
      entrance,
      'Old landmarks must not move when a branch opens',
    );
    const drawing = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll('[data-map-node]')].map((element) => ({
        x: parseFloat(element.style.left),
        y: parseFloat(element.style.top),
      }));
      return {
        x: new Set(nodes.map((point) => point.x)).size,
        y: new Set(nodes.map((point) => point.y)).size,
        count: nodes.length,
        curves: [...document.querySelectorAll('.destination-map-canvas .destination-trail')].every(
          (path) => path.getAttribute('d').split(' C ').length > 8,
        ),
      };
    });
    assert.equal(drawing.x, drawing.count, 'Landmarks must not align into columns');
    assert.equal(drawing.y, drawing.count, 'Landmarks must not align into rows');
    assert(drawing.curves);
    assert.equal(
      await page.locator('.destination-sketch-mark .sketch-ring').count(),
      drawing.count,
    );
    assert.equal(await page.locator('.destination-sketch-mark .sketch-cross').count(), 4);
    await page.locator('#destination-map').evaluate((element) => element.scrollTo(0, 0));
    await page.screenshot({ path: path.join(output, 'destination-parchment-handdrawn.png') });
    for (const node of await page.locator('[data-map-node]:not([disabled])').all()) {
      await node.click();
      assert.equal(
        await node.getAttribute('aria-pressed'),
        'true',
        'Every open landmark must remain clickable',
      );
      assert.equal(await node.locator('.destination-selection-label').isVisible(), true);
      assert((await page.locator('#destination-sites').textContent()).includes('已选择 · 第 5 处'));
      assert((await page.locator('#destination-start').textContent()).includes('第 5 处'));
      assert.equal(await page.locator('.destination-trail.selected-trail').count(), 4);
      await page.screenshot({ path: path.join(output, 'destination-selected-landmark.png') });
    }
    for (const viewport of [
      { width: 844, height: 390 },
      { width: 667, height: 375 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(200);
      await centeredWindow();
      await reachable([
        '#destination-back',
        '#destination-center',
        '#destination-start',
        '#destination-close',
      ]);
      await page.locator('[data-map-node]:not([disabled])').last().click();
      assert.equal(
        await page.locator('[data-map-node]:not([disabled])').last().getAttribute('aria-pressed'),
        'true',
      );
      await page.screenshot({
        path: path.join(output, 'destination-mobile-' + viewport.width + '.png'),
      });
      await page.locator('#destination-back').click();
      await ready('frost');
      await reachable([
        '#destination-region-prev',
        '#destination-region-next',
        '#destination-region-confirm',
        '#destination-close',
      ]);
      const preview = await page.locator('#destination-preview').boundingBox();
      assert(preview.height > 100 && preview.width > 400);
      await expandMap();
    }
    await page.locator('#destination-map').evaluate((element) => element.scrollTo(0, 0));
    const selected = await page
      .locator('[aria-pressed="true"][data-map-node]')
      .getAttribute('data-map-node');
    await page.mouse.move(540, 180);
    await page.mouse.down();
    await page.mouse.move(190, 240, { steps: 10 });
    await page.mouse.up();
    assert(await page.locator('#destination-map').evaluate((element) => element.scrollLeft > 100));
    assert.equal(
      await page.locator('[aria-pressed="true"][data-map-node]').getAttribute('data-map-node'),
      selected,
      'Dragging must not select a node',
    );
    await page.locator('#destination-center').click();
    await page.locator('#destination-back').click();
    await ready('frost');
    assert.equal(await page.locator('#destination-preview canvas').count(), 1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#destination-region-next').tap();
    await ready('forge');
    assert.equal(
      await page
        .locator('#destination-region-copy')
        .evaluate((element) => element.getAnimations().length),
      0,
    );
    const preview = await page.locator('#destination-preview').boundingBox();
    const touch = await page.context().newCDPSession(page);
    const y = preview.y + preview.height / 2;
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: preview.x + preview.width * 0.8, y }],
    });
    await touch.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: preview.x + preview.width * 0.2, y }],
    });
    await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await touch.detach();
    await ready('tide');
    await page.locator('#destination-close').click();
    await openGate();
    assert(
      !(await page.locator('#destination-map').isVisible()),
      'Reopening starts at environment choice',
    );
    assert.equal(generations, 0);
    await page.locator('#destination-close').click();
    await page.evaluate(async () => {
      const { completeExploration } = await import('/src/exploration.js');
      const library = demo.getLibrary();
      const route = library.exploration.tide;
      while (route.frontier.length) completeExploration(library.exploration, route.frontier[0]);
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
    });
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await openGate();
    await page.locator('[data-region="tide"]').click();
    await ready('tide');
    await expandMap();
    assert.equal(await page.locator('#destination-start').isDisabled(), true);
    assert.equal(await page.locator('#destination-start').textContent(), '本图已完成');
    assert.equal(await page.locator('.destination-node.cleared').count(), 6);
    await page.screenshot({ path: path.join(output, 'destination-six-sites-complete.png') });
    assert.deepEqual(errors, []);
    return {
      centeredSteps: 2,
      stableScatteredLandmarks: true,
      windingTrails: true,
      dragWithoutSelection: true,
      models: Object.keys(REGIONS).length,
      keyboardAndTouch: true,
      mobile: ['844x390', '667x375'],
      noGenerationOnBrowse: true,
    };
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'destination-pager-error.png') });
    throw error;
  } finally {
    await page.close();
  }
}
