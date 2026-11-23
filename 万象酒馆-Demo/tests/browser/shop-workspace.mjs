import assert from 'node:assert/strict';
import path from 'node:path';
import { newCampaign } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { grantGem, normalizeEquipment } from '../../src/equipment.js';
import { ITEMS } from '../../src/content/items.js';
import { legacySession } from './legacy-session.mjs';

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
  grantGem(library, 'gem-valor-shard', 'test-gem-1');
  grantGem(library, 'gem-wind-agate', 'test-gem-2');
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
    await openLedger(page, '#ledger-shop-open');

    const shop = page.locator('#void-shop');
    const rail = page.locator('#shop-categories');
    await assertPaneOrder(page, '#shop-categories', '.shop-workspace');
    await rail.hover();
    await page.mouse.wheel(0, 600);
    await page.waitForFunction(() => document.querySelector('#shop-categories').scrollTop > 0);
    await page.locator('[data-shop-category="confusion"]').click();
    await page.locator('[data-shop-item="fine-confusion-potion"]').click();
    assert.equal(await page.locator('#shop-detail h3').textContent(), '优质混乱药水');
    const icon = page.locator('#shop-detail .shop-art img');
    await icon.evaluate((image) => image.decode());
    assert((await icon.getAttribute('src')).endsWith('/fine-confusion-potion.svg'));
    await shop.screenshot({ path: path.join(output, 'shop-desktop.png') });

    await page.setViewportSize({ width: 844, height: 390 });
    await assertPaneOrder(page, '#shop-categories', '.shop-workspace');
    await page.locator('[data-shop-category="flying"]').click();
    await shop.screenshot({ path: path.join(output, 'shop-mobile.png') });
    const gold = await page.evaluate(() => demo.getLibrary().inventory.gold);
    await page.locator('#shop-detail [data-buy="flying-scroll"]').click();
    assert.equal(
      await page.evaluate(() => demo.getLibrary().inventory.gold),
      gold - ITEMS['flying-scroll'].price,
    );
    await page.locator('[data-shop-department="ingredients"]').click();
    assert(await rail.isHidden());
    await page.locator('#shop-close').click();

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
    const actions = page.locator('#forge-catalog .forge-detail-actions');
    await actions.locator('[data-buy-equipment]').click();
    await page.waitForFunction(() =>
      demo.getLibrary().equipment.owned.some((entry) => entry.templateId === 'test-rare-sword'),
    );
    await actions.locator('[data-add-affix]').click();
    await actions.locator('[data-refresh-affix]').waitFor();
    const affix = page.locator('.forge-affix-card');
    const affixName = await affix.locator('summary strong').textContent();
    assert(
      (await page.locator('.forge-item-title h3').textContent()).includes(`精铸长剑·${affixName}`),
    );
    assert(await affix.locator('.forge-affix-details').isHidden());
    const instance = page.locator('.forge-instance-card').first();
    assert(await instance.locator('[data-reforge-instance]').isHidden());
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
    await instance.locator('summary').click();
    assert(await instance.locator('[data-reforge-instance]').isVisible());
    await favorite.click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-forge-favorite="test-rare-sword"]')
          ?.getAttribute('aria-pressed') === 'false',
    );
    assert(await instance.locator('[data-reforge-instance]').isVisible());
    await forge.screenshot({ path: path.join(output, 'equipment-expanded.png') });
    await actions.locator('[data-refresh-affix]').click();
    await page.locator('.equipment-feedback-cancel').click();

    await page.setViewportSize({ width: 844, height: 390 });
    await assertPaneOrder(page, '#forge-list', '#forge-catalog');
    await page.locator('[data-forge-select="test-armor"]').click();
    await page.locator('[data-forge-select="test-rare-sword"]').click();
    assert(await affix.locator('.forge-affix-details').isHidden());
    await forge.screenshot({ path: path.join(output, 'equipment-mobile.png') });
    await page.locator('[data-forge-select="gem-wind-agate"]').click();
    assert.equal(await actions.locator('[data-buy-equipment]').count(), 0);
    assert(await actions.locator('[data-add-affix]').isVisible());
    assert.deepEqual(errors, []);
    return {
      scrollingCategories: true,
      purchase: true,
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
