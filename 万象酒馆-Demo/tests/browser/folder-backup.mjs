import assert from 'node:assert/strict';
import { newCampaign } from '../../src/campaign.js';
import { officialCharacter } from '../../src/ai/library.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { exportDatabase } from '../../src/storage/backup.js';
import { dismissAutomaticJournals } from './legacy-session.mjs';

const backupFolder = '万象酒馆自动备份';
const libraryKey = 'game.wanxiang.worldbooks.v1';

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

async function importBackup(page, contents) {
  await page.locator('#start-load').click();
  await page.locator('#saves-import-full').waitFor({ state: 'visible' });
  await page.locator('#data-file').setInputFiles({
    name: 'wanxiang-auto-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(contents),
  });
  await page.waitForFunction(() => window.demo?.getLibrary().inventory.gold === 326);
}

export async function folderBackupChecks({ browser, baseURL }) {
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

    await page.locator('#start-journey').click();
    await page.waitForFunction(() =>
      document.querySelector('#data-folder-status')?.textContent.includes('创建角色后'),
    );
    assert.deepEqual(await page.evaluate(() => window.folderPickerCalls), [
      { options: { mode: 'readwrite', id: 'wanxiang-backup' }, gesture: true },
    ]);
    assert.equal(
      (await listFiles(page, backupFolder)).length,
      13,
      'opening a new game preserves old backups',
    );
    await page.locator('#ai-close').click();

    await importBackup(page, JSON.stringify(startBackup));
    await page.waitForFunction(() =>
      document.querySelector('#data-folder-status')?.textContent.includes('上次备份'),
    );
    assert.equal(
      await page.evaluate(() => window.folderPickerCalls.length),
      0,
      'saved grant is reused',
    );
    const firstFiles = new Map(await listFiles(page, backupFolder));
    assert.equal(firstFiles.size, 13);
    assert(!firstFiles.has(older[0]));
    assert.equal(firstFiles.get('my-notes.txt'), 'player-owned file');

    await page.evaluate(async () => {
      const { openDatabase } = await import('/src/storage/database.js');
      const db = await openDatabase();
      await db.write([['api.config', { profiles: { chat: { apiKey: 'fixture-secret' } } }]]);
      db.close();
    });
    await page.locator('[data-daily="open"]').click();
    await page.locator('[data-daily-slot="0"]').click();
    await page.locator('[data-daily-action="outing"]').click();
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
    assert.equal(
      JSON.parse(new Map(JSON.parse(updated).entries).get(libraryKey)).daily.draft[0].kind,
      'outing',
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
    assert.equal(await clean.evaluate(() => demo.getLibrary().daily.draft[0].kind), 'outing');
  } finally {
    await clean.close();
  }
  return {
    normalGesture: true,
    timedBackup: true,
    restoredWithoutSiteData: true,
    keptTwelve: true,
  };
}
