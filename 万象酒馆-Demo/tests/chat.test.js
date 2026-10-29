import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { CHAT_PLACES, tavernActivities, mergeFutureScript, scriptProse } from '../src/chat.js';
import { normalizeScript } from '../src/ai/contracts.js';
import { combatTestScript } from '../src/content/generation-mode.js';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { createAiApi } from '../server/ai-api.mjs';
import { compatibleRequest } from '../server/compatible.mjs';
import { processPrompt } from '../server/prompt-processing.mjs';
import { requestTokenReport } from '../server/request-tokens.mjs';
import { samplingFromPreset } from '../src/ai/sampling.js';
import { presetHelperScripts } from '../src/ai/helper-scripts.js';
import { restoreGenerationOptions } from '../src/generation-options.js';

test('normal play always generates; the combined developer switch migrates both old options', () => {
  const defaults = {
    skipAiGeneration: false,
    developerMode: false,
    allowRetreat: false,
    editArchives: false,
    tavernVisitors: false,
    protagonistApi: true,
    scriptApi: true,
  };
  assert.deepEqual(restoreGenerationOptions(null), defaults);
  assert.deepEqual(restoreGenerationOptions({ protagonistApi: false, scriptApi: false }), defaults);
  assert.deepEqual(
    restoreGenerationOptions({ developerMode: true, protagonistApi: false, scriptApi: false }),
    {
      ...defaults,
      skipAiGeneration: true,
      developerMode: true,
      protagonistApi: false,
      scriptApi: false,
    },
  );
  assert.deepEqual(restoreGenerationOptions({ developerMode: true }), {
    ...defaults,
    developerMode: true,
  });
  assert.equal(
    restoreGenerationOptions({
      developerMode: true,
      protagonistApi: false,
      skipAiGeneration: false,
    }).protagonistApi,
    true,
  );
  assert.equal(restoreGenerationOptions({ skipAiGeneration: true }).skipAiGeneration, false);
});

test('a rewritten script can only replace future prose; visited scenes and combat metadata stay frozen', () => {
  const old = {
    ...normalizeScript(combatTestScript(), 'original'),
    party: ['original-party'],
    exploration: { seed: 23 },
    runId: 'run',
    generationInput: { brief: 'first input' },
    display: { story: Array(5).fill('old display') },
  };
  const next = normalizeScript(
    { ...combatTestScript(), story: Array.from({ length: 5 }, (_, index) => `new ${index}`) },
    'replacement',
  );
  const snapshot = structuredClone(old);
  const merged = mergeFutureScript(old, next, 2);
  assert.deepEqual(old, snapshot);
  assert.deepEqual(merged.story.slice(0, 3), old.story.slice(0, 3));
  assert.deepEqual(merged.story.slice(3), ['new 3', 'new 4']);
  for (const key of ['id', 'party', 'exploration', 'runId', 'generationInput'])
    assert.deepEqual(merged[key], old[key]);
  assert.deepEqual(merged.display.story.slice(0, 3), old.display.story.slice(0, 3));
  assert.deepEqual(mergeFutureScript(old, next, 4), old);
  assert(!scriptProse(merged).includes('schemaVersion'));
});

test('seat activities differ by location and chat text survives save restoration without gameplay changes', () => {
  const library = newLibrary(),
    snapshots = structuredClone(library.characters);
  const activities = Object.keys(CHAT_PLACES).map((place) =>
    tavernActivities(library.characters, place, () => 0),
  );
  assert.equal(
    new Set(activities.map((items) => items[0].text)).size,
    Object.keys(CHAT_PLACES).length,
  );
  library.tavernChat = [
    { role: 'user', content: '给我一把剑' },
    {
      role: 'assistant',
      content: '<b>这是木制小摆件。</b>',
      speakerIds: ['official-aegis'],
      speakerName: '长景月汐',
    },
  ];
  const restored = restoreLibrary(library);
  assert.deepEqual(restored.tavernChat, library.tavernChat);
  assert.deepEqual(restored.characters, snapshots);
  assert.deepEqual(restored.inventory, library.inventory);
});

test('portable sampling, strict no-tools and merge-tools use actual upstream behavior', () => {
  const sampling = samplingFromPreset({
    temperature: 0.8,
    top_k: 40,
    top_p: 0.9,
    presence_penalty: 0.4,
    frequency_penalty: -0.2,
    openai_max_context: 16000,
    openai_max_tokens: 2000,
    stream_openai: true,
    reasoning_effort: 'high',
  });
  assert.equal(sampling.stream, true);
  assert.equal(sampling.contextSize, 16000);
  const messages = [
    { role: 'system', content: 'a' },
    { role: 'system', content: 'b' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'x' }] },
    { role: 'tool', content: 'result', tool_call_id: 'x' },
    { role: 'system', content: 'tail' },
  ];
  const strict = processPrompt(messages, 'strict');
  assert.equal(strict[0].content, 'a\n\nb');
  assert.equal(strict[1].role, 'user');
  assert(!strict.some((message) => message.role === 'tool' || message.tool_calls));
  const merge = processPrompt(messages, 'merge_tools');
  assert(merge.some((message) => message.role === 'tool' && message.tool_call_id === 'x'));
  assert(messages[2].tool_calls);
  const scripts = presetHelperScripts({
    extensions: {
      tavern_helper: {
        scripts: [
          [
            'folder',
            {
              enabled: true,
              children: [
                ['script', { id: 'a', content: 'test' }],
                ['script', { id: 'b', content: 'skip', enabled: false }],
              ],
            },
          ],
        ],
      },
    },
  });
  assert.deepEqual(
    scripts.map((script) => [script.id, script.enabled]),
    [
      ['a', true],
      ['b', false],
    ],
  );
});

test('upstream streaming decodes split UTF-8, usage, sampling and length failures', async () => {
  let payload;
  const encode = new TextEncoder();
  const source = encode.encode(
    'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: {"choices":[{"delta":{"content":"来客"},"finish_reason":"stop"}],"usage":{"prompt_tokens":12,"completion_tokens":4}}\n\ndata: [DONE]\n\n'.replaceAll(
      '\n',
      '\r\n',
    ),
  );
  const chunks = [];
  const result = await compatibleRequest(
    {
      baseUrl: 'https://example.com/v1',
      model: 'mock',
      temperature: null,
      tokenField: 'max_tokens',
      maxTokens: 500,
    },
    [{ role: 'user', content: 'hi' }],
    {
      sampling: { stream: true, top_k: 24, reasoning_effort: 'high', maxTokens: 1000 },
      onDelta: (delta) => chunks.push(delta),
      fetchImpl: async (_url, options) => {
        payload = JSON.parse(options.body);
        return new Response(
          new ReadableStream({
            start(controller) {
              for (let index = 0; index < source.length; index += 7)
                controller.enqueue(source.slice(index, index + 7));
              controller.close();
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      },
    },
  );
  assert.equal(result.content, '你好来客');
  assert.deepEqual(result.usage, { input: 12, output: 4 });
  assert.equal(chunks.join(''), result.content);
  assert.equal(payload.top_k, 24);
  assert.equal(payload.max_tokens, 1000);
  assert.equal(payload.stream, true);
  assert.equal(payload.reasoning_effort, 'high');
});

test('chat API assembles world, green-light mentions, prose-only history, regex and exact final TK without touching game data', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/chat-unit-'));
  const requests = [];
  let responseOverride = null;
  const api = await createAiApi({
    root: process.cwd(),
    port: 0,
    settingsFile: path.join(directory, 'config.json'),
    promptsDirectory: path.join(directory, 'presets'),
    worldInfoDirectory: path.join(directory, 'world'),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return Response.json({
        choices: [
          {
            message: {
              content:
                responseOverride ??
                (requests
                  .at(-1)
                  .messages.some((message) => message.content.includes('<wanxiang_chat>'))
                  ? '<wanxiang_chat>你好，来客。</wanxiang_chat>'
                  : '<p>你好，来客。</p>'),
            },
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 8 },
      });
    },
  });
  const server = createServer((req, res) => {
    void api(req, res, req.url);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function post(route, body) {
    const response = await fetch(base + '/api/ai/' + route, {
      signal: AbortSignal.timeout(10000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, 200, result.error);
    return result;
  }
  try {
    for (const kind of ['chat', 'quick-chat'])
      await post('config', {
        kind,
        baseUrl: 'https://example.com/v1',
        model: 'mock',
        apiKey: 'PRIVATE_CHAT_KEY',
        tokenField: 'max_tokens',
        maxTokens: 2000,
        promptProcessing: 'merge_tools',
      });
    const preset = {
      name: 'chat-test',
      prompts: [
        { identifier: 'main', content: '自然交流', role: 'system' },
        { identifier: 'chatHistory', marker: true },
      ],
      top_k: 20,
      top_p: 0.8,
      extensions: {
        regex_scripts: [{ findRegex: '来客', replaceString: '朋友', markdownOnly: true }],
        tavern_helper: { scripts: [{ id: 'sample', content: 'test', enabled: true }] },
      },
    };
    const saved = await post('prompts/save', { preset });
    assert.equal(saved.preset.extensions.tavern_helper.scripts.length, 1);
    await post('prompts/select', { kind: 'chat', id: saved.preset.id });
    const input = {
      text: '没有勾选乙，但我想问乙：你好。',
      place: 'bar',
      selected: ['a'],
      characters: [
        { id: 'a', name: '甲', worldbook: '甲是安静的人' },
        { id: 'b', name: '乙', worldbook: '乙喜欢读书' },
        { id: 'c', name: '丙', worldbook: 'SHOULD_NOT_SEND' },
      ],
      previousScript: '上次副本的原文。',
      history: [
        { role: 'user', content: '之前的话' },
        { role: 'assistant', content: '之前的回应' },
      ],
    };
    const preview = await post('prompts/preview', { kind: 'chat', input });
    assert.equal(requests.length, 0);
    const generated = await post('generate/chat', input);
    assert.deepEqual(generated.request.messages, preview.messages);
    assert(generated.display.includes('朋友'));
    assert(generated.content.includes('来客'));
    const text = preview.messages.map((message) => message.content).join('\n');
    assert(text.includes('甲（id：a）') && text.includes('乙（id：b）'));
    assert(!text.includes('丙（id：c）'));
    assert(text.includes('不能填写角色姓名'));
    assert(
      text.includes('甲是安静的人') &&
        text.includes('乙喜欢读书') &&
        text.includes('吧台') &&
        text.includes('上次副本的原文'),
    );
    assert(
      text.includes('战斗道具') &&
        !text.includes('SHOULD_NOT_SEND') &&
        !text.includes('CHARACTER v3') &&
        !text.includes('SCRIPT v3'),
    );
    assert.equal(
      preview.messages.filter((message) => message.content.includes(input.text)).length,
      1,
    );
    const counts = await post('tokens', {
      texts: preview.messages.map((message) => message.content),
    });
    assert.equal(
      counts.counts.reduce((sum, count) => sum + count, 0),
      preview.tokens.contentTokens,
    );
    assert.equal(requests[0].top_k, 20);
    const quick = await post('generate/quick-chat', { ...input, environment: '第三战的遗迹大厅' });
    assert.equal(quick.content, '你好，来客。');
    responseOverride =
      '<konatan_planning~>唯一一组<wanxiang_chat>与</wanxiang_chat>，随后一组<wanxiang_actions>与</wanxiang_actions>。</konatan_planning~><tucao>这里只是格式说明。</tucao><wanxiang_chat>你好，来客。</wanxiang_chat><wanxiang_actions>{"affection":[{"id":"a","delta":1}],"agreeToAdventure":[]}</wanxiang_actions>';
    const taggedChat = await post('generate/chat', input);
    assert.equal(taggedChat.content, '你好，来客。');
    assert.deepEqual(taggedChat.actions.affection, [{ id: 'a', delta: 1 }]);
    const taggedQuick = await post('generate/quick-chat', input);
    assert.equal(taggedQuick.content, '你好，来客。');
    await post('prompts/save', {
      id: saved.preset.id,
      preset: { ...saved.preset, contextSize: 4096, maxTokens: 512, stream: true },
    });
    const longInput = {
      ...input,
      history: Array.from({ length: 8 }, (_, index) => ({
        role: index % 2 ? 'assistant' : 'user',
        content: `往事${index}：${'山河旧事，篝火旁的同行者低声交谈。'.repeat(150)}`,
      })),
    };
    const shortened = await post('prompts/preview', { kind: 'chat', input: longInput });
    assert(shortened.tokens.totalBudgetEstimate <= 4096);
    assert(shortened.warnings.some((warning) => warning.includes('本地记录保留')));
    assert(!shortened.messages.some((message) => message.content.includes('往事0：')));
    assert.equal(longInput.history.length, 8);
    const streamed = await fetch(base + '/api/ai/generate/chat', {
      signal: AbortSignal.timeout(10000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(longInput),
    });
    assert(streamed.headers.get('content-type').includes('text/event-stream'));
    const events = (await streamed.text())
      .split('\n\n')
      .filter(Boolean)
      .map((event) => JSON.parse(event.slice(6)));
    assert.equal(events[0].type, 'request');
    assert.equal(events.at(-1).type, 'complete');
    assert.equal(events.at(-1).result.content, '你好，来客。');
    assert.deepEqual(events.at(-1).result.actions.affection, [{ id: 'a', delta: 1 }]);
    responseOverride = null;
    await post('prompts/select', { kind: 'chat', id: 'chat-default' });
    const inactive = await post('generate/chat', input);
    assert(!inactive.display.includes('朋友'));
    assert(
      !JSON.stringify(await (await fetch(base + '/api/ai/config')).json()).includes(
        'PRIVATE_CHAT_KEY',
      ),
    );
    assert.equal(
      requestTokenReport(preview.messages, (value) => value.length).perMessage.length,
      preview.messages.length,
    );
    responseOverride =
      '<wanxiang_chat>没有丢失的正文 PRIVATE_CHAT_KEY</wanxiang_chat><wanxiang_actions>{"affection":[{"id":"a","delta":99}],"agreeToAdventure":[]}</wanxiang_actions>';
    for (const live of [false, true]) {
      await post('prompts/save', {
        id: saved.preset.id,
        preset: { ...saved.preset, stream: live },
      });
      await post('prompts/select', { kind: 'chat', id: saved.preset.id });
      const response = await fetch(base + '/api/ai/generate/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: live ? 'text/event-stream' : 'application/json',
        },
        body: JSON.stringify(input),
      });
      const report = live
        ? (await response.text())
            .split('\n\n')
            .filter(Boolean)
            .map((event) => JSON.parse(event.slice(6)))
            .at(-1)
        : await response.json();
      assert(report.error.includes('好感度或同行指令无效'));
      assert.equal(report.diagnostic.stage, 'chat-response');
      assert.equal(
        report.diagnostic.rawText,
        responseOverride.replace('PRIVATE_CHAT_KEY', '[密钥已隐藏]'),
      );
      assert.equal(report.diagnostic.request.usage.output, 8);
    }
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
