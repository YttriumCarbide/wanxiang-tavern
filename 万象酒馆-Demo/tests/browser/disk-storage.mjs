import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { newCampaign } from '../../src/campaign.js';
import { officialCharacter } from '../../src/ai/library.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { dismissAutomaticJournals } from './legacy-session.mjs';

export async function diskStorageChecks({ browser, baseURL, output }) {
  const libraryKey = 'game.wanxiang.worldbooks.v1';
  const legacy = newCampaign(defaultProtagonist());
  legacy.campaign = { ...legacy.campaign, tutorial: 'done', completed: true, firstRecruit: true };
  legacy.characters.push(officialCharacter('aegis'), officialCharacter('pandora'));
  legacy.progression.pandoraJoined = true;
  legacy.daily.tutorial = 'done';
  legacy.inventory.gold = 326;

  const first = await browser.newPage({ viewport: { width: 1120, height: 700 } });
  try {
    await dismissAutomaticJournals(first);
    await first.route(baseURL + '/browser-cache-fixture', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Old local game</title>',
      }),
    );
    await first.goto(baseURL + '/browser-cache-fixture');
    await first.evaluate(
      async ({ libraryKey, legacy }) => {
        const { openDatabase } = await import('/src/storage/database.js');
        const old = await openDatabase();
        await old.write([
          ['installation', { version: 1 }],
          [libraryKey, JSON.stringify(legacy)],
          ['game.wanxiang.creation-pending.v1', 'false'],
          ['game.wanxiang.setup.completed.v1', 'true'],
          ['api.config', { version: 5, profiles: { chat: { model: 'Browser-only connection' } } }],
        ]);
        old.close();
      },
      { libraryKey, legacy },
    );
    await first.goto(baseURL + '/?display=landscape');
    await first.waitForFunction(() => window.demo?.getLibrary().inventory.gold === 326);
    assert.equal(await first.locator('meta[name="wanxiang-disk-storage"]').count(), 1);
    await first.locator('[data-daily="open"]').click();
    await first.locator('[data-daily-slot="0"]').click();
    const saved = first.waitForResponse((response) => {
      if (response.url() !== baseURL + '/__demo/storage' || response.request().method() !== 'POST')
        return false;
      const entries = response.request().postDataJSON()?.entries || [];
      return entries.some(
        ([key, value]) =>
          key === libraryKey && JSON.parse(value).daily.draft.some(({ kind }) => kind === 'outing'),
      );
    });
    await first.locator('[data-daily-action="outing"]').click();
    assert((await saved).ok(), 'regular gameplay is committed to disk automatically');
  } finally {
    await first.close();
  }

  const response = await fetch(baseURL + '/__demo/storage');
  assert(response.ok);
  const state = await response.json();
  assert(!state.entries.some(([key]) => key === 'api.config'), 'browser API settings stay private');
  const file = path.join(state.directory, '当前存档.json');
  assert.equal(path.dirname(state.directory), path.resolve(output, '..'));
  const snapshot = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(JSON.parse(new Map(snapshot.records).get(libraryKey)).daily.draft[0].kind, 'outing');

  const clean = await browser.newPage({ viewport: { width: 1120, height: 700 } });
  try {
    await dismissAutomaticJournals(clean);
    await clean.goto(baseURL + '/?display=landscape');
    await clean.waitForFunction(() => window.demo?.getLibrary().daily.draft[0]?.kind === 'outing');
    assert.equal(await clean.evaluate(() => demo.getLibrary().inventory.gold), 326);
    assert(!(await clean.locator('#start-screen').isVisible()));
    assert.match(await clean.locator('.local-data-panel p').first().textContent(), /自动保存到/);
  } finally {
    await clean.close();
  }

  return { migrated: true, automaticallySaved: true, restoredWithoutBrowserData: true };
}
