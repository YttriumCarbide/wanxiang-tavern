import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession, openShelfPanel } from './legacy-session.mjs';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { completeExploration } from '../../src/exploration.js';
import { normalizeCharacter } from '../../src/ai/contracts.js';
import { characterDocument } from '../fixtures/ai.js';
import { normalizeEquipment, buyEquipment } from '../../src/equipment.js';
import { armDialogExitProbe, assertDialogExited } from './dialog-motion.mjs';

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
  library.unlockedDungeons = ['mill'];
  for (const nodeId of ['mill-1-canal', 'mill-2-hall', 'mill-3-loft']) {
    const node = library.exploration.mill.frontier.find((entry) => entry.nodeId === nodeId);
    assert(node);
    completeExploration(library.exploration, node);
  }
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
    const panel = page.locator('#party-panel');
    const prepare = page.getByRole('button', { name: '整备', exact: true });
    const close = panel.getByRole('button', { name: '关闭整备', exact: true });
    await prepare.click();
    await page.getByRole('dialog', { name: '整备', exact: true }).waitFor();
    const closeBounds = await close.boundingBox();
    assert(closeBounds && closeBounds.width >= 24 && closeBounds.height >= 24);
    assert.equal(await close.evaluate((button) => getComputedStyle(button).opacity), '1');
    const partyExit = await armDialogExitProbe(panel);
    await close.click();
    await assertDialogExited(panel, '#party-panel', {
      animated: partyExit,
      focusId: 'party-toggle',
    });
    await prepare.click();
    await panel.evaluate((dialog) =>
      Promise.allSettled(dialog.getAnimations().map((animation) => animation.finished)),
    );
    const bounds = await panel.boundingBox();
    inside(bounds, { width: 1440, height: 836 });
    assert(bounds.width <= 1340 && bounds.height <= 760);

    const handle = panel.locator('#ledger-handle');
    const ledger = panel.locator('#ledger-drawer-host');
    await handle.click();
    const ledgerClose = ledger.locator('#ledger-close');
    assert.equal(await ledgerClose.getAttribute('aria-label'), '关闭账簿');
    const speedToggle = ledger.locator('#ledger-speed-toggle');
    const speedBefore = await speedToggle.textContent();
    await speedToggle.click();
    assert.notEqual(await speedToggle.textContent(), speedBefore);
    await speedToggle.click();
    assert.equal(await speedToggle.textContent(), speedBefore);
    await ledgerClose.click();
    await ledger.waitFor({ state: 'hidden' });
    assert(await panel.evaluate((dialog) => dialog.open), 'Returning closes only the ledger');
    await handle.click();
    const outsidePreparationHitsLedgerBackdrop = await page.evaluate(() =>
      Boolean(document.elementFromPoint(1, 1)?.closest('.ledger-backdrop')),
    );
    assert.equal(
      outsidePreparationHitsLedgerBackdrop,
      true,
      'The ledger backdrop covers blank space outside preparation',
    );
    await page.mouse.click(1, 1);
    await ledger.waitFor({ state: 'hidden' });
    assert(await panel.evaluate((dialog) => dialog.open), 'The backdrop closes only the ledger');
    assert.equal(await handle.getAttribute('aria-expanded'), 'false');
    assert(await handle.evaluate((button) => document.activeElement === button));
    await handle.press('Enter');
    await ledger.locator('#ledger-drawer').press('Escape');
    await ledger.waitFor({ state: 'hidden' });
    assert(await panel.evaluate((dialog) => dialog.open), 'Escape closes only the ledger');
    assert(await handle.evaluate((button) => document.activeElement === button));
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
    await page.locator('[data-prepare-slot="1"]').click();
    const editor = page.locator('#prepare-detail');
    assert.match(await editor.locator('.prepare-affection').innerText(), /好感 Lv\./);
    await page.locator('[data-prepare-slot="0"]').click();
    assert.equal(await editor.locator('.prepare-protagonist-core').isVisible(), true);
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
    const dragHandle = await page
      .locator(`[data-prepare-view="${reserveId}"] .prepare-drag-handle`)
      .boundingBox();
    const target = await page.locator('[data-prepare-slot="3"]').boundingBox();
    const cdp = await page.context().newCDPSession(page);
    const from = {
      x: dragHandle.x + dragHandle.width / 2,
      y: dragHandle.y + dragHandle.height / 2,
    };
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
    await panel.waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.locator('#ledger-handle').waitFor();
    assert(!(await page.locator('#ledger-drawer-host').isVisible()), 'The ledger stays closed');
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
    const archiveDialog = page.locator('#archive-dialog');
    const archiveExit = await armDialogExitProbe(archiveDialog);
    await page.locator('#archive-close').click();
    await assertDialogExited(archiveDialog, '#archive-dialog', { animated: archiveExit });
    await openShelfPanel(page, 'records');
    assert((await page.locator('#records-text').innerText()).includes('沿着壁画走向石门'));
    await page
      .locator('#archive-dialog')
      .evaluate((element) =>
        Promise.all(element.getAnimations().map((animation) => animation.finished)),
      );
    await page.screenshot({ path: path.join(output, 'journey-records.png') });
    await page.locator('#records-edit').click();
    await page.locator('#records-text input').first().fill('回廊新记录');
    await page.getByRole('button', { name: '保存记录', exact: true }).click();
    assert((await page.locator('#records-list').innerText()).includes('回廊新记录'));
    await page.locator('#archive-close').click();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).characters[0].equipment[0],
      'owned-1',
    );
    await page.evaluate(() => demo.startBattle());
    await page.locator('#destination-dialog').waitFor({ state: 'visible' });
    await page.locator('#destination-regions button[data-region="mill"]').click();
    await page.locator('#destination-region-confirm').click();
    await page.locator('[data-map-node*="mill-4-attic"]').click();
    await page.locator('#destination-start').click();
    await page.getByRole('button', { name: '确认编队 · 开始生成', exact: true }).waitFor();
    assert.equal(await panel.locator('#prepare-title').textContent(), '整备');
    const warningMessages = [];
    page.on('dialog', async (dialog) => {
      warningMessages.push(dialog.message());
      await dialog.dismiss();
    });
    await page.locator('#prepare-done').click();
    assert.equal(await panel.isVisible(), true, 'Canceling the warning keeps formation open');
    assert.equal(warningMessages.length, 1);
    assert.match(warningMessages[0], /难度极高.*未满六人.*推荐满编再来/);
    await panel.getByRole('button', { name: '取消出发', exact: true }).click();
    await panel.waitFor({ state: 'hidden' });
    await page.waitForFunction(
      () => document.querySelector('#prepare-title').textContent === '整备',
    );
    assert.equal(await panel.locator('#prepare-close').getAttribute('aria-label'), '关闭整备');
    assert.deepEqual(errors, []);
    return {
      compactPanel: true,
      reserveLeftQuarter: true,
      formationRightThreeQuarters: true,
      fullPortraits: true,
      desktopAndTouchDrag: true,
      equipmentAndPortraitEditor: true,
      horizontalMobile: true,
      ledgerDismissalKeepsPreparationOpen: true,
      recordsAndArchives: true,
      millOverlordRosterWarning: true,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'preparation-failure.png') }).catch(() => {});
    throw failure;
  } finally {
    await page.close();
  }
}
