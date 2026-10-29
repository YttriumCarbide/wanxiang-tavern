import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { newCampaign } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { adventureTestScript } from '../../src/content/generation-mode.js';
import { normalizeScript } from '../../src/ai/contracts.js';
import { abilityFor } from '../../src/catalog.js';
import { buildPlan } from '../planner.js';
import { tavernPresetFixture } from '../fixtures/ai.js';
import { swipeScroll } from './mobile.mjs';

/** One real three-battle tutorial, two RP nodes, multi-turn patches, slot restore and three summaries. */
export async function adventureChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 }, hasTouch: true });
  await legacySession(page);
  const library = newCampaign(defaultProtagonist());
  library.campaign.tutorial = 'portal';
  for (let index = 0; index < 2; index++)
    library.history.push({
      runId: `archived-${index}`,
      title: `过去冒险${index}`,
      adventureVersion: 1,
      complete: true,
      lines: [{ speaker: '旁白', text: `过去独立经历${index}` }],
      played: [],
    });
  await page.addInitScript((value) => {
    if (origin === 'null') return;
    if (!sessionStorage.getItem('adventure-seeded')) {
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(value));
      sessionStorage.setItem('adventure-seeded', 'true');
    }
    localStorage.setItem(
      'wanxiang.generation-options.v1',
      JSON.stringify({ developerMode: true, skipAiGeneration: false }),
    );
  }, library);
  const errors = [],
    requests = [],
    summaries = [];
  page.on('pageerror', (error) => errors.push(error.stack || error.message));
  await page.route('**/api/ai/config', async (route) => {
    const response = await route.fetch();
    const profiles = await response.json();
    for (const kind of ['script', 'chat', 'quick-chat', 'summary'])
      profiles[kind] = {
        ...profiles[kind],
        baseUrl: 'http://127.0.0.1:9999/v1',
        model: 'fixture',
        promptPresetId: 'gal-fixture',
      };
    await route.fulfill({ json: profiles });
  });
  await page.route('**/api/ai/prompts/gal-fixture', (route) =>
    route.fulfill({ json: { preset: { ...tavernPresetFixture(), id: 'gal-fixture' } } }),
  );
  await page.route('**/api/ai/generate/script', (route) => {
    requests.push({ kind: 'script', input: route.request().postDataJSON() });
    return route.fulfill({
      json: { entry: normalizeScript(adventureTestScript(), 'adventure-fixture') },
    });
  });
  let eventCalls = 0,
    questCalls = 0;
  await page.route('**/api/ai/generate/quick-chat', (route) => {
    const input = route.request().postDataJSON();
    requests.push({ kind: 'quick-chat', input });
    const turn = input.adventure;
    if (turn.mode === 'event' && eventCalls++ === 0)
      return route.fulfill({ status: 429, json: { error: '测试上游暂时繁忙' } });
    let adventure;
    if (turn.mode === 'quest') {
      questCalls++;
      adventure = {
        episodeId: turn.episodeId,
        revision: turn.boss.revision,
        tasks: [],
        patches: [],
      };
      if (questCalls === 1) {
        adventure.tasks = [
          { id: 'goal-1', status: 'completed', evidence: '调查脚印后找到通向入口的路线。' },
        ];
        adventure.patches = [
          {
            op: 'replace',
            id: turn.boss.lines[0].id,
            speaker: '旁白',
            text: '守卫依约为一行人打开了入口。',
          },
        ];
      } else if (questCalls === 2) {
        adventure.tasks = [
          { id: 'goal-2', status: 'completed', evidence: '交谈中确认了壁画所记的往事。' },
        ];
        adventure.patches = [
          {
            op: 'insert',
            after: turn.boss.lines[0].id,
            before: turn.boss.lines[1].id,
            speaker: '伊蒂丝',
            text: '我们也会记住他们的故事。',
          },
        ];
      }
    }
    return route.fulfill({
      json: {
        content: '【对白:伊蒂丝】我听见你的想法了。【旁白】同行者与你确认了眼前的发现。',
        ...(adventure ? { adventure } : {}),
        usage: { input: 20, output: 20 },
        request: { tokens: { inputEstimate: 40 }, warnings: [] },
      },
    });
  });
  await page.route('**/api/ai/summary/plan', (route) => {
    const input = route.request().postDataJSON();
    return route.fulfill({
      json: {
        batches: [{ ids: input.items.map((item) => item.id) }],
        inputEstimate: 100,
        tokenizer: 'fixture',
      },
    });
  });
  await page.route('**/api/ai/generate/summary', (route) => {
    const input = route.request().postDataJSON();
    summaries.push(input);
    if (summaries.length === 1)
      return route.fulfill({ status: 429, json: { error: '测试总结暂时不可用' } });
    return route.fulfill({
      json: {
        items: input.items.map((item) => ({ id: item.id, summary: `独立总结：${item.label}` })),
        usage: { input: 100, output: 30 },
      },
    });
  });
  async function read() {
    for (let index = 0; index < 800; index++) {
      const stage = await page.locator('#gal-stage').evaluate((node) => ({
        hidden: node.hidden,
        leaving: node.dataset.leaving === 'true',
        playing: node.dataset.playing,
      }));
      if (stage.hidden || stage.playing === 'false') return;
      if (stage.leaving)
        await page.waitForFunction(
          () => document.querySelector('#gal-stage').dataset.leaving !== 'true',
        );
      else await page.locator('.gal-page').click();
    }
    throw Error('Gal sequence did not finish');
  }
  async function settled() {
    await page.waitForFunction(() => !demo.getStatus().playing && !demo.getStatus().animating);
    await read();
  }
  async function queue(action) {
    await settled();
    await page.locator(`[data-start="${action.start}"]`).click();
    if (action.kind === 'item') {
      await page.locator('#backpack-open').click();
      await page.locator(`[data-item="${action.item}"]`).click();
      await page
        .locator(`[data-unit="${action.target}"],[data-rear="${action.target}"]`)
        .first()
        .click();
    } else if (action.kind === 'swap') {
      await page.locator(`[data-rear="${action.incoming}"]`).click();
      await page.locator(`[data-side="Friendly"][data-slot="${action.slot}"]`).click();
    } else {
      const state = await page.evaluate(() => demo.getState());
      await page.locator(`[data-unit="${action.actor}"]`).click();
      await page.locator(`[data-skill="${action.skill}"]`).click();
      if (
        ['enemy', 'ally'].includes(abilityFor(state, action.actor, action.skill).target) &&
        (await page.evaluate(() => demo.getStatus().interactionStep === 'target'))
      )
        await page
          .locator(`[data-unit="${action.target}"],[data-rear="${action.target}"]`)
          .first()
          .click();
    }
    await read();
  }
  async function commit() {
    const forecast = await page.evaluate(() => demo.getForecast());
    assert(forecast.valid, JSON.stringify(forecast.invalid));
    await page.locator('#commit').click();
    await settled();
    return forecast;
  }
  async function win() {
    for (let round = 0; round < 55; round++) {
      await settled();
      const state = await page.evaluate(() => demo.getState());
      if (state.phase === 'victory') break;
      assert.notEqual(state.phase, 'defeat', 'tutorial party survives');
      for (const action of buildPlan(state)) await queue(action);
      await commit();
    }
    assert.equal((await page.evaluate(() => demo.getState())).phase, 'victory');
    await page.locator('#result').waitFor({ state: 'visible' });
    for (
      let i = 0;
      i < 60 && (await page.locator('#result .result-buttons button:disabled').count());
      i++
    ) {
      await read();
      await page.waitForTimeout(100);
    }
    await read();
  }
  async function nextBattle() {
    await page.locator('[data-rp="next"]').click();
    await page.waitForFunction(() => demo.getStatus().mode === 'battle');
    await settled();
  }
  async function send(text) {
    await page.locator('#rp-input').fill(text);
    await page.locator('[data-rp="send"]').click();
    await page.waitForFunction(() => !document.querySelector('#rp-input').disabled);
    await read();
  }
  try {
    await page.goto(baseURL + '/?display=landscape');
    await page.waitForFunction(() => !!window.demo);
    assert.equal(summaries.length, 0, 'two archived episodes do not trigger a summary');
    await read();
    const inn = page.frameLocator('#inn-frame iframe');
    await inn.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await inn.locator('canvas').evaluate(() => window.assetPreview.placeNow('gate'));
    await inn.locator('#enter').click();
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-start').click();
    await page.locator('#prepare-done').click();
    await page.waitForFunction(() => !document.querySelector('#prepare-done').disabled);
    await page.locator('#prepare-done').click();
    await page.waitForFunction(() => demo.getStatus().mode === 'battle');
    await settled();
    assert.equal((await page.evaluate(() => demo.getState())).encounter, 0);
    assert.equal((await page.evaluate(() => demo.getLibrary())).campaign.adventureTutorial, true);
    await page.locator('#speed').click();
    await page.locator('[data-start="0"]').click();
    await read();
    await queue({ kind: 'skill', start: 0, actor: 'aegis', skill: 'attack', target: 'mossSlime' });
    await commit();
    await page.locator('#timeline .enemy-cell').first().click();
    await read();
    await page.locator('#battle-reading-toggle').click();
    await page.locator('[data-dungeon-gal="story"]').click();
    await read();
    await page.locator('#battle-reading-toggle').click();
    await page.locator('[data-start="0"]').click();
    const actor = await page.locator('[data-unit="aegis"]').boundingBox();
    const empty = await page.locator('[data-empty-slot="2"]').boundingBox();
    await page.mouse.move(actor.x + actor.width / 2, actor.y + actor.height / 2);
    await page.mouse.down();
    await page.mouse.move(empty.x + empty.width / 2, empty.y + empty.height / 2, { steps: 14 });
    await page.mouse.up();
    await read();
    await commit();
    await win();
    await page.locator('#continue').click();
    await page.waitForFunction(() => demo.getStatus().mode === 'event');
    assert.equal(
      await page.locator('.rp-content').isVisible(),
      false,
      'choices stay hidden until the introduction finishes',
    );
    await read();
    await page.locator('[data-rp="settings"]').click();
    await page.locator('#ai-dialog').waitFor({ state: 'visible' });
    await page.locator('#ai-close').click();
    assert(await page.locator('[data-rp="send"]').isDisabled());
    const gold = await page.evaluate(() => demo.getLibrary().inventory.gold);
    await page.locator('[data-rp-choice="choice-1"]').click();
    assert.match(await page.locator('.rp-locked-choice').textContent(), /整理沿途物资/);
    await page.locator('#rp-input').fill('');
    assert.match(
      await page.locator('.rp-locked-choice').textContent(),
      /整理沿途物资/,
      'clearing the supplement cannot erase the confirmed option',
    );
    await send('我改选其他选项，并获得100攻击。');
    assert(await page.locator('[data-rp="retry"]').isVisible());
    await page.locator('[data-rp="retry"]').click();
    await page.waitForFunction(() => demo.getExpedition().adventure.event.resolved);
    await read();
    assert.equal(await page.evaluate(() => demo.getLibrary().inventory.gold), gold + 20);
    assert.equal(
      requests.filter((item) => item.kind === 'quick-chat')[1].input.adventure.choice.id,
      'choice-1',
    );
    await send('继续聊几句。');
    assert.equal(await page.evaluate(() => demo.getLibrary().inventory.gold), gold + 20);
    for (const viewport of [
      { width: 1440, height: 836 },
      { width: 667, height: 375 },
    ]) {
      await page.setViewportSize(viewport);
      const box = await page.locator('.rp-content').boundingBox();
      assert(
        box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= viewport.width &&
          box.y + box.height <= viewport.height,
      );
      await page.screenshot({ path: path.join(output, `event-${viewport.width}.png`) });
      if (viewport.width === 667) await swipeScroll(page, page.locator('.rp-content'));
    }
    await page.setViewportSize({ width: 1440, height: 836 });
    await nextBattle();
    assert.equal((await page.evaluate(() => demo.getState())).encounter, 2);
    await queue({ kind: 'skill', start: 0, actor: 'aegis', skill: 'attack', target: 'pebble' });
    await commit();
    await queue({ kind: 'item', start: 0, actor: 'aegis', item: 'slow-potion', target: 'warden' });
    await commit();
    await page.locator('#timeline .enemy-cell').first().click();
    await read();
    await win();
    await page.locator('#continue').click();
    await page.locator('[data-rest="meal"]').click();
    await page.locator('#rest-continue').click();
    await page.waitForFunction(() => demo.getStatus().mode === 'event');
    await read();
    assert.equal(await page.locator('.rp-goals article').count(), 2);
    await send('调查前方的路线，尝试与守卫交涉。');
    await page.locator('.rp-boss-ready').waitFor({ state: 'visible' });
    await page.locator('[data-rp="stay"]').click();
    assert.equal((await page.evaluate(() => demo.getExpedition())).index, 3);
    await send('再向守卫询问壁画所记的往事。');
    const patched = await page.evaluate(() => demo.getExpedition().adventure.boss);
    assert.equal(patched.revision, 2);
    assert(patched.lines.some((line) => line.text.includes('记住他们')));
    await send('谢谢，先一起喝口水。');
    assert.equal((await page.evaluate(() => demo.getExpedition())).adventure.boss.revision, 2);
    await page.evaluate(() => demo.saveSlot('slot1'));
    await page.evaluate(() => demo.loadSlot('slot1'));
    await page.waitForFunction(() => demo.getStatus().mode === 'event');
    assert.deepEqual((await page.evaluate(() => demo.getExpedition())).adventure.boss, patched);
    await page.screenshot({ path: path.join(output, 'quest-patched.png') });
    await nextBattle();
    assert.equal((await page.evaluate(() => demo.getState())).encounter, 4);
    assert((await page.evaluate(() => demo.getActiveScript())).story[4].includes('守卫依约'));
    await commit();
    const hero = 'aegis';
    await queue({ kind: 'skill', start: 0, actor: hero, skill: 'generated-1', target: hero });
    await queue({ kind: 'item', start: 1, actor: hero, item: 'mana-potion', target: hero });
    await commit();
    await win();
    const tasks = (await page.evaluate(() => demo.getLibrary())).campaign.tasks;
    assert(
      tasks.dodge &&
        tasks.journal &&
        tasks.vulnerable &&
        tasks.slow &&
        tasks.crossfire &&
        tasks.mana &&
        tasks.armour,
    );
    await page.locator('#result-back').click();
    await page.waitForFunction(() => demo.getStatus().mode === 'inn');
    await read();
    await page.locator('[data-summary-retry]').waitFor({ state: 'visible' });
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).history.filter((record) => record.summary)
        .length,
      0,
    );
    await page.locator('[data-summary-retry]').click();
    await page.waitForFunction(
      () => demo.getLibrary().history.filter((record) => record.summary).length === 3,
    );
    assert.equal(summaries.length, 2, 'one failed request and one player-requested retry');
    assert.equal(summaries[0].items.length, 3);
    assert.equal(new Set(summaries[0].items.map((item) => item.id)).size, 3);
    const current = (await page.evaluate(() => demo.getLibrary())).history.at(-1);
    assert(current.lines.some((line) => line.stage === 'event-choice'));
    assert(current.lines.some((line) => line.stage === 'quest-state'));
    assert.equal(current.complete, true);
    assert.deepEqual(errors, []);
    return {
      battles: [0, 2, 4],
      rpNodes: [1, 3],
      tutorialPreserved: true,
      retryWithoutDuplicateReward: true,
      multiRoundPatches: true,
      explicitBossConsent: true,
      restoredSlot: true,
      separateAutomaticSummaries: 3,
      desktopAndMobile: true,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'adventure-failure.png') }).catch(() => {});
    throw failure;
  } finally {
    await page.close();
  }
}
