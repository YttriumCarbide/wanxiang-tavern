import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

export async function customizationChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await legacySession(page);
  try {
    await page.goto(baseURL);
    await page.locator('#party-toggle').click();
    await page.locator('[data-prepare-hero="official-aegis"]').click();
    await page.locator('.prepare-portrait-tools summary').click();
    await page.locator('[data-edit-portrait="official-aegis"]').click();
    await page
      .locator('#portrait-dialog input[type="file"]')
      .setInputFiles(path.join(process.cwd(), 'assets/portraits/edith.png'));
    await page.waitForFunction(
      () =>
        !!demo.getLibrary().characters.find((member) => member.id === 'official-aegis').combat
          .customPortrait,
    );
    const card = await page.evaluate(
      () =>
        demo.getLibrary().characters.find((member) => member.id === 'official-aegis').combat
          .customPortrait,
    );
    await page.locator('[data-portrait-kind="standing"]').click();
    await page
      .locator('#portrait-dialog input[type="file"]')
      .setInputFiles(path.join(process.cwd(), 'assets/tavern-visitors/edith-full-v1.png'));
    await page.waitForFunction(
      () =>
        !!demo.getLibrary().characters.find((member) => member.id === 'official-aegis').combat
          .customStanding,
    );
    const standing = await page.evaluate(
      () =>
        demo.getLibrary().characters.find((member) => member.id === 'official-aegis').combat
          .customStanding,
    );
    assert.notEqual(card, standing);
    await page.setViewportSize({ width: 844, height: 390 });
    const box = await page.locator('#portrait-dialog').boundingBox();
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= 845 && box.y + box.height <= 391);
    await page.screenshot({ path: path.join(output, 'dual-portrait-mobile.png') });
    await page.locator('#portrait-url-close').click();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    const restored = await page.evaluate(
      () => demo.getLibrary().characters.find((member) => member.id === 'official-aegis').combat,
    );
    assert.equal(restored.customPortrait, card);
    assert.equal(restored.customStanding, standing);
    await page.locator('#ai-open').click();
    await page.locator('#ai-worldbooks').click();
    await page.locator('#world-category').selectOption('character');
    const characterNames = await page
      .locator('[data-world-head="comment"]')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    assert(characterNames.length > 0 && characterNames.every((name) => /^角色条目：/.test(name)));
    await page.locator('#world-category').selectOption('monster');
    const monsters = await page
      .locator('[data-world-head="comment"]')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    assert(
      monsters.some((name) => ['晶背甲虫', '怪物图鉴：晶背甲虫'].includes(name)),
      'the crystal beetle belongs to the monster category',
    );
    await page.locator('#world-category').selectOption('official-dungeon');
    const officialDungeons = await page
      .locator('[data-world-head="comment"]')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    assert(officialDungeons.some((name) => name.includes('月痕古林')));
    assert(officialDungeons.every((name) => name.startsWith('官设副本')));
    await page.locator('#world-category').selectOption('general');
    const general = await page
      .locator('[data-world-head="comment"]')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    assert(general.includes('天蚀 · 黑龙'));
    assert(!general.some((name) => name.startsWith('官设副本')));
    await page.locator('[data-world-format="script"]').click();
    assert(
      await page.locator('[data-world-field="content"]').isVisible(),
      'format links switch the display category when necessary',
    );
    await page.screenshot({ path: path.join(output, 'worldbook-categories-mobile.png') });
    await page.locator('#world-close').click();
    assert.deepEqual(errors, []);
    return {
      independentCardAndStanding: true,
      persisted: true,
      mobile: true,
      displayOnlyCategories: true,
    };
  } finally {
    await page.close();
  }
}
