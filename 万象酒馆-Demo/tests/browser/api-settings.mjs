import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

export async function firstRunApplyChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 667, height: 375 }, hasTouch: true });
  try {
    await page.goto(baseURL + '/?display=landscape');
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#start-journey').click();
    await page.locator('#ai-dialog[data-setup="connections"]').waitFor();
    await page.waitForFunction(() => !document.querySelector('#ai-model').disabled);
    await page.locator('#ai-baseUrl').fill('http://127.0.0.1:9999/v1');
    await page.locator('#ai-model').fill('first-run-fixture');
    await page.locator('#ai-key').fill('test-only-key');
    for (const id of ['script', 'quick-chat', 'creation'])
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
    for (const id of ['script', 'quick-chat', 'creation'])
      assert.equal(profiles[id].model, 'first-run-fixture');
    await page.screenshot({ path: path.join(output, 'first-run-confirm-mobile.png') });
    return { mobileConfirmation: true, appliesSelectedProfiles: true };
  } finally {
    await page.close();
  }
}

export async function apiSettingsChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures = [],
    imported = [];
  let helperLoads = 0;
  page.on('request', (request) => {
    if (request.url().includes('/api/ai/helper-storage/')) helperLoads++;
  });
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
    assert.equal(helperLoads, 0, 'connection settings must not load prompt helper scripts');
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
    assert.equal(summaryConnection.promptPresetId, null);
    assert.equal(await page.locator('#prompt-kind option[value="summary"]').count(), 0);
    await page.locator('[data-ai-tab="prompts"]').click();
    await page.locator('#prompt-kind').selectOption('chat');
    const file = process.env.WANXIANG_TEST_PRESET_FILE;
    const fixture = file
      ? { name: path.basename(file), mimeType: 'application/json', buffer: await readFile(file) }
      : {
          name: 'compatibility.json',
          mimeType: 'application/json',
          buffer: Buffer.from(
            JSON.stringify({
              prompts: [
                {
                  identifier: 'main',
                  name: '主提示',
                  content: '自然回答 {{lastUserMessage}}，骰子 {{roll 1d999999}}。',
                  role: 'system',
                },
                { identifier: 'chatHistory', marker: true },
              ],
              openai_max_context: 2000000,
              openai_max_tokens: 30000,
              extensions: { regex_scripts: [], tavern_helper: { scripts: [] } },
            }),
          ),
        };
    await page.locator('#prompt-import-file').setInputFiles(fixture);
    await page
      .locator('#ai-status')
      .filter({ hasText: '已导入并应用' })
      .waitFor({ timeout: 60000 });
    const id = await page.locator('#prompt-select').inputValue();
    imported.push(id);
    const saved = await page.evaluate(
      async (id) => (await (await fetch('/api/ai/prompts/' + id)).json()).preset,
      id,
    );
    const profile = await page.evaluate(async () => await (await fetch('/api/ai/config')).json());
    assert.equal(profile.chat.promptPresetId, id);
    assert.equal(
      await page.locator('#ai-kind').inputValue(),
      'summary',
      'Prompt purpose must not change the connection form',
    );
    assert.equal(Number(await page.locator('[data-sampling="contextSize"]').inputValue()), 2000000);
    if (file) {
      assert.equal(saved.prompts.length, 232);
      assert.equal(saved.extensions.regex_scripts.length, 32);
      assert(saved.extensions.tavern_helper.scripts[0].content.length > 1000000);
    }
    const separate = await post('prompts/save', { preset: { ...saved, name: '独立用途预设' } });
    imported.push(separate.preset.id);
    await post('prompts/select', { kind: 'creation', id: separate.preset.id });
    await page.locator('[data-prompt-entry="main"] .prompt-edit-name').click();
    const main = page.locator('#prompt-entry-dialog [data-prompt-field="content"]');
    await main.fill((await main.inputValue()) + '\nPRESET_NEXT_REQUEST_FRESH');
    await page.locator('#prompt-entry-save').click();
    await page.locator('[data-apply-prompt-kind][value="script"]').check();
    await page.locator('[data-apply-prompt-kind][value="quick-chat"]').check();
    await page.locator('#prompt-apply-many').click();
    await page.locator('#ai-status').filter({ hasText: '已将当前预设及调节应用到 2' }).waitFor();
    const nextProfiles = await page.evaluate(async () => (await fetch('/api/ai/config')).json());
    assert.equal(nextProfiles.script.promptPresetId, id);
    assert.equal(nextProfiles['quick-chat'].promptPresetId, id);
    assert.equal(
      nextProfiles.creation.promptPresetId,
      separate.preset.id,
      'unselected purposes retain their own preset',
    );
    const previewResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/ai/prompts/preview') &&
        response.request().method() === 'POST',
    );
    await page.locator('#prompt-preview').click();
    await page
      .locator('#ai-result-title')
      .filter({ hasText: '未调用模型' })
      .waitFor({ timeout: 60000 });
    const preview = await (await previewResponse).json();
    assert(preview.messages.length >= 2);
    assert(
      preview.messages.some((message) => message.content.includes('PRESET_NEXT_REQUEST_FRESH')),
      'saved adjustments enter the very next request without entering a dungeon',
    );
    assert.equal(profile.chat.promptProcessing, 'strict');
    assert(preview.messages.some((message) => message.role === 'system'));
    assert(preview.messages.some((message) => message.role === 'user'));
    assert(preview.tokens.inputEstimate > 0);
    assert(!preview.messages.some((message) => /{{(?:getvar|setvar|roll)\b/.test(message.content)));
    await page.screenshot({ path: path.join(output, 'izumi-preset-preview.png') });
    if (file) {
      await page.locator('#helper-open').click();
      const frame = page.frameLocator('#helper-frame');
      await frame
        .locator('#izumi-floating-window-v1')
        .waitFor({ state: 'visible', timeout: 60000 });
      await frame.locator('#izumi-floating-window-v1').click();
      await frame.locator('#izumi-floating-window-v1-panel').waitFor({ state: 'visible' });
      await frame
        .locator('[data-action="function-section"][data-section]:not([data-section="overview"])')
        .first()
        .click();
      const beforeToggle = saved.prompt_order[0].order
        .map((entry) => `${entry.identifier}:${entry.enabled}`)
        .join('|');
      const toggle = frame.locator('[data-action="toggle"][data-index]:not([disabled])').first();
      await toggle.scrollIntoViewIfNeeded();
      await toggle.click();
      await page.waitForFunction(
        async ({ id, before }) => {
          const value = (await (await fetch('/api/ai/prompts/' + id)).json()).preset;
          return (
            value.prompt_order[0].order
              .map((entry) => `${entry.identifier}:${entry.enabled}`)
              .join('|') !== before
          );
        },
        { id, before: beforeToggle },
        { timeout: 20000, polling: 300 },
      );
      await frame
        .locator('body')
        .evaluate(() =>
          localStorage.setItem('compat-private-example', 'PRIVATE_HELPER_PREFERENCE'),
        );
      await page.waitForFunction(
        async (id) =>
          (await (await fetch('/api/ai/helper-storage/' + id)).json()).storage[
            'compat-private-example'
          ] === 'PRIVATE_HELPER_PREFERENCE',
        id,
        { polling: 300 },
      );
      assert(
        !(
          await page.evaluate(async (id) => (await fetch('/api/ai/prompts/' + id)).text(), id)
        ).includes('PRIVATE_HELPER_PREFERENCE'),
      );
      await page.screenshot({ path: path.join(output, 'izumi-floating-window.png') });
      assert((await frame.locator('#izumi-floating-window-v1-panel').innerText()).length > 100);
      await page.locator('#helper-close').click();
    }
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
    assert.deepEqual(failures, []);
    return {
      connectionSaveReload: true,
      browserDirectModels: true,
      directKeyMemoryOnly: true,
      twoConnectionsSelectable: true,
      visibleModelList: true,
      promptsSeparate: true,
      imported: file ? path.basename(file) : 'portable fixture',
      promptCount: saved.prompts.length,
      regexCount: saved.extensions.regex_scripts.length,
      preview: true,
      floatingWindow: !!file,
      floatingToggleSaved: !!file,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'api-settings-failure.png') }).catch(() => {});
    failure.message +=
      '\n界面状态：' +
      (await page.locator('#ai-status').textContent()) +
      '\n扩展状态：' +
      (await page.locator('#helper-status').textContent());
    throw failure;
  } finally {
    for (const id of imported) await post('prompts/delete', { id }).catch(() => {});
    for (const id of connections)
      await post('presets', { action: 'delete', kind: 'character', id }).catch(() => {});
    await page.close();
  }
}
