import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { tavernPresetFixture } from '../fixtures/ai.js';

export async function summoningChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  const requests = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await legacySession(page);
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    await page.evaluate(async () => {
      const [{ newCampaign, firstCompanion }, { defaultProtagonist }] = await Promise.all([
        import('/src/campaign.js'),
        import('/src/content/qingyuan.js'),
      ]);
      const library = newCampaign(defaultProtagonist());
      library.campaign.completed = true;
      library.inventory.summonContracts = 4;
      firstCompanion(library);
      library.campaign.tutorial = 'complete';
      library.inventory.gold = 200;
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
    });
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    async function openSummon() {
      const frame = page.frameLocator('#inn-frame iframe');
      await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('summon'));
      await frame.locator('#summon-open').click();
      await page.locator('#summon-choice').waitFor({ state: 'visible' });
    }
    assert.equal(await page.locator('#contract-count').textContent(), '3');
    assert.equal(await page.locator('#gold-count').textContent(), '200');
    const icon = await page.locator('#inn-resources img').first().boundingBox();
    assert.equal(icon.width, 30);
    assert.equal(icon.height, 30);
    const resource = await page.locator('#inn-resources > div').first().boundingBox();
    const toolbar = await page.locator('#records-open').boundingBox();
    assert(resource.width * resource.height < toolbar.width * toolbar.height * 3);
    await page.screenshot({ path: path.join(output, 'inn-resources-compact.png') });
    await openSummon();
    assert.equal(await page.locator('[data-summon-mode]').count(), 4);
    assert(!(await page.locator('#summon-wish').isVisible()));
    await page.locator('#summon-confirm').click();
    await page.locator('#summoned-dialog').waitFor({ state: 'visible' });
    assert.equal((await page.evaluate(() => demo.getLibrary())).characters.length, 4);
    assert.equal(await page.locator('#contract-count').textContent(), '2');
    await page.locator('#summoned-join').click();
    for (let i = 0; i < 6; i++) await page.locator('#companion-dialogue button').click();
    await page.route('**/api/ai/prompts/fixture', (route) =>
      route.fulfill({ json: { preset: { ...tavernPresetFixture(), id: 'fixture' } } }),
    );
    await page.route('**/api/ai/config', (route) =>
      route.fulfill({
        json: {
          character: {
            model: 'fixture',
            baseUrl: 'http://localhost:9000/v1',
            promptPresetId: 'fixture',
          },
        },
      }),
    );
    await page.route('**/api/ai/generate/character', async (route) => {
      requests.push(route.request().postDataJSON());
      if (requests.length === 1) {
        await route.fulfill({ status: 500, json: { error: '测试生成失败' } });
        return;
      }
      const entry = await page.evaluate(async () => {
        const { officialCharacter } = await import('/src/ai/library.js');
        return { ...officialCharacter('lyria'), id: 'character-summon-fixture' };
      });
      await route.fulfill({ json: { entry } });
    });
    await openSummon();
    await page.locator('[data-summon-mode="infinite"]').click();
    const wish = '蒸汽奇幻世界，使用机械弓的沉静游侠。';
    await page.locator('#summon-wish').fill(wish);
    await page.screenshot({ path: path.join(output, 'summon-methods.png') });
    await page.locator('#summon-confirm').click();
    await page.locator('#ai-dialog').waitFor({ state: 'visible' });
    assert.equal(requests[0].brief, wish);
    assert.equal(
      await page.locator('#contract-count').textContent(),
      '2',
      'Failure must not spend a contract',
    );
    await page.locator('#ai-close').click();
    await openSummon();
    await page.locator('[data-summon-mode="chaos"]').click();
    await page.evaluate(() => {
      window.savedRandom = Math.random;
      Math.random = () => 0.75;
    });
    await page.locator('#summon-confirm').click();
    await page.locator('#summoned-dialog').waitFor({ state: 'visible' });
    await page.evaluate(() => {
      Math.random = window.savedRandom;
    });
    assert.equal(requests[1].brief, wish);
    assert.equal(await page.locator('#contract-count').textContent(), '1');
    await page.locator('#summoned-join').click();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    assert.equal(await page.locator('#contract-count').textContent(), '1');
    assert.equal((await page.evaluate(() => demo.getLibrary())).characters.length, 5);
    assert.deepEqual(errors, []);
    return {
      officialFromWorldbook: true,
      infiniteWish: true,
      chaosWish: true,
      failureKeepsContract: true,
      persisted: true,
    };
  } finally {
    await page.close();
  }
}
