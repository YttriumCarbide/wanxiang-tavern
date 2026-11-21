import assert from 'node:assert/strict';
import path from 'node:path';
import { createSaveSnapshot } from '../../src/app/saves.js';
import { newCampaign } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { dismissAutomaticJournals } from './legacy-session.mjs';

const CASES = [
  {
    name: 'desktop',
    viewport: { width: 1280, height: 800 },
    contextOptions: {},
    screenshot: 'static-save-import-desktop.png',
  },
  {
    name: 'mobile',
    viewport: { width: 390, height: 844 },
    contextOptions: { hasTouch: true, isMobile: true },
    screenshot: 'static-save-import-mobile.png',
  },
];

function buildFixtureSnapshot() {
  const library = newCampaign(defaultProtagonist());
  Object.assign(library.campaign, {
    tutorial: 'done',
    completed: true,
    firstRecruit: true,
  });
  library.daily.tutorial = 'done';
  library.inventory.gold = 731;
  const session = {
    ai: { library },
    journey: { bossChoice: 'millVoleAlpha', regionMap: 'mill' },
    runtime: { mode: 'inn' },
  };
  const snapshot = createSaveSnapshot(session, 'slot1', 'static-import-fixture');
  snapshot.name = 'static-import-fixture';
  return snapshot;
}

function malformedFile() {
  return {
    name: 'retry-save.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{ "app": "wanxiang-inn", "version": 1, ', 'utf8'),
  };
}

function bomSnapshotFile(snapshot) {
  const json = JSON.stringify(snapshot, null, 2);
  return {
    name: 'retry-save.json',
    mimeType: 'application/json',
    buffer: Buffer.from(`\uFEFF${json}`, 'utf8'),
  };
}

async function resolveFrame(page, isMobile) {
  if (!isMobile) return page.mainFrame();
  await page.locator('#landscape-frame').waitFor({ state: 'visible' });
  const handle = await page.locator('#landscape-frame').elementHandle();
  const frame = await handle.contentFrame();
  assert(frame, 'landscape frame is available');
  return frame;
}

async function openSavesDialog(frame, isMobile) {
  const startLoad = frame.locator('#start-load');
  await startLoad.waitFor({ state: 'visible' });
  if (isMobile) await startLoad.tap();
  else await startLoad.click();
  await frame.locator('#saves-dialog').waitFor({ state: 'visible' });
}

async function chooseFile(page, frame, isMobile, file) {
  const importButton = frame.locator('#saves-import-btn');
  const chooserPromise = page.waitForEvent('filechooser');
  if (isMobile) await importButton.tap();
  else await importButton.click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
}

async function waitForGold(frame, gold) {
  await frame.waitForFunction(
    (expected) => {
      const library = window.demo?.getLibrary?.();
      return library?.inventory?.gold === expected;
    },
    gold,
    { timeout: 30000 },
  );
}

async function runCase({ browser, baseURL, output, testCase, snapshot }) {
  const context = await browser.newContext({
    viewport: testCase.viewport,
    ...testCase.contextOptions,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (failure) => pageErrors.push(failure.message));
  const isMobile = testCase.name === 'mobile';
  try {
    await dismissAutomaticJournals(page);
    await page.goto(baseURL);
    let frame = await resolveFrame(page, isMobile);
    await frame.waitForFunction(() => !!window.demo, undefined, { timeout: 60000 });
    await openSavesDialog(frame, isMobile);

    await chooseFile(page, frame, isMobile, malformedFile());
    const status = frame.locator('#saves-import-status');
    await status.waitFor({ state: 'visible' });
    await frame.waitForFunction(
      () => {
        const node = document.querySelector('#saves-import-status');
        return !!node && !node.hidden && node.textContent.includes('JSON');
      },
      undefined,
      { timeout: 30000 },
    );

    await chooseFile(page, frame, isMobile, bomSnapshotFile(snapshot));
    const importSlot = frame.locator('[data-import-slot="slot1"]');
    await importSlot.waitFor({ state: 'visible' });
    await frame.waitForFunction(
      () => {
        const node = document.querySelector('[data-import-slot="slot1"]');
        return !!node && !node.disabled;
      },
      undefined,
      { timeout: 30000 },
    );
    const selectionText = await frame.locator('#saves-import-selection').textContent();
    assert(
      selectionText.includes('请选择') || selectionText.includes('已选择'),
      'import selection prompt is shown',
    );
    const stillNeedsStart = await frame.locator('#start-load').isVisible();
    assert(stillNeedsStart, 'game still needs start before explicit load');
    const goldBefore = await frame
      .locator('body')
      .evaluate(() => window.demo.getLibrary().inventory.gold);
    assert.notEqual(goldBefore, 731, 'library gold unchanged before explicit load');

    if (isMobile) await importSlot.tap();
    else await importSlot.click();
    await frame.waitForFunction(
      () => {
        const node = document.querySelector('#saves-import-status');
        return !!node && !node.hidden && node.textContent.includes('导入成功');
      },
      undefined,
      { timeout: 30000 },
    );
    const stillNotLoaded = await frame.locator('#start-load').isVisible();
    assert(stillNotLoaded, 'import does not auto-load the save');

    const loadSlot = frame.locator('[data-load-slot="slot1"]');
    if (isMobile) await loadSlot.tap();
    else await loadSlot.click();
    await frame.locator('#saves-dialog').waitFor({ state: 'hidden' });
    await waitForGold(frame, 731);

    await frame.evaluate(() => window.demo.flushStorage());
    await page.reload();
    frame = await resolveFrame(page, isMobile);
    await waitForGold(frame, 731);

    await page.screenshot({
      path: path.join(output, testCase.screenshot),
      animations: 'disabled',
    });

    assert.deepEqual(pageErrors, []);
    return true;
  } finally {
    await context.close();
  }
}

export async function staticSaveImportChecks({ browser, baseURL, output }) {
  const snapshot = buildFixtureSnapshot();
  for (const testCase of CASES) {
    await runCase({ browser, baseURL, output, testCase, snapshot });
  }
  return {
    desktop: true,
    mobilePortraitFrame: true,
    sameFilenameRetry: true,
    bom: true,
    explicitSlotAndLoad: true,
    persistent: true,
  };
}
