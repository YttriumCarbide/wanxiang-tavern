import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createApiClient } from '../src/ai/api-client.js';
import { createAiApi } from '../server/ai-api.mjs';
import { cleanCharacterEntries, cleanLibraryCharacters } from '../src/ai/character-cleanup.js';
import { characterDocument, scriptFixture } from './fixtures/ai.js';

test('all six AI purposes share direct transport, exact options, model lists and no key in local requests', async () => {
  const kinds = ['character', 'script', 'chat', 'quick-chat', 'summary', 'creation'];
  const profile = {
    requestMode: 'browser',
    baseUrl: 'https://fixture.invalid/v1',
    model: 'fixture',
    tokenField: 'max_tokens',
    maxTokens: 500,
    temperature: null,
  };
  const localCalls = [],
    upstream = [];
  let directError = false;
  const client = createApiClient({
    fetchImpl: async (url, options) => {
      if (String(url).startsWith('/api/ai/')) {
        localCalls.push({ url, body: options.body });
        if (url.endsWith('/config'))
          return Response.json(Object.fromEntries(kinds.map((kind) => [kind, profile])));
        const data = JSON.parse(options.body);
        if (url.endsWith('/prepare'))
          return Response.json({
            ticket: data.path,
            profile,
            messages: [{ role: 'user', content: '正文' }],
            options: {
              models: data.path.startsWith('models/'),
              sampling: { top_k: 17 },
              outputEnvelope: true,
            },
          });
        if (url.endsWith('/complete')) return Response.json(data.result);
        if (url.endsWith('/cancel')) return Response.json({ cancelled: true });
        throw Error('unexpected local route');
      }
      upstream.push({ url: String(url), options });
      if (directError) throw TypeError('Failed to fetch');
      if (String(url).endsWith('/models')) return Response.json({ data: [{ id: 'fixture' }] });
      return Response.json({
        choices: [{ message: { content: '回复' } }],
        usage: { prompt_tokens: 8, completion_tokens: 2 },
      });
    },
  });
  try {
    for (const kind of kinds) {
      client.setCredential(kind, profile, 'PAGE_ONLY_KEY');
      const result = await client.request('generate/' + kind, { text: '你好' });
      assert.equal(result.content, '回复');
      assert.equal(result.usage.input, 8);
    }
    assert.deepEqual((await client.request('models/chat', {})).models, ['fixture']);
    assert.equal(upstream.length, 7);
    assert(upstream.every((call) => call.options.headers.Authorization === 'Bearer PAGE_ONLY_KEY'));
    assert.equal(JSON.parse(upstream[0].options.body).top_k, 17);
    assert(!JSON.stringify(localCalls).includes('PAGE_ONLY_KEY'));
    directError = true;
    await assert.rejects(client.request('generate/chat', { text: '你好' }), /CORS/);
    assert.equal(
      upstream.length,
      8,
      'failed direct calls are never retried through the local route',
    );
    assert(!localCalls.some((call) => call.url.includes('/generate/')));
    const fresh = createApiClient({ fetchImpl: async () => Response.json({ chat: profile }) });
    await assert.rejects(fresh.request('generate/chat', {}), /重新输入密钥/);
    fresh.dispose();
  } finally {
    client.dispose();
  }
});

test('cancel and total timeout stop direct generation before acceptance', async () => {
  const profile = { requestMode: 'browser', baseUrl: 'http://localhost:9999/v1', model: 'fixture' };
  for (const cancel of [false, true]) {
    const controller = new AbortController();
    let accepted = false;
    const client = createApiClient({
      timeoutMs: cancel ? 1000 : 10,
      fetchImpl: async (url, options) => {
        if (String(url).endsWith('/config')) return Response.json({ chat: profile });
        if (String(url).endsWith('/prepare'))
          return Response.json({ ticket: 't', profile, messages: [], options: {} });
        if (String(url).endsWith('/complete')) accepted = true;
        if (String(url).startsWith('/api/ai/')) return Response.json({});
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
          if (cancel) controller.abort();
        });
      },
    });
    await assert.rejects(
      client.request('generate/chat', {}, { signal: controller.signal }),
      /取消|180秒/,
    );
    assert.equal(accepted, false);
    client.dispose();
  }
});

test('local and browser completions share prepared prompts, regex, TK, envelope validation and one-time acceptance', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/transport-'));
  let content = '<wanxiang_chat>你好，来客。</wanxiang_chat>';
  let serviceCalls = 0;
  const upstream = async () =>
    Response.json({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 15, completion_tokens: 9 },
    });
  const api = await createAiApi({
    root: process.cwd(),
    port: 0,
    settingsFile: path.join(directory, 'config.json'),
    promptsDirectory: path.join(directory, 'presets'),
    worldInfoDirectory: path.join(directory, 'world'),
    fetchImpl: async (...args) => {
      serviceCalls++;
      return upstream(...args);
    },
  });
  const server = createServer((req, res) => {
    void api(req, res, req.url);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (route, data) => {
    const response = await fetch(base + '/api/ai/' + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    assert.equal(response.status, 200, result.error);
    return result;
  };
  const client = createApiClient({
    fetchImpl: (url, options) =>
      String(url).startsWith('/api/ai/') ? fetch(base + url, options) : upstream(url, options),
  });
  try {
    const profile = {
      baseUrl: 'https://fixture.invalid/v1',
      model: 'fixture',
      apiKey: 'SERVICE_PRIVATE',
      tokenField: 'max_tokens',
      maxTokens: 2000,
      requestMode: 'local',
    };
    const input = { text: '你好', place: 'bar', selected: [], characters: [], history: [] };
    const preset = (
      await post('prompts/save', {
        preset: {
          name: 'direct fixture',
          prompts: [{ identifier: 'main', role: 'system', content: '自然交流' }],
          extensions: {
            regex_scripts: [{ findRegex: '来客', replaceString: '朋友', markdownOnly: true }],
          },
        },
      })
    ).preset;
    await post('prompts/select', { kind: 'chat', id: preset.id });
    await post('config', { ...profile, kind: 'chat' });
    const local = await client.request('generate/chat', input);
    assert.equal(serviceCalls, 1);
    await post('config', { ...profile, kind: 'chat', requestMode: 'browser' });
    client.setCredential('chat', profile, 'PAGE_ONLY');
    const direct = await client.request('generate/chat', input);
    assert.equal(serviceCalls, 1);
    assert.equal(direct.content, local.content);
    assert.equal(direct.display, local.display);
    assert.deepEqual(direct.request.messages, local.request.messages);
    assert.deepEqual(direct.request.tokens, local.request.tokens);
    assert.deepEqual(direct.usage, local.usage);
    const plan = await post('transport/prepare', { path: 'generate/chat', input });
    assert(!JSON.stringify(plan).includes('SERVICE_PRIVATE'));
    await post('transport/complete', { ticket: plan.ticket, result: { content } });
    const repeated = await fetch(base + '/api/ai/transport/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket: plan.ticket, result: { content } }),
    });
    assert.equal(repeated.status, 400);
    content = '<wanxiang_chat>未闭合正文';
    await assert.rejects(client.request('generate/chat', input), /标签|闭合|正文/);
    // Both structured APIs also pass through the same server-owned validators.
    for (const kind of ['character', 'script']) {
      await post('config', { ...profile, kind, requestMode: 'browser', maxTokens: 32768 });
      client.setCredential(kind, profile, 'PAGE_ONLY');
      const request =
        kind === 'script'
          ? {
              brief: '沿回廊探索',
              boss: 'bossGate',
              chapter: 1,
              party: [{ id: 'a', name: '甲', title: '旅人', worldbook: '甲是谨慎的旅人。' }],
              history: [],
            }
          : { brief: '灯河' };
      const raw =
        kind === 'script'
          ? scriptFixture(request.party.map((entry) => entry.id))
          : characterDocument();
      content = '<wanxiang_json>' + JSON.stringify(raw) + '</wanxiang_json>';
      const result = await client.request('generate/' + kind, request);
      assert(result.entry);
      assert.equal(result.diagnostic.kind, kind);
    }
  } finally {
    client.dispose();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('persona cleanup keeps the player and three canonical companions, retaining history and allowing future summons', () => {
  const entries = Object.fromEntries(
    ['official-edith', 'official-aegis', 'official-pandora', 'player', 'old', 'official-lyria'].map(
      (id, uid) => [
        uid,
        {
          comment: id === 'player' ? '人物详情：青缘' : '人物详情：' + id,
          content: id + '原设定',
          extensions: { wanxiang: { characterId: id } },
        },
      ],
    ),
  );
  const book = { entries };
  const before = structuredClone(entries);
  const removed = cleanCharacterEntries(book);
  assert.equal(removed.length, 2);
  for (const uid of ['0', '1', '2', '3']) assert.deepEqual(book.entries[uid], before[uid]);
  const library = {
    campaign: { protagonistId: 'player' },
    characters: [
      ...Object.values(before).map((entry) => ({ id: entry.extensions.wanxiang.characterId })),
      { id: 'future' },
    ],
    party: ['player', 'official-edith', 'old', null, null, null],
    relationships: { old: 5 },
    history: ['保留历史'],
    prepared: 'old-script',
  };
  assert(cleanLibraryCharacters(library, book.extensions.wanxiang.characterCleanup.removedIds));
  assert.deepEqual(
    library.characters.map((entry) => entry.id),
    ['official-edith', 'official-aegis', 'official-pandora', 'player', 'future'],
  );
  assert.equal(library.party[2], null);
  assert.deepEqual(library.history, ['保留历史']);
  assert.equal(
    cleanLibraryCharacters(library, book.extensions.wanxiang.characterCleanup.removedIds),
    false,
  );
});
