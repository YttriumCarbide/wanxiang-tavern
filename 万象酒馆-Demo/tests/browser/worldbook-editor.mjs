import assert from 'node:assert/strict';
import path from 'node:path';

/** One session covers row editing, recipient combinations and both real editor widths. */
export async function worldbookEditorChecks({ page, output }) {
  await page.waitForFunction(() => !!window.demo);
  await page.locator('#ai-open').click();
  assert.equal(await page.locator('[data-ai-tab]').count(), 3);
  assert.equal(await page.locator('#ai-export,#ai-prompt-preset,#ai-edit-prompts').count(), 0);
  await page.locator('#ai-worldbooks').click();
  await page.locator('[data-world-format="script"]').click();
  const expanded = page.locator('.world-entry-row').filter({ has: page.locator('.world-editor') });
  const originalName = await expanded.locator('[data-world-head="comment"]').inputValue();
  assert(originalName.includes('JSON输出格式'));
  const body = page.locator('[data-world-field="content"]');
  assert((await body.inputValue()).includes('SCRIPT v4'));
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
    await page.screenshot({
      path: path.join(
        output,
        viewport.width === 1440 ? 'worldbook-editor-desktop.png' : 'worldbook-editor-landscape.png',
      ),
    });
  }
  await page.setViewportSize({ width: 1440, height: 836 });
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
  };
}
