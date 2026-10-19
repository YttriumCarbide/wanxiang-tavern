import test from 'node:test';
import assert from 'node:assert/strict';
import {
  presetProcessing,
  processPresetMessages,
  prepareKeminiTransport,
  createPresetOutputProcessor,
  processGeneratedProse,
  presetStopStrings,
} from '../server/preset-processing.mjs';
import { compatibleRequest } from '../server/compatible.mjs';

test('Reborn output preprocessing preserves state across every split, including Unicode, headers and tags', () => {
  const raw =
    'finishReason: STOP\nfinishMessage: done\n<wanxiang_chat><game>\\u4f60\\u597d\\ud83c\\udf19</game><details><summary>摘要</summary>茶杯</details></wanxiang_chat>';
  const read = (parts) => {
    const emitted = [];
    const processor = createPresetOutputProcessor({ output: 'reborn-2.4' }, (text) =>
      emitted.push(text),
    );
    parts.forEach((part) => processor.feed(part));
    const result = processor.finish();
    assert.equal(emitted.join(''), result);
    return result;
  };
  const expected = read([raw]);
  assert(expected.includes('你好🌙'));
  assert(!expected.includes('finishReason'));
  assert(!expected.includes('\\u'));
  for (let index = 0; index <= raw.length; index++)
    assert.equal(read([raw.slice(0, index), raw.slice(index)]), expected, `split ${index}`);
  assert.equal(read([...raw]), expected);
});

test('Reborn runs array postprocessing with squash off, preserves source and respects no-convert boundaries', () => {
  const original = [
    { role: 'system', content: '固定前缀<|no-convert|>' },
    { role: 'system', content: '<prefill_thinking>已有准备</prefill_thinking>写作规则' },
    { role: 'assistant', content: '之前的正文' },
    { role: 'user', content: '本轮行动' },
  ];
  const before = structuredClone(original);
  const processing = {
    reassembly: { enabled: false, conditional: true, tag: '<|merge|>', version: 'reborn-2.4' },
  };
  const result = processPresetMessages(original, processing);
  assert.equal(result.status.reassembly, 'enabled');
  assert.equal(result.messages[0].content, '固定前缀');
  const text = result.messages.map((message) => message.content).join('\n');
  assert(text.includes('本轮行动') && text.includes('之前的正文'));
  assert(text.includes('"role":"soliumbra","analyze":"已有准备","content":"'));
  assert(!text.includes('<prefill_thinking>'));
  assert.deepEqual(original, before);
});

test('conditional squash consumes its marker only when triggered and preserves separated messages', () => {
  const processing = {
    reassembly: {
      version: 'reborn-2.4',
      enabled: true,
      conditional: true,
      tag: '<|merge|>',
      settings: {
        role: 'assistant',
        user_prefix: '|用户|',
        char_prefix: '|小猫之神|',
        enable_squashed_separator: true,
        squashed_separator_string: '<|sep|>',
        enable_stop_string: true,
        stop_string: '["<end>"]',
      },
    },
  };
  const plain = [
    { role: 'system', content: '规则' },
    { role: 'user', content: '动作' },
  ];
  assert.deepEqual(processPresetMessages(plain, processing).messages, plain);
  const triggered = [
    { role: 'system', content: '<|merge|><|sep|>保留层' },
    { role: 'user', content: '动作' },
    { role: 'assistant', content: '回应' },
  ];
  const result = processPresetMessages(triggered, processing);
  assert.equal(result.status.reassembly, 'enabled');
  assert.equal(result.messages[0].content, '保留层');
  assert.equal(result.messages[1].role, 'assistant');
  assert.equal(result.messages[1].content, '|用户|动作|小猫之神|回应');
  assert.deepEqual(presetStopStrings(processing), ['<end>']);
  processing.reassembly.version = 'unknown';
  assert.throws(() => processPresetMessages(triggered, processing), /版本未适配/u);
  assert.deepEqual(processPresetMessages(plain, processing).messages, plain);
});

test('structured game JSON is preserved while only its compiled prose receives preset processing', () => {
  const entry = {
    schemaVersion: 4,
    id: 'fixed-id',
    story: ['<details>\\u4f60\\u597d</details>'],
    items: [{ value: 10 }],
  };
  const before = structuredClone(entry);
  processGeneratedProse(entry, 'script', { output: 'reborn-2.4' });
  assert(entry.story[0].includes('你好'));
  assert.equal(entry.id, before.id);
  assert.deepEqual(entry.items, before.items);
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(entry)));
  assert.throws(
    () =>
      presetProcessing({
        extensions: {
          SPreset: { OutputPreprocessing: { enabled: true, script: 'throw Error("NO_EXEC")' } },
        },
      }),
    /版本未适配/u,
  );
});

test('Kemini transport is deterministic for preview, inserts at its anchor, and obeys the saved off switch', () => {
  const source = [
    { role: 'user', content: '动作' },
    { role: 'system', content: '<format>正文格式</format>' },
  ];
  const first = prepareKeminiTransport(source, { kemini: true });
  assert.deepEqual(first, prepareKeminiTransport(source, { kemini: true }));
  assert(first.messages[1].content.includes(first.outputTool.name));
  assert.equal(first.messages[2].content, source[1].content);
  const preset = {
    extensions: {
      tavern_helper: {
        scripts: [
          {
            id: '2c7d747c-22d4-4e8b-95f8-5620b552fe6e',
            name: 'Kemini',
            content: 'void 0',
            enabled: true,
          },
        ],
      },
    },
  };
  assert.equal(presetProcessing(preset).kemini, true);
  const storage = {
    'wanxiang:variable-scopes': JSON.stringify({
      script: {
        '2c7d747c-22d4-4e8b-95f8-5620b552fe6e': {
          keminiCompanion: { antiTruncationEnabled: false },
        },
      },
    }),
  };
  assert.equal(presetProcessing(preset, storage).kemini, false);
  assert.deepEqual(prepareKeminiTransport(source, { kemini: false }).messages, source);
});

test('Kemini JSON and SSE choose one full reply across plain and synthetic channels; Reborn preprocesses real chunks', async () => {
  const profile = {
    baseUrl: 'https://example.com/v1',
    model: 'mock',
    apiKey: '',
    temperature: null,
  };
  const tool = prepareKeminiTransport([{ role: 'user', content: '动作' }], {
    kemini: true,
  }).outputTool;
  const winner = '<wanxiang_chat>完整的正文。</wanxiang_chat>';
  for (const live of [false, true]) {
    const result = await compatibleRequest(profile, [], {
      outputTool: tool,
      outputEnvelope: true,
      fetchImpl: async () => {
        const message = {
          content: winner,
          tool_calls: [
            {
              type: 'function',
              function: { name: tool.name, arguments: JSON.stringify({ content: '短句' }) },
            },
          ],
        };
        if (!live) return Response.json({ choices: [{ message }] });
        const events = [
          { choices: [{ delta: { content: message.content } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, ...message.tool_calls[0] }] } }] },
          { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        ];
        return new Response(
          events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('') + 'data: [DONE]\n\n',
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      },
    });
    assert.equal(result.content, winner);
    assert.equal(result.rawContent, winner);
  }
  const pieces = [];
  const raw = 'finishReason: STOP\n<wanxiang_chat>\\u4f60\\u597d</wanxiang_chat>';
  const result = await compatibleRequest(profile, [], {
    outputProcessing: { output: 'reborn-2.4' },
    onDelta: (text) => pieces.push(text),
    fetchImpl: async () =>
      new Response(
        [...raw]
          .map((char) => `data: ${JSON.stringify({ choices: [{ delta: { content: char } }] })}\n\n`)
          .join('') + 'data: [DONE]\n\n',
        { headers: { 'Content-Type': 'text/event-stream' } },
      ),
  });
  assert.equal(result.content, '<wanxiang_chat>你好</wanxiang_chat>');
  assert.equal(pieces.join(''), result.content);
  assert.equal(result.rawContent, raw);
});
