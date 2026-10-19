import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

export async function generationOptionsChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  await legacySession(page);
  const calls = [];
  let profiles;
  let presetId;
  try {
    await page.route('**/api/ai/generate/*', async (route) => {
      calls.push(route.request().url().split('/').at(-1));
      await route.fulfill({
        status: 400,
        json: { error: '已确认 AI 生成开关请求，不调用真实服务' },
      });
    });
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    profiles = await page.evaluate(async () => (await fetch('/api/ai/config')).json());
    presetId = await page.evaluate(async () => {
      const post = async (path, body) =>
        (
          await fetch('/api/ai/' + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        ).json();
      const result = await post('prompts/save', {
        preset: {
          name: '开关验证预设',
          prompts: [{ identifier: 'main', role: 'system', content: '测试用提示词' }],
        },
      });
      for (const kind of ['character', 'script'])
        await post('prompts/select', { kind, id: result.preset.id });
      return result.preset.id;
    });
    await page.evaluate(async (profiles) => {
      for (const kind of ['character', 'script'])
        await fetch('/api/ai/config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...profiles[kind],
            kind,
            apiKey: '',
            model: 'fixture-model',
            baseUrl: 'http://127.0.0.1:9999/v1',
          }),
        });
    }, profiles);
    await page.locator('#ai-open').click();
    await page.locator('[data-ai-tab="game"]').click();
    for (const key of ['protagonistApi', 'scriptApi']) {
      assert.equal(await page.locator(`[data-generation-option="${key}"]`).isChecked(), false);
      await page.locator(`[data-generation-option="${key}"]`).check();
    }
    await page.screenshot({ path: path.join(output, 'game-generation-options.png') });
    await page.locator('#ai-close').click();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#ai-open').click();
    await page.locator('[data-ai-tab="game"]').click();
    assert.equal(await page.locator('[data-generation-option="scriptApi"]').isChecked(), true);
    await page.locator('#ai-close').click();
    await page.evaluate(() => demo.newAdventure());
    assert.equal(await page.locator('#creation-form').isVisible(), true);
    await page.locator('#creation-form [name="name"]').fill('开关验证旅人');
    await page.locator('#creation-generate').click();
    await page.locator('#creation-status').filter({ hasText: '已确认 AI 生成开关请求' }).waitFor();
    assert.deepEqual(calls, ['character']);
    await page.locator('#creation-close').click();
    const inn = page.frameLocator('#inn-frame iframe');
    await inn.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await inn.locator('canvas').evaluate(() => window.assetPreview.placeNow('gate'));
    await inn.locator('#enter').click();
    await page.locator('#destination-region-confirm').click();
    const generated = page.waitForResponse((response) =>
      response.url().endsWith('/api/ai/generate/script'),
    );
    await page.locator('#destination-start').click();
    await generated;
    await page.waitForFunction(() => document.querySelector('#generation-progress').hidden);
    assert.deepEqual(calls, ['character', 'script']);
    if (!(await page.locator('#ai-dialog').isVisible())) await page.locator('#ai-open').click();
    await page.locator('[data-ai-tab="game"]').click();
    for (const key of ['protagonistApi', 'scriptApi'])
      await page.locator(`[data-generation-option="${key}"]`).uncheck();
    await page.locator('#ai-close').click();
    await page.evaluate(() => demo.newAdventure());
    assert.equal(await page.locator('#creation-form').isVisible(), false);
    assert.equal(await page.locator('#creation-start').isEnabled(), true);
    assert((await page.locator('#creation-review').textContent()).includes('青缘'));
    await page.locator('#creation-close').click();
    assert.deepEqual(calls, ['character', 'script']);
    await page.locator('#ai-open').click();
    await page.locator('[data-ai-tab="game"]').click();
    await page.locator('[data-generation-option="developerMode"]').uncheck();
    assert.equal(await page.locator('#developer-options').isVisible(), false);
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('wanxiang.generation-options.v1')),
    );
    assert.equal(stored.protagonistApi, true);
    assert.equal(stored.scriptApi, true);
    await page.locator('#ai-close').click();
    await page.evaluate(() => demo.newAdventure());
    assert.equal(await page.locator('#creation-form').isVisible(), true);
    await page.locator('#creation-form [name="name"]').fill('普通模式必须生成');
    await page.locator('#creation-generate').click();
    await page.locator('#creation-status').filter({ hasText: '已确认 AI 生成开关请求' }).waitFor();
    assert.deepEqual(calls, ['character', 'script', 'character']);
    await page.locator('#creation-close').click();
    return { persisted: true, protagonistGate: true, scriptGate: true, localModeRestored: true };
  } catch (failure) {
    await page
      .screenshot({ path: path.join(output, 'generation-options-failure.png') })
      .catch(() => {});
    throw failure;
  } finally {
    if (presetId)
      await page
        .evaluate(
          async ({ profiles, presetId }) => {
            for (const kind of ['character', 'script'])
              await fetch('/api/ai/prompts/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind, id: profiles[kind].promptPresetId }),
              });
            await fetch('/api/ai/prompts/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: presetId }),
            });
          },
          { profiles, presetId },
        )
        .catch(() => {});
    if (profiles)
      await page
        .evaluate(async (profiles) => {
          for (const [kind, profile] of Object.entries(profiles))
            await fetch('/api/ai/config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...profile, kind, apiKey: '' }),
            });
        }, profiles)
        .catch(() => {});
    await page.close();
  }
}
