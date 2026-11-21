import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { normalizePromptPreset } from '../src/ai/presets.js';
import { presetProcessing, processPresetMessages } from '../src/ai/pipeline/preset-processing.js';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { presetOutputTransport, outputToolRequest } from '../src/ai/preset-output.js';
import { compatibleRequest } from '../src/ai/compatible.js';
import { miaosaiyaReassemble, miaosaiyaFinalRequest } from '../src/ai/miaosaiya-processing.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { createBrowserStores } from '../src/ai/browser-stores.js';
import { compactCharacterDocument, scriptFixture } from './fixtures/ai.js';
import { worldFixture } from './fixtures/multiverse.js';
import { formatRequestPreview } from '../src/app/request-preview.js';
import { vertexRequest } from '../src/ai/vertex.js';
import {
  builtinPrompt,
  createBuiltinPromptSource,
  normalizePromptOptions,
} from '../src/ai/builtin-prompt.js';

const readText = (file) => readFile(new URL('../prompts/' + file, import.meta.url), 'utf8');

test('the built-in 2.1.7 keeps the upgraded body envelope, adult modes and portable transport', async () => {
  const config = JSON.parse(await readText('framework/meowssiah-2.1.7.json'));
  const defaults = normalizePromptOptions();
  const { preset: chat } = normalizePromptPreset(builtinPrompt(config, 'chat', defaults, true));
  assert.match(chat.prompts.find(({ row }) => row === 2).content, /<wanxiang_output>/u);
  assert(!chat.prompts.some(({ row }) => [8, 12, 14, 18, 23, 46, 47].includes(row)));
  assert(!chat.prompts.some(({ content }) => content?.includes('catgodml')));
  const { outputTool } = presetOutputTransport(chat);
  assert.equal(outputToolRequest(outputTool).tool_choice.function.name, 'game_content');
  assert.equal(
    presetOutputTransport(builtinPrompt(config, 'chat', defaults)).outputTool,
    undefined,
  );
  for (const { key, row } of config.adultChoices) {
    const options = normalizePromptOptions({ adult: key });
    const selected = builtinPrompt(config, 'chat', options).prompts;
    assert.equal(
      selected.filter((entry) => config.adultChoices.some((item) => item.row === entry.row)).length,
      1,
    );
    const source = config.prompts.find((entry) => entry.row === row).content;
    assert.equal(
      selected.find((entry) => entry.row === row).content,
      source.slice(source.indexOf('>>>') + 3).trimStart(),
    );
  }
  const map = builtinPrompt(config, 'map', defaults, true);
  assert(!map.prompts.some(({ row }) => [2, 5, 43].includes(row)));
  assert.equal(presetOutputTransport(map).outputTool, undefined);
  const source = await createBuiltinPromptSource(readText, {
    get: (kind) => ({ promptProcessing: kind === 'script' ? 'strict' : 'merge_tools' }),
    promptOptions: () => normalizePromptOptions({ toolTransport: true }),
  });
  assert.equal(presetOutputTransport(await source.get('chat')).outputTool.name, 'game_content');
  assert.equal(presetOutputTransport(await source.get('script')).outputTool, undefined);
});

test('Miaosaiya rewrites roles, removes private blocks and numbers only older standalone summaries', () => {
  const source =
    '|用户：旅人|\n|用户|开始|delete|不发送的内容|/delete|\n|小猫之神|回应' +
    '<details><summary>界面标题</summary></details>' +
    '<summary>旧总结</summary>'.repeat(5);
  const result = miaosaiyaReassemble(source);
  assert(result.startsWith('\n"}, {"role": "旅人", "content": "\n开始'));
  assert(result.includes('\n"}, {"role": "soliumbra", "content": "\n回应'));
  assert(!result.includes('不发送的内容'));
  assert(result.includes('<details><summary>界面标题'));
  // The author's ten-character lookbehind also excludes a summary just after </details>.
  assert.equal((result.match(/---第\d段剧情总结---/gu) || []).length, 1);
  assert(!result.includes('<end>'), 'The original computes but does not insert this prefix');
});

test('Miaosaiya final callback preserves text parts, current user, fallback and marker behavior', () => {
  const source = [
    { role: 'system', content: [{ type: 'text', text: '<run_tool_replacement>规则' }] },
    { role: 'assistant', content: ['历史', { type: 'text', text: '正文' }] },
    { role: 'user', content: '当前任务' },
  ];
  const before = structuredClone(source);
  const processing = { finalRequest: 'miaosaiya-1.6' };
  const result = miaosaiyaFinalRequest(source, processing);
  assert.equal(result.messages[0].content[0].text, '规则');
  assert.deepEqual(result.messages[1], source[2]);
  assert.equal(result.contextTool.description, '历史\n正文');
  assert.equal(
    miaosaiyaFinalRequest(source.slice(0, -1), processing).messages[1].content,
    '", "function": ',
  );
  const inactive = [{ role: 'system', content: '普通预设' }];
  assert.deepEqual(miaosaiyaFinalRequest(inactive, processing).messages, inactive);
  assert(!miaosaiyaFinalRequest(inactive, processing).contextTool);
  assert.deepEqual(source, before);
  const tool = { name: 'game_content', parameters: { type: 'object' } };
  const declaration = outputToolRequest(tool, result.contextTool);
  assert.deepEqual(
    declaration.tools.map((entry) => entry.function.name),
    ['game_content', 'context'],
  );
  assert.equal(declaration.tool_choice.function.name, 'game_content');
});

test('unreviewed preset callbacks remain rejected instead of being executed', () => {
  for (const key of ['OutputPreprocessing', 'FinalRequestProcessing'])
    assert.throws(
      () =>
        presetProcessing({
          extensions: {
            SPreset: {
              [key]: { enabled: true, script: 'throw Error("IMPORTED_CODE_MUST_NOT_RUN")' },
            },
          },
        }),
      /版本未适配/u,
    );
});

test(
  'Meowssiah 2.0.10 uses the game protocol directly from the unmodified imported preset',
  { skip: !process.env.WANXIANG_TEST_MEOWSSIAH_PRESET_FILE },
  async () => {
    const bytes = await readFile(process.env.WANXIANG_TEST_MEOWSSIAH_PRESET_FILE);
    const { preset } = normalizePromptPreset(
      JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, '')),
      'meowssiah-local-test',
    );
    const original = structuredClone(preset);
    const world = JSON.parse(
      await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
    );
    const pipeline = createAiPipeline({
      worlds: {
        resolve: async () => ({ books: [structuredClone(world)], settings: {}, state: {} }),
        commit: async () => {},
      },
      settings: {
        get: () => ({
          model: 'local-mock',
          tokenField: 'max_tokens',
          maxTokens: 32768,
          contextSize: 400000,
          promptProcessing: 'merge_tools',
        }),
      },

      helperStorage: { get: () => ({}) },
      countTokens: (text) => Math.ceil(text.length / 3),
      readText,
    });
    const party = [{ id: 'traveller', name: '旅人', worldbook: '一位谨慎的旅人。' }];
    const cases = {
      character: { brief: '设计旅人', rollId: 'meowssiah-test' },
      script: { brief: '探索遗迹', party, boss: 'bossGate' },
      map: { brief: '潮灯之国' },
      creation: {
        items: [
          {
            id: 'ore',
            name: '晶石',
            description: '旧物',
            value: 50,
            map: 'forest',
            script: '在回廊找到的晶体。',
          },
        ],
      },
      chat: { text: '倒一杯茶', place: 'bar', characters: party, selected: [], history: [] },
      'quick-chat': { text: '接下来呢', characters: party, history: [] },
    };
    for (const [kind, input] of Object.entries(cases)) {
      const prepared = await pipeline.buildRequest(kind, input, preset);
      const text = prepared.messages.map(({ content }) => content).join('\n');
      assert.equal(prepared.transport.processingStatus.compatibility, 'meowssiah-2.0.10');
      assert.equal(prepared.transport.outputTool, undefined);
      assert.equal(prepared.transport.contextTool, undefined);
      assert.match(text, /wanxiang_output/u);
      assert.doesNotMatch(
        text,
        /<run_tool_replacement>|<<<\|catgodml\||<8wanxiang_output>|soliumbra_reply/u,
      );
      if (kind === 'quick-chat') {
        const reply = await pipeline.acceptResult(
          { kind, input, source: preset, prepared },
          {
            content: '<wanxiang_output>继续前进。</wanxiang_output>',
          },
        );
        assert.equal(reply.content, '继续前进。');
      }
    }
    assert.deepEqual(preset, original);
    assert.deepEqual(await readFile(process.env.WANXIANG_TEST_MEOWSSIAH_PRESET_FILE), bytes);
    const unknown = structuredClone(preset);
    unknown.extensions.SPreset.OutputPreprocessing.toolCallFormatter.script =
      'return foreignFormatter(calls);';
    assert.throws(() => presetProcessing(unknown), /版本未适配/u);
  },
);

function toolReply(content, stream) {
  const argumentsText = JSON.stringify({ content });
  if (!stream)
    return Response.json({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'cat-reply',
                type: 'function',
                function: { name: 'game_content', arguments: argumentsText },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });
  const frames = [...argumentsText].map((part, index) => ({
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              ...(index === 0 ? { id: 'cat-reply', type: 'function' } : {}),
              function: { ...(index === 0 ? { name: 'game_content' } : {}), arguments: part },
            },
          ],
        },
      },
    ],
  }));
  frames.push({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] });
  const body =
    frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join('') + 'data: [DONE]\n\n';
  const encoded = new TextEncoder().encode(body);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let index = 0; index < encoded.length; index += 7)
          controller.enqueue(encoded.slice(index, index + 7));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}

// Opt-in real-file verification, without copying prompts or executing imported callbacks.
test(
  'original Miaosaiya 1.6 works through server and static-browser pipelines for all six APIs',
  { skip: !process.env.WANXIANG_TEST_CAT_PRESET_FILE },
  async (t) => {
    const bytes = await readFile(process.env.WANXIANG_TEST_CAT_PRESET_FILE);
    const raw = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/u, ''));
    const original = structuredClone(raw);
    const { preset } = normalizePromptPreset(raw, 'cat-preset-test');
    t.diagnostic(`SHA256 ${createHash('sha256').update(bytes).digest('hex')}`);
    const processing = presetProcessing(preset);
    assert.equal(processing.output, 'miaosaiya-1.6');
    assert.equal(processing.reassembly.version, 'miaosaiya-1.6');
    assert.equal(processing.finalRequest, 'miaosaiya-1.6');
    assert.equal(presetOutputTransport(preset).promptProcessing, 'none');
    const rewritten = processPresetMessages(
      [
        { role: 'system', content: '<|sep|><|merge|><run_tool_replacement>' },
        { role: 'user', content: '任务' },
      ],
      processing,
      { user: '旅人' },
    );
    assert(rewritten.messages[1].content.startsWith('|旅人|\n'));
    const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/cat-preset-'));
    const server = await createWorldbookStore(directory);
    const { book } = await server.get('tavern-world');
    const values = new Map();
    const database = {
      get: (key) => structuredClone(values.get(key)),
      entries: () => [...values],
      async write(entries) {
        for (const [key, value] of entries) values.set(key, structuredClone(value));
      },
      async update(key, transform) {
        const next = transform(structuredClone(values.get(key)));
        if (next === undefined) return false;
        values.set(key, structuredClone(next));
        return true;
      },
    };
    const browser = await createBrowserStores(database, readText, book);
    const party = [{ id: 'traveller', name: '旅人', worldbook: '一位谨慎的旅人🌙' }];
    const inputs = {
      character: { brief: '设计一位巡灯旅人', rollId: 'cat-test' },
      script: { brief: '探索遗迹', party, boss: 'bossGate' },
      map: { brief: '潮灯之国' },
      creation: {
        items: [
          {
            id: 'ore',
            name: '凝蜜晶',
            description: '旧物',
            value: 50,
            map: 'forest',
            script: '在回廊找到的晶体。',
          },
        ],
      },
      chat: {
        text: '倒一杯茶',
        place: 'bar',
        selected: [],
        characters: party,
        history: [{ role: 'assistant', content: '刚刚结束旅程。' }],
      },
      'quick-chat': { text: '接下来呢', characters: party, history: [] },
    };
    const json = (value) => `<wanxiang_json>${JSON.stringify(value)}</wanxiang_json>`;
    const outputs = {
      character: json(compactCharacterDocument()),
      script: json(scriptFixture(party.map((entry) => entry.id))),
      map: json(worldFixture()),
      creation: json({
        schemaVersion: 2,
        items: [
          {
            id: 'ore',
            name: '凝蜜晶',
            description: '余辉',
            design: { statFocus: ['hp'], rules: [] },
          },
        ],
      }),
      chat: '<wanxiang_chat>茶已经准备好了🌙。</wanxiang_chat><wanxiang_actions>{"affection":[],"agreeToAdventure":[]}</wanxiang_actions>',
      'quick-chat': '<wanxiang_chat>继续前进🌙。</wanxiang_chat>',
    };
    for (const [host, worlds] of [
      ['server', server],
      ['browser', browser.worlds],
    ]) {
      const profile = {
        baseUrl: 'https://mock.invalid/v1',
        model: 'local-mock',
        apiKey: 'not-a-real-key',
        tokenField: 'max_tokens',
        maxTokens: 32768,
        contextSize: 400000,
        promptProcessing: 'strict',
      };
      const pipeline = createAiPipeline({
        worlds,
        settings: { get: () => profile },

        helperStorage: { get: () => ({}) },
        countTokens: (text) => Math.ceil(text.length / 3),
        readText,
      });
      for (const [kind, input] of Object.entries(inputs))
        await t.test(`${host}: ${kind}`, async () => {
          const prepared = await pipeline.buildRequest(kind, input, preset);
          assert.equal(prepared.transport.processingStatus.finalRequest, 'miaosaiya-1.6');
          assert.equal(prepared.messages.length, 2);
          assert.equal(prepared.messages[0].role, 'system');
          assert.equal(prepared.messages[1].role, 'user');
          assert(!prepared.messages[0].content.includes('<run_tool_replacement>'));
          const context = prepared.transport.contextTool.description;
          assert(
            context.includes(input.brief || input.text || input.items[0].script),
            'Current task survives relocation',
          );
          assert(!context.includes('{{user}}'));
          assert(prepared.tokens.toolTokens > 0);
          assert(formatRequestPreview(prepared).includes(JSON.stringify(context)));
          for (const stream of [false, true]) {
            const job = {
              input,
              kind,
              source: preset,
              profile,
              prepared,
              messages: prepared.messages,
              requestId: `${host}-${kind}-${stream}`,
            };
            const options = pipeline.completionOptions(job);
            let calls = 0;
            const result = await compatibleRequest(profile, prepared.messages, {
              ...options,
              sampling: { ...options.sampling, stream },
              fetchImpl: async (_url, request) => {
                calls++;
                const payload = JSON.parse(request.body);
                assert.deepEqual(payload.messages, prepared.messages);
                assert.deepEqual(
                  payload.tools.map((entry) => entry.function.name),
                  ['game_content', 'context'],
                );
                assert.equal(payload.tools[1].function.description, context);
                assert.equal(payload.tool_choice.function.name, 'game_content');
                const vertex = vertexRequest(
                  { baseUrl: 'https://aiplatform.googleapis.com/v1', model: 'gemini-test' },
                  payload,
                );
                assert.equal(vertex.body.tools[0].functionDeclarations[1].description, context);
                return toolReply(outputs[kind], stream);
              },
            });
            assert.equal(calls, 1);
            assert.equal(result.content, outputs[kind]);
            const accepted = await pipeline.acceptResult(job, result);
            if (kind === 'character' || kind === 'script')
              assert.equal(accepted.diagnostic.stage, 'complete');
            else if (kind === 'map') assert.equal(accepted.world.name, '潮灯之国');
            else if (kind === 'creation') assert.equal(accepted.items.length, 1);
            else assert(accepted.content.includes('🌙'));
          }
        });
    }
    assert.deepEqual(raw, original);
    assert.deepEqual(preset.extensions.SPreset, original.extensions.SPreset);
    const changed = structuredClone(preset);
    changed.extensions.SPreset.FinalRequestProcessing.enabled = false;
    assert(!presetProcessing(changed).finalRequest);
  },
);

test('Meowssiah 2.1.7+ and future versions auto-disable options/comment/summary, convert <game> to <wanxiang_output>, and pass all 6 APIs', async () => {
  const fixture = {
    name: 'Meowssiah-2.1.7-test',
    function_calling: true,
    assistant_prefill: 'unused',
    prompts: [
      {
        identifier: 'init-catgod',
        name: '（不要关）token重定义+初始化',
        role: 'system',
        content:
          '{{trim}}<|sep|><|merge|>小猫之神使用soliumbra_reply与<think_nya></think_nya><run_tool_replacement><<<|catgodml|enableMenu>>>',
      },
      {
        identifier: 'cat-summon',
        name: '（不要关）召唤术',
        role: 'system',
        content: '|小猫之神|加入`soliumbra_reply`和<think_nya>思考</think_nya>',
      },
      {
        identifier: 'cat-style-future',
        name: '📝文风|电影运镜',
        role: 'system',
        content:
          '<<<|catgodml|radio:主文风选择:📝s喵特调一（电影运镜）>>>\n用电影远景与近景描写角色动作。',
      },
      {
        identifier: 'cat-anti-meta',
        name: '⚙️防全知（带思维链）',
        role: 'system',
        content:
          '避免NPC拥有上帝视野\n<<<|catgodml|registerThinkingStep:20:检查每位角色视野边界>>>',
      },
      {
        identifier: 'catgod-deepthink-steps-base',
        name: '🧠大思考步骤（可改）',
        role: 'system',
        content: '{{// 纯注释头}}\n<<<|catgodml|registerThinkingStep:10:复盘前情>>>',
      },
      {
        identifier: 'chatHistory',
        name: 'Chat History',
        role: 'system',
        marker: true,
        content: '',
      },
      {
        identifier: 'new-uuid-game-tag',
        name: '📏<game>标签（别关）',
        role: 'system',
        enabled: false,
        content:
          '<<<|catgodml|menu:输出格式模块:📏<game>正文包裹>>>\n正文要用<game></game>标签包上',
      },
      {
        identifier: 'new-uuid-options',
        name: '📏行动选择',
        role: 'system',
        content:
          '<<<|catgodml|menu:输出格式模块:📏<options>行动选项>>>\n在剧情结束后给出3个行动选项：<options><option>1</option></options>',
      },
      {
        identifier: 'new-uuid-summary',
        name: '📏小总结',
        role: 'system',
        content:
          '<<<|catgodml|menu:输出格式模块:📏<summary>高密度场记卡>>>\n必须在<summary></summary>标签内写场记。',
      },
      {
        identifier: 'new-uuid-comment',
        name: '📏猫猫留言~',
        role: 'system',
        content:
          '<<<|catgodml|menu:输出格式模块:📏<comment>猫猫悄悄话>>>\n可以在<comment></comment>里悄悄说话。',
      },
      {
        identifier: 'SPresetSettings',
        name: 'SPreset配置',
        role: 'system',
        enabled: false,
        content: JSON.stringify({ packedRegexBackup: 'x'.repeat(180000) }),
      },
    ],
    prompt_order: [
      {
        character_id: 100001,
        order: [
          { identifier: 'init-catgod', enabled: true },
          { identifier: 'cat-summon', enabled: true },
          { identifier: 'cat-style-future', enabled: true },
          { identifier: 'cat-anti-meta', enabled: true },
          { identifier: 'catgod-deepthink-steps-base', enabled: true },
          { identifier: 'chatHistory', enabled: true },
          { identifier: 'new-uuid-game-tag', enabled: false },
          { identifier: 'new-uuid-options', enabled: true },
          { identifier: 'new-uuid-summary', enabled: true },
          { identifier: 'new-uuid-comment', enabled: true },
          { identifier: 'SPresetSettings', enabled: false },
        ],
      },
    ],
    extensions: {
      tavern_helper: { scripts: [{ id: 's1', name: 'SPreset', content: 'void 0', enabled: true }] },
      SPreset: {
        OutputPreprocessing: {
          enabled: true,
          script:
            '// future v2.2\n({ buffer }) => buffer.replace(/<think>[\\s\\S]*?(?=<think_nya|<report_nya)/gi, "")',
          toolCallFormatter: {
            enabled: true,
            script:
              '// future v2.2\n({ calls }) => calls.filter(c => /soliumbra_reply/.test(c.name))',
          },
        },
        FinalRequestProcessing: {
          enabled: true,
          script: '// future CatGod Stage1\n// reads catgodml tags and soliumbra_reply',
        },
      },
    },
  };

  const { preset, warnings } = normalizePromptPreset(fixture, 'meowssiah-217-future');
  assert(warnings.some((line) => line.includes('默认关闭「行动选项」「猫猫留言」「小总结」')));
  assert(!warnings.some((line) => line.includes('附带酒馆助手脚本')));

  const orderById = Object.fromEntries(
    preset.prompt_order[0].order.map((item) => [item.identifier, item.enabled]),
  );
  assert.equal(orderById['new-uuid-options'], false);
  assert.equal(orderById['new-uuid-summary'], false);
  assert.equal(orderById['new-uuid-comment'], false);
  assert.equal(orderById['new-uuid-game-tag'], true);

  const gamePrompt = preset.prompts.find((entry) => entry.identifier === 'new-uuid-game-tag');
  assert.equal(gamePrompt.name, '📏<wanxiang_output>标签（别关）');
  assert(gamePrompt.content.includes('<wanxiang_output></wanxiang_output>'));
  assert(!/<\/?game>/u.test(gamePrompt.content));

  // Manual re-enable after import must survive subsequent saves (idempotent adaptation).
  const edited = structuredClone(preset);
  edited.prompt_order[0].order.find((item) => item.identifier === 'new-uuid-comment').enabled =
    true;
  const resaved = normalizePromptPreset(edited, 'meowssiah-217-future').preset;
  assert.equal(
    resaved.prompt_order[0].order.find((item) => item.identifier === 'new-uuid-comment').enabled,
    true,
  );

  const world = JSON.parse(
    await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
  );
  const pipeline = createAiPipeline({
    worlds: {
      resolve: async () => ({ books: [structuredClone(world)], settings: {}, state: {} }),
      commit: async () => {},
    },
    settings: {
      get: () => ({
        model: 'local-mock',
        tokenField: 'max_tokens',
        maxTokens: 32768,
        contextSize: 400000,
        promptProcessing: 'merge_tools',
      }),
    },

    helperStorage: { get: () => ({}) },
    countTokens: (text) => Math.ceil(text.length / 3),
    readText,
  });

  const party = [{ id: 'traveller', name: '旅人', worldbook: '一位谨慎的旅人。' }];
  const cases = {
    character: { brief: '设计旅人', rollId: 'meowssiah-217-test' },
    script: { brief: '探索遗迹', party, boss: 'bossGate' },
    map: { brief: '潮灯之国' },
    creation: {
      items: [
        {
          id: 'ore',
          name: '晶石',
          description: '旧物',
          value: 50,
          map: 'forest',
          script: '在回廊找到的晶体。',
        },
      ],
    },
    chat: { text: '倒一杯茶', place: 'bar', characters: party, selected: [], history: [] },
    'quick-chat': { text: '接下来呢', characters: party, history: [] },
  };
  for (const [kind, input] of Object.entries(cases)) {
    const prepared = await pipeline.buildRequest(kind, input, preset);
    const text = prepared.messages.map(({ content }) => content).join('\n');
    assert.equal(prepared.transport.processingStatus.compatibility, 'meowssiah-2.0.10');
    assert.equal(prepared.transport.outputTool, undefined);
    assert.match(text, /wanxiang_output/u);
    assert.match(text, /电影远景与近景描写角色动作/u);
    assert.match(text, /避免NPC拥有上帝视野/u);
    assert.doesNotMatch(
      text,
      /<run_tool_replacement>|<<<\|catgodml\||<8wanxiang_output>|soliumbra_reply|<options>|高密度场记卡|<comment>/u,
    );
  }

  // Foreign unknown SPreset scripts must still fail loudly instead of executing unknown callbacks.
  const foreign = structuredClone(preset);
  foreign.extensions.SPreset.OutputPreprocessing.toolCallFormatter.script =
    'return runForeignPlugin(calls);';
  assert.throws(() => presetProcessing(foreign), /版本未适配/u);
});
