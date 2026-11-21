import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession, finishGalDialogue } from './legacy-session.mjs';
import { meta as magicCircle } from '../../vendor/pixelfx/fx/arcane/magic-circle-cast.js';

export async function developerModeChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  await legacySession(page);
  const calls = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/ai/generate/*', (route) => {
    calls.push(route.request().url());
    return route.fulfill({ status: 400, json: { error: '不应调用真实模型' } });
  });
  const controls = [
    '#creation-generate',
    '#chat-send',
    '#quick-chat-send',
    '#memory-generate',
    '#forge-refine',
    '[data-world-submit]',
  ];
  async function openOptions() {
    await page.locator('#ai-open').click();
    await page.locator('[data-ai-tab="game"]').click();
  }
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    await openOptions();
    const checkbox = page.locator('[data-generation-option="skipAiGeneration"]');
    assert.equal(await checkbox.isChecked(), true);
    assert.equal(
      await page
        .locator('[data-generation-option="protagonistApi"],[data-generation-option="scriptApi"]')
        .count(),
      0,
    );
    for (const selector of controls)
      assert.equal(await page.locator(selector).isDisabled(), true, selector);
    await page.screenshot({ path: path.join(output, 'skip-ai-generation.png') });
    await page.evaluate(() => {
      document.querySelector('#chat-send').disabled = true;
    });
    await checkbox.uncheck();
    assert.equal(
      await page.locator('#chat-send').isDisabled(),
      true,
      'Existing busy state is not lost',
    );
    assert.equal(
      await page.locator('#forge-refine').isDisabled(),
      true,
      'No-source-items validation is not lost',
    );
    await page.evaluate(() => {
      document.querySelector('#chat-send').disabled = false;
    });
    assert.equal(await page.locator('#chat-send').isDisabled(), false);
    assert.equal(await page.locator('#creation-generate').isDisabled(), false);
    await checkbox.check();
    await page.locator('#ai-close').click();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await openOptions();
    assert.equal(await checkbox.isChecked(), true);
    await page.locator('[data-generation-option="developerMode"]').uncheck();
    assert.equal(await page.locator('#developer-options').isVisible(), false);
    assert.equal(await page.locator('#creation-generate').isDisabled(), false);
    const repository = 'https://github.com/YttriumCarbide/wanxiang-tavern';
    assert.equal(
      await page.locator('#settings-download-windows').getAttribute('href'),
      `${repository}/releases/download/v2.3.1/wanxiang-tavern-2.3.1-windows-x64.zip`,
    );
    assert.equal(
      await page.locator('#settings-download-develop').getAttribute('href'),
      `${repository}/archive/refs/heads/develop.zip`,
    );
    await page.locator('[data-generation-option="developerMode"]').check();
    await checkbox.check();
    await page.locator('#ai-close').click();
    await page.evaluate(() => window.demo.newAdventure());
    assert.equal(await page.locator('#creation-form').isVisible(), false);
    assert.equal(await page.locator('#creation-start').isEnabled(), true);
    await page.locator('#creation-close').click();
    await page.evaluate(() => window.demo.startBattle());
    if (await page.locator('#destination-dialog').isVisible()) {
      await page.locator('#destination-region-confirm').click();
      await page.locator('#destination-start').click();
    }
    await page.waitForFunction(
      () => window.demo.getStatus().mode === 'battle' && !window.demo.getStatus().animating,
    );
    assert.equal(await page.locator('#quick-chat-send').isDisabled(), true);
    if (await page.locator('#story-toggle').isVisible()) {
      await page.locator('#story-toggle').click();
      await page.locator('#quick-chat-input').fill('Enter也不能发送付费请求');
      await page.locator('#quick-chat-input').press('Enter');
    }
    const gate = await page.evaluate(async () => {
      const { createRequestControls } = await import('/src/app/request-controls.js');
      const forwarded = [];
      const client = createRequestControls(
        {
          request: async (path) => {
            forwarded.push(path);
            return {};
          },
          dispose() {},
        },
        () => ({ developerMode: true, skipAiGeneration: true }),
      );
      const blocked = [];
      for (const kind of [
        'character',
        'script',
        'chat',
        'quick-chat',
        'summary',
        'creation',
        'map',
      ]) {
        try {
          await client.request('generate/' + kind, {});
        } catch (error) {
          if (error.message.includes('跳过AI生成')) blocked.push(kind);
        }
      }
      client.dispose();
      return { blocked, forwarded };
    });
    assert.equal(gate.blocked.length, 7);
    assert.deepEqual(gate.forwarded, []);

    async function openGateAndSelectRegion(region) {
      const frame = page.frameLocator('#inn-frame iframe');
      await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('gate'));
      await frame.locator('#enter').click();
      await page.locator('#destination-dialog[data-stage="region"]').waitFor({ state: 'visible' });
      const button = page.locator(`#destination-regions button[data-region="${region}"]`);
      for (let pageIndex = 0; pageIndex < 4 && (await button.count()) === 0; pageIndex++) {
        const next = page.locator('#destination-region-next');
        if (await next.isDisabled()) break;
        await next.click();
      }
      if ((await button.count()) === 0) return false;
      await button.click();
      await page.locator('#destination-region-confirm').click();
      await page.locator('#destination-route-screen').waitFor({ state: 'visible' });
      return true;
    }

    async function closeRegionPicker() {
      await page.locator('#destination-close').click();
      await page.locator('#destination-dialog').waitFor({ state: 'hidden' });
    }

    async function closeRoute() {
      await page.locator('#destination-close').click();
      await page.locator('#destination-route-screen').waitFor({ state: 'hidden' });
    }

    async function readFirstNode() {
      const node = page.locator('#destination-map [data-map-node]').first();
      return {
        text: await node.innerText(),
        isOverlord: await node.evaluate((el) => el.classList.contains('is-overlord')),
      };
    }

    async function setQuickTestOverlords(enabled) {
      await openOptions();
      const toggle = page.locator('[data-generation-option="quickTestOverlords"]');
      if (enabled) await toggle.check();
      else await toggle.uncheck();
      await page.locator('#ai-close').click();
    }

    async function startFirstEncounter() {
      await page.locator('#destination-start').click();
      for (let step = 0; step < 6; step++) {
        await page.waitForTimeout(180);
        if (await page.locator('#party-panel').isVisible()) {
          await page.locator('#prepare-done').click();
        }
        if (await page.evaluate(() => window.demo.getStatus().mode === 'battle')) break;
      }
      await page.waitForFunction(
        () => window.demo.getStatus().mode === 'battle' && !window.demo.getStatus().animating,
        null,
        { timeout: 60000 },
      );
    }

    async function waitCutsceneClosed() {
      await page.waitForFunction(
        () => document.querySelector('#overlord-cutscene-layer')?.hidden !== false,
        null,
        { timeout: 15000 },
      );
    }

    async function returnToInn() {
      await page.evaluate(() => window.demo.returnInn());
      await page.waitForFunction(() => window.demo.getStatus().mode === 'inn');
    }

    // Return to inn and verify quickTestOverlords non-destructively swaps first node to Overlord for all regions
    await returnToInn();
    await openOptions();
    assert.equal(
      await page.locator('[data-generation-option="quickTestOverlords"]').count(),
      1,
      'Exactly one quickTestOverlords toggle must exist',
    );
    assert.equal(
      await page.locator('[data-generation-option="quickTest"]').count(),
      0,
      'Legacy quickTest control must not be visible',
    );
    assert.equal(
      await page.locator('[data-generation-option="quickTestApep"]').count(),
      0,
      'Legacy quickTestApep control must not be visible',
    );
    await page.locator('#ai-close').click();

    const regions = [
      { region: 'black-market', boss: 'banditSyndicateKing' },
      { region: 'graystone-quarry', boss: 'darkscaleWarlord' },
      { region: 'ruins', boss: 'apepLamb' },
      { region: 'mill', boss: 'alchemicalPuppet' },
    ];

    // With toggle OFF, capture authored hubs and verify quick-test-only maps remain hidden.
    await setQuickTestOverlords(false);
    const baselines = {};
    for (const { region } of regions.filter(({ region }) => ['ruins', 'mill'].includes(region))) {
      assert.equal(await openGateAndSelectRegion(region), true);
      baselines[region] = await readFirstNode();
      assert.equal(
        baselines[region].isOverlord,
        false,
        `Region ${region} first node should not be Overlord when toggle is OFF`,
      );
      await closeRoute();
    }
    for (const { region } of regions.filter(({ region }) =>
      ['black-market', 'graystone-quarry'].includes(region),
    )) {
      assert.equal(await openGateAndSelectRegion(region), false);
      await closeRegionPicker();
    }

    // Turn ON and verify first node is Overlord with expected boss display name
    await setQuickTestOverlords(true);
    for (const { region, boss } of regions) {
      await openGateAndSelectRegion(region);
      const node = await readFirstNode();
      assert.equal(
        node.isOverlord,
        true,
        `Region ${region} first node should be Overlord when toggle is ON`,
      );
      const bossName = await page.evaluate(async (boss) => {
        const { DEFINITIONS } = await import('/src/data.js');
        return DEFINITIONS[boss]?.name;
      }, boss);
      const destinationBadge = await page
        .locator('#destination-sites .destination-site-top small')
        .innerText();
      assert(
        destinationBadge.includes('直接开战') &&
          destinationBadge.includes('霸主') &&
          destinationBadge.includes(bossName),
        `Region ${region} first encounter should identify ${bossName} as its Overlord`,
      );
      const previews = await page
        .locator('#destination-sites .destination-enemies img')
        .evaluateAll((images) => images.map((image) => image.alt));
      assert.deepEqual(previews, [bossName], `Region ${region} should preview the actual fight`);
      await closeRoute();
    }

    // Turn OFF restores existing hub routes and hides the added quick-test-only maps.
    await setQuickTestOverlords(false);
    for (const { region } of regions.filter(({ region }) => ['ruins', 'mill'].includes(region))) {
      assert.equal(await openGateAndSelectRegion(region), true);
      const node = await readFirstNode();
      assert.equal(
        node.text,
        baselines[region].text,
        `Region ${region} first node text should restore exactly when toggle is OFF`,
      );
      assert.equal(
        node.isOverlord,
        baselines[region].isOverlord,
        `Region ${region} first node is-overlord class should restore exactly when toggle is OFF`,
      );
      await closeRoute();
    }
    for (const { region } of regions.filter(({ region }) =>
      ['black-market', 'graystone-quarry'].includes(region),
    )) {
      assert.equal(await openGateAndSelectRegion(region), false);
      await closeRegionPicker();
    }

    // Turn ON and launch the first encounter of all four regions in order
    await setQuickTestOverlords(true);
    await openOptions();
    await checkbox.uncheck();
    await page.locator('#ai-close').click();
    for (let i = 0; i < regions.length; i++) {
      const { region, boss } = regions[i];
      await openGateAndSelectRegion(region);
      await startFirstEncounter();
      const exp = await page.evaluate(() => ({
        index: window.demo.getExpedition().index,
        enemies: window.demo.getState().enemyIds,
      }));
      assert.equal(exp.index, 4, `Region ${region} first battle index should be 4`);
      assert.deepEqual(
        exp.enemies,
        [boss],
        `Region ${region} first battle enemy should be ${boss}`,
      );

      if (region === 'mill') {
        // Leave mill battle active so existing detailed puppet checks continue unchanged
        break;
      }

      // Speed up cutscenes to x2 cleanly before committing opening
      if ((await page.locator('#speed').textContent())?.includes('×1')) {
        await page.locator('#speed').click();
      }
      await waitCutsceneClosed();
      await page.screenshot({ path: path.join(output, `quick-test-${region}.png`) });
      await returnToInn();
    }

    // Speed up cutscenes to x2 cleanly before committing opening
    if ((await page.locator('#speed').textContent())?.includes('×1')) {
      await page.locator('#speed').click();
    }
    await page.waitForFunction(
      () => document.querySelector('#overlord-cutscene-layer')?.hidden !== false,
      null,
      {
        timeout: 15000,
      },
    );
    await page.locator('#commit').click();
    await page.waitForFunction(
      () => {
        const s = window.demo.getState();
        return s.phase === 'plan' && s.round === 1 && !window.demo.getStatus().playing;
      },
      null,
      { timeout: 25000 },
    );

    // Check gold-chain fixed first slot without speed number
    const firstSlotInfo = await page
      .locator('#timeline .time-cell')
      .first()
      .evaluate((el) => ({
        fixed: el.classList.contains('overlord-fixed-cell'),
        hasChains: Boolean(el.querySelector('.timeline-gold-chains')),
        text: el.innerText,
      }));
    assert.equal(firstSlotInfo.fixed, true);
    assert.equal(firstSlotInfo.hasChains, true);
    assert(!firstSlotInfo.text.includes('速度'), firstSlotInfo.text);
    assert(firstSlotInfo.text.includes('定式先制'), firstSlotInfo.text);

    // Commit Round 1 -> Overlord acts first -> locks UI & arms 40s bomb on target hero
    const bombedId = await page.evaluate(
      () => window.demo.getForecast().events.find((e) => e.bombArmed)?.bombArmed?.target,
    );
    assert(bombedId, 'Expected a predicted bomb target in Round 1 forecast');
    const bombedHero = await page.locator(`[data-unit="${bombedId}"]`).boundingBox();
    await page.locator('#commit').click();
    const castOrigin = await page
      .locator('.pixelfx-canvas[data-effect-id="magic-circle-cast"]')
      .first()
      .evaluate((canvas, [x, y]) => {
        const bounds = canvas.getBoundingClientRect();
        return {
          x: bounds.left + (x / canvas.width) * bounds.width,
          y: bounds.top + (y / canvas.height) * bounds.height,
        };
      }, magicCircle.origin);
    assert(
      Math.hypot(
        castOrigin.x - (bombedHero.x + bombedHero.width / 2),
        castOrigin.y - (bombedHero.y + bombedHero.height / 2),
      ) < 2,
      'The base of the bomb magic-circle-cast must align with the bombed target hero',
    );
    await page.waitForFunction(
      () => {
        const s = window.demo.getState();
        return s.phase === 'plan' && s.round === 2 && !window.demo.getStatus().playing;
      },
      null,
      { timeout: 30000 },
    );

    // Illustrated Overlord mechanic tutorial dialog opens after Round 1 & pauses the bomb timer
    const tutDialog = page.locator('#overlord-tutorial-dialog');
    await tutDialog.waitFor({ state: 'visible', timeout: 8000 });
    assert((await tutDialog.locator('#overlord-tutorial-title').innerText()).includes('炼金炸弹'));
    const portrait = tutDialog.locator('.overlord-tutorial-portrait');
    assert.equal(await portrait.getAttribute('alt'), '失败的炼金傀偶');
    const portraitSrc = await portrait.getAttribute('src');
    assert(portraitSrc?.endsWith('.svg'), portraitSrc);
    const paused0 = await page
      .locator('#commit.has-alchemical-bomb .commit-bomb-badge')
      .textContent();
    await page.waitForTimeout(350);
    const paused1 = await page
      .locator('#commit.has-alchemical-bomb .commit-bomb-badge')
      .textContent();
    assert.equal(
      paused1,
      paused0,
      'Bomb countdown must remain paused while tutorial dialog is open',
    );
    await page.locator('#overlord-tutorial-close').click();
    await tutDialog.waitFor({ state: 'hidden', timeout: 5000 });

    const emblemDialogue = page.locator('#gal-stage[data-owner="emblem-dialogue"]');
    await emblemDialogue.waitFor({ state: 'visible', timeout: 5000 });
    await finishGalDialogue(page, 'emblem-dialogue');

    assert.equal(
      await page.evaluate(() => document.body.classList.contains('overlord-ui-locked')),
      true,
    );
    assert.equal(await page.locator('#ai-open').getAttribute('data-overlord-sealed'), 'settings');
    assert.equal(await page.locator('#saves-open').getAttribute('data-overlord-sealed'), 'saves');
    // Test fourth-wall seal interception & dialogue bark (aria-disabled requires force: true in Playwright)
    await page.locator('#ai-open').click({ force: true });
    assert.equal(await page.evaluate(() => document.querySelector('#ai-dialog').open), false);
    await page.locator('#overlord-dialogue-bar').waitFor({ state: 'visible' });
    const barkText = await page.locator('#overlord-dialogue-bar').innerText();
    assert(barkText.includes('系统设置') || barkText.includes('规则'), barkText);

    // Verify artifact gear buff, Round 2 Break Window (from Round 1 Charge_Up), and absence of meta-jargon or ? pills
    assert.equal(await page.locator('.overlord-phase-pips').count(), 0);
    assert.equal(
      await page.locator('[data-unit="alchemicalPuppet"] [data-buff="artifact"]').count(),
      1,
    );
    await page
      .locator('[data-unit="alchemicalPuppet"] .enemy-break-rail.is-special')
      .waitFor({ state: 'visible' });
    assert(
      (await page.locator('[data-unit="alchemicalPuppet"] .break-ring .break-seg').count()) >= 2,
    );
    assert.equal(await page.locator('.break-pip').count(), 0);
    assert.equal(await page.locator('.enemy-break-rail [title]').count(), 0);
    const breakTooltips = page.locator('.enemy-break-rail [data-tooltip]');
    assert((await breakTooltips.count()) >= 1);
    await breakTooltips.first().hover();
    await page.locator('#hover-tooltip').waitFor({ state: 'visible' });
    assert.equal(
      await page.locator('#hover-tooltip').evaluate((el) => getComputedStyle(el).pointerEvents),
      'none',
    );
    assert.equal(
      await page.locator('[data-unit="alchemicalPuppet"] .enemy-weakness-pill.is-major').count(),
      1,
    );
    assert.equal(await page.locator('.enemy-weakness-pill.is-unknown').count(), 0);
    const battleText = await page.locator('#battle').innerText();
    assert(!/压迫战|第二阶段|第三阶段/.test(battleText), battleText);

    // Verify dual countdown UI ticks downward (pending is phantom icon-only, active shows ticking timer)
    const pendingBadge = page.locator('.alchemical-bomb-badge.is-pending').first();
    if ((await pendingBadge.count()) > 0) {
      assert.equal((await pendingBadge.innerText()).trim(), '');
    }
    await page.locator('.alchemical-bomb-badge.is-active').first().waitFor({ state: 'visible' });
    await page
      .locator('#commit.has-alchemical-bomb .commit-bomb-badge')
      .waitFor({ state: 'visible' });
    const t0 = await page.locator('#commit.has-alchemical-bomb .commit-bomb-badge').textContent();
    await page.waitForTimeout(550);
    const t1 = await page.locator('#commit.has-alchemical-bomb .commit-bomb-badge').textContent();
    const n0 = Number.parseFloat(String(t0).replace(/[^0-9.]/g, ''));
    const n1 = Number.parseFloat(String(t1).replace(/[^0-9.]/g, ''));
    assert(
      Number.isFinite(n0) && Number.isFinite(n1) && n1 < n0,
      `Timer did not tick: ${t0} -> ${t1}`,
    );

    await page.screenshot({ path: path.join(output, 'overlord-puppet-battle.png') });

    // Force timer expiry -> detonates bomb & auto-commits round
    await page.evaluate(() => window.demo.expireBombNow());
    await page.waitForFunction(
      () => {
        const s = window.demo.getState();
        return (
          !window.demo.getStatus().playing &&
          (s.round >= 3 || s.phase === 'defeat' || s.phase === 'victory')
        );
      },
      null,
      { timeout: 30000 },
    );

    // Reloading browser during active Overlord battle triggers the fourth-wall reload bark
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#overlord-dialogue-bar').waitFor({ state: 'visible', timeout: 10000 });
    const reloadBarkText = await page.locator('#overlord-dialogue-bar').innerText();
    assert(reloadBarkText.includes('刷新'), reloadBarkText);

    assert.deepEqual(calls, []);
    assert.deepEqual(errors, []);
    return {
      mergedAndPersisted: true,
      normalModeRestoresGeneration: true,
      allSevenRequestsBlocked: true,
      disabledButtons: true,
      localDungeonAvailable: true,
      quickTestDirectOverlord: true,
      quickTestAllOverlords: true,
      overlordDomainSeal: true,
      alchemicalBombTimer: true,
      reloadFourthWallBark: true,
      paidRequests: 0,
    };
  } catch (failure) {
    if (errors.length) failure.message += `\nPage errors: ${errors.join(' | ')}`;
    await page
      .screenshot({ path: path.join(output, 'developer-mode-failure.png') })
      .catch(() => {});
    throw failure;
  } finally {
    await page.close();
  }
}
