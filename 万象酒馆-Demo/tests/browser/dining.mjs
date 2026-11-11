import assert from 'node:assert/strict';
import path from 'node:path';

export async function diningChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(baseURL + '/tests/fixtures/dining.html');
    await page.evaluate(async () => {
      const { newLibrary } = await import('/src/ai/library.js');
      const { createEventScope } = await import('/src/shared/events.js');
      const { createDining } = await import('/src/app/dining.js');
      const { createShop } = await import('/src/app/shop.js');
      const { createGalPlayer } = await import('/src/app/gal.js');
      const { createAssetStore } = await import('/src/shared/asset-store.js');
      const library = newLibrary();
      library.inventory.gold = 1000;
      for (const id of ['bread', 'cheese', 'milk', 'mushroom']) library.dining.inventory[id] = 4;
      library.dining.tutorial = 'done';
      const context = {
        session: { ai: { library, generationOptions: {} }, runtime: { mode: 'inn' } },
        events: createEventScope(),
        assets: createAssetStore(),
        generation: { save() {} },
        shell: { renderParty() {}, toast() {} },
        audio: { play() {} },
        onboarding: { refresh() {} },
        equipment: { refresh() {} },
        summoning: { refresh() {} },
      };
      let calls = 0;
      context.apiClient = {
        async request(_path, input, options) {
          calls++;
          if (calls === 1 || calls === 3) {
            options.onDelta('broken meal response');
            throw Object.assign(Error('餐桌返回格式不完整'), {
              diagnostic: { rawText: 'broken meal response' },
            });
          }
          window.mealPayload = input;
          return {
            content: '【对白:长景月汐】这份奶酪正合适。【旁白】大家把拼盘传到桌子中间。',
            actions: { affection: [{ id: library.party[0], delta: 5 }] },
          };
        },
      };
      context.gal = createGalPlayer(context);
      context.shop = createShop(context);
      context.dining = createDining(context);
      window.diningFixture = { context, library, calls: () => calls };
      context.dining.open('table');
    });
    await page.locator('[data-meal-food="cheese-board"]').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('.meal-portrait')].every(
        (image) => image.complete && image.naturalWidth > 0,
      ),
    );
    assert.equal(
      await page.locator('[data-meal-member][aria-pressed="true"] .meal-reaction').count(),
      3,
    );
    assert.match(await page.locator('[data-meal-food="hearth-stew"]').innerText(), /食材不足/);
    assert.match(await page.locator('[data-meal-food="cheese-board"]').innerText(), /可以制作/);
    const foodBounds = await page.locator('[data-meal-food="cheese-board"]').boundingBox();
    assert(foodBounds.width > 280, 'dish text has room beside its artwork');
    await page.screenshot({ path: path.join(output, 'dining-menu-desktop.png') });
    const yuexi = page.locator('[data-meal-member="official-aegis"]');
    const reactionBackground = () =>
      yuexi.locator('.meal-reaction').evaluate((element) => getComputedStyle(element).background);
    const neutral = await reactionBackground();
    await page.locator('[data-meal-food="apple-pie"]').click();
    assert.equal(await yuexi.locator('.meal-reaction').getAttribute('data-taste'), '喜欢');
    const liked = await reactionBackground();
    await page.locator('[data-meal-food="pepper-beef"]').click();
    assert.equal(
      await yuexi.locator('.meal-reaction').count(),
      1,
      'three dishes show one overall reaction',
    );
    assert.equal(
      await yuexi.locator('.meal-reaction').getAttribute('data-taste'),
      '一般',
      'liked and disliked dishes cancel out',
    );
    await page.screenshot({ path: path.join(output, 'dining-taste-reactions.png') });
    await page.locator('[data-meal-food="apple-pie"]').click();
    assert.equal(await yuexi.locator('.meal-reaction').getAttribute('data-taste'), '讨厌');
    assert.equal(new Set([neutral, liked, await reactionBackground()]).size, 3);
    await page.locator('[data-meal-food="pepper-beef"]').click();
    await page.locator('[data-meal-start]').click();
    for (let n = 0; n < 6; n++) await page.locator('[data-cook-tap]').click();
    await page.screenshot({ path: path.join(output, 'dining-cooking.png') });
    for (let n = 0; n < 3; n++) await page.locator('[data-cook-tap]').click();
    await page.locator('[data-meal-retry]').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.diningFixture.library.dining.inventory.bread), 4);
    await page.locator('[data-meal-raw]').click();
    assert.equal(
      await page.locator('#meal-raw-response textarea').inputValue(),
      'broken meal response',
    );
    await page.locator('#meal-raw-response button').click();
    await page.locator('[data-meal-retry]').click();
    await page.locator('#gal-stage').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.diningFixture.library.dining.inventory.bread), 3);
    assert.equal(await page.evaluate(() => window.diningFixture.calls()), 2);
    assert.equal(await page.evaluate(() => window.mealPayload.selected.length), 3);
    assert.equal(
      await page.evaluate(() => window.mealPayload.dining.preferences[0].preference),
      '一般',
    );
    assert.equal(
      await page.evaluate(() => 'tastes' in window.mealPayload.dining.preferences[0]),
      false,
    );
    await page.locator('[data-gal="close"]').click();
    await page.locator('[data-meal-leave]').click();
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => {
      window.diningFixture.library.dining.eatenCycle = -1;
      window.diningFixture.context.dining.open('bar');
    });
    await page.locator('[data-meal-food="milk"]').click();
    const reaction = await page
      .locator('[data-meal-member][aria-pressed="true"] .meal-reaction')
      .first()
      .innerText();
    assert.match(reaction, /这一桌/);
    assert.match(reaction, /喜欢|一般|讨厌/);
    const startBounds = await page.locator('[data-meal-start]').boundingBox();
    assert(startBounds.y + startBounds.height <= 391, 'mobile confirmation remains on screen');
    const menuBounds = await page.locator('[data-meal-foods]').boundingBox();
    assert(
      menuBounds.width > 760 && menuBounds.height > 50,
      'mobile menu uses the available width',
    );
    await page.screenshot({ path: path.join(output, 'dining-menu-mobile.png') });
    const bounds = await page.locator('#dining-dialog').boundingBox();
    assert(
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= 845 &&
        bounds.y + bounds.height <= 391,
    );
    await page.locator('[data-meal-start]').click();
    await page.locator('[data-meal-skip]').waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => window.diningFixture.library.dining.inventory.milk), 4);
    await page.locator('[data-meal-skip]').click();
    assert.equal(await page.evaluate(() => window.diningFixture.library.dining.inventory.milk), 3);
    await page.locator('[data-meal-leave]').click();
    await page.evaluate(() => {
      const { context } = window.diningFixture;
      context.dining.dispose();
      context.shop.dispose();
      context.gal.dispose();
      context.events.dispose();
      context.assets.dispose();
    });
    assert.deepEqual(errors, []);
    return {
      cooking: true,
      retryWithoutDoubleCharge: true,
      rawReturn: true,
      threeDiners: true,
      mobile: true,
    };
  } finally {
    await page.close();
  }
}
