import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { normalizeWorldbook } from '../../src/ai/worldbook.js';
import { legacySession } from './legacy-session.mjs';

/** One session covers row editing, recipient combinations and both real editor widths. */
export async function worldbookEditorChecks({ page, output }) {
  await page.waitForFunction(() => !!window.demo);
  await page.locator('#ai-open').click();
  await page.locator('#ai-worldbooks').click();
  await page.locator('[data-world-format="script"]').click();
  for (const kind of ['character', 'script', 'chat', 'summary', 'creation', 'map'])
    assert.equal(await page.locator(`[data-world-target="${kind}"]`).count(), 1);
  assert.equal(await page.locator('[data-world-target="quick-chat"]').count(), 0);
  const expanded = page.locator('.world-entry-row').filter({ has: page.locator('.world-editor') });
  const originalName = await expanded.locator('[data-world-head="comment"]').inputValue();
  assert(originalName.includes('JSON输出格式'));
  const body = page.locator('[data-world-field="content"]');
  const originalBody = await body.inputValue();
  assert(originalBody.includes('SCRIPT v5'));
  await page.waitForFunction(() =>
    document.querySelector('#world-entry-tokens').textContent.match(/Token: \d+/),
  );
  assert((await page.locator('#world-entry-tokens').textContent()).includes('UID:'));
  for (const key of ['enabled', 'comment', 'strategy', 'position', 'depth', 'order', 'probability'])
    assert.equal(await expanded.locator(`[data-world-head="${key}"]`).count(), 1);
  const position = expanded.locator('[data-world-head="position"]');
  const originalPosition = await position.inputValue();
  for (const value of ['4:0', '4:1', '4:2']) {
    await position.selectOption(value);
    assert(await expanded.locator('[data-world-head="depth"]').isEnabled());
  }
  await position.selectOption(originalPosition);
  const role = page.locator('[data-world-target="character"]');
  const script = page.locator('[data-world-target="script"]');
  const original = [await role.isChecked(), await script.isChecked()];
  for (const [character, screenplay] of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ]) {
    await role.setChecked(character);
    await script.setChecked(screenplay);
    await page.locator('#world-save').click();
    await page.waitForFunction(
      () => document.querySelector('#world-status').textContent === '已保存',
    );
    const entries = await page.evaluate(
      async () => (await (await fetch('/api/ai/worldbooks/tavern-world')).json()).book.entries,
    );
    const saved = Object.values(entries).find(
      (entry) => entry.extensions?.wanxiang?.generationRule === 'script-output',
    );
    assert.deepEqual(saved.apiTargets, [
      ...(character ? ['character'] : []),
      ...(screenplay ? ['script'] : []),
    ]);
  }
  await role.setChecked(original[0]);
  await script.setChecked(original[1]);
  const exportButton = page.getByRole('button', { name: '导出 JSON' });
  async function downloadBook() {
    const pending = page.waitForEvent('download');
    await exportButton.click();
    const download = await pending;
    const raw = JSON.parse(await readFile(await download.path(), 'utf8'));
    const { book } = normalizeWorldbook(raw);
    assert.deepEqual(book, raw);
    return { book, filename: download.suggestedFilename() };
  }
  const nameField = page.locator('#world-name');
  const originalBookName = await nameField.inputValue();
  const editedBody = originalBody + '\n即时导出验证内容';
  await nameField.fill('验证世界书');
  await body.fill(editedBody);
  await page.locator('#world-category').selectOption('rules');
  const exported = await downloadBook();
  assert.equal(exported.filename, '验证世界书.json');
  assert.equal(exported.book.name, '验证世界书');
  assert.equal(
    Object.values(exported.book.entries).find(
      (entry) => entry.extensions?.wanxiang?.generationRule === 'script-output',
    ).content,
    editedBody,
  );
  assert(
    Object.values(exported.book.entries).some((entry) => entry.extensions?.wanxiang?.characterId),
  );
  assert.equal(await body.inputValue(), editedBody);
  await nameField.fill(originalBookName);
  await body.fill(originalBody);
  for (const key of ['excludeRecursion', 'preventRecursion', 'ignoreBudget'])
    assert.equal(await page.locator(`[data-world-field="${key}"]`).count(), 1);
  for (const viewport of [
    { width: 1440, height: 836 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expanded.scrollIntoViewIfNeeded();
    const field = await body.boundingBox();
    const editor = await page.locator('.world-editor').boundingBox();
    assert(field.width > editor.width * 0.85);
    const footer = await page.locator('#world-preview-button').boundingBox();
    assert(footer.y + footer.height <= viewport.height);
    const control = await exportButton.boundingBox();
    assert(control && control.x >= 0 && control.x + control.width <= viewport.width);
    await page.screenshot({
      path: path.join(
        output,
        viewport.width === 1440 ? 'worldbook-editor-desktop.png' : 'worldbook-editor-landscape.png',
      ),
    });
  }
  await page.setViewportSize({ width: 1440, height: 836 });
  const picker = page.locator('#world-book-select');
  await picker.selectOption('tavern-summary');
  await page.waitForFunction(() => document.querySelector('#world-name').value === '总结世界书');
  const summary = await downloadBook();
  assert.equal(summary.filename, '总结世界书.json');
  const currentSummary = await page.evaluate(() => demo.getLibrary().summaryWorldbook);
  assert.deepEqual(summary.book, normalizeWorldbook(currentSummary).book);
  await picker.selectOption('tavern-world');
  await page.waitForFunction(
    (name) => document.querySelector('#world-name').value === name,
    originalBookName,
  );
  await page.locator('#world-close').click();
  await page.locator('#ai-close').click();
  return {
    inlineEditableHeaders: true,
    blueGreenStrategies: true,
    threeDepthRoles: true,
    fourRecipientStatesPersist: true,
    tokenCountAndUid: true,
    formatShortcuts: true,
    landscapeReachable: true,
    completeBookDownloadWithDraft: true,
    separateSummaryDownload: true,
  };
}

export async function standaloneWorldbookEditorChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  try {
    await legacySession(page);
    await page.goto(baseURL);
    return await worldbookEditorChecks({ page, output });
  } finally {
    await page.close();
  }
}
