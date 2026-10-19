import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { adviceNativeChecks } from './advice-preset.mjs';
import { legacySession } from './legacy-session.mjs';
import { lootConflictChecks } from './loot-conflicts.mjs';
import { memoryChat } from '../../src/memory.js';

export async function chatChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [],
    sent = [];
  let releaseChat, releaseQuick;
  page.on('pageerror', (error) => errors.push(error.message));
  await legacySession(page);
  await page.addInitScript(() => {
    if (window.origin === 'null') return;
    const key = 'wanxiang.worldbooks.v1';
    const library = JSON.parse(localStorage.getItem(key));
    if (!library.archives.items.some((item) => item.id === 'map-item-probe')) {
      library.archives.items.push({
        id: 'map-item-probe',
        name: '归档石晶',
        description: '先前拾取的遗迹石晶',
        value: 7,
        map: 'ruins',
        converted: true,
        source: { runId: 'older', title: '旧探险', map: 'ruins', encounter: 0 },
      });
      localStorage.setItem(key, JSON.stringify(library));
    }
  });
  try {
    const summaryRequests = [];
    await page.route('**/api/ai/generate/summary', async (route) => {
      const input = route.request().postDataJSON();
      summaryRequests.push(input);
      await route.fulfill({
        json: {
          items: input.items.map((item) => ({ id: item.id, summary: `精简记忆：${item.label}` })),
          usage: { input: 80, output: 20 },
        },
      });
    });
    await page.route('**/api/ai/generate/chat', async (route) => {
      sent.push(route.request().postDataJSON());
      if (sent.length === 1)
        await new Promise((resolve) => {
          releaseChat = resolve;
        });
      const result = {
        content: '<p>我们就在酒馆聊聊。</p>',
        display: '<p><b>我们就在酒馆聊聊。</b></p>',
        usage: { input: 90, output: 15 },
        request: { tokens: { inputEstimate: 100, tokenizer: 'o200k_base' }, warnings: [] },
      };
      const deltas = [
        '<konatan_planning~>格式：<wanxiang_chat>思考引用</wanxiang_chat>，<wanxiang_actions>{}</wanxiang_actions>。',
        '</konatan_planning~><tucao>格式说明</tucao><wanxiang_ch',
        'at><p>我们就在',
        '酒馆聊聊。</p></wanxiang_',
        'chat>',
      ];
      await route.fulfill({
        contentType: 'text/event-stream',
        body:
          deltas.map((delta) => `data: ${JSON.stringify({ type: 'delta', delta })}\n\n`).join('') +
          `data: ${JSON.stringify({ type: 'complete', result })}\n\n`,
      });
    });
    await page.route('**/api/ai/generate/quick-chat', async (route) => {
      sent.push(route.request().postDataJSON());
      await new Promise((resolve) => {
        releaseQuick = resolve;
      });
      await route.fulfill({
        json: {
          content: '留意前面。',
          display: '留意前面。',
          usage: { input: 40, output: 5 },
          request: { tokens: { inputEstimate: 50, tokenizer: 'o200k_base' }, warnings: [] },
        },
      });
    });
    await page.route('**/api/ai/generate/script', async (route) => {
      const payload = route.request().postDataJSON();
      sent.push(payload);
      const book = await page.evaluate(() => demo.getActiveScript());
      await route.fulfill({
        json: {
          entry: {
            ...book,
            story: Array.from({ length: 5 }, (_, index) => `新剧本第${index + 1}段`),
          },
          diagnostic: { request: { tokens: { inputEstimate: 300 } } },
        },
      });
    });
    await page.goto(baseURL);
    await page.waitForFunction(() => window.demo?.getStatus().mode === 'inn');
    const inn = page.frameLocator('#inn-frame iframe');
    await inn.locator('#talk-open').waitFor({ state: 'visible', timeout: 60000 });
    for (const place of ['bar', 'bar2', 'table', 'table2']) {
      await inn
        .locator('canvas')
        .evaluate((_element, id) => window.assetPreview.placeNow(id), place);
      await inn.locator('#talk-open').click();
      await page.locator('#chat-dialog').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#chat-participants input').count(), 6);
      await page.locator('#chat-close').click();
    }
    await inn.locator('#talk-open').click();
    for (const checkbox of await page.locator('#chat-participants input').all())
      await checkbox.uncheck();
    await page.locator('#chat-participants input').nth(0).check();
    await page.locator('#chat-participants input').nth(2).check();
    assert.equal(await page.locator('#chat-choose').isVisible(), false);
    assert.equal(await page.locator('#chat-participants .chat-person').count(), 6);
    assert.equal(await page.locator('#chat-player img').count(), 1);
    await page.screenshot({ path: path.join(output, 'tavern-chat-guests.png') });
    const before = await page.evaluate(() => ({
      inventory: demo.getLibrary().inventory,
      characters: demo.getLibrary().characters,
    }));
    await page.evaluate(() => {
      window.streamedChatTexts = [];
      window.chatStreamObserver = new MutationObserver((records) => {
        for (const record of records) {
          if (!record.target.matches?.('.is-pending .mes_text')) continue;
          for (const node of record.addedNodes)
            if (node.nodeType === Node.TEXT_NODE) window.streamedChatTexts.push(node.textContent);
        }
      });
      window.chatStreamObserver.observe(document.querySelector('#chat-messages'), {
        childList: true,
        subtree: true,
      });
    });
    await page.locator('#chat-input').fill('我给来客倒一杯水。');
    await page.locator('#chat-input').press('Enter');
    await page.waitForFunction(
      () => demo.getLibrary().tavernChat.filter((item) => item.role !== 'system').length === 1,
    );
    assert.equal(await page.locator('#chat-input').inputValue(), '');
    await page.locator('#chat-input').fill('下一句草稿');
    while (!releaseChat) await page.waitForTimeout(25);
    releaseChat();
    await page.locator('#chat-status').filter({ hasText: '100 TK' }).waitFor();
    const streamedTexts = await page.evaluate(() => {
      window.chatStreamObserver.disconnect();
      return window.streamedChatTexts;
    });
    assert(streamedTexts.includes('<p>我们就在酒馆聊聊。</p>'));
    assert(streamedTexts.every((text) => !/思考引用|格式说明|wanxiang_/u.test(text)));
    assert.equal(await page.locator('#chat-input').inputValue(), '下一句草稿');
    assert.equal(sent[0].selected.length, 2);
    assert.equal(sent[0].place, 'table2');
    await page.frameLocator('#chat-messages iframe').locator('b').waitFor();
    await page
      .frameLocator('#chat-messages iframe')
      .locator('b')
      .evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      );
    const frameBounds = await page.locator('#chat-messages iframe').boundingBox();
    const textBounds = await page.frameLocator('#chat-messages iframe').locator('b').boundingBox();
    assert(
      textBounds.y >= frameBounds.y &&
        textBounds.y + textBounds.height <= frameBounds.y + frameBounds.height,
      'HTML reply must be visible inside its message frame',
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        inventory: demo.getLibrary().inventory,
        characters: demo.getLibrary().characters,
      })),
      before,
    );
    await page.screenshot({ path: path.join(output, 'tavern-chat.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    const dialog = await page.locator('#chat-dialog').boundingBox();
    const composer = await page.locator('#chat-form').boundingBox();
    assert(
      dialog.height < 390 &&
        composer.y >= dialog.y &&
        composer.y + composer.height <= dialog.y + dialog.height,
    );
    await page.screenshot({ path: path.join(output, 'tavern-chat-landscape.png') });
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.locator('#chat-memory-open').click();
    await page.locator('#memory-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#memory-items article').count(), 1);
    await page.locator('#memory-generate').click();
    await page.locator('#memory-accept').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#memory-accept').disabled);
    assert(
      (await page.evaluate(() => demo.getLibrary().tavernChat)).every(
        (item) => !item.summary && !item.turnSummary,
      ),
      'generation cannot save before acceptance',
    );
    assert(
      summaryRequests[0].items.every(
        (item) => Object.keys(item).sort().join(',') === 'id,kind,label,text',
      ),
    );
    assert.equal(summaryRequests[0].items.length, 1);
    assert(summaryRequests[0].items[0].text.includes('我给来客倒一杯水。'));
    assert(summaryRequests[0].items[0].text.includes('我们就在酒馆聊聊。'));
    await page.locator('#memory-items textarea').first().fill('玩家给来客倒了一杯水。');
    await page.screenshot({ path: path.join(output, 'memory-summary-preview.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    const memoryDialog = await page.locator('#memory-dialog').boundingBox();
    const memoryFooter = await page.locator('#memory-dialog footer').boundingBox();
    assert(memoryFooter.y + memoryFooter.height <= memoryDialog.y + memoryDialog.height);
    await page.screenshot({ path: path.join(output, 'memory-summary-landscape.png') });
    await page.locator('#memory-accept').click();
    await page.locator('#memory-dialog').waitFor({ state: 'hidden' });
    await page.setViewportSize({ width: 1440, height: 836 });
    const summarized = await page.evaluate(() =>
      demo.getLibrary().tavernChat.filter((item) => item.role !== 'system'),
    );
    assert.equal(summarized[0].content, '我给来客倒一杯水。');
    assert.equal(summarized[1].turnSummary.text, '玩家给来客倒了一杯水。');
    assert.equal(await page.locator('.chat-room-heading').count(), 0);
    for (const checkbox of await page.locator('#chat-participants input').all())
      await checkbox.uncheck();
    await page.locator('#chat-participants input').nth(1).check();
    assert.equal(await page.locator('#chat-messages .mes').count(), 2);
    assert.equal(await page.locator('#chat-messages .mes_avatar img').count(), 3);
    await page.locator('#chat-input').fill('再说一句。');
    await page.locator('#chat-input').press('Shift+Enter');
    assert((await page.locator('#chat-input').inputValue()).includes('\n'));
    await page.locator('#chat-input').dispatchEvent('keydown', { key: 'Enter', isComposing: true });
    assert.equal(sent.length, 1, 'IME confirmation must not send');
    await page.locator('#chat-input').press('Enter');
    await page.waitForFunction(
      () => demo.getLibrary().tavernChat.filter((item) => item.role !== 'system').length === 4,
    );
    assert.equal(sent[1].history.filter((item) => item.role !== 'system').length, 1);
    assert(
      sent[1].history.some(
        (message) => message.role === 'system' && message.content.includes('离开了'),
      ),
    );
    assert(
      sent[1].history
        .filter((item) => item.role !== 'system')
        .every((item) => item.content.startsWith('【已确认对话摘要】')),
    );
    assert.equal(sent[1].selected.length, 1);
    await page.locator('#chat-place-select').selectOption('bar');
    assert.equal(await page.locator('#chat-place').textContent(), '吧台');
    assert.equal(await page.locator('#chat-messages .mes').count(), 4);
    assert((await page.locator('.chat-divider').last().textContent()).includes('吧台'));
    assert(!JSON.stringify(sent[1].history).includes('speakerIds'));
    await page.locator('#chat-close').click();
    await page.reload();
    await page.waitForFunction(
      () =>
        window.demo?.getLibrary().tavernChat.filter((item) => item.role !== 'system').length === 4,
    );
    assert.equal(
      (
        await page.evaluate(() =>
          demo.getLibrary().tavernChat.filter((item) => item.role !== 'system'),
        )
      )[1].turnSummary.text,
      '玩家给来客倒了一杯水。',
    );
    await page.evaluate(() => demo.startBattle());
    await page.waitForFunction(
      () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
    );
    const battle = await page.evaluate(() => ({
      state: demo.getState(),
      expedition: demo.getExpedition(),
      script: demo.getActiveScript(),
    }));
    await page.locator('#story-toggle').click();
    await page.locator('#quick-chat-input').fill('如果下一站能看到灯火就好了。');
    await page.locator('#quick-chat-input').press('Enter');
    await page.waitForFunction(() => demo.getChat().quick.length === 1);
    assert.equal(await page.locator('#quick-chat-input').inputValue(), '');
    await page.locator('#quick-chat-input').fill('下一句闲聊');
    while (!releaseQuick) await page.waitForTimeout(25);
    releaseQuick();
    await page.locator('#quick-chat-status').filter({ hasText: '50 TK' }).waitFor();
    assert.equal(await page.locator('#quick-chat-input').inputValue(), '下一句闲聊');
    assert.equal(sent[2].selected.length, 6);
    assert.equal(sent[2].previousScript, '');
    assert.equal(await page.locator('#quick-memory-open').count(), 0);
    const readingHeight = (await page.locator('#story-lines').boundingBox()).height;
    await page.locator('#quick-chat-toggle').click();
    assert.equal(await page.locator('#quick-chat-body').isVisible(), false);
    assert.equal((await page.evaluate(() => demo.getChat().quick)).length, 2);
    assert.equal(await page.locator('#quick-chat-input').inputValue(), '下一句闲聊');
    assert((await page.locator('#story-lines').boundingBox()).height > readingHeight);
    await page.screenshot({ path: path.join(output, 'battle-quick-chat-collapsed.png') });
    await page.locator('#quick-chat-toggle').click();
    assert.equal(await page.locator('#quick-chat-body').isVisible(), true);
    await page.locator('#script-rewrite').click();
    await page.locator('#rewrite-help').waitFor({ state: 'visible' });
    await page.locator('#rewrite-help-remember').check();
    await page.locator('#rewrite-help-confirm').click();
    await page.locator('#quick-chat-status').filter({ hasText: '后续剧本已更新' }).waitFor();
    const after = await page.evaluate(() => ({
      state: demo.getState(),
      expedition: demo.getExpedition(),
      script: demo.getActiveScript(),
    }));
    assert.deepEqual(after.state, battle.state);
    assert.deepEqual(after.expedition, battle.expedition);
    assert.equal(after.script.story[0], battle.script.story[0]);
    assert.equal(after.script.story[1], '新剧本第2段');
    assert.equal((await page.evaluate(() => demo.getLibrary())).scripts.length, 1);
    assert.equal(sent[3].rewrite.conversations.length, 2);
    assert.equal(sent[3].rewrite.lockedThrough, 0);
    assert(sent[2].archiveContext.items.some((item) => item.name === '归档石晶'));
    assert(sent[3].archiveContext.items.some((item) => item.name === '归档石晶'));
    assert(
      !(await page.evaluate(() => demo.getLibrary().tavernChat)).some(
        (message) => message.role === 'system' || message.divider,
      ),
    );
    assert.equal(sent[3].brief, battle.script.generationInput.brief);
    assert.equal(
      await page.evaluate(() => localStorage.getItem('wanxiang.rewrite-help.dismissed.v1')),
      'true',
    );
    const secondRewrite = page.waitForResponse((response) =>
      response.url().endsWith('/api/ai/generate/script'),
    );
    await page.locator('#script-rewrite').click();
    await secondRewrite;
    assert.equal(await page.locator('#rewrite-help').isVisible(), false);
    await page.waitForFunction(() => !document.querySelector('#script-rewrite').disabled);
    const quickRetryRequests = [];
    await page.route('**/api/ai/generate/quick-chat', (route) => {
      quickRetryRequests.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          content: '重试后的战间回应。',
          display: '重试后的战间回应。',
          usage: { input: 40, output: 8 },
          request: { tokens: { inputEstimate: 50, tokenizer: 'o200k_base' }, warnings: [] },
        },
      });
    });
    await page.locator('#quick-chat-log [data-chat-retry]').click();
    await page.waitForFunction(() => demo.getChat().quick[1]?.content === '重试后的战间回应。');
    await page.waitForFunction(() => !document.querySelector('#quick-chat-send').disabled);
    assert.equal(quickRetryRequests.length, 1);
    assert.equal(quickRetryRequests[0].text, '如果下一站能看到灯火就好了。');
    assert.deepEqual(quickRetryRequests[0].history, []);
    assert.equal((await page.evaluate(() => demo.getChat().quick)).length, 2);
    assert.equal(await page.locator('#quick-chat-input').inputValue(), '下一句闲聊');
    assert.deepEqual(await page.evaluate(() => demo.getState()), battle.state);
    await page.screenshot({ path: path.join(output, 'battle-quick-chat.png') });
    await page.locator('#story-close').click();
    await page.evaluate(() => demo.returnInn());
    assert.deepEqual(await page.evaluate(() => demo.getChat().quick), []);
    await page
      .frameLocator('#inn-frame iframe')
      .locator('#talk-open')
      .waitFor({ state: 'visible' });
    await page.frameLocator('#inn-frame iframe').locator('#talk-open').click();
    await page.locator('#chat-messages .mes [data-chat-delete]').last().click();
    assert.equal(
      (
        await page.evaluate(() =>
          demo.getLibrary().tavernChat.filter((item) => item.role !== 'system'),
        )
      ).length,
      3,
    );
    const relationshipSnapshot = await page.evaluate(() => demo.getLibrary().relationships);
    const rawText =
      '<wanxiang_chat>完整正文仍在这里。<img src=x onerror="window.BAD_CHAT_RAW=true"></wanxiang_chat><wanxiang_actions>{"affection":[{"id":"unknown","delta":99}]}</wanxiang_actions>';
    for (const live of [false, true]) {
      await page.route('**/api/ai/generate/chat', (route) => {
        const failure = { type: 'error', error: '好感度或同行指令无效', diagnostic: { rawText } };
        return route.fulfill(
          live
            ? { contentType: 'text/event-stream', body: `data: ${JSON.stringify(failure)}\n\n` }
            : { status: 400, json: failure },
        );
      });
      await page.locator('#chat-input').fill(`校验失败原文测试 ${live}`);
      await page.locator('#chat-input').press('Enter');
      await page.locator('.chat-response-error').last().waitFor();
      await page.waitForFunction(() => !document.querySelector('#chat-send').disabled);
      assert.equal(await page.locator('.chat-response-error pre').last().textContent(), rawText);
      assert.equal(await page.locator('.chat-response-error img').count(), 0);
    }
    await page.locator('#chat-place-select').selectOption('table');
    assert.equal(await page.locator('.chat-response-error').count(), 2);
    assert.deepEqual(
      await page.evaluate(() => demo.getLibrary().relationships),
      relationshipSnapshot,
    );
    assert(
      !JSON.stringify(await page.evaluate(() => demo.getLibrary().tavernChat)).includes(rawText),
    );
    await page.screenshot({ path: path.join(output, 'chat-invalid-actions-raw.png') });
    const retryRequests = [];
    let releaseRetry;
    await page.route('**/api/ai/generate/chat', async (route) => {
      retryRequests.push(route.request().postDataJSON());
      if (retryRequests.length === 1)
        await new Promise((resolve) => {
          releaseRetry = resolve;
        });
      await route.fulfill({
        json: {
          content: `重试后的圆桌回应 ${retryRequests.length}`,
          display: `重试后的圆桌回应 ${retryRequests.length}`,
          actions: {
            affection: [{ id: 'official-aegis', delta: 2 }],
            agreeToAdventure: retryRequests.length === 2 ? ['official-morrow'] : [],
          },
          usage: { input: 30, output: 10 },
          request: { tokens: { inputEstimate: 40, tokenizer: 'o200k_base' }, warnings: [] },
        },
      });
    });
    const beforeRetry = await page.evaluate(() => demo.getLibrary().tavernChat);
    const chosen = beforeRetry.find((message) => message.content === '校验失败原文测试 false');
    const later = beforeRetry.find((message) => message.content === '校验失败原文测试 true');
    await page.locator('#chat-input').fill('这份草稿不要清除');
    await page.locator(`[data-message-id="${chosen.id}"] [data-chat-retry]`).click();
    assert.equal(await page.locator('#chat-messages [data-chat-retry]:enabled').count(), 0);
    while (!releaseRetry) await page.waitForTimeout(25);
    releaseRetry();
    await page.waitForFunction(() =>
      demo.getLibrary().tavernChat.some((message) => message.content === '重试后的圆桌回应 1'),
    );
    await page.waitForFunction(() => !document.querySelector('#chat-send').disabled);
    assert.equal(retryRequests.length, 1);
    assert.equal(retryRequests[0].text, chosen.content);
    assert(
      !retryRequests[0].history.some(
        (message) => message.content === chosen.content || message.content === later.content,
      ),
    );
    assert.equal(
      retryRequests[0].history.length,
      memoryChat(
        beforeRetry.slice(
          0,
          beforeRetry.findIndex((message) => message.id === chosen.id),
        ),
      ).length,
    );
    const retried = await page.evaluate(() => demo.getLibrary());
    const position = retried.tavernChat.findIndex((message) => message.id === chosen.id);
    assert.equal(retried.tavernChat[position + 1].content, '重试后的圆桌回应 1');
    assert.equal(retried.tavernChat[position + 2].id, later.id);
    assert.equal(
      retried.tavernChat.filter((message) => message.role === 'user').length,
      beforeRetry.filter((message) => message.role === 'user').length,
    );
    assert.equal(await page.locator('.chat-response-error').count(), 1);
    assert.equal(await page.locator('#chat-input').inputValue(), '这份草稿不要清除');
    await page.locator(`[data-message-id="${chosen.id}"] [data-chat-retry]`).click();
    await page.waitForFunction(() =>
      demo.getLibrary().tavernChat.some((message) => message.content === '重试后的圆桌回应 2'),
    );
    await page.waitForFunction(() => !document.querySelector('#chat-send').disabled);
    const twice = await page.evaluate(() => demo.getLibrary());
    assert.equal(twice.tavernChat.length, retried.tavernChat.length);
    assert.deepEqual(
      twice.relationships['official-aegis'],
      retried.relationships['official-aegis'],
      'Regeneration cannot award affection twice',
    );
    assert.equal(
      twice.relationships['official-morrow'].agreed,
      true,
      'An agreement in the regenerated response still takes effect',
    );
    assert(!twice.tavernChat.some((message) => message.content === '重试后的圆桌回应 1'));
    await page.screenshot({ path: path.join(output, 'chat-retry-selected-message.png') });
    await page.locator('#chat-close').click();
    // Importing/choosing a preset boots real scripts; preset RPC changes the actual saved prompt.
    const adviceFile = process.env.WANXIANG_TEST_ADVICE_PRESET_FILE;
    const adviceOriginal = adviceFile ? await readFile(adviceFile, 'utf8') : null;
    const setup = await page.evaluate(
      async (adviceSource) => {
        const post = async (route, data) =>
          (
            await fetch('/api/ai/' + route, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(data),
            })
          ).json();
        const base = {
          prompts: [
            { identifier: 'main', name: '主提示', role: 'system', content: 'test' },
            { identifier: 'chatHistory', marker: true },
          ],
          top_k: 36,
          stream_openai: true,
          reasoning_effort: 'high',
        };
        const helper = await post('prompts/save', {
          preset: {
            ...base,
            name: '扩展兼容验收',
            extensions: {
              regex_scripts: [{ findRegex: 'test', replaceString: '测试' }],
              tavern_helper: {
                scripts: [
                  {
                    id: 'toggle',
                    name: '开关',
                    enabled: true,
                    content: `const button = $('<button id="fixture-toggle">关闭主提示</button>').appendTo('body'); button.on('click', async () => { await updatePresetWith('in_use', preset => { preset.prompts.find(prompt => prompt.id === 'main').enabled = false; return preset; }); button.text('已关闭'); });`,
                  },
                  {
                    id: 'disabled',
                    enabled: false,
                    content: `document.body.append('DISABLED_SCRIPT_MUST_NOT_RUN');`,
                  },
                ],
              },
            },
          },
        });
        const empty = await post('prompts/save', { preset: { ...base, name: '无扩展验收' } });
        const transport = await post('prompts/save', {
          preset: {
            ...base,
            name: 'Kemini传输开关验收',
            extensions: {
              tavern_helper: {
                scripts: [
                  {
                    id: '2c7d747c-22d4-4e8b-95f8-5620b552fe6e',
                    name: 'Kemini',
                    enabled: true,
                    content: 'void 0;',
                  },
                ],
              },
            },
          },
        });
        const advice = adviceSource ? await post('prompts/save', { preset: adviceSource }) : null;
        await post('prompts/select', { kind: 'chat', id: helper.preset.id });
        return {
          helper: helper.preset.id,
          empty: empty.preset.id,
          transport: transport.preset.id,
          advice: advice?.preset.id,
        };
      },
      adviceOriginal ? JSON.parse(adviceOriginal) : null,
    );
    await page.locator('#ai-open').click();
    await page.locator('[data-ai-tab="prompts"]').click();
    await page.locator('#prompt-kind').selectOption('chat');
    await page.locator('#helper-open').click();
    const helper = page.frameLocator('#helper-frame');
    await helper.locator('#fixture-toggle').waitFor();
    assert(!(await helper.locator('body').innerText()).includes('DISABLED_SCRIPT_MUST_NOT_RUN'));
    await helper.locator('#fixture-toggle').click();
    await helper.locator('#fixture-toggle').filter({ hasText: '已关闭' }).waitFor();
    const enabled = await page.evaluate(
      async (id) =>
        (await (await fetch('/api/ai/prompts/' + id)).json()).preset.prompt_order[0].order.find(
          (item) => item.identifier === 'main',
        ).enabled,
      setup.helper,
    );
    assert.equal(enabled, false);
    await page.screenshot({ path: path.join(output, 'preset-helper-window.png') });
    await page.locator('#helper-close').click();
    await page.locator('#prompt-select').selectOption(setup.empty);
    await page.locator('#helper-open').click();
    await helper.locator('#fixture-toggle').waitFor({ state: 'detached' });
    assert.equal(await helper.locator('#fixture-toggle').count(), 0);
    await page.locator('#helper-close').click();
    await page.locator('[data-ai-tab="prompts"]').click();
    await page.locator('[data-sampling="top_k"]').fill('42');
    await page.locator('[data-sampling="contextSize"]').fill('64000');
    await page.locator('[data-sampling="maxTokens"]').fill('2000');
    await page.locator('[data-sampling="stream"]').selectOption('false');
    await page.locator('[data-sampling="reasoning_effort"]').selectOption('low');
    await page.locator('#prompt-save').click();
    await page.locator('#ai-status').filter({ hasText: '分层提示词已保存' }).waitFor();
    const sampling = await page.evaluate(
      async (id) => (await (await fetch('/api/ai/prompts/' + id)).json()).preset,
      setup.empty,
    );
    assert.equal(sampling.top_k, 42);
    assert.equal(sampling.contextSize, 64000);
    assert.equal(sampling.maxTokens, 2000);
    assert.equal(sampling.stream, false);
    assert.equal(sampling.reasoning_effort, 'low');
    await page.locator('#prompt-select').selectOption(setup.transport);
    await page.locator('#helper-open').click();
    const transport = helper.locator('[data-kemini-transport]');
    await transport.filter({ hasText: '已开启' }).waitFor();
    await transport.click();
    await transport.filter({ hasText: '已关闭' }).waitFor();
    const scoped = await helper.locator('body').evaluate(async () => {
      await window.replaceVariables({ flag: 'global-private' }, { type: 'global' });
      await window.insertOrAssignVariables({ flag: 'script-private' }, { type: 'script' });
      return {
        global: window.getVariables({ type: 'global' }),
        script: window.getVariables({ type: 'script' }),
      };
    });
    assert.equal(scoped.global.flag, 'global-private');
    assert.equal(scoped.script.flag, 'script-private');
    assert.equal(scoped.script.keminiCompanion.antiTruncationEnabled, false);
    const preview = await page.evaluate(async () =>
      (
        await fetch('/api/ai/prompts/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            kind: 'chat',
            input: { text: '开关验证', place: 'table', characters: [], selected: [], history: [] },
          }),
        })
      ).json(),
    );
    assert.equal(preview.transport.processingStatus.kemini, 'disabled');
    assert(!preview.transport.outputTool);
    assert(!JSON.stringify(preview).includes('global-private'));
    await page.screenshot({ path: path.join(output, 'kemini-transport-off.png') });
    await page.locator('#helper-close').click();
    await page.locator('#prompt-select').selectOption(setup.empty);
    await page.locator('#prompt-select').selectOption(setup.transport);
    await page.locator('#helper-open').click();
    await helper.locator('[data-kemini-transport]').filter({ hasText: '已关闭' }).waitFor();
    await page.locator('#helper-close').click();
    if (setup.advice) {
      await adviceNativeChecks({ page, helper, inn, setup, output });
      assert.equal(await readFile(adviceFile, 'utf8'), adviceOriginal);
    }
    await lootConflictChecks({ page, output });
    assert.deepEqual(errors, []);
    await page.evaluate(async (ids) => {
      for (const id of ids)
        await fetch('/api/ai/prompts/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id }),
        });
    }, [setup.helper, setup.empty, setup.transport, setup.advice].filter(Boolean));
    return {
      seats: 4,
      multiselect: true,
      html: true,
      streaming: true,
      persistence: true,
      unifiedHistoryAcrossRecipients: true,
      enterAndImmediateClear: true,
      portraitsAndContinuousConversation: true,
      isolatedBattle: true,
      futureRewrite: true,
      presetScripts: true,
      disabledScripts: true,
      nativeAdviceSwitch: Boolean(setup.advice),
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'chat-failure.png') }).catch(() => {});
    throw failure;
  } finally {
    await page.close();
  }
}
