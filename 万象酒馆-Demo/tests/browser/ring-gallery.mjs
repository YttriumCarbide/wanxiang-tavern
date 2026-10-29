import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { EMBLEMS } from '../../src/emblems.js';
import { resourceText } from '../../src/resource-text.js';

/** Check actual jewellery, transparent inn composition, and interruptible transitions in one session. */
export async function ringGalleryChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const ids = ['tan-hongyu', 'mizunatsuki-ran', 'kamui', 'wind-dance', 'jiu-qi'];
  try {
    await legacySession(page);
    await page.addInitScript(() => {
      const library = JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1'));
      if (!library) return;
      library.emblems = ['tan-hongyu'];
      library.characters[0].emblemId = 'tan-hongyu';
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
    });
    await page.goto(baseURL);
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    const scene = await (await page.locator('#inn-frame iframe').elementHandle()).contentFrame();
    const waitForSwitch = () =>
      scene.waitForFunction(() => !window.assetPreview.rings().transitioning);
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('fate'));
    await frame.locator('#emblem-open').waitFor({ state: 'visible' });
    const table = await frame.locator('canvas').evaluate(() => {
      const objects = [];
      window.assetPreview.scene.traverse((object) => {
        if (object.userData.emblemId || object.name === 'Fate_Emblem_Jewellery_Cabinet')
          objects.push(object.name);
      });
      return { objects, count: window.assetPreview.rings().tabletop };
    });
    assert.deepEqual(
      table.objects,
      [],
      'The fate desk must contain no ring models or display tray',
    );
    assert.equal(table.count, 0);
    await page.screenshot({ path: path.join(output, 'fate-table.png') });
    await frame.locator('#emblem-open').click();
    await frame.locator('.ring-gallery-owner').filter({ hasText: '已契约' }).waitFor();
    await scene.waitForFunction(() => window.assetPreview.rings().background === true);
    const wearer = await page.evaluate(
      () =>
        demo.getLibrary().characters.find((member) => member.emblemId === 'tan-hongyu').setting
          .name,
    );
    assert.equal(await frame.locator('.ring-gallery-owner').textContent(), '已契约 · ' + wearer);
    await page.waitForFunction(() => document.body.classList.contains('ring-cabinet-open'));
    assert.equal(await page.locator('#party-panel').isVisible(), false);
    assert.equal(
      await frame
        .locator('.ring-gallery-craft, .ring-gallery-power, .ring-gallery details')
        .count(),
      0,
    );
    const glass = await frame.locator('.ring-gallery').evaluate((panel) => {
      const style = getComputedStyle(panel);
      return { color: style.backgroundColor, image: style.backgroundImage };
    });
    const alpha = glass.color.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
    assert(alpha && Number(alpha[1]) < 1, 'The gallery surface must remain translucent');
    await frame.locator('[data-ring-turn]').click();
    for (const [index, id] of ids.entries()) {
      await frame.locator('[data-ring-id="' + id + '"]').click();
      if (index > 0) {
        assert.equal(
          await frame.locator('canvas').evaluate(() => window.assetPreview.rings().transitioning),
          true,
        );
        if (index === 1) {
          await page.waitForTimeout(120);
          await page.screenshot({ path: path.join(output, 'ring-switching.png') });
        }
      }
      await waitForSwitch();
      assert.equal(
        await frame.locator('[data-ring-passive]').textContent(),
        resourceText(EMBLEMS[id].emblem.text),
      );
      assert.equal(
        await frame.locator('[data-ring-skill-name]').textContent(),
        EMBLEMS[id].skill.name,
      );
      assert.equal(
        await frame.locator('[data-ring-skill-effect]').textContent(),
        resourceText(EMBLEMS[id].skill.text),
      );
      assert.equal(
        await frame.locator('canvas').evaluate(() => window.assetPreview.rings().selected),
        id,
      );
      await page.screenshot({ path: path.join(output, 'ring-' + id + '.png') });
    }
    const geometry = await frame
      .locator('canvas')
      .evaluate(() => window.assetPreview.rings().geometry);
    assert.deepEqual(
      geometry.map((ring) => ring.id),
      ids,
    );
    assert(geometry.every((ring) => ring.meshes <= 9 && ring.triangles > 20000));
    assert(
      geometry.every((ring) => Number.isFinite(ring.bore) && ring.bore >= 0.627),
      'No ornament may intrude into the finger opening',
    );
    assert(
      geometry.every((ring) => Number.isFinite(ring.crown) && ring.crown <= 1.1),
      'The crown stays outside the bore without an upright sign-like head',
    );
    assert.equal(new Set(geometry.map((ring) => ring.triangles)).size, 5);
    for (const id of ['wind-dance', 'tan-hongyu', 'kamui'])
      await frame.locator('[data-ring-id="' + id + '"]').click();
    await waitForSwitch();
    const rapid = await frame.locator('canvas').evaluate(() => window.assetPreview.rings());
    assert.equal(rapid.selected, 'kamui');
    assert.equal(rapid.models, 5, 'Rapid switching must reuse the five cached models');
    await frame.locator('.ring-gallery-owner').filter({ hasText: '未契约' }).waitFor();
    const before = await frame.locator('canvas').evaluate(() => window.assetPreview.rings());
    const bounds = await frame.locator('[data-ring-viewport]').boundingBox();
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + 70, bounds.y + bounds.height / 2 + 20, {
      steps: 5,
    });
    await page.mouse.up();
    await frame.locator('[data-ring-zoom="1"]').click();
    const after = await frame.locator('canvas').evaluate(() => window.assetPreview.rings());
    assert(after.yaw > before.yaw + 0.3);
    assert(after.zoom > before.zoom);
    await page.setViewportSize({ width: 844, height: 390 });
    await frame.locator('[data-ring-id="tan-hongyu"]').click();
    await waitForSwitch();
    const mobile = await frame.locator('.ring-gallery').evaluate((panel) => {
      return [
        ...panel.querySelectorAll(
          'header, nav, .ring-gallery-tools, .ring-gallery-caption, .ring-gallery-effects',
        ),
      ].map((el) => {
        const box = el.getBoundingClientRect();
        return {
          x: box.x,
          y: box.y,
          right: box.right,
          bottom: box.bottom,
          width: innerWidth,
          height: innerHeight,
        };
      });
    });
    assert(
      mobile.every(
        (rect) =>
          rect.x >= 0 &&
          rect.y >= 0 &&
          rect.right <= rect.width + 1 &&
          rect.bottom <= rect.height + 1,
      ),
    );
    await page.screenshot({ path: path.join(output, 'ring-mobile.png') });
    await frame.locator('[data-ring-id="wind-dance"]').click();
    await frame.locator('[data-ring-close]').click();
    await page.waitForFunction(() => !document.body.classList.contains('ring-cabinet-open'));
    assert.equal(
      await frame.locator('canvas').evaluate(() => window.assetPreview.rings().active),
      false,
    );
    await frame.locator('#emblem-open').click();
    await waitForSwitch();
    assert.equal(
      await frame.locator('canvas').evaluate(() => window.assetPreview.rings().models),
      5,
    );
    await frame.locator('[data-ring-equip]').click();
    await page.locator('#party-panel').waitFor({ state: 'visible' });
    await page.locator('#prepare-done').click();
    await frame.locator('canvas').evaluate(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal(await frame.locator('.ring-gallery').count(), 0);
    assert.equal(await frame.locator('canvas').evaluate(() => window.modelReady), false);
    assert.deepEqual(errors, []);
    return {
      uniqueModels: geometry,
      emptyFateDesk: true,
      translucentInnBackdrop: true,
      noExtraIntroduction: true,
      animatedRapidSwitch: true,
      ownedStateFromSave: true,
      dragAndZoom: true,
      mobileContained: true,
      sameRenderer: true,
      disposed: true,
    };
  } finally {
    await page.close();
  }
}
