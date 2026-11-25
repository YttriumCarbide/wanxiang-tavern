import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { armDialogExitProbe } from './dialog-motion.mjs';
import { combatTestScript } from '../../src/content/generation-mode.js';
import { tavernPresetFixture } from '../fixtures/ai.js';
import { newLibrary, officialCharacter } from '../../src/ai/library.js';
import { EMBLEMS } from '../../src/emblems.js';
import { normalizeEquipment, buyEquipment } from '../../src/equipment.js';
import { chatResponse } from '../../server/chat-response.mjs';

/** Real controllers, mocked upstream: composition, replay, party transaction and touch dialogs. */
export async function galWorkspaceChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 }, hasTouch: true });
  await legacySession(page);
  const initial = newLibrary();
  initial.inventory.bagUnlocked = true;
  initial.daily.tutorial = 'done';
  initial.unlockedDungeons = ['mill'];
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
  initial.inventory.gold = 1000;
  initial.inventory.ether = 500;
  initial.emblems = [Object.keys(EMBLEMS)[0]];
  initial.characters[0].emblemId = initial.emblems[0];
  await page.addInitScript((library) => {
    if (origin === 'null') return;
    if (!sessionStorage.getItem('gal-workspace-seeded')) {
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
      sessionStorage.setItem('gal-workspace-seeded', 'true');
    }
    localStorage.setItem(
      'wanxiang.generation-options.v1',
      JSON.stringify({
        developerMode: false,
        galMode: false,
        protagonistApi: true,
        scriptApi: true,
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
    await page.route(`**/api/ai/generate/${kind}`, async (route) => {
      const input = route.request().postDataJSON();
      calls.push({ kind, input, time: Date.now() });
      const reply = await chatResponse(
        kind,
        '<think>格式自查。</think>< wanxiang_output >【对白:伊蒂丝】先坐下吧。【旁白】\n\n她合上书。\n\n【对白:潘多拉】茶刚泡好。< /wanxiang_output >',
        [],
        input,
      );
      return route.fulfill({
        json: {
          ...reply,
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
    ) {
      if ((await page.locator('#gal-stage').getAttribute('data-leaving')) === 'true')
        await page.waitForFunction(
          () => document.querySelector('#gal-stage').dataset.leaving !== 'true',
        );
      else await page.locator('.gal-page').click();
    }
  }
  async function checkComposer(kind) {
    await page.locator(`#${kind}-input`).focus();
    const style = await page.locator(`#${kind}-input`).evaluate((node) => {
      const css = getComputedStyle(node);
      return { outline: css.outlineStyle, shadow: css.boxShadow };
    });
    assert.equal(style.outline, 'none', 'Gal inputs replace the browser focus outline');
    assert.notEqual(style.shadow, 'none', 'focus retains the translucent gold decoration');
    const icon = page.locator(`#${kind}-send svg`);
    const rect = await icon.boundingBox();
    assert(rect.width >= 18 && rect.height >= 18, 'send icon has explicit visible dimensions');
    assert(await icon.locator('path').count());
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
  async function checkPeopleEdge({ compact = false } = {}) {
    const launcher = page.getByRole('button', { name: '选择交谈人物与任务' });
    const box = await launcher.boundingBox();
    assert(box && box.x <= 1, 'people launcher sits on the left edge');
    assert(
      Math.abs(box.y + box.height / 2 - page.viewportSize().height / 2) <= 1,
      'the left launcher mirrors the ledger midpoint',
    );
    assert(box.height > box.width && box.width >= (compact ? 44 : 24));
    assert.equal(await launcher.getAttribute('aria-controls'), 'gal-people-drawer');
    assert.equal(await launcher.getAttribute('aria-expanded'), 'false');
    return launcher;
  }
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('table'));
    await page.locator('[data-daily="chat"]').click();
    await page.locator('.gal-composer').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#chat-dialog').isVisible(), false);
    assert.equal(await page.locator('.gal-side').isVisible(), false);
    assert.equal(await page.locator('.gal-reading').isVisible(), false);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const sidePanel = page.locator('.gal-side');
    const peopleLauncher = await checkPeopleEdge();
    await peopleLauncher.press('Enter');
    assert.equal(await sidePanel.isVisible(), true);
    assert.equal(await peopleLauncher.getAttribute('aria-expanded'), 'true');
    assert(await sidePanel.evaluate((node) => node.contains(document.activeElement)));
    await sidePanel.locator('[data-workspace="compose"]').click();
    assert.deepEqual(
      await sidePanel.evaluate((node) => ({
        hidden: node.hidden,
        inert: node.inert,
        exiting: node.dataset.workspaceExiting,
      })),
      { hidden: false, inert: true, exiting: 'true' },
      'normal motion keeps the closing drawer rendered but inert',
    );
    assert.equal(await peopleLauncher.getAttribute('aria-expanded'), 'false');
    assert.equal(
      await page.evaluate(() => Boolean(document.activeElement.closest('.gal-composer'))),
      true,
      'focus moves into the incoming composer before the drawer exits',
    );
    await peopleLauncher.click();
    assert.deepEqual(
      await sidePanel.evaluate((node) => ({
        hidden: node.hidden,
        inert: node.inert,
        exiting: node.dataset.workspaceExiting,
      })),
      { hidden: false, inert: false, exiting: undefined },
      'reopening cancels the in-flight drawer exit',
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await sidePanel.locator('[data-workspace="compose"]').click();
    assert.deepEqual(
      await sidePanel.evaluate((node) => ({
        hidden: node.hidden,
        exiting: node.dataset.workspaceExiting,
      })),
      { hidden: true, exiting: undefined },
      'reduced motion closes the drawer immediately',
    );
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await peopleLauncher.click();
    await sidePanel.waitFor({ state: 'visible' });
    await sidePanel.locator('[data-workspace="compose"]').click();
    await sidePanel.waitFor({ state: 'hidden' });
    assert.equal(await sidePanel.evaluate((node) => node.dataset.workspaceExiting), undefined);
    assert.equal(
      await page.evaluate(() => Boolean(document.activeElement.closest('.gal-composer'))),
      true,
      'focus remains in the incoming composer after the drawer exit completes',
    );
    await peopleLauncher.click();
    await sidePanel.waitFor({ state: 'visible' });
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
    await assertCast([missing]);
    assert(
      (
        await page.locator(`.gal-cast img[data-actor="${missing}"]`).getAttribute('data-asset')
      ).includes('/gal-npc-cast/'),
    );
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
    await assertCast([missing]);
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
    await checkComposer('chat');
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
    await page.locator('[data-daily="chat"]').click();
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
    const partyPanel = page.locator('#party-panel');
    await page.locator('#ledger-handle').click();
    await page.locator('#party-toggle').click();
    await partyPanel.locator('#prepare-close').press('Escape');
    await partyPanel.waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => document.activeElement.id), 'party-toggle');
    await page.locator('#ledger-close').click();
    await page.locator('[data-daily="dungeon"]').click();
    await page.locator('#destination-dialog[open]').waitFor();
    await page.locator('#destination-regions [data-region="mill"]').click();
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-start').click();
    await page.locator('#party-panel').waitFor({ state: 'visible' });
    const cancelDeparture = partyPanel.getByRole('button', { name: '取消出发', exact: true });
    assert.equal(await cancelDeparture.textContent(), '取消出发');
    assert.equal(await page.locator('#departure-party').count(), 0);
    assert.equal(calls.filter((call) => call.kind === 'script').length, 0);
    const reserveId = await page
      .locator('#prepare-pool [data-prepare-hero]')
      .last()
      .getAttribute('data-prepare-hero');
    await page
      .locator('#prepare-pool [data-prepare-hero="' + reserveId + '"]')
      .dragTo(page.locator('[data-prepare-slot="0"]'));
    assert.equal(
      await page.locator('[data-prepare-slot="0"]').getAttribute('data-prepare-hero'),
      reserveId,
    );
    await page.locator('#prepare-done').click();
    await page.locator('#party-panel.formation-locked').waitFor({ state: 'visible' });
    await scriptStarted;
    await partyPanel.locator('#prepare-cancel-generation').press('Escape');
    assert.equal(
      await partyPanel.evaluate((panel) => panel.open),
      true,
      'Escape must not dismiss preparation while the script request is pending',
    );
    assert.equal(await page.locator('#prepare-done').isDisabled(), true);
    assert.equal(await page.locator('#generation-progress').isVisible(), false);
    await page.locator('[data-prepare-slot="0"]').click();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const picker = page.locator('#equipment-picker');
    const gearRow = page.locator('.prepare-gear-row').nth(2);
    const gearFocusKey = await gearRow
      .locator('select[data-equipment-character]')
      .evaluate((select) => ({
        character: select.dataset.equipmentCharacter,
        slot: select.dataset.equipmentSlot,
      }));
    await gearRow.click();
    await picker.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const picker = document.querySelector('#equipment-picker[open]');
      return picker && getComputedStyle(picker).opacity === '1';
    });
    const motionSupported = await armDialogExitProbe(picker);
    await picker.getByRole('button', { name: '关闭窗口' }).click();
    const pickerExit = await picker.evaluate((panel) => ({
      open: panel.open,
      modal: panel.matches(':modal'),
      inert: panel.inert,
      display: getComputedStyle(panel).display,
      pointerEvents: getComputedStyle(panel).pointerEvents,
      backdropPointerEvents: getComputedStyle(panel, '::backdrop').pointerEvents,
      focusReturned: document.activeElement.matches('.prepare-gear-row'),
    }));
    assert.equal(pickerExit.open, false, 'closing releases the native open state immediately');
    assert.equal(pickerExit.modal, false, 'closing releases modality before the exit paint ends');
    assert.equal(pickerExit.inert, true, 'the exiting picker cannot receive keyboard focus');
    assert.equal(pickerExit.focusReturned, true, 'closing returns focus to its equipment row');
    if (motionSupported) {
      assert.notEqual(pickerExit.display, 'none', 'the exit remains painted without modality');
      assert.equal(pickerExit.pointerEvents, 'none');
      assert.equal(pickerExit.backdropPointerEvents, 'none');
      await page.waitForFunction(() =>
        document
          .querySelector('#equipment-picker')
          ?.getAttribute('data-test-dialog-exit-properties')
          ?.split(' ')
          .includes('opacity'),
      );
      await picker.evaluate((panel) => panel.removeAttribute('data-test-dialog-exit-properties'));
    }
    await gearRow.click();
    const pickerReopened = await picker.evaluate((panel) => ({
      open: panel.open,
      modal: panel.matches(':modal'),
      inert: panel.inert,
    }));
    assert.deepEqual(
      pickerReopened,
      { open: true, modal: true, inert: false },
      'reopening restores the native modal and focusable state after the exit',
    );
    await picker.evaluate((panel) =>
      Promise.all(
        panel
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    await page.waitForFunction(() => {
      const panel = document.querySelector('#equipment-picker');
      return (
        panel?.open &&
        getComputedStyle(panel).opacity === '1' &&
        getComputedStyle(panel.querySelector('.px-dialog')).opacity === '1'
      );
    });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await picker.getByRole('button', { name: '关闭窗口' }).click();
    const reducedExit = await picker.evaluate((panel) => ({
      open: panel.open,
      modal: panel.matches(':modal'),
      inert: panel.inert,
      focusReturned: document.activeElement.matches('.prepare-gear-row'),
      transitionDuration: getComputedStyle(panel).transitionDuration,
      activeAnimations: panel
        .getAnimations({ subtree: true })
        .filter((animation) => ['running', 'pending'].includes(animation.playState)).length,
    }));
    assert.equal(reducedExit.open, false);
    assert.equal(reducedExit.modal, false);
    assert.equal(reducedExit.inert, true);
    assert.equal(reducedExit.focusReturned, true);
    assert.equal(reducedExit.transitionDuration, '0s');
    assert.equal(reducedExit.activeAnimations, 0);

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await gearRow.click();
    await picker.waitFor({ state: 'visible' });
    await picker.locator('[data-picker-value="gal-owned"]').click();
    await picker.locator('[data-picker-confirm]').click();
    assert(
      (await page.evaluate(() => demo.getLibrary())).characters
        .find((member) => member.id === reserveId)
        .equipment.includes('gal-owned'),
    );
    await page.waitForFunction((key) => {
      const row = document.activeElement;
      const select = row?.querySelector('select[data-equipment-character]');
      return (
        row?.matches('.prepare-gear-row') &&
        select?.dataset.equipmentCharacter === key.character &&
        select.dataset.equipmentSlot === key.slot
      );
    }, gearFocusKey);
    await page.screenshot({ path: path.join(output, 'equipment-while-generating.png') });
    await page.locator('[data-prepare-buy]').click();
    await page.locator('#void-shop').waitFor({ state: 'visible' });
    const buy = page.locator('#void-shop [data-buy]');
    const itemId = await buy.getAttribute('data-buy');
    const count = await page.evaluate((id) => demo.getLibrary().inventory.items[id] || 0, itemId);
    await buy.click();
    assert.equal(
      await page.evaluate((id) => demo.getLibrary().inventory.items[id], itemId),
      count + 1,
    );
    await page.locator('#shop-close').click();
    await page.locator('[data-prepare-exchange]').click();
    assert(await page.locator('#forge-refine').isDisabled());
    assert(await page.locator('#forge-config').isDisabled());
    await page.locator('#forge-redeem').click();
    assert.equal(await page.evaluate(() => demo.getLibrary().equipment.owned.length), 2);
    await page.locator('[data-forge-close]').click();
    await page.locator('[data-prepare-slot="0"]').click();
    const ringRow = page.locator('.prepare-emblem-row');
    const ringCharacter = await ringRow
      .locator('select[data-emblem-character]')
      .getAttribute('data-emblem-character');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ringRow.click();
    await picker.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    const ringEscape = await picker.evaluate((panel) => ({
      open: panel.open,
      modal: panel.matches(':modal'),
      inert: panel.inert,
      focusReturned: document.activeElement.matches('.prepare-emblem-row'),
    }));
    assert.deepEqual(ringEscape, {
      open: false,
      modal: false,
      inert: true,
      focusReturned: true,
    });

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await ringRow.click();
    await picker.waitFor({ state: 'visible' });
    const ringChoice = page.locator('[data-picker-value="' + initial.emblems[0] + '"]');
    assert((await ringChoice.textContent()).includes('转移'));
    await ringChoice.click();
    await page.locator('[data-picker-confirm]').click();
    await page.waitForFunction((character) => {
      const row = document.activeElement;
      return (
        row?.matches('.prepare-emblem-row') &&
        row.querySelector('select[data-emblem-character]')?.dataset.emblemCharacter === character
      );
    }, ringCharacter);
    assert.equal(
      await page.evaluate(
        (id) => demo.getLibrary().characters.find((member) => member.id === id).emblemId,
        reserveId,
      ),
      initial.emblems[0],
    );
    assert.equal(
      await page.evaluate(
        (id) => demo.getLibrary().characters.find((member) => member.id === id).emblemId,
        initial.characters[0].id,
      ),
      null,
    );
    releaseScript();
    await page.waitForFunction(() => !document.querySelector('#prepare-done').disabled);
    assert.equal(calls.filter((call) => call.kind === 'script').length, 1);
    assert.equal(calls.find((call) => call.kind === 'script').input.party[0].id, reserveId);
    assert.equal(await page.locator('.prepare-reserve-col').isVisible(), false);
    assert.equal(await page.locator('.prepare-slot[draggable="true"]').count(), 0);
    await page.locator('#prepare-done').click();
    await page.waitForFunction(() => demo.getStatus().mode === 'battle');
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
    await checkComposer('quick-chat');
    await page.locator('#quick-chat-input').press('Enter');
    await page.waitForFunction(() =>
      document.querySelector('.gal-text').textContent.includes('先坐'),
    );
    assert.equal(calls.filter((call) => call.kind === 'quick-chat').length, 1);
    await page.locator('.gal-cast img[data-actor="official-edith"]').waitFor({ state: 'visible' });
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
      await page.locator('#script-rewrite').count(),
      0,
      'chat handles subsequent dialogue edits without a rewrite button',
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
    const toolsLauncher = page.locator('.gal-actionbar [data-workspace="tools"]');
    await toolsLauncher.click();
    assert.equal(await page.locator('#quick-chat-status').isVisible(), true);
    assert.equal(await page.locator('#quick-chat-input').isVisible(), true);
    const toolsPanel = page.locator('.gal-tools');
    await toolsPanel.locator('header [data-workspace="tools"]').click();
    assert.deepEqual(
      await toolsPanel.evaluate((node) => ({
        hidden: node.hidden,
        inert: node.inert,
        exiting: node.dataset.workspaceExiting,
      })),
      { hidden: false, inert: true, exiting: 'true' },
      'a closing tools drawer stays visible but inert until its exit animation finishes',
    );
    assert.equal(await toolsLauncher.getAttribute('aria-expanded'), 'false');
    assert.equal(
      await toolsLauncher.evaluate((node) => document.activeElement === node),
      true,
      'closing tools restores focus to its launcher',
    );
    await toolsPanel.waitFor({ state: 'hidden' });
    assert.equal(await toolsPanel.evaluate((node) => node.dataset.workspaceExiting), undefined);
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
    await page.goto(baseURL + '/?display=landscape');
    await page.waitForFunction(() => !!window.demo);
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await page.waitForFunction(
      () => document.querySelector('#inn-frame iframe')?.contentWindow?.assetPreview,
    );
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('table'));
    await page.locator('[data-daily="chat"]').click();
    const touchLauncher = await checkPeopleEdge({ compact: true });
    await touchLauncher.tap();
    assert.equal(await touchLauncher.getAttribute('aria-expanded'), 'true');
    const refreshedSelection = await page
      .locator('#chat-participants input:checked')
      .evaluateAll((inputs) => inputs.map((input) => input.value));
    for (const id of refreshedSelection) await choose(id, false);
    await choose('official-edith', true);
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
    await page.locator('.gal-composer').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.gal-composer').isVisible(), false);
    await page.screenshot({ path: path.join(output, 'mobile-gal-participants.png') });
    await page.locator('.gal-side [data-workspace="compose"]').click();
    assert.equal(await page.locator('.gal-composer').isVisible(), true);
    assert.equal(await page.locator('.gal-reading').isVisible(), false);
    await page.locator('.gal-composer [data-workspace="exit"]').click();
    await page.locator('#gal-stage').waitFor({ state: 'hidden' });
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
      const scroll = await page.locator('#ai-dialog .ai-workspace').evaluate((workspace) => {
        workspace.scrollTop = workspace.scrollHeight;
        return {
          top: workspace.scrollTop,
          overflow: workspace.scrollHeight - workspace.clientHeight,
        };
      });
      assert(
        scroll.overflow > 0 && scroll.top > 0,
        'API setup content remains scrollable above its fixed confirmation',
      );
      const footer = await page.locator('#setup-footer').boundingBox();
      assert(
        footer.y >= 0 && footer.y + footer.height <= viewport.height,
        'setup confirmation is always visible',
      );
      await page.screenshot({ path: path.join(output, `api-setup-${viewport.width}.png`) });
      await page.locator('#ai-close').click();
    }
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('[data-daily="chat"]').click();
    await page.locator('[data-workspace="people"]').first().click();
    const exitingPanel = await page.locator('.gal-side').elementHandle();
    const exitAnimation = await page.evaluateHandle(() => {
      const panel = document.querySelector('.gal-side');
      panel.querySelector('[data-workspace="compose"]').click();
      return (
        panel
          .getAnimations()
          .find((animation) => animation.animationName === 'gal-workspace-exit') ?? null
      );
    });
    assert.equal(
      await exitAnimation.evaluate((animation) => animation?.animationName),
      'gal-workspace-exit',
    );
    await page.evaluate(() => window.demo.dispose());
    assert.deepEqual(
      await exitingPanel.evaluate((node) => ({
        connected: node.isConnected,
        hidden: node.hidden,
        inert: node.inert,
        exiting: node.dataset.workspaceExiting,
      })),
      { connected: false, hidden: true, inert: false, exiting: undefined },
      'unmount cancels an in-flight exit and removes its drawer in a clean state',
    );
    assert.equal(await exitAnimation.evaluate((animation) => animation.playState), 'idle');
    assert.deepEqual(errors, []);
    return {
      replayWithoutApi: true,
      chatAndQuickCompose: true,
      workspaceDrawerExit: true,
      workspaceDrawerReopen: true,
      workspaceDrawerReducedMotion: true,
      workspaceFocusRecovery: true,
      workspaceExitCleanup: true,
      partyBeforeRequest: true,
      escapeRespectsPendingPreparation: true,
      equipmentPickerExit: true,
      equipmentPickerRapidReopen: true,
      equipmentPickerReducedMotion: true,
      equipmentPickerFocusRecovery: true,
      equipmentOnly: true,
      responsiveSetup: true,
    };
  } finally {
    releaseScript?.();
    await page.close();
  }
}
