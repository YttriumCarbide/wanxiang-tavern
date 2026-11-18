import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

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
    await page.route(`${repository}/archive/refs/heads/main.zip`, (route) =>
      route.fulfill({
        headers: {
          'content-type': 'application/zip',
          'content-disposition': 'attachment; filename="wanxiang-tavern-main.zip"',
        },
        body: '',
      }),
    );
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('link', { name: '下载游戏到本地' }).click(),
    ]);
    assert.equal(download.suggestedFilename(), 'wanxiang-tavern-main.zip');
    assert.equal(
      await page.getByRole('link', { name: '打开 GitHub 仓库' }).getAttribute('href'),
      repository,
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

    async function openGateAndSelectMill() {
      const frame = page.frameLocator('#inn-frame iframe');
      await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('gate'));
      await frame.locator('#enter').click();
      await page.locator('#destination-dialog[data-stage="region"]').waitFor({ state: 'visible' });
      await page.locator('#destination-regions button[data-region="mill"]').click();
      await page.locator('#destination-region-confirm').click();
      await page.locator('#destination-route-screen').waitFor({ state: 'visible' });
    }

    // Return to inn and verify quickTest non-destructively swaps mill Stage 1 <-> Stage 4 & runs Overlord fight
    await page.evaluate(() => window.demo.returnInn());
    await page.waitForFunction(() => window.demo.getStatus().mode === 'inn');
    await openOptions();
    const quickCheckbox = page.locator('[data-generation-option="quickTest"]');
    await quickCheckbox.check();
    await page.locator('#ai-close').click();

    await openGateAndSelectMill();
    const swappedNodeText = await page
      .locator('#destination-map [data-map-node]')
      .first()
      .innerText();
    assert(swappedNodeText.includes('磨坊阁楼齿轮室'), swappedNodeText);
    assert(
      await page
        .locator('#destination-map [data-map-node]')
        .first()
        .evaluate((el) => el.classList.contains('is-overlord')),
      'Node 1 should show Overlord mark while quickTest is active',
    );

    // Toggle quickTest OFF -> node 1 restores to regular stage 1
    await page.locator('#destination-close').click();
    await openOptions();
    await quickCheckbox.uncheck();
    await page.locator('#ai-close').click();
    await openGateAndSelectMill();
    const restoredNodeText = await page
      .locator('#destination-map [data-map-node]')
      .first()
      .innerText();
    assert(restoredNodeText.includes('外围水渠与篱笆'), restoredNodeText);
    assert(
      !(await page
        .locator('#destination-map [data-map-node]')
        .first()
        .evaluate((el) => el.classList.contains('is-overlord'))),
      'Node 1 should restore when quickTest is disabled',
    );

    // Enable quickTest again and launch direct Overlord battle
    await page.locator('#destination-close').click();
    await openOptions();
    await quickCheckbox.check();
    await page.locator('#ai-close').click();
    await openGateAndSelectMill();
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
    const directExp = await page.evaluate(() => ({
      index: window.demo.getExpedition().index,
      enemies: window.demo.getState().enemyIds,
    }));
    assert.equal(directExp.index, 4);
    assert.deepEqual(directExp.enemies, ['alchemicalPuppet']);

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

    // Commit Round 1 -> Overlord acts first -> locks UI & arms 40s bomb
    await page.locator('#commit').click();
    await page.waitForFunction(
      () => {
        const s = window.demo.getState();
        return s.phase === 'plan' && s.round === 2 && !window.demo.getStatus().playing;
      },
      null,
      { timeout: 30000 },
    );
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

    // Verify artifact gear buff & absence of stage 1/2/3 pips or meta-jargon text
    assert.equal(await page.locator('.overlord-phase-pips').count(), 0);
    assert.equal(
      await page.locator('[data-unit="alchemicalPuppet"] [data-buff="artifact"]').count(),
      1,
    );
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

    assert.deepEqual(calls, []);
    assert.deepEqual(errors, []);
    return {
      mergedAndPersisted: true,
      normalModeRestoresGeneration: true,
      allSevenRequestsBlocked: true,
      disabledButtons: true,
      localDungeonAvailable: true,
      quickTestDirectOverlord: true,
      overlordDomainSeal: true,
      alchemicalBombTimer: true,
      paidRequests: 0,
    };
  } catch (failure) {
    await page
      .screenshot({ path: path.join(output, 'developer-mode-failure.png') })
      .catch(() => {});
    throw failure;
  } finally {
    await page.close();
  }
}
