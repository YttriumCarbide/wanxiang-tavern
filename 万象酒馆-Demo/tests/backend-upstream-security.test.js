import assert from 'node:assert/strict';
import test from 'node:test';
import { compatibleRequest } from '../src/ai/compatible.js';
import { readCompletionStream } from '../src/ai/completion-stream.js';
import { localRequest } from '../src/ai/local-client.js';
import { vertexResponse } from '../src/ai/vertex.js';

const encoder = new TextEncoder();
const compatibleProfile = Object.freeze({ baseUrl: 'https://mock.invalid/v1', model: 'mock' });

function mockResponse(chunks, { status = 200, sse = false, readError, cancelError } = {}) {
  let reads = 0;
  let cancels = 0;
  const body = new ReadableStream(
    {
      pull(controller) {
        const chunk = chunks[reads++];
        if (chunk !== undefined) {
          controller.enqueue(typeof chunk === 'string' ? encoder.encode(chunk) : chunk);
        } else if (readError) {
          controller.error(readError);
        } else {
          controller.close();
        }
      },
      cancel() {
        cancels++;
        if (cancelError) return Promise.reject(cancelError);
      },
    },
    { highWaterMark: 0 },
  );
  const response = new Response(body, {
    status,
    headers: { 'content-type': sse ? 'text/event-stream' : 'application/json' },
  });
  return { response, state: () => ({ reads, cancels, locked: body.locked }) };
}

test('Compatible models and Vertex HTTP errors stop oversized JSON before EOF', async () => {
  const overflow = ' '.repeat(1000000);
  for (const testCase of [
    { status: 200, profile: compatibleProfile, models: true },
    {
      status: 502,
      profile: { ...compatibleProfile, provider: 'vertex' },
      models: false,
    },
  ]) {
    const { status, profile, models } = testCase;
    const { response, state } = mockResponse([overflow, overflow, ' ', '{}'], { status });
    await assert.rejects(
      compatibleRequest(profile, [], { models, fetchImpl: async () => response }),
      { message: '接口返回内容过大' },
    );
    assert.deepEqual(state(), { reads: 3, cancels: 1, locked: false });
  }
});

test('Vertex success enforces its raw JSON character limit during reads', async () => {
  const { response, state } = mockResponse([' '.repeat(2000000), ' ', '{}'], {
    cancelError: Error('cancel rejected'),
  });
  await assert.rejects(vertexResponse(response), { message: 'Vertex 接口返回内容过大' });
  assert.deepEqual(state(), { reads: 2, cancels: 1, locked: false });
});

test('Compatible accepts exact post-redaction limit across UTF-8 and key splits', async () => {
  const profile = { ...compatibleProfile, apiKey: 'aaaaaaaaab' };
  const redacted = 'aa[密钥已隐藏]酒🍺';
  const text = 'aaaaaaaaaaab酒🍺';
  const json = JSON.stringify({ data: [{ id: text }] });
  const padding = ' '.repeat(2000000 - json.length + text.length - redacted.length);
  const wire = encoder.encode(json);
  const keyStart = json.indexOf(text);
  const utf8Start = keyStart + text.indexOf('酒');
  const { response, state } = mockResponse([
    padding,
    wire.subarray(0, keyStart + 5),
    wire.subarray(keyStart + 5, utf8Start + 1),
    wire.subarray(utf8Start + 1, utf8Start + 5),
    wire.subarray(utf8Start + 5),
  ]);
  const result = await compatibleRequest(profile, [], {
    models: true,
    fetchImpl: async () => response,
  });
  assert.deepEqual(result, { models: [redacted] });
  assert.deepEqual(state(), { reads: 6, cancels: 0, locked: false });
});

test('Compatible counts expansion from redaction and retains the redacted route preview', async () => {
  const profile = { ...compatibleProfile, apiKey: 'x' };
  const { response, state } = mockResponse(['x'.repeat(300000), '{}']);
  let report;
  await assert.rejects(
    compatibleRequest(profile, [], {
      antiRoute: { verify: true },
      onRouteReport: (entry) => {
        report = entry;
      },
      fetchImpl: async () => response,
    }),
    { message: '接口返回内容过大' },
  );
  assert.equal(report.raw, '[密钥已隐藏]'.repeat(572).slice(0, 4000));
  assert.deepEqual(state(), { reads: 1, cancels: 1, locked: false });
});

test('Vertex malformed JSON keeps the original text fallback and releases after EOF', async () => {
  const wire = encoder.encode('不是 JSON');
  const { response, state } = mockResponse([wire.subarray(0, 1), wire.subarray(1)]);
  const result = await vertexResponse(response);
  assert.equal(result.headers.get('content-type'), 'text/plain');
  assert.equal(await result.text(), '不是 JSON');
  assert.deepEqual(state(), { reads: 3, cancels: 0, locked: false });
});

test('Compatible read failure retains the original rejection and unlocks the errored body', async () => {
  const readError = Error('body read failed');
  const { response, state } = mockResponse(['{'], { readError });
  await assert.rejects(
    compatibleRequest(compatibleProfile, [], { models: true, fetchImpl: async () => response }),
    (error) => error === readError,
  );
  assert.deepEqual(state(), { reads: 2, cancels: 0, locked: false });
});

test('Upstream SSE finishes on finish_reason without reading another chunk', async () => {
  const complete =
    'data: {"choices":[{"delta":{"content":"complete"},"finish_reason":"stop"}]}\n\n';
  const { response, state } = mockResponse([complete, 'unread'], { sse: true });
  const result = await readCompletionStream(response);
  assert.equal(result.content, 'complete');
  assert.deepEqual(state(), { reads: 1, cancels: 1, locked: false });
});

test('Upstream SSE rejects a read failure after content and unlocks the body', async () => {
  const readError = Error('upstream stream failed');
  const partial = 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n';
  const { response, state } = mockResponse([partial], { sse: true, readError });
  await assert.rejects(readCompletionStream(response), (error) => error === readError);
  assert.equal(readError.rawText, 'partial');
  assert.deepEqual(state(), { reads: 2, cancels: 0, locked: false });
});

test('Local SSE cancels before another read when JSON parsing or onDelta throws', async () => {
  const callbackError = Error('delta failed');
  for (const [event, expected] of [
    ['data: {\n\n', SyntaxError],
    ['data: {"type":"delta","delta":"one"}\n\n', (error) => error === callbackError],
  ]) {
    const { response, state } = mockResponse([event, 'unread'], {
      sse: true,
      cancelError: Error('cancel rejected'),
    });
    await assert.rejects(
      localRequest(
        'chat',
        {},
        {
          fetchImpl: async () => response,
          onDelta() {
            throw callbackError;
          },
        },
      ),
      expected,
    );
    assert.deepEqual(state(), { reads: 1, cancels: 1, locked: false });
  }
});

test('Local SSE preserves read failures after complete and releases the reader', async () => {
  const readError = Error('local stream failed');
  const complete = 'data: {"type":"complete","result":{"content":"ok"}}\n\n';
  const { response, state } = mockResponse([complete], { sse: true, readError });
  await assert.rejects(
    localRequest('chat', {}, { fetchImpl: async () => response }),
    (error) => error === readError,
  );
  assert.deepEqual(state(), { reads: 2, cancels: 0, locked: false });
});

test('Local SSE releases after EOF with and without a complete event', async () => {
  const complete = 'data: {"type":"complete","result":{"content":"ok"}}';
  const success = mockResponse([complete], { sse: true });
  assert.deepEqual(await localRequest('chat', {}, { fetchImpl: async () => success.response }), {
    content: 'ok',
  });
  assert.deepEqual(success.state(), { reads: 2, cancels: 0, locked: false });

  const incomplete = mockResponse([], { sse: true });
  await assert.rejects(localRequest('chat', {}, { fetchImpl: async () => incomplete.response }), {
    message: '流式连接已中断，本次消息未保存，请重试',
  });
  assert.deepEqual(incomplete.state(), { reads: 1, cancels: 0, locked: false });
});
