import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { newCampaign } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { createConnectionStore } from '../../src/ai/connection-store.js';

/** Reopen a real on-disk browser profile; no real credentials, services or paid calls are used. */
export async function credentialPersistenceChecks({ browser, baseURL, output }) {
  const profileDirectory = await mkdtemp(path.join(output, 'device-'));
  const secret = 'PERSISTENCE_BROWSER_FIXTURE_KEY';
  let context,
    page,
    calls = 0;
  const launch = async (suffix = '') => {
    context = await browser.browserType().launchPersistentContext(profileDirectory, {
      channel: process.env.TEST_BROWSER || 'msedge',
      headless: true,
      viewport: { width: 1440, height: 900 },
      args: ['--enable-webgl', '--ignore-gpu-blocklist'],
    });
    page = context.pages()[0] || (await context.newPage());
    await page.route('https://persistence-fixture.invalid/**', async (route) => {
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      };
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      calls++;
      assert.equal(route.request().headers().authorization, `Bearer ${secret}`);
      await route.fulfill({
        status: 429,
        headers,
        json: {
          error: {
            message: 'Fixture generation deliberately stopped after verifying the saved credential',
          },
        },
      });
    });
    await page.goto(baseURL + '/' + suffix);
    await page.waitForFunction(() => !!window.demo);
    assert.equal(await page.locator('meta[name="wanxiang-test-backend"]').count(), 0);
  };
  const openSettings = async () => {
    await page.locator('#ai-open').click();
    await page.locator('#ai-kind').selectOption('script');
    await page.waitForFunction(() => !document.querySelector('#ai-model').disabled);
  };
  try {
    await launch();
    const library = newCampaign(defaultProtagonist());
    Object.assign(library.campaign, { completed: true, firstRecruit: true, tutorial: 'done' });
    const profiles = createConnectionStore().visible();
    for (const [kind, profile] of Object.entries(profiles))
      Object.assign(profile, {
        baseUrl: 'https://persistence-fixture.invalid/v1',
        model: 'fixture-model',
        apiKey: '',
        requestMode: 'browser',
        rememberKey: false,
        apiPresetId: 'api-old',
        promptPresetId: kind === 'summary' ? null : 'prompt-credential-test',
      });
    await page.evaluate(
      async ({ profiles, library }) => {
        const { openDatabase } = await import('/src/storage/database.js');
        const db = await openDatabase();
        await db.write([
          [
            'api.config',
            {
              version: 4,
              profiles,
              apiPresets: [{ ...profiles.script, id: 'api-old', name: '旧连接' }],
            },
          ],
          ['game.wanxiang.worldbooks.v1', JSON.stringify(library)],
          ['game.wanxiang.creation-pending.v1', 'false'],
          ['game.wanxiang.setup.completed.v1', 'true'],
          [
            'prompt.prompt-credential-test',
            {
              name: 'Fixture',
              prompts: [
                { identifier: 'main', role: 'system', content: '继续旅途' },
                { identifier: 'chatHistory', marker: true },
              ],
            },
          ],
        ]);
        db.close();
      },
      { profiles, library },
    );
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await openSettings();
    assert.equal(await page.locator('#ai-rememberKey').isChecked(), false);
    await page.locator('#ai-key').fill(secret);
    await page.locator('#ai-profile-save').click();
    await page.locator('#ai-status').filter({ hasText: '仅本次有效' }).waitFor();
    assert.match(await page.locator('#ai-profile-save').textContent(), /关闭后需重填/);
    await context.close();

    await launch('?v=after-shutdown');
    await openSettings();
    assert.match(await page.locator('#ai-key').getAttribute('placeholder'), /重新输入/);
    await page.locator('#ai-key').fill(secret);
    await page.locator('#ai-remember-and-save').click();
    await page.locator('#ai-status').filter({ hasText: '已保存到此设备' }).waitFor();
    assert(await page.locator('#ai-rememberKey').isChecked());
    for (const kind of ['character', 'chat', 'quick-chat', 'summary', 'creation', 'map'])
      await page.locator(`[data-apply-kind][value="${kind}"]`).check();
    await page.locator('#api-preset-apply-many').click();
    await page.locator('#ai-status').filter({ hasText: '应用到 6 个 API' }).waitFor();
    await page.screenshot({ path: path.join(output, 'key-saved-to-device.png') });
    await context.close();

    await launch('?v=after-code-update');
    await openSettings();
    assert.match(await page.locator('#ai-key').getAttribute('placeholder'), /已在此设备记住/);
    await page.locator('#ai-close').click();
    await page.evaluate(() => demo.startBattle());
    await page.locator('#destination-region-confirm').click();
    const sent = page.waitForRequest('https://persistence-fixture.invalid/**');
    await page.locator('#destination-start').click();
    await sent;
    await page.waitForFunction(() => !document.querySelector('#party-panel').open, {
      timeout: 30000,
    });
    assert.equal(
      calls,
      1,
      'script generation must reach the mocked upstream after a full browser restart',
    );
    assert.equal(
      await page.locator('#ai-dialog').isVisible(),
      false,
      'the key configuration dialog must not reopen',
    );
    return {
      fullBrowserRestarts: 2,
      updateURLRetainsKey: true,
      explicitSessionOnly: true,
      scriptGenerationUsesSavedKey: true,
      paidRequests: 0,
    };
  } catch (failure) {
    await page?.screenshot({ path: path.join(output, 'credential-failure.png') });
    const state = await page?.evaluate(async () => {
      const { openDatabase } = await import('/src/storage/database.js');
      const db = await openDatabase();
      const snapshot = {
        staticMode: !document.querySelector('meta[name="wanxiang-test-backend"]'),
        installation: !!db.get('installation'),
        library: !!db.get('game.wanxiang.worldbooks.v1'),
        creationPending: db.get('game.wanxiang.creation-pending.v1'),
        setupCompleted: db.get('game.wanxiang.setup.completed.v1'),
        hasConfig: !!db.get('api.config'),
      };
      db.close();
      return snapshot;
    });
    throw Error(`${failure.message}\nStorage fixture: ${JSON.stringify(state)}`, {
      cause: failure,
    });
  } finally {
    await context?.close();
  }
}
