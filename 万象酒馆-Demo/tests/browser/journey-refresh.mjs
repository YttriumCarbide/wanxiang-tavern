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
    await page.goto(new URL('corridor.html', baseURL).href);
    await page.waitForFunction(() => window.corridorReady, null, { timeout: 60000 });
    const start = await page.evaluate(() => window.corridorPreview.camera.position.toArray());
    await page.evaluate(() => window.corridorPreview.approachMachines());
    await page.waitForFunction(
      () => Math.abs(window.corridorPreview.camera.position.z + 2.65) < 0.01,
    );
    const end = await page.evaluate(() => window.corridorPreview.camera.position.toArray());
    assert.notDeepEqual(end, start);
    await page.locator('[data-door="shop"].visible').waitFor();
    await page.locator('[data-door="condenser"].visible').waitFor();
    await page.screenshot({ path: path.join(output, 'corridor-machines-refreshed.png') });
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
    corridorTravel: true,
  };
}
