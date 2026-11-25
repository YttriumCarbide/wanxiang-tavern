import assert from 'node:assert/strict';
import path from 'node:path';
import { travelTownScene } from './town-navigation.mjs';
import { legacySession } from './legacy-session.mjs';
import { newCampaign } from '../../src/campaign.js';
import { officialCharacter } from '../../src/ai/library.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { DRAGON_EMBLEM_ID, EMBLEMS, OVERLOAD_EMBLEM_ID } from '../../src/emblems.js';
import { ITEMS } from '../../src/content/items.js';
import { normalizeEquipment } from '../../src/equipment.js';
import { LEARNABLE_SKILLS } from '../../src/content/learnable-skills.js';
import { openCityDirectory } from './town-navigation.mjs';

export async function statusEmblemChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  const startupErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && startupErrors.length < 12) startupErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && startupErrors.length < 24)
      startupErrors.push(`${response.status()} ${response.url()}`);
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await legacySession(page);
  try {
    await page.goto(baseURL);
    await page.waitForFunction(
      () =>
        !!window.demo ||
        document.querySelector('.storage-notice')?.textContent.startsWith('游戏启动失败'),
    );
    const startupFailure = await page.locator('.storage-notice').allTextContents();
    assert(
      !startupFailure.some((text) => text.startsWith('游戏启动失败')),
      startupFailure.join('\n'),
    );
    const library = newCampaign(defaultProtagonist());
    Object.assign(library.campaign, {
      completed: true,
      firstRecruit: true,
      tutorial: 'done',
      tasks: { equipmentIntro: true },
    });
    Object.assign(library.progression, {
      pandoraJoined: true,
      swapLesson: 'done',
      emblemLesson: 'done',
    });
    library.characters.push(officialCharacter('aegis'), officialCharacter('pandora'));
    library.party[2] = 'official-aegis';
    library.party[3] = 'official-pandora';
    library.characters[0].growth.level = 4;
    library.emblems = Object.keys(EMBLEMS);
    library.unlockedDungeons = ['ruins'];
    library.inventory.gold = 500;
    library.guild = { merit: 100, completedBounties: 1, sparringWins: 0, unlockedIntel: [] };
    library.inventory.bagUnlocked = true;
    library.inventory.items = Object.fromEntries(Object.keys(ITEMS).map((id) => [id, 2]));
    const categories = ['weapon', 'armor', 'pendant'];
    for (let slot = 0; slot < 3; slot++) {
      library.equipment.catalog.push(
        normalizeEquipment(
          {
            name: '测试装备' + slot,
            category: categories[slot],
            description: 'hp+1',
            stats: { hp: 1 },
            rules: [],
          },
          { id: 'browser-gear-' + slot, name: '残片', value: 10 },
        ),
      );
      library.equipment.owned.push({
        id: 'browser-owned-' + slot,
        templateId: 'browser-gear-' + slot,
      });
    }
    await page.evaluate(async (library) => {
      const { openDatabase } = await import('/src/storage/database.js');
      const { applyGeneratedReset } = await import('/src/app/generated-reset.js');
      const db = await openDatabase();
      const flags = new Map();
      applyGeneratedReset({
        getItem: (key) => flags.get(key),
        setItem: (key, value) => flags.set(key, value),
      });
      await db.write([
        ...[...flags].map(([key, value]) => ['game.' + key, value]),
        ['game.wanxiang.worldbooks.v1', JSON.stringify(library)],
        ['game.wanxiang.creation-pending.v1', 'false'],
        ['game.wanxiang.setup.completed.v1', 'true'],
        [
          'game.wanxiang.generation-options.v1',
          JSON.stringify({
            developerMode: true,
            allowRetreat: true,
            protagonistApi: false,
            scriptApi: false,
          }),
        ],
      ]);
      db.close();
    }, library);
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('canvas').evaluate(
      () =>
        new Promise((resolve) => {
          const check = () => (window.modelReady ? resolve() : requestAnimationFrame(check));
          check();
        }),
    );
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('streetDoor'));
    await frame.locator('#street-open').click();
    await page.locator('[data-tavern-exit="city-center"]').click();
    await page.waitForFunction(() =>
      [...document.querySelectorAll('#inn-frame iframe')].some(
        (el) => el.contentWindow?.streetPreview,
      ),
    );
    const directory = await openCityDirectory(page);
    await directory.locator('[data-city-facility="guild"]').click();
    await page.locator('#guild-dialog[open]').waitFor();
    await page.locator('#guild-dialog [data-guild-tab="skills"]').click();
    assert.equal(await page.locator('#guild-dialog .guild-card').count(), 18);
    await page.locator('#guild-dialog [data-guild-learn="uni-smoke-veil"]').click();
    await page.waitForFunction(() =>
      window.demo.getLibrary().learnedSkills?.includes('uni-smoke-veil'),
    );
    await page.screenshot({ path: path.join(output, 'stage3-guild-grimoire.png') });
    await page.locator('#guild-dialog [data-guild-tab="intel"]').click();
    await page.locator('#guild-dialog [data-guild-intel]').first().click();
    await page.locator('#guild-dialog [data-guild-map]').first().click();
    const atlas = frame.locator('#street-map');
    await atlas.waitFor({ state: 'visible' });
    await atlas.getByRole('button', { name: '关闭地图', exact: true }).click();
    await page.locator('#ledger-handle').press('Enter');
    await page.locator('#ledger-drawer-host.is-open #party-toggle').click();
    await page.locator('#party-panel[open] [data-prepare-buy]').click();
    await page.locator('#void-shop[open][data-shop-mode="preparation"]').waitFor();
    const addedSupplies = { artifact: 2, confusion: 2, blind: 2, cleanse: 1, flying: 1 };
    for (const [category, count] of Object.entries(addedSupplies)) {
      await page.locator(`[data-shop-category="${category}"]`).click();
      assert.equal(await page.locator('[data-shop-item]').count(), count);
    }
    const beforePurchase = await page.evaluate(() => window.demo.getLibrary().inventory);
    await page.locator('[data-buy="flying-scroll"]').click();
    await page.locator('#shop-status').filter({ hasText: '+1' }).waitFor();
    const purchased = await page.evaluate(() => window.demo.getLibrary().inventory);
    assert.equal(purchased.items['flying-scroll'], beforePurchase.items['flying-scroll'] + 1);
    assert.equal(purchased.gold, beforePurchase.gold - ITEMS['flying-scroll'].price);
    await page.locator('#shop-close').click();
    await page.locator('#party-panel #prepare-close').click();
    await page.locator('#party-panel[open]').waitFor({ state: 'detached' });
    const openLedger = page.locator('#ledger-drawer-host.is-open');
    if (await openLedger.count()) await openLedger.locator('#ledger-close').click();
    await page.locator('#ledger-drawer-host').waitFor({ state: 'hidden' });
    await travelTownScene(page, 'tavern');
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow?.assetPreview &&
        window.modelReady !== false,
    );
    await frame.locator('canvas').evaluate(
      () =>
        new Promise((resolve) => {
          const check = () => (window.modelReady ? resolve() : requestAnimationFrame(check));
          check();
        }),
    );
    const handle = await page.locator('#ledger-handle').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(Math.max(10, handle.x - 140), handle.y + handle.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await page.locator('#ledger-drawer-host.is-open').waitFor();
    await page.locator('#party-toggle').click();
    await page.locator('[data-prepare-slot="0"]').click();
    for (let slot = 0; slot < 3; slot++)
      await page.locator(`[data-equipment-slot="${slot}"]`).selectOption('browser-owned-' + slot);
    await page.locator('[data-emblem-character]').selectOption(OVERLOAD_EMBLEM_ID);
    await page.locator('[data-prepare-tab="skill"]').click();
    assert(
      (await page.locator('.prepare-universal-bar').innerText()).includes(
        `3/${LEARNABLE_SKILLS.length}`,
      ),
    );
    await page.locator('[data-universal-skill-slot="0"]').selectOption('uni-feint-retreat');
    await page.locator('[data-universal-skill-slot="1"]').selectOption('uni-serrated-cut');
    assert((await page.locator('.prepare-skills-grid').innerText()).includes('特技'));
    await page.screenshot({ path: path.join(output, 'stage3-prep-skills.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileBox = await page.locator('#party-panel').boundingBox();
    assert(
      mobileBox.x >= 0 && mobileBox.x + mobileBox.width <= 391,
      'Mobile preparation panel fits cleanly without overflow',
    );
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.locator('[data-prepare-slot="1"]').click();
    await page.locator('[data-prepare-tab="skill"]').click();
    await page.locator('[data-universal-skill-slot="0"]').selectOption('uni-smoke-veil');
    await page.locator('[data-prepare-slot="3"]').click();
    await page.locator('[data-prepare-tab="status"]').click();
    await page.locator('[data-emblem-character]').selectOption(DRAGON_EMBLEM_ID);
    await page.evaluate(() => window.demo.flushStorage());
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    const saved = await page.evaluate(() => window.demo.getLibrary());
    assert.deepEqual(saved.characters[0].equipment, [
      'browser-owned-0',
      'browser-owned-1',
      'browser-owned-2',
      null,
    ]);
    assert.deepEqual(saved.characters[0].equippedSkills, ['uni-feint-retreat', 'uni-serrated-cut']);
    assert.equal(saved.characters[0].emblemId, OVERLOAD_EMBLEM_ID);
    assert.deepEqual([...saved.emblems].sort(), Object.keys(EMBLEMS).sort());
    const reloadHandle = await page.locator('#ledger-handle').boundingBox();
    await page.mouse.move(
      reloadHandle.x + reloadHandle.width / 2,
      reloadHandle.y + reloadHandle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      Math.max(10, reloadHandle.x - 140),
      reloadHandle.y + reloadHandle.height / 2,
      { steps: 6 },
    );
    await page.mouse.up();
    await page.locator('#ledger-drawer-host.is-open').waitFor();
    await page.locator('#party-toggle').click();
    await page.locator('[data-prepare-slot="0"]').click();
    assert.equal(await page.locator('[data-emblem-character]').inputValue(), OVERLOAD_EMBLEM_ID);
    await page.screenshot({ path: path.join(output, 'equipment-after-static-reload.png') });
    await page.locator('#prepare-close').click();
    await page.locator('#party-panel[open]').waitFor({ state: 'detached' });
    await openLedger.locator('#ledger-close').click();
    await page.locator('#ledger-drawer-host').waitFor({ state: 'hidden' });
    await page.evaluate(() => window.demo.startBattle());
    await page.locator('#destination-regions button[data-region="ruins"]').click();
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-start').click();
    await page.getByRole('button', { name: '确认编队 · 开始生成', exact: true }).click();
    await page.getByRole('button', { name: '整备完成 · 出发', exact: true }).click();
    await page.waitForFunction(
      () => window.demo.getStatus().mode === 'battle' && !window.demo.getStatus().animating,
    );
    assert.equal(await page.locator('.battle-character-level').textContent(), 'Lv.4');
    for (const viewport of [
      { width: 1440, height: 836 },
      { width: 960, height: 480 },
    ]) {
      await page.setViewportSize(viewport);
      await page.locator('#backpack-open').click();
      await page.locator('#backpack-dialog.expanded').waitFor({ state: 'visible' });
      await finishPanelAnimation(page, '#backpack-dialog');
      assert.equal(await page.locator('#backpack-dialog header,#backpack-close').count(), 0);
      assert.equal(
        await page.locator('#backpack-items .bag-item').count(),
        Object.keys(ITEMS).length,
      );
      const layout = await page.locator('#backpack-dialog').evaluate((panel) => {
        const outer = panel.getBoundingClientRect(),
          inner = panel.querySelector('#backpack-items').getBoundingClientRect();
        return {
          left: outer.left,
          right: outer.right,
          leftGutter: inner.left - outer.left,
          rightGutter: outer.right - inner.right,
        };
      });
      assert(layout.left >= 0 && layout.right <= viewport.width);
      assert(Math.abs(layout.leftGutter - layout.rightGutter) < 1);
      await page.screenshot({ path: path.join(output, `compact-bag-${viewport.width}.png`) });
      await page.locator('#stage canvas').click({ position: { x: 10, y: 10 } });
      assert.equal(await page.locator('#backpack-dialog').getAttribute('inert'), '');
      assert.equal(await page.locator('#backpack-open').getAttribute('aria-expanded'), 'false');
    }
    await page.setViewportSize({ width: 1440, height: 836 });
    if ((await page.locator('#speed').textContent()).includes('×1')) {
      await page.locator('#speed').click();
    }
    for (let round = 0; round < 4; round++) {
      await page.waitForFunction(() => !window.demo.getStatus().animating);
      await page.locator('#commit').click();
      await page.waitForFunction(
        () => !window.demo.getStatus().playing && !window.demo.getStatus().animating,
        { timeout: 30000 },
      );
    }
    const stateAfterCharge = await page.evaluate(() => window.demo.getState());
    const edithId = stateAfterCharge.formation[1];
    const pandoraId = stateAfterCharge.formation[3];
    assert(edithId && pandoraId, 'Front slot 1 and rear slot 3 heroes exist in battle formation');
    assert.equal(stateAfterCharge.units[pandoraId].emblemCharge, 6);
    await page.locator(`[data-unit="${edithId}"]`).click();
    assert.equal(
      (
        await page.locator('[data-skill="uni-smoke-veil"] .universal-skill-source').textContent()
      )?.trim(),
      '特技',
    );
    await page.locator('[data-skill="uni-smoke-veil"]').click();
    if ((await page.evaluate(() => window.demo.getStatus())).interactionStep === 'target') {
      await page.locator('[data-side="Enemy"]').first().click();
    }
    await page.locator('#commit').click();
    await page.waitForFunction(
      () => !window.demo.getStatus().playing && !window.demo.getStatus().animating,
      { timeout: 30000 },
    );
    assert(
      (await page.evaluate(() => window.demo.getVfxStatus()?.recentEffects || [])).includes(
        'leaf-storm',
      ),
      'Casting uni-smoke-veil triggers leaf-storm PixelFX',
    );
    assert.equal(
      (await page.evaluate(() => window.demo.getState())).formation[1],
      pandoraId,
      'retreatSwap brings rear slot 3 hero into slot 1',
    );
    await page.locator(`[data-unit="${pandoraId}"]`).click();
    await page.locator(`[data-unit="${pandoraId}"]`).click();
    assert.equal(
      await page.locator(`.unit-hit[data-unit="${pandoraId}"] .emblem-ring`).count(),
      1,
      'Kamui ring remains on the local battle card',
    );
    assert.equal(
      await page
        .locator(
          '#battle.emblem-active, #emblem-screen.active, dialog.emblem-skill-cinematic[open]',
        )
        .count(),
      0,
      'combined status stays local with no full-screen cinematic',
    );
    assert.equal(await page.evaluate(() => document.fullscreenElement), null);
    await page.waitForFunction(() => window.demo.getEmblemStatus()?.active >= 1, null, {
      timeout: 5000,
    });
    assert((await page.evaluate(() => window.demo.getEmblemStatus().styles))?.includes('kamui'));
    await page.locator('#commit').click();
    await page.waitForFunction(
      () => !window.demo.getStatus().playing && !window.demo.getStatus().animating,
      { timeout: 30000 },
    );
    assert(
      (await page.evaluate(() => window.demo.getVfxStatus()?.recentEffects || [])).includes(
        'geyser',
      ),
      'Engaging Kamui triggers geyser PixelFX',
    );
    await page.locator(`[data-unit="${pandoraId}"]`).click();
    await page.locator('[data-skill="emblem-dragon-vein"]').click();
    if ((await page.evaluate(() => window.demo.getStatus())).interactionStep === 'target') {
      await page.locator(`[data-unit="${pandoraId}"]`).click();
    }
    await page.locator('#commit').click();
    await page.waitForFunction(
      () => !window.demo.getStatus().playing && !window.demo.getStatus().animating,
      { timeout: 30000 },
    );
    assert.equal((await page.evaluate(() => window.demo.getState())).dragonVein, true);
    assert.equal(await page.evaluate(() => window.demo.getEmblemStatus()?.dragonVein), true);
    assert(
      (await page.evaluate(() => window.demo.getVfxStatus()?.recentEffects || [])).includes(
        'wave-crash',
      ),
      'Casting emblem-dragon-vein triggers wave-crash PixelFX',
    );
    await page.screenshot({ path: path.join(output, 'stage3-dragon-vein-battle.png') });

    assert.deepEqual(errors, []);
    // The real Overlord award and Gal dialogue are exercised in tests/browser/ring-acquisition.mjs.
    // This status-only flow does not claim boss reward dialogue coverage.
    return {
      staticEquipmentReload: true,
      allEmblemsRetained: true,
      currentLevel: true,
      symmetricBag: true,
      outsideDismiss: true,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'failure.png') });
    const diagnostics = [...errors, ...startupErrors];
    if (diagnostics.length)
      throw new Error(
        `${failure.stack || failure}\nBrowser diagnostics:\n${diagnostics.join('\n')}`,
        { cause: failure },
      );
    throw failure;
  } finally {
    await page.close();
  }
}

async function finishPanelAnimation(page, selector) {
  await page.locator(selector).evaluate(async (panel) => {
    await Promise.all(
      panel
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    );
  });
}
