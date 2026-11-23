import assert from 'node:assert/strict';
import path from 'node:path';
import { DUNGEON_SCENE_IDS, REGIONS } from '../../src/content/regions.js';
import { legacySession } from './legacy-session.mjs';

export async function dungeonArtChecks({ browser, baseURL, output }) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 850 },
    reducedMotion: 'reduce',
    hasTouch: true,
  });
  const page = await context.newPage();
  const errors = [];
  const files = new Set();
  const worlds = DUNGEON_SCENE_IDS.map((id) => {
    const region = REGIONS[id];
    return {
      id: 'world-' + id,
      map: id,
      name: region.name,
      background: region.description,
      landmarks: region.sites,
      enemyIds: [...region.enemies, region.boss],
      enemyDefinitions: {},
    };
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.ok()) files.add(new URL(response.url()).pathname);
  });
  try {
    await page.goto(new URL('artbook.html?scene=' + DUNGEON_SCENE_IDS[0], baseURL).href);
    await page.waitForFunction(() => window.artbook && !window.artbook.status().loading);
    await page.evaluate(() => document.fonts.ready.then(() => true));
    await page.evaluate(() => window.artbook.weather('clear'));
    await page.locator('.artbook-panel').evaluate((panel) => {
      panel.style.visibility = 'hidden';
    });
    for (const id of DUNGEON_SCENE_IDS) {
      await page.evaluate((id) => window.artbook.select(id), id);
      await page.waitForFunction(
        () => !window.artbook.status().loading && !window.artbook.status().animating,
      );
      assert.equal(await page.locator('#atlas-title').textContent(), REGIONS[id].name);
      assert(files.has('/assets/' + id + '.glb'));
      const status = await page.evaluate(() => window.artbook.status());
      assert.equal(status.outerEnvironment?.mode, 'authored-large');
      assert.equal(status.outerEnvironment?.drawBatches, 0);
      await page.screenshot({ path: path.join(output, id + '-scene.png') });
    }

    await page.close();
    const destination = await context.newPage();
    await legacySession(destination, { worlds });
    destination.on('pageerror', (error) => errors.push(error.message));
    destination.on('response', (response) => {
      if (response.ok()) files.add(new URL(response.url()).pathname);
    });
    await destination.goto(baseURL);
    await destination.waitForFunction(() => !!window.demo);
    const inn = destination.frameLocator('#inn-frame iframe');
    await destination.locator('#inn-frame iframe').waitFor();
    await inn.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await inn.locator('canvas').evaluate(() => window.assetPreview.placeNow('gate'), null, {
      timeout: 15000,
    });
    await inn.locator('#enter').click();

    const dialog = destination.locator('#destination-dialog');
    const preview = destination.locator('#destination-preview');
    for (const { id, map, name } of worlds) {
      const button = dialog.locator(`[data-region="${id}"]`);
      if (!(await button.count())) await dialog.getByRole('button', { name: '下一页地图' }).click();
      await button.click();
      await destination.locator(`#destination-preview[data-ready="${map}"]`).waitFor();
      assert.equal(await dialog.locator('#destination-region-name').textContent(), name);
      assert(files.has('/assets/preview-' + map + '.glb'));
      assert(await preview.locator('canvas').isVisible());
      await dialog.screenshot({ path: path.join(output, map + '-preview.png') });
    }

    await destination.setViewportSize({ width: 844, height: 390 });
    for (const { id, map } of worlds) {
      await dialog.locator(`[data-region="${id}"]`).click();
      await destination.locator(`#destination-preview[data-ready="${map}"]`).waitFor();
      const canvas = await preview.locator('canvas').boundingBox();
      assert(canvas.x >= 0 && canvas.y >= 0);
      assert(canvas.x + canvas.width <= 844 && canvas.y + canvas.height <= 390);
      assert(canvas.width > 0 && canvas.height > 0);
    }
    assert.deepEqual(errors, []);
    return { scenes: DUNGEON_SCENE_IDS, desktopScreenshots: 4, landscapeMobile: true };
  } finally {
    await context.close();
  }
}
