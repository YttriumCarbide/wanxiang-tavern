import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession, openShelfPanel } from './legacy-session.mjs';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { normalizeCharacter } from '../../src/ai/contracts.js';
import { characterDocument } from '../fixtures/ai.js';
import { normalizeEquipment, buyEquipment } from '../../src/equipment.js';

async function drag(page, source, target) {
  await page.locator(source).dragTo(page.locator(target));
  await page.waitForTimeout(300);
}
function inside(bounds, viewport) {
  assert(
    bounds.x >= 0 &&
      bounds.y >= 0 &&
      bounds.x + bounds.width <= viewport.width + 1 &&
      bounds.y + bounds.height <= viewport.height + 1,
    'Panel remains inside the viewport',
  );
}

export async function preparationChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', (failure) => errors.push(failure.message));
  await legacySession(page);
  const library = newCampaign(defaultProtagonist());
  library.campaign.completed = true;
  library.inventory.summonContracts = 1;
  firstCompanion(library);
  library.campaign.tutorial = 'complete';
  library.progression.pandoraJoined = true;
  for (let index = 0; index < 3; index++) {
    const document = characterDocument();
    document.setting.name = `旅人${index + 1}`;
    document.data.name = document.setting.name;
    library.characters.push(normalizeCharacter(document, `character-reserve-${index}`));
  }
  library.equipment.catalog.push(
    normalizeEquipment(
      { name: '碎晶剑', description: '普攻增加2', stats: { attack: 2 }, rules: [] },
      { id: 'ore', value: 25, name: '晶矿', map: 'frost' },
    ),
  );
  library.inventory.ether = 25;
  buyEquipment(library, 'ore', 'owned-1');
  library.archives.items.push({
    id: 'item-ui',
    name: '回廊晶片',
    description: '微光晶片',
    value: 10,
    map: 'ruins',
    converted: true,
    source: { runId: 'record-ui', title: '回廊往事', encounter: 0, map: 'ruins' },
  });
  library.history.push({
    runId: 'record-ui',
    title: '回廊往事',
    complete: true,
    tags: ['遗迹'],
    lines: [{ speaker: '旁白', text: '沿着壁画走向石门。', encounter: 0, stage: 'before' }],
  });
  await page.addInitScript((seed) => {
    if (window.origin === 'null' || sessionStorage.getItem('preparation-seeded')) return;
    localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(seed));
    sessionStorage.setItem('preparation-seeded', 'true');
  }, library);
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => window.demo?.getStatus().mode === 'inn');
    const ledgerHandle = await page.locator('#ledger-handle').boundingBox();
    await page.mouse.move(
      ledgerHandle.x + ledgerHandle.width / 2,
      ledgerHandle.y + ledgerHandle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      Math.max(10, ledgerHandle.x - 140),
      ledgerHandle.y + ledgerHandle.height / 2,
      { steps: 6 },
    );
    await page.mouse.up();
    await page.locator('#ledger-drawer-host.is-open').waitFor();
    await page.locator('#party-toggle').click();
    const panel = page.locator('#party-panel');
    await page.waitForTimeout(280);
    const bounds = await panel.boundingBox();
    inside(bounds, { width: 1440, height: 836 });
    assert(bounds.width <= 1340 && bounds.height <= 760);
    const formation = await page.locator('.prepare-formation-col').boundingBox();
    const stage = await page.locator('.prepare-stage-col').boundingBox();
    const inspector = await page.locator('.prepare-inspector-col').boundingBox();
    assert(formation.x + formation.width < stage.x + 2 && stage.x + stage.width < inspector.x + 2);
    assert.equal(await page.locator('.prepare-slot').count(), 6);
    assert(
      await page
        .locator('#prepare-slots')
        .evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
    );
    assert(!(await panel.textContent()).includes('点击角色编辑'));
    for (const slot of await page.locator('.prepare-slot').all())
      inside(await slot.boundingBox(), { width: 1440, height: 836 });
    assert.equal(await page.locator('.prepare-member').count(), 3);
    assert.equal(await page.locator('#prepare-detail .prepare-stage-col').isVisible(), true);
    assert.equal(
      await page
        .locator('.prepare-slot img')
        .first()
        .evaluate((img) => getComputedStyle(img).objectFit),
      'contain',
    );
    await page.screenshot({ path: path.join(output, 'preparation-desktop.png') });
    const reserveId = library.characters[3].id;
    await drag(page, `[data-prepare-view="${reserveId}"]`, '[data-prepare-slot="3"]');
    assert.equal((await page.evaluate(() => demo.getLibrary())).party[3], reserveId);
    assert.equal(await page.locator('.prepare-member').count(), 2);
    await drag(page, '[data-prepare-slot="3"]', '[data-prepare-slot="4"]');
    assert.equal((await page.evaluate(() => demo.getLibrary())).party[4], reserveId);
    await drag(page, '[data-prepare-slot="4"]', '#prepare-pool');
    assert.equal((await page.evaluate(() => demo.getLibrary())).party[4], null);
    assert.equal(await page.locator('.prepare-member').count(), 3);
    await page.locator('[data-prepare-slot="0"]').click();
    const editor = page.locator('#prepare-detail');
    assert.match(await editor.locator('.prepare-affection').innerText(), /好感 Lv\./);
    assert.equal(await editor.locator('.prepare-stat-grid dd').count(), 5);
    assert.equal(await editor.locator('[data-equipment-slot]').count(), 4);
    assert.equal(
      await editor.locator('[data-prepare-position], [data-prepare-use], .character-sheet').count(),
      0,
    );
    await editor.locator('[data-equipment-slot="0"]').selectOption('owned-1');
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).characters[0].equipment[0],
      'owned-1',
    );
    assert.equal(
      await editor
        .locator('.prepare-portrait img')
        .evaluate((img) => getComputedStyle(img).objectFit),
      'contain',
    );
    await editor.locator('.prepare-portrait-tools summary').click();
    assert.equal(await editor.locator('[data-edit-portrait]').isVisible(), true);
    await editor.locator('[data-edit-portrait]').click();
    const portrait = page.locator('#portrait-dialog');
    const promptButton = portrait.getByRole('button', { name: '获取立绘提示词' });
    const prompt = portrait.locator('.portrait-prompt-output');
    await promptButton.click();
    await prompt.waitFor({ state: 'visible' });
    const cardPrompt = await prompt.inputValue();
    assert.match(cardPrompt, /角色设定/);
    await portrait.locator('[data-portrait-kind="standing"]').click();
    await promptButton.click();
    await prompt.waitFor({ state: 'visible' });
    assert.notEqual(await prompt.inputValue(), cardPrompt);
    await portrait.locator('#portrait-url-close').click();
    await editor.locator('.prepare-portrait-tools summary').click();
    await editor.locator('[data-prepare-tab="job"]').click();
    assert.equal(await editor.locator('.prepare-service tbody tr').count(), 4);
    await editor.locator('[data-prepare-tab="status"]').click();
    await page.waitForTimeout(230);
    await page.screenshot({ path: path.join(output, 'preparation-character.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(250);
    inside(await panel.boundingBox(), { width: 390, height: 844 });
    // Real touch input exercises the rotated coordinate conversion and suppresses accidental opening.
    const handle = await page
      .locator(`[data-prepare-view="${reserveId}"] .prepare-drag-handle`)
      .boundingBox();
    const target = await page.locator('[data-prepare-slot="3"]').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const from = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 };
    const to = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let step = 1; step <= 8; step++)
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: from.x + ((to.x - from.x) * step) / 8, y: from.y + ((to.y - from.y) * step) / 8 },
        ],
      });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    assert.equal((await page.evaluate(() => demo.getLibrary())).party[3], reserveId);
    assert.equal(await page.locator('.prepare-drag-ghost').count(), 0);
    await page.screenshot({ path: path.join(output, 'preparation-portrait-horizontal.png') });
    await page.locator('[data-prepare-slot="0"]').click();
    assert.match(await editor.locator('#prepare-character-title').textContent(), /\S+/);
    await page.screenshot({ path: path.join(output, 'preparation-character-mobile.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    inside(await panel.boundingBox(), { width: 844, height: 390 });
    await page.screenshot({ path: path.join(output, 'preparation-landscape.png') });
    await page.locator('#prepare-done').click();
    await page.setViewportSize({ width: 1440, height: 836 });
    await openShelfPanel(page, 'archives');
    assert.equal(await page.locator('#archive-dialog .records-empty').count(), 1);
    const tabs = await page.locator('.archive-tabs').boundingBox();
    const archive = await page.locator('#archive-dialog').boundingBox();
    assert(tabs.x > archive.x + archive.width / 2);
    await page
      .locator('#archive-dialog')
      .evaluate((element) =>
        Promise.all(element.getAnimations().map((animation) => animation.finished)),
      );
    await page.screenshot({ path: path.join(output, 'archive-empty.png') });
    await page.locator('[data-archive-tab="items"]').click();
    assert.equal(
      await page.locator('[data-archive-tab="items"]').getAttribute('aria-pressed'),
      'true',
    );
    assert((await page.locator('#archive-text').innerText()).includes('以太'));
    assert.equal(await page.locator('#archive-list button').count(), 1);
    await page.screenshot({ path: path.join(output, 'archive-items.png') });
    await page.locator('#archive-close').click();
    await openShelfPanel(page, 'records');
    assert((await page.locator('#records-text').innerText()).includes('沿着壁画走向石门'));
    await page
      .locator('#journey-records')
      .evaluate((element) =>
        Promise.all(element.getAnimations().map((animation) => animation.finished)),
      );
    await page.screenshot({ path: path.join(output, 'journey-records.png') });
    await page.locator('#records-edit').click();
    await page.locator('#records-text input').first().fill('回廊新记录');
    await page.getByRole('button', { name: '保存记录', exact: true }).click();
    assert((await page.locator('#records-list').innerText()).includes('回廊新记录'));
    await page.locator('#records-close').click();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).characters[0].equipment[0],
      'owned-1',
    );
    assert.deepEqual(errors, []);
    return {
      compactPanel: true,
      reserveLeftQuarter: true,
      formationRightThreeQuarters: true,
      fullPortraits: true,
      desktopAndTouchDrag: true,
      equipmentAndPortraitEditor: true,
      horizontalMobile: true,
      recordsAndArchives: true,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'preparation-failure.png') }).catch(() => {});
    throw failure;
  } finally {
    await page.close();
  }
}
