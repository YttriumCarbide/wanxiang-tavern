import { legacySession, finishSettlement } from './legacy-session.mjs';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import path from 'node:path';
import {
  characterResponse,
  characterDocument,
  scriptV5Fixture,
  requestContext,
  tavernPresetFixture,
} from '../fixtures/ai.js';
import { buildPlan } from '../planner.js';
import { abilityFor } from '../../src/catalog.js';
import { scriptProseReport } from '../../src/ai/script-prose.js';

export async function generationChecks({ browser, baseURL, output }) {
  const calls = [];
  const provider = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/models') {
      res.end(JSON.stringify({ data: [{ id: 'mock-model' }] }));
      return;
    }
    let text = '';
    for await (const chunk of req) text += chunk;
    const request = JSON.parse(text),
      character = /CHARACTER v[34]/.test(request.messages.at(-1).content);
    calls.push(request);
    const context = requestContext(request.messages);
    const badCharacter = characterDocument();
    badCharacter.setting.attack.description_note = '不属于协议的辅助备注';
    badCharacter.data.hp = 999;
    badCharacter.data.mp = 'wrong';
    const document = character
      ? badCharacter
      : scriptV5Fixture(context.characters.greenLight.map((entry) => entry.id));
    const result =
      '<other>标签外文字</other>\n<wanxiang_json>@@RAW@@```json\n' +
      JSON.stringify(document).slice(0, -1) +
      ',}\n```</wanxiang_json>';
    await new Promise((resolve) => setTimeout(resolve, 700));
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: result },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 200 },
      }),
    );
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const providerURL = `http://127.0.0.1:${provider.address().port}/v1`;
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await legacySession(page);
    await page.goto(baseURL);
    await page
      .frameLocator('iframe')
      .locator('#status')
      .waitFor({ state: 'detached', timeout: 60000 });
    await page.evaluate(() => {
      const key = 'wanxiang.worldbooks.v1';
      const library = JSON.parse(localStorage.getItem(key));
      library.inventory.summonContracts = 1;
      localStorage.setItem(key, JSON.stringify(library));
      localStorage.setItem(
        'wanxiang.generation-options.v1',
        JSON.stringify({ developerMode: true, skipAiGeneration: false, allowRetreat: true }),
      );
    });
    await page.reload();
    await page
      .frameLocator('iframe')
      .locator('#status')
      .waitFor({ state: 'detached', timeout: 60000 });
    const inn = page.frames().find((frame) => frame.url().includes('tavern.html'));
    const crystals = await inn.evaluate(async () => {
      const pair = [];
      window.assetPreview.model.traverse((node) => {
        if (/^20_Summoning_Crystal_\d+$/.test(node.name)) pair.push(node);
      });
      const samples = [];
      for (let i = 0; i < 24; i++) {
        await new Promise(requestAnimationFrame);
        samples.push(pair.map((node) => node.position.y));
      }
      return samples;
    });
    assert(
      crystals.every((pair) => pair.length === 2 && Math.abs(pair[0] - pair[1]) < 0.00001),
      'Both summon crystals rise and fall together',
    );
    assert(
      Math.max(...crystals.map((pair) => pair[0])) - Math.min(...crystals.map((pair) => pair[0])) >
        0.001,
      'The synchronized crystals still animate',
    );
    await inn.evaluate(() => window.assetPreview.moveTo('summon'));
    await inn.locator('#summon-open').waitFor({ state: 'visible', timeout: 15000 });
    await inn.evaluate(() => {
      const preview = window.assetPreview;
      preview.look(preview.camera.rotation.y + Math.PI, preview.camera.rotation.x);
    });
    await inn.locator('#summon-open').waitFor({ state: 'hidden' });
    await inn.evaluate(() => window.assetPreview.placeNow('summon'));
    await inn.locator('#summon-open').waitFor({ state: 'visible' });
    const summonRect = await inn.locator('#summon-open').boundingBox();
    assert(
      summonRect.x > 0 && summonRect.x + summonRect.width < 1440,
      'Summon button stays on the portal in view',
    );
    await inn.locator('#summon-open').click();
    await page.locator('[data-summon-mode="infinite"]').click();
    await page.locator('#summon-confirm').click();
    await page.locator('#summon-confirm').click();
    await page.locator('#ai-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ai-kind').inputValue(), 'character');
    assert.equal(calls.length, 0, 'Missing configuration opens settings without a generation call');
    // Save once, then use the same private connection preset from the other API page.
    await page.waitForFunction(() =>
      document.querySelector('#ai-status').textContent.includes('请先配置'),
    );
    await page.locator('#ai-baseUrl').fill(providerURL);
    await page.locator('#ai-model').fill('mock-model');
    await page.locator('#ai-key').fill('only-a-test-key');
    await page.locator('#api-preset-name').fill('共享测试连接');
    await page.locator('#api-preset-save').click();
    await page.waitForFunction(() =>
      document.querySelector('#ai-status').textContent.includes('连接预设已保存'),
    );
    const shared = await page.locator('#api-preset-select').inputValue();
    await page.locator('#ai-kind').selectOption('script');
    await page.locator('#api-preset-select').selectOption(shared);
    await page.waitForFunction(() => document.querySelector('#ai-model').value === 'mock-model');
    assert.equal(await page.locator('#ai-maxTokens').inputValue(), '32768');
    assert((await page.locator('#ai-key').getAttribute('placeholder')).includes('已配置'));
    await page.locator('#ai-model').fill('');
    await page.locator('#ai-profile-save').click();
    await page.waitForFunction(() =>
      document.querySelector('#ai-status').textContent.includes('当前连接已保存'),
    );
    await page.locator('#ai-regex').click();
    await page.locator('#regex-import-file').setInputFiles({
      name: '格式清理.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          scriptName: '移除包装标记',
          findRegex: '/^@@RAW@@/',
          replaceString: '',
          placement: [2],
        }),
      ),
    });
    await page.waitForFunction(() =>
      document.querySelector('#regex-status').textContent.includes('已导入'),
    );
    await page.locator('#regex-save').click();
    await page.waitForFunction(() =>
      document.querySelector('#regex-status').textContent.includes('已保存'),
    );
    await page.locator('#regex-dialog details summary').click();
    await page.locator('#regex-test-input').fill('@@RAW@@可读正文');
    await page.locator('#regex-test').click();
    await page.waitForFunction(
      () => document.querySelector('#regex-test-output').textContent === '可读正文',
    );
    await page.locator('#regex-close').click();
    await page.locator('#ai-kind').selectOption('character');
    await page.locator('[data-ai-tab="prompts"]').click();
    await page.locator('#prompt-import-file').setInputFiles({
      name: '酒馆验收.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(tavernPresetFixture())),
    });
    await page.waitForFunction(
      () => document.querySelector('#prompt-name').value === '酒馆导入验收',
    );
    await page.locator('[data-prompt-entry="main"]').waitFor();
    await page.locator('[data-prompt-entry="main"] [data-prompt-edit]').first().click();
    await page
      .locator('#prompt-entry-dialog textarea')
      .fill('你是角色设计API。浏览器已编辑这一层。{{brief}}');
    await page.locator('#prompt-entry-save').click();
    await page.locator('#prompt-add').click();
    const addedId = await page
      .locator('[data-prompt-entry]')
      .last()
      .getAttribute('data-prompt-entry');
    const added = page.locator(`[data-prompt-entry="${addedId}"]`);
    await page.locator('#prompt-entry-dialog [data-prompt-field="role"]').selectOption('user');
    await page.locator('#prompt-entry-dialog textarea').fill('新增的USER消息层。');
    await page.locator('#prompt-entry-save').click();
    for (let step = 0; step < 3; step++) await added.locator('[data-prompt-move="-1"]').click();
    await page.locator('#prompt-save').click();
    await page.waitForFunction(() =>
      document.querySelector('#ai-status').textContent.includes('分层提示词已保存'),
    );
    await page.locator('#prompt-preview').click();
    await page.waitForFunction(() =>
      document.querySelector('#ai-status').textContent.includes('没有调用API模型'),
    );
    const promptPreview = await page.locator('#ai-preview').textContent();
    assert(promptPreview.includes('浏览器已编辑这一层'));
    assert(promptPreview.includes('ASSISTANT') && promptPreview.includes('JSON输出格式 @D'));
    assert(
      promptPreview.includes('新增的USER消息层。') &&
        !promptPreview.includes('THIS_LAYER_MUST_NOT_BE_SENT'),
    );
    assert(!promptPreview.includes('{{brief}}'));
    assert.equal(calls.length, 0, 'Prompt previews never call the upstream API');
    assert((await page.locator('#ai-token-summary').textContent()).includes('TK'));
    await page.locator('#ai-worldbooks').click();
    await page.locator('#world-dialog').waitFor({ state: 'visible' });
    await page.locator('#world-import-file').setInputFiles({
      name: '世界书验收.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          name: '世界书验收',
          extensions: { roundTrip: 'preserve' },
          entries: {
            4: {
              uid: 4,
              comment: '公共细节',
              content: 'WORLD_TEST：酒馆窗边挂着铜铃。',
              constant: true,
              ignoreBudget: true,
              position: 0,
              order: 100,
            },
            5: {
              uid: 5,
              comment: '遗迹触发',
              content: 'RUINS_TEST：遗迹外有可供歇脚的石阶。',
              key: ['遗迹'],
              // Match the actual route, independently of the editable default task brief.
              matchScenario: true,
              ignoreBudget: true,
              position: 4,
              depth: 0,
              role: 0,
              extensions: { imported: true },
            },
          },
        }),
      ),
    });
    await page.waitForFunction(
      () =>
        document.querySelector('[data-world-field="content"]')?.value.includes('WORLD_TEST') &&
        document.querySelector('#world-status').textContent.includes('已保存'),
    );
    assert((await page.locator('#world-book-select option').count()) >= 1);
    assert.equal(await page.locator('[data-world-target="character"]').isChecked(), true);
    assert.equal(await page.locator('[data-world-target="script"]').isChecked(), true);
    const expandedWorldRow = page
      .locator('.world-entry-row')
      .filter({ has: page.locator('.world-editor') });
    assert.equal(await expandedWorldRow.locator('[data-world-head="position"] option').count(), 10);
    assert.equal(await page.locator('#world-delay-recursion').count(), 1);
    assert.equal(await page.locator('[data-world-field="excludeRecursion"]').count(), 1);
    await page
      .locator('[data-world-field="content"]')
      .fill('WORLD_TEST：酒馆窗边挂着铜铃，雨天会轻响。');
    await page.locator('#world-save').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-world-field="content"]')?.value.includes('WORLD_TEST') &&
        document.querySelector('#world-status').textContent.includes('已保存'),
    );
    await page.locator('#world-preview-button').click();
    await page.waitForFunction(() =>
      document.querySelector('#world-token-summary').textContent.includes('TK'),
    );
    const worldPreview = await page.locator('#world-preview').textContent();
    assert(
      worldPreview.includes('WORLD_TEST') && worldPreview.includes('常驻'),
      `worldPreview unexpected (kind=${await page.locator('#world-kind').inputValue()}): ${worldPreview.slice(0, 800)}`,
    );
    assert.equal(calls.length, 0, 'World Info previews never call the model');
    await page.locator('#world-edit-view').click();
    await page.screenshot({ path: path.join(output, 'worldbook-editor-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    const worldBox = await page.locator('#world-dialog').boundingBox();
    assert(worldBox.x >= 0 && worldBox.y >= 0 && worldBox.width <= 844 && worldBox.height <= 390);
    const worldSave = await page.locator('#world-save').boundingBox();
    const worldFooter = await page.locator('#world-preview-button').boundingBox();
    assert(worldSave.y + worldSave.height <= 390 && worldFooter.y + worldFooter.height <= 390);
    await page.screenshot({ path: path.join(output, 'worldbook-editor-landscape.png') });
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.locator('#world-close').click();
    const download = page.waitForEvent('download');
    await page.locator('#prompt-export').click();
    await (await download).saveAs(path.join(output, 'exported-prompt.json'));
    await page.screenshot({ path: path.join(output, 'layered-prompt-editor.png') });
    await page.locator('[data-ai-tab="settings"]').click();
    async function configure() {
      await page.locator('#ai-baseUrl').fill(providerURL);
      await page.locator('#ai-model').fill('mock-model');
      await page.locator('#ai-key').fill('only-a-test-key');
      await page.locator('#ai-profile-save').click();
      await page.locator('#generation-progress').waitFor({ state: 'visible' });
    }
    const partyBeforeSummon = await page
      .locator('[data-party-slot]')
      .evaluateAll((fields) => fields.map((field) => field.value));
    await configure();
    await page.locator('#generation-diagnostics').waitFor({ state: 'visible', timeout: 30000 });
    assert((await page.locator('#diagnostic-issues').textContent()).includes('character.data.hp'));
    assert((await page.locator('#diagnostic-issues').textContent()).includes('character.data.mp'));
    assert((await page.locator('#diagnostic-repairs').textContent()).includes('逗号'));
    assert((await page.locator('#diagnostic-repairs').textContent()).includes('description_note'));
    assert((await page.locator('#diagnostic-token-summary').textContent()).includes('TK'));
    assert(
      (await page.locator('#diagnostic-messages').textContent()).includes(
        '接口实际usage：输入 100 TK',
      ),
    );
    const originalResponse = await page.locator('#diagnostic-raw').inputValue();
    assert(
      originalResponse.startsWith('<other>标签外文字</other>\n<wanxiang_json>@@RAW@@```json\n'),
    );
    assert((await page.locator('#diagnostic-repairs').textContent()).includes('移除包装标记'));
    assert.equal(await page.locator('#diagnostic-raw').getAttribute('readonly'), '');
    assert.equal(
      await page.evaluate(
        () =>
          (JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1'))?.characters || []).filter(
            (entry) => entry.source === 'generated',
          ).length,
      ),
      0,
    );
    await page.screenshot({ path: path.join(output, 'generation-diagnostics-desktop.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    const diagnosticBox = await page.locator('#generation-diagnostics').boundingBox();
    assert(
      diagnosticBox.x >= 0 &&
        diagnosticBox.y >= 0 &&
        diagnosticBox.width <= 844 &&
        diagnosticBox.height <= 390,
    );
    await page.screenshot({ path: path.join(output, 'generation-diagnostics-landscape.png') });
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.locator('#diagnostic-edit').fill('{broken');
    await page.locator('#diagnostic-validate').click();
    await page.waitForFunction(() =>
      document.querySelector('#diagnostic-note').textContent.includes('JSON格式错误'),
    );
    assert.equal(await page.locator('#diagnostic-raw').inputValue(), originalResponse);
    await page.locator('#diagnostic-edit').fill(characterResponse());
    await page.locator('#diagnostic-validate').click();
    await page.locator('#summoned-dialog').waitFor({ state: 'visible', timeout: 30000 });
    assert.equal(calls.length, 1, 'Local corrections never make another provider request');
    await page.locator('#summoned-dialog [data-generation-review]').click();
    assert.equal(await page.locator('#diagnostic-raw').inputValue(), originalResponse);
    assert((await page.locator('#diagnostic-repairs').textContent()).includes('用户编辑'));
    await page.locator('#diagnostic-close').click();
    const sheet = await page.locator('#summoned-lore').textContent();
    assert(sheet.includes('二十九岁') && sheet.includes('灯火弹') && sheet.includes('凝灯'));
    assert(!sheet.includes('game_data') && !sheet.includes('schemaVersion'));
    assert.equal(await page.locator('#summoned-dialog > footer button').count(), 2);
    assert((await page.locator('.identity-stats').textContent()).includes('50'));
    await page.screenshot({ path: path.join(output, 'ai-character-sheet-desktop.png') });
    const activeSkill = page
      .locator('.character-ability')
      .filter({ has: page.locator('summary strong', { hasText: '凝灯' }) });
    await activeSkill.locator('summary').click();
    assert((await activeSkill.locator('.ability-mechanics').textContent()).includes('基础伤害 10'));
    assert((await activeSkill.locator('.ability-mechanics').textContent()).includes('迟缓 +1层'));
    assert((await activeSkill.locator('.ability-motion').textContent()).length > 30);
    await page.screenshot({ path: path.join(output, 'ai-character-skill-open.png') });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('#summoned-lore').evaluate((element) => {
      element.scrollTop = 0;
    });
    const joinBox = await page.locator('#summoned-join').boundingBox();
    const rawBox = await page.locator('#summoned-dialog [data-generation-review]').boundingBox();
    assert(joinBox.y + joinBox.height <= 390 && rawBox.y + rawBox.height <= 390);
    await page.screenshot({ path: path.join(output, 'ai-character-sheet-landscape.png') });
    await page.setViewportSize({ width: 1440, height: 836 });
    await page.locator('#summoned-join').click();
    const pool = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1')),
    );
    assert.deepEqual(
      pool.party,
      partyBeforeSummon,
      'Joining the tavern must not replace a deployed teammate',
    );
    const newcomer = pool.characters.find((entry) => entry.source === 'generated');
    const prose = newcomer.setting.worldbook;
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    const partyHandle = await page.locator('#ledger-handle').boundingBox();
    await page.mouse.move(
      partyHandle.x + partyHandle.width / 2,
      partyHandle.y + partyHandle.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      Math.max(10, partyHandle.x - 140),
      partyHandle.y + partyHandle.height / 2,
      { steps: 6 },
    );
    await page.mouse.up();
    await page.locator('#ledger-drawer-host.is-open').waitFor();
    await page.locator('#party-toggle').click();
    await page.locator('#party-panel').waitFor({ state: 'visible' });
    await page
      .locator(`[data-prepare-view="${newcomer.id}"]`)
      .dragTo(page.locator('[data-prepare-slot="0"]'));
    await page.waitForFunction(
      (id) =>
        document.querySelector('[data-prepare-slot="0"]')?.dataset.prepareHero === id &&
        JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1')).party[0] === id,
      newcomer.id,
    );
    await page.locator('#prepare-done').click();
    const findWorldRow = async (comment) => {
      await page.waitForFunction(
        (target) =>
          [...document.querySelectorAll('#world-entry-list [data-world-head="comment"]')].some(
            (input) => input.value === target,
          ),
        comment,
      );
      const uid = await page.evaluate((target) => {
        const row = [...document.querySelectorAll('#world-entry-list [data-world-row]')].find(
          (el) => el.querySelector('[data-world-head="comment"]')?.value === target,
        );
        return row?.dataset.worldRow || '';
      }, comment);
      assert(uid, `Worldbook row missing: ${comment}`);
      return page.locator(`#world-entry-list [data-world-row="${uid}"]`);
    };
    await page.locator('#ai-open').click();
    await page.locator('#ai-worldbooks').click();
    await page.locator('#world-dialog').waitFor({ state: 'visible' });
    await page.locator('#world-book-select').selectOption('tavern-world');
    const newcomerRow = await findWorldRow(`ai角色条目：${newcomer.setting.name}`);
    await newcomerRow.locator('[data-world-uid]').click();
    assert.equal(
      await newcomerRow.locator('textarea[data-world-field="content"]').inputValue(),
      prose,
    );
    const rookRow = await findWorldRow('角色条目：游隼');
    await rookRow.locator('[data-world-uid]').click();
    const officialLore = await rookRow.locator('textarea[data-world-field="content"]').inputValue();
    await rookRow
      .locator('textarea[data-world-field="content"]')
      .fill(officialLore + '\n玩家补充：喜欢记录沿途的鸟鸣。');
    await page.locator('#world-save').click();
    await page.waitForFunction(() =>
      document.querySelector('#world-status').textContent.includes('已保存'),
    );
    await page.locator('#world-close').click();
    await page.locator('#ai-close').click();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#ai-open').click();
    await page.locator('#ai-worldbooks').click();
    await page.locator('#world-dialog').waitFor({ state: 'visible' });
    await page.locator('#world-book-select').selectOption('tavern-world');
    const reloadedRookRow = await findWorldRow('角色条目：游隼');
    await reloadedRookRow.locator('[data-world-uid]').click();
    assert(
      (await reloadedRookRow.locator('textarea[data-world-field="content"]').inputValue()).includes(
        '玩家补充',
      ),
    );
    await page.waitForFunction(() =>
      demo
        .getLibrary()
        .characters.find((entry) => entry.id === 'official-rook')
        ?.setting.worldbook.includes('玩家补充'),
    );
    await page.locator('#world-close').click();
    await page.locator('#ai-close').click();
    const gateFrame = page.frames().find((frame) => frame.url().includes('tavern.html'));
    await gateFrame.evaluate(() => window.assetPreview.placeNow('gate'));
    await gateFrame.locator('#enter').waitFor({ state: 'visible', timeout: 15000 });
    await gateFrame.evaluate(() => {
      const preview = window.assetPreview;
      preview.look(preview.camera.rotation.y + Math.PI, preview.camera.rotation.x);
    });
    await gateFrame.locator('#enter').waitFor({ state: 'hidden' });
    await gateFrame.evaluate(() => window.assetPreview.placeNow('gate'));
    await gateFrame.locator('#enter').waitFor({ state: 'visible' });
    await page.frameLocator('iframe').locator('#enter').click();
    await page.locator('#destination-dialog').waitFor({ state: 'visible' });
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-start').click();
    await page.locator('#party-panel').waitFor({ state: 'visible' });
    await page.locator('#prepare-done').click();
    await page.locator('#ai-dialog').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ai-kind').inputValue(), 'script');
    await page.locator('#ai-dialog details').first().locator('summary').click();
    await page.locator('#ai-strictJson').check();
    await page.locator('#ai-baseUrl').fill(providerURL);
    await page.locator('#ai-model').fill('mock-model');
    await page.locator('#ai-key').fill('only-a-test-key');
    await page.locator('#ai-profile-save').click();
    await page.locator('#party-panel').waitFor({ state: 'visible' });
    assert((await page.locator('#generation-title').textContent()).includes('本章故事'));
    await page.locator('#prepare-done').filter({ hasText: '确认编队' }).click();
    await page.waitForFunction(() => !document.querySelector('#prepare-done').disabled, null, {
      timeout: 60000,
    });
    const prepState = await page.evaluate(() => ({
      doneText: document.querySelector('#prepare-done')?.textContent,
      partyOpen: document.querySelector('#party-panel')?.open,
      diagOpen: document.querySelector('#generation-diagnostics')?.open,
      diagSummary: document.querySelector('#diagnostic-summary')?.textContent,
      toast: document.querySelector('#toast')?.textContent,
      prepareStatus: document.querySelector('#prepare-status')?.textContent,
    }));
    assert(
      prepState.doneText?.includes('整备完成'),
      `Script preparation did not enter ready state (calls=${calls.length}, errors=${JSON.stringify(errors)}): ${JSON.stringify(prepState)}`,
    );
    await page.route('**/api/ai/generate/quick-chat', (route) => {
      const input = route.request().postDataJSON();
      const turn = input.adventure;
      let adventure;
      if (turn?.mode === 'quest') {
        adventure = {
          episodeId: turn.episodeId,
          revision: turn.boss.revision,
          tasks: [
            { id: 'goal-1', status: 'completed', evidence: '核对分水碑刻度后确认了主闸室通路。' },
          ],
          patches: [],
        };
      }
      return route.fulfill({
        json: {
          content: '【对白:灯河】先按线索往前看吧。【旁白】水渠旁暂时没有新的动静。',
          ...(adventure ? { adventure } : {}),
          usage: { input: 20, output: 20 },
          request: { tokens: { inputEstimate: 40 }, warnings: [] },
        },
      });
    });
    const passTheater = async (expectedText) => {
      const theater = page.locator('#chapter-theater');
      await theater.waitFor({ state: 'visible', timeout: 15000 });
      if (expectedText) assert((await theater.textContent()).includes(expectedText));
      const button = theater.locator('#chapter-theater-continue');
      for (let click = 0; click < 3; click++) {
        const closed = await theater.evaluate(
          (el) => el.hidden || el.classList.contains('is-closing'),
        );
        if (closed) break;
        await button.click();
        await page.waitForTimeout(80);
      }
      await theater.waitFor({ state: 'hidden', timeout: 5000 });
    };
    const galIsPlaying = () =>
      page.evaluate(() => {
        const el = document.querySelector('#gal-stage');
        return Boolean(
          el && !el.hidden && el.dataset.playing === 'true' && el.dataset.leaving !== 'true',
        );
      });
    const advanceGalStep = async () => {
      try {
        await page.locator('#gal-stage [data-gal="next"]').click({ timeout: 1500 });
      } catch (err) {
        if (await galIsPlaying()) throw err;
      }
    };
    const finishGal = async () => {
      for (let step = 0; step < 30; step++) {
        if (!(await galIsPlaying())) {
          const leaving = await page.evaluate(
            () => document.querySelector('#gal-stage')?.dataset.leaving === 'true',
          );
          if (leaving) {
            await page.waitForFunction(
              () => document.querySelector('#gal-stage')?.dataset.leaving !== 'true',
            );
            continue;
          }
          break;
        }
        await advanceGalStep();
        await page.waitForTimeout(80);
      }
      await page.waitForFunction(() => {
        const el = document.querySelector('#gal-stage');
        return !el || el.hidden || el.dataset.playing !== 'true';
      });
    };
    await page.locator('#prepare-done').filter({ hasText: '整备完成' }).click();
    await page.waitForFunction(() => demo.getStatus().mode === 'battle', null, {
      timeout: 60000,
    });
    await passTheater('古老引水渠');
    await finishGal();
    const rawHandle = await page.locator('#ledger-handle').boundingBox();
    await page.mouse.move(rawHandle.x + rawHandle.width / 2, rawHandle.y + rawHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(Math.max(10, rawHandle.x - 140), rawHandle.y + rawHandle.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await page.locator('#ledger-drawer-host.is-open').waitFor();
    await page.locator('#generation-review').click();
    assert(
      (await page.locator('#latest-api-response textarea').inputValue()).includes('wanxiang_json'),
    );
    await page.locator('#latest-api-response button').click();
    const rounds = [];
    const checkRoomStory = async (room, captureScreenshots = false) => {
      await finishGal();
      await page.waitForFunction(
        (target) =>
          document.querySelector('#story-lines')?.textContent.includes(`第${target + 1}幕`),
        room,
      );
      const storyText = await page.locator('#story-lines').textContent();
      assert(storyText.includes('灯河'));
      assert(!storyText.includes(`第${room + 2}幕`), 'Future scenes are not revealed');
      await page.locator('#battle-reading-toggle').click();
      await page.locator('[data-dungeon-gal="story"]').click();
      await page.locator('#gal-stage').waitFor({ state: 'visible', timeout: 15000 });
      await page.waitForFunction(() => {
        const text = document.querySelector('#gal-stage .gal-text')?.textContent || '';
        return text.length > 0;
      });
      if (captureScreenshots) {
        await page.screenshot({ path: path.join(output, 'ai-left-story.png') });
        await page.setViewportSize({ width: 844, height: 390 });
        const galBox = await page.locator('#gal-stage .gal-reading').boundingBox();
        assert(galBox && galBox.y >= 0 && galBox.y + galBox.height <= 390);
        await page.screenshot({ path: path.join(output, 'ai-left-story-landscape.png') });
        await page.setViewportSize({ width: 1440, height: 836 });
      }
      await page.locator('#gal-stage [data-gal="close"]').click();
      await page.locator('#gal-stage').waitFor({ state: 'hidden', timeout: 15000 });
      await page.locator('#battle-reading-toggle').click();
    };
    const finishRpIntro = async () => {
      for (let step = 0; step < 30; step++) {
        const done = await page.evaluate(
          () => document.querySelector('#rp-scene')?.dataset.intro === 'false',
        );
        if (done) break;
        if (await galIsPlaying()) await advanceGalStep();
        await page.waitForTimeout(80);
      }
      await page.waitForFunction(
        () => document.querySelector('#rp-scene')?.dataset.intro === 'false',
      );
    };
    const fightCurrentRoom = async (label) => {
      await page.waitForFunction(() => !demo.getStatus().animating);
      assert.equal(await page.evaluate(() => demo.getState().heroDefinitions.aegis.name), '灯河');
      if ((await page.locator('#speed').textContent()).includes('×1'))
        await page.locator('#speed').click();
      let count = 0;
      while (
        !['victory', 'defeat'].includes(await page.evaluate(() => demo.getState().phase)) &&
        count++ < 55
      ) {
        const state = await page.evaluate(() => demo.getState());
        for (const action of buildPlan(state)) {
          await page.waitForFunction(() => !demo.getStatus().animating);
          await page.locator(`[data-start="${action.start}"]`).click();
          if (action.kind === 'swap') {
            await page.locator(`[data-rear="${action.incoming}"]`).click();
            await page.locator(`[data-side="Friendly"][data-slot="${action.slot}"]`).click();
          } else if (action.kind === 'item') {
            await page.locator('#backpack-open').click();
            await page.locator(`[data-item="${action.item}"]`).click();
            await page
              .locator(`[data-unit="${action.target}"],[data-rear="${action.target}"]`)
              .first()
              .click();
          } else {
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
        }
        const forecast = await page.evaluate(() => demo.getForecast());
        assert(forecast.valid, JSON.stringify(forecast.invalid));
        await page.locator('#commit').click();
        await page.waitForFunction(() => !demo.getStatus().playing, null, { timeout: 30000 });
        const final = await page.evaluate(() => demo.getState());
        for (const [id, unit] of Object.entries(forecast.final.units)) {
          assert.equal(final.units[id].hp, unit.hp);
          assert.equal(final.units[id].mp, unit.mp);
        }
      }
      assert.equal(
        await page.evaluate(() => demo.getState().phase),
        'victory',
        `Generated roster ${label}`,
      );
      rounds.push(count);
    };

    // Node 0: Battle 1
    await checkRoomStory(0, true);
    await fightCurrentRoom('room 1');
    await finishGal();
    await finishSettlement(page);
    await page.locator('#continue').click();

    // Node 1: RP Event
    await page.waitForFunction(() => demo.getStatus().mode === 'event', null, { timeout: 60000 });
    await finishRpIntro();
    await page.locator('.rp-content').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-rp-choice="choice-1"]').click();
    await page.locator('#rp-input').fill('沿渠道查看情况');
    await page.locator('[data-rp="send"]').click();
    await page.waitForFunction(() => !document.querySelector('#rp-input').disabled, null, {
      timeout: 15000,
    });
    await finishGal();
    await page.locator('[data-rp="next"]').click();

    // Node 2: Elite Battle + Rest
    await page.waitForFunction(
      () =>
        demo.getStatus().mode === 'battle' &&
        demo.getState().encounter === 2 &&
        !demo.getStatus().animating,
      null,
      { timeout: 60000 },
    );
    await checkRoomStory(2);
    await fightCurrentRoom('room 3');
    await finishGal();
    await finishSettlement(page);
    await page.locator('#continue').click();
    await page.locator('[data-rest="meal"]').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-rest="meal"]').click();
    await page.locator('#rest-continue').click();

    // Node 3: RP Quest
    await page.waitForFunction(
      () => demo.getStatus().mode === 'event' && demo.getExpedition().index === 3,
      null,
      { timeout: 60000 },
    );
    await finishRpIntro();
    await page.locator('#rp-input').fill('查看分水碑并前往主闸室');
    await page.locator('[data-rp="send"]').click();
    await page.waitForFunction(() => !document.querySelector('#rp-input').disabled, null, {
      timeout: 15000,
    });
    await finishGal();
    await page.locator('.rp-boss-ready').waitFor({ state: 'visible', timeout: 15000 });
    await page.locator('[data-rp="boss"]').click();

    // Node 4: Boss Battle + Epilogue Theater
    await page.waitForFunction(
      () =>
        demo.getStatus().mode === 'battle' &&
        demo.getState().encounter === 4 &&
        !demo.getStatus().animating,
      null,
      { timeout: 60000 },
    );
    await checkRoomStory(4);
    await fightCurrentRoom('room 5 (Boss)');
    for (let step = 0; step < 40; step++) {
      if (await page.locator('#chapter-theater').isVisible()) break;
      if (await galIsPlaying()) await advanceGalStep();
      await page.waitForTimeout(80);
    }
    await passTheater('暮色悄悄染透');
    await finishSettlement(page);
    if (await page.locator('#result-back').isVisible()) {
      await page.locator('#result-back').click();
      await page.waitForFunction(() => demo.getStatus().mode === 'inn', null, { timeout: 15000 });
    }
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('wanxiang.worldbooks.v1')),
    );
    assert(saved.history.at(-1).lines.some((line) => line.stage === 'event-choice'));
    assert(saved.history.at(-1).lines.some((line) => line.stage === 'quest-state'));
    assert(saved.history.at(-1).lines.some((line) => line.text.includes('第1幕')));
    assert.equal(saved.history.at(-1).complete, true);
    assert.equal(saved.chapter, 2);
    assert(saved.history.at(-1).nextHook.setting.includes('铜灯'));
    assert.equal(
      calls.length,
      2,
      'Combat and five nodes must not call character/script APIs again',
    );
    assert(
      calls.every((call) =>
        call.messages.some((message) => message.content.includes('WORLD_TEST')),
      ),
    );
    assert(calls[1].messages.some((message) => message.content.includes('RUINS_TEST')));
    const monsterContext = requestContext(calls[1].messages);
    assert.deepEqual(
      monsterContext.encounters[0].enemies.map((enemy) => enemy.id),
      ['mossSlime'],
    );
    assert(monsterContext.encounters[4].enemies.some((enemy) => enemy.id === 'bossGate'));
    assert(calls[1].messages.some((message) => message.content.includes('习性与能力：')));
    assert(!calls[0].response_format, 'Tagged JSON does not send a conflicting response_format');
    assert.equal(calls[0].max_tokens, 32768);
    assert(calls[0].messages.some((message) => message.role === 'assistant'));
    assert(
      !calls[1].response_format,
      'Tagged JSON uses local strict validation even with a saved schema preference',
    );
    const scriptContext = requestContext(calls[1].messages);
    assert(scriptContext.characters.greenLight.some((entry) => entry.name === '灯河'));
    assert(
      scriptContext.characters.greenLight.every(
        (entry) => !entry.combat && !entry.data && !entry.hp,
      ),
    );
    assert(scriptContext.characters.greenLight[0].worldbook === prose);
    assert(!JSON.stringify(saved).includes('<game_data>'));
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(output, 'ai-script-complete.png') });
    return {
      mockProvider: true,
      realExternalCalls: 0,
      requests: calls.length,
      characterSavedAndRecruited: true,
      characterCardAndMergedAbilities: true,
      summonJoinsPoolWithoutChangingParty: true,
      summonCrystalsSynchronized: true,
      exactEncounterCastAndMonsterLoreSent: true,
      rawFailureDisplayed: true,
      allInvalidFieldsDisplayed: true,
      localCorrectionWithoutApiRetry: true,
      automaticFormatRepairs: true,
      landscapeDiagnostics: true,
      directPortalFlow: true,
      portalButtonsHiddenBehindCamera: true,
      sharedConnectionPreset: true,
      editableLayeredTavernPreset: true,
      compactPromptTableAndPopup: true,
      importedRegexInRealGeneration: true,
      unifiedWorldbookAndEntryApiTargets: true,
      editableSillyTavernWorldbooks: true,
      officialCharacterLoreEditableAndRestored: true,
      worldbookAppliedToBothApis: true,
      finalRequestTokenBreakdown: true,
      actualRequestUsagePreservedOnFailure: true,
      designNoteRepairedAndReported: true,
      strictScriptSchema: true,
      compactPlotWithOneNamedHero: true,
      scriptProseCharacters: scriptProseReport(saved.scripts.at(-1)).characters,
      plainWorldbook: true,
      loadingScreen: true,
      leftStoryFeed: true,
      threeBattlesTwoRpNodes: rounds,
      chapterTheaterIntroAndEpilogue: true,
      confirmedHistoryOnly: true,
      nextHookStored: true,
      enemyDataOwnedByCode: true,
      errors,
    };
  } finally {
    await page.close();
    provider.closeAllConnections();
    await new Promise((resolve) => provider.close(resolve));
  }
}
