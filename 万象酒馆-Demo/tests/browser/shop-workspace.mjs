import assert from 'node:assert/strict';
import path from 'node:path';
import { openCityFacility } from './city-facility.mjs';
import { newCampaign } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { grantGem, normalizeEquipment } from '../../src/equipment.js';
import { ITEMS } from '../../src/content/items.js';
import { INGREDIENTS } from '../../src/content/dining.js';
import { legacySession } from './legacy-session.mjs';
import { travelTownScene } from './town-navigation.mjs';

function artworkFixture() {
  const library = newCampaign(defaultProtagonist());
  library.campaign.completed = true;
  library.campaign.firstRecruit = true;
  library.campaign.tutorial = 'done';
  library.inventory.gold = 500;
  library.inventory.ether = 10000;
  library.equipment.catalog = [
    ['test-sword', '铁制长剑', 'weapon', 'common'],
    ['test-rare-sword', '精铸长剑', 'weapon', 'rare'],
    ['test-armor', '轻型护甲', 'armor', 'uncommon'],
    ['test-pendant', '护身挂坠', 'pendant', 'epic'],
  ].map(([id, name, category, quality]) =>
    normalizeEquipment(
      { name, description: '', category, quality, stats: { hp: 3 }, rules: [] },
      { id, name, category, quality, value: 20 },
    ),
  );
  library.equipment.affixesByTemplate['test-rare-sword'] = { id: 'affix-offense', quality: 'rare' };
  grantGem(library, 'gem-valor-shard', 'test-gem-1');
  grantGem(library, 'gem-wind-agate', 'test-gem-2');
  library.dining.stock = [{ id: 'bread', left: 2 }];
  library.dining.inventory.cheese = 1;
  return library;
}

async function openLedger(page, selector) {
  await page.locator('#ledger-handle').press('Enter');
  await page.locator('#ledger-drawer-host.is-open').waitFor();
  await page.locator(selector).click();
}

async function assertPaneOrder(page, left, right) {
  const first = await page.locator(left).boundingBox();
  const second = await page.locator(right).boundingBox();
  assert(first && second);
  assert(first.x + first.width <= second.x + 1, 'The right pane begins after the left rail');
}

async function selectPotionCategory(rail, id) {
  await rail.locator(`[data-shop-category="${id}"]`).click();
  const selected = await rail
    .locator('[data-shop-category][aria-pressed="true"]')
    .evaluateAll((buttons) => buttons.map((button) => button.dataset.shopCategory));
  assert.deepEqual(selected, [id], `Click must select the ${id} vending category`);
}

async function assertMarketSurface(page) {
  const market = page.locator('#market-surface');
  const machine = page.locator('#supply-surface');
  assert(await market.isVisible());
  assert(await machine.isHidden());
  const layout = await market.evaluate((surface) => {
    const shelves = surface.querySelector('#market-items');
    const counter = surface.querySelector('#market-counter');
    return {
      surface: getComputedStyle(surface).display,
      shelves: getComputedStyle(shelves).display,
      counter: getComputedStyle(counter).display,
      counterBelowShelves:
        shelves.getBoundingClientRect().bottom <= counter.getBoundingClientRect().top + 1,
    };
  });
  assert.equal(layout.surface, 'grid');
  assert.equal(layout.shelves, 'grid');
  assert.equal(layout.counter, 'grid');
  assert(layout.counterBelowShelves, 'Market counter must be a separate service surface');
}

async function assertVendingSurface(page) {
  const market = page.locator('#market-surface');
  const machine = page.locator('#supply-surface');
  assert(await market.isHidden());
  assert(await machine.isVisible());
  const layout = await machine.evaluate((surface) => {
    const category = surface.querySelector('#shop-categories');
    const machine = surface.querySelector('.shop-machine');
    const slots = machine.querySelector('#shop-items');
    const pickup = machine.querySelector('#shop-detail');
    return {
      surface: getComputedStyle(surface).display,
      machine: getComputedStyle(machine).display,
      categoryAboveMachine:
        category.getBoundingClientRect().bottom <= machine.getBoundingClientRect().top + 1,
      slotsSeparate:
        innerWidth <= 680
          ? slots.getBoundingClientRect().bottom <= pickup.getBoundingClientRect().top + 1
          : slots.getBoundingClientRect().right <= pickup.getBoundingClientRect().left + 1,
    };
  });
  assert.equal(layout.surface, 'flex');
  assert.equal(layout.machine, 'grid');
  assert(layout.categoryAboveMachine, 'Machine categories remain outside the vending cabinet');
  assert(layout.slotsSeparate, 'Vending slots and pickup tray have distinct positions');
}

export async function shopWorkspaceChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await legacySession(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => Boolean(window.demo));
    await page.evaluate(async (library) => {
      const { openDatabase } = await import('/src/storage/database.js');
      const { applyGeneratedReset } = await import('/src/app/generated-reset.js');
      const database = await openDatabase();
      const flags = new Map();
      applyGeneratedReset({
        getItem: (key) => flags.get(key),
        setItem: (key, value) => flags.set(key, value),
      });
      await database.write([
        ...[...flags].map(([key, value]) => ['game.' + key, value]),
        ['game.wanxiang.worldbooks.v1', JSON.stringify(library)],
        ['game.wanxiang.creation-pending.v1', 'false'],
        ['game.wanxiang.setup.completed.v1', 'true'],
        [
          'game.wanxiang.generation-options.v1',
          JSON.stringify({ developerMode: true, protagonistApi: false, scriptApi: false }),
        ],
      ]);
      database.close();
    }, artworkFixture());
    await page.reload();
    await page.waitForFunction(() => Boolean(window.demo));
    await openCityFacility(page, 'market');
    const shop = page.locator('#void-shop');
    await shop.and(page.locator('[open][data-shop-mode="market"]')).waitFor();
    const rail = shop.locator('#shop-categories');
    assert.equal(await shop.getAttribute('data-shop-mode'), 'market');
    assert(await rail.isHidden());
    await assertMarketSurface(page);
    assert.equal(await shop.locator('[data-shop-item], [data-buy]').count(), 0);
    assert.equal(await shop.locator('[data-food-select]').count(), 2);
    const ingredient = shop.locator('[data-food-select="bread"]');
    await ingredient.click();
    assert.equal(await shop.locator('#market-counter h3').textContent(), INGREDIENTS.bread.name);
    const foodTradeState = () =>
      page.evaluate(() => {
        const { inventory, dining } = demo.getLibrary();
        return { inventory, food: dining.inventory, stock: dining.stock };
      });
    const beforeFood = await foodTradeState();
    await shop.locator('[data-food-buy="bread"]').click();
    await shop.locator('#shop-status').filter({ hasText: '+1' }).waitFor();
    const afterFood = await foodTradeState();
    assert.deepEqual(afterFood, {
      inventory: {
        ...beforeFood.inventory,
        gold: beforeFood.inventory.gold - INGREDIENTS.bread.price,
      },
      food: { ...beforeFood.food, bread: beforeFood.food.bread + 1 },
      stock: [{ id: 'bread', left: 1 }],
    });

    const cheese = shop.locator('[data-food-select="cheese"]');
    await cheese.click();
    assert.equal(await cheese.getAttribute('aria-pressed'), 'true');
    assert(await shop.locator('[data-food-buy="cheese"]').isDisabled());
    const expectedProceeds = Math.floor(INGREDIENTS.cheese.price * 0.6);
    assert.match(
      await cheese.locator('.market-stall-price').innerText(),
      new RegExp('回收\\s*' + expectedProceeds + '\\b'),
      'the carried-food stall shows its resale value, not the purchase price',
    );
    await shop.locator('[data-food-sell="cheese"]').click();
    await shop
      .locator('#shop-status')
      .filter({ hasText: '金币 +' + expectedProceeds })
      .waitFor();
    assert.deepEqual(await foodTradeState(), {
      ...afterFood,
      inventory: { ...afterFood.inventory, gold: afterFood.inventory.gold + expectedProceeds },
      food: { ...afterFood.food, cheese: 0 },
    });
    assert.equal(await cheese.count(), 0);
    assert.equal(await shop.locator('[data-buy], [data-shop-item]').count(), 0);
    assert.equal(await shop.locator('.market-stall').count(), 1);
    await shop.screenshot({ path: path.join(output, 'market-desktop.png') });
    await shop.locator('#shop-close').click();
    await shop.waitFor({ state: 'hidden' });

    await travelTownScene(page, 'tavern');
    assert.equal(await page.locator('#ledger-shop-open').textContent(), '药剂售货机');
    const tavernFrame = page.frameLocator('#inn-frame iframe');
    await tavernFrame.locator('canvas').evaluate(() => window.assetPreview.placeNow('supplies'));
    await tavernFrame.locator('#condenser-open').waitFor({ state: 'visible' });
    await tavernFrame.locator('#vending-open').click();
    await shop.and(page.locator('[open][data-shop-mode="vending"]')).waitFor();
    await shop.locator('#shop-close').click();
    await shop.waitFor({ state: 'hidden' });
    await openLedger(page, '#ledger-shop-open');
    await shop.and(page.locator('[open][data-shop-mode="vending"]')).waitFor();
    assert.equal(await shop.getAttribute('data-shop-mode'), 'vending');
    assert.equal(await shop.locator('#market-title').textContent(), '药剂售货机');
    await assertVendingSurface(page);
    assert.equal(
      await shop.locator('[data-food-select], [data-food-buy], [data-food-sell]').count(),
      0,
    );
    assert.equal(
      await shop
        .locator(
          '[data-shop-category="flying"], [data-shop-category="blind"], [data-shop-category="cleanse"]',
        )
        .count(),
      0,
    );
    await selectPotionCategory(rail, 'confusion');
    const fineConfusion = shop.locator('[data-shop-item="fine-confusion-potion"]');
    assert(await fineConfusion.isVisible(), 'Confusion category must show its fine potion');
    await fineConfusion.click();
    assert.equal(
      await shop.locator('[data-shop-item="fine-confusion-potion"][aria-pressed="true"]').count(),
      1,
      'Click must select the fine confusion potion',
    );
    assert.equal(await shop.locator('#shop-detail h3').textContent(), '优质混乱药水');
    const icon = shop.locator('#shop-detail .shop-art img');
    await icon.evaluate((image) => image.decode());
    assert((await icon.getAttribute('src')).endsWith('/fine-confusion-potion.svg'));
    await shop.screenshot({ path: path.join(output, 'vending-desktop.png') });

    await page.setViewportSize({ width: 390, height: 844 });
    await assertVendingSurface(page);
    const mobileCategoryRail = page.locator('#shop-categories');
    assert(await mobileCategoryRail.evaluate((node) => node.scrollWidth > node.clientWidth));
    await mobileCategoryRail.evaluate((node) => (node.scrollLeft = node.scrollWidth));
    await page.waitForFunction(() => document.querySelector('#shop-categories').scrollLeft > 0);
    await selectPotionCategory(rail, 'mana');
    const manaSlot = shop.locator('[data-shop-item="mana-potion"]');
    await manaSlot.press('Enter');
    assert.equal(await manaSlot.getAttribute('aria-pressed'), 'true');
    assert(await manaSlot.evaluate((button) => document.activeElement === button));
    const potionIds = await shop
      .locator('[data-shop-item]')
      .evaluateAll((rows) => rows.map((row) => row.dataset.shopItem));
    assert(potionIds.includes('mana-potion'), 'Mana category must show its regular potion');
    assert(
      potionIds.every((id) => id.endsWith('-potion')),
      'Vending must only show potions',
    );
    const buyMana = shop.locator('[data-buy="mana-potion"]:enabled');
    assert(await buyMana.isVisible(), 'The selected mana potion must be available to buy');
    await shop.screenshot({ path: path.join(output, 'vending-mobile.png') });
    const potionState = () =>
      page.evaluate(() => {
        const { gold, items } = demo.getLibrary().inventory;
        return { gold, quantity: items['mana-potion'] || 0 };
      });
    const beforePotion = await potionState();
    await buyMana.click();
    await shop.locator('#shop-status').filter({ hasText: '+1' }).waitFor();
    assert.deepEqual(await potionState(), {
      gold: beforePotion.gold - ITEMS['mana-potion'].price,
      quantity: beforePotion.quantity + 1,
    });
    await shop.locator('#shop-close').click();
    await shop.waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1280, height: 800 });
    await openLedger(page, '#ledger-condenser-open');
    await page.locator('[data-forge-page="exchange"]').click();
    await page.locator('[data-forge-select="test-rare-sword"]').click();
    await assertPaneOrder(page, '#forge-list', '#forge-catalog');
    const settings = page.getByRole('button', { name: '造物 API 设置' });
    assert.equal(await settings.locator('svg').count(), 1);
    assert(await page.locator('.forge-toolbar').isHidden());
    await settings.click();
    await page.locator('#ai-dialog[open]').waitFor();
    await page.keyboard.press('Escape');
    await openLedger(page, '#ledger-condenser-open');
    await page.locator('[data-forge-page="exchange"]').click();
    await page.locator('[data-forge-select="test-rare-sword"]').click();
    const artwork = await page
      .locator('#forge-list .equipment-art')
      .evaluateAll((icons) => icons.map((icon) => icon.innerHTML));
    assert.equal(new Set(artwork).size, 6);
    const forge = page.locator('#ether-forge');
    assert.equal(await forge.locator('#forge-catalog #forge-redeem').count(), 0);
    await forge.locator('#forge-redeem').click();
    await page.waitForFunction(() =>
      demo.getLibrary().equipment.owned.some((entry) => entry.templateId === 'test-rare-sword'),
    );
    const affix = page.locator('.forge-affix-card');
    const affixName = await affix.locator('summary strong').textContent();
    assert(
      (await page.locator('.forge-item-title h3').textContent()).includes(`精铸长剑·${affixName}`),
    );
    assert(await affix.locator('.forge-affix-details').isHidden());
    const dismantle = forge.locator('.forge-source-line [data-dismantle-instance]');
    assert(await dismantle.isVisible());
    assert.equal(await forge.locator('#forge-catalog [data-reforge-instance]').count(), 0);
    assert(await page.getByRole('button', { name: '删除此方案' }).isVisible());
    const favorite = page.locator('[data-forge-favorite="test-rare-sword"]');
    await favorite.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-forge-favorite="test-rare-sword"]')
          ?.getAttribute('aria-pressed') === 'true',
    );
    assert.equal(await favorite.getAttribute('aria-pressed'), 'true');
    await forge.screenshot({ path: path.join(output, 'equipment-desktop.png') });
    await affix.locator('summary').press('Enter');
    assert(await affix.locator('.forge-affix-details p').first().isVisible());
    assert.equal(await affix.locator('details').count(), 0);
    await favorite.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-forge-favorite="test-rare-sword"]')
          ?.getAttribute('aria-pressed') === 'false',
    );
    assert(await dismantle.isVisible());
    await forge.screenshot({ path: path.join(output, 'equipment-expanded.png') });

    await page.setViewportSize({ width: 844, height: 390 });
    await assertPaneOrder(page, '#forge-list', '#forge-catalog');
    await page.locator('[data-forge-select="test-armor"]').click();
    await page.locator('[data-forge-select="test-rare-sword"]').click();
    assert(await affix.locator('.forge-affix-details').isHidden());
    await forge.screenshot({ path: path.join(output, 'equipment-mobile.png') });
    await page.locator('[data-forge-select="gem-wind-agate"]').click();
    assert(await forge.locator('#forge-redeem').isHidden());
    assert(await dismantle.isVisible());
    assert.deepEqual(errors, []);
    return {
      scrollingCategories: true,
      marketIngredientPurchase: true,
      marketIngredientSale: true,
      ledgerPotionPurchase: true,
      variants: artwork.length,
      forgeActions: true,
    };
  } catch (error) {
    await page
      .screenshot({ path: path.join(output, 'failure.png'), timeout: 10000 })
      .catch(() => {});
    throw error;
  } finally {
    await page.close();
  }
}
