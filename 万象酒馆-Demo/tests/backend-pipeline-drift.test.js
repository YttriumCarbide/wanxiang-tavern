import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { createStaticBackend } from '../src/ai/static-backend.js';
import { createAiGenerationRoutes } from '../server/ai-generation-routes.mjs';
import { createCharacterReader, createWorldbookCounter } from '../server/character-reader.mjs';
import { createAiApi } from '../server/ai-api.mjs';
import { createConnectionStore } from '../src/ai/connection-store.js';
import { createBuiltinPromptSource, BUILTIN_PROMPT_PATH } from '../src/ai/builtin-prompt.js';
import { createAntiRouteService } from '../src/ai/anti-route-service.js';
import { normalizeWorldSettings, newWorldEntry } from '../src/ai/worldbook.js';
import { overlandPlan } from '../src/overland-travel.js';
import { characterDocument } from './fixtures/ai.js';
import {
  completionFixture,
  configSnapshot,
  fileFixtureFetch,
  makePipelinePorts,
  memoryDatabase,
  nodeRouteRequest,
  presetFixture,
  profileFixture,
  sendNodeResponse,
  worldFixture,
} from './backend-pipeline-harness.test.js';

const wrap = (value) =>
  `<wanxiang_output>${typeof value === 'string' ? value : JSON.stringify(value)}</wanxiang_output>`;
const diskText = (name) => readFile(new URL('../prompts/' + name, import.meta.url), 'utf8');
const chatInput = { text: 'fixture', place: 'table', selected: [], characters: [], history: [] };
const summaryInput = {
  items: [{ id: 'source', kind: 'chat', label: 'fixture', text: 'fixture-source' }],
};
const creationInput = {
  items: [{ id: 'ore', name: 'fixture', description: 'fixture', value: 10, script: 'fixture' }],
};
const creationOutput = {
  schemaVersion: 2,
  items: [
    {
      id: 'ore',
      name: 'fixture',
      description: 'fixture',
      design: { statFocus: ['hp'], rules: [] },
    },
  ],
};

async function runtimeJob(pipeline, kind, input, source = presetFixture()) {
  const prepared = await pipeline.buildRequest(kind, input, source);
  const requestId = 'fixture-request';
  const job = {
    kind,
    input,
    prepared,
    profile: profileFixture(),
    requestId,
    messages: prepared.messages,
    requestReport: { id: requestId, tokens: prepared.tokens },
  };
  if (prepared.nextWorldState)
    pipeline.pendingWorldStates.set(requestId, {
      kind,
      nextState: prepared.nextWorldState,
      expectedStep: prepared.nextWorldState.step - 1,
    });
  return job;
}

function runtimePair({ preset, ...options } = {}) {
  return ['node-reader', 'static-default'].map((name) => {
    const ports = makePipelinePorts({ readText: diskText, ...options });
    const pipeline = createAiPipeline({
      ...ports,
      ...(preset ? { promptSource: { get: async () => preset } } : {}),
      ...(name === 'node-reader' ? { readCharacter: createCharacterReader() } : {}),
    });
    return { name, ports, pipeline };
  });
}

// This config is transport-only fixture data. No production prompt or prose is changed.
const builtinConfig = {
  name: 'fixture',
  fixed: [1],
  order: [1],
  prompts: [{ row: 1, identifier: 'chatHistory', marker: true }],
  styleChoices: [],
  adultChoices: [],
  retellingChoices: [],
  perspectiveChoices: [],
};
const summaryPreset = presetFixture({ prompts: [{ identifier: 'chatHistory', marker: true }] });
const textOverrides = new Map([
  [BUILTIN_PROMPT_PATH, JSON.stringify(builtinConfig)],
  ['framework/summary-default.json', JSON.stringify(summaryPreset)],
]);
const fixtureText = (name) =>
  textOverrides.has(name) ? Promise.resolve(textOverrides.get(name)) : diskText(name);

/** Exercise both host entrypoints with the real shared pipeline and compatible transport. */
async function hosts(t, { profile = {}, extraRecords = [], profileOverrides = {} } = {}) {
  const configured = profileFixture({ requestMode: 'browser', ...profile });
  const snapshot = configSnapshot(configured);
  for (const [kind, changes] of Object.entries(profileOverrides))
    Object.assign(snapshot.profiles[kind], changes);
  const database = memoryDatabase([
    ['api.config', snapshot],
    ['world.settings', { globalSelect: [] }],
    ...extraRecords,
  ]);
  let respond = () => completionFixture(wrap('fixture'));
  const upstreamCalls = [];
  const fetchImpl = async (url, options = {}) => {
    upstreamCalls.push({ url: String(url), payload: options.body && JSON.parse(options.body) });
    return respond(url, options);
  };
  const backend = await createStaticBackend(database, {
    fetchImpl: fileFixtureFetch(fetchImpl, textOverrides),
    virtualImages: false,
  });
  const settings = createConnectionStore({ snapshot });
  const promptSource = await createBuiltinPromptSource(fixtureText, settings);
  const states = new Map();
  const commits = [];
  const countTokens = createWorldbookCounter();
  const worldSettings = normalizeWorldSettings({ globalSelect: [] });
  const worlds = {
    async resolve(kind) {
      return {
        books: [],
        settings: structuredClone(worldSettings),
        state: structuredClone(states.get(kind) || {}),
      };
    },
    async commit(kind, nextState, expectedStep, signal) {
      signal?.throwIfAborted();
      commits.push({ kind, nextState, expectedStep });
      if ((states.get(kind)?.step || 0) !== expectedStep) return false;
      states.set(kind, structuredClone(nextState));
      return true;
    },
  };
  const pipeline = createAiPipeline({
    settings,
    worlds,
    helperStorage: { get: () => ({}) },
    countTokens,
    readText: fixtureText,
    readCharacter: createCharacterReader(),
  });
  const antiRoute = createAntiRouteService({ settings, fetchImpl });
  const route = createAiGenerationRoutes({
    settings,
    promptSource,
    pipeline,
    antiRoute,
    fetchImpl,
    send: sendNodeResponse,
  });
  t.after(() => {
    backend.dispose();
    antiRoute.dispose();
  });
  return {
    backend,
    database,
    pipeline,
    promptSource,
    settings,
    countTokens,
    commits,
    upstreamCalls,
    fetchImpl,
    node: (path, input, headers) => nodeRouteRequest(route, path, input, headers),
    respondWith: (factory) => {
      respond = factory;
    },
  };
}

const jsonPayload = (response) => JSON.parse(response.chunks.join(''));

async function nodeApi(
  t,
  { snapshot = configSnapshot(profileFixture({ requestMode: 'browser' })), fetchImpl } = {},
) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const testsDirectory = join(root, '.runtime', 'tests');
  await mkdir(testsDirectory, { recursive: true });
  const directory = await mkdtemp(join(testsDirectory, 'backend-entry-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const settingsFile = join(directory, 'ai-config.json');
  await writeFile(settingsFile, JSON.stringify(snapshot), 'utf8');
  const port = 43123;
  const api = await createAiApi({
    root,
    port,
    settingsFile,
    promptsDirectory: null,
    worldInfoDirectory: join(directory, 'world-info'),
    fetchImpl:
      fetchImpl ??
      (() => {
        throw Error('unexpected upstream request');
      }),
  });
  return (path, input) => nodeRouteRequest(api, path, input, { host: `127.0.0.1:${port}` });
}

test('real Node generation route and static backend agree on preview bytes, final TK, response and usage', async (t) => {
  const host = await hosts(t);
  const source = await host.promptSource.get('chat');
  const nodePreview = await host.pipeline.buildRequest('chat', chatInput, source);
  const staticPreview = await host.backend.request('prompts/preview', {
    kind: 'chat',
    input: chatInput,
  });
  const { nextWorldState: _next, ...expected } = nodePreview;
  assert.deepEqual(staticPreview, expected);
  assert.equal(host.upstreamCalls.length, 0, 'preview performs no model request');
  assert.equal(host.commits.length, 0);
  assert.equal(host.database.get('world.states'), undefined);
  const node = await host.node('generate/chat', chatInput);
  const browser = await host.backend.request('generate/chat', chatInput);
  assert.equal(node.failure, null);
  assert.equal(node.status, 200);
  for (const key of ['content', 'actions', 'usage'])
    assert.deepEqual(node.payload[key], browser[key]);
  assert.deepEqual(node.payload.request.messages, browser.request.messages);
  assert.deepEqual(node.payload.request.tokens, browser.request.tokens);
  assert.deepEqual(host.upstreamCalls[0].payload, host.upstreamCalls[1].payload);
  assert.equal(host.commits.length, 1);
  assert.equal(host.database.get('world.states').chat.step, 1);
});

test('runtime failed parsing and aborted acceptance never advance world state; valid retry commits once', async () => {
  for (const { pipeline, ports } of runtimePair()) {
    const job = await runtimeJob(pipeline, 'summary', summaryInput);
    await assert.rejects(pipeline.acceptResult(job, { content: '{', usage: {} }), /完整JSON/u);
    assert.equal(ports.commits.length, 0);
    assert.equal(pipeline.pendingWorldStates.size, 1);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      pipeline.acceptResult(job, { content: '{"items":[]}', usage: {} }, controller.signal),
      { name: 'AbortError' },
    );
    assert.equal(ports.commits.length, 0);
    const result = await pipeline.acceptResult(job, {
      content: '{"items":[{"id":"source","summary":"fixture"}]}',
      usage: { input: 3, output: 5 },
    });
    assert.equal(result.items[0].summary, 'fixture');
    assert.equal(result.textTokens.source, 'fixture-source'.length);
    assert.equal(result.textTokens.summary, 'fixture'.length);
    assert.equal(ports.commits.length, 1);
    assert.equal(pipeline.pendingWorldStates.size, 0);
  }
});

test('creation accepts plain and tagged JSON while character requires an envelope', async () => {
  for (const { pipeline, ports } of runtimePair()) {
    for (const content of [JSON.stringify(creationOutput), wrap(creationOutput)]) {
      const job = await runtimeJob(pipeline, 'creation', creationInput);
      const result = await pipeline.acceptResult(job, { content, usage: { input: 0, output: 0 } });
      assert.equal(result.items[0].price, 10);
    }
    assert.equal(ports.commits.length, 2);
    const input = { brief: 'fixture', complexity: 1, rollId: 'parity' };
    const job = await runtimeJob(pipeline, 'character', input);
    await assert.rejects(
      pipeline.acceptResult(job, { content: JSON.stringify(characterDocument()) }),
      /输出标签/u,
    );
    assert.equal(ports.commits.length, 2);
  }
});

test('all three successful script modes commit their prepared world state', async () => {
  const overland = { from: 'outskirts', to: 'road-bridge', lootStages: [] };
  const route = overlandPlan(overland.from, overland.to);
  const cases = [
    {
      flag: 'invitationTopics',
      rule: 'script-invitation-topics',
      input: {
        invitationTopics: {
          person: { name: 'fixture' },
          title: 'fixture',
          premise: 'fixture',
          transcript: [],
        },
      },
      output: { unrelated: 'topic-0', weak: ['topic-1', 'topic-2'], strong: 'topic-3' },
      key: 'topics',
    },
    {
      flag: 'invitation',
      rule: 'script-invitation',
      input: {
        party: [{ id: 'actor', name: 'fixture' }],
        invitation: { activity: 'walk', topic: 'fixture', stageCount: 3 },
      },
      output: {
        title: 'fixture',
        premise: 'fixture',
        stages: Array.from({ length: 3 }, (_, i) => ({
          title: `fixture-${i}`,
          scene: 'tavern',
          intro: 'fixture',
          tasks: ['fixture'],
          choices: ['choice-0', 'choice-1'],
        })),
        finale: { title: 'fixture', scene: 'tavern', intro: 'fixture' },
      },
      key: 'invitation',
    },
    {
      flag: 'overland',
      rule: 'script-overland',
      input: { overland, party: [] },
      output: {
        acts: route.stages.map((stage) => ({
          id: stage.id,
          title: 'fixture',
          story: 'fixture',
          ...(stage.type === 'event' ? { choices: ['choice-0', 'choice-1'] } : {}),
        })),
      },
      key: 'acts',
    },
  ];
  for (const scenario of cases) {
    const entry = {
      ...newWorldEntry(0),
      constant: true,
      content: 'fixture',
      apiTargets: ['script'],
      extensions: { wanxiang: { generationRule: scenario.rule } },
    };
    for (const { pipeline, ports, name } of runtimePair({ world: worldFixture({ 0: entry }) })) {
      const job = await runtimeJob(pipeline, 'script', scenario.input);
      assert.equal(job.prepared.nextWorldState.step, 1, `${name}/${scenario.flag} really scanned`);
      const result = await pipeline.acceptResult(job, {
        content: wrap(scenario.output),
        usage: { input: 3, output: 5 },
      });
      assert(result[scenario.key], scenario.flag);
      assert.equal(ports.commits.length, 1, scenario.flag);
      assert.deepEqual(ports.commits[0].nextState, job.prepared.nextWorldState);
      assert.equal(pipeline.pendingWorldStates.size, 0, scenario.flag);
    }
  }
});

test('an optimistic commit conflict rejects acceptance and drops the stale pending state', async () => {
  for (const { pipeline, ports } of runtimePair({ commitResult: false })) {
    const job = await runtimeJob(pipeline, 'summary', summaryInput);
    await assert.rejects(
      pipeline.acceptResult(job, {
        content: '{"items":[{"id":"source","summary":"fixture"}]}',
        usage: {},
      }),
      { code: 'AI_STATE_CONFLICT', status: 409 },
    );
    assert.equal(ports.commits.length, 1);
    assert.equal(pipeline.pendingWorldStates.size, 0);
  }
});

test('mutually exclusive script modes fail before preparing a request', async () => {
  const input = {
    party: [{ id: 'actor', name: 'fixture' }],
    invitation: { activity: 'walk', topic: 'fixture', stageCount: 3 },
    overland: { from: 'outskirts', to: 'road-bridge', lootStages: [] },
  };
  for (const { pipeline, ports } of runtimePair()) {
    await assert.rejects(
      pipeline.buildRequest('script', input, presetFixture()),
      /模式|互斥|同时/u,
    );
    assert.equal(ports.commits.length, 0);
    assert.equal(pipeline.pendingWorldStates.size, 0);
  }
});

test('summary planning includes the preset tool tokens used by generation', async () => {
  const preset = presetFixture({
    extensions: {
      tavern_helper: {
        scripts: [
          {
            id: '2c7d747c-22d4-4e8b-95f8-5620b552fe6e',
            enabled: true,
            content: 'fixture',
          },
        ],
      },
    },
  });
  for (const { pipeline, ports } of runtimePair({ preset })) {
    const prepared = await pipeline.buildRequest('summary', summaryInput, preset);
    const plan = await pipeline.planSummary(summaryInput);
    assert(prepared.tokens.toolTokens > 0);
    assert.equal(plan.inputEstimate, prepared.tokens.inputEstimate);
    assert.equal(ports.commits.length, 0);
    assert.equal(pipeline.pendingWorldStates.size, 0);
  }
});

test('social quest usage appears both on the result and inside request', async () => {
  const input = { brief: 'fixture', socialQuest: { scenes: { tavern: 'fixture' }, archives: [] } };
  const output = {
    acts: Array.from({ length: 5 }, () => ({
      scene: 'tavern',
      title: 'fixture',
      story: 'fixture',
    })),
    reward: { name: 'fixture', description: 'fixture', value: 10, stat: 'hp' },
  };
  for (const { pipeline, ports } of runtimePair()) {
    const job = await runtimeJob(pipeline, 'script', input);
    const reply = await pipeline.acceptResult(job, {
      content: wrap(output),
      usage: { input: 3, output: 5 },
    });
    assert(reply.quest);
    assert.deepEqual(reply.usage, { input: 3, output: 5 });
    assert.deepEqual(reply.request.usage, reply.usage);
    assert.equal(ports.commits.length, 1);
  }
});

test('runtime keeps pending state on storage failure and enforces matching request kind on local commit', async () => {
  for (const { pipeline, ports } of runtimePair()) {
    const job = await runtimeJob(pipeline, 'summary', summaryInput);
    const commit = ports.worlds.commit;
    ports.worlds.commit = async () => {
      throw Error('fixture-storage-failure');
    };
    await assert.rejects(
      pipeline.acceptResult(job, {
        content: '{"items":[{"id":"source","summary":"fixture"}]}',
        usage: {},
      }),
      /fixture-storage-failure/u,
    );
    assert.equal(pipeline.pendingWorldStates.size, 1);
    ports.worlds.commit = commit;
    await pipeline.commitWorldState(job.requestId, 'character');
    assert.equal(ports.commits.length, 0);
    await pipeline.commitWorldState(job.requestId, 'summary');
    await pipeline.commitWorldState(job.requestId, 'summary');
    assert.equal(ports.commits.length, 1);
    assert.equal(pipeline.pendingWorldStates.size, 0);
  }
});

test('static generation preserves the local cause of validation failures', async (t) => {
  const host = await hosts(t);
  const input = { ...chatInput, characters: [null] };
  const node = await host.node('generate/chat', input);
  assert(node.failure instanceof Error);
  assert(!node.failure.message.includes('CORS'));
  await assert.rejects(host.backend.request('generate/chat', input), {
    name: node.failure.name,
    message: node.failure.message,
  });
  const localFailure = new TypeError('fixture local validation cause');
  await assert.rejects(
    host.backend.request('generate/chat', {
      ...chatInput,
      get text() {
        throw localFailure;
      },
    }),
    (failure) => failure === localFailure && failure.message === 'fixture local validation cause',
  );
  assert.equal(host.upstreamCalls.length, 0);
});

test('Node and static normalize nullish bodies and reject invalid request containers', async (t) => {
  const host = await hosts(t);
  const node = await nodeApi(t, { fetchImpl: host.fetchImpl });
  const invalid = { code: 'AI_INVALID_REQUEST', status: 400 };
  for (const input of [null, undefined, {}]) {
    const response = await node('generate/chat', input);
    assert.equal(response.status, 400);
    assert.match(jsonPayload(response).error, /发言需要/u);
    await assert.rejects(host.backend.request('generate/chat', input), /发言需要/u);
  }
  for (const input of [false, 0, '', [], ['fixture']]) {
    const response = await node('generate/chat', input);
    assert.equal(response.status, invalid.status);
    assert.equal(jsonPayload(response).code, invalid.code);
    await assert.rejects(host.backend.request('generate/chat', input), invalid);
  }
  for (const input of [() => ({}), new Date(0), new Map()]) {
    await assert.rejects(host.backend.request('generate/chat', input), invalid);
  }
  for (const [path, fields] of [
    ['prompts/preview', { kind: 'chat' }],
    ['validate/character', { content: '{' }],
    ['transport/prepare', { path: 'models/chat' }],
  ]) {
    const response = await node(path, { ...fields, input: [] });
    assert.equal(response.status, invalid.status);
    assert.equal(jsonPayload(response).code, invalid.code);
    if (path !== 'transport/prepare') {
      await assert.rejects(host.backend.request(path, { ...fields, input: [] }), invalid);
    }
  }
  const preview = { kind: 'chat', input: null };
  const badPreview = await node('prompts/preview', preview);
  assert.match(jsonPayload(badPreview).error, /发言需要/u);
  await assert.rejects(host.backend.request('prompts/preview', preview), /发言需要/u);
  const prepare = await node('transport/prepare', { path: 'models/chat', input: null });
  assert.equal(prepare.status, 200);
  assert.equal(
    (await node('transport/cancel', { ticket: jsonPayload(prepare).ticket })).status,
    200,
  );
  const nodePlan = await node('summary/plan', summaryInput);
  assert.equal(nodePlan.status, 200);
  assert.deepEqual(jsonPayload(nodePlan).batches[0].ids, ['source']);
  assert.equal(host.upstreamCalls.length, 0);
});

test('POLICY-03: Node local, static and browser ticket completion normalize negative usage', async (t) => {
  const host = await hosts(t);
  let upstreamCalls = 0;
  host.respondWith(() => {
    upstreamCalls++;
    return completionFixture(wrap('fixture'), { prompt_tokens: -1, completion_tokens: 5 });
  });
  const expectedUsage = { input: 0, output: 5 };
  const nodeLocal = await host.node('generate/chat', chatInput);
  const staticReply = await host.backend.request('generate/chat', chatInput);
  assert.equal(nodeLocal.status, 200);
  assert.deepEqual(nodeLocal.payload.usage, expectedUsage);
  assert.deepEqual(staticReply.usage, expectedUsage);

  const callsBeforeTicket = upstreamCalls;
  const prepared = await host.node('transport/prepare', {
    path: 'generate/chat',
    input: chatInput,
  });
  assert.equal(prepared.status, 200);
  const acceptedOutput = 'accepted browser ticket output';
  const completed = await host.node('transport/complete', {
    ticket: prepared.payload.ticket,
    result: { content: wrap(acceptedOutput), usage: { input: -1, output: 5 } },
  });
  assert.equal(completed.status, 200);
  assert.deepEqual(completed.payload.usage, expectedUsage);
  assert.ok(JSON.stringify(completed.payload).includes(acceptedOutput));
  assert.equal(host.pipeline.pendingWorldStates.has(prepared.payload.ticket), false);
  assert.equal(upstreamCalls, callsBeforeTicket);
});

test('capacity is two and Node generation, browser prepare and static generation expose AI_BUSY/429', async (t) => {
  const host = await hosts(t);
  const node = await nodeApi(t, { fetchImpl: host.fetchImpl });
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  host.respondWith(async () => {
    await gate;
    return completionFixture(wrap('fixture'));
  });
  const paths = ['generate/chat', 'generate/quick-chat'];
  const requests = paths.map((path) => node(path, chatInput));
  const browserRequests = Promise.all(paths.map((path) => host.backend.request(path, chatInput)));
  const settled = Promise.allSettled([...requests, browserRequests]);
  try {
    for (const [path, input] of [
      ['generate/chat', chatInput],
      ['transport/prepare', { path: 'generate/chat', input: chatInput }],
    ]) {
      const busy = await node(path, input);
      assert.equal(busy.status, 429);
      assert.equal(jsonPayload(busy).code, 'AI_BUSY');
      assert.equal(jsonPayload(busy).status, 429);
      assert.match(jsonPayload(busy).error, /已有生成任务/u);
    }
    await assert.rejects(host.backend.request('generate/chat', chatInput), {
      code: 'AI_BUSY',
      status: 429,
    });
  } finally {
    release();
    await settled;
  }
  for (const reply of await Promise.all(requests))
    assert.equal(reply.status, 200, reply.chunks.join(''));
  assert.equal((await browserRequests).length, 2);
});

test('Node direct tickets contain no secret, are single-use, and run the real shared parser before commit', async (t) => {
  const host = await hosts(t);
  const prepare = await host.node('transport/prepare', { path: 'generate/chat', input: chatInput });
  assert.equal(prepare.status, 200);
  assert.equal(prepare.payload.profile.apiKey, undefined);
  assert(!JSON.stringify(prepare.payload).includes('parity-key'));
  const input = { ticket: prepare.payload.ticket, result: { content: wrap('fixture') } };
  const completed = await host.node('transport/complete', input);
  assert.equal(completed.status, 200);
  assert.equal(completed.payload.content, 'fixture');
  assert.deepEqual(completed.payload.usage, { input: 0, output: 0 });
  assert.equal(host.commits.length, 1);
  const repeated = await host.node('transport/complete', input);
  assert.match(repeated.failure.message, /已接受/u);
  assert.equal(host.commits.length, 1);
  assert.equal(host.upstreamCalls.length, 0);
});

test('static summary planning selects the party-bound worldbook used by the real request', async (t) => {
  const entry = {
    ...newWorldEntry(0),
    apiTargets: ['summary'],
    constant: true,
    content: 'BOUND_SUMMARY_'.repeat(100),
  };
  const host = await hosts(t, {
    extraRecords: [
      ['world.settings', { globalSelect: [], bindings: { actor: ['bound'] } }],
      ['world.book.bound', { name: 'bound', entries: { 0: entry } }],
    ],
  });
  const input = { ...summaryInput, party: [{ id: 'actor' }] };
  const staticPlan = await host.backend.request('summary/plan', input);
  const preview = await host.backend.request('prompts/preview', { kind: 'summary', input });
  const unbound = await host.backend.request('summary/plan', summaryInput);
  assert.equal(staticPlan.batches.length, 1);
  assert(preview.messages.some((row) => row.content.includes('BOUND_SUMMARY_')));
  assert.equal(staticPlan.inputEstimate, preview.tokens.inputEstimate);
  assert(staticPlan.inputEstimate > unbound.inputEstimate);
  assert.equal(host.upstreamCalls.length, 0);
  assert.equal(host.database.get('world.states'), undefined);
});

test('both preview entries honor a temporary preset without mutating or persisting it', async (t) => {
  const host = await hosts(t);
  const node = await nodeApi(t, { fetchImpl: host.fetchImpl });
  const custom = presetFixture({
    prompts: [{ identifier: 'main', role: 'system', content: 'CUSTOM_PRESET_SENTINEL' }],
  });
  const before = structuredClone(custom);
  const request = { kind: 'character', input: { brief: 'fixture', rollId: 'parity' } };
  const writes = host.database.writes.length;
  const usesCustom = (preview) =>
    preview.messages.some((row) => row.content.includes('CUSTOM_PRESET_SENTINEL'));
  for (const preview of [
    async (data) => {
      const response = await node('prompts/preview', data);
      assert.equal(response.status, 200, response.chunks.join(''));
      return jsonPayload(response);
    },
    (data) => host.backend.request('prompts/preview', data),
  ]) {
    const initial = await preview(request);
    const temporary = await preview({ ...request, preset: custom });
    assert.equal(usesCustom(initial), false);
    assert.equal(usesCustom(temporary), true);
    assert.equal(temporary.nextWorldState, undefined);
    assert.deepEqual(await preview(request), initial);
  }
  assert.deepEqual(custom, before);
  assert.equal(host.database.writes.length, writes);
  assert.equal(host.upstreamCalls.length, 0);
});

test('local revalidation protects active IDs and allows unrelated and settled IDs', async (t) => {
  const host = await hosts(t);
  const node = await nodeApi(t, { fetchImpl: host.fetchImpl });
  const input = { brief: 'fixture', complexity: 1, rollId: 'parity' };
  const content = JSON.stringify(characterDocument());
  const ticket = await node('transport/prepare', { path: 'generate/character', input });
  assert.equal(ticket.status, 200, ticket.chunks.join(''));
  const nodeId = jsonPayload(ticket).ticket;
  const staticId = 'fixture-active-id';
  t.mock.method(crypto, 'randomUUID', () => staticId);
  let release;
  let markStarted;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  host.respondWith(async () => {
    markStarted();
    await gate;
    return completionFixture(wrap(content));
  });
  const generation = host.backend.request('generate/character', input);
  const validation = (requestId) => ({ content, input, requestId });
  try {
    await Promise.race([started, generation]);
    const active = await node('validate/character', validation(nodeId));
    assert.equal(active.status, 409);
    assert.equal(jsonPayload(active).code, 'AI_REQUEST_ACTIVE');
    await assert.rejects(host.backend.request('validate/character', validation(staticId)), {
      code: 'AI_REQUEST_ACTIVE',
      status: 409,
    });
    const unrelated = validation('fixture-unrelated');
    assert.equal((await node('validate/character', unrelated)).status, 200);
    assert((await host.backend.request('validate/character', unrelated)).entry);
  } finally {
    release();
    await node('transport/cancel', { ticket: nodeId });
    await generation;
  }
  assert.equal((await node('validate/character', validation(nodeId))).status, 200);
  assert((await host.backend.request('validate/character', validation(staticId))).entry);
});

test('security ISSUE-04: Node live and static generation errors redact every configured key', async (t) => {
  const otherSecret = 'OTHER_PURPOSE_SECRET';
  const host = await hosts(t, {
    profile: { stream: true },
    profileOverrides: { character: { apiKey: otherSecret } },
  });
  const secrets = [host.settings.get('chat').apiKey, otherSecret];
  assert(secrets.every((secret) => typeof secret === 'string' && secret.length > 0));
  assert.notEqual(secrets[0], secrets[1]);
  host.respondWith(() => completionFixture('INVALID_BODY_' + secrets.join('_')));
  const node = await host.node('generate/chat', chatInput, { accept: 'text/event-stream' });
  assert.equal(node.failure, null);
  assert.equal(node.status, 200);
  const events = node.chunks
    .join('')
    .split('\n\n')
    .filter((chunk) => chunk.startsWith('data: '))
    .map((chunk) => JSON.parse(chunk.slice(6)));
  const failure = events.find((event) => event.type === 'error');
  assert(failure);
  const reports = [{ message: failure.error, diagnostic: failure.diagnostic }];
  await assert.rejects(host.backend.request('generate/chat', chatInput), (error) => {
    reports.push(error);
    return true;
  });
  for (const report of reports) {
    assert(report.diagnostic);
    assert.equal(typeof report.message, 'string');
    const serialized = JSON.stringify(report.diagnostic);
    assert(serialized.includes('[密钥已隐藏]'));
    for (const secret of secrets) {
      assert(!report.message.includes(secret));
      assert(!String(report.diagnostic.message ?? '').includes(secret));
      assert(!serialized.includes(secret));
    }
  }
});

test('security ISSUE-05: Node and static local revalidation failures redact every configured key', async (t) => {
  const otherSecret = 'OTHER_PURPOSE_SECRET';
  const host = await hosts(t, { profileOverrides: { script: { apiKey: otherSecret } } });
  const secrets = [host.settings.get('character').apiKey, otherSecret];
  assert(secrets.every((secret) => typeof secret === 'string' && secret.length > 0));
  assert.notEqual(secrets[0], secrets[1]);
  const raw = JSON.stringify({ secret: secrets[0], other: otherSecret }).slice(0, -1);
  const redactedRaw = secrets.reduce(
    (text, secret) => text.replaceAll(secret, '[密钥已隐藏]'),
    raw,
  );
  const snapshot = configSnapshot(profileFixture({ requestMode: 'browser' }));
  snapshot.profiles.script.apiKey = otherSecret;
  const request = await nodeApi(t, { snapshot });
  const node = await request('validate/character', { content: raw });
  assert.equal(node.failure, null);
  assert.equal(node.status, 400);
  const { error, diagnostic } = JSON.parse(node.chunks.join(''));
  const reports = [{ message: error, diagnostic }];
  await assert.rejects(host.backend.request('validate/character', { content: raw }), (failure) => {
    reports.push(failure);
    return true;
  });
  for (const report of reports) {
    assert(report.diagnostic);
    assert.equal(typeof report.message, 'string');
    assert.equal(report.diagnostic.rawText, redactedRaw);
    const serialized = JSON.stringify(report.diagnostic);
    for (const secret of secrets) {
      assert(!report.message.includes(secret));
      assert(!String(report.diagnostic.message ?? '').includes(secret));
      assert(!serialized.includes(secret));
    }
  }
  assert.equal(host.upstreamCalls.length, 0);
});
