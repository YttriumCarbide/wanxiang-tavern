import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { combatTestScript } from '../../src/content/generation-mode.js';
import { tavernPresetFixture } from '../fixtures/ai.js';
import { newLibrary, officialCharacter } from '../../src/ai/library.js';
import { normalizeEquipment, buyEquipment } from '../../src/equipment.js';

/** Real controllers, mocked upstream: composition, replay, party transaction and touch dialogs. */
export async function galWorkspaceChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 }, hasTouch: true });
  await legacySession(page);
  const initial = newLibrary();
  initial.inventory.bagUnlocked = true;
  for (const id of ['edith', 'pandora'])
    if (!initial.characters.some((member) => member.id === `official-${id}`))
      initial.characters.push(officialCharacter(id));
  initial.equipment.catalog.push(
    normalizeEquipment(
      { name: '整备测试晶环', description: 'hp增加2', stats: { hp: 2 }, rules: [] },
      { id: 'gal-ring', name: '晶环', value: 25 },
    ),
  );
  initial.inventory.ether = 25;
  buyEquipment(initial, 'gal-ring', 'gal-owned');
  await page.addInitScript((library) => {
    if (origin === 'null') return;
    if (!sessionStorage.getItem('gal-workspace-seeded')) {
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
      sessionStorage.setItem('gal-workspace-seeded', 'true');
    }
    localStorage.setItem(
      'wanxiang.generation-options.v1',
      JSON.stringify({
        developerMode: true,
        galMode: true,
        protagonistApi: true,
        scriptApi: true,
        allowRetreat: true,
      }),
    );
  }, initial);
  const errors = [],
    calls = [];
  page.on('pageerror', (failure) => errors.push(failure.message));
  await page.route('**/api/ai/config', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const profiles = await response.json();
    for (const kind of ['script', 'chat', 'quick-chat'])
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
  for (const kind of ['chat', 'quick-chat'])
    await page.route(`**/api/ai/generate/${kind}`, (route) => {
      calls.push({ kind, input: route.request().postDataJSON(), time: Date.now() });
      return route.fulfill({
        json: {
          content: '【对白:伊蒂丝】先坐下吧。【旁白】\n\n她合上书。\n\n【对白:潘多拉】茶刚泡好。',
          usage: { input: 20, output: 20 },
          request: { tokens: { inputEstimate: 40 }, warnings: [] },
        },
      });
    });
  let releaseScript, announceScript;
  const scriptPending = new Promise((resolve) => {
    releaseScript = resolve;
  });
  const scriptStarted = new Promise((resolve) => {
    announceScript = resolve;
  });
  await page.route('**/api/ai/generate/script', async (route) => {
    const input = route.request().postDataJSON();
    calls.push({ kind: 'script', input });
    announceScript();
    await scriptPending;
    return route.fulfill({
      json: {
        entry: {
          ...combatTestScript(input.exploration?.map),
          id: 'gal-ui-script',
          story: Array.from(
            { length: 5 },
            () => '【对白:伊蒂丝】前面有脚步声。【对白:潘多拉】那就一起看看。',
          ),
        },
      },
    });
  });
  async function finishPages() {
    for (
      let index = 0;
      index < 35 && (await page.locator('#gal-stage').getAttribute('data-playing')) === 'true';
      index++
    )
      await page.locator('.gal-page').click();
  }
  async function inside(selector) {
    await page.locator(selector).evaluate((node) =>
      Promise.all(
        node
          .getAnimations()
          .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    const box = await page.locator(selector).boundingBox();
    const size = page.viewportSize();
    assert(
      box &&
        box.x >= -1 &&
        box.y >= -1 &&
        box.x + box.width <= size.width + 1 &&
        box.y + box.height <= size.height + 1,
      selector,
    );
  }
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('table'));
    await frame.locator('#talk-open').click();
    await page.locator('.gal-composer').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#chat-dialog').isVisible(), false);
    assert.equal(await page.locator('.gal-side').isVisible(), false);
    assert.equal(await page.locator('.gal-reading').isVisible(), false);
    await page.locator('[data-workspace="people"]').first().click();
    assert.equal(await page.locator('.gal-side').isVisible(), true);
    assert.equal(await page.locator('.gal-composer').isVisible(), false);
    const person = await page.locator('.gal-side .chat-person').first().boundingBox();
    assert(person.height <= 64, 'participants use compact rows instead of large cards');
    const originallyChecked = await page
      .locator('#chat-participants input:checked')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    for (const id of originallyChecked)
      await page.locator(`#chat-participants input[value="${id}"]`).uncheck();
    const moon = initial.characters.find((member) => member.combat.id === 'aegis').id;
    const missing = initial.characters.find(
      (member) => !['aegis', 'edith', 'pandora'].includes(member.combat.id),
    ).id;
    const choose = (id, checked) =>
      page.locator(`#chat-participants input[value="${id}"]`).setChecked(checked);
    const assertCast = async (ids) =>
      assert.deepEqual(
        await page
          .locator('.gal-cast img:not([data-leaving])')
          .evaluateAll((images) => images.map((image) => image.dataset.actor)),
        ids,
      );
    await choose(missing, true);
    await assertCast([]);
    await choose(missing, false);
    await choose(moon, true);
    await assertCast([moon]);
    await choose('official-edith', true);
    await choose('official-pandora', true);
    await assertCast([moon, 'official-edith']);
    await choose(moon, false);
    await assertCast(['official-edith', 'official-pandora']);
    await choose('official-edith', false);
    await assertCast(['official-pandora']);
    await choose('official-pandora', false);
    await choose(missing, true);
    await assertCast([]);
    await choose(missing, false);
    await choose('official-edith', true);
    await choose('official-pandora', true);
    await page.screenshot({ path: path.join(output, 'desktop-gal-participants.png') });
    await page.locator('[data-workspace="compose"]').first().click();
    assert.equal(await page.locator('.gal-composer').isVisible(), true);
    assert.equal(await page.locator('.gal-reading').isVisible(), false);
    await page
      .locator('.gal-composer')
      .evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    await page.screenshot({ path: path.join(output, 'desktop-gal-compose.png') });
    await page.locator('#chat-input').fill('今天怎么样？');
    const submitted = Date.now();
    await page.locator('#chat-input').press('Enter');
    await page.waitForFunction(
      () =>
        document.querySelector('#gal-stage').dataset.playing === 'true' &&
        document.querySelector('.gal-text').textContent.includes('先坐'),
    );
    assert(
      Date.now() - submitted >= 1900,
      'a short response still has the requested two-second lead-in',
    );
    await page.locator('#gal-stage').evaluate((element) => {
      if (element.dataset.typing === 'true') element.querySelector('.gal-page').click();
    });
    await page.locator('.gal-page').click();
    await page.locator('#gal-stage').evaluate((element) => {
      if (element.dataset.typing === 'true') element.querySelector('.gal-page').click();
    });
    assert.equal((await page.locator('.gal-text').textContent()).trim(), '她合上书。');
    await page.locator('[data-gal="back"]').click();
    assert((await page.locator('.gal-text').textContent()).includes('先坐下'));
    await page.locator('[data-gal="hide"]').click();
    await page.mouse.click(600, 100);
    assert.equal(await page.locator('.gal-reading').isVisible(), true);
    await page
      .locator('.gal-cast')
      .evaluate((element) =>
        Promise.all(
          element
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
    await page.screenshot({ path: path.join(output, 'full-screen-conversation.png') });
    await finishPages();
    const saved = await page.evaluate(() => demo.getLibrary().tavernChat);
    await page.locator('[data-gal="close"]').click();
    await frame.locator('#talk-open').click();
    await page.locator('[data-workspace="replay"]').click();
    await page.waitForFunction(() =>
      document.querySelector('.gal-text').textContent.includes('先坐'),
    );
    await page.locator('#gal-stage').evaluate((element) => {
      if (element.dataset.typing === 'true') element.querySelector('.gal-page').click();
    });
    assert((await page.locator('.gal-text').textContent()).includes('先坐下'));
    assert.equal(calls.filter((call) => call.kind === 'chat').length, 1);
    assert.deepEqual(
      (await page.evaluate(() => demo.getLibrary().tavernChat)).filter((line) => !line.divider),
      saved.filter((line) => !line.divider),
      'replay does not duplicate messages; reopening may record updated participants',
    );
    await finishPages();
    await page.locator('[data-gal="close"]').click();
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('gate'));
    await frame.locator('#enter').click();
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-start').click();
    await page.locator('#departure-party').waitFor({ state: 'visible' });
    assert.equal(calls.filter((call) => call.kind === 'script').length, 0);
    await page.locator('[data-departure-slot="0"]').click();
    const reserveId = await page
      .locator('[data-departure-hero]')
      .last()
      .getAttribute('data-departure-hero');
    await page.locator(`[data-departure-hero="${reserveId}"]`).click();
    await page.locator('[data-departure="confirm"]').click();
    await page.locator('#party-panel.formation-locked').waitFor({ state: 'visible' });
    await scriptStarted;
    assert.equal(await page.locator('#prepare-done').isDisabled(), true);
    assert.equal(await page.locator('#generation-progress').isVisible(), false);
    await page.locator('[data-prepare-slot="0"]').click();
    await page.locator('[data-equipment-slot="0"]').selectOption('gal-owned');
    await page.locator('#prepare-character-done').click();
    assert(
      (await page.evaluate(() => demo.getLibrary())).characters
        .find((member) => member.id === reserveId)
        .equipment.includes('gal-owned'),
    );
    await page.screenshot({ path: path.join(output, 'equipment-while-generating.png') });
    releaseScript();
    await page.waitForFunction(() => !document.querySelector('#prepare-done').disabled);
    assert.equal(calls.filter((call) => call.kind === 'script').length, 1);
    assert.equal(calls.find((call) => call.kind === 'script').input.party[0].id, reserveId);
    assert.equal(await page.locator('.prepare-reserve-col').isVisible(), false);
    assert.equal(await page.locator('.prepare-slot[draggable="true"]').count(), 0);
    await page.locator('#prepare-done').click();
    await page.waitForFunction(
      () =>
        !document.querySelector('#gal-stage').hidden &&
        document.querySelector('#gal-stage').dataset.owner === 'script',
    );
    assert.equal(
      await page.evaluate(() => demo.getStatus().animating),
      false,
      'dialogue waits for card landing',
    );
    assert.equal(
      await page.locator('#battle').evaluate((node) => node.classList.contains('entering')),
      false,
    );
    await page.waitForFunction(() => demo.getStatus().mode === 'battle');
    await finishPages();
    await page.locator('#battle-reading-toggle').click();
    await page.locator('#gal-dungeon-menu').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.turn-column').evaluate((node) => node.inert), true);
    await page.locator('#battle-reading-toggle').click();
    assert.equal(await page.locator('.turn-column').evaluate((node) => node.inert), false);
    await page.locator('#battle-reading-toggle').click();
    await page.locator('[data-dungeon-gal="quick"]').click();
    await page.locator('#quick-chat-input').fill('留意前面。');
    await page.locator('#quick-chat-input').press('Enter');
    await page.waitForFunction(() =>
      document.querySelector('.gal-text').textContent.includes('先坐'),
    );
    assert.equal(calls.filter((call) => call.kind === 'quick-chat').length, 1);
    await finishPages();
    await page.setViewportSize({ width: 844, height: 390 });
    await inside('.gal-composer');
    assert.equal(await page.locator('.gal-reading').isVisible(), false);
    assert.equal(
      await page.locator('#quick-chat-status').isVisible(),
      false,
      'token counts stay out of the composer',
    );
    assert.equal(
      await page.locator('#script-rewrite').isVisible(),
      false,
      'rewrite stays in auxiliary tools',
    );
    const inputBox = await page.locator('#quick-chat-input').boundingBox();
    const formBox = await page.locator('#quick-chat-form').boundingBox();
    const composerBox = await page.locator('.gal-composer').boundingBox();
    assert(
      inputBox.height >= 95 && inputBox.width >= formBox.width * 0.9,
      'the speech field dominates the input row',
    );
    assert(
      inputBox.height >= composerBox.height * 0.55,
      'the speech field is the main part of the panel',
    );
    assert.equal(await page.locator('#quick-chat-send svg').count(), 1);
    await page.locator('.gal-actionbar [data-workspace="tools"]').click();
    assert.equal(await page.locator('#script-rewrite').isVisible(), true);
    assert.equal(await page.locator('#quick-chat-status').isVisible(), true);
    assert.equal(await page.locator('#quick-chat-input').isVisible(), true);
    await page.locator('.gal-actionbar [data-workspace="tools"]').click();
    await page
      .locator('.gal-composer')
      .evaluate((element) =>
        Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => {}))),
      );
    await page.screenshot({ path: path.join(output, 'mobile-gal-composer.png') });
    await page.locator('[data-gal="close"]').click();
    const orb = await page.locator('#ap-orb').boundingBox();
    const switchBox = await page.locator('#battle-reading-toggle').boundingBox();
    const bagBox = await page.locator('#backpack-open').boundingBox();
    assert(
      Math.abs(switchBox.width - orb.width) < 1 && Math.abs(switchBox.y - orb.y) < 1,
      'switch matches the AP/backpack size and baseline',
    );
    assert(switchBox.x > bagBox.x + bagBox.width, 'switch stays immediately right of the backpack');
    const timelineBox = await page.locator('.turn-column').boundingBox();
    assert(timelineBox.x >= switchBox.x + switchBox.width, 'switch stays left of the first turn');
    const stateBeforeSwitch = await page.evaluate(() => demo.getState());
    await page.locator('#battle-reading-toggle').click();
    assert.equal(await page.locator('.turn-column').evaluate((node) => node.inert), false);
    await page.locator('#battle-reading-toggle').click();
    await page.locator('#gal-dungeon-menu').waitFor({ state: 'visible' });
    assert.deepEqual(await page.evaluate(() => demo.getState()), stateBeforeSwitch);
    await page.screenshot({ path: path.join(output, 'mobile-reading-switch.png') });
    await page.evaluate(() => demo.returnInn());
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await page.waitForFunction(
      () => document.querySelector('#inn-frame iframe')?.contentWindow?.assetPreview,
    );
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('table'));
    await frame.locator('#talk-open').click();
    await page.locator('[data-workspace="people"]').first().click();
    await page
      .locator('.gal-cast')
      .evaluate((node) =>
        Promise.all(
          node
            .getAnimations({ subtree: true })
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
    const mobilePerson = await page.locator('.gal-side .chat-person').first().boundingBox();
    assert(mobilePerson.height <= 50, 'mobile selection rows stay compact');
    const side = await page.locator('.gal-side').boundingBox();
    const actor = await page.locator('.gal-cast img').first().boundingBox();
    assert(actor.x >= side.x + side.width, 'participant drawer does not cover the portrait');
    assert.equal(await page.locator('.gal-composer').isVisible(), false);
    await page.screenshot({ path: path.join(output, 'mobile-gal-participants.png') });
    await page.locator('.gal-side [data-workspace="compose"]').click();
    assert.equal(await page.locator('.gal-composer').isVisible(), true);
    assert.equal(await page.locator('.gal-reading').isVisible(), false);
    await page.locator('.gal-composer [data-workspace="exit"]').click();
    assert.equal(await page.locator('#gal-stage').isVisible(), false);
    for (const viewport of [
      { width: 844, height: 390 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await page.locator('#ai-open').click();
      await inside('#ai-dialog');
      await page.locator('#ai-dialog').evaluate((dialog) => {
        dialog.dataset.setup = 'connections';
        document.querySelector('#setup-intro').hidden = false;
        document.querySelector('#setup-footer').hidden = false;
      });
      const scroll = await page.locator('#ai-dialog').evaluate((dialog) => {
        dialog.scrollTop = dialog.scrollHeight;
        return { top: dialog.scrollTop, overflow: dialog.scrollHeight - dialog.clientHeight };
      });
      assert(scroll.overflow > 0 && scroll.top > 0, 'API setup can scroll to its footer');
      await page.screenshot({ path: path.join(output, `api-setup-${viewport.width}.png`) });
      await page.locator('#ai-close').click();
    }
    assert.deepEqual(errors, []);
    return {
      replayWithoutApi: true,
      chatAndQuickCompose: true,
      partyBeforeRequest: true,
      equipmentOnly: true,
      responsiveSetup: true,
    };
  } finally {
    releaseScript?.();
    await page.close();
  }
}
