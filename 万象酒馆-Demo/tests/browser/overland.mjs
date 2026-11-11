import assert from 'node:assert/strict';
import path from 'node:path';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { joinPandora } from '../../src/companion-events.js';
import { overlandPlan } from '../../src/overland-travel.js';
import { legacySession } from './legacy-session.mjs';

export async function overlandChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 768 } });
  const requests = [];
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => {
    if (request.url().includes('/api/ai/')) errors.push(request.failure()?.errorText);
  });
  await legacySession(page);
  const library = newCampaign(defaultProtagonist());
  library.campaign.completed = true;
  library.inventory.summonContracts = 1;
  firstCompanion(library);
  library.campaign.tutorial = 'complete';
  library.progression.settlements = ['first', 'second'];
  joinPandora(library);
  library.characters[0].growth.level = 50;
  library.daily.tutorial = 'done';
  library.daily.running = true;
  library.daily.plan = [{ kind: 'outing', at: 0, ap: 1 }];
  library.daily.active = {
    ...library.daily.plan[0],
    stage: 'roaming',
    remaining: 10,
    scene: 'outskirts',
    companions: [],
  };
  await page.addInitScript((value) => {
    if (window.top !== window || sessionStorage.getItem('overland-seed')) return;
    localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(value));
    localStorage.setItem(
      'wanxiang.generation-options.v1',
      JSON.stringify({ developerMode: true, skipAiGeneration: false }),
    );
    sessionStorage.setItem('overland-seed', 'true');
  }, library);
  await page.route('**/api/ai/generate/script', (route) => {
    const { overland } = route.request().postDataJSON();
    const plan = overlandPlan(overland.from, overland.to);
    requests.push(plan.stages.length);
    return route.fulfill({
      json: {
        acts: plan.stages.map((leg) => ({
          id: leg.id,
          title: leg.to.name,
          story: '【旁白】你们来到下一处路标。',
          ...(leg.choices
            ? {
                choices: leg.choices.map(({ id, action }) => ({
                  id,
                  label: action,
                  outcome: '【旁白】一行人顺利通过。',
                })),
              }
            : {}),
        })),
      },
    });
  });
  const frame = page.frameLocator('#inn-frame iframe');
  const galPage = page.locator('#gal-stage .gal-page');
  async function readUntil(selector) {
    const next = page.locator(selector);
    for (let step = 0; step < 130; step++) {
      if (await next.isVisible()) return;
      await page.evaluate(() => {
        const stage = document.querySelector('#gal-stage');
        if (stage && !stage.hidden && stage.dataset.leaving !== 'true')
          stage.querySelector('.gal-page')?.click();
      });
      await page.waitForTimeout(100);
    }
    const state = await page.evaluate(() => ({
      active: window.demo?.getLibrary().daily.active,
      status: document.querySelector('.daily-status')?.textContent,
      toast: document.querySelector('#toast')?.textContent,
      gal: document.querySelector('.gal-text')?.textContent,
      scene:
        document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.definition.id,
    }));
    throw Error(`未到达 ${selector} · ${JSON.stringify({ requests, errors, state })}`);
  }
  try {
    await page.goto(baseURL);
    await frame.locator('#street-map-open').click();
    const atlas = frame.getByRole('dialog', { name: '泛生界大地图' });
    const pin = (id) => atlas.locator(`[data-travel-to="${id}"]`);
    const bridge = pin('road-bridge');
    const reeds = pin('road-reeds');
    const capital = pin('road-capital');
    await capital.waitFor();
    await page.locator('.app-header').waitFor({ state: 'hidden' });
    assert.equal(await pin('outskirts').getAttribute('aria-current'), 'location');
    assert.match(await bridge.textContent(), /双拱石桥.*3 回合/);
    assert.match(await reeds.textContent(), /芦苇浅滩.*6 回合/);
    assert.match(await capital.textContent(), /银冠城.*10 回合/);
    assert.deepEqual(await atlas.locator('.street-atlas-leg').allTextContents(), [
      '3 回合危险 Lv.3',
      '3 回合危险 Lv.2',
      '4 回合危险 Lv.4',
    ]);
    const positions = await Promise.all(
      [pin('outskirts'), bridge, reeds, capital].map(async (stop) => (await stop.boundingBox()).x),
    );
    const spans = positions.slice(1).map((x, index) => x - positions[index]);
    assert(spans.every((span) => span > 0));
    assert(Math.abs(spans[0] - spans[1]) < Math.max(...spans) * 0.2);
    assert(spans[2] > Math.max(spans[0], spans[1]));
    await reeds.focus();
    await atlas.locator('.street-atlas-route-preview.previewed').waitFor();
    assert.deepEqual(requests, []);
    await page.screenshot({ path: path.join(output, 'travel-map.png') });
    const bridgeBefore = await bridge.boundingBox();
    await page.mouse.move(640, 285);
    await page.mouse.down();
    await page.mouse.move(730, 315, { steps: 5 });
    await page.mouse.up();
    const bridgeAfter = await bridge.boundingBox();
    assert(bridgeAfter.x > bridgeBefore.x + 80 && bridgeAfter.y > bridgeBefore.y + 20);

    await atlas.getByRole('button', { name: '关闭地图' }).click();
    await atlas.waitFor({ state: 'hidden' });
    await page.locator('.app-header').waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 390, height: 700 });
    await frame.locator('#street-map-open').click();
    await capital.waitFor();
    await page.locator('.app-header').waitFor({ state: 'hidden' });
    const visiblePins = await atlas.locator('.street-atlas-pin').evaluateAll(
      (pins) =>
        pins.filter((button) => {
          const box = button.getBoundingClientRect();
          return (
            box.x >= 0 &&
            box.right <= innerWidth &&
            document
              .elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
              ?.closest('.street-atlas-pin') === button
          );
        }).length,
    );
    assert.equal(visiblePins, 4, 'all map pins can be reached on the narrow layout');
    const overlaps = await atlas.locator('.street-atlas-travel').evaluate((layer) => {
      const pins = [...layer.querySelectorAll('.street-atlas-pin-label')];
      const legs = [...layer.querySelectorAll('.street-atlas-leg')];
      return legs.some((leg) => {
        const area = leg.getBoundingClientRect();
        return pins.some((pin) => {
          const label = pin.getBoundingClientRect();
          return (
            area.left < label.right &&
            area.right > label.left &&
            area.top < label.bottom &&
            area.bottom > label.top
          );
        });
      });
    });
    assert.equal(overlaps, false, 'leg annotations leave the stop names clear on narrow screens');
    await page.screenshot({ path: path.join(output, 'travel-map-mobile.png') });
    await capital.click();
    await page.setViewportSize({ width: 1280, height: 768 });
    await readUntil('[data-daily="travel:fight"]');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.remaining), 7);
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.scene), 'road-bridge');
    await page.locator('[data-daily="travel:fight"]').click();
    await page.waitForFunction(() => demo.getStatus().mode === 'battle');
    assert.deepEqual(await page.evaluate(() => demo.getState().enemyIds), ['patrolHound']);
    await page.waitForFunction(() => !demo.getStatus().animating);
    await page.locator('[data-start="0"]').click();
    await page.locator('[data-unit="aegis"]').click();
    await page.locator('[data-skill="attack"]').click();
    if (await page.evaluate(() => demo.getStatus().interactionStep === 'target'))
      await page.locator('[data-unit="patrolHound"]').click();
    await page.locator('#commit').click();
    await page.getByRole('button', { name: '继续行程', exact: true }).click();
    await readUntil('[data-daily="travel:ford"]');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.remaining), 4);
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.scene), 'road-reeds');
    await page.locator('[data-daily="travel:ford"]').click();
    await readUntil('[data-daily="travel:papers"]');
    await page.locator('[data-daily="travel:papers"]').click();
    await galPage.waitFor({ state: 'visible' });
    await readUntil('[data-daily="home"]');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.scene), 'road-capital');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.remaining), 0);
    assert.deepEqual(requests, [3]);
    assert.deepEqual(errors, []);
    return { acts: 3, reachedWithNoTurnsRemaining: true, routeBattle: true };
  } finally {
    await page.close();
  }
}
