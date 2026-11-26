import assert from 'node:assert/strict';
import path from 'node:path';
import { expect } from 'playwright/test';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { joinPandora } from '../../src/companion-events.js';
import { GUILD_BOUNTIES } from '../../src/guild.js';
import { normalizeInvitationPlan } from '../../src/invitation.js';
import { memoryHash } from '../../src/memory.js';
import { fullInvitation } from '../fixtures/invitation.js';
import { legacySession } from './legacy-session.mjs';
import { openCityDirectory, travelTownScene } from './town-navigation.mjs';
import { chatResponse } from '../../server/chat-response.mjs';

async function assertQuestFolioLayout(detail, { singleLineTitle = false } = {}) {
  const layout = await detail.evaluate((folio) => {
    const bounds = (selector) => folio.querySelector(selector).getBoundingClientRect();
    const description = bounds('.skyrim-folio-desc');
    const location = bounds('.ow-quest-location');
    const divider = bounds('.ow-quest-rule.is-objectives');
    const objectives = bounds('.ow-quest-objectives');
    const reward = bounds('.ow-quest-reward');
    const crest = bounds('.ow-quest-crest');
    const titleElement = folio.querySelector('.skyrim-folio-title');
    const title = titleElement.getBoundingClientRect();
    const headerRule = bounds('.ow-quest-rule.is-title');
    const meta = bounds('.ow-quest-meta');
    return {
      titleCenterError: Math.abs(crest.left + crest.width / 2 - (title.left + title.width / 2)),
      titleHeight: title.height,
      titleLineHeight: Number.parseFloat(getComputedStyle(titleElement).lineHeight),
      metaAfterRule: meta.top >= headerRule.bottom - 1,
      metaLayout: getComputedStyle(folio.querySelector('.ow-quest-meta')).display,
      columnEdgeError: Math.max(
        ...[location, divider, objectives, reward].flatMap((rect) => [
          Math.abs(rect.left - description.left),
          Math.abs(rect.right - description.right),
        ]),
      ),
      objectiveGap: Math.min(divider.top - location.bottom, objectives.top - divider.bottom),
    };
  });
  assert(layout.metaAfterRule, 'quest type and level sit below the title ornament');
  assert.equal(layout.metaLayout, 'flex', 'quest metadata stays grouped into compact text');
  assert(layout.columnEdgeError <= 1, 'briefing, location, objectives and reward share one column');
  assert(layout.titleCenterError <= 1, 'the title remains centered between its symmetric wings');
  if (singleLineTitle) {
    assert(
      layout.titleHeight <= layout.titleLineHeight + 1,
      'the representative desktop bounty title fits on one line between its ornaments',
    );
  }
  assert(layout.objectiveGap > 0, 'the objectives have a distinct visual break');
}

export async function dailyChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1120, height: 700 } });
  page.setDefaultTimeout(12000);
  await legacySession(page);
  const library = newCampaign(defaultProtagonist());
  library.campaign.completed = true;
  library.inventory.summonContracts = 1;
  firstCompanion(library);
  library.campaign.tutorial = 'complete';
  library.progression.settlements = ['settled-a', 'settled-b'];
  joinPandora(library);
  library.daily.tutorial = 'planning';
  library.unlockedDungeons.push('mill');
  Object.assign(library.dining.inventory, { 'frost-oyster': 2, milk: 3 });
  library.relationships['official-libet'] = { affection: 25, gains: 0, agreed: false };
  const nextTopics = [
    '有猫混进早市',
    '找回试琴时遗落的琴弦',
    '广场摊主托人捎来一封信',
    '补完第七小节以后多出一行谱',
  ];
  library.daily.memory.invitationTopics = {
    'official-libet': ['旧的主题'],
    'official-pandora': ['潘多拉的主题'],
  };
  const previousText = '一辆坏在城门口的餐车挡住了路。';
  library.invitationHistory = [
    {
      id: 'previous-invitation',
      member: 'official-libet',
      title: '城门口的餐车',
      text: previousText,
      summary: { text: previousText, sourceHash: memoryHash(previousText) },
    },
  ];
  library.history = [1, 2].map((index) => ({
    runId: `previous-${index}`,
    title: `早先的副本 ${index}`,
    complete: true,
    adventureVersion: 1,
    lines: [{ speaker: '旁白', text: `已经完成第${index}次冒险。` }],
  }));
  await page.addInitScript((value) => {
    if (origin === 'null' || sessionStorage.getItem('daily-seeded')) return;
    localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(value));
    localStorage.setItem(
      'wanxiang.generation-options.v1',
      JSON.stringify({ developerMode: true, skipAiGeneration: false }),
    );
    sessionStorage.setItem('daily-seeded', 'true');
  }, library);
  let rawOutline;
  function mockPlan({ city, startScene, allowedScenes }) {
    assert.equal(city, 'starbell');
    assert.equal(startScene, 'starbell-guild');
    assert.ok(Object.hasOwn(allowedScenes, 'market'));
    assert.ok(Object.hasOwn(allowedScenes, 'starbell-market'));
    assert.ok(!Object.hasOwn(allowedScenes, 'tavern'));
    const outline = {
      ...fullInvitation,
      stages: fullInvitation.stages.map((stage, index) => ({
        ...stage,
        scene: index === 0 || index === 1 ? startScene : index === 2 ? 'market' : stage.scene,
        environment: stage.description,
      })),
      finale: {
        ...fullInvitation.finale,
        scene: 'starbell-market',
        environment: fullInvitation.finale.title,
      },
    };
    outline.stages[0] = {
      ...outline.stages[0],
      environment: outline.stages[0].description.repeat(22),
    };
    const plan = normalizeInvitationPlan(outline, {
      allowedScenes,
      startScene,
      requireChoices: true,
    });
    rawOutline = `<wanxiang_json>${JSON.stringify(outline)}</wanxiang_json>`;
    return plan;
  }
  const calls = [];
  const summaries = [];
  let firstRevision;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const cityLead = fullInvitation.stages[0].description;
  const cityReply = '【旁白】广场的钟声响了。';
  let cityChatInput;
  await page.route('**/api/ai/generate/chat', async (route) => {
    const input = route.request().postDataJSON();
    if (input.place === 'market') cityChatInput = input;
    const output =
      input.place === 'market' ? `【环境】${cityLead}【环境结束】${cityReply}` : cityReply;
    return route.fulfill({
      json: {
        ...(await chatResponse('chat', `<wanxiang_output>${output}</wanxiang_output>`, [], input)),
        request: { tokens: { inputEstimate: 20 }, warnings: [] },
        usage: { input: 20, output: 7 },
      },
    });
  });
  await page.route('**/api/ai/summary/plan', (route) => {
    const { items } = route.request().postDataJSON();
    return route.fulfill({ json: { batches: [{ ids: items.map((item) => item.id) }] } });
  });
  await page.route('**/api/ai/generate/summary', (route) => {
    const { items } = route.request().postDataJSON();
    summaries.push(items);
    return route.fulfill({
      json: { items: items.map((item) => ({ id: item.id, summary: `回忆：${item.label}。` })) },
    });
  });
  const longIntent = '我们可以沿着城市街道慢慢走，聊聊接下来想去的地点与沿途见闻。'
    .repeat(120)
    .slice(0, 1900);
  await page.route('**/api/ai/generate/script', async (route) => {
    const { invitation, invitationTopics, party, playerIntent } = route.request().postDataJSON();
    if (invitationTopics) {
      assert.equal(invitationTopics.title, fullInvitation.title);
      assert.match(invitationTopics.transcript, /把最后一小节留在琴谱上/);
      return route.fulfill({ json: { topics: nextTopics } });
    }
    calls.push('script');
    assert.equal(playerIntent, longIntent);
    assert.equal(invitation.member, 'official-libet');
    assert.match(
      party.find((person) => person.id === invitation.member).invitationMemory,
      /餐车挡住了路/,
    );
    const plan = mockPlan(invitation);
    await route.fulfill({
      json: {
        diagnostic: { rawText: rawOutline },
        request: { warnings: ['diagnostic only'] },
        invitation: plan,
      },
    });
  });
  await page.route('**/api/ai/generate/quick-chat', (route) => {
    const { invitation, dialogueScenes } = route.request().postDataJSON();
    calls.push(invitation.stageId);
    const [nextScene] = dialogueScenes;
    const first = nextScene.lines[0];
    let revised;
    if (invitation.stageId === 'stage-1' && !invitation.previous.length) {
      assert.equal(nextScene.id, 'stage-2');
      firstRevision = nextScene.revision;
      revised = '莉贝特用指节敲了一遍刚才说好的节拍。';
    }
    if (invitation.stageId === 'stage-1' && invitation.previous.length) {
      assert.notEqual(nextScene.revision, firstRevision);
      assert.match(first.text, /说好的节拍/);
    }
    if (invitation.stageId === 'stage-3') {
      assert.equal(nextScene.id, 'finale');
      revised = first.text + '她把你说的停顿也记了下来。';
    }
    return route.fulfill({
      json: {
        content: '【对白:official-libet】好啊，一起走吧。',
        invitation: {
          stageId: invitation.stageId,
          score: 5,
          completed: [
            invitation.stageId === 'stage-1' && invitation.previous.length ? 'goal-2' : 'goal-1',
          ],
          note: '莉贝特听取了玩家的建议。',
        },
        ...(revised
          ? {
              dialogue: [
                {
                  id: nextScene.id,
                  revision: nextScene.revision,
                  patches: [{ op: 'replace', id: first.id, speaker: first.speaker, text: revised }],
                },
              ],
            }
          : {}),
      },
    });
  });
  async function clearGal(until) {
    for (let attempts = 0; attempts < 240; attempts++) {
      if (await until()) return;
      await page.evaluate(() => {
        const stage = document.querySelector('#gal-stage');
        if (
          !stage?.hidden &&
          stage?.dataset.leaving !== 'true' &&
          stage?.dataset.playing !== 'false'
        )
          stage.querySelector('.gal-page').click();
      });
      await page.waitForTimeout(55);
    }
    throw Error('Gal 未到达预期停顿');
  }
  const status = () => page.locator('.daily-status').textContent();
  const questHandle = page.locator('#ledger-quests-open');
  const journal = page.locator('#tavern-quests');
  async function settleJournal() {
    await expect(journal.locator('.skyrim-journal-grid')).toBeVisible();
    await journal.evaluate((dialog) =>
      Promise.all(
        dialog
          .getAnimations({ subtree: true })
          .filter(({ effect }) => Number.isFinite(effect?.getComputedTiming().endTime))
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    const bounds = await journal.evaluate((dialog) => {
      const rect = dialog.getBoundingClientRect();
      const surface = getComputedStyle(dialog).backgroundColor;
      const backdrop = getComputedStyle(dialog, '::backdrop').backgroundImage;
      const alpha = (color) => Number(color.match(/rgba\([^)]*,\s*([\d.]+)\s*\)$/)?.[1] ?? 1);
      const gradientAlphas = (backdrop.match(/rgba?\([^)]*\)/g) || []).map(alpha);
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        surfaceAlpha: alpha(surface),
        gradientAlphas,
      };
    });
    assert(
      Math.abs(bounds.centerX - bounds.viewportWidth / 2) <= 1 &&
        Math.abs(bounds.centerY - bounds.viewportHeight / 2) <= 1,
      `task journal stays centered: ${JSON.stringify(bounds)}`,
    );
    assert(bounds.left >= 0 && bounds.top >= 0, 'task journal stays within the viewport');
    assert(
      bounds.right <= bounds.viewportWidth && bounds.bottom <= bounds.viewportHeight,
      'task journal does not extend outside the viewport',
    );
    assert(bounds.surfaceAlpha > 0 && bounds.surfaceAlpha < 1, 'journal surface is translucent');
    assert(
      bounds.gradientAlphas.some((alpha) => alpha > 0) &&
        bounds.gradientAlphas.every((alpha) => alpha < 1),
      'backdrop is tinted without painting an opaque layer',
    );
  }
  async function checkInvitationComposer(suffix) {
    await page
      .locator('.gal-composer')
      .evaluate((node) =>
        Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {}))),
      );
    const layout = await page.locator('#daily-invitation').evaluate((form) => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const input = box('#invite-input');
      const replyRow = form.querySelector('.invite-reply');
      const reply = replyRow.getBoundingClientRect();
      const meta = box('.invite-meta');
      const end = box('[data-invite-end]');
      const send = box('#invite-send');
      const gap = Number.parseFloat(getComputedStyle(replyRow).columnGap) || 0;
      return {
        widths: {
          viewport: document.documentElement.clientWidth,
          row: reply.width,
          input: input.width,
          send: send.width,
          gap,
          available: reply.width - send.width - gap,
        },
        sendWithinReply: input.left >= reply.left - 1 && send.right <= reply.right + 1,
        fieldHeight: input.height,
        metaAbove: meta.bottom <= input.top && end.bottom <= input.top,
        sendBesideField: send.left >= input.right && Math.abs(send.bottom - input.bottom) < 2,
        toolbarBelow: box('.gal-actionbar').top >= input.bottom,
        recordAbove: box('.daily-invitation-record').bottom <= box('.gal-composer').top,
        sendIcon: Boolean(form.querySelector('#invite-send svg')),
      };
    });
    const { viewport, row, input, available } = layout.widths;
    const widths = JSON.stringify(layout.widths);
    if (suffix === 'portrait') {
      assert(row >= viewport * 0.75, `portrait reply row uses at least 75% of viewport: ${widths}`);
    }
    assert(
      available > 0 && input / available >= 0.9,
      `${suffix} input fills the width available beside the send control: ${widths}`,
    );
    assert(layout.sendWithinReply, suffix + ' input and send control stay within their row');
    assert(layout.fieldHeight >= 100, suffix + ' input stays multiline');
    assert(layout.metaAbove, suffix + ' progress and end action stay above the input');
    assert(layout.sendBesideField && layout.sendIcon, suffix + ' uses the Gal send icon');
    assert(layout.toolbarBelow, suffix + ' text entry and the Gal toolbar do not overlap');
    assert(layout.recordAbove, suffix + ' the task list and Gal composer do not overlap');
    await page.screenshot({ path: path.join(output, 'invitation-' + suffix + '.png') });
  }
  async function pullOpenLedger() {
    if (await page.locator('#ledger-drawer-host.is-open').count()) return;
    if (await page.locator('#ledger-drawer-host.is-closing').count()) {
      await page.clock.fastForward(350);
    }
    await page.locator('#ledger-handle').waitFor({ state: 'visible' });
    const handle = await page.locator('#ledger-handle').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(Math.max(10, handle.x - 140), handle.y + handle.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await page.locator('#ledger-drawer-host.is-open').waitFor();
  }
  try {
    await page.clock.install();
    await page.goto(baseURL + '/?display=landscape');
    const frame = page.frameLocator('#inn-frame iframe');
    const actions = page.locator('.daily-dock button');
    assert.deepEqual(await actions.allTextContents(), ['闲聊', '约见', '冒险', '外出']);
    const actionDock = await page.locator('.daily-dock').evaluate((dock) => {
      const buttons = [...dock.querySelectorAll('button')];
      const widths = buttons.map((button) => button.getBoundingClientRect().width);
      return {
        width: dock.getBoundingClientRect().width,
        height: dock.getBoundingClientRect().height,
        equalWidths: widths.every((width) => Math.abs(width - widths[0]) < 1),
      };
    });
    assert(actionDock.width >= 848 && actionDock.width <= 850);
    assert(actionDock.height >= 60 && actionDock.height <= 64);
    assert(actionDock.equalWidths, 'the four bottom actions share equal button widths');
    assert.match(await page.locator('[data-tavern-clock]').textContent(), /1463年8月24日 · 上午/);
    await pullOpenLedger();
    assert.match(await page.locator('[data-ledger-date]').textContent(), /1463年8月24日 · 上午/);
    await expect(questHandle).toBeHidden();
    const mealTile = page.locator('.ledger-tile [data-daily="meal"]');
    await mealTile.waitFor({ state: 'visible' });
    assert.equal(await mealTile.textContent(), '用餐');
    await page.locator('[data-daily="promotion"]').click();
    await page.locator('#tavern-promotion[open]').waitFor();
    await page.clock.fastForward(350);
    assert(await page.locator('[data-promotion-confirm]').isDisabled());
    await page.screenshot({ path: path.join(output, 'promotion-panel.png') });
    await page.locator('[data-promotion-close]').click();
    await page.locator('#tavern-promotion').waitFor({ state: 'hidden' });
    const openLedger = page.locator('#ledger-drawer-host.is-open');
    assert.equal(await page.locator('.ledger-tile [data-daily="quests"]').count(), 0);
    if (await openLedger.count()) await openLedger.locator('#ledger-close').click();
    // Restore the separate quest entry after the ledger has fully closed.
    await expect(page.locator('#ledger-drawer-host')).toBeHidden();
    await expect(questHandle).toBeVisible();
    const taskPlacement = await questHandle.evaluate((button) => {
      const bounds = button.getBoundingClientRect();
      const drawer = document.querySelector('#ledger-drawer');
      return {
        right: innerWidth - bounds.right,
        centerY: bounds.top + bounds.height / 2,
        viewportCenterY: innerHeight / 2,
        parentTag: button.parentElement?.tagName,
        inDrawer: drawer?.contains(button) ?? false,
      };
    });
    assert(
      Math.abs(taskPlacement.right) <= 1 &&
        Math.abs(taskPlacement.centerY - taskPlacement.viewportCenterY - 128) <= 1,
      `task entry sits on the lower right edge: ${JSON.stringify(taskPlacement)}`,
    );
    assert.equal(taskPlacement.parentTag, 'BODY');
    assert.equal(taskPlacement.inDrawer, false);
    await questHandle.click();
    await expect(journal.getByRole('heading', { name: '任务日志' })).toBeVisible();
    const journalNeedle = journal.locator('.ow-quest-header-needle');
    await expect(journalNeedle).toBeVisible();
    await expect(journalNeedle).toHaveAttribute('aria-hidden', 'true');
    await expect(journalNeedle).toHaveCSS('pointer-events', 'none');
    await settleJournal();
    await expect(journal.locator('.skyrim-quest-empty')).toHaveText('暂无任务记录');
    assert.equal(await journal.locator('.skyrim-quest-tab').count(), 0);
    assert.equal(await journal.locator('[data-quest-focus="accept"]').count(), 0);
    await page.screenshot({ path: path.join(output, 'quests-panel.png') });
    await journal.getByRole('button', { name: '关闭任务日志' }).click();
    await expect(journal).toBeHidden();
    await pullOpenLedger();
    await page.locator('#inn-backpack-open').click();
    await page.locator('#inn-backpack[open]').waitFor();
    await page.clock.fastForward(350);
    await page.locator('#inn-backpack [data-bag-tab="ingredients"]').click();
    assert.match(await page.locator('#inn-backpack').textContent(), /鲜奶|霜脆蕈/);
    await page.locator('#inn-backpack [data-bag-tab="potions"]').click();
    await page.screenshot({ path: path.join(output, 'inn-backpack.png') });
    await page.locator('#inn-backpack .bag-close').click();
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await page.screenshot({ path: path.join(output, 'daily-actions.png') });
    await page.locator('[data-daily="dungeon"]').click();
    await page.locator('#destination-dialog[open]').waitFor();
    await page.locator('#destination-close').click();
    await pullOpenLedger();
    await page.locator('[data-daily="service"]').click();
    await page.locator('#daily-setup[open]').waitFor();
    assert.match(await page.locator('#daily-setup .tv-crest-card').textContent(), /LV\.?1/);
    await page.locator('[data-daily-start]').click();
    const service = page.locator('#daily-service');
    await service.waitFor({ state: 'visible' });
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.shift.mode), 'live');
    for (let i = 0; i < 6 && !(await service.locator('[data-live-seat]').count()); i++) {
      await page.clock.fastForward(400);
    }
    await service.locator('[data-live-seat]').first().click();
    await service.locator('[data-live-table="0"]').click();
    await service.locator('[data-live-minigame="0"]').waitFor();
    await service.locator('[data-live-minigame="0"]').click();
    await service.locator('.ls-modal-game [data-activity]').waitFor();
    await service.locator('[data-live="mg-close"]').click();
    for (let i = 0; i < 3 && (await service.locator('[data-live-boost="0"]').count()); i++) {
      await service.locator('[data-live-boost="0"]').click();
    }
    await service.locator('.ls-pass [data-live-plate]').first().waitFor();
    await page.screenshot({ path: path.join(output, 'daily-service.png') });
    await service.locator('[data-live-table="0"]').click();
    for (let i = 0; i < 20 && !(await service.locator('[data-live-table="0"].pay').count()); i++) {
      await page.clock.fastForward(200);
    }
    await service.locator('[data-live-table="0"].pay').waitFor();
    await service.locator('[data-live-table="0"]').click();
    await service.locator('[data-live="end"]').click();
    await service.locator('[data-live="settle-done"]').waitFor();
    await page.screenshot({ path: path.join(output, 'daily-service-settle.png') });
    await service.locator('[data-live="settle-done"]').click();
    assert.match(await status(), /本班接待 1 桌/);
    assert.match(await status(), /收入 \d+ 金币/);
    assert.match(await page.locator('[data-tavern-clock]').textContent(), /中午/);
    await page.locator('[data-daily="outing"]').click();
    await page.locator('#tavern-exit-picker[open]').waitFor();
    await page.locator('[data-tavern-exit="city-center"]').click();
    const actionDockElement = page.locator('.daily-dock');
    const exitingDock = await actionDockElement.evaluate((dock) => ({
      hidden: dock.hidden,
      inert: dock.inert,
      running: dock.getAnimations().some((animation) => animation.playState === 'running'),
    }));
    assert.deepEqual(exitingDock, { hidden: false, inert: true, running: true });
    await page.clock.fastForward(170);
    await expect(actionDockElement).toBeHidden();
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.definition
          ?.id === 'city-center',
      null,
      { timeout: 60000 },
    );
    assert.equal(
      await page.frameLocator('#inn-frame iframe').locator('#street-return').innerText(),
      '返回酒馆',
    );
    assert.equal(await frame.locator('#street-map[open]').count(), 0);
    await frame.locator('#street-map-open').click();
    await frame.locator('#street-map-workshop').click();
    await page.locator('#workshop-dialog[open]:not([data-loading])').waitFor();
    await page.locator('[data-ws-close]').click();
    await frame.locator('#street-map .street-map-close [type="submit"]').click();
    await page.locator('[data-daily="companions"]').click();
    const partyPanel = page.locator('#party-panel');
    await expect(partyPanel).toHaveAttribute('open', '');
    const ledgerHost = page.locator('#ledger-drawer-host');
    await partyPanel.locator('#ledger-handle').click();
    await expect(ledgerHost).toHaveClass(/is-open/);
    const speedToggle = page.locator('#ledger-speed-toggle');
    await speedToggle.click();
    assert.match(await speedToggle.textContent(), /×2/);
    await expect(ledgerHost).toHaveClass(/is-open/);
    await speedToggle.click();
    assert.match(await speedToggle.textContent(), /×1/);
    await expect(ledgerHost).toHaveClass(/is-open/);
    await page.locator('.ledger-backdrop').click({ position: { x: 8, y: 8 } });
    await expect(partyPanel).toHaveAttribute('open', '');
    await page.clock.fastForward(350);
    await expect(ledgerHost).toBeHidden();
    if (await page.locator('#prepare-pool [data-prepare-hero="official-edith"]').count()) {
      await page
        .locator('#prepare-pool [data-prepare-hero="official-edith"]')
        .dragTo(page.locator('.prepare-slot:not([data-prepare-hero])').first());
    }
    await page.locator('#prepare-done').click();
    await expect(ledgerHost).toBeHidden();
    assert(
      (await page.evaluate(() => demo.getLibrary().daily.active.companions)).includes(
        'official-edith',
      ),
    );
    assert.match(await status(), /已行 0 回合/);
    await travelTownScene(page, 'market');
    assert.match(await status(), /已行 1 回合/);
    const streetTalk = frame.locator('#scene-talk');
    await streetTalk.waitFor({ state: 'visible' });
    const streetGeometry = await page.evaluate(() => {
      const iframe = document.querySelector('#inn-frame iframe');
      const ir = iframe.getBoundingClientRect();
      const fd = iframe.contentDocument;
      const toScreen = (r) => ({
        left: ir.left + r.left,
        top: ir.top + r.top,
        right: ir.left + r.right,
        bottom: ir.top + r.bottom,
        width: r.width,
        height: r.height,
      });
      const dock = toScreen(fd.querySelector('.street-actions').getBoundingClientRect());
      const talk = toScreen(fd.querySelector('#scene-talk').getBoundingClientRect());
      const mapBtn = toScreen(fd.querySelector('#street-map-open').getBoundingClientRect());
      const cityDirectory = document
        .querySelector('#ledger-city-directory-open')
        .getBoundingClientRect();
      const retBtn = toScreen(fd.querySelector('#street-return').getBoundingClientRect());
      const hud = document.querySelector('#hud-plaque').getBoundingClientRect();
      const daily = document.querySelector('.daily-status').getBoundingClientRect();
      const dockIcons = fd.querySelectorAll('.street-actions svg').length;
      const returnText = fd.querySelector('#street-return').textContent.trim();
      const hotspotCount = fd.querySelectorAll('#street-points .street-point').length;
      const visitorsCount = iframe.contentWindow.streetPreview.visitors().characters.length;
      return {
        dock,
        talk,
        mapBtn,
        cityDirectory,
        retBtn,
        hud,
        daily,
        dockIcons,
        returnText,
        hotspotCount,
        visitorsCount,
        vh: window.innerHeight,
      };
    });
    assert.equal(streetGeometry.dockIcons, 0);
    assert.equal(streetGeometry.returnText.includes('↶'), false);
    assert.equal(streetGeometry.hotspotCount, 0);
    assert.equal(streetGeometry.visitorsCount, 0);
    assert(
      Math.abs(streetGeometry.talk.width - streetGeometry.mapBtn.width) < 2 &&
        Math.abs(streetGeometry.mapBtn.width - streetGeometry.retBtn.width) < 2 &&
        Math.abs(streetGeometry.talk.height - streetGeometry.mapBtn.height) < 2 &&
        streetGeometry.cityDirectory.width > 0,
      `Dock buttons match unified proportions: ${JSON.stringify(streetGeometry)}`,
    );
    assert(
      streetGeometry.dock.top > streetGeometry.vh - 90 &&
        streetGeometry.talk.left >= streetGeometry.dock.left - 2 &&
        streetGeometry.talk.right <= streetGeometry.mapBtn.left + 2 &&
        Math.abs(streetGeometry.talk.top - streetGeometry.mapBtn.top) < 8 &&
        Math.abs(streetGeometry.mapBtn.top - streetGeometry.retBtn.top) < 4,
      `Outdoor dock buttons align at bottom center: ${JSON.stringify(streetGeometry)}`,
    );
    const outingStatus = page.locator('#daily-hud .daily-status');
    await expect(outingStatus).toBeVisible();
    const outingBeforeDirectory = await page.evaluate(() => ({
      scene: demo.getLibrary().daily.active.scene,
      turns: demo.getLibrary().daily.active.turns,
    }));
    const cityDirectory = await openCityDirectory(page);
    await expect(page.locator('#ledger-city-directory-open')).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await expect(outingStatus).toBeHidden();
    assert.equal(await streetTalk.isVisible(), false);
    const directoryList = cityDirectory.locator('#street-city-submap-canvas');
    const directoryScroll = await directoryList.evaluate((list) => {
      const bounds = list.closest('dialog').getBoundingClientRect();
      return {
        bounded: bounds.top >= 0 && bounds.bottom <= innerHeight,
        distance: list.scrollHeight - list.clientHeight,
        categories: [...list.querySelectorAll('[data-city-category]')].map(
          (category) => category.dataset.cityCategory,
        ),
      };
    });
    assert(directoryScroll.bounded, 'the city directory stays within the viewport');
    assert(directoryScroll.distance > 0, 'the city directory uses its own bounded scroll region');
    assert.deepEqual(directoryScroll.categories, ['places', 'facilities', 'dungeons']);
    await page.screenshot({ path: path.join(output, 'city-directory.png') });
    await directoryList.hover();
    await page.mouse.wheel(0, directoryScroll.distance + 80);
    await expect
      .poll(() =>
        directoryList.evaluate((list) => list.scrollHeight - list.clientHeight - list.scrollTop),
      )
      .toBeLessThanOrEqual(1);
    await frame.locator('#street-city-submap-close').click();
    await expect(page.locator('#ledger-city-directory-open')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        scene: demo.getLibrary().daily.active.scene,
        turns: demo.getLibrary().daily.active.turns,
      })),
      outingBeforeDirectory,
      'opening and closing the city directory does not advance the outing',
    );
    await streetTalk.waitFor({ state: 'visible' });
    await expect(outingStatus).toBeVisible();
    assert(
      streetGeometry.daily.top >= streetGeometry.hud.bottom - 1 &&
        Math.abs(streetGeometry.daily.left - streetGeometry.hud.left) <= 2 &&
        streetGeometry.daily.top < 140 &&
        streetGeometry.daily.left < 60,
      `Outing status ribbon sits cleanly at top-left below placard: ${JSON.stringify(streetGeometry)}`,
    );
    await page.screenshot({ path: path.join(output, 'street-dock.png') });
    await streetTalk.click();
    const cityGal = page.locator('#gal-stage[data-workspace="chat"]');
    const cityEnvironment = cityGal.locator('.scene-environment');
    await expect(cityGal).toBeVisible();
    await expect(cityEnvironment).toBeHidden();
    await expect(cityGal.locator('.gal-bg[src]')).toHaveCount(0);
    await cityGal.locator('[data-workspace="people"]').click();
    await expect(cityGal.locator('.chat-location-value')).toBeVisible();
    await expect(cityGal.locator('.chat-location-value')).toHaveText('星钟商业街');
    await expect(cityGal.locator('#chat-place-select')).toBeHidden();
    await expect(cityGal.locator('#chat-place-select')).toHaveValue('market');
    await cityGal.locator('#chat-place-select').evaluate((select) => {
      select.value = 'table';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await expect(cityGal.locator('#chat-place-select')).toHaveValue('market');
    await cityGal.locator('.gal-side [data-workspace="compose"]').click();
    await cityGal.locator('#chat-input').fill('想在这儿聊一会儿。');
    await cityGal.locator('#chat-send').click();
    await expect(cityEnvironment).toHaveAttribute('data-place', 'market');
    await expect(cityEnvironment.locator('.scene-environment-text')).toHaveText(cityLead);
    await page.clock.fastForward(2500);
    await expect(cityEnvironment).toHaveAttribute('data-state', 'docked');
    await expect(cityEnvironment.locator('img')).toHaveCount(0);
    await expect(cityGal.locator('.gal-bg[src]')).toHaveCount(0);
    assert.equal(cityChatInput.place, 'market');
    assert.ok(cityChatInput.timeOfDay);
    await expect(cityEnvironment).toHaveAttribute('data-state', 'docked');
    await page.screenshot({ path: path.join(output, 'city-chat-environment.png') });
    await clearGal(() => cityGal.locator('#chat-input').isVisible());
    assert.equal(await page.evaluate(() => demo.getLibrary().tavernChat.at(-1).content), cityReply);
    await cityGal.locator('[data-gal="close"]').click();
    await expect(cityGal).toBeHidden();
    assert.match(await status(), /已行 2 回合/);
    await travelTownScene(page, 'outskirts');
    assert.match(await status(), /已行 4 回合/);
    assert.equal(await frame.locator('[data-hotspot="road-meadow"]').count(), 0);
    await page.locator('[data-daily="home"]').click();
    const reopenedDock = await page.locator('.daily-dock').evaluate((dock) => ({
      hidden: dock.hidden,
      inert: dock.inert,
      exiting: dock.getAnimations().some((animation) => !animation.animationName),
    }));
    assert.deepEqual(reopenedDock, { hidden: false, inert: false, exiting: false });
    await page.locator('[data-daily="invitation"]').click();
    await page.locator('[data-daily-person="official-libet"]').click();
    await page.locator('[data-daily-activity="walk"]').click();
    assert.equal(summaries.length, 0, 'two completed dungeons alone do not start a batch');
    const invitationSetup = page.locator('#daily-setup[data-kind="invitation"]');
    await expect(invitationSetup.locator('.daily-invite-destination img')).toBeVisible();
    await expect(invitationSetup.locator('[data-daily-person="official-libet"] img')).toBeVisible();
    await expect(invitationSetup.locator('[data-daily-activity="walk"]')).toBeFocused();
    const openingPlace = invitationSetup.locator('[data-daily-place]');
    assert.notEqual(await openingPlace.inputValue(), 'starbell-guild');
    await openingPlace.selectOption('starbell-guild');
    assert.equal(await openingPlace.inputValue(), 'starbell-guild');
    const invitationIntent = invitationSetup.locator('[data-daily-intent]');
    const invitationStart = invitationSetup.locator('[data-daily-start]');
    await page.setViewportSize({ width: 390, height: 844 });
    await invitationIntent.fill(longIntent);
    assert.equal(await invitationIntent.inputValue(), longIntent);
    assert.deepEqual(
      await invitationIntent.evaluate((node) => {
        node.scrollTop = node.scrollHeight;
        return {
          scrolls: node.scrollHeight > node.clientHeight,
          reachesEnd: node.scrollTop + node.clientHeight >= node.scrollHeight - 1,
        };
      }),
      { scrolls: true, reachesEnd: true },
      'long appointment intent remains scrollable to its final line',
    );
    await invitationSetup.locator('[data-daily-close]').focus();
    await page.keyboard.press('Tab');
    await expect(invitationSetup.locator('[data-daily-city]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(invitationSetup.locator('[data-daily-place]')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(invitationSetup.locator('[data-daily-person]').first()).toBeFocused();
    let sawActivity = false;
    let sawTopic = false;
    for (
      let step = 0;
      step < 40 && !(await invitationStart.evaluate((node) => node === document.activeElement));
      step++
    ) {
      await page.keyboard.press('Tab');
      const focused = await invitationSetup.evaluate((dialog) => {
        const active = dialog.ownerDocument.activeElement;
        const body = dialog.querySelector('.daily-setup-body');
        const bounds = active.getBoundingClientRect();
        const bodyBounds = body.getBoundingClientRect();
        return {
          inDialog: dialog.contains(active),
          inBody: body.contains(active),
          activeVisible: bounds.top >= bodyBounds.top && bounds.bottom <= bodyBounds.bottom,
          activity: active.matches('[data-daily-activity]'),
          topic: active.matches('[data-daily-topic]'),
          start: active.matches('[data-daily-start]'),
          horizontalOverflow: body.scrollWidth > body.clientWidth,
        };
      });
      assert(focused.inDialog, 'keyboard focus remains inside the modal');
      if (focused.inBody)
        assert(focused.activeVisible, 'focused control stays within the scroll viewport');
      assert.equal(focused.horizontalOverflow, false, 'long intent text does not widen the setup');
      sawActivity ||= focused.activity;
      sawTopic ||= focused.topic;
      if (focused.start) break;
    }
    assert(sawActivity, 'Tab reaches appointment activities');
    assert(sawTopic, 'Tab reaches available topics');
    await expect(invitationStart).toBeFocused();
    await expect(invitationStart).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: path.join(output, 'invitation-setup-phone.png') });
    await invitationStart.press('Enter');
    const compose = page.locator('#daily-invitation textarea');
    const ready = () =>
      compose.evaluate((field) => {
        const composer = field.closest('.gal-composer');
        const stage = field.closest('#gal-stage');
        return (
          !field.disabled &&
          !composer?.hidden &&
          !composer?.inert &&
          !composer?.hasAttribute('data-workspace-exiting') &&
          !stage?.hidden &&
          stage?.dataset.playing === 'false' &&
          stage?.dataset.leaving !== 'true'
        );
      });
    const record = page.locator('.daily-invitation-record');
    await page.locator('#gal-stage > .daily-invitation-record').waitFor();
    assert.match(await record.textContent(), /眼下.*拿出一张没写完的琴谱/s);
    assert.equal(await record.locator('.daily-invitation-tasks').count(), 0);
    await page.waitForFunction(() =>
      document.querySelector('.gal-text')?.textContent.startsWith('莉贝特'),
    );
    assert.equal(
      await frame.locator('.scene-environment-text').textContent(),
      fullInvitation.stages[0].description.repeat(22),
    );
    assert.equal(await frame.locator('.scene-environment img').count(), 0);
    await clearGal(ready);
    assert.match(await record.textContent(), /来意.*莉贝特想请你.*眼下.*听听这首曲子差在哪儿/s);
    assert.equal(await record.locator('section p').first().innerText(), fullInvitation.premise);
    assert.deepEqual(await record.locator('li').allTextContents(), fullInvitation.stages[0].tasks);
    const transcript = page.getByRole('region', { name: '本次对话' });
    const historyButton = page.getByRole('button', { name: '本次对话' });
    await historyButton.click();
    const firstLine = transcript
      .locator('li')
      .filter({ hasText: '我原想在你来之前补上最后一句' })
      .first();
    assert.equal(await firstLine.locator('strong').textContent(), '莉贝特');
    assert.equal(await transcript.locator('li strong').first().textContent(), '旁白');
    await transcript.getByRole('button', { name: '返回演出' }).click();
    await record.getByText('眼下', { exact: true }).click();
    assert.notEqual(await page.locator('#gal-stage').getAttribute('data-leaving'), 'true');
    await pullOpenLedger();
    await page.locator('#ledger-raw-btn').click();
    const rawDialog = page.locator('#latest-api-response');
    assert.equal(await rawDialog.locator('textarea').inputValue(), rawOutline);
    await rawDialog.getByRole('button', { name: '关闭原始回复' }).click();
    await checkInvitationComposer('portrait');
    const choices = page.locator('[data-invite-choice]');
    assert.deepEqual(await choices.allTextContents(), fullInvitation.stages[0].choices);
    const environmentCard = frame.locator('.scene-environment');
    await expect(environmentCard).toHaveAttribute('data-state', 'docked');
    await environmentCard.evaluate((node) => {
      const states = [];
      const observer = new MutationObserver((records) => {
        states.push(...records.map((record) => record.oldValue));
      });
      observer.observe(node, {
        attributes: true,
        attributeFilter: ['data-state'],
        attributeOldValue: true,
      });
      window.finishEnvironmentProbe = () => {
        observer.disconnect();
        delete window.finishEnvironmentProbe;
        return states;
      };
    });
    await choices.first().click();
    await clearGal(async () => (await ready()) && (await record.locator('li small').count()) === 1);
    assert.deepEqual(
      await environmentCard.evaluate(() => window.finishEnvironmentProbe()),
      [],
      'a reply at the same venue must not replay the environment introduction',
    );
    assert.match(await record.locator('li').first().textContent(), /听莉贝特试奏一遍.*已完成/);
    await historyButton.click();
    const playerLine = transcript.locator('li').filter({ hasText: '我们一起走到广场吧。' });
    assert.equal(await playerLine.locator('strong').textContent(), '青缘');
    assert.equal(await transcript.locator('li strong').last().textContent(), '莉贝特');
    await transcript.getByRole('button', { name: '返回演出' }).click();
    await expect(transcript).toBeHidden();
    await clearGal(ready);
    await expect(compose).toBeEditable();
    assert.equal(await page.evaluate(() => demo.saveSlot('slot2')), true);
    await compose.fill('刚才第七小节有个停顿。');
    await page.locator('#daily-invitation [type="submit"]').click();
    await clearGal(
      async () =>
        (await ready()) &&
        (await page.locator('.invite-progress').textContent()).includes('第 2/3 幕'),
    );
    assert.match(await record.textContent(), /想想曲子适合在哪里响起/);
    await page.setViewportSize({ width: 844, height: 390 });
    await checkInvitationComposer('landscape');
    await historyButton.click();
    assert.match(await transcript.locator('li p').first().textContent(), /说好的节拍/);
    assert.doesNotMatch(await transcript.textContent(), /我们一起走到广场吧。/);
    assert(
      await transcript
        .locator('li strong')
        .first()
        .evaluate((speaker) => {
          const { x, y, width, height } = speaker.getBoundingClientRect();
          return document.elementFromPoint(x + width / 2, y + height / 2) === speaker;
        }),
      'the first speaker is visible over the invitation task panel',
    );
    await page.screenshot({ path: path.join(output, 'invitation-dialogue.png') });
    await transcript.getByRole('button', { name: '返回演出' }).click();
    await compose.fill('我想听你在这里弹一小段。');
    await page.locator('#daily-invitation [type="submit"]').click();
    await clearGal(async () => (await status()).includes('结束约见') && (await compose.isHidden()));
    const inviteGo = page.locator('[data-daily="invite-go"]');
    await expect(inviteGo).toBeEnabled();
    const invitationRunLocation = () =>
      page.evaluate(() => {
        const { scene, destination, arriving } = demo.getLibrary().daily.active.run;
        return { scene, destination, arriving: Boolean(arriving) };
      });
    assert.deepEqual(await invitationRunLocation(), {
      scene: 'starbell-guild',
      destination: 'market',
      arriving: false,
    });
    let failedMarketNavigation = false;
    const streetRoute = /\/street\.html(?:\?.*)?$/;
    await page.route(streetRoute, async (route) => {
      const url = new URL(route.request().url());
      if (!failedMarketNavigation && url.searchParams.get('scene') === 'market') {
        failedMarketNavigation = true;
        await route.abort();
        return;
      }
      await route.continue();
    });
    const failedMarketRequest = page.waitForEvent('requestfailed', (request) => {
      const url = new URL(request.url());
      return url.pathname.endsWith('/street.html') && url.searchParams.get('scene') === 'market';
    });
    await inviteGo.click();
    await failedMarketRequest;
    assert.equal(failedMarketNavigation, true);
    await expect(inviteGo).toBeDisabled();
    assert.deepEqual(await invitationRunLocation(), {
      scene: 'starbell-guild',
      destination: 'market',
      arriving: true,
    });
    await page.clock.fastForward(30_001);
    await expect(inviteGo).toBeEnabled();
    assert.deepEqual(await invitationRunLocation(), {
      scene: 'starbell-guild',
      destination: 'market',
      arriving: false,
    });
    await page.waitForFunction(
      () => {
        const win = document.querySelector('#inn-frame iframe')?.contentWindow;
        return win?.modelReady === true && win.streetPreview?.definition?.id === 'city-center';
      },
      null,
      { timeout: 60000 },
    );
    await inviteGo.click();
    await page.waitForFunction(
      () => {
        const win = document.querySelector('#inn-frame iframe')?.contentWindow;
        return win?.modelReady === true && win.streetPreview?.definition?.id === 'market';
      },
      null,
      { timeout: 60000 },
    );
    await page.waitForFunction(() => {
      const run = demo.getLibrary().daily.active.run;
      return run.scene === 'market' && !run.destination && !run.arriving;
    });
    assert.deepEqual(await invitationRunLocation(), {
      scene: 'market',
      destination: undefined,
      arriving: false,
    });
    await page.unroute(streetRoute);
    await clearGal(
      async () =>
        (await ready()) &&
        (await page.locator('.invite-progress').textContent()).includes('第 3/3 幕'),
    );
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow.streetPreview?.state()
          .timeOfDay === 'day',
      null,
      { timeout: 60000 },
    );
    await expect(frame.locator('.scene-environment-text')).toHaveText(
      fullInvitation.stages[2].description,
    );
    await compose.fill('这段旋律可以先保留，怎么结尾由你决定。');
    await page.locator('#daily-invitation [type="submit"]').click();
    await clearGal(async () => (await status()).includes('结束约见') && (await compose.isHidden()));
    assert.equal(await page.evaluate(() => demo.saveSlot('slot1')), true);
    const savedRun = (await page.evaluate(() => demo.getLibrary())).daily.active.run;
    const savedState = {
      index: savedRun.index,
      scene: savedRun.scene,
      destination: savedRun.destination,
      unread: JSON.parse(JSON.stringify(savedRun.unread)),
      played: JSON.parse(JSON.stringify(savedRun.played)),
      turns: JSON.parse(JSON.stringify(savedRun.turns)),
      history: JSON.parse(JSON.stringify(savedRun.history)),
    };
    const callsBeforeRestore = calls.length;
    assert.equal(await page.evaluate(() => demo.loadSlot('slot1')), true);
    const restoredRun = (await page.evaluate(() => demo.getLibrary())).daily.active.run;
    assert.equal(restoredRun.index, savedState.index);
    assert.equal(restoredRun.scene, savedState.scene);
    assert.equal(restoredRun.destination, savedState.destination);
    assert.deepEqual(restoredRun.unread, savedState.unread);
    assert.deepEqual(restoredRun.played, savedState.played);
    assert.deepEqual(restoredRun.turns, savedState.turns);
    assert.deepEqual(restoredRun.history, savedState.history);
    await page.waitForFunction(
      () => document.querySelector('#inn-frame iframe')?.contentWindow?.modelReady === true,
    );
    await expect(frame.locator('.scene-environment-text')).toHaveText(
      fullInvitation.stages[2].description,
    );
    await expect(frame.locator('.scene-environment img')).toHaveCount(0);
    await expect(page.locator('#gal-stage')).toBeHidden();
    await expect(compose).toBeHidden();
    assert.equal(calls.length, callsBeforeRestore);
    const finaleGo = page.locator('[data-daily="invite-go"]');
    await expect(finaleGo).toBeEnabled();
    await finaleGo.click();
    await clearGal(
      async () =>
        (await page.locator('#gal-stage .gal-chapter').textContent()) ===
        fullInvitation.finale.title,
    );
    await expect(frame.locator('.scene-environment-text')).toHaveText(fullInvitation.finale.title);
    await expect(frame.locator('.scene-environment img')).toHaveCount(0);
    assert.doesNotMatch(await status(), /事件结束/);
    assert.equal(await record.locator('li').count(), 0);
    await clearGal(async () => (await status()).includes('事件结束'));
    await page.waitForFunction(
      () => demo.getLibrary().daily.memory.invitationTopics['official-libet'].length === 4,
    );
    assert.deepEqual(await page.evaluate(() => demo.getLibrary().daily.memory.invitationTopics), {
      'official-libet': nextTopics,
      'official-pandora': ['潘多拉的主题'],
    });
    assert.deepEqual(calls, ['script', 'stage-1', 'stage-1', 'stage-2', 'stage-3']);
    assert.match(await status(), /事件结束.*个人事件完成/);
    await pullOpenLedger();
    await record.waitFor();
    assert.match(await record.textContent(), /来意.*莉贝特想请你.*结果.*琴谱上/s);
    assert.equal(await record.locator('section p').first().innerText(), fullInvitation.premise);
    assert.equal(await record.locator('section').count(), 2);
    assert.equal(await record.locator('details').count(), 0);
    await page.waitForFunction(
      () =>
        demo.getLibrary().invitationHistory.at(-1)?.id !== 'previous-invitation' &&
        demo.getLibrary().invitationHistory.at(-1)?.summary?.text,
    );
    assert.equal(summaries.length, 1);
    assert.deepEqual(
      summaries[0].map((item) => item.kind),
      ['dungeon', 'dungeon', 'invitation'],
    );
    const archived = summaries[0][2].text;
    assert.match(
      archived,
      /展开琴谱.*玩家：我们一起走到广场吧。.*一起走吧。.*玩家：刚才第七小节有个停顿。.*收好琴盒/s,
    );
    assert.match(archived, /敲了一遍刚才说好的节拍/);
    assert.match(archived, /收好琴盒.*把你说的停顿也记了下来.*今天就到这儿吧/s);
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await page.screenshot({ path: path.join(output, 'invitation-record.png') });
    await page.locator('#ledger-close').click();
    await page.setViewportSize({ width: 1120, height: 700 });
    assert.equal(
      await page.evaluate(() =>
        demo.getLibrary().characters.some((entry) => entry.id === 'official-libet'),
      ),
      false,
    );
    await travelTownScene(page, 'tavern');

    // Populate the log after the daily event through a real posted guild bounty.
    await expect(page.locator('#gal-stage')).toBeHidden();
    await expect(page.locator('#ledger-drawer-host')).toBeHidden();
    await expect(questHandle).toBeVisible();
    await questHandle.click();
    await journal.getByRole('button', { name: '冒险者公会', exact: true }).click();
    const guild = page.locator('#guild-dialog[open]');
    const bounty = GUILD_BOUNTIES.find(({ id }) => id === 'bounty-moss-clear');
    assert(bounty);
    const otherBountyId = 'bounty-mill-vermin';
    await guild.locator(`[data-guild-accept="${otherBountyId}"]`).click();
    const questId = `guild-${bounty.id}`;
    await guild.locator(`[data-guild-accept="${bounty.id}"]`).click();
    await expect(guild.locator(`[data-guild-track="${questId}"]`)).toBeVisible();
    await guild.getByRole('button', { name: '关闭冒险者公会' }).click();
    await expect(questHandle).toBeVisible();
    await questHandle.click();
    const bountyRow = journal.locator(`[data-quest-select="${questId}"]`);
    await expect(bountyRow).toHaveText(bounty.title);
    await expect(bountyRow).toHaveAttribute('aria-current', 'true');
    const detail = journal.locator(`[data-quest-detail="${questId}"]`);
    await expect(detail.locator('.skyrim-folio-desc')).toHaveText(bounty.description);
    const indexWidthError = await journal.locator('.skyrim-journal-grid').evaluate((grid) => {
      const indexWidth = grid.querySelector('.skyrim-index-col').getBoundingClientRect().width;
      return Math.abs(indexWidth - grid.getBoundingClientRect().width * 0.35);
    });
    assert(indexWidthError < 1, 'the desktop quest index occupies 35% of the journal body');
    assert.deepEqual(
      await detail.locator('.ow-quest-folio-head').evaluate((header) => {
        const style = getComputedStyle(header, '::before');
        return {
          decorative: style.content === '""',
          pointerEvents: style.pointerEvents,
          hasGradient: style.backgroundImage.startsWith('radial-gradient('),
        };
      }),
      { decorative: true, pointerEvents: 'none', hasGradient: true },
      'the crest wash renders without intercepting input or entering the accessibility tree',
    );
    const wings = detail.locator('.ow-quest-wing');
    await expect(wings).toHaveCount(2);
    for (const wing of await wings.all()) {
      await expect(wing.locator('path').first()).toHaveCSS('stroke', 'rgb(227, 224, 218)');
      await expect(wing.locator('polygon').first()).toHaveCSS('fill', 'rgb(234, 233, 229)');
    }
    const objectives = detail.locator('.ow-quest-objectives');
    await expect(objectives).toContainText(bounty.objectiveLabel);
    await expect(objectives).toContainText(`0 / ${bounty.targetCount}`);
    await expect(detail.locator('.ow-quest-reward')).toContainText(`金币 ${bounty.gold}`);
    await expect(journal.locator('[data-quest-claim], [data-quest-pick]')).toHaveCount(0);
    await settleJournal();
    await assertQuestFolioLayout(detail, { singleLineTitle: true });
    await page.screenshot({ path: path.join(output, 'quests-after-daily-event.png') });
    const otherQuestId = `guild-${otherBountyId}`;
    const otherRow = journal.locator(`[data-quest-select="${otherQuestId}"]`);
    const marker = (id) => journal.locator(`.ow-quest-mark-button[data-quest-track="${id}"]`);
    await expect(marker(questId)).toHaveAttribute('aria-pressed', 'true');
    await expect(bountyRow).toBeFocused();
    await bountyRow.press('ArrowDown');
    await expect(otherRow).toBeFocused();
    await expect(otherRow).toHaveAttribute('aria-current', 'true');
    await expect(marker(questId)).toHaveAttribute('aria-pressed', 'true');
    await otherRow.press('Enter');
    await expect(marker(otherQuestId)).toHaveAttribute('aria-pressed', 'true');
    await expect(marker(questId)).toHaveAttribute('aria-pressed', 'false');
    await expect(journal.locator('[data-quest-focus="track"]')).toBeFocused();
    // The reference journal toggles tracking from the entire selected row.
    await otherRow.locator('..').click({ position: { x: 6, y: 12 } });
    await expect(marker(otherQuestId)).toHaveAttribute('aria-pressed', 'false');
    await marker(questId).click();
    await expect(marker(questId)).toHaveAttribute('aria-pressed', 'true');
    await expect(bountyRow).toBeFocused();
    await bountyRow.press('Escape');
    await expect(journal).toBeHidden();
    await expect(questHandle).toBeFocused();

    // The selected task must drive the marker; another task remains tracked.
    const atlasFrame = page.frameLocator('#daily-atlas-frame');
    const atlas = atlasFrame.locator('#street-map');
    const questTarget = atlas.locator('[data-quest-target]');
    const beforeAtlas = await page.evaluate(() => {
      const { daily, unlockedDungeons, tavernQuests } = demo.getLibrary();
      return { daily, unlockedDungeons, tavernQuests };
    });
    await questHandle.click();
    await otherRow.click();
    await expect(marker(questId)).toHaveAttribute('aria-pressed', 'true');
    await otherRow.press('m');
    await expect(atlas).toBeVisible();
    await expect(journal).toBeHidden();
    await expect(questTarget).toBeVisible();
    await expect(questTarget).toHaveAttribute('data-travel-to', 'mill');
    // The atlas dialog translates while opening; measure the final camera target, not an entry frame.
    await expect
      .poll(
        () =>
          questTarget.evaluate((pin) => {
            const bounds = pin.getBoundingClientRect();
            return Math.max(
              Math.abs(bounds.left + bounds.width / 2 - innerWidth / 2),
              Math.abs(bounds.top + bounds.height / 2 - innerHeight / 2),
            );
          }),
        { message: 'the atlas centers the selected quest pin after opening' },
      )
      .toBeLessThan(2);
    await atlas.locator('.street-map-close [type="submit"]').click();
    await expect(page.locator('#daily-atlas-frame')).toBeHidden();

    // Reopening the same iframe for a locked target must not retain the old marker.
    await questHandle.click();
    await bountyRow.click();
    await journal.locator('[data-quest-open-atlas]').click();
    await expect(atlas).toBeVisible();
    await expect(atlas.locator('[data-travel-to="moss-hollow"]')).toHaveAttribute(
      'data-unlocked',
      'false',
    );
    await expect(questTarget).toHaveCount(0);
    await atlas.locator('.street-map-close [type="submit"]').click();
    await expect(page.locator('#daily-atlas-frame')).toBeHidden();
    assert.deepEqual(
      await page.evaluate(() => {
        const { daily, unlockedDungeons, tavernQuests } = demo.getLibrary();
        return { daily, unlockedDungeons, tavernQuests };
      }),
      beforeAtlas,
      'atlas lookup must not travel, spend an action, unlock a dungeon, or change tracking',
    );

    for (const [name, width, height] of [
      ['portrait', 390, 844],
      ['landscape', 844, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await questHandle.click();
      await settleJournal();
      assert.equal(
        await journal.evaluate((dialog) =>
          [...dialog.querySelectorAll('.ow-quest-list, .skyrim-folio-col, .skyrim-keybar')].some(
            (region) => region.scrollWidth > region.clientWidth + 1,
          ),
        ),
        false,
        name + ' journal content and controls do not require horizontal scrolling',
      );
      await assertQuestFolioLayout(detail);
      await page.screenshot({ path: path.join(output, 'quests-' + name + '.png') });
      await journal.getByRole('button', { name: '关闭任务日志' }).click();
      await expect(journal).toBeHidden();
    }
    await page.setViewportSize({ width: 1120, height: 700 });

    await page.evaluate(() => demo.flushStorage());
    await page.evaluate(() => {
      const key = 'wanxiang.worldbooks.v1';
      const saved = JSON.parse(localStorage.getItem(key));
      saved.inventory.gold = Math.max(saved.inventory.gold || 0, 120);
      localStorage.setItem(key, JSON.stringify(saved));
    });
    await page.reload();
    await page.waitForFunction(() => window.demo?.getLibrary().daily.period === 3);
    const persistedBounty = await page.evaluate((id) => {
      const quest = demo.getLibrary().tavernQuests.find((entry) => entry.id === id);
      return {
        status: quest?.status,
        claimed: quest?.claimed,
        progress: quest?.objectives[0]?.current,
        tracked: quest?.tracked,
      };
    }, questId);
    assert.deepEqual(persistedBounty, {
      status: 'active',
      claimed: false,
      progress: 0,
      tracked: true,
    });
    await pullOpenLedger();
    await page.locator('[data-daily="service"]').click();
    const setup = page.locator('#daily-setup[open]');
    await setup.waitFor();
    assert.match(await setup.textContent(), /今夜菜单.*当班排班.*设施扩建/s);
    await setup.locator('[data-service-tab="staff"]').click();
    const frontRole = setup.locator('[data-daily-role="front"]');
    const cleanRole = setup.locator('[data-daily-role="clean"]');
    const originalFront = await frontRole.locator('strong').textContent();
    const originalClean = await cleanRole.locator('strong').textContent();
    await frontRole.click();
    await setup.locator('.tv-rchar', { hasText: originalClean }).click();
    assert.equal(await frontRole.locator('strong').textContent(), originalClean);
    assert.equal(await cleanRole.locator('strong').textContent(), originalFront);
    await setup.locator('[data-service-tab="upgrade"]').click();
    await setup.locator('[data-service-fac="table"]').click();
    assert.equal(
      await page.evaluate(() => demo.getLibrary().daily.serviceGrowth.facilities.table),
      1,
    );
    await setup.locator('[data-service-tab="menu"]').click();
    await setup.locator('[data-service-autofill]').click();
    assert((await setup.locator('.tv-tonight-slots button').count()) >= 2);
    await page.setViewportSize({ width: 390, height: 844 });
    const checkSetup = () =>
      setup.evaluate((dialog) => {
        const body = dialog.querySelector('.daily-setup-body');
        const start = dialog.querySelector('[data-daily-start]').getBoundingClientRect();
        return {
          horizontalOverflow: body.scrollWidth > body.clientWidth,
          canScroll: body.scrollHeight > body.clientHeight,
          reachable: start.bottom <= innerHeight && start.height >= 44,
        };
      });
    assert.deepEqual(await checkSetup(), {
      horizontalOverflow: false,
      canScroll: true,
      reachable: true,
    });
    await page.screenshot({ path: path.join(output, 'daily-service-setup-mobile.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    assert.deepEqual(await checkSetup(), {
      horizontalOverflow: false,
      canScroll: true,
      reachable: true,
    });
    await page.screenshot({ path: path.join(output, 'daily-service-setup-landscape.png') });
    await page.locator('[data-daily-start]').click();
    await service.waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 1120, height: 700 });
    for (let i = 0; i < 6 && !(await service.locator('[data-live-seat]').count()); i++) {
      await page.clock.fastForward(400);
    }
    const goldBeforeAle = await page.evaluate(
      () => demo.getLibrary().daily.active.shift.earnedGold,
    );
    await service.locator('[data-live="ale"]').click();
    assert(
      (await page.evaluate(() => demo.getLibrary().daily.active.shift.earnedGold)) > goldBeforeAle,
    );
    await page.screenshot({ path: path.join(output, 'daily-service-rush.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    assert.equal(await service.locator('.ls-tables').isVisible(), true);
    await page.screenshot({ path: path.join(output, 'daily-service-landscape.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await service.locator('.ls-hud').isVisible(), true);
    await page.screenshot({ path: path.join(output, 'daily-service-portrait.png') });
    await page.setViewportSize({ width: 1120, height: 700 });
    await service.locator('[data-live="end"]').click();
    await service.locator('[data-live="settle-done"]').click();
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.serviceGrowth.shifts), 2);

    // Branch the existing invitation at an editable turn; use the actual End Invitation action.
    assert.equal(await page.evaluate(() => demo.loadSlot('slot2')), true);
    await page.locator('.daily-status [data-daily="resume"]').click();
    await expect(compose).toBeEditable();
    const endInvitation = page.locator('#daily-invitation [data-invite-end]');
    await expect(endInvitation).toBeEnabled();
    const stage = page.locator('#gal-stage');
    await endInvitation.click();
    await expect(stage).toHaveAttribute('data-leaving', 'true');
    await expect(stage).toHaveJSProperty('inert', true);
    await expect(stage).toBeVisible();
    await expect(stage).toBeHidden();
    await expect(page.locator('.daily-status')).toContainText('约见提前结束');
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active), null);

    assert.deepEqual(errors, []);
    return {
      fourRoles: true,
      goldOnlyService: true,
      liveShiftHubAndBoard: true,
      shiftReceipt: true,
      cumulativeOuting: true,
      invitationStages: true,
      earlyInvitationExit: true,
      questJournalAfterEvent: true,
      questJournalKeyboardAndPortrait: true,
      invitationSetupKeyboardAndNarrowLayout: true,
      cityChatEnvironmentWithoutImage: true,
      recruitmentSeparateFromInvitation: true,
      persisted: true,
      questJournalEmptyState: true,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'daily-failure.png') }).catch(() => {});
    if (errors.length) failure.message += `\n${errors.join('\n')}`;
    throw failure;
  } finally {
    await page.close();
  }
}
