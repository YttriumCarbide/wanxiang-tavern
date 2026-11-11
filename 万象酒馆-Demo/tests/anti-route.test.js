import test from 'node:test';
import assert from 'node:assert/strict';
import {
  routeSettings,
  routeMessages,
  prepareRouteMessages,
  pinRoutePayload,
  healRouteTags,
} from '../src/ai/anti-route.js';
import { compatibleRequest } from '../src/ai/compatible.js';
import { createConnectionStore } from '../src/ai/connection-store.js';
import { createAntiRouteService } from '../src/ai/anti-route-service.js';
import { finalizeRequest } from '../src/ai/pipeline/prompt-processing.js';
import { summaryPlan } from '../src/ai/pipeline/summary-request.js';

const profile = Object.freeze({
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'google/gemini-3-pro',
  apiKey: 'TEST_SECRET',
  tokenField: 'max_tokens',
  maxTokens: 1000,
  temperature: null,
  promptProcessing: 'merge_tools',
  contextSize: 131072,
});
const reply = (extra = {}) =>
  Response.json({
    model: 'google/gemini-3-pro',
    choices: [{ message: { content: 'hello' }, finish_reason: 'stop' }],
    ...extra,
  });

test('5.7 entropy modes preserve source messages and multimodal parts; final preview counts injected input', () => {
  const messages = [
    { role: 'system', content: 'rules' },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'one' },
        { type: 'text', text: 'two' },
        { type: 'image_url', image_url: { url: 'image' } },
      ],
    },
  ];
  for (const entropyMode of ['comment', 'ref', 'session']) {
    const config = routeSettings({ entropy: true, entropyMode });
    const injected = routeMessages(messages, config, () => 0.5);
    assert(injected[0].content.endsWith('rules'));
    assert(injected[1].content[0].text.endsWith('one'));
    assert.equal(injected[1].content[1].text, 'two');
    assert.deepEqual(injected[1].content[2], messages[1].content[2]);
    assert.equal(messages[0].content, 'rules');
    const light = routeMessages(messages, { ...config, entropyStrength: 'light' });
    assert.deepEqual(light[1], messages[1]);
    assert.deepEqual(routeMessages(messages, { ...config, enabled: false }), messages);
  }
  const prepared = finalizeRequest(
    { messages: [{ role: 'user', content: 'hello' }] },
    {
      ...profile,
      antiRoute: routeSettings({ thinking: true, entropy: true, entropyMode: 'comment' }),
    },
    (text) => text.length,
  );
  assert(prepared.messages.some((message) => message.content.includes('<!--')));
  assert.equal(
    prepared.tokens.contentTokens,
    prepared.messages.reduce((sum, message) => sum + message.content.length, 0),
  );
  assert.equal(prepared.sampling.reasoning_effort, 'high');
  assert.throws(
    () =>
      finalizeRequest(
        { messages: [{ role: 'user', content: 'hello' }] },
        {
          ...profile,
          contextSize: 1050,
          antiRoute: routeSettings({ entropy: true, entropyMode: 'comment' }),
        },
        (text) => text.length,
      ),
    /超过上下文/,
  );
});

test('8.31 uses stable window refraction on prose and preserves schema, history and prefill', () => {
  const messages = [
    {
      role: 'system',
      content:
        'In addition, keep the description grounded in the immediate surroundings and details that a nearby character could observe.',
    },
    { role: 'system', content: '<wanxiang_json>{"scene":"unchanged"}</wanxiang_json>' },
    { role: 'user', content: '玩家的原话。' },
    { role: 'assistant', content: '<wanxiang_json>' },
  ];
  const config = routeSettings({ entropy: true, know: 'full', charm: 'lite' });
  const prepare = (now, overrides = {}, kind = 'script') =>
    prepareRouteMessages(messages, { ...config, ...overrides }, { session: 'test', kind, now });
  const first = prepare(0);
  assert(first.entropy);
  assert.deepEqual(first, prepare(1000));
  assert.notEqual(first.messages[0].content, prepare(30 * 60000).messages[0].content);
  assert.match(first.messages[0].content, /AR-NAR 8.31[\s\S]+<!-- ar:/);
  assert.deepEqual(first.messages.slice(1), messages.slice(1));
  assert(!messages[0].content.includes('<!--'));
  assert(!prepare(0, {}, 'creation').messages[0].content.includes('AR-NAR'));
  assert.deepEqual(prepare(0, { safe: true }), { messages, entropy: false });
  assert.equal(prepareRouteMessages(messages.slice(1), config).entropy, false);
  const merged = finalizeRequest(
    { messages },
    { ...profile, antiRoute: config, routeKind: 'script' },
    (text) => text.length,
  );
  assert.equal(merged.transport.routeEntropy, true);
  assert(merged.messages[0].content.endsWith(messages[1].content));
  const nested = [{ role: 'system', content: `<schema>\n\n${messages[0].content}\n\n</schema>` }];
  assert.deepEqual(prepareRouteMessages(nested, config), { messages: nested, entropy: false });
  assert.equal(routeSettings().entropy, false);
});

test('pin disables real provider fallback while preserving explicit effort and provider choices', () => {
  const payload = {
    models: ['a', 'b'],
    route: 'fallback',
    reasoning_effort: 'none',
    provider: { order: ['google'], allow_fallbacks: true },
    allow_fallbacks: true,
  };
  pinRoutePayload(payload, routeSettings({ thinking: true }));
  assert.equal(payload.models, undefined);
  assert.equal(payload.route, undefined);
  assert.deepEqual(payload.provider, { order: ['google'], allow_fallbacks: false });
  assert.equal(payload.allow_fallbacks, false);
  assert.equal(payload.reasoning_effort, 'none');
});

test('429 and 204 retry once with identical protected bytes; verify can be off independently', async () => {
  for (const status of [429, 204]) {
    const bodies = [];
    const reports = [];
    const result = await compatibleRequest(profile, [{ role: 'user', content: 'hi' }], {
      antiRoute: routeSettings(),
      onRouteReport: (report) => reports.push(report),
      fetchImpl: async (_url, init) => {
        bodies.push(init.body);
        return bodies.length === 1 ? new Response(null, { status }) : reply();
      },
    });
    assert.equal(result.content, 'hello');
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
    assert.equal(JSON.parse(bodies[1]).provider.allow_fallbacks, false);
    assert.equal(reports[0].retries, 1);
    assert.equal(reports[0].verdict, 'same');
  }
  let attempts = 0;
  await assert.rejects(
    compatibleRequest(profile, [], {
      antiRoute: routeSettings({ verify: false }),
      fetchImpl: async () => {
        attempts++;
        return new Response(null, { status: 429 });
      },
    }),
  );
  assert.equal(attempts, 2);
});

test('disabled protection keeps verification, unknown metadata stays unknown and secret text is redacted', async () => {
  let report, body;
  await compatibleRequest(profile, [], {
    antiRoute: routeSettings({ enabled: false }),
    onRouteReport: (value) => {
      report = value;
    },
    fetchImpl: async (_url, init) => {
      body = JSON.parse(init.body);
      return reply({ model: '', note: profile.apiKey });
    },
  });
  assert.equal(body.provider, undefined);
  assert.equal(report.verdict, 'unknown');
  assert(!JSON.stringify(report).includes(profile.apiKey));
});

test('scoped observation does not suppress transport failures or change generated bytes', async () => {
  let report;
  const settings = routeSettings({ scope: 'only', scopeList: 'deepseek，CLAUDE' });
  const options = {
    antiRoute: settings,
    onRouteReport: (value) => {
      report = value;
    },
    fetchImpl: async () => reply({ model: 'gemini-2.5-flash' }),
  };
  assert.equal((await compatibleRequest(profile, [], options)).content, 'hello');
  assert.equal(report.verdict, 'skip');
  await compatibleRequest({ ...profile, model: 'openrouter/deepseek-v3' }, [], options);
  assert.equal(report.verdict, 'diff');
  await compatibleRequest(profile, [], {
    ...options,
    antiRoute: routeSettings({ scope: 'skip', scopeList: 'deepseek' }),
    fetchImpl: async () =>
      reply({
        modelVersion:
          'projects/proj/locations/global/publishers/google/models/gemini-3-pro?alt=sse',
      }),
  });
  assert.equal(report.verdict, 'same');
  await assert.rejects(
    compatibleRequest(profile, [], {
      ...options,
      fetchImpl: async () =>
        reply({ choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] }),
    }),
    /截断/,
  );
  assert.equal(report.verdict, 'truncated');
});

test('opt-in empty recovery shares the retry budget and does not retry a refusal or partial stream', async () => {
  const empty = () => reply({ choices: [{ message: { content: '' }, finish_reason: 'stop' }] });
  const stream = (content, finish_reason) =>
    new Response(
      `data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason }] })}\n\n`,
      {
        headers: { 'Content-Type': 'text/event-stream' },
      },
    );
  for (const first of [empty, () => stream('', 'stop')]) {
    const bodies = [];
    const options = {
      antiRoute: routeSettings({ retryOutput: true }),
      fetchImpl: async (_url, init) => {
        bodies.push(init.body);
        return bodies.length === 1 ? first() : reply();
      },
    };
    assert.equal((await compatibleRequest(profile, [], options)).content, 'hello');
    assert.equal(bodies.length, 2);
    assert.equal(bodies[0], bodies[1]);
  }
  for (const [first, following, expectedCalls] of [
    [() => reply({ choices: [{ message: {}, finish_reason: 'content_filter' }] }), reply, 1],
    [() => stream('partial', 'length'), reply, 1],
    [() => new Response(null, { status: 429 }), empty, 2],
  ]) {
    let calls = 0;
    await assert.rejects(
      compatibleRequest(profile, [], {
        antiRoute: routeSettings({ retryOutput: true }),
        fetchImpl: async () => (++calls === 1 ? first() : following()),
      }),
    );
    assert.equal(calls, expectedCalls);
  }
});

test('SSE observation preserves immediate deltas, thought metadata and terminal keep-alive behavior', async () => {
  let report;
  const deltas = [];
  const encoder = new TextEncoder();
  const response = new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            'data: ' +
              JSON.stringify({
                model: 'gemini-3-pro',
                choices: [
                  {
                    delta: { content: 'hello', reasoning_content: 'thought' },
                    finish_reason: 'stop',
                  },
                ],
                usage: { completion_tokens_details: { reasoning_tokens: 3 } },
              }) +
              '\n\n',
          ),
        );
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
  const result = await compatibleRequest(profile, [], {
    antiRoute: routeSettings(),
    fetchImpl: async () => response,
    onDelta: (value) => deltas.push(value),
    onRouteReport: (value) => {
      report = value;
    },
  });
  assert.equal(result.content, 'hello');
  assert.deepEqual(deltas, ['hello']);
  assert.equal(report.thought, 7);
  assert.equal(report.thoughtTokens, 3);
  assert.equal(report.verdict, 'same');
});

test('Vertex records modelVersion and thinking usage before converting the native reply', async () => {
  let report, body;
  await compatibleRequest(
    {
      ...profile,
      provider: 'vertex',
      baseUrl: 'https://aiplatform.googleapis.com/v1',
      model: 'gemini-3-pro',
    },
    [],
    {
      antiRoute: routeSettings({ thinking: true }),
      fetchImpl: async (_url, init) => {
        body = JSON.parse(init.body);
        return Response.json({
          modelVersion: 'gemini-3-pro',
          candidates: [
            {
              content: { parts: [{ thought: true, text: 'think' }, { text: 'hello' }] },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: { thoughtsTokenCount: 4, candidatesTokenCount: 2 },
        });
      },
      onRouteReport: (value) => {
        report = value;
      },
    },
  );
  assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'HIGH');
  assert.equal(report.respModel, 'gemini-3-pro');
  assert.equal(report.thoughtTokens, 4);
  assert.equal(report.thought, 5);
});

test('malformed optional diagnostic metadata cannot block a valid JSON or SSE reply', async () => {
  for (const streaming of [false, true]) {
    const message = { content: 'hello' };
    const value = {
      model: 'gemini-3-pro',
      candidates: { unsupported: true },
      choices: [{ [streaming ? 'delta' : 'message']: message, finish_reason: 'stop' }],
    };
    const response = streaming
      ? new Response(`data: ${JSON.stringify(value)}\n\n`, {
          headers: { 'content-type': 'text/event-stream' },
        })
      : Response.json(value);
    const result = await compatibleRequest(profile, [], {
      antiRoute: routeSettings(),
      fetchImpl: async () => response,
    });
    assert.equal(result.content, 'hello');
  }
});

test('optional tag healing preserves the raw reply and is skipped for streams', async () => {
  const raw = '<thinking>planning\n\nanswer';
  assert.equal(healRouteTags('<think>answer'), 'answer');
  const result = await compatibleRequest(profile, [], {
    antiRoute: routeSettings({ healTags: true }),
    fetchImpl: async () => reply({ choices: [{ message: { content: raw } }] }),
  });
  assert.equal(result.rawContent, raw);
  assert.equal(result.content, '<thinking>planning\n</thinking>\n\nanswer');
});

test('global settings persist independently from connection presets and roll back failed writes', async () => {
  assert.deepEqual(routeSettings(null), routeSettings());
  let snapshot;
  const store = createConnectionStore({
    save: async (value) => {
      snapshot = value;
    },
  });
  await store.saveRouteSettings({ enabled: false, entropyMode: 'ref', entropyStrength: 'heavy' });
  assert.equal(snapshot.antiRoute.enabled, false);
  const restored = createConnectionStore({ snapshot });
  assert.equal(restored.routeSettings().entropyStrength, 'heavy');
  assert(!('antiRoute' in restored.get('chat')));
  const broken = createConnectionStore({
    save: async () => {
      throw Error('disk full');
    },
  });
  await assert.rejects(broken.saveRouteSettings({ enabled: false }), /disk full/);
  assert.equal(broken.routeSettings().enabled, true);
});

test('summary batching includes entropy overhead and unconfigured probes send no requests', async () => {
  const input = { items: [{ id: 'one', kind: 'chat', label: 'hello', text: 'hello' }] };
  const boundedProfile = { ...profile, maxTokens: 256, contextSize: 1200 };
  const plain = await summaryPlan(
    input,
    boundedProfile,
    (text) => text.length,
    async () => 'summarize',
  );
  assert.equal(plain.batches.length, 1);
  await assert.rejects(
    summaryPlan(
      input,
      {
        ...boundedProfile,
        antiRoute: routeSettings({
          entropy: true,
          entropyMode: 'comment',
          entropyStrength: 'heavy',
        }),
      },
      (text) => text.length,
      async () => 'summarize',
    ),
    /超过上下文/,
  );
  const settings = createConnectionStore();
  let calls = 0;
  const service = createAntiRouteService({
    settings,
    fetchImpl: async () => {
      calls++;
      return reply();
    },
  });
  await assert.rejects(
    service.handle({ action: 'probe', type: 'native', kind: 'chat' }),
    /模型名称/,
  );
  await assert.rejects(service.probe({ ...profile, apiKey: '' }, { type: 'native' }), /密钥/);
  assert.equal(calls, 0);
  service.dispose();
});

test('dual model probe distinguishes ignored names, explicit name errors and unrelated failures', async () => {
  const settings = createConnectionStore({ initial: profile });
  let mode = 'ignore';
  const service = createAntiRouteService({
    settings,
    fetchImpl: async (_url, init) => {
      if (JSON.parse(init.body).model.endsWith('-zzz-not-a-real-model') && mode !== 'ignore')
        return Response.json(
          { error: { message: mode === 'auth' ? 'API key not found' : 'unknown model' } },
          { status: 404 },
        );
      return reply();
    },
  });
  const probe = () => service.probe(profile, { type: 'dual' });
  async function observe(connection = profile) {
    await service.request(connection, [], { antiRoute: routeSettings(), routeKind: 'chat' });
    return (await service.handle()).records.at(-1);
  }
  assert.match((await probe()).text, /渠道回显/);
  assert.equal((await observe()).verdict, 'echo');
  assert.equal((await observe({ ...profile, apiKey: 'ANOTHER_KEY' })).verdict, 'same');
  mode = 'auth';
  assert.match((await probe()).text, /无法判断/);
  assert.equal((await observe()).verdict, 'same');
  mode = 'reject';
  assert.match((await probe()).text, /明确拒绝/);
  service.dispose();
});

test('service caps transient logs, replays current connection, compares unforced/high and cancels probes', async () => {
  const settings = createConnectionStore({ initial: profile });
  const calls = [];
  const service = createAntiRouteService({
    settings,
    fetchImpl: async (_url, init) => {
      calls.push(JSON.parse(init.body));
      return reply();
    },
  });
  await service.request(profile, [{ role: 'user', content: 'full original request' }], {
    routeKind: 'chat',
    antiRoute: routeSettings(),
    sampling: { reasoning_effort: 'medium', maxTokens: 512 },
  });
  await service.handle({ action: 'probe', kind: 'chat', type: 'effort' });
  assert.equal(calls[1].messages[0].content, 'full original request');
  assert.equal(calls[1].reasoning_effort, undefined);
  assert.equal(calls[2].reasoning_effort, 'high');
  assert.equal(calls[2].max_tokens, 512);
  for (let index = 0; index < 65; index++)
    await service.handle({
      action: 'report',
      report: { reqModel: 'fixture', raw: 'x'.repeat(6000) },
    });
  assert.equal((await service.handle()).records.length, 60);
  assert.equal((await service.handle()).records[0].raw.length, 4000);
  await service.handle({ action: 'clear' });
  assert.equal((await service.handle()).records.length, 0);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    service.handle({ action: 'probe', kind: 'chat', type: 'dual' }, controller.signal),
    { name: 'AbortError' },
  );
  service.dispose();
});
