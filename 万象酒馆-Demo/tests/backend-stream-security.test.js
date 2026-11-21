import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createAiApi } from '../server/ai-api.mjs';
import { createAiGenerationRoutes } from '../server/ai-generation-routes.mjs';
import { relayOpencode } from '../server/opencode-relay.mjs';
import { readRequestJson } from '../server/request-json.mjs';
import { readCompletionStream } from '../src/ai/completion-stream.js';
import { characterResponse } from './fixtures/ai.js';
import {
  MALFORMED_JSON_BODIES,
  NON_OBJECT_JSON_BODIES,
} from './fixtures/backend-security-cases.js';

async function listen(t, handler) {
  const server = createServer((req, res) => {
    handler(req, res).catch((error) => res.destroy(error));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

function post(base, route, headers, body) {
  return new Promise((resolve, reject) => {
    const req = request(base + route, { method: 'POST', headers }, async (res) => {
      try {
        res.setEncoding('utf8');
        let body = '';
        for await (const chunk of res) body += chunk;
        resolve({ status: res.statusCode, headers: res.headers, body });
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(Error('Fixture upload did not receive a response')));
    if (body === undefined) req.flushHeaders();
    else req.end(body);
  });
}

test('JSON body failures are stable and legal non-object JSON remains accepted', async () => {
  function parse(buffer, type = 'application/json; charset=UTF-8') {
    const req = Readable.from([buffer]);
    req.headers = { 'content-type': type };
    return readRequestJson(req);
  }
  for (const body of MALFORMED_JSON_BODIES) {
    await assert.rejects(parse(Buffer.from(body)), { message: '请求内容不是有效的 JSON' });
  }
  await assert.rejects(parse(Buffer.from([0x22, 0xff, 0x22])), {
    message: '请求内容不是有效的 JSON',
  });
  await assert.rejects(parse(Buffer.from('{}'), 'application/jsonish'), {
    message: '请求需要application/json',
  });
  for (const body of NON_OBJECT_JSON_BODIES) {
    assert.deepEqual(await parse(Buffer.from(body)), JSON.parse(body));
  }
});

test('aborted upload releases the body reader and its listeners', async () => {
  const req = new PassThrough();
  req.headers = { 'content-type': 'application/json' };
  const scope = new AbortController();
  const read = readRequestJson(req, 100, scope.signal);
  const rejected = assert.rejects(read, { name: 'AbortError' });
  req.write('{');
  scope.abort();
  req.end();
  await rejected;
  for (const event of ['data', 'end', 'error', 'close']) {
    assert.equal(req.listenerCount(event), 0, event);
  }
});

test('local AI API rejects malformed bodies, oversized uploads and foreign Hosts', async (t) => {
  const env = process.env;
  process.env = { OPENAI_BASE_URL: 'https://fixture.invalid/v1', OPENAI_MODEL: 'fixture' };
  t.after(() => {
    process.env = env;
  });
  const temporaryBase = fileURLToPath(new URL('../.runtime/tests/', import.meta.url));
  await mkdir(temporaryBase, { recursive: true });
  const directory = await mkdtemp(path.join(temporaryBase, 'wanxiang-backend-stream-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const api = await createAiApi({
    root: directory,
    port: 0,
    settingsFile: path.join(directory, 'settings.json'),
    promptsDirectory: path.join(directory, 'presets'),
    worldInfoDirectory: path.join(directory, 'world-info'),
    fetchImpl() {
      assert.fail('The invalid request reached the upstream');
    },
  });
  const base = await listen(t, (req, res) => api(req, res, req.url));
  const route = '/api/ai/tokens';
  const headers = { 'Content-Type': 'application/json' };
  const malformed = await post(base, route, headers, '{');
  assert.equal(malformed.status, 400);
  assert.deepEqual(JSON.parse(malformed.body), { error: '请求内容不是有效的 JSON', status: 400 });
  const oversized = await post(base, route, { ...headers, 'Content-Length': 10_000_001 });
  assert.equal(oversized.status, 413);
  assert.equal(oversized.headers.connection, 'close');
  assert.deepEqual(JSON.parse(oversized.body), { error: '请求内容过长', status: 413 });
  const foreign = await post(base, route, { ...headers, Host: 'fixture.invalid' }, '{}');
  assert.equal(foreign.status, 403);
  const send = (route, body) => post(base, `/api/ai/${route}`, headers, JSON.stringify(body));
  const config = await send('config', {
    kind: 'character',
    baseUrl: 'https://fixture.invalid/v1',
    model: 'fixture',
    tokenField: 'max_tokens',
    requestMode: 'browser',
  });
  assert.equal(config.status, 200, config.body);
  const prepared = await send('transport/prepare', {
    path: 'generate/character',
    input: { brief: 'fixture' },
  });
  assert.equal(prepared.status, 200, prepared.body);
  const { ticket } = JSON.parse(prepared.body);
  const validate = await send('validate/character', {
    requestId: ticket,
    content: characterResponse(),
  });
  assert.equal(validate.status, 409);
  assert.equal(JSON.parse(validate.body).error, '请求仍在进行，请稍后再校验');
  assert.equal((await send('transport/cancel', { ticket })).status, 200);
});

test('relay returns 413 before forwarding a chunked upload over its byte limit', async (t) => {
  let forwarded = false;
  const base = await listen(t, (req, res) =>
    relayOpencode(req, res, {
      port: req.socket.localPort,
      async fetchImpl() {
        forwarded = true;
        return Response.json({});
      },
    }),
  );
  const response = await post(
    base,
    '/__demo/opencode',
    {
      'X-Wanxiang-Upstream': 'https://opencode.ai/zen/go/v1/chat/completions',
      'Transfer-Encoding': 'chunked',
    },
    Buffer.alloc(2_000_001, 'x'),
  );
  assert.equal(response.status, 413);
  assert.equal(response.headers.connection, 'close');
  assert.equal(forwarded, false);
});

test('natural EOF accepts SSE content without a terminal marker and releases the reader', async () => {
  const frame = 'data: {"choices":[{"delta":{"content":"reply"}}]}';
  for (const separator of ['\n\n', '']) {
    const response = new Response(frame + separator);
    const result = await readCompletionStream(response);
    assert.equal(result.content, 'reply');
    assert.equal(result.rawContent, 'reply');
    assert.equal(response.body.locked, false);
  }
});

test('reader release and a completed reply survive a rejecting upstream cancellation', async () => {
  const cancellationError = Error('fixture cleanup failed');
  let canceled = false;
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"complete"}}]}\n\ndata: [DONE]\n\n',
          ),
        );
      },
      cancel() {
        canceled = true;
        return Promise.reject(cancellationError);
      },
    }),
  );
  assert.equal((await readCompletionStream(response)).content, 'complete');
  assert.equal(canceled, true);
  assert.equal(response.body.locked, false);
});

test('transport cancellation and an undelivered ticket release pending state', async (t) => {
  const started = Promise.withResolvers();
  const finish = Promise.withResolvers();
  const dropped = Promise.withResolvers();
  const pendingWorldStates = new Map();
  let completionSignal;
  let dropPrepareReply = false;
  const route = createAiGenerationRoutes({
    settings: { get: () => ({ requestMode: 'browser' }) },
    promptSource: { get: () => ({}) },
    pipeline: {
      pendingWorldStates,
      completionOptions: () => ({}),
      buildRequest: () => ({ messages: [], nextWorldState: { step: 1 } }),
      async acceptResult(_job, _result, signal) {
        completionSignal = signal;
        started.resolve();
        await finish.promise;
        signal.throwIfAborted();
        return { content: 'accepted' };
      },
    },
    send(res, status, payload) {
      if (dropPrepareReply && payload.ticket) {
        res.once('close', dropped.resolve);
        res.destroy();
      } else {
        res.writeHead(status).end(JSON.stringify(payload));
      }
    },
  });
  const base = await listen(t, async (req, res) => {
    try {
      await route(req, res, req.url);
    } catch (error) {
      res.writeHead(error.name === 'AbortError' ? 409 : 400).end();
    }
  });
  const send = (action, body) =>
    post(
      base,
      `/api/ai/transport/${action}`,
      { 'Content-Type': 'application/json' },
      JSON.stringify(body),
    );
  const prepared = await send('prepare', { path: 'generate/chat' });
  assert.equal(prepared.status, 200);
  const { ticket } = JSON.parse(prepared.body);
  const completion = send('complete', { ticket, result: { content: 'fixture' } });
  try {
    await Promise.race([
      started.promise,
      completion.then(() => assert.fail('Completion responded before opening its ticket')),
    ]);
    assert.equal((await send('cancel', { ticket })).status, 200);
  } finally {
    finish.resolve();
  }
  const result = await completion;
  assert.equal(completionSignal.aborted, true);
  assert.equal(result.status, 409);
  assert.equal(pendingWorldStates.size, 0);
  dropPrepareReply = true;
  await assert.rejects(send('prepare', { path: 'generate/chat' }));
  await dropped.promise;
  assert.equal(pendingWorldStates.size, 0);
});
