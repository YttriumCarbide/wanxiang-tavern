import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { legacySession } from './legacy-session.mjs';
import { newCampaign } from '../../src/campaign.js';
import { officialCharacter } from '../../src/ai/library.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { EMBLEMS, OVERLOAD_EMBLEM_ID } from '../../src/emblems.js';
import { ITEMS } from '../../src/content/items.js';
import { normalizeEquipment } from '../../src/equipment.js';

export async function statusEmblemChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await legacySession(page);
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    const library = newCampaign(defaultProtagonist());
    Object.assign(library.campaign, { completed: true, firstRecruit: true, tutorial: 'done' });
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
    library.inventory.bagUnlocked = true;
    library.inventory.items = Object.fromEntries(Object.keys(ITEMS).map((id) => [id, 2]));
    for (let slot = 0; slot < 3; slot++) {
      library.equipment.catalog.push(
        normalizeEquipment(
          { name: '测试装备' + slot, description: 'hp+1', stats: { hp: 1 }, rules: [] },
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
    await page.locator('#party-toggle').click();
    await page.locator('[data-prepare-slot="0"]').click();
    for (let slot = 0; slot < 3; slot++)
      await page.locator(`[data-equipment-slot="${slot}"]`).selectOption('browser-owned-' + slot);
    await page.locator('[data-emblem-character]').selectOption(OVERLOAD_EMBLEM_ID);
    await page.evaluate(() => window.demo.flushStorage());
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    const saved = await page.evaluate(() => window.demo.getLibrary());
    assert.deepEqual(saved.characters[0].equipment, [
      'browser-owned-0',
      'browser-owned-1',
      'browser-owned-2',
    ]);
    assert.equal(saved.characters[0].emblemId, OVERLOAD_EMBLEM_ID);
    assert.equal(saved.emblems.length, 5);
    await page.locator('#party-toggle').click();
    await page.locator('[data-prepare-slot="0"]').click();
    assert.equal(await page.locator('[data-emblem-character]').inputValue(), OVERLOAD_EMBLEM_ID);
    await finishPanelAnimation(page, '#prepare-character-dialog');
    await page.screenshot({ path: path.join(output, 'equipment-after-static-reload.png') });
    await page.locator('#prepare-character-done').click();
    await page.locator('#prepare-close').click();
    await page.evaluate(() => window.demo.startBattle());
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-start').click();
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
    const markup = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
      '<script type="module" src="./src/app.js"></script>',
      '',
    );
    await page.route('**/__emblem-rewards', (route) =>
      route.fulfill({ contentType: 'text/html', body: markup }),
    );
    await page.goto(new URL('__emblem-rewards', baseURL).href);
    await page.evaluate(async () => {
      const [{ createEmblems }, { createEventScope }, { prepareBossEmblem }] = await Promise.all([
        import('/src/app/emblems.js'),
        import('/src/shared/events.js'),
        import('/src/emblem-progression.js'),
      ]);
      const events = createEventScope();
      const session = {
        ai: { library: { progression: { emblemLesson: 'done' }, emblems: [] } },
        runtime: { mode: 'battle' },
        battle: { playing: false, state: { phase: 'opening' } },
        journey: {},
      };
      const controller = createEmblems({
        session,
        events,
        generation: { save() {} },
        audio: { play() {} },
        shell: { toast() {} },
      });
      window.rewardFixture = { session, controller, events, prepareBossEmblem };
    });
    for (const [map, sequence, name] of [
      ['ruins', 2, '水无月兰'],
      ['ruins', 5, '神威'],
      ['forest', 1, '玖柒'],
      ['forest', 3, '风在舞'],
    ]) {
      await page.evaluate(
        ({ map, sequence }) => {
          const { session, controller, prepareBossEmblem } = window.rewardFixture;
          session.journey.expedition = { index: 4, exploration: { map, sequence } };
          prepareBossEmblem(session.ai.library, session.journey.expedition);
          controller.check();
        },
        { map, sequence },
      );
      await page.locator('#emblem-dialogue').waitFor({ state: 'visible' });
      await page.locator('#emblem-dialogue button').click();
      assert((await page.locator('#emblem-dialogue').textContent()).includes(name));
      await page.locator('#emblem-dialogue button').click();
      await page.locator('#emblem-dialogue').waitFor({ state: 'hidden' });
      await page.evaluate(() => window.rewardFixture.controller.check());
      assert.equal(await page.locator('#emblem-dialogue').isVisible(), false);
    }
    await page.evaluate(() => {
      window.rewardFixture.controller.dispose();
      window.rewardFixture.events.dispose();
    });
    assert.deepEqual(errors, []);
    return {
      staticEquipmentReload: true,
      allEmblemsRetained: true,
      currentLevel: true,
      symmetricBag: true,
      outsideDismiss: true,
      bossRewardDialogues: true,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'failure.png') });
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
