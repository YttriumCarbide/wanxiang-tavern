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
    '#script-rewrite',
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
    assert.deepEqual(calls, []);
    assert.deepEqual(errors, []);
    return {
      mergedAndPersisted: true,
      normalModeRestoresGeneration: true,
      allSevenRequestsBlocked: true,
      disabledButtons: true,
      localDungeonAvailable: true,
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
