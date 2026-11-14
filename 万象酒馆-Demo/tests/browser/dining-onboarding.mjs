import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';

/** Current Gal introduction after the second completed trip, then real shopping and cooking. */
export async function diningOnboardingChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await legacySession(page);
  const library = newCampaign(defaultProtagonist());
  library.campaign.tutorial = 'complete';
  library.campaign.completed = true;
  library.inventory.summonContracts = 1;
  firstCompanion(library);
  library.progression.settlements = ['completed-one', 'completed-two'];
  await page.addInitScript((value) => {
    if (origin === 'null' || sessionStorage.getItem('dining-onboarding-seeded')) return;
    localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(value));
    sessionStorage.setItem('dining-onboarding-seeded', 'true');
  }, library);
  const calls = [];
  await page.route('**/api/ai/generate/*', (route) => {
    calls.push(route.request().url());
    return route.abort();
  });
  try {
    await page.goto(baseURL);
    await page.locator('#gal-stage').waitFor({ state: 'visible' });
    for (let index = 0; index < 800; index++) {
      if (
        (await page.evaluate(() => demo.getLibrary().daily.tutorial)) === 'planning' &&
        !(await page.locator('#gal-stage').isVisible())
      )
        break;
      if (await page.locator('#gal-stage').isVisible()) {
        if ((await page.locator('#gal-stage').getAttribute('data-leaving')) === 'true')
          await page.waitForFunction(
            () => document.querySelector('#gal-stage').dataset.leaving !== 'true',
          );
        else await page.locator('.gal-page').click();
      } else await page.waitForTimeout(50);
    }
    const state = await page.evaluate(() => demo.getLibrary());
    assert.equal(state.progression.pandoraJoined, true);
    assert.equal(state.daily.tutorial, 'planning');
    assert(
      await page.locator('[data-daily="service"]').isVisible(),
      'Pan rescue introduces the day planner',
    );
    await page.locator('[data-daily="meal"]').click();
    for (let index = 0; index < 70 && !(await page.locator('#void-shop').isVisible()); index++) {
      if (await page.locator('#gal-stage[data-leaving="true"]').isVisible()) {
        await page.locator('#gal-stage[data-leaving="true"]').waitFor({ state: 'hidden' });
      } else if (await page.locator('.gal-page').isVisible())
        await page.locator('.gal-page').click();
      else await page.waitForTimeout(50);
    }
    assert.equal((await page.evaluate(() => demo.getLibrary())).dining.tutorial, 'buy');
    await page.locator('[data-food-select="bread"]').click();
    await page.locator('[data-food-buy="bread"]').click();
    await page.locator('[data-food-select="cheese"]').click();
    await page.locator('[data-food-buy="cheese"]').click();
    assert.equal((await page.evaluate(() => demo.getLibrary())).dining.tutorial, 'cook');
    await page.locator('[data-food-dine]').click();
    const selected = await page
      .locator('[data-meal-member][aria-pressed="true"]')
      .evaluateAll((buttons) => buttons.map((button) => button.dataset.mealMember));
    for (const id of selected) await page.locator(`[data-meal-member="${id}"]`).click();
    for (const id of [state.campaign.protagonistId, 'official-pandora', 'official-edith'])
      await page.locator(`[data-meal-member="${id}"]`).click();
    await page.screenshot({ path: path.join(output, 'dining-onboarding-mobile.png') });
    await page.locator('[data-meal-start]').click();
    for (let n = 0; n < 9; n++) await page.locator('[data-cook-tap]').click();
    await page.locator('[data-meal-leave]').waitFor({ state: 'visible' });
    const after = await page.evaluate(() => demo.getLibrary());
    assert.equal(after.dining.tutorial, 'done');
    assert.equal(after.dining.inventory.bread, 0);
    assert(after.dining.pending['official-pandora']);
    assert(after.relationships['official-pandora'].affection > 0);
    assert.equal(calls.length, 0);
    await page.locator('[data-meal-leave]').click();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    assert.equal((await page.evaluate(() => demo.getLibrary())).dining.tutorial, 'done');
    assert.equal(await page.locator('#void-shop').isVisible(), false);
    return {
      secondTripPanIntroduction: true,
      ingredientPurchase: true,
      cooking: true,
      affection: true,
      persisted: true,
    };
  } finally {
    await page.close();
  }
}
