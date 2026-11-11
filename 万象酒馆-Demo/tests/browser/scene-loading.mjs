import assert from 'node:assert/strict';
import path from 'node:path';

/** Delayed real assets prove readiness gates; reload proves persistent cache reuse. */
export async function sceneLoadingChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  let releaseModel;
  const modelGate = new Promise((resolve) => {
    releaseModel = resolve;
  });
  let modelRequests = 0;
  await page.route('**/assets/inn.glb', async (route) => {
    modelRequests++;
    await modelGate;
    await route.continue();
  });
  try {
    await page.goto(baseURL + '/tavern.html', { waitUntil: 'domcontentloaded' });
    await page.locator('#status [role="progressbar"]').waitFor();
    assert.equal(await page.evaluate(() => window.modelReady === true), false);
    assert(
      Number(await page.locator('#status [role="progressbar"]').getAttribute('aria-valuenow')) <
        100,
    );
    await page.screenshot({ path: path.join(output, 'tavern-loading.png') });
    releaseModel();
    await page.waitForFunction(() => window.modelReady === true, null, { timeout: 60000 });
    assert.equal(await page.locator('#status').count(), 0);
    assert.equal(modelRequests, 1);
    await page.reload();
    await page.waitForFunction(() => window.modelReady === true, null, { timeout: 60000 });
    assert.equal(modelRequests, 1, 'second entry reads the verified local model cache');
    await page.setViewportSize({ width: 667, height: 375 });
    let releaseImage;
    const imageGate = new Promise((resolve) => {
      releaseImage = resolve;
    });
    await page.route('**/assets/exploration/street-hd-v4/connected.png', async (route) => {
      await imageGate;
      await route.continue();
    });
    const navigation = page.goto(baseURL + '/street.html', { waitUntil: 'domcontentloaded' });
    await navigation;
    await page.locator('#street-status [role="progressbar"]').waitFor();
    assert.equal(await page.evaluate(() => window.modelReady === true), false);
    const bounds = await page.locator('.scene-loading-card').boundingBox();
    assert(
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= 668 &&
        bounds.y + bounds.height <= 376,
    );
    await page.screenshot({ path: path.join(output, 'street-loading-mobile.png') });
    releaseImage();
    await page.waitForFunction(() => window.modelReady && window.streetPreview, null, {
      timeout: 60000,
    });
    const loaded = await page.evaluate(() => {
      const images = [];
      window.streetPreview.model.root.traverse((mesh) => {
        if (mesh.material?.map) images.push(mesh.material.map.image);
      });
      return (
        images.length >= 1 &&
        new Set(images).size === 1 &&
        images.every((image) => image.complete && image.naturalWidth > 0)
      );
    });
    assert(loaded, 'the shared continuous painting is decoded before entering');
    await page.locator('#street-return').click();
    await page.waitForURL('**/tavern.html?return=street');
    await page.waitForFunction(() => window.modelReady === true, null, { timeout: 60000 });
    assert.equal(await page.locator('#status').count(), 0, 'return finishes scene loading');
    assert.equal(await page.evaluate(() => window.assetPreview.getState().current), 'streetDoor');
    await page.locator('canvas').evaluate(() => window.assetPreview.placeNow('bar'));
    await page.locator('#talk-open').waitFor({ state: 'visible' });
    assert.equal(modelRequests, 1, 'outdoor return also reuses the verified model cache');
    assert.deepEqual(errors, [], 'scene navigation has no initialization errors');
    return {
      modelCacheReused: true,
      measuredProgress: true,
      imageGate: true,
      mobile: true,
      outdoorReturn: true,
    };
  } finally {
    releaseModel();
    await page.close();
  }
}
