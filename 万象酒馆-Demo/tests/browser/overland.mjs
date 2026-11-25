import assert from 'node:assert/strict';
import path from 'node:path';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { joinPandora } from '../../src/companion-events.js';
import { overlandPlan } from '../../src/overland-travel.js';
import { legacySession } from './legacy-session.mjs';
import { worldFixture } from '../fixtures/multiverse.js';
import { mapResponse } from '../../src/ai/pipeline/map-request.js';
import {
  verifyCityFacilityDistribution,
  verifyTavernInteriorChatPlaces,
} from './city-facility.mjs';
import { openCityDirectory } from './town-navigation.mjs';

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
  library.unlockedDungeons.push('moss-hollow');
  library.tavernQuests.push({
    id: 'test-social',
    type: 'social',
    level: 4,
    status: 'offered',
    title: '失传曲谱',
    description: '寻回一份从未公开的曲谱。',
    hook: '琴师想找回师傅留的手稿。',
  });
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
    fixture.linkId = discovery.route[0].id;
    fixture.direction = '南';
    const enemy = fixture.enemies[0];
    delete enemy.hp;
    enemy.tier = 'medium';
    enemy.intents = [
      {
        name: '划伤',
        slots: [0],
        effects: [{ type: 'buff', buff: 'bleed', power: 'high' }],
      },
    ];
    return route.fulfill({ json: { world: mapResponse(JSON.stringify(fixture), { discovery }) } });
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
          story: '【旁白】你们在途中遭遇了一段值得留意的插曲。',
          ...(leg.type === 'event' ? { choices: ['上前交涉', '留心四周'] } : {}),
        })),
      },
    });
  });
  await page.route('**/api/ai/generate/quick-chat', (route) => {
    const payload = route.request().postDataJSON();
    assert(
      payload.dialogueContext?.title &&
        payload.dialogueContext?.place &&
        payload.dialogueContext?.opening,
    );
    const reply = '【旁白】旅途交涉顺利推进，同行者记下了这段插曲。';
    return route.fulfill({ json: { content: reply, display: reply } });
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
  const chooseExit = (id) => page.locator(`[data-tavern-exit="${id}"]`);
  async function waitForStreet(id) {
    await page.waitForFunction((id) => {
      const street = document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview;
      return street?.state().sceneId === id && !street.state().moving;
    }, id);
  }
  async function walk(id) {
    const pureBackdrop = await frame
      .locator('canvas')
      .evaluate(() => Boolean(window.streetPreview?.definition?.illustration?.pureBackdrop));
    if (pureBackdrop) {
      if (id === 'tavern') await frame.locator('#street-return').click();
      else {
        const directory = await openCityDirectory(page);
        await directory.locator(`[data-city-node="${id}"]`).click();
      }
      if (id !== 'tavern') await waitForStreet(id);
      return;
    }
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
  async function openLedger() {
    if (await page.locator('#ledger-drawer-host.is-open').count()) return;
    await page.locator('#ledger-handle').waitFor({ state: 'visible' });
    if (await page.locator('#ledger-drawer-host.is-open').count()) return;
    const handle = await page.locator('#ledger-handle').boundingBox();
    assert(handle, 'the ledger handle is available to open the atlas');
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(Math.max(10, handle.x - 140), handle.y + handle.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await page.locator('#ledger-drawer-host.is-open').waitFor();
  }
  async function openAtlas() {
    await openLedger();
    const opener = page.locator('#ledger-atlas-open');
    await opener.waitFor({ state: 'visible' });
    await opener.click();
    const embeddedStreet = await page.evaluate(() => {
      const active = demo.getLibrary().daily.active;
      return active?.kind === 'outing' && active.stage === 'roaming';
    });
    const mapFrame = page.frameLocator(embeddedStreet ? '#inn-frame iframe' : '#daily-atlas-frame');
    await mapFrame.locator('#street-map[open]').waitFor({ state: 'visible' });
    await page.locator('#ledger-drawer-host').waitFor({ state: 'hidden' });
    await page.locator('#ledger-handle').waitFor({ state: 'visible' });
    return mapFrame;
  }
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => Boolean(window.demo));
    await page.locator('[data-daily="outing"]').click();
    await page.locator('#tavern-exit-picker[open]').waitFor();
    await chooseExit('city-center').click();
    await waitForStreet('city-center');
    const mapFrame = await openAtlas();
    const atlas = mapFrame.getByRole('dialog', { name: '泛生界大地图' });
    await atlas.waitFor({ state: 'visible' });
    const pin = (id) => atlas.locator(`[data-travel-to="${id}"]`);
    const bridge = pin('road-bridge');
    const reeds = pin('road-reeds');
    const capital = pin('road-capital');
    await capital.waitFor();
    await page.locator('#hud-plaque').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#ledger-handle').isVisible(), true);
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
    await page.locator('#hud-plaque').waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 390, height: 700 });
    await openAtlas();
    await capital.waitFor();
    await page.locator('#hud-plaque').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('#ledger-handle').isVisible(), true);
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
    // The route fixture tests the victory transition, not whether a basic attack one-shots a level 3 enemy.
    await page.locator('[data-skill="generated-2"]').click();
    if (await page.evaluate(() => demo.getStatus().interactionStep === 'target'))
      await page.locator('[data-unit="patrolHound"]').click();
    assert.equal(await page.evaluate(() => demo.getForecast().outcome), 'victory');
    await page.locator('#commit').click();
    await page.getByRole('button', { name: '继续行程', exact: true }).click();
    await readUntil('#overland-rp [data-overland-continue]:enabled');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.turns), 10);
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.scene), 'road-capital');
    await page.locator('#overland-rp [data-overland-choice]').first().click();
    await readUntil('#overland-rp [data-overland-continue]:enabled');
    const choiceError = await page.locator('#overland-rp .invite-error').textContent();
    assert.equal(choiceError, '');
    await page.locator('#overland-rp .invite-choices').waitFor({ state: 'hidden', timeout: 5000 });
    await page.locator('#overland-rp [data-overland-continue]').click();
    await readUntil('[data-daily="home"]');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.scene), 'road-capital');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.turns), 10);
    await page.waitForFunction(() => !document.querySelector('#toast.visible'));
    await openAtlas();
    await capital.waitFor();
    await page.mouse.move(640, 365);
    await page.mouse.wheel(0, 700);
    await atlas.locator('[data-detail="region"]').waitFor();
    const labelBoxes = await atlas
      .locator('.street-atlas-pin:not([data-travel-to^="world-"]) .street-atlas-pin-label:visible')
      .evaluateAll((labels) => labels.map((label) => label.getBoundingClientRect().toJSON()));
    assert.equal(labelBoxes.length, 14);
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
    assert(
      (await frame.locator('canvas').evaluate(() => window.streetPreview.state().image)).endsWith(
        '/city-backgrounds/silver-crown.png',
      ),
    );
    assert.equal(
      await page.evaluate(() => demo.getLibrary().daily.unlocks.silverCrownTavern),
      undefined,
    );
    for (const scene of ['crown-promenade', 'crown-arcade', 'crown-tavern-door']) {
      await walk(scene);
    }
    await page.screenshot({ path: path.join(output, 'silver-crown-tavern-door.png') });
    await walk('tavern');
    await page.waitForFunction(() => demo.getLibrary().daily.unlocks.silverCrownTavern === true);
    await page.evaluate(() => demo.flushStorage());
    await page.reload();
    await openTavernDoor();
    assert(await chooseExit('crown-tavern-door').isEnabled());
    await chooseExit('city-center').click();
    await waitForStreet('city-center');
    await verifyCityFacilityDistribution(page, 'starbell');
    await page.locator('[data-daily="home"]').click();
    await verifyTavernInteriorChatPlaces(page);
    await openTavernDoor();
    await chooseExit('crown-tavern-door').click();
    await waitForStreet('crown-tavern-door');
    await walk('crown-arcade');
    await page.waitForFunction(() => {
      const outing = demo.getLibrary().daily.active;
      return (
        outing?.kind === 'outing' && outing.stage === 'roaming' && outing.scene === 'crown-arcade'
      );
    });
    await frame.getByRole('button', { name: '交流', exact: true }).waitFor({ state: 'visible' });
    // The Silver Crown helper checks the People panel and locked place in one open/close cycle.
    await verifyCityFacilityDistribution(page, 'silver-crown');
    await page.setViewportSize({ width: 390, height: 700 });
    assert(await frame.locator('#street-return').isVisible());
    assert(await frame.locator('#street-submap-open').isHidden());
    const cityHandle = page.locator('#ledger-city-directory-open');
    await cityHandle.waitFor({ state: 'visible' });
    const cityHandleBox = await cityHandle.boundingBox();
    const ledgerHandleBox = await page.locator('#ledger-handle').boundingBox();
    assert(cityHandleBox && ledgerHandleBox && cityHandleBox.y < ledgerHandleBox.y);
    const mobileDirectory = await openCityDirectory(page);
    assert.equal(await mobileDirectory.getAttribute('data-city'), 'silver-crown');
    await mobileDirectory.locator('#street-city-submap-close').click();
    await mobileDirectory.waitFor({ state: 'hidden' });
    await page.locator('[data-daily="home"]').click();
    await openTavernDoor();
    await chooseExit('city-center').click();
    await waitForStreet('city-center');
    await openAtlas();
    const capitalStops = [
      'eternal-road-orchard',
      'eternal-road-mill',
      'eternal-road-checkpoint',
      'eternal-city',
    ];
    for (const id of capitalStops) await pin(id).waitFor();
    assert.equal(
      await atlas
        .locator(
          '.street-atlas-pin:visible:not([data-travel-to^="world-"]):not([data-kind="dungeon"])',
        )
        .count(),
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
    await readUntil('#overland-rp [data-overland-continue]:enabled');
    assert.equal(
      await page.evaluate(() => demo.getLibrary().daily.active.scene),
      'eternal-road-mill',
    );
    await page.locator('#overland-input').fill('顺路打听首都近况。');
    await page.locator('#overland-send').click();
    await readUntil('#overland-rp [data-overland-continue]:enabled');
    await page.locator('#overland-rp [data-overland-continue]').click();
    await readUntil('#overland-rp [data-overland-continue]:enabled');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.scene), 'eternal-city');
    await page.locator('#overland-rp [data-overland-continue]').click();
    await readUntil('[data-daily="home"]');
    await waitForStreet('eternal-city');
    await verifyCityFacilityDistribution(page, 'eternal');
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
    const eternalDirectory = await openCityDirectory(page);
    assert.deepEqual(
      await eternalDirectory.locator('[data-city-category] > h3').allTextContents(),
      ['普通地点', '功能地点', '副本'],
    );
    assert.equal(
      await eternalDirectory.locator('[data-city-dungeon="starbell-undercroft"]').count(),
      0,
      'the capital directory does not list Starbell dungeons',
    );
    await page.screenshot({ path: path.join(output, 'eternal-city-blueprint.png') });
    await frame.locator('#street-city-submap [data-city-facility="guild"]').click();
    await page.locator('#guild-dialog[open]').waitFor();
    await page.screenshot({ path: path.join(output, 'guild-hall.png') });
    await page.locator('#guild-dialog [data-guild-accept="bounty-moss-clear"]').click();
    const acceptedBanner = page.locator('#skyrim-quest-banner');
    await acceptedBanner.waitFor({ state: 'visible' });
    const bannerPresentation = await acceptedBanner.evaluate((banner) => ({
      title: banner.querySelector('.skyrim-banner-title')?.textContent,
      pointerEvents: getComputedStyle(banner).pointerEvents,
      horizontalOverflow: banner.scrollWidth > innerWidth,
      visible: banner.dataset.show === 'true' && !banner.hidden,
    }));
    assert.equal(bannerPresentation.title, '翠苔浅谷 · 兽害清剿');
    assert.equal(bannerPresentation.pointerEvents, 'none');
    assert.equal(bannerPresentation.horizontalOverflow, false);
    assert.equal(bannerPresentation.visible, true);
    await page.screenshot({ path: path.join(output, 'quest-accepted-banner.png') });
    await page.locator('#guild-dialog .guild-close').click();
    await page.waitForFunction(() => demo.getLibrary().atlasDiscoveries.length === 2);
    const acceptedBounty = await page.evaluate(() =>
      demo
        .getLibrary()
        .tavernQuests.find(
          ({ bountyId, status }) => bountyId === 'bounty-moss-clear' && status === 'active',
        ),
    );
    assert(acceptedBounty, 'The posted guild bounty is persisted to the separate quest log');
    const questHandle = page.locator('#ledger-quests-open');
    await questHandle.waitFor({ state: 'visible' });
    await questHandle.click();
    const journal = page.locator('#tavern-quests[open]');
    await journal.locator('.skyrim-journal-grid').waitFor();
    const bountyTab = journal.locator(
      '.skyrim-quest-tab[data-quest-select="' + acceptedBounty.id + '"]',
    );
    await bountyTab.waitFor();
    assert.equal(await bountyTab.textContent(), acceptedBounty.title);
    assert.equal(await bountyTab.locator('..').getAttribute('data-status'), 'active');
    await bountyTab.click();
    assert.match(await journal.locator('.ow-quest-meta').innerText(), /公会悬赏/);
    const desktopJournal = await journal.evaluate((dialog) => {
      const grid = dialog.querySelector('.skyrim-journal-grid');
      const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      return {
        columns,
        hasObjective: Boolean(dialog.querySelector('.ow-quest-objectives')),
        hasReward: Boolean(dialog.querySelector('.ow-quest-reward')),
        hasUnacceptedRow:
          dialog.querySelector('[data-quest-select="test-social"]')?.closest('.skyrim-quest-item')
            ?.dataset.status === 'offered',
        horizontalOverflow: dialog.scrollWidth > dialog.clientWidth,
      };
    });
    assert.deepEqual(desktopJournal, {
      columns: 2,
      hasObjective: true,
      hasReward: true,
      hasUnacceptedRow: true,
      horizontalOverflow: false,
    });
    await bountyTab.focus();
    await bountyTab.press('End');
    const offeredTab = journal.locator('.skyrim-quest-tab[data-quest-select="test-social"]');
    assert.equal(await offeredTab.getAttribute('aria-current'), 'true');
    await offeredTab.press('Home');
    assert.equal(await bountyTab.getAttribute('aria-current'), 'true');
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileJournal = await journal.evaluate((dialog) => {
      const grid = dialog.querySelector('.skyrim-journal-grid');
      const bounds = dialog.getBoundingClientRect();
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        rows: getComputedStyle(grid).gridTemplateRows.split(' ').length,
        horizontalOverflow: dialog.scrollWidth > dialog.clientWidth,
        withinViewport: bounds.left >= 0 && bounds.right <= innerWidth,
        selectedQuestVisible: dialog.querySelector('.skyrim-folio')?.getClientRects().length > 0,
      };
    });
    assert.deepEqual(mobileJournal, {
      columns: 1,
      rows: 2,
      horizontalOverflow: false,
      withinViewport: true,
      selectedQuestVisible: true,
    });
    await page.screenshot({ path: path.join(output, 'quest-journal-mobile.png') });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reducedMotion = await journal.evaluate((dialog) => ({
      folioAnimation: getComputedStyle(dialog.querySelector('.skyrim-folio')).animationName,
      bannerAnimation: getComputedStyle(document.querySelector('#skyrim-quest-banner'))
        .animationName,
      bannerTransition: getComputedStyle(document.querySelector('#skyrim-quest-banner'))
        .transitionDuration,
    }));
    assert.deepEqual(reducedMotion, {
      folioAnimation: 'none',
      bannerAnimation: 'none',
      bannerTransition: '0s',
    });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.setViewportSize({ width: 744, height: 900 });
    const nearBreakpoint = await journal.evaluate((dialog) => {
      const grid = dialog.querySelector('.skyrim-journal-grid');
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        horizontalOverflow: dialog.scrollWidth > dialog.clientWidth,
      };
    });
    assert.deepEqual(nearBreakpoint, { columns: 1, horizontalOverflow: false });
    await page.setViewportSize({ width: 768, height: 900 });
    const atBreakpoint = await journal.evaluate((dialog) => {
      const grid = dialog.querySelector('.skyrim-journal-grid');
      const row = dialog.querySelector('.skyrim-quest-tab');
      return {
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        horizontalOverflow: dialog.scrollWidth > dialog.clientWidth,
        rowHeight: Math.round(row.getBoundingClientRect().height),
      };
    });
    assert.deepEqual(atBreakpoint, { columns: 2, horizontalOverflow: false, rowHeight: 42 });
    await page.setViewportSize({ width: 1280, height: 768 });
    await page.screenshot({ path: path.join(output, 'quest-journal-desktop.png') });
    const track = journal.locator(
      '[data-quest-track="' + acceptedBounty.id + '"][data-quest-focus="track"]',
    );
    if ((await track.getAttribute('aria-pressed')) === 'true') {
      await track.click();
      await track.filter({ visible: true }).waitFor();
      assert.equal(await track.getAttribute('aria-pressed'), 'false');
    }
    await track.click();
    await page.waitForFunction(
      (id) =>
        document
          .querySelector('[data-quest-track="' + CSS.escape(id) + '"][data-quest-focus="track"]')
          ?.getAttribute('aria-pressed') === 'true',
      acceptedBounty.id,
    );
    assert((await journal.locator('.skyrim-folio-desc').innerText()).length > 0);
    await journal.getByRole('button', { name: '关闭任务日志' }).click();
    await journal.waitFor({ state: 'hidden' });
    assert.deepEqual(
      discoveries[0].route.map(({ id }) => id),
      ['outskirts', 'road-bridge', 'road-reeds', 'road-capital'],
    );
    assert(discoveries[1].route.some(({ id }) => id === 'eternal-city'));
    assert.notEqual(discoveries[0].point.id, discoveries[1].point.id);
    await page.locator('[data-daily="home"]').click();
    await page.evaluate(() => demo.flushStorage());
    await page.reload();
    await page.waitForFunction(() => demo.getLibrary().atlasDiscoveries.length === 2);
    await openTavernDoor();
    await chooseExit('city-center').click();
    await waitForStreet('city-center');
    await openAtlas();
    await pin('world-road-discovery-1').click();
    await page.locator('#player-intent[open]').waitFor();
    await page.screenshot({ path: path.join(output, 'player-intent.png') });
    await page.locator('#player-intent button[value="continue"]').click();
    await readUntil('#overland-rp [data-overland-continue]:enabled');
    await page.locator('#overland-rp [data-overland-continue]').click();
    await readUntil('#destination-dialog[open]');
    assert.match(await page.locator('#destination-title').textContent(), /路旁遗址 1/);
    assert(await page.locator('#destination-start').isEnabled());
    await page.locator('#destination-close').click();

    await questHandle.click();
    await page.locator('#tavern-quests[open] .skyrim-journal-grid').waitFor();
    await page.locator('#ledger-drawer-host').waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(output, 'skyrim-quests.png') });
    await page.locator('[data-quest-select="test-social"]').click();
    await page.locator('[data-quest-folio-pick="test-social"]').click();
    const questStep = page.locator('[data-daily="quest-step"]');
    await questHandle.waitFor({ state: 'visible' });
    const mapLookupSnapshot = () => {
      const { daily, tavernQuests, unlockedDungeons } = demo.getLibrary();
      return { dailyActive: daily.active, tavernQuests, unlockedDungeons };
    };
    const beforeMapLookup = await page.evaluate(mapLookupSnapshot);
    await questHandle.click();
    await bountyTab.click();
    await journal.locator('[data-quest-open-atlas]').click();
    const atlasOverlay = page.locator('#daily-atlas-frame');
    await atlasOverlay.waitFor({ state: 'visible' });
    const streetMap = page.frameLocator('#daily-atlas-frame').locator('#street-map[open]');
    const highlight = streetMap.locator('[data-quest-target]');
    await highlight.and(streetMap.locator('[data-travel-to="moss-hollow"]')).waitFor();
    assert.equal(await highlight.count(), 1, 'only the known bounty target is highlighted');
    await streetMap.getByRole('button', { name: '关闭地图' }).click();
    await atlasOverlay.waitFor({ state: 'hidden' });
    assert.deepEqual(await page.evaluate(mapLookupSnapshot), beforeMapLookup);
    for (let index = 1; index <= 5; index++) {
      await openLedger();
      await questStep.filter({ hasText: '第 ' + index + ' 幕' }).waitFor();
      await questStep.click();
      if (index < 5) {
        for (let step = 0; step < 130; step++) {
          const text = await questStep.textContent().catch(() => '');
          if (text?.trim() === '第 ' + (index + 1) + ' 幕') break;
          await page.evaluate(() => {
            const stage = document.querySelector('#gal-stage');
            if (stage && !stage.hidden && stage.dataset.leaving !== 'true')
              stage.querySelector('.gal-page')?.click();
          });
          await page.waitForTimeout(100);
        }
        await openLedger();
        await questStep.filter({ hasText: '第 ' + (index + 1) + ' 幕' }).waitFor();
      } else {
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
    assert.deepEqual(requests, [2, 2, 1]);
    assert.deepEqual(errors, []);
    return { acts: 2, capitalActs: 2, capitalAreas: 10, routeBattle: true, twoTavernExits: true };
  } finally {
    await page.close();
  }
}
