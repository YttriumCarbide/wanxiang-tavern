import assert from 'node:assert/strict';
import path from 'node:path';
import { openCityFacility } from './city-facility.mjs';
import { travelTownScene } from './town-navigation.mjs';
import { legacySession, openShelfPanel } from './legacy-session.mjs';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { normalizeCharacter } from '../../src/ai/contracts.js';
import { characterDocument, tavernPresetFixture } from '../fixtures/ai.js';

async function assertEquipmentVoucherIconCentered(page) {
  const icon = page.locator('#ledger-drawer #inn-resources img[src$="equipment-voucher.svg"]');
  await icon.waitFor({ state: 'visible' });
  await icon.evaluate((image) => image.decode());

  const geometry = await page.evaluate(async () => {
    const image = document.querySelector(
      '#ledger-drawer #inn-resources img[src$="equipment-voucher.svg"]',
    );
    const response = await fetch(image.currentSrc);
    if (!response.ok) throw Error(`Voucher SVG request failed: ${response.status}`);

    const source = await response.text();
    const documentSvg = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (documentSvg.querySelector('parsererror')) throw Error('Voucher SVG is not valid XML');

    const svg = document.importNode(documentSvg.documentElement, true);
    const ticket = svg.querySelector('path');
    const crest = svg.querySelector('polygon');
    if (!ticket || !crest) throw Error('Voucher SVG ticket outline or crest is missing');

    svg.style.cssText = 'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
    document.body.append(svg);
    try {
      const ticketBox = ticket.getBBox();
      const crestBox = crest.getBBox();
      const iconBox = image.getBoundingClientRect();
      return {
        artworkCenterOffsetX: crestBox.x + crestBox.width / 2 - (ticketBox.x + ticketBox.width / 2),
        artworkCenterOffsetY:
          crestBox.y + crestBox.height / 2 - (ticketBox.y + ticketBox.height / 2),
        iconWidth: iconBox.width,
        iconHeight: iconBox.height,
        sourceWidth: image.naturalWidth,
        sourceHeight: image.naturalHeight,
      };
    } finally {
      svg.remove();
    }
  });

  assert.equal(geometry.artworkCenterOffsetX, 0, 'Voucher crest is horizontally centered');
  assert.equal(geometry.artworkCenterOffsetY, 0, 'Voucher crest is vertically centered');
  assert(geometry.iconWidth > 0, 'Voucher icon has a rendered width');
  assert.equal(geometry.iconWidth, geometry.iconHeight, 'Voucher icon keeps a square viewport');
  assert(geometry.sourceWidth > 0 && geometry.sourceHeight > 0, 'Voucher SVG is loaded');
  assert.equal(geometry.sourceWidth, geometry.sourceHeight, 'Voucher SVG has a square viewBox');
}

export async function equipmentChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  const calls = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await legacySession(page);
  async function readGal(wait = false) {
    const stage = page.locator('#gal-stage');
    if (wait) await stage.waitFor({ state: 'visible' });
    for (let index = 0; index < 160 && (await stage.isVisible()); index++) {
      if ((await stage.getAttribute('data-leaving')) === 'true')
        await page.waitForFunction(
          () => document.querySelector('#gal-stage').dataset.leaving !== 'true',
        );
      else await page.locator('.gal-page').click();
    }
  }
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    const library = newCampaign(defaultProtagonist());
    library.campaign.completed = true;
    library.inventory.summonContracts = 5;
    firstCompanion(library);
    library.campaign.tutorial = 'complete';
    library.unlockedDungeons = ['ruins', 'forest'];
    // Mark the mainline route complete using the persisted field checked by gameplay.
    library.exploration.ruins.completed = 6;
    library.inventory.ether = 40;
    library.inventory.items['health-potion'] = 2;
    library.archives.items.push({
      id: 'item-test',
      name: '回廊晶片',
      description: '微光晶片',
      value: 10,
      map: 'ruins',
      converted: true,
      source: {
        scriptId: 'test-script',
        runId: 'test-run',
        title: '回廊往事',
        encounter: 0,
        map: 'ruins',
      },
    });
    library.archives.npcs.push({
      id: 'npc-test',
      name: '时砂',
      content: '穿着旧斗篷的时术师。',
      sources: [
        {
          scriptId: 'test-script',
          runId: 'test-run',
          title: '回廊往事',
          encounter: 0,
          map: 'ruins',
        },
      ],
    });
    library.scripts.push({
      id: 'test-script',
      schemaVersion: 4,
      title: '回廊往事',
      tags: [],
      story: Array(5).fill('在回廊中遇见时砂，拾起微光晶片。'),
      npcs: [],
      items: [],
      nextHook: { setting: '' },
      party: [],
      boss: 'bossGate',
      chapter: 1,
    });
    await page.evaluate((library) => {
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
      localStorage.setItem(
        'wanxiang.generation-options.v1',
        JSON.stringify({ developerMode: true, skipAiGeneration: false }),
      );
    }, library);
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await openShelfPanel(page, 'archives');
    assert.equal(await page.locator('#archive-text input').first().getAttribute('readonly'), '');
    assert.equal(
      await page.locator('#archive-text button').filter({ hasText: '调整设定' }).isVisible(),
      false,
    );
    await page.locator('#archive-close').click();
    const header = await page.locator('.app-header nav > button').allTextContents();
    assert(!header.includes('总结') && !header.includes('归档'));
    assert.equal(
      await page.frameLocator('#inn-frame iframe').locator('[data-shelf-action]').count(),
      1,
    );
    await page.route('**/api/ai/generate/creation', async (route) => {
      const body = route.request().postDataJSON();
      assert(body.items[0].script.includes('在回廊中遇见时砂'));
      calls.push('creation');
      await route.fulfill({
        json: {
          items: [
            {
              id: 'item-test',
              name: '回廊晶片',
              description: '生命增加2',
              stats: { hp: 2 },
              rules: [],
            },
          ],
          request: { tokens: { inputEstimate: 500 } },
        },
      });
    });
    async function innMessage(type) {
      const frame = page.frameLocator('#inn-frame iframe');
      await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
      await frame
        .locator('canvas')
        .evaluate((_, type) => parent.postMessage({ type }, location.origin), type);
    }
    await innMessage('tavern-condenser');
    await page.locator('#forge-refine').click();
    await page.locator('#forge-status').filter({ hasText: '已' }).waitFor();
    await page.locator('#forge-results').waitFor({ state: 'visible' });
    assert((await page.locator('#forge-results').innerText()).includes('hp上限 +2'));
    assert.equal(await page.locator('#forge-list [data-forge-select="item-test"]').count(), 0);
    await page.locator('[data-batch-favorite="item-test"]').click();
    assert(
      (await page.evaluate(() => demo.getLibrary())).equipment.favorites.includes('item-test'),
    );
    await page.locator('[data-batch-buy="item-test"]').click();
    assert.equal((await page.evaluate(() => demo.getLibrary())).inventory.ether, 30);
    await page.screenshot({ path: path.join(output, 'new-batch-results.png') });
    await page.locator('#forge-results [data-batch-close]').first().click();
    await page.locator('[data-forge-page="exchange"]').click();
    await page.locator('[data-buy-equipment]').waitFor();
    assert.equal(
      await page.locator('.forge-item > p').count(),
      0,
      'Only the compiled equipment effect is shown',
    );
    assert.equal(await page.locator('.forge-effects').count(), 1);
    assert.equal((await page.evaluate(() => demo.getLibrary())).inventory.ether, 30);
    await page.screenshot({ path: path.join(output, 'ether-construction.png') });
    await page.locator('[data-forge-close]').click();
    const handle = await page.locator('#ledger-handle').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(Math.max(10, handle.x - 140), handle.y + handle.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await page.locator('#ledger-drawer-host.is-open').waitFor();
    await page.locator('#party-toggle').click();
    await page.locator('[data-prepare-slot="0"]').click();
    const select = page.locator('[data-equipment-slot="2"]');
    const id = await select.locator('option').nth(1).getAttribute('value');
    await select.selectOption(id);
    assert.equal((await page.evaluate(() => demo.getLibrary())).characters[0].equipment[2], id);
    await page.screenshot({ path: path.join(output, 'preparation-equipment.png') });
    await page.locator('#prepare-done').click();
    await page.locator('#ledger-drawer-host.is-open #ledger-close').click();
    await page.locator('#ledger-drawer-host').waitFor({ state: 'hidden' });
    await page.route('**/api/ai/config', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const response = await route.fetch();
      const profiles = await response.json();
      for (const kind of ['character', 'script'])
        profiles[kind] = {
          ...profiles[kind],
          baseUrl: 'http://127.0.0.1:9999/v1',
          model: 'fixture',
          promptPresetId: 'equipment-fixture',
        };
      await route.fulfill({ json: profiles });
    });
    await page.route('**/api/ai/prompts/equipment-fixture', (route) =>
      route.fulfill({ json: { preset: { ...tavernPresetFixture(), id: 'equipment-fixture' } } }),
    );
    const entry = normalizeCharacter(characterDocument(), 'character-known-npc');
    await page.route('**/api/ai/generate/character', async (route) => {
      const input = route.request().postDataJSON();
      assert.equal(input.purpose, 'npc');
      assert.equal(input.npc.id, 'npc-test');
      calls.push('npc');
      await route.fulfill({
        json: {
          entry,
          arrivalDialogue: [
            { speaker: 'character', text: '还记得回廊里的那盏灯吗？' },
            { speaker: 'player', text: '欢迎来到酒馆。' },
          ],
        },
      });
    });
    await innMessage('tavern-summon');
    if (!(await page.locator('#summon-choice').isVisible())) {
      const ledger = page.locator('#ledger-drawer-host.is-open');
      if (await ledger.isVisible()) {
        await ledger.locator('.ledger-backdrop').click({
          position: { x: 8, y: Math.round((page.viewportSize()?.height || 836) / 2) },
        });
        await page.locator('#ledger-drawer-host').waitFor({ state: 'hidden' });
      }
      const frame = page.frameLocator('#inn-frame iframe');
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('summon'));
      await frame.locator('#summon-open').click();
    }
    await page.locator('[data-summon-mode="npc"]').click();
    await page.locator('#summon-confirm').click();
    await page.locator('#summoned-dialog').waitFor({ state: 'visible' });
    const recruited = await page.evaluate(() => demo.getLibrary());
    assert.equal(recruited.archives.npcs.length, 0);
    assert.equal(recruited.inventory.summonContracts, 3);
    assert(recruited.refinedNpcs.includes('时砂'));
    await page.locator('#summoned-join').click();
    await readGal(true);
    assert(
      !(await page.evaluate(() => demo.getLibrary())).tavernChat.some((message) =>
        message.content.includes('还记得回廊'),
      ),
    );
    let release;
    const pending = new Promise((resolve) => {
      release = resolve;
    });
    await page.route('**/api/ai/generate/script', async (route) => {
      calls.push('script');
      await pending;
      await route
        .fulfill({ status: 400, json: { error: '整备校验完成，取消测试剧本' } })
        .catch(() => {});
    });
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('gate'));
    await frame.locator('#enter').click();
    await page.locator('#destination-regions button[data-region="forest"]').click();
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-start').click();
    await page.locator('#prepare-done').click();
    await page
      .locator('#prepare-title')
      .filter({ hasText: '正在生成剧本' })
      .waitFor({ state: 'attached' });
    await readGal(true);
    await page.locator('#prepare-title').waitFor({ state: 'visible' });
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).campaign.tasks.equipmentIntro,
      true,
    );
    assert.equal(await page.locator('#generation-progress').isVisible(), false);
    const before = (await page.evaluate(() => demo.getLibrary())).party.filter(Boolean).sort();
    const source = page.locator(`[data-prepare-hero="${entry.id}"]`);
    assert.equal(
      await source.count(),
      1,
      JSON.stringify(
        await page.evaluate(() => ({
          party: demo.getLibrary().party,
          characters: demo.getLibrary().characters.map((c) => ({ id: c.id, name: c.setting.name })),
          pool: document.querySelector('#prepare-pool').textContent,
        })),
      ),
    );
    assert(
      await page
        .locator('#party-panel')
        .evaluate((panel) => panel.classList.contains('formation-locked')),
    );
    assert.equal(await page.locator('#prepare-pool').isVisible(), false);
    const after = (await page.evaluate(() => demo.getLibrary())).party;
    assert.deepEqual(after.filter(Boolean).sort(), before);
    await page.screenshot({ path: path.join(output, 'script-generating-preparation.png') });
    release();
    await page.locator('#generation-diagnostics').waitFor({ state: 'visible' });
    await page.locator('#diagnostic-close').click();
    await page.evaluate(() => {
      const library = demo.getLibrary();
      library.progression = {
        settlements: ['one', 'two'],
        pandoraJoined: false,
        swapLesson: 'none',
      };
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
      localStorage.setItem(
        'wanxiang.generation-options.v1',
        JSON.stringify({ developerMode: true, protagonistApi: false, scriptApi: false }),
      );
    });
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#gal-stage').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'pandora-second-return.png') });
    await readGal();
    await page.waitForFunction(() => demo.getLibrary().progression.pandoraJoined);
    await readGal();
    await innMessage('enter-dungeon');
    await page.locator('#destination-regions button[data-region="forest"]').click();
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-start').click();
    await page.locator('#prepare-done').click();
    await page.locator('#prepare-done').click();
    await page
      .waitForFunction(() => demo.getStatus().mode === 'battle', null, { timeout: 60000 })
      .catch(async (error) => {
        await page.screenshot({ path: path.join(output, 'equipment-departure-failure.png') });
        const state = await page.evaluate(() => ({
          status: demo.getStatus(),
          options: localStorage.getItem('wanxiang.generation-options.v1'),
          scene: document.querySelector('#scene-loading').textContent,
          toast: document.querySelector('#toast').textContent,
          dialogs: [...document.querySelectorAll('dialog[open]')].map((node) => node.id),
        }));
        throw Error(error.message + '\n' + JSON.stringify(state));
      });
    await readGal(true);
    await page.waitForFunction(() => !demo.getStatus().animating);
    assert.equal(await page.locator('#back-inn').isVisible(), false);
    await page.evaluate(() => demo.returnInn());
    assert.equal(await page.evaluate(() => demo.getStatus().mode), 'battle');
    await page.locator('#commit').click();
    assert.equal(await page.evaluate(() => demo.getState().phase), 'opening');
    const state = await page.evaluate(() => demo.getState());
    const rear = state.formation.slice(3).find(Boolean);
    const front = state.formation.slice(0, 3).find(Boolean);
    await page.locator(`[data-rear="${rear}"]`).click();
    await page.locator(`[data-unit="${front}"]`).click();
    await page.locator('#commit').click();
    await page.waitForFunction(() => demo.getLibrary().progression.swapLesson === 'retreat');
    await readGal(true);
    await page.waitForFunction(() => !demo.getStatus().playing);
    const retreatState = await page.evaluate(() => demo.getState());
    const actor = retreatState.formation.slice(0, 3).find(Boolean);
    const empty = retreatState.formation.findIndex((id, index) => index >= 3 && !id);
    await page.locator(`[data-unit="${actor}"]`).click();
    await page.locator(`[data-empty-slot="${empty}"]`).click();
    await page.locator('#commit').click();
    await page.waitForFunction(() => demo.getLibrary().progression.swapLesson === 'done');
    assert.equal(await page.locator('#formation-lesson').isVisible(), false);
    await page.waitForFunction(() => !demo.getStatus().playing);
    await page.locator('#commit').click();
    await page.waitForFunction(() => demo.getLibrary().progression.entryLesson === 'ready');
    await readGal(true);
    await page.waitForFunction(() => !demo.getStatus().playing);
    const charged = await page.evaluate(() => {
      const state = demo.getState();
      return state.formation.slice(3).find((id) => id && state.units[id].entryReady);
    });
    await page.locator(`[data-rear="${charged}"]`).click();
    const target = await page.evaluate(() => {
      const state = demo.getState();
      const id = state.formation[0];
      return id ? `[data-unit="${id}"]` : '[data-empty-slot="0"]';
    });
    await page.locator(target).click();
    await page.locator('#commit').click();
    await page.waitForFunction(() => demo.getLibrary().progression.entryLesson === 'done');
    assert.deepEqual(errors, []);
    assert.deepEqual(calls, ['creation', 'npc', 'script']);
    return {
      creation: true,
      exactPrice: true,
      equipmentSlots: true,
      knownNpc: true,
      ephemeralDialogue: true,
      frozenDeparture: true,
      archiveGuard: true,
      pandoraEvent: true,
      realSwapLesson: true,
      retreatGuard: true,
      actualEntrySkillLesson: true,
      ...(await forgeAffixWorkspaceChecks({ browser, baseURL, output })),
    };
  } finally {
    await page.close();
  }
}

async function forgeAffixWorkspaceChecks({ browser, baseURL, output }) {
  const { normalizeEquipment, buyEquipment, equip, grantGem } =
    await import('../../src/equipment.js');
  const { GEM_POOL } = await import('../../src/content/gems.js');
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await legacySession(page);
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    const library = newCampaign(defaultProtagonist());
    library.campaign.completed = true;
    library.inventory.summonContracts = 5;
    firstCompanion(library);
    library.campaign.tutorial = 'complete';
    library.inventory.ether = 20000;
    library.inventory.gold = 1000;
    library.characters[0].growth.level = 25;

    const templates = [
      { id: 'ui-eq-1', category: 'weapon' },
      { id: 'ui-eq-2', category: 'armor' },
      { id: 'ui-eq-3', category: 'pendant' },
    ].map(({ id, category }) =>
      normalizeEquipment(
        {
          name: id,
          description: 'UI fixture',
          category,
          stats: { hp: 2 },
          rules: [],
          level: 1,
          quality: 'common',
        },
        { id, value: 10, name: id, category, level: 1, quality: 'common' },
      ),
    );
    library.equipment.catalog = templates;
    for (let index = 0; index < 2; index++)
      buyEquipment(library, templates[0].id, `ui-owned-${index + 1}`);
    buyEquipment(library, templates[1].id, 'ui-owned-armor');
    buyEquipment(library, templates[2].id, 'ui-owned-pendant');
    equip(library, library.characters[0].id, 1, 'ui-owned-armor');
    equip(library, library.characters[0].id, 2, 'ui-owned-pendant');
    library.equipment.affixesByTemplate = {
      [templates[1].id]: { id: 'affix-offense', quality: 'rare' },
      [templates[2].id]: { id: 'affix-offense', quality: 'rare' },
    };
    grantGem(library, GEM_POOL[0].id, 'ui-gem');

    await page.evaluate((library) => {
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
      localStorage.setItem(
        'wanxiang.generation-options.v1',
        JSON.stringify({ developerMode: true, skipAiGeneration: false }),
      );
    }, library);
    await page.reload();
    await page.waitForFunction(() => !!window.demo);

    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await frame
      .locator('canvas')
      .evaluate(() => parent.postMessage({ type: 'tavern-condenser' }, location.origin));
    await page.locator('[data-forge-page="exchange"]').click();
    await page.locator('[data-forge-select="ui-eq-1"]').click();

    const panel = page.locator('#ether-forge');
    const box = await panel.boundingBox();
    assert(box.width > 1000, `forge panel width ${box.width}`);
    assert(box.height > 650, `forge panel height ${box.height}`);
    const overflow = await panel.evaluate((node) => node.scrollWidth > node.clientWidth + 1);
    assert.equal(overflow, false, 'forge panel has no horizontal overflow');
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).equipment.affixesByTemplate['ui-eq-1'],
      undefined,
    );

    await page.locator('[data-buy-equipment]').first().click();
    await page.waitForFunction(
      (kind) => document.querySelector('.forge-operation-feedback')?.dataset.kind === kind,
      'forge',
    );
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).equipment.owned.filter(
        (item) => item.templateId === 'ui-eq-1',
      ).length,
      3,
    );

    await page.locator('[data-dismantle-choice]').selectOption('ui-owned-2');
    await page.locator('[data-dismantle-instance]').click();
    const confirm = page.locator('.equipment-feedback-dialog[open]');
    await confirm.locator('.equipment-feedback-confirm').click();
    await page.waitForFunction(
      () => !demo.getLibrary().equipment.owned.some((entry) => entry.id === 'ui-owned-2'),
    );
    await page.locator('[data-forge-close]').click();

    await openCityFacility(page, 'blacksmith');
    const smith = page.locator('#city-blacksmith[open]');
    await smith.locator('[data-smith-pick="ui-owned-armor"]').click();
    assert.equal(await smith.locator('[data-smith-service="sell"]').isDisabled(), true);
    await smith.locator('[data-smith-pick="ui-owned-1"]').click();
    const wallet = await page.evaluate(() => demo.getLibrary().inventory);
    const item = () =>
      page.evaluate(() => demo.getLibrary().equipment.owned.find(({ id }) => id === 'ui-owned-1'));
    const service = async (name) => {
      await smith.locator(`[data-smith-service="${name}"]`).click();
      assert((await confirm.locator('.equipment-feedback-cost').textContent()).includes('金币'));
      await confirm.locator('.equipment-feedback-confirm').click();
      await smith
        .locator(`.forge-operation-feedback[data-kind="${name}"]`)
        .waitFor({ state: 'visible' });
    };
    await service('temper');
    assert.equal((await item()).level, 2);
    await service('reforge');
    await service('ascend');
    assert.equal((await item()).quality, 'uncommon');
    assert.equal(await page.evaluate(() => demo.getLibrary().inventory.ether), wallet.ether);
    assert((await page.evaluate(() => demo.getLibrary().inventory.gold)) < wallet.gold);
    const goldBeforeSale = await page.evaluate(() => demo.getLibrary().inventory.gold);
    await smith.locator('[data-smith-service="sell"]').click();
    await confirm.locator('.equipment-feedback-confirm').click();
    await page.waitForFunction(() =>
      document.querySelector('#city-blacksmith [role="status"]')?.textContent.includes('已出售'),
    );
    assert.equal(await item(), undefined);
    assert.equal(await page.evaluate(() => demo.getLibrary().inventory.gold), goldBeforeSale + 6);
    await page.screenshot({ path: path.join(output, 'blacksmith-desktop.png') });
    await smith.getByRole('button', { name: '离开铁匠铺' }).click();
    await smith.waitFor({ state: 'hidden' });
    await travelTownScene(page, 'tavern');
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('supplies'));
    await frame.locator('#condenser-open').click();
    await page.locator('[data-forge-page="exchange"]').click();
    await page.locator('[data-forge-select="ui-eq-1"]').click();

    await page.locator('[data-add-affix="ui-eq-1"]').click();
    await page.waitForFunction(
      (kind) => document.querySelector('.forge-operation-feedback')?.dataset.kind === kind,
      'affix',
    );
    assert((await page.evaluate(() => demo.getLibrary())).equipment.affixesByTemplate['ui-eq-1']);
    const ownAffixes = await page.evaluate(() =>
      demo
        .getLibrary()
        .equipment.owned.filter((item) => item.templateId === 'ui-eq-1')
        .map((item) => Object.prototype.hasOwnProperty.call(item, 'affixes')),
    );
    assert.deepEqual(ownAffixes, [false]);

    await page.locator('[data-refresh-affix="ui-eq-1"]').click();
    const before = await page.evaluate(() => {
      const library = demo.getLibrary();
      return {
        ether: library.inventory.ether,
        affix: library.equipment.affixesByTemplate['ui-eq-1'],
      };
    });
    await confirm.locator('.equipment-feedback-cancel').click();
    const afterCancel = await page.evaluate(() => {
      const library = demo.getLibrary();
      return {
        ether: library.inventory.ether,
        affix: library.equipment.affixesByTemplate['ui-eq-1'],
      };
    });
    assert.deepEqual(afterCancel, before);

    await page.locator('[data-refresh-affix="ui-eq-1"]').click();
    await confirm.locator('.equipment-feedback-confirm').click();
    await page.waitForFunction(
      (kind) => document.querySelector('.forge-operation-feedback')?.dataset.kind === kind,
      'reroll',
    );
    const afterReroll = await page.evaluate(() => demo.getLibrary().inventory.ether);
    assert(afterReroll < before.ether);

    await page.locator(`[data-forge-select="${GEM_POOL[0].id}"]`).click();
    assert.equal(await page.locator('[data-buy-equipment]').count(), 0);
    assert(await page.locator('[data-add-affix]').first().isVisible());
    await page.locator('[data-add-affix]').first().click();
    await page.waitForFunction(
      (kind) => document.querySelector('.forge-operation-feedback')?.dataset.kind === kind,
      'affix',
    );
    assert(
      (await page.evaluate(() => demo.getLibrary())).equipment.affixesByTemplate[GEM_POOL[0].id],
    );

    await page.screenshot({ path: path.join(output, 'forge-affixes-desktop.png') });
    await page.locator('[data-forge-close]').click();

    const handle = await page.locator('#ledger-handle').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(Math.max(10, handle.x - 140), handle.y + handle.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await page.locator('#ledger-drawer-host.is-open').waitFor();
    await assertEquipmentVoucherIconCentered(page);
    await page.locator('#party-toggle').click();
    await page.locator('[data-prepare-slot="0"]').click();
    const progress = page.locator('.prepare-affix-progress');
    await progress.waitFor({ state: 'visible' });
    await progress.locator('summary').first().click();
    const progressText = await progress.textContent();
    assert(progressText.includes('6 点'), progressText);
    assert(progressText.includes('已解锁'), progressText);
    await page.locator('#prepare-done').click();

    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await frame
      .locator('canvas')
      .evaluate(() => parent.postMessage({ type: 'tavern-condenser' }, location.origin));
    await page.locator('[data-forge-page="exchange"]').click();
    await page.locator('[data-forge-select="ui-eq-1"]').click();
    await page.setViewportSize({ width: 844, height: 390 });
    const catalogue = page.locator('#forge-catalog');
    await catalogue.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const box = document.querySelector('#forge-catalog').getBoundingClientRect();
      return box.right <= window.innerWidth + 1;
    });
    const catalogueBox = await catalogue.boundingBox();
    assert(catalogueBox.x >= 0 && catalogueBox.x + catalogueBox.width <= 844);
    assert(catalogueBox.y >= 0 && catalogueBox.y + catalogueBox.height <= 390);
    assert.equal(await page.locator('#forge-category-tabs [data-forge-category]').count(), 5);
    await page.locator('[data-forge-category="weapon"]').click();
    assert.equal(
      await page.locator('[data-forge-category="weapon"]').getAttribute('aria-pressed'),
      'true',
    );
    await page.locator('[data-forge-category="all"]').click();
    assert.equal(await page.locator('[data-buy-equipment]').first().isVisible(), true);
    await page.screenshot({ path: path.join(output, 'forge-affixes-844.png') });
    const fits = await page.evaluate(() => {
      const panel = document.querySelector('#ether-forge');
      return {
        noOverflow: document.documentElement.scrollWidth <= window.innerWidth,
        panelFits: panel.scrollWidth <= panel.clientWidth + 1,
      };
    });
    assert.equal(fits.noOverflow, true);
    assert.equal(fits.panelFits, true);

    assert.deepEqual(errors, []);
    return {
      sharedAffixes: true,
      confirmCancel: true,
      blacksmithGoldServices: true,
      gemAffixes: true,
      passiveProgress: true,
      voucherIconCentered: true,
      responsiveForge: true,
    };
  } finally {
    await page.close();
  }
}
