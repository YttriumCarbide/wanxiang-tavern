import assert from 'node:assert/strict';
import path from 'node:path';

/** Click the unmodified imported preset's own controls, never a stand-in switch. */
export async function adviceNativeChecks({ page, helper, inn, setup, output }) {
  const root = '#izumi-floating-window-v1';
  const panel = helper.locator(`${root}-panel`);
  const toggle = panel.locator('[data-action="advice-toggle"]');
  async function open() {
    await page.locator('#helper-open').click();
    await helper.locator(root).waitFor();
    assert.equal(await helper.locator('[data-advice-controls]').count(), 0);
    await helper.locator(root).click();
    await panel.waitFor({ state: 'visible' });
  }
  async function waitForStorage(predicate) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const storage = await page.evaluate(
        async (id) => (await (await fetch('/api/ai/helper-storage/' + id)).json()).storage,
        setup.advice,
      );
      if (predicate(storage)) return;
      await page.waitForTimeout(50);
    }
    assert.fail('The original preset preference was not saved');
  }
  async function persisted(enabled) {
    await waitForStorage(
      (storage) => storage.izumi_floating_window_advice_enabled_v1 === String(enabled),
    );
  }
  async function preview() {
    return page.evaluate(async () =>
      (
        await fetch('/api/ai/prompts/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'chat',
            input: {
              text: '我递过去一杯茶。',
              place: 'table',
              characters: [],
              selected: [],
              history: [{ role: 'assistant', content: '之前的正文。' }],
            },
          }),
        })
      ).json(),
    );
  }
  await page.locator('#prompt-select').selectOption(setup.advice);
  await open();
  await toggle.waitFor();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
  await toggle.click();
  await persisted(true);
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  let request = await preview();
  assert.equal(request.transport.advice.status, 'enabled');
  assert(
    request.messages.some(
      (message) =>
        message.role === 'assistant' &&
        message.content.includes('<advice>我递过去一杯茶。</advice>'),
    ),
  );

  await panel.locator('[data-action="advice-settings"]').click();
  await helper.locator(`${root}-advice-position-select`).selectOption('head');
  await helper.locator(`${root}-advice-replacement-text`).fill('按上面的建议开始行动。');
  await panel.locator('[data-action="advice-settings-save"]').click();
  await waitForStorage((storage) => {
    const config = JSON.parse(storage.izumi_floating_window_advice_config_v1 || '{}');
    return config.position === 'head' && config.replacementText === '按上面的建议开始行动。';
  });
  request = await preview();
  assert.equal(request.transport.advice.position, 'head');
  assert(
    request.messages.some(
      (message) =>
        message.role === 'assistant' &&
        message.content.startsWith('<advice>我递过去一杯茶。</advice>'),
    ),
  );
  assert(
    request.messages.some(
      (message) => message.role === 'user' && message.content.includes('按上面的建议开始行动。'),
    ),
  );
  await page.screenshot({ path: path.join(output, 'advice-original-preset.png') });

  await page.locator('#helper-close').click();
  await page.locator('#prompt-select').selectOption(setup.empty);
  await helper.locator(root).waitFor({ state: 'detached' });
  await page.locator('#prompt-select').selectOption(setup.advice);
  await open();
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
  await toggle.click();
  await persisted(false);
  request = await preview();
  assert.equal(request.transport.advice.status, 'disabled');
  assert(
    request.messages.some(
      (message) => message.role === 'user' && message.content.includes('我递过去一杯茶。'),
    ),
  );

  // Sending immediately after a native click flushes its debounced localStorage write.
  await page.locator('#helper-close').click();
  await page.locator('#ai-close').click();
  await inn.locator('#talk-open').click();
  let flushedStorage;
  await page.route('**/api/ai/generate/chat', async (route) => {
    flushedStorage = await page.evaluate(
      async (id) => (await (await fetch('/api/ai/helper-storage/' + id)).json()).storage,
      setup.advice,
    );
    await route.fulfill({
      json: {
        content: '已收到。',
        display: '已收到。',
        usage: { input: 10, output: 4 },
        request: { tokens: { inputEstimate: 10, tokenizer: 'o200k_base' }, warnings: [] },
      },
    });
  });
  await page.locator('#chat-input').fill('同步原预设开关后发言。');
  await toggle.evaluate((button) => button.click());
  await page.locator('#chat-input').press('Enter');
  await page.waitForFunction(() =>
    document.querySelector('#chat-status').textContent.includes('实际 10 / 4'),
  );
  assert.equal(flushedStorage.izumi_floating_window_advice_enabled_v1, 'true');
  await page.locator('#chat-close').click();
}
