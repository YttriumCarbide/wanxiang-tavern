import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibleRequest } from '../src/ai/compatible.js';
import { readCompletionStream } from '../src/ai/completion-stream.js';

const profile = { baseUrl: 'https://mock.invalid/v1', model: 'mock', apiKey: 'private-test-key' };
const headers = { 'Content-Type': 'text/event-stream' };

test('tool_calls termination still requires complete valid tool arguments', async () => {
  const tool = { name: 'emit_text' };
  const text = '<wanxiang_json>{"story":"完成"}</wanxiang_json>';
  for (const [argumentsText, valid] of [
    [JSON.stringify({ content: text }), true],
    ['{"content":"未完成', false],
  ]) {
    const data = `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, type: 'function', function: { name: tool.name, arguments: argumentsText } }] }, finish_reason: 'tool_calls' }] })}\n\n`;
    const request = readCompletionStream(new Response(data, { headers }), () => {}, tool);
    if (valid) assert.equal((await request).content, text);
    else await assert.rejects(request, /不是完整JSON/);
  }
});

test('finish_reason completes without DONE and retains usage in the same packet', async () => {
  const text = '<wanxiang_json>{"story":"完整正文"}</wanxiang_json>';
  const frames = [
    { choices: [{ delta: { content: text }, finish_reason: 'stop' }] },
    { choices: [], usage: { prompt_tokens: 30, completion_tokens: 20 } },
  ];
  let calls = 0;
  let cancelled = false;
  const result = await compatibleRequest(profile, [], {
    fetchImpl: async () => {
      calls++;
      return new Response(
        new ReadableStream(
          {
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode(
                  frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join(''),
                ),
              );
            },
            pull(controller) {
              controller.error(TypeError('network error'));
            },
            cancel() {
              cancelled = true;
            },
          },
          { highWaterMark: 0 },
        ),
        { headers },
      );
    },
  });
  assert.equal(result.content, text);
  assert.deepEqual(result.usage, { input: 30, output: 20 });
  assert.equal(cancelled, true);
  assert.equal(calls, 1);
});

test('mid-stream network failure preserves partial text and never retries or accepts it', async () => {
  const text = '<wanxiang_json>{"story":"尚未生成完';
  const bytes = new TextEncoder().encode(
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
  );
  let calls = 0;
  await assert.rejects(
    compatibleRequest(profile, [], {
      fetchImpl: async () => {
        calls++;
        return new Response(
          new ReadableStream(
            {
              start(controller) {
                controller.enqueue(bytes);
              },
              pull(controller) {
                controller.error(TypeError('network error'));
              },
            },
            { highWaterMark: 0 },
          ),
          { headers },
        );
      },
    }),
    (failure) => {
      assert.equal(failure.diagnostic.rawText, text);
      assert.equal(failure.diagnostic.stage, 'transport');
      assert.equal(failure.diagnostic.delivery.receivedBytes, bytes.length);
      assert.equal(failure.diagnostic.delivery.textCharacters, text.length);
      assert.equal(failure.diagnostic.delivery.finishReason, null);
      assert.equal(failure.diagnostic.delivery.doneMarker, false);
      assert(failure.diagnostic.delivery.elapsedMs >= 0);
      return true;
    },
  );
  assert.equal(calls, 1);
});

test('length termination is rejected even without DONE', async () => {
  const data = `data: ${JSON.stringify({ choices: [{ delta: { content: '未完成' }, finish_reason: 'length' }] })}\n\n`;
  await assert.rejects(
    compatibleRequest(profile, [], {
      fetchImpl: async () => new Response(data, { headers }),
    }),
    (failure) => {
      assert.equal(failure.diagnostic.stage, 'truncated');
      assert.equal(failure.diagnostic.delivery.finishReason, 'length');
      return true;
    },
  );
});

test('DONE completes and cancels a kept-open upstream stream without another read or request', async () => {
  const text = '<wanxiang_json>{"story":"已完成"}</wanxiang_json>';
  const data = `data: ${JSON.stringify({ choices: [{ delta: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 12 } })}\n\ndata: [DONE]\n\n`;
  let calls = 0,
    cancelled = false;
  const response = new Response(
    new ReadableStream(
      {
        start(controller) {
          controller.enqueue(new TextEncoder().encode(data));
          // Simulate a proxy that leaves the socket open, then drops it after the final result.
        },
        pull(controller) {
          controller.error(Error('Proxy closed after its completed response'));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    ),
    { headers },
  );
  const result = await compatibleRequest(profile, [], {
    fetchImpl: async () => {
      calls++;
      return response;
    },
  });
  assert.equal(result.content, text);
  assert.deepEqual(result.usage, { input: 50, output: 12 });
  assert.equal(cancelled, true);
  assert.equal(calls, 1);
});

test('an executor error reports actual received frames without inventing body text', async () => {
  const message = 'executor 断线后未在暂存窗口内补发结果';
  const data = `: heartbeat\n\ndata: ${JSON.stringify({ error: { message } })}\n\n`;
  const bytes = new TextEncoder().encode(data);
  await assert.rejects(
    compatibleRequest(profile, [], {
      fetchImpl: async () => new Response(bytes, { headers }),
    }),
    (failure) => {
      assert.equal(failure.diagnostic.stage, 'transport');
      assert.equal(failure.diagnostic.delivery.receivedBytes, bytes.length);
      assert.equal(failure.diagnostic.delivery.eventCount, 1);
      assert.equal(failure.diagnostic.delivery.textCharacters, 0);
      assert.equal(failure.diagnostic.delivery.doneMarker, false);
      assert(failure.diagnostic.rawText.includes(message));
      return true;
    },
  );
});

test('unrecognized SSE payloads remain visible and configured secrets are redacted', async () => {
  const data = `data: ${JSON.stringify({ unexpected: 'received bytes ' + profile.apiKey })}\n\ndata: [DONE]\n\n`;
  await assert.rejects(
    compatibleRequest(profile, [], {
      fetchImpl: async () => new Response(data, { headers }),
    }),
    (failure) => {
      assert(failure.diagnostic.rawText.includes('unexpected'));
      assert(!failure.diagnostic.rawText.includes(profile.apiKey));
      assert.equal(failure.diagnostic.delivery.textCharacters, 0);
      assert.equal(failure.diagnostic.delivery.doneMarker, true);
      return true;
    },
  );
});
