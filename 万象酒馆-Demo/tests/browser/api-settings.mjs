import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

export async function antiRouteChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [],
    calls = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await legacySession(page);
  await page.route('https://route-fixture.invalid/**', async (route) => {
    const request = route.request();
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization,content-type,x-goog-api-key',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push({ url: request.url(), body: request.postDataJSON(), headers: request.headers() });
    if (request.url().includes(':generateContent'))
      return route.fulfill({
        headers,
        json: {
          modelVersion: 'gemini-3-pro',
          candidates: [{ content: { parts: [{ text: 'ok' }] } }],
        },
      });
    if (request.postDataJSON().model.includes('zzz-not-a-real-model'))
      return route.fulfill({ headers, status: 404, json: { error: { message: 'unknown model' } } });
    return route.fulfill({
      headers,
      json: { model: 'gemini-3-pro', choices: [{ message: { content: 'ok' } }] },
    });
  });
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#ai-open').click();
    await page.waitForFunction(() => !document.querySelector('#ai-model').disabled);
    await page.locator('#ai-kind').selectOption('character');
    await page.locator('#ai-requestMode').selectOption('browser');
    await page.locator('#ai-baseUrl').fill('https://route-fixture.invalid/v1');
    await page.locator('#ai-model').fill('gemini-3-pro');
    await page.locator('#ai-key').fill('ANTI_ROUTE_TEST_KEY');
    await page.locator('#ai-profile-save').click();
    await page.locator('#ai-status').filter({ hasText: '当前连接仅本次有效' }).waitFor();
    await page.locator('[data-ai-tab="anti-route"]').click();
    await page.waitForFunction(() => document.querySelector('#route-verify').checked);
    assert.match(await page.locator('.route-settings > small').innerText(), /V0\.5.*8\.31/);
    assert.equal(await page.locator('#route-entropy').isChecked(), false);
    assert.equal(await page.locator('#route-entropyMode').inputValue(), 'refract');
    const attribution = page.locator('.route-settings .route-attribution');
    assert.match(await attribution.innerText(), /原作者：凯撒王/);
    assert.equal(
      await attribution.locator('a').getAttribute('href'),
      'https://discord.com/channels/1134557553011998840/1566099901245432009',
    );
    assert.equal(await attribution.locator('a svg').count(), 1);
    assert.equal(await page.locator('#route-entropyStrength').inputValue(), 'mid');
    const panelBox = await page.locator('.route-settings').boundingBox();
    const workspaceBox = await page.locator('#ai-dialog .ai-workspace').boundingBox();
    assert(panelBox.y >= workspaceBox.y, 'opening the tab resets the settings scroll position');
    await page.screenshot({ path: path.join(output, 'anti-route-settings.png') });
    await page.locator('#route-enabled').uncheck();
    await page.locator('#route-entropyMode').selectOption('ref');
    await page.locator('#route-entropyStrength').selectOption('heavy');
    await page.locator('#route-scope').selectOption('only');
    await page.locator('#route-scopeList').fill('gemini');
    await page.locator('#route-know').selectOption('full');
    await page.locator('#route-saltWin').fill('45');
    await page.locator('#route-save').click();
    await page.locator('#route-status').filter({ hasText: '防护设置已保存' }).waitFor();
    await page.locator('[data-route-probe="native"]').click();
    await page
      .locator('#route-probe-result')
      .filter({ hasText: 'modelVersion：gemini-3-pro' })
      .waitFor();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].headers['x-goog-api-key'], 'ANTI_ROUTE_TEST_KEY');
    await page.locator('[data-route-probe="dual"]').click();
    await page.locator('#route-probe-result').filter({ hasText: '明确拒绝' }).waitFor();
    assert.equal(calls.length, 3);
    await page.locator('#route-aliases').fill('gemini-3-pro gemini-3-pro-zzz-not-a-real-model');
    await page.locator('[data-route-probe="aliases"]').click();
    await page.locator('#route-probe-result').filter({ hasText: '探测未修改当前连接' }).waitFor();
    assert.match(
      await page.locator('#route-probe-result').innerText(),
      /gemini-3-pro：成功.*接口明确拒绝/,
    );
    assert.equal(calls.length, 5);
    await page.evaluate(async () => {
      await fetch('/api/ai/anti-route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'report',
          report: {
            at: Date.now(),
            kind: 'character',
            reqModel: '<img src=x onerror="window.routeXss=true">',
            respModel: 'gemini-3-pro',
            verdict: 'diff',
            raw: '<script>example</script>',
            thoughtTokens: -1,
          },
        }),
      });
    });
    await page.locator('#route-refresh').click();
    await page.locator('[data-route-record]').first().click();
    assert((await page.locator('#route-raw').inputValue()).includes('<script>example</script>'));
    assert.equal(await page.locator('#route-records img').count(), 0);
    await page.screenshot({ path: path.join(output, 'anti-route-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('#route-entropyStrength').scrollIntoViewIfNeeded();
    assert(await page.locator('#route-entropyStrength').isVisible());
    await page.screenshot({ path: path.join(output, 'anti-route-landscape.png') });
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#ai-open').click();
    await page.locator('[data-ai-tab="anti-route"]').click();
    await page.waitForFunction(() => document.querySelector('#route-entropyMode').value === 'ref');
    assert.equal(await page.locator('#route-enabled').isChecked(), false);
    assert.equal(await page.locator('#route-verify').isChecked(), true);
    assert.equal(await page.locator('#route-entropyStrength').inputValue(), 'heavy');
    assert.equal(await page.locator('#route-scope').inputValue(), 'only');
    assert.equal(await page.locator('#route-scopeList').inputValue(), 'gemini');
    assert.equal(await page.locator('#route-know').inputValue(), 'full');
    assert.equal(await page.locator('#route-saltWin').inputValue(), '45');
    await page.locator('#route-clear').click();
    await page.locator('#route-records').filter({ hasText: '暂无响应记录' }).waitFor();
    assert.equal(await page.locator('#route-raw').inputValue(), '');
    assert.deepEqual(errors, []);
    return {
      persistence: true,
      directNativeProbe: true,
      dualProbe: true,
      aliasProbe: true,
      escapedRecords: true,
      landscape: true,
    };
  } finally {
    await page.close();
  }
}

export async function firstRunApplyChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 667, height: 375 }, hasTouch: true });
  try {
    await page.goto(baseURL + '/?display=landscape');
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#start-journey').click();
    await page.locator('#setup-wizard[data-step="mode"]').waitFor({ state: 'visible' });
    await page.locator('#setup-mode-free').click();
    await page.locator('#ai-dialog[data-setup="connections"]').waitFor();
    await page.waitForFunction(() => !document.querySelector('#ai-model').disabled);
    const intro = await page.locator('#setup-intro').boundingBox();
    const workspace = await page.locator('#ai-dialog .ai-workspace').boundingBox();
    assert(intro.height < 55, 'compact setup guidance leaves space for the actual form');
    assert(workspace.height > 160, 'the setup form owns most of the mobile dialog');
    await page.screenshot({ path: path.join(output, 'first-run-form-mobile.png') });
    for (const id of ['ai-baseUrl', 'ai-model', 'ai-key']) {
      const field = await page.locator('#' + id).boundingBox();
      assert(
        field.y >= workspace.y && field.y + field.height <= workspace.y + workspace.height,
        `address, model and key are visible before scrolling: ${id} ${JSON.stringify({ field, workspace })}`,
      );
    }
    await page.locator('#ai-baseUrl').fill('http://127.0.0.1:9999/v1');
    await page.locator('#ai-model').fill('first-run-fixture');
    await page.locator('#ai-key').fill('test-only-key');
    for (const id of ['script', 'chat', 'creation'])
      await page.locator(`[data-apply-kind][value="${id}"]`).check();
    const confirm = page.locator('#setup-apply');
    await confirm.scrollIntoViewIfNeeded();
    const box = await confirm.boundingBox();
    assert(
      box.y >= 0 && box.y + box.height <= 375,
      'first setup confirmation stays inside the mobile viewport',
    );
    await confirm.click();
    await page.waitForFunction(() =>
      document.querySelector('#ai-status').textContent.includes('已将所选连接预设应用到 3'),
    );
    const profiles = await page.evaluate(async () => (await fetch('/api/ai/config')).json());
    for (const id of ['script', 'chat', 'quick-chat', 'creation'])
      assert.equal(profiles[id].model, 'first-run-fixture');
    await page.screenshot({ path: path.join(output, 'first-run-confirm-mobile.png') });
    for (const id of ['summary', 'map'])
      await page.locator(`[data-apply-kind][value="${id}"]`).check();
    await confirm.click();
    await page.locator('#ai-status').filter({ hasText: '已将所选连接预设应用到 5' }).waitFor();
    await page.locator('#setup-next').click();
    await page.locator('#new-game[open]').waitFor({ state: 'visible' });
  } finally {
    await page.close();
  }

  // Lazy mode onboarding + split dual-model setup without preset import + restyled protagonist creation
  const lazyPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await lazyPage.route('**/api/ai/models/*', (route) =>
      route.fulfill({ json: { models: ['strong-script-model', 'fast-helper-model'] } }),
    );
    await lazyPage.goto(baseURL);
    await lazyPage.waitForFunction(() => !!window.demo);
    await lazyPage.evaluate(() => localStorage.removeItem('wanxiang.setup.completed.v1'));
    await lazyPage.locator('#start-journey').click();
    await lazyPage.locator('#setup-wizard[data-step="mode"]').waitFor({ state: 'visible' });
    await lazyPage.locator('#setup-mode-lazy').click();
    await lazyPage.locator('#setup-wizard[data-step="lazy-primary"]').waitFor({ state: 'visible' });

    await lazyPage.locator('#wizard-url').fill('http://127.0.0.1:9999/v1');
    await lazyPage.locator('#wizard-key').fill('lazy-test-key');
    await lazyPage.locator('#wizard-fetch-models').click();
    await lazyPage.locator('#wizard-model-list').waitFor({ state: 'visible' });
    await lazyPage.locator('#wizard-model-list').selectOption('strong-script-model');
    assert.equal(await lazyPage.locator('#wizard-model').inputValue(), 'strong-script-model');
    await lazyPage.locator('#wizard-primary-next').click();

    await lazyPage.locator('#setup-wizard[data-step="lazy-split"]').waitFor({ state: 'visible' });
    await lazyPage.locator('#wizard-split-yes').click();
    await lazyPage
      .locator('#setup-wizard[data-step="lazy-secondary"]')
      .waitFor({ state: 'visible' });
    assert.equal(
      await lazyPage.locator('#wizard-sec-url').inputValue(),
      'http://127.0.0.1:9999/v1',
    );
    assert.equal(await lazyPage.locator('#wizard-sec-key').inputValue(), 'lazy-test-key');
    await lazyPage.locator('#wizard-sec-fetch-models').click();
    await lazyPage.locator('#wizard-sec-model-list').waitFor({ state: 'visible' });
    await lazyPage.locator('#wizard-sec-model-list').selectOption('fast-helper-model');
    await lazyPage.locator('#wizard-secondary-next').click();

    await lazyPage.locator('#new-game[open]').waitFor({ state: 'visible' });
    assert.equal(await lazyPage.locator('#wizard-preset-file').count(), 0);
    const cfg = await lazyPage.evaluate(async () => (await fetch('/api/ai/config')).json());
    assert.equal(cfg.script.model, 'strong-script-model');
    for (const k of ['character', 'chat', 'summary', 'map', 'creation']) {
      assert.equal(cfg[k].model, 'fast-helper-model');
    }

    await lazyPage.locator('[data-gender-preset="女"]').click();
    assert.equal(await lazyPage.locator('#creation-form input[name="gender"]').inputValue(), '女');
    await lazyPage.locator('[data-personality-preset="冷静果决"]').click();
    await lazyPage.locator('[data-personality-preset="毒舌护短"]').click();
    assert.equal(
      await lazyPage.locator('#creation-form textarea[name="personality"]').inputValue(),
      '冷静果决、毒舌护短',
    );
    assert.equal(await lazyPage.locator('#creation-form select[name="skillStyle1"]').count(), 1);
    assert.equal(await lazyPage.locator('#creation-form select[name="skillStyle2"]').count(), 1);
    await lazyPage.screenshot({ path: path.join(output, 'lazy-setup-and-creation.png') });
    return {
      mobileConfirmation: true,
      appliesSelectedProfiles: true,
      lazySplitSetup: true,
      creationChipsAndStyles: true,
    };
  } finally {
    await lazyPage.close();
  }
}

export async function apiSettingsChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures = [];
  page.on('pageerror', (failure) => failures.push(failure.message));
  await legacySession(page);
  await page.route('**/api/ai/models/*', (route) =>
    route.fulfill({ json: { models: ['z-model', 'a-model', 'b-model'] } }),
  );
  let connections = [];
  async function post(route, body) {
    return page.evaluate(
      async ({ route, body }) => {
        const response = await fetch('/api/ai/' + route, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) throw Error(data.error);
        return data;
      },
      { route, body },
    );
  }
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#ai-open').click();
    assert.equal(await page.locator('[data-ai-page="settings"] #api-prompt-select').count(), 0);
    await page.locator('#ai-baseUrl').fill('http://127.0.0.1:9999/v1');
    await page.locator('#ai-model').fill('manual-model');
    await page.locator('#ai-key').fill('test-connection-secret');
    await page.locator('#api-preset-name').fill('第一连接');
    await page.locator('#ai-models').click();
    await page.locator('#ai-model-list').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#helper-dialog').count(), 0);
    assert.equal(await page.locator('#api-preset-name').inputValue(), '第一连接');
    assert.deepEqual(await page.locator('#ai-model-list option').allTextContents(), [
      'a-model',
      'b-model',
      'z-model',
    ]);
    await page.locator('#ai-model-list').selectOption('b-model');
    assert.equal(await page.locator('#ai-model').inputValue(), 'b-model');
    await page.locator('#api-preset-save').click();
    await page.waitForFunction(() =>
      document.querySelector('#api-preset-select').value.startsWith('api-'),
    );
    const first = await page.locator('#api-preset-select').inputValue();
    connections.push(first);
    assert.equal(await page.locator('#api-preset-select option:checked').textContent(), '第一连接');
    await page.locator('#api-preset-name').fill('第二连接');
    await page.locator('#ai-model').fill('custom-model');
    await page.locator('#api-preset-save').click();
    await page.waitForFunction(
      (id) => document.querySelector('#api-preset-select').value !== id,
      first,
    );
    const second = await page.locator('#api-preset-select').inputValue();
    connections.push(second);
    await page.locator('#ai-close').click();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#ai-open').click();
    await page.locator('#ai-kind').selectOption('script');
    await page.locator('#api-preset-select').selectOption(first);
    await page.waitForFunction(() => document.querySelector('#ai-model').value === 'b-model');
    await page.locator('#api-preset-select').selectOption(second);
    await page.waitForFunction(() => document.querySelector('#ai-model').value === 'custom-model');
    assert.equal(await page.locator('#ai-key').inputValue(), '');
    assert.equal(
      await page.locator('#ai-key').evaluate((node) => {
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        node.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      false,
    );
    await page.screenshot({ path: path.join(output, 'api-connections-selectable.png') });
    await page.locator('#ai-kind').selectOption('summary');
    await page.locator('#api-preset-select').selectOption(first);
    await page.waitForFunction(() => document.querySelector('#ai-model').value === 'b-model');
    await page.locator('#ai-dialog details').first().locator('summary').click();
    await page.locator('#ai-contextSize').fill('64000');
    await page.locator('#ai-profile-save').click();
    await page.locator('#ai-status').filter({ hasText: '当前连接已保存' }).waitFor();
    const summaryConnection = await page.evaluate(
      async () => (await (await fetch('/api/ai/config')).json()).summary,
    );
    assert.equal(summaryConnection.contextSize, 64000);
    assert.equal(summaryConnection.promptPresetId, 'summary-default');
    assert.equal(await page.locator('#prompt-kind option[value="summary"]').count(), 1);
    await page.locator('[data-ai-tab="prompts"]').click();
    await page.locator('#prompt-kind').selectOption('chat');
    assert.equal(await page.locator('#prompt-import-file, #ai-regex, #helper-open').count(), 0);
    const style = page.locator('[data-prompt-option="style"]');
    await style.selectOption('sensory');
    await page.locator('#prompt-options-save').click();
    await page.locator('#ai-status').filter({ hasText: '已保存小猫之神' }).waitFor();
    const previewResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/ai/prompts/preview') &&
        response.request().method() === 'POST',
    );
    await page.locator('#prompt-preview').click();
    const response = await previewResponse;
    const preview = await response.json();
    assert(response.ok(), JSON.stringify(preview));
    assert(preview.messages.some((message) => message.content.includes('五感')));
    assert(preview.messages.some((message) => message.content.includes('wanxiang_output')));
    assert(preview.tokens.inputEstimate > 0);
    assert.equal(preview.regex, undefined);
    await page.screenshot({ path: path.join(output, 'builtin-preset-preview.png') });
    // Real browser fetch: the visible model picker uses the direct adapter and a page-only key.
    const directCalls = [];
    await page.route('https://direct-fixture.invalid/**', async (route) => {
      const request = route.request();
      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      directCalls.push({ url: request.url(), authorization: request.headers().authorization });
      return route.fulfill({
        headers,
        json: { data: [{ id: 'direct-one' }, { id: 'direct-two' }] },
      });
    });
    await page.locator('#ai-close').click();
    await page.locator('#ai-open').click();
    await page.locator('#ai-kind').selectOption('character');
    await page.locator('#ai-requestMode').selectOption('browser');
    assert.equal(await page.locator('#ai-rememberKey').isDisabled(), true);
    await page.locator('#ai-baseUrl').fill('https://direct-fixture.invalid/v1');
    await page.locator('#ai-model').fill('direct-one');
    await page.locator('#ai-key').fill('BROWSER_SESSION_ONLY');
    await page.locator('#ai-models').click();
    await page.locator('#ai-model-list option[value="direct-two"]').waitFor();
    assert.equal(directCalls.length, 1);
    assert.equal(directCalls[0].authorization, 'Bearer BROWSER_SESSION_ONLY');
    const stored = await page.evaluate(async () => ({
      browser: JSON.stringify({ ...localStorage }),
      config: JSON.stringify(await (await fetch('/api/ai/config')).json()),
    }));
    assert(!stored.browser.includes('BROWSER_SESSION_ONLY'));
    assert(!stored.config.includes('BROWSER_SESSION_ONLY'));
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#ai-open').click();
    await page.locator('#ai-models').click();
    await page.locator('#ai-status').filter({ hasText: '重新输入密钥' }).waitFor();
    assert.equal(directCalls.length, 1);
    await page.screenshot({ path: path.join(output, 'browser-direct-api.png') });
    await page.locator('#ai-requestMode').selectOption('local');
    await page.locator('#ai-baseUrl').fill('http://127.0.0.1:9999/v1');
    await page.locator('#ai-profile-save').click();
    await page.locator('#ai-worldbooks').click();
    await page.locator('#world-dialog').waitFor({ state: 'visible' });
    await page.locator('#world-entry-list .world-expand').first().click();
    const worldText = page.locator('#world-entry-fields textarea[data-world-field="content"]');
    await worldText.waitFor({ state: 'visible' });
    assert.equal(
      await worldText.evaluate((node) => {
        const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
        node.dispatchEvent(event);
        return event.defaultPrevented;
      }),
      false,
    );
    assert.equal(await worldText.evaluate((node) => getComputedStyle(node).userSelect), 'text');
    await page.locator('#world-close').click();
    assert.deepEqual(failures, []);
    return {
      connectionSaveReload: true,
      browserDirectModels: true,
      directKeyMemoryOnly: true,
      twoConnectionsSelectable: true,
      visibleModelList: true,
      promptsSeparate: true,
      builtinPreset: true,
      preview: true,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'api-settings-failure.png') }).catch(() => {});
    failure.message += '\n界面状态：' + (await page.locator('#ai-status').textContent());
    throw failure;
  } finally {
    for (const id of connections)
      await post('presets', { action: 'delete', kind: 'character', id }).catch(() => {});
    await page.close();
  }
}
