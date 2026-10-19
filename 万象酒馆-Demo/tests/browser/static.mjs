import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { buildStatic } from '../../tools/build-static.mjs';
import { projectRoot } from '../../tools/testing/runtime.mjs';
import { characterDocument } from '../fixtures/ai.js';
import { dismissAutomaticJournals } from './legacy-session.mjs';

/** Only files are served here. There is no API, request preparer, proxy or Node game backend. */
export async function staticChecks({ browser, output }) {
  const manifest = await buildStatic();
  assert(
    manifest.files.every(
      (file) => !/(?:^|\/)(?:\.runtime|node_modules|server|tests|presets)(?:\/|$)/.test(file.path),
    ),
  );
  const allowedFiles = new Set([...manifest.files.map((file) => file.path), 'release.json']);
  const root = path.join(projectRoot, 'dist');
  const prefix = '/wanxiang-demo/';
  const types = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.glb': 'model/gltf-binary',
  };
  const apiTraffic = [];
  const server = createServer(async (req, res) => {
    if (req.url.includes('/api/')) {
      apiTraffic.push(req.url);
      res.writeHead(404).end();
      return;
    }
    try {
      const url = decodeURIComponent(req.url.split('?')[0]);
      if (!url.startsWith(prefix)) {
        res.writeHead(404).end();
        return;
      }
      const relative = url.slice(prefix.length) || 'index.html';
      if (!allowedFiles.has(relative)) {
        res.writeHead(404).end();
        return;
      }
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) || !(await stat(file)).isFile()) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, {
        'Content-Type': types[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(await readFile(file));
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseURL = `http://127.0.0.1:${server.address().port}${prefix}`;
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [],
    calls = [];
  page.on('pageerror', (failure) => errors.push(failure.message));
  await dismissAutomaticJournals(page);
  let reply = '回复';
  await page.route('https://upstream.invalid/**', async (route) => {
    const request = route.request();
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push({ url: request.url(), headers: request.headers(), body: request.postDataJSON() });
    if (request.method() === 'GET')
      return route.fulfill({ headers, json: { data: [{ id: 'fixture-model' }] } });
    if (request.postDataJSON().stream) {
      const chunks = [reply.slice(0, 12), reply.slice(12)];
      const body =
        chunks
          .map(
            (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\r\n\r\n`,
          )
          .join('') +
        `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 15, completion_tokens: 9 } })}\r\n\r\ndata: [DONE]\r\n\r\n`;
      return route.fulfill({ headers: { ...headers, 'Content-Type': 'text/event-stream' }, body });
    }
    return route.fulfill({
      headers,
      json: {
        choices: [{ message: { content: reply } }],
        usage: { prompt_tokens: 15, completion_tokens: 9 },
      },
    });
  });
  async function bootApi() {
    await page.evaluate(async () => {
      const { openDatabase } = await import(
        new URL('./src/storage/database.js', location.href).href
      );
      const { createStaticBackend } = await import(
        new URL('./src/ai/static-backend.js', location.href).href
      );
      window.staticDatabase = await openDatabase();
      window.staticApi = await createStaticBackend(window.staticDatabase);
    });
  }
  async function request(route, data) {
    return page.evaluate(({ route, data }) => window.staticApi.request(route, data), {
      route,
      data,
    });
  }
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo, { timeout: 60000 });
    await page.locator('#start-screen').waitFor();
    await page.screenshot({ path: path.join(output, 'start-screen.png') });
    await bootApi();
    const profiles = await request('config');
    assert(
      Object.values(profiles).every(
        (profile) => !profile.hasApiKey && !profile.model && profile.requestMode === 'browser',
      ),
    );
    assert.deepEqual((await request('presets')).presets, []);
    assert.deepEqual((await request('prompts')).presets, []);
    await page.locator('#start-journey').click();
    await page.locator('#ai-model').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('#ai-model').disabled);
    assert.equal(await page.locator('#new-game').isVisible(), false);
    assert.equal(await page.locator('#ai-promptProcessing').inputValue(), 'strict');
    await page.locator('#ai-baseUrl').fill('https://upstream.invalid/v1');
    await page.locator('#ai-model').fill('fixture-model');
    await page.locator('#ai-key').fill('STATIC_FIXTURE_KEY');
    await page.locator('#ai-rememberKey').check();
    await page.locator('#api-preset-name').fill('首次配置连接');
    await page.locator('#api-preset-save').click();
    await page.locator('#ai-status').filter({ hasText: '连接预设已保存' }).waitFor();
    await page.locator('#setup-next').click();
    await page.locator('#setup-status').filter({ hasText: '还需配置' }).waitFor();
    for (const kind of ['script', 'chat', 'quick-chat', 'summary', 'creation'])
      await page.locator(`[data-apply-kind][value="${kind}"]`).check();
    await page.locator('#api-preset-apply-many').click();
    await page.locator('#ai-status').filter({ hasText: '应用到 5 个 API' }).waitFor();
    await page.screenshot({ path: path.join(output, 'first-run-connections.png') });
    await page.locator('#setup-next').click();
    await page.locator('#prompt-import').waitFor({ state: 'visible' });
    await page.locator('#setup-next').click();
    await page.locator('#setup-status').filter({ hasText: '请先导入' }).waitFor();
    await page.locator('#prompt-import-file').setInputFiles({
      name: 'first-run.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify({
          name: '首次文风',
          prompts: [
            { identifier: 'main', role: 'system', content: '自然续写' },
            { identifier: 'chatHistory', marker: true },
          ],
        }),
      ),
    });
    await page.locator('#ai-status').filter({ hasText: '已导入并应用' }).waitFor();
    await page.screenshot({ path: path.join(output, 'first-run-prompts.png') });
    await page.locator('#setup-next').click();
    await page.locator('#new-game').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#ai-dialog').isVisible(), false);
    const saved = await page.evaluate(async () => {
      const { openDatabase } = await import(
        new URL('./src/storage/database.js', location.href).href
      );
      const db = await openDatabase();
      const saved = db.get('api.config');
      db.close();
      return saved;
    });
    assert(saved.profiles.script.model === 'fixture-model');
    assert(
      new Set(
        ['character', 'script', 'chat', 'quick-chat'].map(
          (kind) => saved.profiles[kind].promptPresetId,
        ),
      ).size === 1,
    );
    const book = (await request('worldbooks/tavern-world')).book;
    assert.deepEqual(
      Object.values(book.entries)
        .filter((entry) => entry.extensions?.wanxiang?.characterId)
        .map((entry) => entry.comment)
        .sort(),
      ['人物详情：伊蒂丝', '人物详情：潘多拉', '人物详情：长景月汐', '人物详情：青缘'].sort(),
    );
    assert.deepEqual(
      await page.evaluate(() => ({
        history: demo.getLibrary().history,
        archives: demo.getLibrary().archives,
        chat: demo.getLibrary().tavernChat,
      })),
      { history: [], archives: { npcs: [], items: [] }, chat: [] },
    );
    for (const kind of ['character', 'script', 'chat', 'quick-chat', 'summary', 'creation'])
      await request('config', {
        kind,
        baseUrl: 'https://upstream.invalid/v1',
        model: 'fixture-model',
        apiKey: 'STATIC_FIXTURE_KEY',
        rememberKey: true,
        tokenField: 'max_tokens',
        maxTokens: 32768,
        requestMode: 'browser',
      });
    assert.deepEqual((await request('models/chat', {})).models, ['fixture-model']);
    const chatInput = {
      text: '伊蒂丝，早上好。',
      place: 'bar',
      selected: ['official-edith'],
      characters: [{ id: 'official-edith', name: '伊蒂丝', worldbook: '温和活泼的引路人。' }],
      history: [],
    };
    const preset = (
      await request('prompts/save', {
        preset: {
          name: '静态验证预设',
          prompts: [
            { identifier: 'main', role: 'system', content: '自然续写' },
            { identifier: 'chatHistory', marker: true },
          ],
          extensions: {
            regex_scripts: [{ findRegex: '来客', replaceString: '朋友', markdownOnly: true }],
            tavern_helper: {
              scripts: [
                {
                  id: 'static-floating',
                  name: 'floating',
                  enabled: true,
                  content:
                    "document.body.insertAdjacentHTML('beforeend', '<button id=static-floating>预设开关</button>')",
                },
              ],
            },
          },
        },
      })
    ).preset;
    await request('prompts/select', { kind: 'chat', id: preset.id });
    const preview = await request('prompts/preview', { kind: 'chat', input: chatInput });
    assert.equal(calls.length, 1, 'previews never contact the provider');
    reply =
      '<wanxiang_chat>你好，来客。</wanxiang_chat><wanxiang_actions>{"affection":[{"id":"official-edith","delta":1}],"agreeToAdventure":[]}</wanxiang_actions>';
    const chat = await request('generate/chat', chatInput);
    assert.equal(chat.content, '你好，来客。');
    assert(chat.display.includes('朋友'));
    assert.deepEqual(chat.request.messages, preview.messages);
    assert(chat.request.tokens.contentTokens > 0);
    await request('prompts/save', { id: preset.id, preset: { ...preset, stream: true } });
    const streamed = await page.evaluate(async (input) => {
      const deltas = [];
      const result = await window.staticApi.request('generate/chat', input, {
        onDelta: (delta) => deltas.push(delta),
      });
      return { result, deltas };
    }, chatInput);
    assert.equal(streamed.result.content, chat.content);
    assert(streamed.deltas.join('').includes('wanxiang_chat'));
    reply = '<wanxiang_chat>留意脚下。</wanxiang_chat>';
    assert.equal(
      (await request('generate/quick-chat', { ...chatInput, environment: '回廊' })).content,
      '留意脚下。',
    );
    reply = '<wanxiang_json>' + JSON.stringify(characterDocument()) + '</wanxiang_json>';
    assert.equal(
      (await request('generate/character', { brief: '灯河', purpose: 'protagonist' })).entry.setting
        .name,
      '灯河',
    );
    reply =
      '<wanxiang_json>' +
      JSON.stringify({
        schemaVersion: 4,
        story: Array(5).fill('沿回廊继续探索。'),
        data: { title: '回廊', tags: ['遗迹'], npcs: [], items: [], nextHook: { setting: '' } },
      }) +
      '</wanxiang_json>';
    assert.equal(
      (
        await request('generate/script', {
          brief: '探索回廊',
          boss: 'bossGate',
          party: [{ id: 'p', name: '主角', title: '旅人', worldbook: '谨慎的旅人。' }],
          history: [],
        })
      ).entry.story.length,
      5,
    );
    reply = JSON.stringify({ items: [{ id: 'memory1', summary: '约好明日出发。' }] });
    assert.equal(
      (
        await request('generate/summary', {
          items: [{ id: 'memory1', kind: 'chat', label: '对话', text: '约好了明天出发。' }],
        })
      ).items[0].summary,
      '约好明日出发。',
    );
    reply = JSON.stringify({
      items: [{ id: 'ore', name: '晶片', description: '生命+2', stats: { hp: 2 }, rules: [] }],
    });
    assert.equal(
      (
        await request('generate/creation', {
          items: [
            {
              id: 'ore',
              name: '晶片',
              description: '微光晶片',
              value: 10,
              map: 'ruins',
              script: '从回廊拾得晶片。',
            },
          ],
        })
      ).items[0].price,
      10,
    );
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    const portrait = await request('portrait/save', { dataUrl: image });
    assert(portrait.url.startsWith('./__portraits/'));
    assert.equal(await page.evaluate(async (url) => (await fetch(url)).status, portrait.url), 200);
    const backup = await page.evaluate(async () => {
      const { exportDatabase } = await import(
        new URL('./src/storage/backup.js', location.href).href
      );
      return exportDatabase(window.staticDatabase, localStorage);
    });
    assert(!JSON.stringify(backup).includes('STATIC_FIXTURE_KEY'));
    assert(backup.entries.some(([key]) => key.startsWith('portrait.')));
    await page.evaluate(async (backup) => {
      const { readDatabaseBackup } = await import(
        new URL('./src/storage/backup.js', location.href).href
      );
      const restored = readDatabaseBackup(JSON.parse(JSON.stringify(backup)));
      const pictures = restored.entries
        .filter(([key]) => key.startsWith('portrait.'))
        .map(([key]) => key);
      await window.staticDatabase.write([], pictures);
      await window.staticDatabase.write(restored.entries);
    }, backup);
    assert.equal(await page.evaluate(async (url) => (await fetch(url)).status, portrait.url), 200);
    await request('config', {
      ...profiles.chat,
      kind: 'chat',
      baseUrl: 'https://upstream.invalid/v1',
      model: 'fixture-model',
      apiKey: 'STATIC_FIXTURE_KEY',
      rememberKey: true,
    });

    await page.evaluate(async () => {
      const { newCampaign, firstCompanion } = await import(
        new URL('./src/campaign.js', location.href).href
      );
      const { defaultProtagonist } = await import(
        new URL('./src/content/qingyuan.js', location.href).href
      );
      const library = newCampaign(defaultProtagonist());
      library.campaign.completed = true;
      library.inventory.summonContracts = 1;
      firstCompanion(library);
      library.campaign.tutorial = 'complete';
      library.tavernChat.push({
        id: 'retained-message',
        role: 'user',
        content: '刷新仍然保留这条记录。',
      });
      await window.staticDatabase.write([
        ['game.wanxiang.worldbooks.v1', JSON.stringify(library)],
        ['game.wanxiang.creation-pending.v1', 'false'],
        [
          'game.wanxiang.generation-options.v1',
          JSON.stringify({ developerMode: true, protagonistApi: false, scriptApi: false }),
        ],
      ]);
    });
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    assert.equal(
      (await page.evaluate(() => demo.getLibrary().tavernChat))[0].content,
      '刷新仍然保留这条记录。',
    );
    await page.locator('#ai-open').click();
    await page.locator('#ai-kind').selectOption('chat');
    await page.waitForFunction(() =>
      document.querySelector('#ai-key').placeholder.includes('记住'),
    );
    await page.locator('[data-ai-tab="prompts"]').click();
    await page.locator('#prompt-kind').selectOption('chat');
    await page.locator('#helper-open').click();
    await page.frameLocator('#helper-frame').locator('#static-floating').waitFor();
    await page.screenshot({ path: path.join(output, 'static-subdirectory-preset.png') });
    await page.locator('#helper-close').click();
    await page.locator('#ai-close').click();
    await page.evaluate(() => demo.startBattle());
    await page.locator('#destination-region-confirm').click();
    await page.locator('#destination-start').click();
    await page.waitForFunction(
      () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
      { timeout: 60000 },
    );
    await page.evaluate(() => demo.flushStorage());
    const state = await page.evaluate(() => demo.getState());
    await page.reload();
    await page.waitForFunction(
      () => !!window.demo && demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
      { timeout: 60000 },
    );
    assert.deepEqual(await page.evaluate(() => demo.getState()), state);
    await page.screenshot({ path: path.join(output, 'static-battle-restored.png') });
    assert.deepEqual(apiTraffic, []);
    assert.deepEqual(errors, []);
    assert(calls.every((call) => call.headers.authorization === 'Bearer STATIC_FIXTURE_KEY'));
    return {
      staticFilesOnly: true,
      projectSubdirectory: true,
      allSixApis: true,
      exactTokenizer: true,
      regexWorker: true,
      stream: true,
      helperWindow: true,
      portraitsPersisted: true,
      backupExcludesKeys: true,
      chatAndSettingsReloaded: true,
      battleCheckpoint: true,
      apiRequests: 0,
      files: manifest.files.length,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'static-failure.png') }).catch(() => {});
    throw failure;
  } finally {
    await page.close();
    await new Promise((resolve) => server.close(resolve));
  }
}
