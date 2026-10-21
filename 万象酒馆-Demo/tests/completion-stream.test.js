import test from 'node:test';
import assert from 'node:assert/strict';
import { compatibleRequest } from '../src/ai/compatible.js';

const profile = { baseUrl: 'https://mock.invalid/v1', model: 'mock', apiKey: 'private-test-key' };
const headers = { 'Content-Type': 'text/event-stream' };

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
