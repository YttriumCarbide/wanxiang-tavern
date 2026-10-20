import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Real growth and rest results drive the displayed bars; no UI-only reward simulation. */
export async function settlementChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const document = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
      '<script type="module" src="./src/app.js"></script>',
      '',
    );
    await page.route('**/__settlement-fixture', (route) =>
      route.fulfill({ contentType: 'text/html', body: document }),
    );
    await page.goto(new URL('__settlement-fixture', baseURL).href);
    await page.evaluate(async () => {
      const [
        { createSettlement },
        { createEventScope },
        { newCampaign },
        { defaultProtagonist },
        { compileRoster },
        expeditionRules,
        { gainExperience, xpToNext },
      ] = await Promise.all([
        import('/src/app/settlement.js'),
        import('/src/shared/events.js'),
        import('/src/campaign.js'),
        import('/src/content/qingyuan.js'),
        import('/src/ai/library.js'),
        import('/src/expedition.js'),
        import('/src/growth.js'),
      ]);
      const library = newCampaign(defaultProtagonist());
      const definitions = compileRoster(library);
      const expedition = expeditionRules.newExpedition('bossGate', definitions);
      expedition.partyIds = [...library.party];
      let state;
      for (let index = 0; index < 3; index++) {
        state = expeditionRules.beginEncounter(expedition);
        state.phase = 'victory';
        for (const unit of Object.values(state.units).filter((unit) => unit.side === 'hero')) {
          unit.hp = 10;
          unit.mp = 1;
        }
        expeditionRules.completeEncounter(expedition, state);
      }
      const events = createEventScope();
      const sounds = [];
      const context = {
        events,
        session: {
          ai: { library },
          battle: { state },
          journey: { expedition },
          runtime: { mode: 'battle' },
        },
        generation: { save() {} },
        checkpoint: { saveNow() {} },
        audio: {
          play(name) {
            sounds.push(name);
          },
        },
      };
      const awards = library.characters.map((member) => gainExperience(member, xpToNext(1)));
      const settlement = createSettlement(context);
      window.settlementFixture = { context, settlement, events, sounds };
      void settlement.show({
        won: true,
        complete: false,
        encounter: 2,
        rewards: { gold: 20 },
        ether: 0,
        loot: [{ name: '星纹残片', description: '旅途中拾得的微光残片', value: 12 }],
        awards,
        onward() {
          window.restContinued = true;
        },
        back() {},
        retreat: false,
      });
    });
    await page.locator('#level-dialogue').waitFor({ state: 'visible' });
    assert((await page.locator('#level-dialogue .dialogue-bonuses').textContent()).includes('+'));
    await page.screenshot({ path: path.join(output, 'level-up-dialogue.png') });
    while (await page.locator('#level-dialogue').isVisible())
      await page.locator('#level-dialogue button').click();
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.experience-row').count(), 2);
    assert.equal(await page.locator('.reward-token img').count(), 1);
    assert.equal(await page.locator('.result-loot article').count(), 1);
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-level]')].every((label) => label.textContent === 'Lv.2'),
    );
    await page.screenshot({ path: path.join(output, 'battle-settlement-refreshed.png') });
    await page.locator('#continue').click();
    await page.locator('[data-rest="meal"]').click();
    await page.locator('.recovery-row').first().waitFor();
    assert.equal(await page.locator('.recovery-row').count(), 2);
    assert.equal(await page.locator('.experience-row').count(), 0);
    assert.equal(await page.locator('.experience-list .recovery-row').count(), 2);
    assert(
      await page
        .locator('.recovery-row i')
        .first()
        .evaluate((bar) => bar.getAnimations().length > 0),
    );
    await page.screenshot({ path: path.join(output, 'rest-recovery-animation.png') });
    await page.locator('#rest-continue').click();
    const recovery = await page.evaluate(() => {
      const expedition = window.settlementFixture.context.session.journey.expedition;
      return {
        continued: window.restContinued,
        pending: expedition.restPending,
        units: Object.values(expedition.carried.units).filter((unit) => unit.side === 'hero'),
      };
    });
    assert(recovery.continued && !recovery.pending);
    assert(recovery.units.every((unit) => unit.mp === unit.maxMp && unit.hp === 10));
    await page.evaluate(() => {
      window.settlementFixture.settlement.dispose();
      window.settlementFixture.events.dispose();
    });
    assert.deepEqual(errors, []);
    return {
      levelDialogue: true,
      exactBonuses: true,
      animatedExperience: true,
      compactRewards: true,
      loot: true,
      actualRestAnimation: true,
    };
  } finally {
    await page.close();
  }
}
