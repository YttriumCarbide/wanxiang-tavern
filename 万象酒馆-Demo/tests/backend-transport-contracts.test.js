import assert from 'node:assert/strict';
import test from 'node:test';
import { compatibleRequest } from '../src/ai/compatible.js';
import { localRequest } from '../src/ai/local-client.js';
import { normalizeUsage } from '../src/ai/usage.js';

const profile = Object.freeze({ baseUrl: 'https://mock.invalid/v1', model: 'mock' });

function completionFetch(value, stream) {
  return async () => {
    if (!stream) return Response.json(value);
    return new Response(`data: ${JSON.stringify(value)}\n\ndata: [DONE]\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    });
  };
}

test('normalizeUsage copies usage and details while retaining unknown fields', () => {
  const extra = Object.freeze({ source: 'fixture' });
  const details = Object.freeze({ reasoning_tokens: '3', note: 'kept' });
  const usage = Object.freeze({
    input: '4',
    output: 2.5,
    total: -1,
    extra,
    completion_tokens_details: details,
  });
  const normalized = normalizeUsage(usage);
  assert.deepEqual(normalized, {
    input: 0,
    output: 2.5,
    extra,
    completion_tokens_details: { note: 'kept' },
  });
  assert.notEqual(normalized, usage);
  assert.notEqual(normalized.completion_tokens_details, details);
  assert.equal(normalized.extra, extra);
});

test('normalizeUsage rejects invalid counters and never synthesizes optional counts', () => {
  for (const invalid of [undefined, null, '3', false, {}, -1, NaN, Infinity, -Infinity]) {
    assert.deepEqual(
      normalizeUsage({
        input: invalid,
        output: invalid,
        total: invalid,
        completion_tokens_details: { reasoning_tokens: invalid },
      }),
      { input: 0, output: 0, completion_tokens_details: {} },
    );
  }
  for (const invalid of [undefined, null, 'usage', []]) {
    assert.deepEqual(normalizeUsage(invalid), { input: 0, output: 0 });
  }
  assert.deepEqual(normalizeUsage({ output: 3 }), { input: 0, output: 3 });
  const zero = {
    input: 0,
    output: 0,
    total: 0,
    completion_tokens_details: { reasoning_tokens: 0 },
  };
  assert.deepEqual(normalizeUsage(zero), zero);
});

test('Compatible JSON and SSE normalize provider usage without leaving count aliases', async () => {
  for (const stream of [false, true]) {
    const choices = [{ [stream ? 'delta' : 'message']: { content: 'reply' } }];
    const primary = await compatibleRequest(profile, [], {
      fetchImpl: completionFetch(
        {
          choices,
          usage: {
            prompt_tokens: '8',
            input_tokens: 8,
            completion_tokens: 2.5,
            total_tokens: 11.5,
            completion_tokens_details: { reasoning_tokens: 1.25, note: 'kept' },
            extra: { source: 'fixture' },
          },
        },
        stream,
      ),
    });
    assert.deepEqual(primary.usage, {
      input: 0,
      output: 2.5,
      total: 11.5,
      completion_tokens_details: { reasoning_tokens: 1.25, note: 'kept' },
      extra: { source: 'fixture' },
    });

    const alternate = await compatibleRequest(profile, [], {
      fetchImpl: completionFetch(
        { choices, usage: { input_tokens: 4.5, output_tokens: '2', total_tokens: -1 } },
        stream,
      ),
    });
    assert.deepEqual(alternate.usage, { input: 4.5, output: 0 });
  }
});

test('Vertex JSON and SSE carry native total and reasoning into normalized usage', async () => {
  for (const stream of [false, true]) {
    const result = await compatibleRequest({ ...profile, provider: 'vertex', stream }, [], {
      fetchImpl: completionFetch(
        {
          candidates: [{ content: { parts: [{ text: 'reply' }] }, finishReason: 'STOP' }],
          usageMetadata: {
            promptTokenCount: '8',
            candidatesTokenCount: 2.5,
            totalTokenCount: 11.5,
            thoughtsTokenCount: 1.25,
          },
        },
        stream,
      ),
    });
    assert.deepEqual(result.usage, {
      input: 0,
      output: 2.5,
      total: 11.5,
      completion_tokens_details: { reasoning_tokens: 1.25 },
    });
  }
});

test('Local JSON and SSE errors expose the payload code, status, diagnostic and message', async () => {
  const payload = {
    error: 'fixture conflict',
    code: 'FIXTURE_CONFLICT',
    status: 409,
    diagnostic: { stage: 'fixture' },
  };
  for (const response of [
    Response.json(payload, { status: 409 }),
    new Response(`data: ${JSON.stringify({ type: 'error', ...payload })}\n\n`, {
      headers: { 'content-type': 'text/event-stream' },
    }),
  ]) {
    await assert.rejects(localRequest('chat', {}, { fetchImpl: async () => response }), {
      message: payload.error,
      code: payload.code,
      status: payload.status,
      diagnostic: payload.diagnostic,
    });
  }
});

test('Local JSON errors leave status absent when the payload has no status', async () => {
  const response = Response.json({ error: 'fixture failure' }, { status: 502 });
  await assert.rejects(localRequest('chat', {}, { fetchImpl: async () => response }), (error) => {
    assert.equal(error.message, 'fixture failure');
    assert.equal(error.status, undefined);
    assert.equal(error.code, undefined);
    return true;
  });
});
