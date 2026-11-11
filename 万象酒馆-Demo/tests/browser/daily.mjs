import assert from 'node:assert/strict';
import path from 'node:path';
import { newCampaign, firstCompanion } from '../../src/campaign.js';
import { defaultProtagonist } from '../../src/content/qingyuan.js';
import { joinPandora } from '../../src/companion-events.js';
import { normalizeInvitationPlan } from '../../src/invitation.js';
import { memoryHash } from '../../src/memory.js';
import { fullInvitation } from '../fixtures/invitation.js';
import { legacySession } from './legacy-session.mjs';
import { travelChapterScene } from './chapter-navigation.mjs';

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
  let lastChat;
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/ai/generate/chat', (route) => {
    lastChat = route.request().postDataJSON();
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
    const { invitation, party } = route.request().postDataJSON();
    calls.push('script');
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
    const { invitation } = route.request().postDataJSON();
    calls.push(invitation.stageId);
    const { nextScene } = invitation;
    const first = nextScene.lines[0];
    let revised;
    if (invitation.stageId === 'stage-1' && !invitation.previous.length) {
      assert.equal(nextScene.id, 'stage-2');
      revised = '莉贝特用指节敲了一遍刚才说好的节拍。';
    }
    if (invitation.stageId === 'stage-1' && invitation.previous.length) {
      assert.equal(nextScene.revision, 1);
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
          ...(revised
            ? {
                nextSceneId: nextScene.id,
                revision: nextScene.revision,
                patches: [{ op: 'replace', id: first.id, speaker: first.speaker, text: revised }],
              }
            : {}),
        },
      },
    });
  });
  async function draft(index, action) {
    await page.locator(`[data-daily-slot="${index}"]`).click();
    await page.locator(`[data-daily-action="${action}"]`).click();
  }
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
  try {
    await page.clock.install();
    await page.goto(baseURL + '/?display=landscape');
    const frame = page.frameLocator('#inn-frame iframe');
    await page.locator('[data-daily="open"]').click();
    await draft(3, 'dungeon');
    assert.match(await page.locator('.daily-rail footer').textContent(), /放不进/);
    for (const [i, action] of ['service', 'outing', 'outing', 'invitation'].entries())
      await draft(i, action);
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await frame.locator('canvas').click({ position: { x: 28, y: 90 } });
    await page.locator('[data-daily="open"]').waitFor();
    await page.locator('.daily-rail').waitFor({ state: 'hidden' });
    await page.locator('[data-daily="open"]').click();
    assert.equal(await page.locator('[data-daily-slot="0"]').getAttribute('data-kind'), 'service');
    await page.screenshot({ path: path.join(output, 'daily-timeline.png') });
    await page.locator('[data-daily="confirm"]').click();
    await page.locator('#daily-setup[open]').waitFor();
    await page.locator('[data-daily-start]').click();
    const service = page.locator('#daily-service');
    await service.locator('.service-map[data-service-scene="ready"]').waitFor({ timeout: 60000 });
    const pick = (name) => service.getByRole('button', { name, exact: true }).click();
    const workspace = service.locator('[data-service-workspace]');
    const chooseSeat = (id) => workspace.locator(`[data-service-choice="${id}"]`).click();
    const ticket = (role, name) =>
      service
        .locator('[data-station="' + role + '"]')
        .getByRole('button', { name })
        .click();
    async function activityScreenPoint(kind, x, y) {
      return workspace.locator(`[data-activity="${kind}"]`).evaluate(
        (area, [x, y]) => {
          const art = area.querySelector('[data-cook-art]');
          if (art) {
            const point = new DOMPoint(x * 600, y * 300).matrixTransform(art.getScreenCTM());
            return [point.x, point.y];
          }
          const box = area.getBoundingClientRect();
          return [box.x + box.width * x, box.y + box.height * y];
        },
        [x, y],
      );
    }
    async function activityPoints(kind, points, delay = 0) {
      const area = workspace.locator(`[data-activity="${kind}"]`);
      await area.waitFor();
      const screen = await Promise.all(points.map(([x, y]) => activityScreenPoint(kind, x, y)));
      await page.mouse.move(...screen[0]);
      await page.mouse.down();
      for (const point of screen.slice(1)) {
        await page.mouse.move(...point);
        if (delay) await page.waitForTimeout(delay);
      }
      await page.mouse.up();
    }
    await service.locator('[data-route-guest="1"][data-direction="enter"]').waitFor();
    const visitor = service.locator('[data-service-actor="1"]');
    const position = await visitor.getAttribute('style');
    await page.clock.fastForward(550);
    assert.notEqual(await visitor.getAttribute('style'), position);
    assert.equal(await service.locator('.service-map button').count(), 0);
    const frontGuide = service.locator('[data-service-guide="front"]');
    await frontGuide.waitFor();
    assert.equal(await frontGuide.getAttribute('data-side'), 'left');
    assert.match(await frontGuide.innerText(), /1号.*迎宾排座/s);
    const guideSeconds = Number(
      (await frontGuide.locator('[data-guide-time]').textContent()).replace(/\D/g, ''),
    );
    await page.clock.fastForward(Math.max(0, guideSeconds - 7) * 1000);
    await page.waitForFunction(
      () => document.querySelector('[data-service-guide="front"]')?.dataset.urgent === 'true',
    );
    assert.equal(await frontGuide.getAttribute('data-urgent'), 'true');
    await frontGuide.click();
    await workspace.waitFor();
    assert.equal(await workspace.locator('.service-workcard.service-urgent').count(), 1);
    assert.equal(await workspace.locator('.service-seat-cards button').count(), 5);
    await chooseSeat('hall');
    await service.locator('[data-route-guest="1"][data-direction="toSeat"]').waitFor();
    await ticket('server', /1号 · 确认点单/);
    assert.equal(
      await workspace.locator('.service-story, .service-flavor').count(),
      0,
      'decorative prose is removed from the game stage',
    );
    assert.equal(
      await workspace.locator('.service-focus-dish .food-art').count(),
      1,
      'the requested dish is shown as a large icon',
    );
    assert.equal(
      await workspace.locator('[data-choice-type="dish"] .service-dish-art .food-art').count(),
      4,
      'dish choices are identified by icons',
    );
    await page.screenshot({ path: path.join(output, 'daily-service-order.png') });
    await pick('香草烤鸡');
    await ticket('cook', /1号 · 制作菜品/);
    await workspace.locator('[data-activity="heat"]').waitFor();
    await service.locator('[data-service-actor="2"]').waitFor();
    await ticket('front', /2号 · 迎宾排座/);
    assert.equal(await service.locator('[data-station] .service-game').count(), 0);
    assert.match(await workspace.innerText(), /2号.*迎宾排座/s);
    await chooseSeat('bar-1');
    await ticket('cook', /1号 · 制作菜品/);
    const desktopCard = await workspace.locator('.service-workcard').boundingBox();
    const desktopHeat = await workspace.locator('[data-activity="heat"]').boundingBox();
    assert(
      desktopHeat.width >= desktopCard.width * 0.9 &&
        desktopHeat.height >= desktopCard.height * 0.6,
      JSON.stringify({ desktopCard, desktopHeat }),
    );
    await page.screenshot({ path: path.join(output, 'daily-service.png') });
    await activityPoints(
      'heat',
      [
        [0.25, 0.81],
        [0.64, 0.81],
      ],
      1300,
    );
    await ticket('server', /1号 · 配盘送餐/);
    const pathUp = Array.from({ length: 47 }, (_, i) => [0.5, 0.93 - i * 0.019]);
    await activityPoints('balance', pathUp, 27);
    await service.locator('[data-service-actor="1"][data-phase="eat"]').waitFor();
    await ticket('front', /1号 · 算账找零/);
    assert.equal(await workspace.locator('[data-choice-type="number"] button').count(), 4);
    await pick('3');
    await ticket('clean', /1号 · 清理翻台/);
    await activityPoints('wipe', [
      [0.25, 0.37],
      [0.36, 0.61],
      [0.47, 0.43],
      [0.59, 0.65],
      [0.67, 0.33],
      [0.76, 0.56],
    ]);
    await workspace.waitFor({ state: 'hidden' });
    await page.clock.fastForward(190000);
    await page.locator('[data-service-end]').click();
    assert.match(await status(), /本班接待 1 桌/);
    assert.match(await status(), /知名度.*熟练|知名度.*掌勺/);
    await page.locator('[data-daily="next"]').click();
    assert.match(await status(), /外出门/);
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('streetDoor'));
    await frame.locator('#street-open').click();
    assert.match(await page.locator('#daily-setup[open]').textContent(), /可行动 20 次/);
    await page.locator('[data-daily-start]').click();
    await page.waitForFunction(
      () => document.querySelector('#inn-frame iframe')?.contentWindow.streetPreview,
    );
    assert.match(await status(), /20/);
    await travelChapterScene(page, 'city-center');
    assert.match(await status(), /19/);
    await travelChapterScene(page, 'road-meadow');
    assert.match(await status(), /16/);
    assert(await page.locator('#chapter-talk').isHidden());
    await travelChapterScene(page, 'city-center');
    await page.locator('[data-daily="home"]').click({ trial: true });
    await page.evaluate(() => {
      const key = 'wanxiang.worldbooks.v1';
      const saved = JSON.parse(localStorage.getItem(key));
      saved.daily.active.remaining = 1;
      localStorage.setItem(key, JSON.stringify(saved));
    });
    await page.reload();
    await page.locator('#chapter-talk').click();
    await page.locator('#chat-input').fill('再听一次钟声，我们就回去吧。');
    await page.locator('#chat-send').click();
    await page.waitForFunction(() => document.querySelector('#gal-stage .gal-count')?.textContent);
    assert.equal(await page.evaluate(() => demo.getLibrary().daily.active.remaining), 0);
    await clearGal(async () => (await status()).includes('已使用 20 次'));
    await page.locator('[data-daily="next"]').click();
    await page.locator('[data-daily-person="official-libet"]').click();
    await page.locator('[data-daily-activity="walk"]').click();
    assert.equal(summaries.length, 0, 'two completed dungeons alone do not start a batch');
    await page.locator('[data-daily-start]').click();
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
    await page.locator('#generation-review').click();
    const rawDialog = page.locator('#latest-api-response');
    assert.equal(await rawDialog.locator('textarea').inputValue(), rawOutline);
    await rawDialog.getByRole('button', { name: '关闭原始回复' }).click();
    await checkInvitationComposer('desktop');
    await compose.fill('我们一起走到广场吧。');
    await page.locator('#daily-invitation [type="submit"]').click();
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
    await travelChapterScene(page, 'street');
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
    await travelChapterScene(page, 'city-center');
    await clearGal(
      async () =>
        (await ready()) &&
        (await page.locator('.invite-progress').textContent()).includes('第 3/3 幕'),
    );
    await page.waitForFunction(
      () =>
        document
          .querySelector('#inn-frame iframe')
          ?.contentWindow.streetPreview?.state()
          .image.endsWith('/town-night/city-center.png'),
      null,
      { timeout: 60000 },
    );
    await compose.fill('这段旋律可以先保留，怎么结尾由你决定。');
    await page.locator('#daily-invitation [type="submit"]').click();
    await clearGal(async () => (await status()).includes('结束约见') && (await compose.isHidden()));
    assert.match(await record.textContent(), /星钟广场 → 商业街/);
    await travelChapterScene(page, 'market');
    await clearGal(
      async () =>
        (await page.locator('#gal-stage .gal-chapter').textContent()) ===
        fullInvitation.finale.title,
    );
    assert.doesNotMatch(await status(), /事件结束/);
    assert.equal(await record.locator('li').count(), 0);
    await clearGal(async () => (await status()).includes('正式邀请入队'));
    assert.deepEqual(calls, ['script', 'stage-1', 'stage-1', 'stage-2', 'stage-3']);
    assert.match(await status(), /事件结束.*个人事件完成/);
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
    await page.setViewportSize({ width: 1120, height: 700 });
    await page.locator('[data-daily="recruit"]').click();
    assert(
      await page.evaluate(() =>
        demo.getLibrary().characters.some((entry) => entry.id === 'official-libet'),
      ),
    );
    await page.locator('[data-daily="next"]').click();
    await page.reload();
    await page.waitForFunction(() => window.demo?.getLibrary().daily.day === 2);
    await page.locator('[data-daily="chat"]').click();
    await page.locator('#chat-input').fill('莉贝特，你还记得那首曲子吗？');
    const renewed = page.waitForRequest('**/api/ai/generate/chat');
    await page.locator('#chat-send').click();
    await renewed;
    await clearGal(() => page.locator('#chat-input').isVisible());
    assert.match(
      lastChat.characters.find((member) => member.id === 'official-libet').invitationMemory,
      /回忆：走一段路/,
    );
    assert.equal(lastChat.characters.filter((member) => member.invitationMemory).length, 1);
    await page.locator('#gal-stage [data-gal="close"]').click();
    await page.locator('#gal-stage').waitFor({ state: 'hidden' });
    await page.locator('[data-daily="open"]').click();
    await draft(0, 'service');
    await page.locator('[data-daily="confirm"]').click();
    const setup = page.locator('#daily-setup[open]');
    assert.match(await setup.textContent(), /酒馆知名度.*熟练.*自动/s);
    await page.setViewportSize({ width: 390, height: 844 });
    const frontRole = setup.locator('[data-daily-role="front"]');
    const cleanRole = setup.locator('[data-daily-role="clean"]');
    const originalFront = await frontRole.locator('small').textContent();
    const originalClean = await cleanRole.locator('small').textContent();
    await frontRole.click();
    await setup.getByRole('button', { name: /与保洁互换/ }).click();
    assert.equal(await frontRole.locator('small').textContent(), originalClean);
    assert.equal(await cleanRole.locator('small').textContent(), originalFront);
    await setup.locator('[data-service-recipes]').click();
    assert(await setup.locator('[data-service-recipe="fir-roast"]').isDisabled());
    await setup.locator('[data-service-recipe="frost-chowder"]').click();
    await setup.locator('[data-service-portion="1"]').click();
    assert(await setup.locator('[data-service-portion="1"]').isDisabled());
    await setup.locator('.setup-basic-menu summary').click();
    assert.equal(await setup.locator('.setup-basic-menu[open] li').count(), 16);
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
    await setup.locator('.setup-basic-menu summary').click();
    await setup.locator('.daily-setup-body').evaluate((body) => (body.scrollTop = 0));
    await page.screenshot({ path: path.join(output, 'daily-service-setup-mobile.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    assert.deepEqual(await checkSetup(), {
      horizontalOverflow: false,
      canScroll: true,
      reachable: true,
    });
    await page.screenshot({ path: path.join(output, 'daily-service-setup-landscape.png') });
    await page.locator('[data-daily-start]').click();
    assert.equal(
      await page.evaluate(() => demo.getLibrary().daily.active.shift.bookings.length),
      7,
    );
    assert.deepEqual(await page.evaluate(() => demo.getLibrary().daily.active.shift.special), {
      id: 'frost-chowder',
      portions: 2,
      sold: 0,
      paid: 0,
    });
    assert.equal(await page.evaluate(() => demo.getLibrary().dining.inventory['frost-oyster']), 0);
    await page.setViewportSize({ width: 1120, height: 700 });
    // Resume a v3 shift to keep the following gesture and layout fixtures reproducible.
    await page.evaluate(() => {
      const key = 'wanxiang.worldbooks.v1';
      const saved = JSON.parse(localStorage.getItem(key));
      Object.assign(saved.dining.inventory, { 'frost-oyster': 2, milk: 3 });
      Object.assign(saved.daily.active.shift, {
        version: 3,
        seed: 17,
        bookings: null,
        special: null,
        staffLevels: {},
      });
      localStorage.setItem(key, JSON.stringify(saved));
    });
    await page.reload();
    await service.locator('.service-map[data-service-scene="ready"]').waitFor({ timeout: 60000 });
    await page.clock.fastForward(7500);
    const arriving = service.locator('[data-route-guest="2"][data-direction="enter"]');
    for (let i = 0; i < 12 && !(await arriving.isVisible()); i++) await page.clock.fastForward(500);
    await arriving.waitFor();
    assert.equal(await service.locator('[data-service-actor]').count(), 2);
    const room = await service.locator('.service-map').boundingBox();
    const occupiedLabel = await service.locator('[data-service-seat="hall"]').boundingBox();
    assert(occupiedLabel.x > room.x + room.width * 0.15, 'disabled table markers stay projected');
    await page.screenshot({ path: path.join(output, 'daily-service-rush.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await ticket('front', /1号 · 迎宾排座/);
    await workspace.waitFor();
    const workcard = workspace.locator('.service-workcard');
    await workcard.evaluate((element) =>
      Promise.allSettled(element.getAnimations().map((animation) => animation.finished)),
    );
    const board = await service.boundingBox();
    const center = await service.locator('.service-map').boundingBox();
    const card = await workcard.boundingBox();
    assert(card.width >= center.width * 1.02, JSON.stringify({ board, center, card }));
    assert(card.width >= board.width * 0.58, 'the game stage uses the screen center');
    assert(
      Math.abs(card.x + card.width / 2 - (board.x + board.width / 2)) < 8,
      'the game stage is horizontally centered',
    );
    assert(
      Math.abs(card.y + card.height / 2 - (board.y + board.height / 2)) < 24,
      'the game stage is vertically centered',
    );
    const options = await Promise.all(
      (await workspace.locator('.service-seat-cards button').all()).map((item) =>
        item.boundingBox(),
      ),
    );
    assert(
      options.every((option) => Math.abs(option.y - options[0].y) < 8 && option.width > 52),
      JSON.stringify({ card, options }),
    );
    assert(
      options.every((option) => option.y + option.height <= card.y + card.height),
      JSON.stringify({ card, options }),
    );
    const [front, cook, server, clean] = await Promise.all(
      ['front', 'cook', 'server', 'clean'].map((role) =>
        service.locator(`[data-station="${role}"]`).boundingBox(),
      ),
    );
    assert(front.x === cook.x && front.y < cook.y && front.x + front.width <= center.x);
    assert(server.x === clean.x && server.y < clean.y && server.x >= center.x + center.width);
    assert([front, cook, server, clean].every((station) => station.width >= 115));
    await page.screenshot({ path: path.join(output, 'daily-service-landscape.png') });
    await chooseSeat('hall');
    await ticket('server', /1号 · 确认点单/);
    await pick('香草烤鸡');
    await ticket('cook', /1号 · 制作菜品/);
    assert.equal(await workspace.locator('.service-meter').count(), 1);
    assert((await workspace.locator('.service-fx i').count()) >= 12);
    await page.screenshot({ path: path.join(output, 'daily-service-touch-layout.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    const portraitHeat = await workspace.locator('[data-activity="heat"]').boundingBox();
    assert(
      portraitHeat.width >= 320 && portraitHeat.height >= 180,
      JSON.stringify({ portraitHeat }),
    );
    await page.screenshot({ path: path.join(output, 'daily-service-portrait.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    const heat = await workspace.locator('[data-activity="heat"]').boundingBox();
    const gameCard = await workspace.locator('.service-workcard').boundingBox();
    assert(
      heat.width >= gameCard.width * 0.9 && heat.height >= gameCard.height * 0.58,
      JSON.stringify({ heat, gameCard }),
    );
    const touch = await page.context().newCDPSession(page);
    try {
      async function touchPoints(fraction) {
        const [x, y] = await activityScreenPoint('heat', fraction, 0.81);
        return [{ x, y }];
      }
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: await touchPoints(0.25),
      });
      await touch.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: await touchPoints(0.64),
      });
      await service
        .locator('[data-station="server"]')
        .getByRole('button', { name: /1号 · 配盘送餐/ })
        .waitFor();
      await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } finally {
      await touch.detach();
    }
    await ticket('front', /2号 · 迎宾排座/);
    await chooseSeat('window');
    await ticket('server', /2号 · 确认点单/);
    await pick('田园煎鱼');
    await pick('薄荷蜜茶');
    await ticket('cook', /2号 · 制作菜品/);
    await page.mouse.move(...(await activityScreenPoint('cut', 0.18, 0.52)));
    await page.mouse.down();
    await page.mouse.move(...(await activityScreenPoint('cut', 0.8, 0.52)), { steps: 12 });
    assert.equal(await workspace.locator('[data-activity="cut"] [data-cleared]').count(), 3);
    await page.mouse.up();
    await workspace.locator('[data-activity="pour"]').waitFor();
    await page.mouse.move(...(await activityScreenPoint('pour', 0.24, 0.38)));
    await page.mouse.down();
    await page.mouse.move(...(await activityScreenPoint('pour', 0.59, 0.28)));
    const pouring = workspace.locator('[data-activity="pour"][data-flow]');
    await pouring.waitFor();
    await page.screenshot({ path: path.join(output, 'daily-service-pouring.png') });
    await page.waitForFunction(() => {
      const area = document.querySelector('[data-activity="pour"]');
      return (
        area?.hasAttribute('data-flow') &&
        Number(area.querySelector('[data-cook-liquid]').getAttribute('height')) >= 64
      );
    });
    await service.dispatchEvent('pointercancel', { pointerId: 1 });
    await pouring.waitFor({ state: 'hidden' });
    await page.mouse.up();
    await workspace.locator('[data-activity="pour"]').waitFor();
    await page.mouse.down();
    await page.mouse.move(...(await activityScreenPoint('pour', 0.28, 0.28)));
    await page.mouse.up();
    await ticket('server', /2号 · 配盘送餐/);
    const tile = workspace.locator('[data-drag-choice="田园煎鱼"]');
    const plate = workspace.locator('[data-service-dropzone="0"]');
    const tileBox = await tile.boundingBox();
    const plateBox = await plate.boundingBox();
    await page.mouse.move(tileBox.x + tileBox.width / 2, tileBox.y + tileBox.height / 2);
    await page.mouse.down();
    const dragPreview = service.locator('.service-drag-preview');
    await dragPreview.waitFor();
    const dropPoint = { x: plateBox.x + plateBox.width / 2, y: plateBox.y + plateBox.height / 2 };
    await page.mouse.move(dropPoint.x, dropPoint.y);
    assert.equal(await plate.getAttribute('data-drop-hover'), '');
    await page.waitForFunction(({ x, y }) => {
      const box = document.querySelector('.service-drag-preview').getBoundingClientRect();
      return Math.abs(box.left + box.width / 2 - x) < 3 && Math.abs(box.bottom - y) < 3;
    }, dropPoint);
    await page.screenshot({ path: path.join(output, 'daily-service-dragging.png') });
    await page.mouse.up();
    assert.equal(await plate.getAttribute('data-filled'), 'true');
    await dragPreview.waitFor({ state: 'hidden' });
    await page.screenshot({ path: path.join(output, 'daily-service-plating.png') });
    const lostAlert = service.locator('.service-alert');
    let lost = false;
    for (let second = 0; second < 45 && !lost; second++) {
      await page.clock.fastForward(1000);
      lost = await lostAlert.isVisible();
    }
    assert(lost, 'a guest who waits too long raises the loss alert');
    assert.match(await lostAlert.innerText(), /客人等太久离开了/);
    assert.deepEqual(errors, []);
    return {
      fourRoles: true,
      dragAndWipe: true,
      centerWorkspace: true,
      shiftReceipt: true,
      outingTwenty: true,
      invitationStages: true,
      recruited: true,
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
