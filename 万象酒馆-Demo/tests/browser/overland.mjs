import assert from 'node:assert/strict';
import path from 'node:path';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { joinPandora } from '../../src/companion-events.js';
import { overlandPlan } from '../../src/overland-travel.js';
import { legacySession } from './legacy-session.mjs';
import { worldFixture } from '../fixtures/multiverse.js';
import { normalizeWorld } from '../../src/worlds.js';

export async function overlandChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 768 } });
  const requests = [];
  const discoveries = [];
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
  library.tavernQuests.push({
    id: 'test-social',
    type: 'social',
    level: 4,
    status: 'offered',
    title: '失传曲谱',
    description: '寻回一份从未公开的曲谱。',
    hook: '琴师想找回师傅留的手稿。',
  });
  library.daily.active = {
    kind: 'outing',
    at: 0,
    ap: 1,
    direct: true,
    stage: 'roaming',
    turns: 0,
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
  await page.route('**/api/ai/generate/map', async (route) => {
    const { discovery } = route.request().postDataJSON();
    discoveries.push(discovery);
    if (discoveries.length === 1)
      await page.locator('#gal-stage [data-request-stop="map"]').waitFor();
    const fixture = worldFixture();
    fixture.id = 'world-road-discovery-' + discoveries.length;
    fixture.name = '路旁遗址 ' + discoveries.length;
    return route.fulfill({
      json: {
        world: {
          ...normalizeWorld(fixture),
          discovery: { linkId: discovery.route[0].id, direction: '南' },
        },
      },
    });
  });
  await page.route('**/api/ai/generate/script', (route) => {
    const { overland, playerIntent, socialQuest } = route.request().postDataJSON();
    if (socialQuest)
      return route.fulfill({
        json: {
          quest: {
            acts: Array.from({ length: 5 }, (_, index) => ({
              scene: 'tavern',
              title: '曲谱第 ' + (index + 1) + ' 幕',
              story: '【旁白】琴师翻开曲谱。',
            })),
            reward: { name: '琴师旧徽', description: '铜制琴师徽记', value: 12, stat: 'hp' },
          },
        },
      });
    assert.equal(
      playerIntent,
      overland.discovery
        ? ''
        : overland.to === 'eternal-city'
          ? '想看看首都。'
          : '过桥时留心河水。',
    );
    const plan = overlandPlan(overland.from, overland.to, overland.discovery);
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
  await page.route('**/api/ai/summary/plan', (route) => {
    const { items } = route.request().postDataJSON();
    return route.fulfill({ json: { batches: [{ ids: items.map(({ id }) => id) }] } });
  });
  await page.route('**/api/ai/generate/summary', (route) => {
    const { items } = route.request().postDataJSON();
    return route.fulfill({
      json: { items: items.map(({ id, gameTime }) => ({ id, summary: gameTime + ' 已发生。' })) },
    });
  });
  const galPage = page.locator('#gal-stage .gal-page');
  const chooseExit = (id) => page.locator(`[data-tavern-exit="${id}"]`);
  async function waitForStreet(id) {
    await page.waitForFunction((id) => {
      const street = document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview;
      return street?.state().sceneId === id && !street.state().moving;
    }, id);
  }
  async function walk(id) {
    await frame.locator('canvas').evaluate((canvas, id) => {
      const view = canvas.ownerDocument.defaultView.streetPreview;
      if (view.definition.illustration.fixed) return;
      const [x] = view.model.pointAnchor(id);
      view.look(-x / (view.state().framing.width * 0.35), 0);
    }, id);
    await frame.locator(`[data-hotspot="${id}"]`).click();
    if (id !== 'tavern') await waitForStreet(id);
  }
  async function openTavernDoor() {
    await page.waitForFunction(
      () => document.querySelector('#inn-frame iframe')?.contentWindow?.assetPreview?.placeNow,
      null,
      { timeout: 60000 },
    );
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('streetDoor'));
    await frame.locator('#street-open').click();
    await page.locator('#tavern-exit-picker[open]').waitFor();
  }
  async function readUntil(selector, visible = true) {
    const next = page.locator(selector);
    for (let step = 0; step < 130; step++) {
      if ((await next.isVisible()) === visible) return;
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
    assert.equal(visiblePins, 8, 'all map pins can be reached on the narrow layout');
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
    await page.locator('#player-intent textarea').fill('过桥时留心河水。');
    await page.locator('#player-intent button[value="continue"]').click();
    await page.setViewportSize({ width: 1280, height: 768 });
    await readUntil('[data-daily="travel:fight"]');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.turns), 3);
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
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.turns), 6);
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.scene), 'road-reeds');
    await page.locator('[data-daily="travel:ford"]').click();
    await readUntil('[data-daily="travel:papers"]');
    await page.locator('[data-daily="travel:papers"]').click();
    await galPage.waitFor({ state: 'visible' });
    await readUntil('[data-daily="home"]');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.scene), 'road-capital');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.turns), 10);
    await page.waitForFunction(() => !document.querySelector('#toast.visible'));
    await frame.locator('#street-map-open').click();
    await capital.waitFor();
    await page.mouse.move(640, 365);
    await page.mouse.wheel(0, 700);
    await atlas.locator('[data-detail="region"]').waitFor();
    const labelBoxes = await atlas
      .locator('.street-atlas-pin:not([data-travel-to^="world-"]) .street-atlas-pin-label:visible')
      .evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().toJSON()));
    assert.equal(labelBoxes.length, 8);
    for (const [i, a] of labelBoxes.entries())
      assert(
        !labelBoxes
          .slice(i + 1)
          .some(
            (b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top,
          ),
      );
    await page.screenshot({ path: path.join(output, 'travel-map-region.png') });
    await atlas.getByRole('button', { name: '全图', exact: true }).click();
    const fullSheet = atlas.locator('[data-detail="world"]');
    await fullSheet.waitFor();
    assert(await fullSheet.evaluate((svg) => svg.viewBox.baseVal.width >= 3072));
    assert.equal(await atlas.locator('.street-atlas-pin:visible').count(), 0);
    assert(await atlas.locator('.street-atlas-turns').isHidden());
    await page.screenshot({ path: path.join(output, 'travel-map-world.png') });
    await atlas.getByRole('button', { name: '回到两城', exact: true }).click();
    await capital.waitFor();
    assert.equal(await capital.getAttribute('aria-current'), 'location');
    await atlas.getByRole('button', { name: '关闭地图' }).click();
    await waitForStreet('road-capital');
    assert.equal(
      await page.evaluate(() => demo.getLibrary().daily.unlocks.silverCrownTavern),
      undefined,
    );
    for (const scene of [
      'crown-gateward',
      'crown-promenade',
      'crown-arcade',
      'crown-tavern-door',
    ]) {
      await walk(scene);
      assert(
        await frame.locator('canvas').evaluate(() => {
          const visitors = window.streetPreview.visitors();
          return visitors.spots > 0 && visitors.characters.length > 0;
        }),
      );
    }
    await page.screenshot({ path: path.join(output, 'silver-crown-tavern-door.png') });
    await walk('tavern');
    await page.waitForFunction(() => demo.getLibrary().daily.unlocks.silverCrownTavern === true);
    await page.evaluate(() => demo.flushStorage());
    await page.reload();
    await openTavernDoor();
    assert(await chooseExit('crown-tavern-door').isEnabled());
    await chooseExit('street').click();
    await waitForStreet('starlamp-street');
    await page.locator('[data-daily="home"]').click();
    await openTavernDoor();
    await chooseExit('crown-tavern-door').click();
    await waitForStreet('crown-tavern-door');
    await page.setViewportSize({ width: 390, height: 700 });
    assert(await frame.locator('[data-hotspot="tavern"]').isVisible());
    assert(await frame.locator('[data-hotspot="crown-arcade"]').isVisible());
    await page.locator('[data-daily="home"]').click();
    await openTavernDoor();
    await chooseExit('street').click();
    await waitForStreet('starlamp-street');
    await frame.locator('#street-map-open').click();
    const capitalStops = [
      'eternal-road-orchard',
      'eternal-road-mill',
      'eternal-road-checkpoint',
      'eternal-city',
    ];
    for (const id of capitalStops) await pin(id).waitFor();
    assert.equal(
      await atlas.locator('.street-atlas-pin:visible:not([data-travel-to^="world-"])').count(),
      8,
    );
    assert.match(await pin('eternal-city').textContent(), /13 回合/);
    await page.screenshot({ path: path.join(output, 'eternal-city-route-mobile.png') });
    await page.setViewportSize({ width: 1280, height: 768 });
    await pin('eternal-city').hover();
    await atlas.locator('[data-atlas-preview-leg].previewed').first().waitFor();
    assert.equal(await atlas.locator('[data-atlas-preview-leg].previewed').count(), 4);
    await page.screenshot({ path: path.join(output, 'eternal-city-route.png') });
    await pin('eternal-city').click();
    await page.locator('#player-intent textarea').fill('想看看首都。');
    await page.locator('#player-intent button[value="continue"]').click();
    for (const id of capitalStops) {
      await readUntil('[data-daily^="travel:"]:not([data-daily="travel:fight"]) >> nth=0');
      assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.scene), id);
      await page.locator('[data-daily^="travel:"]').first().click();
    }
    await readUntil('[data-daily="home"]');
    await waitForStreet('eternal-city');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.turns), 13);
    await walk('eternal-avenue');
    await page.screenshot({ path: path.join(output, 'eternal-city-avenue.png') });
    for (const id of [
      'eternal-plaza',
      'eternal-archive',
      'eternal-academy',
      'eternal-garden',
      'eternal-temple',
      'eternal-avenue',
      'eternal-plaza',
      'eternal-arena',
      'eternal-garrison',
      'eternal-quay',
      'eternal-garden',
      'eternal-temple',
    ]) {
      await walk(id);
    }
    await page.screenshot({ path: path.join(output, 'eternal-city-temple.png') });
    await page.waitForFunction(() => demo.getLibrary().atlasDiscoveries.length === 2);
    assert.deepEqual(
      discoveries[0].route.map(({ id }) => id),
      ['outskirts', 'road-bridge', 'road-reeds', 'road-capital'],
    );
    assert(discoveries[1].route.some(({ id }) => id === 'eternal-city'));
    assert.notEqual(discoveries[0].point.id, discoveries[1].point.id);
    await page.locator('[data-daily="home"]').click();
    await openTavernDoor();
    await chooseExit('street').click();
    await waitForStreet('starlamp-street');
    await frame.locator('#street-map-open').click();
    await pin('world-road-discovery-1').click();
    await page.locator('#player-intent button[value="continue"]').click();
    await readUntil('[data-daily="travel:approach"]');
    await page.locator('[data-daily="travel:approach"]').click();
    await readUntil('#destination-dialog[open]');
    assert.match(await page.locator('#destination-title').textContent(), /路旁遗址 1/);
    assert(await page.locator('#destination-start').isEnabled());
    await page.locator('#destination-close').click();
    await page.locator('[data-daily="quests"]').click();
    await page.locator('[data-quest-pick="test-social"]').click();
    const questStep = page.locator('[data-daily="quest-step"]');
    for (let index = 1; index <= 5; index++) {
      await questStep.filter({ hasText: '第 ' + index + ' 幕' }).waitFor();
      await questStep.click();
      if (index < 5)
        await readUntil('[data-daily="quest-step"]:text-is("第 ' + (index + 1) + ' 幕")');
      else {
        await page.locator('#gal-stage:not([hidden]) .gal-page').waitFor();
        await readUntil('#gal-stage:not([hidden]) .gal-page', false);
      }
    }
    const reward = await page.evaluate(() => ({
      owned: demo
        .getLibrary()
        .equipment.owned.some((item) => item.id === 'reward-quest-test-social-1'),
      quest: demo.getLibrary().tavernQuests.find(({ id }) => id === 'test-social'),
      toast: document.querySelector('#toast').textContent,
    }));
    assert(reward.owned, JSON.stringify(reward));
    assert.deepEqual(requests, [3, 4, 1]);
    assert.deepEqual(errors, []);
    return { acts: 3, capitalActs: 4, capitalAreas: 10, routeBattle: true, twoTavernExits: true };
  } finally {
    await page.close();
  }
}
