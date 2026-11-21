import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createAiGenerationRoutes } from '../server/ai-generation-routes.mjs';
import { createRequestScope, REQUEST_TIMEOUT_MS } from '../src/ai/request-policy.js';

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeReq(body = {}) {
  const req = Readable.from(Buffer.from(JSON.stringify(body)));
  req.method = 'POST';
  req.headers = { 'content-type': 'application/json' };
  req.complete = true;
  return req;
}

class FakeResponse extends EventEmitter {
  constructor() {
    super();
    this.destroyed = false;
    this.headersSent = false;
    this.writableEnded = false;
    this.statusCode = null;
    this.body = null;
    this.chunks = [];
  }
  writeHead(status, headers) {
    this.statusCode = status;
    this.headersSent = true;
    this.headers = headers;
    return this;
  }
  write(chunk) {
    this.chunks.push(chunk);
    return true;
  }
  end(chunk) {
    if (chunk !== undefined) this.chunks.push(chunk);
    this.writableEnded = true;
    this.emit('finish');
    return this;
  }
}

function makeSend() {
  return (res, status, payload) => {
    res.statusCode = status;
    res.body = payload;
    res.headersSent = true;
    res.writableEnded = true;
    res.emit('finish');
  };
}

function makePipeline(overrides = {}) {
  const pendingWorldStates = new Map();
  const calls = { buildRequest: 0, acceptResult: 0 };
  const pipeline = {
    pendingWorldStates,
    completionOptions: () => ({ maxTokens: 16 }),
    async buildRequest() {
      calls.buildRequest++;
      return {
        messages: [{ role: 'user', content: 'hi' }],
        tokens: 1,
        worldInfo: [],
        warnings: [],
        sampling: {},
        transport: { stream: false },
        regex: [],
        nextWorldState: { step: 1 },
      };
    },
    async acceptResult(job, result) {
      calls.acceptResult++;
      pendingWorldStates.delete(job.requestId);
      return { content: result.content ?? 'ok' };
    },
    ...overrides,
  };
  return { pipeline, calls, pendingWorldStates };
}

function makeSettings(mode = 'browser') {
  return {
    get() {
      return {
        requestMode: mode,
        promptPresetId: 'preset-1',
        apiKey: 'secret-key',
        tokenField: 'none',
        maxTokens: 32,
      };
    },
  };
}

function makePrompts() {
  return {
    async get() {
      return { preset: { id: 'preset-1' } };
    },
  };
}

function makeAntiRoute() {
  return {
    async request() {
      return { content: 'ok' };
    },
  };
}

function makeRoutes(overrides = {}) {
  const { pipeline, calls, pendingWorldStates } = makePipeline(overrides.pipeline);
  const send = makeSend();
  const route = createAiGenerationRoutes({
    settings: overrides.settings ?? makeSettings(),
    promptSource: {
      async get(kind) {
        return (await (overrides.prompts ?? makePrompts()).get(kind)).preset;
      },
    },
    pipeline,
    antiRoute: overrides.antiRoute ?? makeAntiRoute(),
    fetchImpl: async () => {
      throw new Error('no network');
    },
    send,
  });
  return { route, calls, pendingWorldStates, send };
}

test('two local generations saturate; third gets 429 without buildRequest; release restores', async () => {
  const gate = deferred();
  const { route, calls } = makeRoutes({
    pipeline: {
      async buildRequest() {
        calls.buildRequest++;
        await gate.promise;
        return {
          messages: [{ role: 'user', content: 'hi' }],
          tokens: 1,
          worldInfo: [],
          warnings: [],
          sampling: {},
          transport: { stream: false },
          regex: [],
        };
      },
    },
  });

  const req1 = makeReq({ path: 'generate/chat', input: {} });
  const res1 = new FakeResponse();
  const req2 = makeReq({ path: 'generate/chat', input: {} });
  const res2 = new FakeResponse();

  const p1 = route(req1, res1, '/api/ai/generate/chat');
  const p2 = route(req2, res2, '/api/ai/generate/chat');

  await new Promise((r) => setImmediate(r));
  assert.equal(calls.buildRequest, 2);

  const req3 = makeReq({ path: 'generate/chat', input: {} });
  const res3 = new FakeResponse();
  const handled3 = await route(req3, res3, '/api/ai/generate/chat');
  assert.equal(handled3, true);
  assert.equal(res3.statusCode, 429);
  assert.equal(calls.buildRequest, 2);

  gate.resolve();
  await Promise.all([p1, p2]);

  const req4 = makeReq({ path: 'generate/chat', input: {} });
  const res4 = new FakeResponse();
  const handled4 = await route(req4, res4, '/api/ai/generate/chat');
  assert.equal(handled4, true);
  assert.equal(res4.statusCode, 200);
  assert.equal(calls.buildRequest, 3);
});

test('browser prepare aborted on close rejects AbortError and leaves no pending state', async () => {
  const promptGate = deferred();
  const { route, pendingWorldStates } = makeRoutes({
    prompts: {
      async get() {
        await promptGate.promise;
        return { preset: { id: 'preset-1' } };
      },
    },
  });

  const req = makeReq({ path: 'generate/chat', input: {} });
  const res = new FakeResponse();
  const pending = route(req, res, '/api/ai/transport/prepare');

  await new Promise((r) => setImmediate(r));
  res.destroyed = true;
  res.emit('close');

  promptGate.resolve();
  await assert.rejects(pending, (err) => err.name === 'AbortError');
  assert.equal(pendingWorldStates.size, 0);

  const req2 = makeReq({ path: 'generate/chat', input: {} });
  const res2 = new FakeResponse();
  const handled = await route(req2, res2, '/api/ai/transport/prepare');
  assert.equal(handled, true);
  assert.equal(res2.statusCode, 200);
  assert.equal(pendingWorldStates.size, 1);
});

test('prepare hides key; cancel frees capacity; stale or duplicate complete rejected; success once', async () => {
  const { route, calls, pendingWorldStates } = makeRoutes();

  const req = makeReq({ path: 'generate/chat', input: {} });
  const res = new FakeResponse();
  await route(req, res, '/api/ai/transport/prepare');
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.profile.apiKey, undefined);
  assert.ok(res.body.ticket);
  const ticket = res.body.ticket;

  const cancelReq = makeReq({ ticket });
  const cancelRes = new FakeResponse();
  await route(cancelReq, cancelRes, '/api/ai/transport/cancel');
  assert.equal(cancelRes.statusCode, 200);
  assert.equal(pendingWorldStates.size, 0);

  const staleReq = makeReq({ ticket, result: { content: 'x' } });
  const staleRes = new FakeResponse();
  await assert.rejects(route(staleReq, staleRes, '/api/ai/transport/complete'));

  const req2 = makeReq({ path: 'generate/chat', input: {} });
  const res2 = new FakeResponse();
  await route(req2, res2, '/api/ai/transport/prepare');
  const ticket2 = res2.body.ticket;

  const completeReq = makeReq({ ticket: ticket2, result: { content: 'hello' } });
  const completeRes = new FakeResponse();
  await route(completeReq, completeRes, '/api/ai/transport/complete');
  assert.equal(completeRes.statusCode, 200);
  assert.equal(calls.acceptResult, 1);

  const dupReq = makeReq({ ticket: ticket2, result: { content: 'again' } });
  const dupRes = new FakeResponse();
  await assert.rejects(route(dupReq, dupRes, '/api/ai/transport/complete'));
  assert.equal(calls.acceptResult, 1);
});

test('expired browser tickets release pending world state and the reservation slot', async (t) => {
  let now = 10_000;
  t.mock.method(Date, 'now', () => now);
  const { route, calls, pendingWorldStates } = makeRoutes();
  const prepare = async () => {
    const res = new FakeResponse();
    await route(makeReq({ path: 'generate/chat', input: {} }), res, '/api/ai/transport/prepare');
    return res.body.ticket;
  };

  const first = await prepare();
  const second = await prepare();
  assert.equal(pendingWorldStates.size, 2);

  const busy = new FakeResponse();
  const handled = await route(
    makeReq({ path: 'generate/chat', input: {} }),
    busy,
    '/api/ai/transport/prepare',
  );
  assert.equal(handled, true);
  assert.equal(busy.statusCode, 429);
  assert.equal(busy.body.code, 'AI_BUSY');
  assert.equal(pendingWorldStates.size, 2);
  assert.equal(calls.buildRequest, 2);

  now += REQUEST_TIMEOUT_MS + 1;
  const current = await prepare();
  assert.equal(calls.buildRequest, 3);
  assert.equal(pendingWorldStates.size, 1);

  for (const ticket of [first, second]) {
    const stale = new FakeResponse();
    await assert.rejects(
      route(makeReq({ ticket, result: { content: 'stale' } }), stale, '/api/ai/transport/complete'),
    );
  }
  assert.equal(calls.acceptResult, 0);

  const complete = new FakeResponse();
  await route(
    makeReq({ ticket: current, result: { content: 'current' } }),
    complete,
    '/api/ai/transport/complete',
  );
  assert.equal(complete.statusCode, 200);
  assert.equal(calls.acceptResult, 1);
  assert.equal(pendingWorldStates.size, 0);
});

test('request scope forwards abort reason and detaches listener on close', async () => {
  const upstream = new AbortController();
  const scope = createRequestScope({ signal: upstream.signal, timeoutMs: 60000 });
  const reason = new Error('upstream gone');
  upstream.abort(reason);
  assert.equal(scope.signal.aborted, true);
  assert.equal(scope.signal.reason, reason);
  scope.close();

  const upstream2 = new AbortController();
  const scope2 = createRequestScope({ signal: upstream2.signal, timeoutMs: 60000 });
  scope2.close();
  upstream2.abort(new Error('after close'));
  assert.equal(scope2.signal.aborted, false);
});
