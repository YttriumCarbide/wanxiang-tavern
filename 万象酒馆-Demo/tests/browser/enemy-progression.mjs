import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { newLibrary } from '../../src/ai/library.js';
import { explorationSpec, completeExploration } from '../../src/exploration.js';

/** Re-enter a cleared map through the real gate with no configured AI connection. */
export async function enemyProgressionChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [],
    requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (/\/api\/ai\/(generate|prepare)/.test(request.url())) requests.push(request.url());
  });
  await legacySession(page);
  const library = newLibrary();
  const entry = library.exploration.ruins.frontier[0];
  const encounters = Array.from({ length: 5 }, (_, index) => explorationSpec(entry, index));
  completeExploration(library.exploration, entry, {
    encounters,
    ether: 41,
    runId: 'original',
    scriptId: 'original-book',
    title: '旧日石门',
  });
  library.history.push({
    runId: 'original',
    scriptId: 'original-book',
    nodeId: entry.id,
    title: '旧日石门',
    complete: true,
    played: [],
    lines: [{ speaker: '旁白', text: '第一次经过石门的正文。', encounter: 0, stage: 'before' }],
  });
  await page.addInitScript((seed) => {
    if (location.origin === 'null' || sessionStorage.getItem('progression-seed')) return;
    localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(seed));
    sessionStorage.setItem('progression-seed', 'true');
  }, library);
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    const original = await page.evaluate(() => ({
      routes: demo.getExploration(),
      history: demo.getLibrary().history,
    }));
    const inn = page.frameLocator('#inn-frame iframe');
    await inn.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await inn.locator('canvas').evaluate(() => window.assetPreview.placeNow('gate'));
    await inn.locator('#enter').click();
    await page.locator('#destination-region-confirm').click();
    const old = page.locator(`[data-map-node="${entry.id}"]`);
    assert(await old.isEnabled());
    await old.click();
    assert.match(await page.locator('#destination-start').textContent(), /回忆/);
    await page.locator('#destination-start').click();
    await page.waitForFunction(() => demo.getStatus().mode === 'battle');
    const battle = await page.evaluate(() => demo.getState());
    assert.deepEqual(battle.enemyIds, encounters[0].enemyIds);
    for (const id of battle.enemyIds) {
      assert(battle.units[id].level >= 1);
      assert.match(
        await page.locator(`[data-unit="${id}"] .enemy-level`).textContent(),
        /^Lv\.\d+$/,
      );
    }
    await page.locator('#story-toggle').click();
    await page.locator('#story-feed').waitFor({ state: 'visible' });
    assert.match(await page.locator('#story-lines').textContent(), /第一次经过石门的正文/);
    assert(await page.locator('#quick-chat-form').isHidden());
    await page.screenshot({ path: path.join(output, 'recollection-original.png') });
    await page.locator('#story-close').click();
    await page.locator('#story-feed').waitFor({ state: 'hidden' });
    await page.waitForFunction(() => !demo.getStatus().animating);
    await page.screenshot({ path: path.join(output, 'enemy-levels.png') });
    await page.evaluate(() => demo.returnInn());
    assert.deepEqual(
      await page.evaluate(() => ({
        routes: demo.getExploration(),
        history: demo.getLibrary().history,
      })),
      original,
    );
    assert.deepEqual(requests, []);
    assert.deepEqual(errors, []);
    return {
      recallWithoutApi: true,
      sameEnemyIds: true,
      levelsVisible: true,
      historyPreserved: true,
    };
  } finally {
    await page.close();
  }
}
