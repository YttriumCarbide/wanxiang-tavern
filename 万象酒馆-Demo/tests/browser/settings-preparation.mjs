import assert from 'node:assert/strict';
import path from 'node:path';
import { characterDocument } from '../fixtures/ai.js';
import { normalizeCharacter } from '../../src/ai/contracts.js';

export async function settingsPreparationChecks({ page, output }) {
  assert.deepEqual(
    (await page.locator('.app-header nav button:visible').allTextContents()).map((text) =>
      text.trim(),
    ),
    ['归档', '记录', '设置', '准备', ''],
  );
  assert.equal(
    await page
      .locator('.app-header [data-generation-review]:visible,#gate-nav,#rules-open,#route-open')
      .count(),
    0,
  );
  await page.locator('#ai-open').click();
  await page.locator('[data-ai-tab="prompts"]').click();
  assert.equal(await page.locator('#prompt-select option:not([value=""])').count(), 0);
  assert((await page.locator('#prompt-source').textContent()).includes('尚未导入'));
  await page.locator('[data-ai-tab="settings"]').click();
  const before = await page.evaluate(async () => await (await fetch('/api/ai/config')).json());
  await page.locator('#ai-kind').selectOption('character');
  await page.locator('#ai-baseUrl').fill('http://127.0.0.1:9999/v1');
  await page.locator('#ai-model').fill('connection-test-model');
  await page.locator('#ai-key').fill('local-fixture-key');
  await page.locator('#ai-rememberKey').uncheck();
  await page.locator('#api-preset-name').fill('DS 验收');
  await page.locator('#api-preset-save').click();
  await page.waitForFunction(() =>
    document.querySelector('#api-preset-select').value.startsWith('api-'),
  );
  const connection = await page.locator('#api-preset-select').inputValue();
  await page.locator('#ai-kind').selectOption('script');
  await page.locator('#api-preset-select').selectOption(connection);
  await page.waitForFunction(
    () => document.querySelector('#ai-model').value === 'connection-test-model',
  );
  assert.equal(await page.locator('#ai-baseUrl').inputValue(), 'http://127.0.0.1:9999/v1');
  assert.equal(await page.locator('#ai-key').inputValue(), '');
  assert.equal(await page.locator('#ai-rememberKey').isChecked(), true);
  const configured = await page.evaluate(async () => await (await fetch('/api/ai/config')).json());
  assert.equal(configured.script.hasApiKey, true);
  assert(!JSON.stringify(configured).includes('local-fixture-key'));
  assert((await page.locator('#ai-key').getAttribute('placeholder')).includes('已配置'));
  await page.screenshot({ path: path.join(output, 'settings-connections.png') });
  // Restore the isolated test service's profiles; no real provider was contacted.
  await page.evaluate(async (profiles) => {
    for (const [kind, profile] of Object.entries(profiles))
      await fetch('/api/ai/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...profile, kind, clearKey: true }),
      });
  }, before);
  await page.locator('#api-preset-delete').click();
  await page.locator('#ai-close').click();
  const generated = normalizeCharacter(characterDocument(), 'character-preparation');
  await page.evaluate((entry) => {
    const key = 'wanxiang.worldbooks.v1';
    const library = JSON.parse(localStorage.getItem(key)) || window.demo.getLibrary?.();
    if (library) {
      library.characters.push(entry);
      localStorage.setItem(key, JSON.stringify(library));
    }
  }, generated);
  // Seed through saved data before reload, using the actual application restore boundary.
  await page.evaluate(async (entry) => {
    const { newLibrary } = await import('/src/ai/library.js');
    const key = 'wanxiang.worldbooks.v1';
    const library = JSON.parse(localStorage.getItem(key)) || newLibrary();
    if (!library.characters.some((item) => item.id === entry.id)) library.characters.push(entry);
    localStorage.setItem(key, JSON.stringify(library));
  }, generated);
  await page.reload();
  await page.waitForFunction(() => !!window.demo);
  await page.locator('#party-toggle').click();
  assert.equal(await page.locator('.prepare-slot').count(), 6);
  assert.equal(await page.locator('.prepare-member').count(), 7);
  const modal = await page.locator('#party-panel').boundingBox();
  assert(modal.x > 0 && modal.y > 0 && modal.height < 836 * 0.9);
  await page.locator('[data-prepare-slot="4"]').click();
  await page.locator('[data-prepare-view="character-preparation"]').click();
  await page.locator('[data-prepare-use="character-preparation"]').click();
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1')));
  assert.equal(saved.party[4], 'character-preparation');
  assert.equal(new Set(saved.party).size, 6);
  await page.locator('[data-prepare-slot="0"]').click();
  await page.locator('[data-prepare-use="character-preparation"]').click();
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1')));
  assert.equal(saved.party[0], 'character-preparation');
  assert.equal(new Set(saved.party).size, 6);
  await page.screenshot({ path: path.join(output, 'preparation-pool.png') });
  await page.locator('#prepare-done').click();
  await page.evaluate(() => localStorage.removeItem('wanxiang.generated-reset.v1'));
  await page.reload();
  await page.locator('#party-toggle').click();
  assert.equal(await page.locator('.prepare-member').count(), 6);
  assert((await page.locator('#prepare-status').textContent()).includes('剧本 0 篇 · 历史 0 条'));
  await page.locator('#prepare-done').click();
  await page.locator('#ai-open').click();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('#generation-reset-undo').click(),
  ]);
  await page.waitForFunction(() => document.querySelectorAll('.prepare-member').length === 7);
  await page.locator('#party-toggle').click();
  assert.equal(await page.locator('.prepare-member').count(), 7);
  await page.locator('#prepare-done').click();
  await page.evaluate(() => localStorage.removeItem('wanxiang.worldbooks.v1'));
  await page.reload();
  await page.waitForFunction(() => !!window.demo);
  return {
    emptyPromptLibrary: true,
    sharedConnectionAppliedOnSelection: true,
    headerIncludesRecords: true,
    allSavedCharactersVisible: true,
    frontRearSelectionAndExchange: true,
    centeredModal: true,
    generatedResetAndRecovery: true,
  };
}
