import assert from 'node:assert/strict';
import path from 'node:path';
import { dismissAutomaticJournals, finishGalDialogue } from './legacy-session.mjs';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { compileRoster } from '../../src/ai/library.js';
import {
  newExpedition,
  beginEncounter,
  completeEncounter,
  chooseRest,
} from '../../src/expedition.js';
import { prepareCorridorRing } from '../../src/emblem-progression.js';
import { createAdventureState } from '../../src/adventure/state.js';
import { validAdventureSnapshot } from '../../src/adventure/snapshot.js';
import { normalizeScript } from '../../src/ai/contracts.js';
import { adventureTestScript } from '../../src/content/generation-mode.js';

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
  try {
    const library = newCampaign(defaultProtagonist());
    library.campaign.completed = true;
    library.inventory.summonContracts = 1;
    firstCompanion(library);
    library.campaign.tutorial = 'complete';
    const route = { ...library.exploration.mill.frontier[0], sequence: 0 };
    const expedition = newExpedition('bossGate', compileRoster(library), route);
    expedition.partyIds = [...library.party];
    for (let index = 0; index < 4; index++) {
      assert.equal(prepareCorridorRing(library, expedition), false);
      const s = beginEncounter(expedition);
      s.phase = 'victory';
      completeEncounter(expedition, s);
      if (expedition.restPending) chooseRest(expedition, 'sleep');
    }
    const book = normalizeScript(adventureTestScript('mill'), 'tutorial-corridor');
    expedition.adventure = createAdventureState(book, expedition.id);
    library.scripts = [book];
    assert.equal(
      prepareCorridorRing(library, expedition, () => 0),
      true,
    );
    const battleState = beginEncounter(expedition);
    const snapshot = {
      version: 2,
      library,
      state: battleState,
      plan: [],
      history: [],
      journey: { bossChoice: 'millVoleAlpha', regionMap: 'mill', expedition },
      activeScript: book,
      storyView: { page: 4, latest: 4, pages: Array.from({ length: 5 }, () => []) },
      quick: [],
    };
    assert(validAdventureSnapshot(snapshot));
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
    const dialogue = page.locator('#gal-stage[data-owner="emblem-dialogue"]');
    await dialogue.waitFor({ state: 'visible' });
    let emblemText = '';
    for (let step = 0; step < 30; step++) {
      const state = await page.locator('#gal-stage').evaluate((stage) => ({
        hidden: stage.hidden,
        owner: stage.dataset.owner,
        leaving: stage.dataset.leaving === 'true',
        text: stage.innerText,
      }));
      emblemText += state.text;
      if (state.hidden || state.owner !== 'emblem-dialogue') break;
      if (emblemText.includes('檀虹羽')) break;
      if (state.leaving) {
        await page.waitForFunction(
          () => document.querySelector('#gal-stage').dataset.leaving !== 'true',
        );
      } else {
        await page.locator('.gal-page').click();
      }
    }
    assert(emblemText.includes('檀虹羽'), emblemText);
    await finishGalDialogue(page, 'emblem-dialogue');
    assert.equal((await page.evaluate(() => demo.getState())).units.aegis.emblemCharge, 6);
    await page.waitForFunction(() => !demo.getStatus().animating);
    await page.locator('[data-unit=aegis]').click();
    await page.locator('[data-unit=aegis]').click();
    await page.locator('[data-skill=emblem-balance]').click();
    await page.locator('[data-unit=millVoleAlpha]').click();
    assert((await page.evaluate(() => demo.getPlan()))[0].followUp);
    await page.screenshot({ path: path.join(output, 'corridor-ring-balance.png') });
    await page.locator('#commit').click();
    await page.waitForFunction(() => !demo.getStatus().playing);
    assert.equal((await page.evaluate(() => demo.getState())).units.millVoleAlpha.buffs.balance, 1);
    const forecast = await page.evaluate(() => demo.getForecast());
    await page.locator('#commit').click();
    await page.waitForFunction(() => !demo.getStatus().playing);
    const actual = await page.evaluate(() => demo.getState());
    for (const [id, unit] of Object.entries(forecast.final.units))
      assert.equal(actual.units[id].hp, unit.hp);
    assert.deepEqual(errors, []);
    return {
      corridorRingAtBoss: true,
      immediateBalanceRequired: true,
      lightningMatchesPreview: true,
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
