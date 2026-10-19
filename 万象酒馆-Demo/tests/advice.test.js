import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { adviceBinding, adviceSettings, adviceTranscript } from '../src/ai/advice.js';
import { createAiApi } from '../server/ai-api.mjs';
import { formatRequestPreview } from '../src/app/request-preview.js';
import { newLibrary } from '../src/ai/library.js';
import { settingOnly } from '../src/ai/contracts.js';

const izumiId = '7c19636a-77b4-4c18-b26b-673872cb8dcf';
function fixture(izumi = false) {
  return {
    name: izumi ? 'Izumi Advice兼容用例' : '其他预设共用Advice',
    prompts: [{ identifier: 'chatHistory', marker: true }],
    extensions: izumi
      ? { tavern_helper: { scripts: [{ id: izumiId, enabled: true, content: 'void 0;' }] } }
      : { wanxiang: { advice: { enabled: false } } },
  };
}

test('Advice settings preserve Izumi defaults, private preferences and explicit reusable declarations', () => {
  const preset = fixture(true);
  const binding = adviceBinding(preset);
  assert.equal(binding.enabledKey, 'izumi_floating_window_advice_enabled_v1');
  assert.equal(adviceSettings(preset).enabled, false);
  assert.equal(adviceSettings(preset).position, 'tail');
  const settings = adviceSettings(preset, {
    [binding.enabledKey]: 'true',
    [binding.configKey]: JSON.stringify({
      position: 'head',
      stripModelAdvice: false,
      replacementText: '执行建议。',
    }),
  });
  assert.deepEqual(settings, {
    enabled: true,
    position: 'head',
    stripModelAdvice: true,
    replacementText: '执行建议。',
  });
  assert.equal(adviceSettings(preset, { [binding.configKey]: 'broken' }).position, 'tail');
  preset.extensions.tavern_helper.scripts[0].enabled = false;
  assert.equal(adviceSettings(preset), null);
  assert.equal(adviceSettings({ extensions: {} }), null);
  assert.equal(adviceSettings(fixture(), { 'wanxiang:advice-enabled': 'true' }).enabled, true);
});

test('Advice projects retained conversation pairs without altering originals, retrying twice or crossing another user', () => {
  const config = { ...adviceSettings(fixture()), enabled: true };
  const source = [
    { role: 'user', content: '第一句话，没有上一条AI。' },
    { role: 'assistant', content: '先前正文<advice>模型建议</advice>' },
    { role: 'system', content: '换到靠窗圆桌' },
    { role: 'user', content: '过去发生了什么？' },
    { role: 'assistant', content: '举起茶杯。' },
    { role: 'user', content: '我向潘多拉道谢。' },
    { role: 'user', content: '失败后又说一句，不能挤进同一条AI。' },
  ];
  const before = structuredClone(source);
  const first = adviceTranscript(source, config);
  assert.equal(first.transferred, 2);
  assert.equal(first.messages[0].content, source[0].content);
  assert.equal(first.messages[1].content, '先前正文\n\n<advice>过去发生了什么？</advice>');
  assert.equal(first.messages[2].content, source[2].content);
  assert.equal(first.messages[3].content, config.replacementText);
  assert.equal(first.messages[4].content, '举起茶杯。\n\n<advice>我向潘多拉道谢。</advice>');
  assert.equal(first.messages[6].content, source[6].content);
  assert.deepEqual(adviceTranscript(source, config), first, 'Retry rebuilds from unchanged source');
  assert.deepEqual(source, before);
  assert.deepEqual(adviceTranscript(source, { ...config, enabled: false }).messages, source);
  const edited = structuredClone(source.slice(0, 4));
  edited[3].content = '改问另外一件事。';
  assert(!adviceTranscript(edited, config).messages[1].content.includes('过去发生了什么'));
  const deleted = source.slice(2, 4);
  assert.equal(adviceTranscript(deleted, config).transferred, 0);
});

test('Advice head follows the last planning boundary and tail can preserve model advice', () => {
  const pair = [
    {
      role: 'assistant',
      content: '<konatan_planning~>准备</konatan_planning~>\n正文<advice>模型建议</advice>',
    },
    { role: 'user', content: '本轮动作🌙' },
  ];
  const config = { ...adviceSettings(fixture()), enabled: true, position: 'head' };
  assert.equal(
    adviceTranscript(pair, config).messages[0].content,
    '<konatan_planning~>准备</konatan_planning~>\n\n<advice>本轮动作🌙</advice>\n\n正文',
  );
  const tail = adviceTranscript(pair, { ...config, position: 'tail', stripModelAdvice: false });
  assert(tail.messages[0].content.includes('<advice>模型建议</advice>'));
  assert(tail.messages[0].content.endsWith('<advice>本轮动作🌙</advice>'));
});

test('chat Advice preview equals JSON/SSE upstream, keeps world mentions and exact TK, excludes other APIs', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/advice-'));
  const calls = [];
  let live = false;
  const api = await createAiApi({
    root: process.cwd(),
    port: 0,
    settingsFile: path.join(directory, 'config.json'),
    promptsDirectory: path.join(directory, 'presets'),
    worldInfoDirectory: path.join(directory, 'world'),
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      const content =
        '<wanxiang_chat>她把茶杯递来。</wanxiang_chat><wanxiang_actions>{"affection":[],"agreeToAdventure":[]}</wanxiang_actions>';
      return live
        ? new Response(
            `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
            { headers: { 'Content-Type': 'text/event-stream' } },
          )
        : Response.json({ choices: [{ message: { content } }] });
    },
  });
  const server = createServer((req, res) => void api(req, res, req.url));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  async function post(route, body) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    assert.equal(response.status, 200, result.error);
    return result;
  }
  const sources = [fixture(), fixture(true)];
  const actualFile = process.env.WANXIANG_TEST_ADVICE_PRESET_FILE;
  const actual = actualFile ? await readFile(actualFile, 'utf8') : null;
  if (actual) sources.push(JSON.parse(actual));
  const input = {
    text: '我向潘多拉道谢。',
    place: 'table',
    selected: [],
    characters: [{ id: 'official-pandora', name: '潘多拉', worldbook: '潘多拉资料测试标记' }],
    history: [
      { role: 'user', content: '最初问候。' },
      { role: 'assistant', content: '先前的回应。<advice>旧建议</advice>' },
      { role: 'system', content: '来到圆桌。' },
    ],
  };
  const original = structuredClone(input);
  try {
    for (const source of sources) {
      const saved = await post('prompts/save', {
        preset: { ...source, stream: false, contextSize: 131072, maxTokens: 1000 },
      });
      for (const kind of ['chat', 'quick-chat', 'character', 'script']) {
        await post('config', {
          kind,
          baseUrl: 'https://example.com/v1',
          model: 'mock',
          tokenField: 'max_tokens',
          maxTokens: 1000,
        });
        await post('prompts/select', { kind, id: saved.preset.id });
      }
      const binding = adviceBinding(saved.preset);
      await post('regex', {
        scripts: [
          {
            findRegex: '/<advice>[\\s\\S]*?<\\/advice>/g',
            replaceString: '',
            placement: [2],
            promptOnly: true,
          },
        ],
      });
      const off = await post('prompts/preview', { kind: 'chat', input });
      assert.equal(off.transport.advice.status, 'disabled');
      const storage = {
        [binding.enabledKey]: 'true',
        [binding.configKey]: JSON.stringify({
          position: 'tail',
          stripModelAdvice: true,
          replacementText: '本轮依照建议从头执行。',
        }),
        privateMarker: 'DO_NOT_SEND_PRIVATE_ADVICE_STORAGE',
      };
      await post(`helper-storage/${saved.preset.id}`, { storage });
      // A common cleanup regex removes old advice; it must not erase newly transferred input.
      for (live of [false, true]) {
        await post('prompts/save', {
          id: saved.preset.id,
          preset: { ...saved.preset, stream: live },
        });
        const preview = await post('prompts/preview', { kind: 'chat', input });
        assert.equal(preview.transport.advice.status, 'enabled');
        const text = preview.messages.map((message) => message.content).join('\n');
        assert(text.includes('<advice>我向潘多拉道谢。</advice>'));
        assert(
          text.includes('潘多拉资料测试标记'),
          'Original user mention still activates character context',
        );
        assert(!text.includes('DO_NOT_SEND_PRIVATE_ADVICE_STORAGE'));
        assert(
          preview.messages.some(
            (message) =>
              message.role === 'user' && message.content.includes('本轮依照建议从头执行。'),
          ),
        );
        assert(formatRequestPreview(preview).includes('Advice消息转移'));
        const result = await post('generate/chat', input);
        assert.equal(result.content, '她把茶杯递来。');
        assert.deepEqual(calls.at(-1).messages, preview.messages);
        const counts = await post('tokens', {
          texts: preview.messages.map((message) => message.content),
        });
        assert.equal(
          preview.tokens.contentTokens,
          counts.counts.reduce((sum, count) => sum + count, 0),
        );
      }
      for (const kind of ['quick-chat', 'character', 'script']) {
        const payload =
          kind === 'quick-chat'
            ? input
            : {
                brief: '调查遗迹',
                party: newLibrary().characters.map(settingOnly),
                boss: 'bossGate',
              };
        const preview = await post('prompts/preview', { kind, input: payload });
        assert.equal(preview.transport.advice, undefined, kind);
      }
      const first = await post('prompts/preview', {
        kind: 'chat',
        input: { ...input, history: [] },
      });
      assert.equal(first.transport.advice.status, 'no-paired-assistant');
      assert(
        first.messages.some(
          (message) => message.role === 'user' && message.content.includes(input.text),
        ),
      );
      await post(`helper-storage/${saved.preset.id}`, {
        storage: { ...storage, [binding.enabledKey]: 'false' },
      });
      const disabled = await post('prompts/preview', { kind: 'chat', input });
      assert.deepEqual(disabled.messages, off.messages);
    }
    assert.deepEqual(input, original);
    if (actualFile) assert.equal(await readFile(actualFile, 'utf8'), actual);
    assert.equal(
      calls.length,
      sources.length * 2,
      'Previews never generate and no retries are added',
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
