import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession, openShelfPanel } from './legacy-session.mjs';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { completeExploration } from '../../src/exploration.js';
import { normalizeCharacter } from '../../src/ai/contracts.js';
import { characterDocument, tavernPresetFixture } from '../fixtures/ai.js';

export async function equipmentChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  const calls = [];
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
    // This suite exercises successful refinement, after the main world's sixth site.
    for (let site = 0; site < 6; site++)
      completeExploration(library.exploration, library.exploration.ruins.frontier[0]);
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
      name: '灯河',
      content: '穿着旧斗篷的巡灯术士。',
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
      story: Array(5).fill('在回廊中遇见灯河，拾起微光晶片。'),
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
      3,
    );
    await page.route('**/api/ai/generate/creation', async (route) => {
      const body = route.request().postDataJSON();
      assert(body.items[0].script.includes('在回廊中遇见灯河'));
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
    await page.locator('[data-forge-page="exchange"]').click();
    await page.locator('[data-buy-equipment]').waitFor();
    assert.equal(
      await page.locator('.forge-item > p').count(),
      0,
      'Only the compiled equipment effect is shown',
    );
    assert.equal(await page.locator('.forge-effects').count(), 1);
    await page.locator('[data-buy-equipment]').click();
    assert.equal((await page.evaluate(() => demo.getLibrary())).inventory.ether, 30);
    await page.screenshot({ path: path.join(output, 'ether-construction.png') });
    await page.locator('[data-forge-close]').click();
    await page.locator('#party-toggle').click();
    await page.locator('[data-prepare-slot="0"]').click();
    const select = page.locator('[data-equipment-slot="0"]');
    const id = await select.locator('option').nth(1).getAttribute('value');
    await select.selectOption(id);
    assert.equal((await page.evaluate(() => demo.getLibrary())).characters[0].equipment[0], id);
    await page.locator('#prepare-character-done').click();
    await page.locator('#prepare-bag summary').click();
    assert((await page.locator('#prepare-bag').innerText()).includes('生命药水'));
    await page.screenshot({ path: path.join(output, 'preparation-equipment.png') });
    await page.locator('#prepare-done').click();
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
    assert(recruited.refinedNpcs.includes('灯河'));
    await page.locator('#summoned-join').click();
    await page.locator('#companion-dialogue').waitFor({ state: 'visible' });
    for (let i = 0; i < 4; i++) await page.locator('#companion-dialogue button').click();
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
    await page.locator('#prepare-title').filter({ hasText: '正在生成剧本' }).waitFor();
    await page.locator('#guide-dialogue').waitFor({ state: 'visible' });
    while (await page.locator('#guide-dialogue').isVisible())
      await page.locator('#dialogue-next').click();
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
    await page.locator('#ai-dialog').waitFor({ state: 'visible' });
    await page.locator('#ai-close').click();
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
    await page.locator('#companion-dialogue.opening-prose').waitFor({ state: 'visible' });
    await page.screenshot({ path: path.join(output, 'pandora-second-return.png') });
    while (await page.locator('#companion-dialogue').isVisible())
      await page.locator('#companion-dialogue button').click();
    await page.waitForFunction(() => demo.getLibrary().progression.pandoraJoined);
    while (await page.locator('#emblem-dialogue').isVisible())
      await page.locator('#emblem-dialogue button').click();
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
    await page.locator('#companion-dialogue').waitFor({ state: 'visible' });
    for (let i = 0; i < 6; i++) await page.locator('#companion-dialogue button').click();
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
    while (await page.locator('#companion-dialogue').isVisible())
      await page.locator('#companion-dialogue button').click();
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
    while (await page.locator('#companion-dialogue').isVisible())
      await page.locator('#companion-dialogue button').click();
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
    };
  } finally {
    await page.close();
  }
}
