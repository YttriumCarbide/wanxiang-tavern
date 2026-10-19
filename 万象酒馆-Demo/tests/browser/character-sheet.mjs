import assert from 'node:assert/strict';
import path from 'node:path';
import { characterDocument } from '../fixtures/ai.js';
import { normalizeCharacter } from '../../src/ai/contracts.js';

/** A visual change to the sheet can be checked without API generation or a dungeon replay. */
export async function characterSheetChecks({ page, output }) {
  const entry = normalizeCharacter(characterDocument(), 'character-visual');
  await page.evaluate(async (entry) => {
    const { characterSheet } = await import(new URL('./src/app/character-sheet.js', location.href));
    document.querySelector('#summoned-name').textContent = entry.setting.name + ' · 来客档案';
    document.querySelector('#summoned-lore').innerHTML = characterSheet(entry);
    document.querySelector('#summoned-dialog [data-generation-review]').hidden = false;
    document.querySelector('#summoned-dialog').showModal();
  }, entry);
  assert.equal(await page.locator('#summoned-dialog > footer button:visible').count(), 2);
  await page.screenshot({ path: path.join(output, 'ai-character-sheet-desktop.png') });
  const ability = page
    .locator('#summoned-lore .character-ability')
    .filter({ has: page.locator('summary strong', { hasText: '凝灯' }) });
  await ability.locator('summary').click();
  const motion = await ability.locator('.ability-motion').textContent();
  assert.equal(
    motion,
    motion.trim(),
    'Template whitespace must not indent or add blank lines to skill prose',
  );
  const frame = await page.locator('#summoned-lore').boundingBox();
  const identity = await page.locator('#summoned-lore .character-identity').boundingBox();
  assert(
    identity.y >= frame.y && identity.y + identity.height <= frame.y + frame.height + 1,
    'Identity card stays visible while desktop skills scroll',
  );
  await page.screenshot({ path: path.join(output, 'ai-character-skill-open.png') });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('#summoned-lore').evaluate((node) => {
    node.scrollTop = 0;
  });
  const footer = await page.locator('#summoned-dialog > footer').boundingBox();
  assert(footer.y + footer.height <= 390);
  await page.screenshot({ path: path.join(output, 'ai-character-sheet-landscape.png') });
  await page.locator('#summoned-close').click();
  await page.evaluate(() => {
    document.querySelector('#summoned-dialog [data-generation-review]').hidden = true;
  });
  await page.setViewportSize({ width: 1440, height: 836 });
  return {
    mergedIdentityAndStats: true,
    expandableNumbersAndMotion: true,
    noTemplateWhitespace: true,
    desktopIdentityRemainsVisible: true,
    twoLandscapeActions: true,
  };
}
