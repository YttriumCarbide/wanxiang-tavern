import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

export async function gameModifierChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 667, height: 375 }, hasTouch: true });
  await legacySession(page);
  async function openOptions() {
    await page.locator('#ai-open').click();
    await page.locator('[data-ai-tab="game"]').click();
  }
  try {
    await page.goto(baseURL + '/?display=landscape');
    await page.waitForFunction(() => window.demo?.getStatus().mode === 'inn');
    await openOptions();
    await page.locator('#game-modifier-open').click();
    const modifier = page.locator('#game-modifier');
    const status = modifier.locator('[data-modifier-status]');
    const resources = modifier.locator('[data-modifier-form="resources"]');
    const gold = resources.locator('input[name="gold"]');
    const originalGold = Number(await gold.inputValue());
    await gold.fill(String(originalGold + 500));
    await resources.locator('button[type="submit"]').click();
    await status.filter({ hasText: '资源修改已保存。' }).waitFor();
    const bounds = await modifier.boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 668);
    assert(bounds.y + bounds.height <= 376);
    await page.screenshot({ path: path.join(output, 'game-modifier-mobile.png') });
    await modifier.locator('[data-modifier-tab="characters"]').click();
    const characters = modifier.locator('[data-modifier-form="characters"]');
    const attack = characters.locator('input[name="attack"]');
    const skillCost = characters.locator('input[name$=":mp"]').first();
    const originalAttack = Number(await attack.inputValue());
    const originalCost = Number(await skillCost.inputValue());
    await attack.fill(String(originalAttack + 5));
    await skillCost.fill(String(originalCost + 2));
    await characters.locator('button[type="submit"]').click();
    await status.filter({ hasText: '角色修改已保存。' }).waitFor();
    await page.reload();
    await page.waitForFunction(() => window.demo?.getStatus().mode === 'inn');
    await openOptions();
    await page.locator('#game-modifier-open').click();
    assert.equal(Number(await gold.inputValue()), originalGold + 500);
    await modifier.locator('[data-modifier-action="undo-resources"]').click();
    await status.filter({ hasText: '已撤回最近一笔资源修改。' }).waitFor();
    assert.equal(Number(await gold.inputValue()), originalGold);
    await modifier.locator('[data-modifier-tab="characters"]').click();
    assert.equal(Number(await attack.inputValue()), originalAttack + 5);
    assert.equal(Number(await skillCost.inputValue()), originalCost + 2);
    await skillCost
      .locator('xpath=ancestor::fieldset')
      .locator('[data-modifier-action="restore-skill"]')
      .click();
    await status.filter({ hasText: '已恢复此技能的数值。' }).waitFor();
    assert.equal(Number(await skillCost.inputValue()), originalCost);
    assert.equal(Number(await attack.inputValue()), originalAttack + 5);
    await modifier.locator('[data-modifier-action="restore-member"]').click();
    await status.filter({ hasText: '已恢复此角色的修改器数值。' }).waitFor();
    assert.equal(Number(await attack.inputValue()), originalAttack);
    await attack.fill(String(originalAttack + 5));
    await characters.locator('button[type="submit"]').click();
    await status.filter({ hasText: '角色修改已保存。' }).waitFor();
    await modifier.locator('[data-modifier-action="confirm-all"]').click();
    await modifier.locator('[data-modifier-action="restore-all"]').click();
    await status.filter({ hasText: '已恢复全部角色的修改器数值。' }).waitFor();
    assert.equal(Number(await attack.inputValue()), originalAttack);
    await modifier.locator('[data-modifier-close]').click();
    await page.locator('[data-generation-option="developerMode"]').uncheck();
    assert.equal(await page.locator('#game-modifier-open').isVisible(), false);
    return { resourceUndo: true, characterRestore: true, skillRestore: true, mobile: true };
  } finally {
    await page.close();
  }
}
