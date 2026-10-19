import test from 'node:test';
import assert from 'node:assert/strict';
import { readToolContent, createToolContentStream } from '../server/tool-content.mjs';
import { compatibleRequest } from '../server/compatible.mjs';
import { requestTokenReport } from '../server/request-tokens.mjs';
import { outputToolRequest } from '../src/ai/preset-output.js';

const tool = {
  name: 'game_content',
  description: '完整正文',
  parameters: {
    type: 'object',
    properties: { content: { type: 'string' } },
    required: ['content'],
    additionalProperties: false,
  },
};
const profile = {
  baseUrl: 'https://example.com/v1',
  model: 'mock',
  apiKey: 'PRIVATE_TOOL_KEY',
  temperature: null,
  tokenField: 'max_tokens',
  maxTokens: 2000,
};
const call = (content) => ({
  id: 'reply',
  type: 'function',
  function: { name: tool.name, arguments: JSON.stringify({ content }) },
});

test('the output tool carries exact text and rejects missing, unrelated, duplicate or malformed calls', () => {
  const text = '<wanxiang_chat>中文、引号"、反斜杠\\、换行\n与🌙。</wanxiang_chat>';
  assert.equal(readToolContent({ content: '标签外文字', tool_calls: [call(text)] }, tool), text);
  for (const message of [
    { content: text },
    { tool_calls: [] },
    { tool_calls: [call(text), call(text)] },
    { tool_calls: [{ ...call(text), function: { name: 'other_tool', arguments: '{}' } }] },
    {
      tool_calls: [
        { ...call(text), function: { name: tool.name, arguments: '{"content":"unfinished' } },
      ],
    },
    { tool_calls: [call('')] },
    {
      tool_calls: [
        {
          ...call(text),
          function: { name: tool.name, arguments: '{"content":"text","action":"change_hp"}' },
        },
      ],
    },
  ])
    assert.throws(() => readToolContent(message, tool));
});

test('streamed tool arguments decode split JSON escapes, Unicode pairs and protocol tags without leaking wrappers', () => {
  const text = '<wanxiang_chat>你好🌙，他说："来吧"。\n路径\\月。</wanxiang_chat>';
  const args = JSON.stringify({ content: text }).replace('你好🌙', '\\u4f60\\u597d\\ud83c\\udf19');
  const pieces = [];
  const stream = createToolContentStream(tool, (delta) => pieces.push(delta));
  stream.push([
    { index: 0, id: 'reply', type: 'function', function: { name: 'game_', arguments: '' } },
  ]);
  stream.push([{ index: 0, function: { name: 'content', arguments: '' } }]);
  for (const char of args) {
    stream.push([{ index: 0, function: { arguments: char } }]);
    assert(text.startsWith(pieces.join('')));
    const last = pieces.join('').charCodeAt(pieces.join('').length - 1);
    assert(!(last >= 0xd800 && last <= 0xdbff), 'Do not publish half an escaped surrogate pair');
  }
  assert.equal(stream.finish(), text);
  assert.equal(pieces.join(''), text);
  assert(!pieces.join('').includes('"content":'));
});

test('actual compatible requests declare the tool and decode JSON and split UTF-8 SSE, without extra requests', async () => {
  const text = '<wanxiang_chat>潘多拉放下茶杯🌙。</wanxiang_chat>';
  const messages = [{ role: 'system', content: '原预设：必须调用game_content函数工具。' }];
  for (const live of [false, true]) {
    let sent;
    let calls = 0;
    const deltas = [];
    const result = await compatibleRequest(profile, messages, {
      outputTool: tool,
      outputEnvelope: true,
      sampling: { stream: live },
      onDelta: (delta) => deltas.push(delta),
      fetchImpl: async (_url, options) => {
        calls++;
        sent = JSON.parse(options.body);
        if (!live)
          return Response.json({
            choices: [
              { message: { content: null, tool_calls: [call(text)] }, finish_reason: 'tool_calls' },
            ],
            usage: { prompt_tokens: 123, completion_tokens: 45 },
          });
        const args = JSON.stringify({ content: text });
        const events = [
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: 'reply',
                      type: 'function',
                      function: { name: tool.name, arguments: '' },
                    },
                  ],
                },
              },
            ],
          },
        ];
        for (let index = 0; index < args.length; index += 3)
          events.push({
            choices: [
              {
                delta: {
                  tool_calls: [{ index: 0, function: { arguments: args.slice(index, index + 3) } }],
                },
              },
            ],
          });
        events.push({
          choices: [{ delta: {}, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 123, completion_tokens: 45 },
        });
        const bytes = new TextEncoder().encode(
          events.map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`).join('') +
            'data: [DONE]\r\n\r\n',
        );
        return new Response(
          new ReadableStream({
            start(controller) {
              for (let index = 0; index < bytes.length; index += 11)
                controller.enqueue(bytes.slice(index, index + 11));
              controller.close();
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        );
      },
    });
    assert.equal(calls, 1);
    assert.equal(result.content, text);
    assert.deepEqual(result.usage, { input: 123, output: 45 });
    if (live) assert.equal(deltas.join(''), text);
    assert.deepEqual(sent.messages, messages);
    assert.deepEqual(sent.tools, outputToolRequest(tool).tools);
    assert.equal(sent.tool_choice.function.name, tool.name);
    assert(!('response_format' in sent));
    const tokens = requestTokenReport(
      messages,
      (value) => value.length,
      null,
      2000,
      outputToolRequest(tool),
    );
    assert.equal(tokens.toolTokens, JSON.stringify(outputToolRequest(tool)).length);
    assert.equal(
      tokens.inputEstimate,
      tokens.contentTokens + tokens.overheadEstimate + tokens.toolTokens,
    );
  }
});

test('unsupported or broken tool replies fail visibly with redacted original data and no fallback retry', async () => {
  for (const live of [false, true]) {
    let calls = 0;
    await assert.rejects(
      compatibleRequest(profile, [], {
        outputTool: tool,
        fetchImpl: async () => {
          calls++;
          if (!live)
            return Response.json({
              choices: [{ message: { content: 'PRIVATE_TOOL_KEY 普通正文' } }],
            });
          return new Response(
            `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, type: 'function', function: { name: tool.name, arguments: '{"content":"PRIVATE_TOOL_KEY' } }] } }] })}\n\ndata: [DONE]\n\n`,
            { headers: { 'Content-Type': 'text/event-stream' } },
          );
        },
      }),
      (failure) => {
        assert.equal(failure.diagnostic.stage, 'tool-response');
        assert(failure.diagnostic.rawText.includes('[密钥已隐藏]'));
        assert(!failure.diagnostic.rawText.includes('PRIVATE_TOOL_KEY'));
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});
