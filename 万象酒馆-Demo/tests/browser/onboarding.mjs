import assert from 'node:assert/strict';
import path from 'node:path';
import { buildPlan } from '../planner.js';
import { abilityFor } from '../../src/catalog.js';
import { dismissAutomaticJournals } from './legacy-session.mjs';

/** Fresh save → offline Qingyuan → Edith dialogue → guided battle → five-room completion. */
export async function onboardingChecks({ browser, baseURL, output }) {
  const requests = [],
    errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  await dismissAutomaticJournals(page);
  await page.addInitScript(() => {
    if (window.origin === 'null') return;
    localStorage.setItem(
      'wanxiang.generation-options.v1',
      JSON.stringify({ developerMode: true, protagonistApi: false, scriptApi: false }),
    );
  });
  page.on('pageerror', (error) => errors.push(error.message));
  async function innReady() {
    await page
      .frameLocator('#inn-frame iframe')
      .locator('#status')
      .waitFor({ state: 'detached', timeout: 60000 });
    return page.frames().find((frame) => frame.url().includes('tavern.html'));
  }
  async function finishDialogue() {
    if (await page.locator('#guide-dialogue').evaluate((panel) => panel.open))
      await page.locator('#guide-dialogue').waitFor({ state: 'visible', timeout: 10000 });
    for (let i = 0; i < 35 && (await page.locator('#guide-dialogue').isVisible()); i++) {
      await page.locator('#dialogue-next').click();
    }
    assert.equal(await page.locator('#guide-dialogue').isVisible(), false);
  }
  async function enterActions(plan, state) {
    for (const action of plan) {
      await page.waitForFunction(() => !demo.getStatus().animating);
      await page.locator(`[data-start="${action.start}"]`).click();
      await page.locator(`[data-unit="${action.actor}"]`).click();
      await page.locator(`[data-skill="${action.skill}"]`).click();
      if (
        ['enemy', 'ally'].includes(abilityFor(state, action.actor, action.skill).target) &&
        (await page.evaluate(() => demo.getStatus().interactionStep)) === 'target'
      )
        await page
          .locator(`[data-unit="${action.target}"],[data-rear="${action.target}"]`)
          .first()
          .click();
      await finishDialogue();
    }
  }
  try {
    await page.route('**/api/ai/generate/*', (route) => {
      requests.push(route.request().url());
      if (route.request().url().endsWith('/chat'))
        return route.fulfill({
          json: {
            content: '长景月汐点头，同意一起进入下一趟副本。',
            actions: {
              affection: [{ id: 'official-aegis', delta: 2 }],
              agreeToAdventure: [],
            },
            usage: { input: 30, output: 20 },
            request: { tokens: { inputEstimate: 40, tokenizer: 'fixture' }, warnings: [] },
          },
        });
      return route.fulfill({
        status: 500,
        json: { error: 'No model API is allowed in temporary new-game tests' },
      });
    });
    await page.goto(baseURL);
    await page.locator('#start-journey').click();
    await page.locator('#new-game').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#creation-form').isVisible(), false);
    assert.equal(await page.locator('#creation-start').isEnabled(), true);
    assert((await page.locator('#creation-review').textContent()).includes('青缘'));
    assert.equal(requests.length, 0);
    await page.screenshot({ path: path.join(output, 'new-game-protagonist.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('#creation-start').scrollIntoViewIfNeeded();
    const start = await page.locator('#creation-start').boundingBox();
    assert(
      start.x >= 0 && start.x + start.width <= 844 && start.y >= 0 && start.y + start.height <= 390,
    );
    await page.screenshot({ path: path.join(output, 'new-game-landscape.png') });
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.locator('#creation-start').click();
    await page.locator('#new-game').waitFor({ state: 'hidden' });
    let library = await page.evaluate(() => demo.getLibrary());
    assert.equal(library.characters.length, 2);
    assert.equal(library.party.filter(Boolean).length, 2);
    assert.equal(library.characters[1].setting.name, '伊蒂丝');
    assert.equal(library.characters[0].setting.name, '青缘');
    await page.locator('#guide-dialogue.opening-prose').waitFor({ state: 'visible' });
    const arrivalFrame = await innReady();
    const arrival = await arrivalFrame.evaluate(() => {
      const { camera } = window.assetPreview;
      return {
        position: camera.position.toArray(),
        direction: camera.getWorldDirection(camera.position.clone()).toArray(),
      };
    });
    assert.deepEqual(arrival.position, [-4.35, 1.6, 1.24]);
    assert(arrival.direction[0] > 0.99, 'The fresh player faces into the room, away from the gate');
    assert.equal(await arrivalFrame.locator('#summon-open').isVisible(), false);
    await page.locator('#dialogue-next').click();
    assert((await page.locator('#dialogue-text').textContent()).includes('白光'));
    await page.screenshot({ path: path.join(output, 'pandora-arrival.png') });
    await finishDialogue();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await innReady();
    await finishDialogue();
    assert.equal(requests.length, 0, 'Edith is already present without recruitment');
    await page.locator('#tutorial-action').click();
    await page
      .frameLocator('iframe')
      .locator('#enter')
      .waitFor({ state: 'visible', timeout: 15000 });
    await page.frameLocator('iframe').locator('#enter').click();
    await page.locator('#destination-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#destination-regions [data-region]').count(), 1);
    await page.locator('#destination-region-confirm').click();
    assert.equal(await page.locator('[data-map-node]:not([disabled])').count(), 1);
    await page.locator('#destination-start').click();
    await page.waitForFunction(
      () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
      null,
      { timeout: 60000 },
    );
    assert.equal(requests.length, 0, 'Entering a dungeon must not call the script API');
    await finishDialogue();
    await page.locator('#commit').click();
    assert.equal(
      (await page.evaluate(() => demo.getState())).phase,
      'opening',
      'Empty tutorial opening must be blocked',
    );
    assert.equal(await page.locator('[data-side="Friendly"]:visible').count(), 2);
    assert.equal(await page.locator('[data-rear]').count(), 0);
    await page.locator('#speed').click();
    await page.locator('[data-start="0"]').first().click();
    await page.locator('#dialogue-next').click();
    const alignment = await page.locator('#guide-dialogue').evaluate((panel) => {
      const image = panel.querySelector('img').getBoundingClientRect();
      const box = panel.getBoundingClientRect();
      return {
        square: Math.abs(image.width - image.height),
        centered: Math.abs(image.y + image.height / 2 - box.y - box.height / 2),
      };
    });
    assert(alignment.square < 1 && alignment.centered < 1);
    assert(
      (await page.locator('#guide-dialogue .guide-portrait').getAttribute('src')).includes(
        'edith.png',
      ),
    );
    await page.screenshot({ path: path.join(output, 'guide-dialogue-aligned.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.screenshot({ path: path.join(output, 'guide-dialogue-landscape.png') });
    await page.setViewportSize({ width: 1440, height: 836 });
    await finishDialogue();
    await page.locator('[data-unit="aegis"]').click();
    assert((await page.locator('#details .skill-targetable').count()) > 0);
    await page.locator('[data-skill="attack"]').click();
    assert.equal((await page.evaluate(() => demo.getPlan()))[0].target, 'mossSlime');
    assert.equal(
      await page.locator('#tutorial-guide').getAttribute('data-step'),
      'opening-confirm',
    );
    await finishDialogue();
    await page.locator('#commit').click();
    await page.waitForFunction(() => !demo.getStatus().playing);
    await finishDialogue();
    assert.equal(await page.locator('#tutorial-guide').getAttribute('data-step'), 'timeline');
    await page.locator('#timeline .enemy-cell').click();
    await finishDialogue();
    assert.equal(await page.locator('#tutorial-guide').getAttribute('data-step'), 'intent');
    assert((await page.locator('#intent-layer .intent-path').count()) > 0);
    await page.locator('#story-toggle').click();
    assert.equal(await page.locator('#story-feed').isVisible(), true);
    assert.equal(await page.locator('#tutorial-guide').getAttribute('data-step'), 'intent');
    await page.locator('#story-close').click();
    await page.locator('#story-feed').waitFor({ state: 'hidden' });
    await finishDialogue();
    await page.locator('[data-start="0"]').first().click();
    const actor = await page.locator('[data-unit="aegis"]').boundingBox();
    const target = await page.locator('[data-empty-slot="2"]').boundingBox();
    await page.mouse.move(actor.x + actor.width / 2, actor.y + actor.height / 2);
    await page.mouse.down();
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 14 });
    await page.mouse.up();
    const dodge = await page.evaluate(() => demo.getForecast());
    assert(dodge.valid);
    assert.equal(dodge.final.formation[0], null);
    assert.equal(dodge.final.formation[2], 'aegis');
    assert(dodge.events.some((event) => event.type === 'enemy' && !event.targets.length));
    await finishDialogue();
    assert.equal((await page.evaluate(() => demo.getLibrary())).campaign.tutorial, 'swap-confirm');
    await page.locator('#commit').click();
    await page.waitForFunction(() => !demo.getStatus().playing);
    await finishDialogue();
    assert.equal((await page.evaluate(() => demo.getLibrary())).campaign.tutorial, 'dodge-done');

    await page.screenshot({ path: path.join(output, 'tutorial-timeline.png') });
    const completed = [];
    let armourReminder = false;
    for (let room = 0; room < 5; room++) {
      await finishDialogue();
      if (room === 3) {
        await page.locator('#opening-preview .enemy-cell,#timeline .enemy-cell').first().click();
        await finishDialogue();
        const inspected = await page.evaluate(() => demo.getLibrary().campaign);
        assert.equal(inspected.tutorial, 'crossfire-done');
        assert.equal(inspected.tasks.crossfire, true);
      }
      if ([1, 2].includes(room)) {
        assert.equal(
          (await page.evaluate(() => demo.getLibrary())).campaign.tutorial,
          room === 1 ? 'vulnerable' : 'slow-opening',
        );
        await page.locator('#commit').click();
        await page.waitForFunction(() => !demo.getStatus().playing);
        await finishDialogue();
        if (room === 1) {
          await page.locator('[data-unit="lyria"]').click();
          await page.locator('[data-skill="attack"]').click();
          await page.locator('[data-unit="cinderImp"]').click();
        } else {
          assert.equal(
            (await page.evaluate(() => demo.getLibrary())).inventory.items['slow-potion'],
            1,
          );
          const bag = await page.locator('#backpack-open').boundingBox();
          const ap = await page.locator('#ap-orb').boundingBox();
          assert(Math.abs(bag.width - ap.width) < 1 && Math.abs(bag.height - ap.height) < 1);
          assert(bag.x > ap.x + ap.width);
          await page.locator('#backpack-open').click();
          assert.equal(
            await page.locator('#backpack-dialog').evaluate((el) => el.tagName),
            'SECTION',
          );
          assert.equal(await page.locator('#backpack-items [data-item]').count(), 1);
          await page.waitForTimeout(260);
          const itemIcon = await page.locator('#backpack-items .bag-item img').boundingBox();
          const itemSlot = await page.locator('#backpack-items .bag-item').boundingBox();
          assert.equal(itemIcon.width, 36);
          assert.equal(itemIcon.height, 36);
          assert(itemSlot.width <= 80 && itemSlot.height <= 90);
          assert.equal(await page.locator('#backpack-items .bag-item small').count(), 0);
          assert(
            (await page.locator('#backpack-items .bag-item').getAttribute('data-tooltip')).includes(
              '施加1层迟缓',
            ),
          );
          await page.screenshot({ path: path.join(output, 'backpack-inline.png') });
          await page.setViewportSize({ width: 844, height: 390 });
          await page.waitForTimeout(300);
          const compactBag = await page.locator('#backpack-open').boundingBox();
          const compactAp = await page.locator('#ap-orb').boundingBox();
          const compactPanel = await page.locator('#backpack-dialog').boundingBox();
          assert(Math.abs(compactBag.width - compactAp.width) < 1);
          assert(compactPanel.x >= 0 && compactPanel.y >= 0);
          assert(
            compactPanel.x + compactPanel.width <= 844 &&
              compactPanel.y + compactPanel.height <= 390,
          );
          await page.screenshot({ path: path.join(output, 'backpack-landscape.png') });
          await page.setViewportSize({ width: 1440, height: 836 });
          await page.waitForTimeout(300);
          await page.locator('[data-item="slow-potion"]').click();
          await page.locator('[data-unit="warden"]').click();
          assert.equal(
            (await page.evaluate(() => demo.getLibrary())).inventory.items['slow-potion'],
            1,
          );
          assert.equal(
            (await page.evaluate(() => demo.getForecast())).final.items['slow-potion'],
            0,
          );
          await page.screenshot({ path: path.join(output, 'tutorial-slow-item.png') });
          assert.equal(await page.locator('.item-projectile').count(), 0);
        }
        await finishDialogue();
        const demonstration = await page.evaluate(() => demo.getForecast());
        assert(demonstration.valid, JSON.stringify(demonstration.invalid));
        if (room === 2)
          assert(
            demonstration.events.some(
              (event) => event.type === 'item' && event.after.units.warden.buffs.slow === 1,
            ),
          );
        await page.locator('#commit').click();
        if (room === 2) {
          await page.locator('.item-projectile').waitFor({ state: 'attached' });
          const projectile = await page.locator('.item-projectile').evaluate((element) => ({
            src: element.getAttribute('src'),
            frames: element.getAnimations()[0].effect.getKeyframes(),
          }));
          assert(projectile.src.endsWith('slow-potion.svg'));
          assert(projectile.frames.length > 2);
          await page.locator('.item-projectile').evaluate((element) => {
            const animation = element.getAnimations()[0];
            animation.pause();
            animation.currentTime = animation.effect.getTiming().duration * 0.55;
          });
          await page.screenshot({ path: path.join(output, 'item-throw.png') });
          await page
            .locator('.item-projectile')
            .evaluate((element) => element.getAnimations()[0].play());
        }
        await page.waitForFunction(() => !demo.getStatus().playing);
        await finishDialogue();
        assert.equal(
          (await page.evaluate(() => demo.getLibrary())).campaign.tutorial,
          room === 1 ? 'vulnerable-done' : 'slow-done',
        );
      }
      if (room === 4) {
        assert.equal((await page.evaluate(() => demo.getLibrary())).campaign.tutorial, 'boss');
        assert((await page.evaluate(() => demo.getState())).units.bossGate.maxHp >= 74);
        // Spend mana, then recover it through the actual 1 AP item path.
        await page.locator('[data-unit="lyria"]').click();
        await page.locator('[data-skill="tidal-moonlight"]').click();
        await finishDialogue();
        // Let the Boss demonstrate its opening armour before the planner can burst it
        // below the phase threshold or bind its first action.
        await page.locator('#commit').click();
        await page.waitForFunction(() => !demo.getStatus().playing);
        await page.locator('#commit').click();
        await page.waitForFunction(() => !demo.getStatus().playing);
        armourReminder = (await page.evaluate(() => demo.getLibrary())).campaign.tasks.armour;
        await finishDialogue();
        await page.locator('#backpack-open').click();
        await page.locator('[data-item="mana-potion"]').click();
        await page.locator('[data-unit="lyria"]').click();
        await finishDialogue();
        const manaForecast = await page.evaluate(() => demo.getForecast());
        assert(manaForecast.valid);
        assert(
          manaForecast.events.some(
            (event) =>
              event.type === 'item' && event.logs.some((line) => /回复[1-9]\d*法力/u.test(line)),
          ),
        );
        await page.locator('#commit').click();
        await page.waitForFunction(() => !demo.getStatus().playing);
        await finishDialogue();
      }
      for (let round = 0; round < 24; round++) {
        const state = await page.evaluate(() => demo.getState());
        if (state.phase === 'victory') break;
        assert.notEqual(state.phase, 'defeat');
        const plan = buildPlan(state);
        assert(plan.length > 0, 'Tutorial must remain playable with only two characters');
        await enterActions(plan, state);
        const forecast = await page.evaluate(() => demo.getForecast());
        assert(forecast.valid, JSON.stringify(forecast.invalid));
        await page.locator('#commit').click();
        await page.waitForFunction(() => !demo.getStatus().playing, null, { timeout: 30000 });
        if ((await page.evaluate(() => demo.getLibrary())).campaign.tutorial === 'boss-armour')
          armourReminder = true;
        await finishDialogue();
        const after = await page.evaluate(() => demo.getState());
        for (const [id, unit] of Object.entries(forecast.final.units)) {
          assert.equal(after.units[id].hp, unit.hp);
          assert.equal(after.units[id].mp, unit.mp);
        }
      }
      assert.equal((await page.evaluate(() => demo.getState())).phase, 'victory');
      await page.locator('#result').waitFor({ state: 'visible' });
      completed.push(room);
      if (room < 4) {
        await page.locator('#continue').click();
        await page.waitForFunction(
          (room) =>
            demo.getStatus().mode === 'battle' &&
            demo.getState().encounter === room + 1 &&
            !demo.getStatus().animating,
          room,
          { timeout: 60000 },
        );
      }
    }
    assert(armourReminder, 'Edith comments on the actual Boss shield event');
    assert.equal((await page.evaluate(() => demo.getLibrary())).campaign.completed, true);
    assert.equal((await page.evaluate(() => demo.getLibrary())).inventory.summonContracts, 1);
    assert((await page.locator('.battle-rewards').textContent()).includes('召唤契约 × 1'));
    assert((await page.evaluate(() => demo.getLibrary())).inventory.ether > 0);
    await finishDialogue();
    await page.locator('#result-back').click();
    await finishDialogue();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await innReady();
    await finishDialogue();
    assert.equal((await page.evaluate(() => demo.getLibrary())).inventory.summonContracts, 1);
    await page.locator('#tutorial-action').click();
    await page
      .frameLocator('#inn-frame iframe')
      .locator('#summon-open')
      .waitFor({ state: 'visible', timeout: 15000 });
    await finishDialogue();
    await page.frameLocator('#inn-frame iframe').locator('#summon-open').click();
    await page.locator('#guide-dialogue[data-speaker="长景月汐"]').waitFor({ state: 'visible' });
    assert(
      (await page.locator('#guide-dialogue .guide-portrait').getAttribute('src')).includes(
        'changjing-yuexi.png',
      ),
    );
    await page.locator('#dialogue-next').click();
    await page.screenshot({ path: path.join(output, 'first-recruit-changjing-yuexi.png') });
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    assert.equal((await page.evaluate(() => demo.getLibrary())).inventory.summonContracts, 0);
    await finishDialogue();
    library = await page.evaluate(() => demo.getLibrary());
    assert.equal(library.characters.filter((entry) => entry.setting.name === '长景月汐').length, 1);
    assert(library.party.includes('official-aegis'));
    assert.equal(library.campaign.tutorial, 'table');
    assert.equal(requests.length, 0, 'The first contracted companion does not call a model API');
    await page.locator('#records-open').click();
    assert.equal(await page.locator('#records-text h4').count(), 5);
    assert((await page.locator('#records-text').textContent()).includes('战斗测试占位剧本'));
    assert(!(await page.locator('#records-text').textContent()).includes('伤害'));
    await page.locator('#records-close').click();
    const frame = await innReady();
    await frame.evaluate(() => window.assetPreview.placeNow('table'));
    await frame.locator('#talk-open').click();
    await finishDialogue();
    await page.locator('#chat-input').fill('长景月汐，要和我一起去下一个副本吗？');
    await page.locator('#chat-input').press('Enter');
    await page.waitForFunction(() => demo.getLibrary().campaign.tutorial === 'shop');
    await finishDialogue();
    await page.locator('#chat-close').click();
    await page.locator('#tutorial-action').click();
    await page.waitForFunction(
      () => document.querySelector('#inn-frame iframe')?.contentWindow.corridorReady,
    );
    const corridor = page.frameLocator('#inn-frame iframe');
    await corridor.locator('[data-door=shop]').click();
    const gold = (await page.evaluate(() => demo.getLibrary())).inventory.gold;
    await page.locator('[data-buy=mana-potion]').click();
    assert.equal((await page.evaluate(() => demo.getLibrary())).inventory.gold, gold - 20);
    assert.equal((await page.evaluate(() => demo.getLibrary())).campaign.tutorial, 'depart-again');
    await page.screenshot({ path: path.join(output, 'void-shop.png') });
    await page.locator('#shop-close').click();
    await finishDialogue();
    await corridor.locator('#leave-corridor').click();
    await page.waitForFunction(() => {
      const inn = document.querySelector('#inn-frame iframe')?.contentWindow;
      return inn?.location.pathname.endsWith('/tavern.html') && inn.modelReady === true;
    });
    const returnedFrame = await innReady();
    await finishDialogue();
    if (await page.locator('#chat-dialog').evaluate((el) => el.open))
      await page.locator('#chat-close').click();
    await returnedFrame.evaluate(() => window.assetPreview.placeNow('gate'));
    await returnedFrame.locator('#enter').click();
    await page.locator('#destination-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#destination-regions [data-region]').count(), 1);
    await page.locator('#destination-region-confirm').click();
    assert.equal(await page.locator('[data-map-node]:not([disabled])').count(), 1);
    assert.equal(await page.locator('.destination-node.cleared').count(), 1);
    await page.locator('#destination-start').click();
    await page.waitForFunction(
      () =>
        demo.getLibrary().campaign.tutorial === 'complete' && demo.getStatus().mode === 'battle',
    );
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).relationships['official-aegis'].gains,
      0,
    );
    await page.waitForFunction(() => !document.querySelector('#story-feed').open);
    const automatic = await page.evaluate(() => window.automaticJournals);
    assert(
      automatic.length >= 6,
      'Four later fights, final ending, and next dungeon open automatically',
    );
    assert(
      automatic.every((entry) => !entry.resultVisible),
      'The final journal opens before settlement',
    );
    await page.evaluate(() => demo.returnInn());
    await page.evaluate(() => demo.saveSlot('slot2'));
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await page.evaluate(() => demo.loadSlot('slot2'));
    library = await page.evaluate(() => demo.getLibrary());
    assert.equal(library.characters.length, 3);
    assert.equal(library.campaign.completed, true);
    assert(library.party.includes(library.campaign.protagonistId));
    assert.deepEqual(errors, []);
    return {
      defaultQingyuanWithoutApi: true,
      characterApiCalls: 0,
      edithWithoutSummoning: true,
      scriptApiCalls: 0,
      typedProseAndDialogue: true,
      dragSwapAndItemTutorial: true,
      emptySlotDodge: true,
      vulnerableSlowAndManaLessons: true,
      bossArmourReminder: armourReminder,
      singleEnemyAutoTarget: true,
      arrivalFacingAwayFromGate: true,
      sparseParty: 2,
      guidedOpening: true,
      enemyPreview: true,
      journalRead: true,
      fiveRooms: completed,
      replayMatchesForecast: true,
      mapsUnlockAfterBoss: 5,
      saveAndReload: true,
      guaranteedContractAndFirstRecruit: true,
      multiSpeakerRecruitDialogueResumes: true,
      errors,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'onboarding-failure.png') }).catch(() => {});
    throw failure;
  } finally {
    await page.close();
  }
}
