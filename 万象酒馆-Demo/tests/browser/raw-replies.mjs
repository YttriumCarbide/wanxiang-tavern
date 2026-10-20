import { legacySession } from './legacy-session.mjs';
import assert from 'node:assert/strict';
import { characterDocument, tavernPresetFixture } from '../fixtures/ai.js';
import { normalizeCharacter } from '../../src/ai/contracts.js';

/** Real portals and separate reply stores, with local fixtures and no external generation. */
export async function rawReplyChecks({ browser, baseURL }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [],
    scriptInputs = [];
  let characters = 0,
    scripts = 0;
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.route('**/api/ai/prompts/fixture-import', (route) =>
      route.fulfill({ json: { preset: { ...tavernPresetFixture(), id: 'fixture-import' } } }),
    );
    await page.route('**/api/ai/config', (route) =>
      route.fulfill({
        json: Object.fromEntries(
          ['character', 'script'].map((kind) => [
            kind,
            {
              model: 'fixture',
              baseUrl: 'http://127.0.0.1:9999/v1',
              promptPresetId: 'fixture-import',
            },
          ]),
        ),
      }),
    );
    await page.route('**/api/ai/generate/*', async (route) => {
      const kind = route.request().url().endsWith('/character') ? 'character' : 'script';
      let document, entry, number;
      if (kind === 'character') {
        number = ++characters;
        document = characterDocument();
        document.setting.name = `来客${number}`;
        entry = normalizeCharacter(document, `character-reply-${number}`);
      } else {
        scripts++;
        scriptInputs.push(route.request().postDataJSON());
        throw Error('Script API must not be called during combat testing');
      }
      const rawText = `${kind}回复${number}\n<wanxiang_json>\n${JSON.stringify(document)}\n</wanxiang_json>`;
      await route.fulfill({
        json: {
          entry,
          diagnostic: {
            kind,
            rawText,
            candidateText: JSON.stringify(document),
            issues: [],
            repairs: [],
          },
        },
      });
    });
    await legacySession(page);
    await page.goto(baseURL);
    await page.evaluate(() => {
      const key = 'wanxiang.worldbooks.v1';
      const library = JSON.parse(localStorage.getItem(key));
      library.inventory.summonContracts = 2;
      localStorage.setItem(key, JSON.stringify(library));
    });
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    const review = page.locator('#generation-review');
    const frame = async () => {
      await page
        .frameLocator('#inn-frame iframe')
        .locator('#status')
        .waitFor({ state: 'detached', timeout: 60000 });
      return page.frames().find((frame) => frame.url().includes('tavern.html'));
    };
    const move = async (place) => {
      const inn = await frame();
      await inn.evaluate((place) => window.assetPreview.placeNow(place), place);
      if (place === 'summon') await review.waitFor({ state: 'visible' });
      else await review.waitFor({ state: 'hidden' });
      return inn;
    };
    const inspect = async (prefix) => {
      await review.click();
      assert((await page.locator('#diagnostic-raw').inputValue()).startsWith(prefix));
      await page.locator('#diagnostic-close').click();
    };
    await frame();
    assert(await review.isHidden());
    await page.evaluate(() =>
      window.postMessage({ type: 'tavern-portal-visibility', summon: true }, location.origin),
    );
    assert(await review.isHidden(), 'Only the mounted tavern iframe may expose the gate control');
    let inn = await move('summon');
    assert(await review.isDisabled());
    for (let turn = 1; turn <= 2; turn++) {
      await inn.locator('#summon-open').click();
      await page.locator('[data-summon-mode="infinite"]').click();
      await page.locator('#summon-confirm').click();
      await page.locator('#summon-confirm').click();
      await page.locator('#summoned-dialog').waitFor({ state: 'visible' });
      await page.locator('#summoned-close').click();
      await inspect(`character回复${turn}`);
      await inn.evaluate(() => {
        const view = window.assetPreview;
        view.look(view.camera.rotation.y + Math.PI, view.camera.rotation.x);
      });
      await review.waitFor({ state: 'hidden' });
      for (const place of ['table', 'bar', 'fate', 'table2', 'gate']) await move(place);
      inn = await frame();
      await inn.locator('#enter').click();
      await page.locator('#destination-dialog').waitFor({ state: 'visible' });
      await page.locator('#destination-region-confirm').click();
      await page.locator('#destination-start').click();
      await page.waitForFunction(() => window.demo.getStatus().mode === 'battle', {
        timeout: 60000,
      });
      await review.waitFor({ state: 'visible' });
      assert(await review.isDisabled(), 'Local placeholder has no model raw reply');
      assert.equal(scripts, 0);
      await page.evaluate(() => window.demo.returnInn());
      await frame();
      assert(await review.isHidden());
      inn = await move('summon');
      await inspect(`character回复${turn}`);
    }
    assert.equal(scripts, 0);
    assert.equal(scriptInputs.length, 0);
    assert.deepEqual(errors, []);
    return {
      separateLatestReplies: true,
      onlyFacingSummonOrInBattle: true,
      scriptApiDisabled: true,
      noAutomaticRetry: true,
      fixedLocalStory: true,
    };
  } finally {
    await page.close();
  }
}
