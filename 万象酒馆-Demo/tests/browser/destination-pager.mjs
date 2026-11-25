import { BASE_WORLDS } from '../../src/worlds.js';
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
  const loadedPreviews = new Set();
  const previewUrl = (id) => new URL(`assets/preview-${id}.glb`, baseURL).href;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.ok() && /\/assets\/preview-[^/]+\.glb$/.test(response.url()))
      loadedPreviews.add(response.url());
  });
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
    const selector = '#destination-dialog[open]';
    // Playwright can see the window while its entry transition still translates it.
    // Only wait for motion on the dialog itself, not the animated world preview.
    await page.waitForFunction(
      (selector) => {
        const dialog = document.querySelector(selector);
        return dialog
          ?.getAnimations()
          .every((motion) => !motion.pending && motion.playState !== 'running');
      },
      selector,
      { timeout: 5000 },
    );
    const box = await page.locator(selector).boundingBox();
    const viewport = page.viewportSize();
    assert(box && viewport, 'The open destination dialog must have a viewport box');
    assert(box.x >= 8 && box.y >= 8, 'Keep the tavern visible around the window');
    assert(box.width < viewport.width && box.height < viewport.height);
    const measured = JSON.stringify({ box, viewport });
    assert(Math.abs(box.x * 2 + box.width - viewport.width) < 2, 'Horizontal center: ' + measured);
    assert(Math.abs(box.y * 2 + box.height - viewport.height) < 2, 'Vertical center: ' + measured);
  }
  async function expandMap() {
    const regionId = await page.locator('#destination-dialog').getAttribute('data-region');
    const expectedLabels = REGIONS[regionId].nodes.map((node) => node.label);
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-dialog[data-stage="route"]').waitFor();
    assert.equal(await page.locator('.destination-node').count(), expectedLabels.length);
    assert.deepEqual(
      await page.locator('.destination-node-mark em').allTextContents(),
      expectedLabels,
    );
    assert(!(await page.locator('#destination-world-screen').isVisible()));
    assert(!(await page.locator('#destination-region-confirm').isVisible()));
    const dialog = await page.locator('#destination-dialog').boundingBox();
    const map = await page.locator('#destination-map').boundingBox();
    const sites = await page.locator('#destination-sites').boundingBox();
    assert(map.width > dialog.width * 0.9 && map.height > dialog.height * 0.55);
    assert(
      sites.y >= map.y + map.height - 2,
      'Bottom summary bar must sit cleanly below map viewport',
    );
    const background = await page
      .locator('.destination-map-canvas')
      .evaluate((element) => getComputedStyle(element).backgroundImage);
    assert(!background.includes('exploration-parchment.png'));
    assert(
      (await page.locator('.destination-terrain-layer use[href*="paper-quarter"]').count()) > 0 &&
        (await page.locator('.destination-terrain-layer pattern').count()) > 0,
      'Route map must use borderless Overland #paper-quarter surface',
    );
    assert.equal(await page.locator('.destination-terrain-layer .terrain-frame-outer').count(), 0);
    const node = page.locator('.destination-node').first();
    for (const hovered of [false, true]) {
      if (hovered) await node.hover();
      const style = await node.evaluate((element) => {
        const css = getComputedStyle(element);
        return { shadow: css.boxShadow, blur: css.backdropFilter, background: css.backgroundColor };
      });
      assert.deepEqual(
        style,
        { shadow: 'none', blur: 'none', background: 'rgba(0, 0, 0, 0)' },
        'map marks stay ink on parchment, including hover',
      );
    }
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
  async function leftFooterActions(primarySelector, { withBackground = false } = {}) {
    const selectors = withBackground
      ? ['#destination-description', primarySelector]
      : [primarySelector];
    await reachable(selectors);
    const footer = page.locator('#destination-dialog footer');
    const visibleIds = await footer
      .locator(
        'button:is(#destination-description, #destination-region-confirm, #destination-start):visible',
      )
      .evaluateAll((buttons) => buttons.map((button) => button.id));
    assert.deepEqual(
      visibleIds,
      selectors.map((selector) => selector.slice(1)),
    );
    const [bar, ...buttons] = await Promise.all([
      footer.boundingBox(),
      ...selectors.map((selector) => footer.locator(selector).boundingBox()),
    ]);
    assert(bar && buttons.every(Boolean), 'The actions must be visible in the footer');
    for (const box of buttons) {
      assert(box.x >= bar.x && box.x + box.width <= bar.x + bar.width);
      assert(box.y >= bar.y && box.y + box.height <= bar.y + bar.height);
    }
    const [first, primary] = buttons;
    assert(first.x - bar.x <= 16, 'The action group anchors to the lower-left');
    if (withBackground) {
      const gap = primary.x - (first.x + first.width);
      assert(gap >= 0 && gap <= 16, 'The primary action stays beside the background on the left');
      assert(
        Math.abs(first.y + first.height / 2 - (primary.y + primary.height / 2)) < 4,
        'World background and primary action stay on one row',
      );
    }
  }
  async function selectRegionFromStrip(regionId) {
    const selector = `#destination-regions [data-region="${regionId}"]`;
    for (let pageNumber = 0; pageNumber < 8; pageNumber++) {
      const region = page.locator(selector);
      if (await region.count()) {
        await region.click();
        return;
      }
      const nextPage = page.locator('.destination-strip > button[aria-label="下一页地图"]');
      assert.equal(
        await nextPage.isDisabled(),
        false,
        `${regionId} must be present in the destination map pages`,
      );
      await nextPage.click();
    }
    throw new Error(`Cannot find ${regionId} in the destination map strip`);
  }
  async function readBlackMarketBackground() {
    const lore = page.locator('#destination-lore');
    await page.locator('#destination-description').click();
    await lore.waitFor({ state: 'visible' });
    assert.equal(await lore.locator('article').textContent(), REGIONS['black-market'].description);
    await lore.getByRole('button', { name: '关闭世界背景' }).click();
    await lore.waitFor({ state: 'hidden' });
  }
  const routeNodes = () =>
    page
      .locator('[data-map-node]')
      .evaluateAll((nodes) =>
        nodes.map((node) => [node.dataset.mapNode, node.getAttribute('aria-pressed')]),
      );
  try {
    await legacySession(page);
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    await openGate();
    await centeredWindow();
    assert(
      !(await page.locator('#destination-description').isVisible()),
      'Short lore stays hidden',
    );
    await leftFooterActions('#destination-region-confirm');
    const before = await page.evaluate(() => demo.getExploration());
    await expandMap();
    assert.equal(await page.locator('[data-map-node] em').first().textContent(), '1');
    assert(!(await page.locator('[data-map-node]').first().innerText()).includes('新手教程'));
    const lockedNodes = page.locator('.destination-node.locked');
    assert((await lockedNodes.count()) >= 3, 'Locked stages must appear masked before unlock');
    assert.equal(await lockedNodes.first().locator('strong').textContent(), '？？？');
    assert.equal(
      await lockedNodes.first().locator('.destination-node-meta').textContent(),
      'Lv.??',
    );
    // Verify 4-way drag immediately after opening on Stage 1
    const mapBox = await page.locator('#destination-map').boundingBox();
    const cx = Math.round(mapBox.x + mapBox.width / 2);
    const cy = Math.round(mapBox.y + mapBox.height / 2);
    const dragMap = async (dx, dy) => {
      const beforePan = await page
        .locator('#destination-map')
        .evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx + dx, cy + dy, { steps: 6 });
      await page.mouse.up();
      const afterPan = await page
        .locator('#destination-map')
        .evaluate((el) => ({ left: el.scrollLeft, top: el.scrollTop }));
      return {
        dxScrolled: afterPan.left - beforePan.left,
        dyScrolled: afterPan.top - beforePan.top,
      };
    };
    const panRight = await dragMap(-80, 0);
    const panLeft = await dragMap(90, 0);
    const panDown = await dragMap(0, -50);
    const panUp = await dragMap(0, 60);
    assert(panRight.dxScrolled > 20, `Expected right pan on Stage 1, got ${panRight.dxScrolled}`);
    assert(panLeft.dxScrolled < -20, `Expected left pan on Stage 1, got ${panLeft.dxScrolled}`);
    assert(panDown.dyScrolled > 15, `Expected down pan on Stage 1, got ${panDown.dyScrolled}`);
    assert(panUp.dyScrolled < -15, `Expected up pan on Stage 1, got ${panUp.dyScrolled}`);
    await page.locator('#destination-center').click();
    await page.locator('#destination-back').click();
    for (const [index, map] of BASE_WORLDS.entries()) {
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
          String(BASE_WORLDS.length + 1).padStart(2, '0'),
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
    await page.locator('#destination-region-next').click();
    await ready('mill');
    assert(loadedPreviews.has(previewUrl('mill')), 'Mill must load its dedicated miniature GLB');
    await page.screenshot({ path: path.join(output, 'destination-mill-miniature.png') });
    await page.locator('#destination-region-next').click({ clickCount: 4, delay: 30 });
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
    assert.equal(
      await page.locator('[data-map-node]:not([disabled])').count(),
      5,
      'four cleared landmarks allow recollection alongside the next destination',
    );
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
      const uniquePairs = new Set(nodes.map((point) => `${point.x},${point.y}`));
      return {
        pairs: uniquePairs.size,
        count: nodes.length,
        curves: [...document.querySelectorAll('.destination-map-canvas .destination-trail')].every(
          (path) => /\s[QC]\s/.test(path.getAttribute('d') || ''),
        ),
      };
    });
    assert.equal(drawing.pairs, drawing.count, 'Landmarks must not stack on identical points');
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
      const label = (await node.locator('em').textContent()).trim();
      const cleared = await node.evaluate((el) => el.classList.contains('cleared'));
      assert(
        (await page.locator('#destination-sites').textContent()).includes(label),
        'Site summary must display selected landmark label',
      );
      assert(
        (await page.locator('#destination-start').textContent()).includes(
          cleared ? '回忆' : `第 ${label} 处`,
        ),
      );
      assert((await page.locator('.destination-trail.selected-trail').count()) >= 0);
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
    assert.equal(
      await page
        .locator('#destination-map')
        .evaluate((element) => getComputedStyle(element).opacity),
      '1',
    );
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
      const { completeExploration, unlockDungeonMap } = await import('/src/exploration.js');
      const library = demo.getLibrary();
      const route = library.exploration.tide;
      while (route.completed < 6) completeExploration(library.exploration, route.frontier[0]);
      unlockDungeonMap(library, 'graystone-quarry');
      unlockDungeonMap(library, 'black-market');
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
    });
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await openGate();
    await page.locator('.destination-strip > button').last().click();
    await page.locator('[data-region="tide"]').click();
    await ready('tide');
    await page.locator('#destination-region-confirm').click();
    assert.equal(await page.locator('#destination-start').isDisabled(), false);
    assert((await page.locator('#destination-start').textContent()).includes('继续探索'));
    assert.equal(await page.locator('.destination-node').count(), 7);
    assert.equal(await page.locator('.destination-node.cleared').count(), 6);
    await page.screenshot({ path: path.join(output, 'destination-six-sites-complete.png') });

    await page.locator('#destination-back').click();
    await page.locator('.destination-strip > button').first().click();
    await page.locator('[data-region="mill"]').click();
    await ready('mill');
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-dialog[data-stage="route"]').waitFor();
    assert.deepEqual(
      await page.locator('.destination-node-mark em').allTextContents(),
      REGIONS.mill.nodes.map((node) => node.label),
    );
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(output, 'mill-node-map.png') });

    await page.locator('#destination-back').click();
    await page.locator('[data-region="ruins"]').click();
    await ready('ruins');
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-dialog[data-stage="route"]').waitFor();
    assert.deepEqual(
      await page.locator('.destination-node-mark em').allTextContents(),
      REGIONS.ruins.nodes.map((node) => node.label),
    );
    const ruinsLevels = await page.locator('.destination-node-meta').allTextContents();
    assert(
      ruinsLevels.some((text) => text.includes('Lv.20')),
      `Expected ruins Lv.20+ on node map, got ${ruinsLevels.join(', ')}`,
    );
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(output, 'ruins-node-map.png') });

    const expectedBlackMarketLabels = REGIONS['black-market'].nodes.map(({ label }) => label);
    const confirm = '#destination-region-confirm';
    await page.locator('#destination-back').click();
    await page.locator('.destination-strip > button').last().click();
    await selectRegionFromStrip('graystone-quarry');
    await ready('graystone-quarry');
    assert(loadedPreviews.has(previewUrl('graystone-quarry')), 'Quarry loads its own miniature');
    await page.screenshot({ path: path.join(output, 'destination-quarry-miniature.png') });
    await selectRegionFromStrip('black-market');
    await ready('black-market');
    assert(
      loadedPreviews.has(previewUrl('black-market')),
      'Black market must load its own miniature',
    );
    await page.screenshot({ path: path.join(output, 'destination-black-market-miniature.png') });

    for (const viewport of [
      { width: 1440, height: 836 },
      { width: 667, height: 375 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await centeredWindow();
      await leftFooterActions(confirm, { withBackground: true });
      await readBlackMarketBackground();
      await page.locator(confirm).click();
      await page.locator('#destination-dialog[data-stage="route"]').waitFor();
      await leftFooterActions('#destination-start', { withBackground: true });
      assert.deepEqual(
        await page.locator('.destination-node-mark em').allTextContents(),
        expectedBlackMarketLabels,
      );
      const nodes = await routeNodes();
      assert.equal(nodes.filter(([, pressed]) => pressed === 'true').length, 1);
      await readBlackMarketBackground();
      assert.deepEqual(
        await routeNodes(),
        nodes,
        'Opening lore must not change the route or selection',
      );
      await page.locator('#destination-back').click();
    }

    assert.equal(generations, 0);
    assert.deepEqual(errors, []);
    return {
      centeredSteps: 2,
      stableScatteredLandmarks: true,
      windingTrails: true,
      dragWithoutSelection: true,
      models: Object.keys(REGIONS).length,
      keyboardAndTouch: true,
      mobile: ['844x390', '667x375', '390x844'],
      noGenerationOnBrowse: true,
    };
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'destination-pager-error.png') });
    error.message += '\nPage errors: ' + errors.join(' | ');
    throw error;
  } finally {
    await page.close();
  }
}
