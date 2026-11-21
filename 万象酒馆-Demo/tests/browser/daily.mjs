import assert from 'node:assert/strict';
import path from 'node:path';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { joinPandora } from '../../src/companion-events.js';
import { normalizeInvitationPlan } from '../../src/invitation.js';
import { memoryHash } from '../../src/memory.js';
import { fullInvitation } from '../fixtures/invitation.js';
import { legacySession } from './legacy-session.mjs';
import { travelTownScene } from './town-navigation.mjs';

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
  const outline = { ...fullInvitation, finale: { ...fullInvitation.finale, scene: 'market' } };
  const plan = normalizeInvitationPlan(outline);
  const rawOutline = `<wanxiang_json>${JSON.stringify(outline)}</wanxiang_json>`;
  const calls = [];
  const summaries = [];
  let firstRevision;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/ai/generate/chat', (route) => {
    return route.fulfill({
      json: {
        content: '【旁白】广场的钟声响了。',
        actions: { affection: [], agreeToAdventure: [] },
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
  await page.route('**/api/ai/generate/script', async (route) => {
    const { invitation, invitationTopics, party, playerIntent } = route.request().postDataJSON();
    if (invitationTopics) {
      assert.equal(invitationTopics.title, fullInvitation.title);
      assert.match(invitationTopics.transcript, /把最后一小节留在琴谱上/);
      return route.fulfill({ json: { topics: nextTopics } });
    }
    calls.push('script');
    assert.equal(playerIntent, '我想问问她最近在忙什么。');
    assert.equal(invitation.member, 'official-libet');
    assert.match(
      party.find((person) => person.id === invitation.member).invitationMemory,
      /餐车挡住了路/,
    );
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
  async function checkInvitationComposer(suffix) {
    await page
      .locator('.gal-composer')
      .evaluate((node) =>
        Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => {}))),
      );
    const layout = await page.locator('#daily-invitation').evaluate((form) => {
      const box = (selector) => document.querySelector(selector).getBoundingClientRect();
      const input = box('#invite-input');
      const meta = box('.invite-meta');
      const end = box('[data-invite-end]');
      const send = box('#invite-send');
      return {
        fieldShare: input.width / form.getBoundingClientRect().width,
        fieldHeight: input.height,
        metaAbove: meta.bottom <= input.top && end.bottom <= input.top,
        sendBesideField: send.left >= input.right && Math.abs(send.bottom - input.bottom) < 2,
        toolbarBelow: box('.gal-actionbar').top >= input.bottom,
        recordAbove: box('.daily-invitation-record').bottom <= box('.gal-composer').top,
        sendIcon: Boolean(form.querySelector('#invite-send svg')),
      };
    });
    assert(layout.fieldShare >= 0.9, suffix + ' input takes the width of the Gal composer');
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
    assert.deepEqual(await actions.allTextContents(), ['闲聊', '用餐', '约见', '冒险', '外出']);
    assert.match(await page.locator('[data-tavern-clock]').textContent(), /1463年8月24日 · 上午/);
    await pullOpenLedger();
    assert.match(await page.locator('[data-ledger-date]').textContent(), /1463年8月24日 · 上午/);
    await page.locator('[data-daily="promotion"]').click();
    await page.locator('#tavern-promotion[open]').waitFor();
    await page.clock.fastForward(350);
    assert(await page.locator('[data-promotion-confirm]').isDisabled());
    await page.screenshot({ path: path.join(output, 'promotion-panel.png') });
    await page.locator('[data-promotion-close]').click();
    await pullOpenLedger();
    await page.locator('[data-daily="quests"]').click();
    await page.locator('#tavern-quests[open]').waitFor();
    await page.clock.fastForward(350);
    await page.screenshot({ path: path.join(output, 'quests-panel.png') });
    await page.locator('#tavern-quests .quests-close').click();
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
    await page.locator('[data-tavern-exit="street"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow?.streetPreview?.definition
          ?.id === 'starlamp-street',
      null,
      { timeout: 60000 },
    );
    assert.equal(await frame.locator('#street-map[open]').count(), 0);
    await frame.locator('#street-map-open').click();
    await frame.locator('#street-map-workshop').click();
    await page.locator('#workshop-dialog[open]:not([data-loading])').waitFor();
    await page.locator('[data-ws-close]').click();
    await frame.locator('#street-map .street-map-close [type="submit"]').click();
    await page.locator('[data-daily="companions"]').click();
    await page.locator('#party-panel[open]').waitFor();
    if (await page.locator('#prepare-pool [data-prepare-hero="official-edith"]').count()) {
      await page
        .locator('#prepare-pool [data-prepare-hero="official-edith"]')
        .dragTo(page.locator('.prepare-slot:not([data-prepare-hero])').first());
    }
    await page.locator('#prepare-done').click();
    assert(
      (await page.evaluate(() => demo.getLibrary().daily.active.companions)).includes(
        'official-edith',
      ),
    );
    assert.match(await status(), /已行 0 回合/);
    await travelTownScene(page, 'city-center');
    assert.match(await status(), /已行 1 回合/);
    await page.locator('#scene-talk.is-docked').waitFor();
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
      const talk = document.querySelector('#scene-talk').getBoundingClientRect();
      const mapBtn = toScreen(fd.querySelector('#street-map-open').getBoundingClientRect());
      const retBtn = toScreen(fd.querySelector('#street-return').getBoundingClientRect());
      const hud = document.querySelector('#hud-plaque').getBoundingClientRect();
      const daily = document.querySelector('.daily-status').getBoundingClientRect();
      return { dock, talk, mapBtn, retBtn, hud, daily, vh: window.innerHeight };
    });
    assert(
      streetGeometry.dock.top > streetGeometry.vh - 90 &&
        streetGeometry.talk.left >= streetGeometry.dock.left - 2 &&
        streetGeometry.talk.right <= streetGeometry.mapBtn.left + 2 &&
        Math.abs(streetGeometry.talk.top - streetGeometry.mapBtn.top) < 8 &&
        Math.abs(streetGeometry.mapBtn.top - streetGeometry.retBtn.top) < 4,
      `Outdoor dock buttons align at bottom center: ${JSON.stringify(streetGeometry)}`,
    );
    assert(
      streetGeometry.daily.top >= streetGeometry.hud.bottom - 1 &&
        Math.abs(streetGeometry.daily.left - streetGeometry.hud.left) <= 2 &&
        streetGeometry.daily.top < 140 &&
        streetGeometry.daily.left < 60,
      `Outing status ribbon sits cleanly at top-left below placard: ${JSON.stringify(streetGeometry)}`,
    );
    await page.screenshot({ path: path.join(output, 'street-dock.png') });
    await travelTownScene(page, 'outskirts');
    assert.match(await status(), /已行 3 回合/);
    assert.equal(await frame.locator('[data-hotspot="road-meadow"]').count(), 0);
    await page.locator('[data-daily="home"]').click();
    await page.locator('[data-daily="invitation"]').click();
    await page.locator('[data-daily-person="official-libet"]').click();
    await page.locator('[data-daily-activity="walk"]').click();
    assert.equal(summaries.length, 0, 'two completed dungeons alone do not start a batch');
    await page.locator('[data-daily-start]').click();
    await page.locator('#player-intent textarea').fill('我想问问她最近在忙什么。');
    await page.locator('#player-intent button[value="continue"]').click();
    const compose = page.locator('#daily-invitation textarea');
    const ready = () => compose.isVisible();
    const record = page.locator('.daily-invitation-record');
    await page.locator('#gal-stage > .daily-invitation-record').waitFor();
    assert.match(await record.textContent(), /眼下.*拿出一张没写完的琴谱/s);
    assert.equal(await record.locator('.daily-invitation-tasks').count(), 0);
    await page.waitForFunction(() =>
      document.querySelector('.gal-text')?.textContent.startsWith('莉贝特'),
    );
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
    await checkInvitationComposer('desktop');
    const choices = page.locator('[data-invite-choice]');
    assert.deepEqual(await choices.allTextContents(), fullInvitation.stages[0].choices);
    await choices.first().click();
    await clearGal(async () => (await ready()) && (await record.locator('li small').count()) === 1);
    assert.match(await record.locator('li').first().textContent(), /听莉贝特试奏一遍.*已完成/);
    await historyButton.click();
    const playerLine = transcript.locator('li').filter({ hasText: '我们一起走到广场吧。' });
    assert.equal(await playerLine.locator('strong').textContent(), '青缘');
    assert.equal(await transcript.locator('li strong').last().textContent(), '莉贝特');
    await transcript.getByRole('button', { name: '返回演出' }).click();
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
    assert.match(await record.textContent(), /酒馆 → 星钟广场/);
    assert(await frame.locator('#street-open').count(), 'the tavern is still the loaded scene');
    await travelTownScene(page, 'street');
    assert.match(await record.textContent(), /酒馆街角 → 星钟广场/);
    assert(await compose.isHidden(), 'an intermediate scene does not start the next act');
    await page.reload();
    await page.waitForFunction(
      () =>
        document.querySelector('#inn-frame iframe')?.contentWindow.streetPreview?.definition.id ===
        'starlamp-street',
      null,
      { timeout: 60000 },
    );
    assert.match(await record.textContent(), /酒馆街角 → 星钟广场/);
    await travelTownScene(page, 'city-center');
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
    await compose.fill('这段旋律可以先保留，怎么结尾由你决定。');
    await page.locator('#daily-invitation [type="submit"]').click();
    await clearGal(async () => (await status()).includes('结束约见') && (await compose.isHidden()));
    assert.match(await record.textContent(), /星钟广场 → 商业街/);
    await travelTownScene(page, 'market');
    await clearGal(
      async () =>
        (await page.locator('#gal-stage .gal-chapter').textContent()) ===
        fullInvitation.finale.title,
    );
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
    await page.evaluate(() => demo.flushStorage());
    await page.evaluate(() => {
      const key = 'wanxiang.worldbooks.v1';
      const saved = JSON.parse(localStorage.getItem(key));
      saved.inventory.gold = Math.max(saved.inventory.gold || 0, 120);
      localStorage.setItem(key, JSON.stringify(saved));
    });
    await page.reload();
    await page.waitForFunction(() => window.demo?.getLibrary().daily.period === 3);
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
    assert.deepEqual(errors, []);
    return {
      fourRoles: true,
      goldOnlyService: true,
      liveShiftHubAndBoard: true,
      shiftReceipt: true,
      cumulativeOuting: true,
      invitationStages: true,
      recruitmentSeparateFromInvitation: true,
      persisted: true,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'daily-failure.png') }).catch(() => {});
    if (errors.length) failure.message += `\n${errors.join('\n')}`;
    throw failure;
  } finally {
    await page.close();
  }
}
