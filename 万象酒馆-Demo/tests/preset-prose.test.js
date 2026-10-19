import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createMacroExpander } from '../src/ai/prompt-macros.js';
import { normalizePromptPreset, composePromptPreset } from '../src/ai/presets.js';
import {
  presetOutputTransport,
  presetOutputWarnings,
  outputToolRequest,
} from '../src/ai/preset-output.js';
import { formatRequestPreview } from '../src/app/request-preview.js';
import { createAiApi } from '../server/ai-api.mjs';
import { newLibrary } from '../src/ai/library.js';
import { settingOnly } from '../src/ai/contracts.js';
import { compactCharacterDocument, scriptFixture } from './fixtures/ai.js';

function rebornFixture() {
  return normalizePromptPreset({
    name: 'Reborn正文适配用例',
    prompts: [
      { identifier: 'style', role: 'system', content: '对白自然，保留{{user}}的选择。' },
      {
        identifier: 'carrier',
        role: 'system',
        content:
          '写作要求：中文，保留场景细节。\n<output_method>所有输出必须调用game_content函数工具，放在content参数中输出。</output_method>\n每次写出人物动作。',
      },
      { identifier: 'chatHistory', marker: true },
    ],
    extensions: {
      SPreset: {
        ToolBindings: {
          carrier: {
            enabled: true,
            code: 'throw Error("IMPORTED_TOOL_MUST_NOT_RUN")',
            form: {
              name: 'game_content',
              parameters: [{ name: 'content', type: 'string', required: true }],
              actionBody: 'throw Error("IMPORTED_ACTION_MUST_NOT_RUN")',
            },
          },
        },
        OutputPreprocessing: { enabled: true, script: 'throw Error("MUST_NOT_RUN")' },
        ForcedPostProcessing: { enabled: true, mode: 'merge_tools' },
      },
    },
  }).preset;
}

function compose(preset) {
  return composePromptPreset(
    preset,
    { user: '青缘' },
    { taskContext: [{ role: 'user', content: '倒一杯茶。' }], chatHistory: [] },
  );
}

test('Kemini literal writing slots survive nested macros while real unknown macros still fail', () => {
  const source =
    '{{setvar::format::<thinking>{{思考内容}}</thinking>\n{{正文内容}}\n{{可能要求的附加内容}}}}{{setvar::style::自然对白}}格式：{{getvar::format}}，文风：{{getvar::style}}。';
  const result = createMacroExpander({})(source);
  assert.equal(
    result,
    '格式：<thinking>{{思考内容}}</thinking>\n{{正文内容}}\n{{可能要求的附加内容}}，文风：自然对白。',
  );
  for (const source of ['{{not_a_macro}}', '{{正文内容::unsupported}}', '{{__proto__}}'])
    assert.throws(() => createMacroExpander({})(source), /未适配宏/u);
});

test('Reborn keeps every prompt intact and declares its active game_content tool without executing actions', () => {
  const preset = rebornFixture();
  const before = structuredClone(preset);
  const messages = compose(preset);
  assert.equal(messages[0].content, '对白自然，保留青缘的选择。');
  assert(messages[1].content.startsWith('写作要求：中文，保留场景细节。'));
  assert(messages[1].content.endsWith('每次写出人物动作。'));
  assert.equal(messages[1].content, preset.prompts[1].content);
  assert(messages[1].content.includes('必须调用game_content'));
  assert.equal(messages.at(-1).content, '倒一杯茶。');
  assert.equal(presetOutputWarnings(preset).length, 1);
  const transport = presetOutputTransport(preset);
  assert.equal(transport.promptProcessing, 'merge_tools');
  const declaration = outputToolRequest(transport.outputTool);
  assert.equal(declaration.tools[0].function.name, 'game_content');
  assert.deepEqual(declaration.tools[0].function.parameters.required, ['content']);
  assert(!JSON.stringify(declaration).includes('MUST_NOT_RUN'));
  assert.deepEqual(preset, before);

  for (const alter of [
    (value) => {
      value.extensions.SPreset.ToolBindings.carrier.enabled = false;
    },
    (value) => {
      value.extensions.SPreset.ToolBindings.carrier.form.name = 'unrelated_tool';
    },
    (value) => {
      value.extensions.SPreset.ToolBindings.carrier.form.parameters[0].type = 'number';
    },
    (value) => {
      delete value.extensions.SPreset.ToolBindings.carrier.form;
    },
    (value) => {
      value.function_calling = false;
    },
  ]) {
    const value = structuredClone(preset);
    alter(value);
    assert(compose(value)[1].content.includes('必须调用game_content'));
    assert.deepEqual(presetOutputWarnings(value), []);
    assert.deepEqual(presetOutputTransport(value), {});
  }
  const disabled = structuredClone(preset);
  disabled.prompt_order[0].order.find((entry) => entry.identifier === 'carrier').enabled = false;
  assert.deepEqual(presetOutputWarnings(disabled), []);
  assert(!compose(disabled).some((message) => message.content.includes('output_method')));
});

test(
  'imported Kemini and Reborn preserve prompts and use their declared transport through every game API',
  {
    skip: !process.env.WANXIANG_TEST_PROSE_PRESETS_DIR,
  },
  async () => {
    const sourceDirectory = process.env.WANXIANG_TEST_PROSE_PRESETS_DIR;
    const sources = [];
    for (const name of await readdir(sourceDirectory)) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(sourceDirectory, name);
      const content = await readFile(file, 'utf8');
      const preset = JSON.parse(content);
      if (['Kemini_Dramatron_v3.1', 'Reborn2.4'].includes(preset.name))
        sources.push({ file, content, preset });
    }
    assert.deepEqual(sources.map(({ preset }) => preset.name).sort(), [
      'Kemini_Dramatron_v3.1',
      'Reborn2.4',
    ]);
    const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/prose-presets-'));
    const calls = [];
    let output = '';
    const api = await createAiApi({
      root: process.cwd(),
      port: 0,
      settingsFile: path.join(directory, 'config.json'),
      promptsDirectory: path.join(directory, 'presets'),
      worldInfoDirectory: path.join(directory, 'world'),
      fetchImpl: async (_url, options) => {
        const payload = JSON.parse(options.body);
        calls.push(payload);
        if (payload.stream) {
          const delta = payload.tools
            ? {
                tool_calls: [
                  {
                    index: 0,
                    id: 'reply',
                    type: 'function',
                    function: {
                      name: payload.tools[0].function.name,
                      arguments: JSON.stringify({ content: output }),
                    },
                  },
                ],
              }
            : { content: output };
          return new Response(
            `data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: payload.tools ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 30 } })}\n\ndata: [DONE]\n\n`,
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
        }
        return Response.json({
          choices: [
            {
              message: payload.tools
                ? {
                    content: null,
                    tool_calls: [
                      {
                        id: 'reply',
                        type: 'function',
                        function: {
                          name: payload.tools[0].function.name,
                          arguments: JSON.stringify({ content: output }),
                        },
                      },
                    ],
                  }
                : { content: output },
            },
          ],
          usage: { prompt_tokens: 100, completion_tokens: 30 },
        });
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
    const party = newLibrary().characters.map(settingOnly);
    try {
      for (const source of sources) {
        const saved = await post('prompts/save', { preset: source.preset });
        for (const live of [false, true]) {
          await post('prompts/save', {
            id: saved.preset.id,
            preset: { ...source.preset, stream: live },
          });
          for (const kind of ['character', 'script', 'chat', 'quick-chat']) {
            await post('config', {
              kind,
              baseUrl: 'https://example.com/v1',
              model: 'mock',
              tokenField: 'max_tokens',
              promptProcessing: 'strict',
            });
            await post('prompts/select', { kind, id: saved.preset.id });
            const chatting = ['chat', 'quick-chat'].includes(kind);
            const input = chatting
              ? {
                  text: '倒一杯茶。',
                  place: 'table',
                  characters: party,
                  selected: [party[0].id],
                  history: [{ role: 'assistant', content: '旧日的旅程已经结束。' }],
                }
              : { brief: '沿着旧路继续调查。', party, boss: 'bossGate' };
            const preview = await post('prompts/preview', { kind, input });
            const promptText = preview.messages.map((message) => message.content).join('\n');
            if (source.preset.name.startsWith('Kemini')) {
              assert(promptText.includes('{{思考内容}}'));
              assert(promptText.includes('{{正文内容}}'));
              assert.equal(preview.transport.processingStatus.kemini, 'enabled');
              assert.match(
                preview.transport.outputTool.name,
                /^emit_complete_response_[a-f0-9]{24}$/u,
              );
            } else {
              assert(
                preview.warnings.some((warning) => warning.includes('已启用game_content工具输出')),
              );
              assert(promptText.includes('必须调用game_content'));
              assert(!promptText.includes('直接在普通回复中返回完整内容'));
              assert.equal(preview.transport.promptProcessing, 'merge_tools');
              assert(preview.tokens.toolTokens > 0);
              assert(formatRequestPreview(preview).includes('正文输出工具'));
            }
            output = chatting
              ? '<wanxiang_chat>潘多拉将茶杯推到桌边。</wanxiang_chat>' +
                (kind === 'chat'
                  ? '<wanxiang_actions>{"affection":[],"agreeToAdventure":[]}</wanxiang_actions>'
                  : '')
              : `<wanxiang_json>${JSON.stringify(kind === 'character' ? compactCharacterDocument() : scriptFixture(party.map((entry) => entry.id)))}</wanxiang_json>`;
            const generated = await post(`generate/${kind}`, input);
            assert.deepEqual(calls.at(-1).messages, preview.messages);
            assert(calls.at(-1).tools);
            {
              const declared = outputToolRequest(preview.transport.outputTool);
              assert.deepEqual(calls.at(-1).tools, declared.tools);
              assert.deepEqual(calls.at(-1).tool_choice, declared.tool_choice);
              assert.equal(
                preview.tokens.inputEstimate,
                preview.tokens.contentTokens +
                  preview.tokens.overheadEstimate +
                  preview.tokens.responseFormatTokens +
                  preview.tokens.toolTokens,
              );
            }
            if (chatting) assert.equal(generated.content, '潘多拉将茶杯推到桌边。');
            else assert.equal(generated.diagnostic.stage, 'complete');
          }
        }
        if (source.preset.name.startsWith('Kemini')) {
          await post(`helper-storage/${saved.preset.id}`, {
            storage: {
              'wanxiang:variable-scopes': JSON.stringify({
                global: { privateInstall: 'PRIVATE_INSTALL_MARKER' },
                script: {
                  '2c7d747c-22d4-4e8b-95f8-5620b552fe6e': {
                    keminiCompanion: { antiTruncationEnabled: false },
                  },
                },
              }),
            },
          });
          const off = await post('prompts/preview', {
            kind: 'chat',
            input: {
              text: '关闭后的请求',
              place: 'table',
              selected: [],
              characters: party,
              history: [],
            },
          });
          assert.equal(off.transport.processingStatus.kemini, 'disabled');
          assert(!off.transport.outputTool);
          assert(!JSON.stringify(off).includes('PRIVATE_INSTALL_MARKER'));
        }
        assert.equal(await readFile(source.file, 'utf8'), source.content);
      }
      assert.equal(
        calls.length,
        16,
        'Previews never call upstream, and no automatic retries occur',
      );
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
