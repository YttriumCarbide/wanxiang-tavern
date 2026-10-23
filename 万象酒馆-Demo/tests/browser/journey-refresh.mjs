import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

/** Page-owned navigation controls and the mobile landscape host share the normal app entry. */
export async function journeyRefreshChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await legacySession(page);
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    const audio = await page.locator('#audio-toggle').boundingBox();
    const fullscreen = await page.locator('#fullscreen-toggle').boundingBox();
    assert(fullscreen.x > audio.x, 'Fullscreen belongs immediately to the right of volume');
    assert(
      await page.evaluate(
        () =>
          !document.dispatchEvent(
            new MouseEvent('contextmenu', { cancelable: true, bubbles: true }),
          ),
      ),
    );
    await page.locator('#fullscreen-toggle').click();
    await page.waitForFunction(() => Boolean(document.fullscreenElement));
    await page.locator('#fullscreen-toggle').click();
    await page.waitForFunction(() => !document.fullscreenElement);
    await page.evaluate(async () => {
      const { newCampaign, firstCompanion } = await import('/src/campaign.js');
      const { defaultProtagonist } = await import('/src/content/qingyuan.js');
      const library = newCampaign(defaultProtagonist());
      library.campaign.completed = true;
      library.inventory.summonContracts = 1;
      firstCompanion(library);
      library.campaign.tutorial = 'complete';
      library.inventory.gold = 200;
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
    });
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    const beforeGesture = await frame
      .locator('canvas')
      .evaluate(() => window.assetPreview.camera.quaternion.toArray());
    const canvas = await frame.locator('canvas').boundingBox();
    await page.mouse.move(canvas.x + canvas.width * 0.4, canvas.y + canvas.height * 0.7);
    await page.mouse.down({ button: 'right' });
    await page.mouse.move(canvas.x + canvas.width * 0.4 + 40, canvas.y + canvas.height * 0.7 - 20, {
      steps: 8,
    });
    await page.mouse.up({ button: 'right' });
    assert.deepEqual(
      await frame.locator('canvas').evaluate(() => window.assetPreview.camera.quaternion.toArray()),
      beforeGesture,
    );

    await frame
      .locator('canvas')
      .evaluate(() => parent.postMessage({ type: 'tavern-shop' }, location.origin));
    await page.locator('#void-shop').waitFor({ state: 'visible' });
    await page.locator('[data-shop-category=mana]').click();
    await page.locator('[data-shop-item="mana-potion"]').click();
    await page.locator('[data-buy="mana-potion"]').click();
    assert.equal((await page.evaluate(() => demo.getLibrary())).inventory.gold, 180);
    assert((await page.locator('#shop-status').innerText()).includes('+1'));
    await page.screenshot({ path: path.join(output, 'shop-refreshed.png') });
    await page.locator('#shop-close').click();
    await page.goto(new URL('tavern.html', baseURL).href);
    await page.waitForFunction(() => window.modelReady, null, { timeout: 60000 });
    await page.setViewportSize({ width: 1904, height: 900 });
    const start = await page.evaluate(() => window.assetPreview.camera.position.toArray());
    await page.evaluate(() => window.assetPreview.moveTo('supplies'));
    await page.locator('#shop-open').waitFor({ state: 'visible' });
    const end = await page.evaluate(() => window.assetPreview.camera.position.toArray());
    assert.notDeepEqual(end, start);
    await page.locator('#condenser-open').waitFor({ state: 'visible' });
    assert(
      await page.evaluate(
        () => !!window.assetPreview.model.getObjectByName('Tavern_Supply_Corner'),
      ),
    );
    assert.equal(
      await page.evaluate(
        () => !!window.assetPreview.model.getObjectByName('12_Corner_Barrels_and_Crates'),
      ),
      false,
    );
    const geometry = await page.evaluate(async () => {
      const { Box3, Vector3 } = await import('/vendor/build/three.module.js');
      const { model, camera } = window.assetPreview;
      model.updateMatrixWorld(true);
      camera.updateMatrixWorld(true);
      const machines = new Box3().setFromObject(model.getObjectByName('Tavern_Supply_Corner'));
      const gate = new Box3();
      model.traverse((object) => {
        if (object.isMesh && object.name.startsWith('20_Summoning'))
          gate.union(new Box3().setFromObject(object));
      });
      const projected = [];
      for (const x of [machines.min.x, machines.max.x])
        for (const y of [machines.min.y, machines.max.y])
          for (const z of [machines.min.z, machines.max.z])
            projected.push(new Vector3(x, y, z).project(camera).toArray());
      return {
        intersectsGate: machines.intersectsBox(gate),
        gap: machines.min.z - gate.max.z,
        projected,
      };
    });
    assert.equal(
      geometry.intersectsGate,
      false,
      'the supply corner must not intersect the summon gate',
    );
    assert(geometry.gap > 1, 'the summon gate retains a clear passage beside the machines');
    assert(
      geometry.projected.every(([x, y, z]) => Math.abs(x) < 0.95 && Math.abs(y) < 0.95 && z < 1),
    );
    const shopButton = await page.locator('#shop-open').boundingBox();
    const forgeButton = await page.locator('#condenser-open').boundingBox();
    assert(shopButton.x + shopButton.width + 8 <= forgeButton.x);
    assert(shopButton.y + shopButton.height <= 900 && forgeButton.y + forgeButton.height <= 900);
    await page.screenshot({ path: path.join(output, 'tavern-machines-refreshed.png') });
    await page.evaluate(() => {
      const { camera } = window.assetPreview;
      camera.position.set(0.2, 1.5, 1.4);
      camera.lookAt(-4.8, 1.35, 2.8);
    });
    await page.waitForTimeout(350);
    const navigation = await page.locator('#spots .spot.visible').all();
    const boxes = await Promise.all(navigation.map((button) => button.boundingBox()));
    for (let index = 0; index < boxes.length; index++)
      for (const other of boxes.slice(index + 1)) {
        const box = boxes[index];
        assert(
          box.x + box.width <= other.x ||
            other.x + other.width <= box.x ||
            box.y + box.height <= other.y ||
            other.y + other.height <= box.y,
          'projected navigation labels must not overlap',
        );
      }
    await page.screenshot({ path: path.join(output, 'tavern-supplies-gate-spacing.png') });
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
  });
  try {
    const phone = await mobile.newPage();
    await legacySession(phone);
    await phone.goto(baseURL);
    await phone.locator('#landscape-frame').waitFor();
    const game = phone.frameLocator('#landscape-frame');
    await game.locator('#party-toggle').waitFor();
    const viewport = await game
      .locator('body')
      .evaluate(() => ({ width: innerWidth, height: innerHeight, initialized: !!window.demo }));
    assert(viewport.width > viewport.height && viewport.initialized);
    assert.equal(
      await phone.evaluate(() => !!window.demo),
      false,
      'Only the child viewport owns the game and saves',
    );
    await phone.screenshot({ path: path.join(output, 'mobile-portrait-forced-landscape.png') });
  } finally {
    await mobile.close();
  }
  return {
    display: true,
    mobileLandscape: true,
    mouseGestures: true,
    shopFeedback: true,
    tavernSupplyTravel: true,
  };
}
