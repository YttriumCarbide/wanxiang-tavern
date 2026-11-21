import assert from 'node:assert/strict';
import path from 'node:path';
import { newCampaign } from '../../src/campaign.js';
import { officialCharacter } from '../../src/ai/library.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { exportDatabase } from '../../src/storage/backup.js';
import { createSaveSnapshot } from '../../src/app/saves.js';
import { dismissAutomaticJournals } from './legacy-session.mjs';

const backupFolder = '万象酒馆自动备份';
const libraryKey = 'game.wanxiang.worldbooks.v1';
const savesKey = 'game.wanxiang.saves.v1';

async function listFiles(page, directory) {
  return page.evaluate(async (directory) => {
    const root = await navigator.storage.getDirectory();
    const selected = await root.getDirectoryHandle('backup-fixture');
    const folder = await selected.getDirectoryHandle(directory);
    const files = [];
    for await (const [name, handle] of folder.entries())
      if (handle.kind === 'file') files.push([name, await (await handle.getFile()).text()]);
    return files.sort(([left], [right]) => left.localeCompare(right));
  }, directory);
}

async function readSavesStore(page) {
  return page.evaluate(async (key) => {
    const { openDatabase } = await import('/src/storage/database.js');
    const db = await openDatabase();
    try {
      const raw = db.get(key);
      return raw ? JSON.parse(raw) : null;
    } finally {
      db.close();
    }
  }, savesKey);
}

async function handleDialog(page, action, { type = 'confirm', accept = true, text } = {}) {
  const handled = page.waitForEvent('dialog').then(async (dialog) => {
    assert.equal(dialog.type(), type);
    const message = dialog.message();
    if (accept) await dialog.accept(text);
    else await dialog.dismiss();
    return message;
  });
  await action();
  return handled;
}

async function importBackup(page, contents, { dismiss = false } = {}) {
  if (await page.locator('#saves-dialog').isVisible()) {
    await page.locator('#saves-close').click();
    await page.locator('#saves-dialog').waitFor({ state: 'hidden' });
  }
  await page.locator('#start-load').click();
  await page.locator('#saves-dialog').waitFor({ state: 'visible' });
  const enable = page.locator('#saves-enable-full-import');
  const importButton = page.locator('#saves-import-full');
  await enable.waitFor({ state: 'visible' });
  assert.equal(await enable.isChecked(), false, 'full import toggle defaults unchecked');
  assert.equal(await importButton.isDisabled(), true, 'full import button defaults disabled');
  await enable.check();
  assert.equal(await importButton.isDisabled(), false, 'full import button enabled after toggle');
  const reloaded = dismiss ? null : page.waitForEvent('load');
  await handleDialog(
    page,
    () =>
      page.locator('#data-file').setInputFiles({
        name: 'wanxiang-auto-backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(contents),
      }),
    { accept: !dismiss },
  );
  if (dismiss) return false;
  await reloaded;
  await page.waitForFunction(() => window.demo?.getLibrary().inventory.gold === 326);
  return true;
}

function buildFixtureSave(library, slotId, name) {
  const session = {
    ai: { library: structuredClone(library) },
    journey: { bossChoice: 'millVoleAlpha', regionMap: 'mill' },
    runtime: { mode: 'inn' },
  };
  const snapshot = createSaveSnapshot(session, slotId, name);
  snapshot.data.library = structuredClone(library);
  snapshot.data.library.inventory.gold = 731;
  snapshot.summary = {
    ...snapshot.summary,
    chapter: snapshot.data.library.chapter || 1,
    characterCount: snapshot.data.library.characters?.length || 0,
    scriptCount: snapshot.data.library.scripts?.length || 0,
  };
  if (name) snapshot.name = name;
  return snapshot;
}

async function saveSlotChecks(page, output, library) {
  await page.locator('#saves-open').click();
  await page.locator('#saves-dialog').waitFor({ state: 'visible' });
  const cards = page.locator('#saves-slots-list .save-slot-card');
  await cards.first().waitFor({ state: 'visible' });
  assert.equal(await cards.count(), 4, 'page shows four slot cards');
  assert.match(await page.locator('#saves-page-status').textContent(), /第 1 \/ 5 页/);
  assert.equal(
    await page.locator('#saves-prev-page').isDisabled(),
    true,
    'prev disabled on page 1',
  );

  // Save current progress into slot1.
  await page.locator('[data-save-slot="slot1"]').click();
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-load-slot="slot1"]');
    return button && !button.disabled;
  });
  const beforeRename = await readSavesStore(page);
  const slot1Before = beforeRename.slots.slot1;
  assert(slot1Before, 'slot1 saved');
  const autoBefore = beforeRename.slots.auto;

  // Rename slot1 with HTML-ish characters via native prompt.
  await handleDialog(page, () => page.locator('[data-rename-slot="slot1"]').click(), {
    type: 'prompt',
    text: '<slot & name>',
  });
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-slot-id="slot1"]');
    return card && card.textContent.includes('<slot & name>');
  });
  const cardText = await page.locator('[data-slot-id="slot1"]').textContent();
  assert(cardText.includes('<slot & name>'), 'renamed text rendered');
  assert.equal(
    await page.locator('[data-slot-id="slot1"] script').count(),
    0,
    'no script element injected',
  );
  const afterRename = await readSavesStore(page);
  assert.equal(afterRename.slots.slot1.name, '<slot & name>');
  assert.equal(
    afterRename.slots.slot1.timestamp,
    slot1Before.timestamp,
    'rename keeps save timestamp',
  );
  assert.equal(afterRename.slots.slot1.dateString, slot1Before.dateString);
  assert.deepEqual(afterRename.slots.slot1.data, slot1Before.data);

  // Import a normal save file into an occupied slot: dismiss confirm keeps pending.
  const fixture = buildFixtureSave(library, 'slot1', 'fixture-gold731');
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('#saves-import-btn').click(),
  ]);
  await fileChooser.setFiles({
    name: 'fixture-cancel.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.locator('#saves-import-selection').waitFor({ state: 'visible' });
  await page.locator('#saves-import-cancel').click();
  await page.locator('#saves-import-selection').waitFor({ state: 'hidden' });
  assert.deepEqual(await readSavesStore(page), afterRename, 'cancel leaves every slot intact');
  await page.locator('#saves-import-input').setInputFiles({
    name: 'fixture-save.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await page.locator('[data-import-slot="slot1"]').waitFor({ state: 'visible' });
  await handleDialog(page, () => page.locator('[data-import-slot="slot1"]').click(), {
    accept: false,
  });
  const afterDismiss = await readSavesStore(page);
  assert.equal(afterDismiss.slots.slot1.name, '<slot & name>', 'dismiss keeps original slot1');
  assert.deepEqual(afterDismiss.slots.auto, autoBefore, 'dismiss keeps auto unchanged');
  assert.equal(
    await page.locator('[data-import-slot="slot1"]').count(),
    1,
    'pending import still selectable after dismiss',
  );

  // Navigate to page 5 (slot19) and import there.
  for (let index = 0; index < 4; index++) await page.locator('#saves-next-page').click();
  await page.waitForFunction(() => {
    const status = document.querySelector('#saves-page-status')?.textContent || '';
    return status.includes('第 5 / 5 页');
  });
  assert.equal(
    await page.locator('#saves-next-page').isDisabled(),
    true,
    'next disabled on page 5',
  );
  await page.locator('[data-import-slot="slot19"]').waitFor({ state: 'visible' });
  await page.locator('[data-import-slot="slot19"]').click();
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-slot-id="slot19"]');
    return card && card.classList.contains('is-filled');
  });
  const afterImport = await readSavesStore(page);
  assert.equal(
    afterImport.slots.slot19.data.library.inventory.gold,
    731,
    'slot19 imported gold731',
  );
  assert.deepEqual(afterImport.slots.auto, autoBefore, 'auto untouched by normal import');
  assert.equal(afterImport.slots.slot1.name, '<slot & name>', 'slot1 untouched by slot19 import');
  assert.equal(
    await page.evaluate(() => window.demo.getLibrary().inventory.gold),
    326,
    'import does not load session',
  );

  await page.locator('#saves-dialog-title').scrollIntoViewIfNeeded();
  await page.clock.runFor(400);
  await page.screenshot({
    path: path.join(output, 'saves-page-5-desktop.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.locator('#saves-dialog-title').scrollIntoViewIfNeeded();
  await page.clock.runFor(400);
  await page.screenshot({
    path: path.join(output, 'saves-page-5-landscape.png'),
    animations: 'disabled',
  });
  await handleDialog(page, () => page.locator('[data-rename-slot="slot19"]').click(), {
    type: 'prompt',
    accept: false,
  });
  assert.equal((await readSavesStore(page)).slots.slot19.name, fixture.name);
  await page.screenshot({
    path: path.join(output, 'saves-page-5-landscape-actions.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1120, height: 700 });
  await page.locator('#saves-close').click();
  await page.locator('#saves-dialog').waitFor({ state: 'hidden' });

  // Flush and reload to verify persistence.
  await page.evaluate(() => window.demo.flushStorage());
  await page.reload();
  await page.waitForFunction(() => window.demo?.getLibrary().inventory.gold === 326);
  await page.locator('#saves-open').click();
  await page.locator('#saves-dialog').waitFor({ state: 'visible' });
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-slot-id="slot1"]');
    return card && card.textContent.includes('<slot & name>');
  });
  for (let index = 0; index < 4; index++) await page.locator('#saves-next-page').click();
  await page.waitForFunction(() => {
    const status = document.querySelector('#saves-page-status')?.textContent || '';
    return status.includes('第 5 / 5 页');
  });
  await page.waitForFunction(() => {
    const card = document.querySelector('[data-slot-id="slot19"]');
    return card && card.classList.contains('is-filled');
  });
  await page.locator('#saves-close').click();
  await page.locator('#saves-dialog').waitFor({ state: 'hidden' });
}

export async function folderBackupChecks({ browser, baseURL, output }) {
  const library = newCampaign(defaultProtagonist());
  Object.assign(library.campaign, { tutorial: 'done', completed: true, firstRecruit: true });
  library.characters.push(officialCharacter('aegis'), officialCharacter('pandora'));
  library.progression.pandoraJoined = true;
  library.daily.tutorial = 'done';
  library.inventory.gold = 326;
  const startBackup = await exportDatabase(
    {
      entries: () => [
        ['installation', { version: 1 }],
        [libraryKey, JSON.stringify(library)],
        ['game.wanxiang.creation-pending.v1', 'false'],
        ['game.wanxiang.setup.completed.v1', 'true'],
      ],
    },
    {},
  );
  let updated;

  const page = await browser.newPage({ viewport: { width: 1120, height: 700 } });
  try {
    await dismissAutomaticJournals(page);
    await page.addInitScript(() => {
      window.folderPickerCalls = [];
      window.showDirectoryPicker = async (options) => {
        window.folderPickerCalls.push({ options, gesture: navigator.userActivation.isActive });
        const root = await navigator.storage.getDirectory();
        return root.getDirectoryHandle('backup-fixture', { create: true });
      };
    });
    await page.clock.install({ time: new Date('2026-11-07T12:00:00Z') });
    await page.goto(baseURL + '/?display=landscape');
    await page.waitForFunction(
      () => window.demo && document.querySelector('#data-folder-status')?.textContent,
    );
    assert.equal(await page.evaluate(() => window.folderPickerCalls.length), 0);
    const older = await page.evaluate(async (directory) => {
      const root = await navigator.storage.getDirectory();
      const selected = await root.getDirectoryHandle('backup-fixture', { create: true });
      const folder = await selected.getDirectoryHandle(directory, { create: true });
      const oldNames = [];
      for (let index = 0; index < 12; index++) {
        const stamp = new Date(Date.UTC(2026, 10, 6, 8, index)).toISOString().replace(/[:.]/g, '-');
        const name = 'wanxiang-auto-' + stamp + '-' + crypto.randomUUID() + '.json';
        const handle = await folder.getFileHandle(name, { create: true });
        const writer = await handle.createWritable();
        await writer.write('older backup');
        await writer.close();
        oldNames.push(name);
      }
      const notes = await folder.getFileHandle('my-notes.txt', { create: true });
      const writer = await notes.createWritable();
      await writer.write('player-owned file');
      await writer.close();
      return oldNames;
    }, backupFolder);

    // First page: normal start-journey must not trigger picker.
    await page.locator('#start-journey').click();
    assert.equal(
      await page.evaluate(() => window.folderPickerCalls.length),
      0,
      'normal start-journey does not open picker',
    );
    await page.locator('#wizard-close').click();

    // Open saves page and try folder button: dismiss explanation confirm -> no picker.
    await page.locator('#start-load').click();
    await page.locator('#saves-dialog').waitFor({ state: 'visible' });
    const explanation = await handleDialog(
      page,
      () => page.locator('#saves-backup-folder').click(),
      {
        accept: false,
      },
    );
    assert.match(explanation, /文件夹/);
    assert.equal(
      await page.evaluate(() => window.folderPickerCalls.length),
      0,
      'cancelled explanation does not open picker',
    );

    // Accept explanation -> picker with original options and gesture.
    await handleDialog(page, () => page.locator('#saves-backup-folder').click());
    await page.waitForFunction(() => window.folderPickerCalls.length === 1);
    assert.deepEqual(await page.evaluate(() => window.folderPickerCalls), [
      { options: { mode: 'readwrite', id: 'wanxiang-backup' }, gesture: true },
    ]);
    await page.locator('#saves-close').click();
    await page.locator('#saves-dialog').waitFor({ state: 'hidden' });

    assert.equal(
      (await listFiles(page, backupFolder)).length,
      13,
      'opening a new game preserves old backups',
    );

    // Full import: dismiss overwrite confirm first, prove no reload and data unchanged.
    const goldBefore = await page.evaluate(() => window.demo.getLibrary().inventory.gold);
    const dismissed = await importBackup(page, JSON.stringify(startBackup), { dismiss: true });
    assert.equal(dismissed, false);
    await page.clock.runFor(100);
    assert.equal(
      await page.evaluate(() => window.demo.getLibrary().inventory.gold),
      goldBefore,
      'dismissed full import keeps data',
    );
    assert.equal(
      await page.evaluate(() => window.folderPickerCalls.length),
      1,
      'dismissed full import does not open picker',
    );

    // Now accept full import; reload restores gold326 and reuses grant.
    await importBackup(page, JSON.stringify(startBackup));
    await page.waitForFunction(() =>
      document.querySelector('#data-folder-status')?.textContent.includes('上次备份'),
    );
    assert.equal(
      await page.evaluate(() => window.folderPickerCalls.length),
      0,
      'saved grant is reused after full import',
    );
    const firstFiles = new Map(await listFiles(page, backupFolder));
    assert.equal(firstFiles.size, 13);
    assert(!firstFiles.has(older[0]));
    assert.equal(firstFiles.get('my-notes.txt'), 'player-owned file');

    // Save slot integration checks after full backup reload.
    await saveSlotChecks(page, output, library);

    await page.evaluate(async () => {
      const { openDatabase } = await import('/src/storage/database.js');
      const db = await openDatabase();
      await db.write([['api.config', { profiles: { chat: { apiKey: 'fixture-secret' } } }]]);
      db.close();
    });
    await page.locator('[data-daily="outing"]').click();
    await page.locator('[data-tavern-exit="street"]').click();
    await page.locator('[data-daily="home"]').click();
    await page.evaluate(() => demo.flushStorage());
    const previousStatus = await page.locator('#data-folder-status').textContent();
    await page.clock.fastForward(301000);
    await page.waitForFunction((previous) => {
      const text = document.querySelector('#data-folder-status')?.textContent;
      return text?.includes('上次备份') && text !== previous;
    }, previousStatus);
    const secondFiles = new Map(await listFiles(page, backupFolder));
    assert.equal(secondFiles.size, 13);
    const next = [...secondFiles.keys()].find((name) => !firstFiles.has(name));
    updated = secondFiles.get(next);
    assert(updated);
    assert(!updated.includes('fixture-secret'));
    assert(
      JSON.parse(new Map(JSON.parse(updated).entries).get(libraryKey)).journeyActivities.some(
        ({ kind }) => kind === 'outing',
      ),
    );
    await page.clock.fastForward(301000);
    await page.evaluate(() => navigator.locks.request('wanxiang-folder-backup', () => {}));
    assert.deepEqual(
      await listFiles(page, backupFolder),
      [...secondFiles],
      'unchanged progress adds no file',
    );
  } finally {
    await page.close();
  }

  const clean = await browser.newPage({ viewport: { width: 1120, height: 700 } });
  try {
    await dismissAutomaticJournals(clean);
    await clean.addInitScript(() => {
      window.showDirectoryPicker = undefined;
    });
    await clean.goto(baseURL + '/?display=landscape');
    await importBackup(clean, updated);
    assert(
      await clean.evaluate(() =>
        demo.getLibrary().journeyActivities.some(({ kind }) => kind === 'outing'),
      ),
    );
  } finally {
    await clean.close();
  }
  return {
    normalGesture: true,
    timedBackup: true,
    restoredWithoutSiteData: true,
    keptTwelve: true,
    saveSlots: true,
  };
}
