import { apiSettingsChecks } from './api-settings.mjs';
import { generationOptionsChecks } from './generation-options.mjs';
import { chatChecks } from './chat.mjs';
import { legacySession } from './legacy-session.mjs';
import { settingsPreparationChecks } from './settings-preparation.mjs';
import { storyFeedChecks } from './story-feed.mjs';
import { artbookChecks } from './artbook.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { audioChecks } from './audio.mjs';
import { presentationChecks } from './presentation.mjs';
import { worldbookEditorChecks } from './worldbook-editor.mjs';
import { characterSheetChecks } from './character-sheet.mjs';
import { rawReplyChecks } from './raw-replies.mjs';
import { destinationPagerChecks } from './destination-pager.mjs';
import { cardDeathChecks } from './card-death.mjs';
import { portraitImportChecks } from './portrait-import.mjs';
import { summoningChecks } from './summoning.mjs';
import { enemyIntentChecks } from './enemy-intents.mjs';
import { guestRoomChecks } from './guest-room.mjs';
import { roomChatChecks } from './room-chat.mjs';

/** One browser session, two representative viewports; no full dungeon replay. */
export async function smoke({ browser, baseURL, output, settingsChecked, environmentChecked }) {
  const errors = [];
  const pages = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
    pages.push(page);
    page.on('pageerror', (error) => errors.push(error.message));
    await legacySession(page);
    await page.goto(baseURL);
    const apiSettings = settingsChecked || (await apiSettingsChecks({ browser, baseURL, output }));
    const generationOptions =
      settingsChecked?.generationOptions ||
      (await generationOptionsChecks({ browser, baseURL, output }));
    const chat = await chatChecks({ browser, baseURL, output });
    const settingsPreparation = await settingsPreparationChecks({ page, output });
    const destinationPager = await destinationPagerChecks({ browser, baseURL, output });
    const summoning = await summoningChecks({ browser, baseURL, output });
    const enemyIntents = await enemyIntentChecks({ browser, baseURL, output });
    const rawReplies = await rawReplyChecks({ browser, baseURL, output });
    const worldbookEditor = await worldbookEditorChecks({ page, output });
    const presentationResults = await Promise.allSettled([
      storyFeedChecks({ browser, baseURL, output }),
      cardDeathChecks({ browser, baseURL, output }),
      portraitImportChecks({ browser, baseURL, output }),
    ]);
    const presentationFailures = presentationResults.filter(
      (result) => result.status === 'rejected',
    );
    if (presentationFailures.length)
      throw new AggregateError(
        presentationFailures.map((result) => result.reason),
        'Journal/death presentation checks failed:\n' +
          presentationFailures
            .map((result) => result.reason.stack || result.reason.message)
            .join('\n'),
      );
    const [storyFeed, cardDeaths, portraitImport] = presentationResults.map(
      (result) => result.value,
    );
    const artbook =
      environmentChecked?.artbook || (await artbookChecks({ browser, baseURL, output }));
    const guestRoom =
      environmentChecked?.rooms || (await guestRoomChecks({ browser, baseURL, output }));
    const roomChat =
      environmentChecked?.chat || (await roomChatChecks({ browser, baseURL, output }));
    const characterSheet = await characterSheetChecks({ page, output });
    await page.evaluate(() => demo.startBattle());
    await page.waitForFunction(
      () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
      { timeout: 60000 },
    );
    const weather = await page.evaluate(() => demo.getWeatherStatus());
    assert(weather);
    assert.equal(weather.group, 'Weather_System');
    assert(
      ['clear', 'rain', 'snow', 'thunder', 'mist'].includes(weather.type),
      'Battle entry must receive an independent random weather layer',
    );
    assert.equal(await page.locator('#stage').getAttribute('data-weather'), weather.type);
    assert.equal(await page.locator('.unit-info .bar').count(), 0);
    assert.equal(await page.locator('.unit-resources .bar.hp').count(), 5);
    assert.equal(await page.locator('.unit-resources .bar.mp').count(), 3);
    assert.equal(await page.locator('[data-side="Enemy"]').count(), 2);
    assert.equal(await page.locator('[data-side="Enemy"][data-slot="1"]').count(), 0);
    assert.equal(await page.locator('#opening-preview .time-cell').count(), 5);
    await page.screenshot({ path: path.join(output, 'early-two-enemies.png') });
    await page.locator('[data-unit="mossSlime"]').click();
    assert.equal(await page.locator('#drag-menu').isVisible(), false);
    await page.locator('[data-unit="morrow"]').click();
    await page.locator('[data-unit="mossSlime"]').click();
    await page.locator('#drag-menu').waitFor({ state: 'visible' });
    const clickedSkills = await page
      .locator('#drag-menu [data-drop-skill]')
      .evaluateAll((buttons) => buttons.map((button) => button.dataset.dropSkill));
    assert(clickedSkills.includes('attack'));
    assert.equal(await page.evaluate(() => demo.getPlan().length), 0);
    await page.locator('[data-unit="sprout"]').click();
    assert((await page.locator('#drag-menu > span').textContent()).includes('迷路小蕈'));
    await page.locator('#drag-menu [data-drop-skill="attack"]').click();
    assert.deepEqual(
      await page.evaluate(() => demo.getPlan().map(({ actor, target }) => ({ actor, target }))),
      [{ actor: 'morrow', target: 'sprout' }],
    );
    await page.locator('#clear').click();
    const draggedActor = await page.locator('[data-unit="morrow"]').boundingBox();
    const droppedEnemy = await page.locator('[data-unit="mossSlime"]').boundingBox();
    await page.mouse.move(
      draggedActor.x + draggedActor.width / 2,
      draggedActor.y + draggedActor.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      droppedEnemy.x + droppedEnemy.width / 2,
      droppedEnemy.y + droppedEnemy.height / 2,
      { steps: 15 },
    );
    await page.mouse.up();
    await page.locator('#drag-menu').waitFor({ state: 'visible' });
    assert.deepEqual(
      await page
        .locator('#drag-menu [data-drop-skill]')
        .evaluateAll((buttons) => buttons.map((button) => button.dataset.dropSkill)),
      clickedSkills,
    );
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#drag-menu').isVisible(), false);
    assert.equal(await page.evaluate(() => demo.getPlan().length), 0);
    const reserve = page.locator('[data-rear="serin"]');
    await page.mouse.move(20, 200);
    assert.equal(await reserve.locator('.rear-name').isVisible(), false);
    assert.equal(await reserve.locator('.rear-resources').isVisible(), false);
    await reserve.hover();
    await page.waitForTimeout(180);
    assert.equal(await reserve.locator('.rear-name').isVisible(), true);
    assert.equal(await reserve.locator('.rear-resources').isVisible(), true);
    await page.mouse.move(20, 200);
    await reserve.locator('.rear-name').waitFor({ state: 'hidden' });
    await reserve.locator('.rear-resources').waitFor({ state: 'hidden' });
    assert.equal(await reserve.locator('.rear-name').isVisible(), false);
    assert.equal(await reserve.locator('.rear-resources').isVisible(), false);

    // Use the real input flow to cover the engine-to-presentation event contract.
    await page.locator('#speed').click();
    await page.locator('#commit').click();
    await page.waitForFunction(() => !demo.getStatus().playing && demo.getState().round === 1);
    await page.locator('#timeline .enemy-cell').first().click();
    assert.equal(await page.locator('.intent-path').count(), 2);
    assert.equal(await page.locator('[id^="intent-arrow-tip-"]').count(), 2);
    await page.locator('[data-unit="mossSlime"]').click();
    assert.equal(await page.locator('.intent-path').count(), 1);
    await page.locator('#stage canvas').click({ position: { x: 24, y: 280 } });
    assert.equal(await page.locator('.intent-path').count(), 0);
    const beforeLateSlow = await page.evaluate(() => demo.getForecast().slots);
    const lateSlot = beforeLateSlow.indexOf('mossSlime') + 1;
    await page.locator(`[data-start="${lateSlot}"]`).click();
    await page.locator('[data-unit="morrow"]').click();
    await page.locator('[data-skill="delay"]').click();
    await page.locator('[data-unit="mossSlime"]').click();
    const lateSlow = await page.evaluate(() => demo.getForecast());
    assert(lateSlow.valid, JSON.stringify(lateSlow.invalid));
    assert.deepEqual(lateSlow.slots, beforeLateSlow);
    assert.equal(lateSlow.final.units.mossSlime.buffs.slow, 2);
    await page.locator('#clear').click();
    for (const actor of ['morrow', 'aegis', 'lyria']) {
      await page.locator(`[data-unit="${actor}"]`).click();
      await page.locator('[data-skill="attack"]').click();
      await page.locator('[data-unit="mossSlime"]').click();
    }
    assert.equal(await page.evaluate(() => demo.getPlan().length), 3);
    const beforeMove = await page.evaluate(() => demo.getPlan());
    await page
      .locator(`[data-action="${beforeMove[0].id}"]`)
      .dragTo(page.locator(`[data-action="${beforeMove[1].id}"]`));
    const afterMove = await page.evaluate(() => demo.getPlan());
    assert.equal(afterMove[0].start, beforeMove[1].start);
    assert.equal(afterMove[1].start, beforeMove[0].start);
    assert.equal(await page.evaluate(() => demo.getForecast().valid), true);
    await page.evaluate(() => {
      window.testTurnNotices = [];
      const label = document.querySelector('#round-start strong');
      window.testTurnObserver = new MutationObserver(() =>
        window.testTurnNotices.push(label.textContent),
      );
      window.testTurnObserver.observe(label, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    });
    await page.locator('#commit').click();
    await page.waitForFunction(() => !demo.getStatus().playing && demo.getState().round === 2);
    const actual = await page.evaluate(() => {
      window.testTurnObserver.disconnect();
      return window.testTurnNotices;
    });
    assert.deepEqual(actual, ['回合开始', '回合结束']);
    await page.screenshot({ path: path.join(output, 'desktop.png') });
    // Stronger monsters may take another round; exercise real targeting rather than a fixed kill count.
    for (let round = 0; round < 4; round++) {
      if ((await page.evaluate(() => demo.getState())).phase === 'victory') break;
      for (const actor of ['morrow', 'aegis', 'lyria']) {
        const target = await page.evaluate(() => {
          const forecast = demo.getForecast();
          return demo.getState().enemyIds.find((id) => forecast.final.units[id].hp > 0);
        });
        if (!target) break;
        await page.locator(`[data-unit="${actor}"]`).click();
        await page.locator('[data-skill="attack"]').click();
        if ((await page.evaluate(() => demo.getStatus().interactionStep)) === 'target')
          await page.locator(`[data-unit="${target}"]`).click();
      }
      await page.locator('#commit').click();
      await page.waitForFunction(() => !demo.getStatus().playing);
    }
    assert.equal((await page.evaluate(() => demo.getState())).phase, 'victory');
    await page.locator('#continue').click();
    await page.waitForFunction(
      () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
    );
    assert.deepEqual(await page.evaluate(() => demo.getState().enemyIds), ['pebble', 'sprout']);
    assert.equal(await page.locator('[data-side="Enemy"]').count(), 2);
    assert.equal(await page.locator('[data-side="Enemy"][data-slot="1"]').count(), 0);
    assert.equal(await page.locator('.unit-resources .bar.hp').count(), 5);
    assert.equal(await page.locator('#opening-preview .time-cell').count(), 5);
    for (const viewport of [
      { width: 1440, height: 836 },
      { width: 1024, height: 768 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(180);
      const opening = await page.locator('#timeline').boundingBox();
      const preview = await page.locator('#opening-preview').boundingBox();
      assert(
        opening.x + opening.width + 7 <= preview.x,
        'Opening and enemy preview must not overlap',
      );
    }
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.waitForTimeout(180);
    await page.locator('[data-unit="pebble"]').click();
    assert.equal(await page.locator('.intent-path').count(), 1);
    await page.screenshot({ path: path.join(output, 'early-one-enemy.png') });
    await page.evaluate(async () => {
      const old = demo;
      old.dispose();
      const { createApplication } = await import(
        new URL('./src/app/application.js', location.href).href
      );
      const application = createApplication();
      window.demo = { ...application.api, dispose: application.dispose };
    });
    await page.evaluate(() => demo.startBattle());
    await page.waitForFunction(
      () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
    );
    await page.locator('[data-unit="morrow"]').click();
    await page.locator('[data-skill="attack"]').click();
    await page.locator('[data-unit="mossSlime"]').click();
    assert.equal(
      await page.evaluate(() => demo.getPlan().length),
      1,
      'Remount must not duplicate handlers',
    );
    assert.equal(await page.locator('#hover-tooltip').count(), 1);

    const phone = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
    pages.push(phone);
    phone.on('pageerror', (error) => errors.push(error.message));
    await legacySession(phone);
    await phone.goto(baseURL);
    await phone.evaluate(() => demo.startBattle());
    await phone.waitForFunction(
      () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
      { timeout: 60000 },
    );
    await phone.locator('[data-rear="serin"]').tap();
    assert.equal(await phone.locator('[data-rear="serin"] .rear-resources').isVisible(), true);
    await phone.locator('[data-unit="aegis"]').tap();
    await phone.waitForFunction(() => !demo.getStatus().animating);
    assert.equal(
      await phone.locator('[data-unit="serin"] .resource-number').first().textContent(),
      '32/32',
    );
    const timeline = await phone.locator('#timeline').boundingBox();
    for (const card of await phone.locator('[data-side="Friendly"] .unit-resources').all()) {
      const rect = await card.boundingBox();
      assert(rect.y + rect.height <= timeline.y, 'Resource bars must not overlap the timeline');
    }
    await phone.screenshot({ path: path.join(output, 'landscape.png') });
    await phone.locator('#clear').tap();
    await phone.locator('[data-unit="aegis"]').tap();
    await phone.locator('[data-unit="mossSlime"]').tap();
    await phone.locator('#drag-menu').waitFor({ state: 'visible' });
    const touchMenu = await phone.locator('#drag-menu').boundingBox();
    assert(touchMenu.x >= 0 && touchMenu.x + touchMenu.width <= 844);
    assert(touchMenu.y >= 0 && touchMenu.y + touchMenu.height <= 390);
    await phone.locator('#drag-menu [data-drop-skill="attack"]').tap();
    assert.equal((await phone.evaluate(() => demo.getPlan()))[0].target, 'mossSlime');
    await presentationChecks({ page, output });
    const audio = await audioChecks({ browser, baseURL, output });
    assert.deepEqual(errors, []);
    return {
      viewports: ['1440x836', '844x390 touch'],
      singleStartNoticeWithoutSideInterruptions: true,
      occupiedActionsExchange: true,
      secondRoomOpeningDoesNotOverlap: true,
      remountWithoutDuplicateHandlers: true,
      reserveHover: true,
      resourceBarsOutsideCards: true,
      touchSwap: true,
      clickEnemySkillMenuMatchesDrag: true,
      touchEnemySkillMenu: true,
      twoEnemyWingsAndEmptyCenter: true,
      singleEnemyCenteredWithFourSlotPreview: true,
      audio,
      artbook,
      guestRoom,
      roomChat,
      storyFeed,
      cardDeaths,
      portraitImport,
      worldbookEditor,
      apiSettings,
      generationOptions,
      chat,
      settingsPreparation,
      rawReplies,
      destinationPager,
      summoning,
      enemyIntents,
      characterSheet,
      errors,
    };
  } finally {
    await Promise.all(pages.map((page) => page.close()));
  }
}
