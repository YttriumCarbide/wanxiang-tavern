import assert from 'node:assert/strict';
import path from 'node:path';
import { dismissAutomaticJournals } from './legacy-session.mjs';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { compileRoster } from '../../src/ai/library.js';
import { newExpedition, beginEncounter } from '../../src/expedition.js';
import { prepareCorridorRing } from '../../src/emblem-progression.js';

export async function tutorialRevisionChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await dismissAutomaticJournals(page);
  await page.route(baseURL + '/', async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace(
        '<meta name="wanxiang-test-backend" content="local">',
        '',
      ),
    });
  });
  async function finishEmblemDialogue() {
    for (let index = 0; index < 30 && (await page.locator('#emblem-dialogue').isVisible()); index++)
      await page.locator('#emblem-dialogue button').click();
  }
  try {
    const library = newCampaign(defaultProtagonist());
    library.campaign.completed = true;
    library.inventory.summonContracts = 1;
    firstCompanion(library);
    library.campaign.tutorial = 'complete';
    const expedition = newExpedition('ruinsGate', compileRoster(library), {
      ...library.exploration.ruins.frontier[0],
      sequence: 1,
    });
    expedition.index = 4;
    expedition.partyIds = [...library.party];
    assert(prepareCorridorRing(library, expedition));
    const snapshot = {
      version: 1,
      library,
      state: beginEncounter(expedition),
      plan: [],
      history: [],
      journey: { bossChoice: 'ruinsGate', regionMap: 'ruins', expedition },
      activeScript: null,
      storyView: { page: 4, latest: 4, pages: Array.from({ length: 5 }, () => []) },
      quick: [],
    };
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    await page.evaluate(async (snapshot) => {
      const { openDatabase } = await import('/src/storage/database.js');
      const database = await openDatabase();
      await database.write(
        [
          ['game.wanxiang.worldbooks.v1', JSON.stringify(snapshot.library)],
          ['game.wanxiang.battle-checkpoint.v1', JSON.stringify(snapshot)],
          [
            'game.wanxiang.generation-options.v1',
            JSON.stringify({
              developerMode: true,
              allowRetreat: true,
              protagonistApi: false,
              scriptApi: false,
            }),
          ],
        ],
        ['game.wanxiang.creation-pending.v1'],
      );
      database.close();
    }, snapshot);
    await page.reload();
    await page.waitForFunction(() => window.demo?.getStatus().mode === 'battle');
    await page.locator('#emblem-dialogue').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#emblem-dialogue').getAttribute('data-speaker'), '伊蒂丝');
    await finishEmblemDialogue();
    assert.equal((await page.evaluate(() => demo.getState())).units.aegis.emblemCharge, 6);
    await page.waitForFunction(() => !demo.getStatus().animating);
    await page.locator('[data-unit=aegis]').click();
    await page.locator('[data-unit=aegis]').click();
    await page.locator('#commit').click();
    assert.equal(
      (await page.evaluate(() => demo.getState())).phase,
      'opening',
      'Empty engage cannot bypass the compulsory balance lesson',
    );
    await page.locator('[data-unit=aegis]').click();
    await page.locator('[data-skill=emblem-balance]').click();
    await page.locator('[data-unit=ruinsGate]').click();
    assert((await page.evaluate(() => demo.getPlan()))[0].followUp);
    await page.screenshot({ path: path.join(output, 'corridor-ring-balance.png') });
    await page.locator('#commit').click();
    await page.waitForFunction(() => !demo.getStatus().playing);
    assert.equal((await page.evaluate(() => demo.getLibrary())).progression.emblemLesson, 'done');
    assert.equal((await page.evaluate(() => demo.getState())).units.ruinsGate.buffs.balance, 1);
    const forecast = await page.evaluate(() => demo.getForecast());
    await page.locator('#commit').click();
    await page.waitForFunction(() => !demo.getStatus().playing);
    const actual = await page.evaluate(() => demo.getState());
    for (const [id, unit] of Object.entries(forecast.final.units))
      assert.equal(actual.units[id].hp, unit.hp);
    assert(actual.units.ruinsGate.openingAttackUsed);
    await page.evaluate(() => demo.returnInn());
    await page.evaluate(async () => {
      await demo.flushStorage();
      const { openDatabase } = await import('/src/storage/database.js');
      const lib = demo.getLibrary();
      lib.progression.settlements = ['one', 'two', 'three'];
      lib.progression.pandoraJoined = true;
      lib.progression.swapLesson = 'done';
      lib.progression.entryLesson = 'done';
      lib.inventory.ether = 0;
      const database = await openDatabase();
      await database.write([['game.wanxiang.worldbooks.v1', JSON.stringify(lib)]]);
      database.close();
    });
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#emblem-dialogue').waitFor({ state: 'visible' });
    await finishEmblemDialogue();
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('fate'));
    await frame.locator('#emblem-open').click();
    await page.locator('#emblem-dialogue').waitFor({ state: 'visible' });
    await finishEmblemDialogue();
    const received = await page.evaluate(() => demo.getLibrary());
    assert(received.emblems.includes('mizunatsuki-ran'));
    assert.equal(received.inventory.ether, 0);
    await page.locator('[data-prepare-slot="1"]').click();
    await page.locator('[data-emblem-character]').selectOption('mizunatsuki-ran');
    assert.equal((await page.evaluate(() => demo.getLibrary())).progression.overloadLesson, 'done');
    await page.screenshot({ path: path.join(output, 'overload-first-acquisition.png') });
    assert.deepEqual(errors, []);
    return {
      corridorRingAtBoss: true,
      immediateBalanceRequired: true,
      lightningMatchesPreview: true,
      thirdTripOverloadFree: true,
    };
  } catch (failure) {
    await page
      .screenshot({ path: path.join(output, 'tutorial-revision-failure.png') })
      .catch(() => {});
    throw failure;
  } finally {
    await page.close();
  }
}
