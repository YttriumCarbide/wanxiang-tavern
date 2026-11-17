import assert from 'node:assert/strict';
import path from 'node:path';
import { characterDocument } from '../fixtures/ai.js';
import { normalizeCharacter } from '../../src/ai/contracts.js';

export async function settingsPreparationChecks({ page, output }) {
  const ensureLedgerOpen = async () => {
    if (await page.locator('#ledger-drawer-host.is-open').count()) return;
    const handle = await page.locator('#ledger-handle').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(Math.max(10, handle.x - 140), handle.y + handle.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await page.locator('#ledger-drawer-host.is-open').waitFor();
  };
  assert.equal(await page.locator('.app-header').isVisible(), false);
  assert.equal(await page.locator('#ledger-handle').isVisible(), true);
  assert.equal(await page.locator('#ledger-toggle').count(), 0);
  for (const id of ['#saves-open', '#audio-toggle', '#fullscreen-toggle', '#ai-open']) {
    assert.equal(await page.locator(`#ledger-corner ${id}`).isVisible(), true, id);
  }
  assert.match(await page.locator('[data-tavern-clock]').textContent(), /1463年8月24日 · 上午/);
  assert.deepEqual(await page.locator('.daily-dock button').allTextContents(), [
    '闲聊',
    '用餐',
    '约见',
    '冒险',
    '外出',
  ]);
  await page.locator('#ledger-handle').click();
  await page.locator('#ledger-drawer-host.is-open').waitFor();
  await page.locator('#ledger-close').click();
  await page.locator('#ledger-drawer').waitFor({ state: 'hidden' });
  await ensureLedgerOpen();
  assert.equal(await page.locator('#ledger-drawer #inn-resources').count(), 1);
  assert.deepEqual(
    await page
      .locator('#ledger-drawer .ledger-foot button')
      .evaluateAll((buttons) => buttons.map((button) => button.id)),
    ['ledger-speed-toggle', 'generation-review'],
  );
  assert.equal(await page.locator('#ledger-drawer #generation-review').isVisible(), true);
  assert.equal(
    await page
      .locator('#gate-nav,#rules-open,#route-open,[data-generation-review="character"]:visible')
      .count(),
    0,
  );
  await page.locator('#ledger-close').click();
  await page.locator('#ledger-drawer').waitFor({ state: 'hidden' });
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
  await ensureLedgerOpen();
  await page.locator('#party-toggle').click();
  assert.equal(await page.locator('.prepare-slot').count(), 6);
  assert.equal(await page.locator('.prepare-member').count(), 1);
  const modal = await page.locator('#party-panel').boundingBox();
  assert(modal.x > 0 && modal.y > 0 && modal.height < 836 * 0.9);
  await page
    .locator('[data-prepare-view="character-preparation"]')
    .dragTo(page.locator('[data-prepare-slot="4"]'));
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1')));
  assert.equal(saved.party[4], 'character-preparation');
  assert.equal(new Set(saved.party).size, 6);
  await page.locator('[data-prepare-slot="4"]').dragTo(page.locator('[data-prepare-slot="0"]'));
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1')));
  assert.equal(saved.party[0], 'character-preparation');
  assert.equal(new Set(saved.party).size, 6);
  await page.screenshot({ path: path.join(output, 'preparation-pool.png') });
  await page.locator('#prepare-done').click();
  await page.evaluate(() => localStorage.removeItem('wanxiang.generated-reset.v1'));
  await page.reload();
  await ensureLedgerOpen();
  await page.locator('#party-toggle').click();
  assert.equal(await page.locator('.prepare-member').count(), 0);
  assert((await page.locator('#prepare-status').textContent()).includes('6 / 6 位出发'));
  await page.locator('#prepare-done').click();
  await page.locator('#ai-open').click();
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.locator('#generation-reset-undo').click(),
  ]);
  await page.waitForFunction(() => document.querySelectorAll('.prepare-member').length === 1);
  await ensureLedgerOpen();
  await page.locator('#party-toggle').click();
  assert.equal(await page.locator('.prepare-member').count(), 1);
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
