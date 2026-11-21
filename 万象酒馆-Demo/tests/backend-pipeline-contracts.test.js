import test from 'node:test';
import assert from 'node:assert/strict';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { mapResponse } from '../src/ai/pipeline/map-request.js';
import { summaryPlan, summaryRequest } from '../src/ai/pipeline/summary-request.js';
import { newWorldEntry } from '../src/ai/worldbook.js';
import { overlandPlan } from '../src/overland-travel.js';
import { characterDocument, scriptFixture } from './fixtures/ai.js';
import {
  makePipelinePorts,
  presetFixture,
  profileFixture,
  worldFixture,
} from './backend-pipeline-harness.test.js';

const readText = async () => 'fixture-system';
const usage = { input: 3, output: 5 };
const wrap = (value) => `<wanxiang_output>${JSON.stringify(value)}</wanxiang_output>`;
const summaryInput = {
  items: [{ id: 'record', kind: 'chat', label: 'fixture', text: 'fixture-source' }],
};
const summaryResult = {
  content: JSON.stringify({ items: [{ id: 'record', summary: 'fixture' }] }),
  usage,
};
const chatInput = { text: 'fixture', place: 'table', selected: [], characters: [], history: [] };

async function runtimeJob(pipeline, kind, input, preset = presetFixture()) {
  const prepared = await pipeline.buildRequest(kind, input, preset);
  const requestId = 'fixture-request';
  if (prepared.nextWorldState) {
    pipeline.pendingWorldStates.set(requestId, {
      kind,
      nextState: prepared.nextWorldState,
      expectedStep: prepared.nextWorldState.step - 1,
    });
  }
  return {
    kind,
    input,
    prepared,
    requestId,
    profile: profileFixture(),
    messages: prepared.messages,
    requestReport: { id: requestId, tokens: prepared.tokens },
  };
}

test('script submodes commit a registered state once, after parsing and cancellation checks', async () => {
  const overland = { from: 'outskirts', to: 'road-bridge', lootStages: [] };
  const route = overlandPlan(overland.from, overland.to);
  const cases = [
    {
      rule: 'script-invitation-topics',
      input: { invitationTopics: { person: { name: 'fixture' }, transcript: [] } },
      output: { unrelated: 'topic-0', weak: ['topic-1', 'topic-2'], strong: 'topic-3' },
      key: 'topics',
    },
    {
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
  for (const { rule, input, output, key } of cases) {
    const entry = {
      ...newWorldEntry(0),
      constant: true,
      content: 'fixture',
      apiTargets: ['script'],
      extensions: { wanxiang: { generationRule: rule } },
    };
    const ports = makePipelinePorts({ readText, world: worldFixture({ 0: entry }) });
    const pipeline = createAiPipeline(ports);
    const job = await runtimeJob(pipeline, 'script', input);
    const pending = pipeline.pendingWorldStates.get(job.requestId);
    assert.equal(pending.nextState.step, 1, rule);
    const upstream = { content: wrap(output), usage };
    await assert.rejects(
      pipeline.acceptResult(job, { content: '<wanxiang_output>{</wanxiang_output>' }),
    );
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(pipeline.acceptResult(job, upstream, controller.signal), {
      name: 'AbortError',
    });
    const unregistered = await pipeline.acceptResult(
      { ...job, requestId: 'unregistered' },
      upstream,
    );
    assert.ok(unregistered[key], rule);
    assert.equal(ports.commits.length, 0, rule);
    assert.strictEqual(pipeline.pendingWorldStates.get(job.requestId), pending);

    const reply = await pipeline.acceptResult(job, upstream);
    assert.ok(reply[key], rule);
    assert.deepEqual(reply.usage, usage);
    await pipeline.acceptResult(job, upstream);
    assert.deepEqual(ports.commits, [
      { kind: 'script', nextState: pending.nextState, expectedStep: 0 },
    ]);
    assert.equal(pipeline.pendingWorldStates.has(job.requestId), false);
  }
});

test('script build and acceptance reject all pairs of submodes and preserve legacy script', async () => {
  const ports = makePipelinePorts({ readText });
  const pipeline = createAiPipeline(ports);
  const preset = presetFixture();
  const modes = ['socialQuest', 'invitationTopics', 'invitation', 'overland'];
  const conflict = { code: 'AI_SCRIPT_MODE_CONFLICT', status: 400 };
  for (const [i, first] of modes.entries()) {
    for (const second of modes.slice(i + 1)) {
      const input = { [first]: {}, [second]: {} };
      await assert.rejects(pipeline.buildRequest('script', input, preset), conflict);
      await assert.rejects(
        pipeline.acceptResult({ kind: 'script', input }, summaryResult),
        conflict,
      );
    }
  }
  assert.equal(ports.resolves.length, 0);
  assert.equal(ports.commits.length, 0);
  const input = { brief: 'fixture', boss: 'bossGate', party: [{ id: 'actor', name: 'fixture' }] };
  const job = await runtimeJob(pipeline, 'script', input, preset);
  const reply = await pipeline.acceptResult(job, {
    content: wrap(scriptFixture(['actor'])),
    usage,
  });
  assert.ok(reply.entry);
  assert.equal(ports.commits.length, 1);
});

test('social quest exposes top-level usage and retains request usage', async () => {
  const ports = makePipelinePorts({ readText });
  const pipeline = createAiPipeline(ports);
  const input = { brief: 'fixture', socialQuest: { scenes: { tavern: 'fixture' }, archives: [] } };
  const output = {
    acts: Array.from({ length: 5 }, () => ({
      scene: 'tavern',
      title: 'fixture',
      story: 'fixture',
    })),
    reward: { name: 'fixture', description: 'fixture', value: 10, stat: 'hp' },
  };
  const job = await runtimeJob(pipeline, 'script', input);
  const reply = await pipeline.acceptResult(job, { content: wrap(output), usage });
  assert.ok(reply.quest);
  assert.deepEqual(reply.usage, usage);
  assert.deepEqual(reply.request.usage, usage);
  assert.equal(ports.commits.length, 1);
});

test('summary and both chat kinds release conflicts and retain storage failures for recovery', async () => {
  for (const kind of ['summary', 'chat', 'quick-chat']) {
    const ports = makePipelinePorts({ readText });
    const pipeline = createAiPipeline(ports);
    const summary = kind === 'summary';
    const job = await runtimeJob(pipeline, kind, summary ? summaryInput : chatInput);
    const upstream = summary
      ? summaryResult
      : { content: '<wanxiang_output>fixture</wanxiang_output>', usage };
    const pending = pipeline.pendingWorldStates.get(job.requestId);
    assert.ok(pending, kind);
    const commit = ports.worlds.commit;
    let conflictCalls = 0;
    ports.worlds.commit = async () => {
      conflictCalls += 1;
      return false;
    };
    await assert.rejects(pipeline.acceptResult(job, upstream), {
      code: 'AI_STATE_CONFLICT',
      status: 409,
      message: '世界书状态已变更，请基于当前状态重新规划后再试',
    });
    assert.equal(conflictCalls, 1, kind);
    assert.equal(ports.commits.length, 0, kind);
    assert.equal(pipeline.pendingWorldStates.has(job.requestId), false, kind);

    const recoveryJob = await runtimeJob(pipeline, kind, summary ? summaryInput : chatInput);
    const recoverable = pipeline.pendingWorldStates.get(recoveryJob.requestId);
    assert.ok(recoverable, kind);
    assert.notStrictEqual(recoverable, pending);
    const storageFailure = Error('fixture-storage-failure');
    ports.worlds.commit = async () => {
      throw storageFailure;
    };
    await assert.rejects(
      pipeline.acceptResult(recoveryJob, upstream),
      (failure) => failure === storageFailure,
    );
    assert.strictEqual(pipeline.pendingWorldStates.get(recoveryJob.requestId), recoverable);

    ports.worlds.commit = commit;
    await pipeline.commitWorldState(recoveryJob.requestId, 'character');
    assert.strictEqual(pipeline.pendingWorldStates.get(recoveryJob.requestId), recoverable);
    await pipeline.commitWorldState(recoveryJob.requestId, kind);
    await pipeline.acceptResult(recoveryJob, upstream);
    await pipeline.acceptResult(recoveryJob, upstream);
    assert.equal(ports.commits.length, 1, kind);
    assert.equal(pipeline.pendingWorldStates.has(recoveryJob.requestId), false);
  }
});

test('overlapping acceptance shares success or conflict and preserves a later registration with the same ID', async () => {
  for (const conflict of [false, true]) {
    const ports = makePipelinePorts({ readText });
    const pipeline = createAiPipeline(ports);
    const job = await runtimeJob(pipeline, 'summary', summaryInput);
    const commit = ports.worlds.commit;
    const started = Promise.withResolvers();
    const gate = Promise.withResolvers();
    ports.worlds.commit = async (...args) => {
      const result = await commit(...args);
      started.resolve();
      await gate.promise;
      return conflict ? false : result;
    };
    const replies = Promise.allSettled([
      pipeline.acceptResult(job, summaryResult),
      pipeline.acceptResult(job, summaryResult),
    ]);
    await Promise.race([started.promise, replies]);
    const replacement = { kind: 'summary', nextState: { step: 2, effects: {} }, expectedStep: 1 };
    pipeline.pendingWorldStates.set(job.requestId, replacement);
    gate.resolve();
    const outcomes = await replies;
    for (const outcome of outcomes) {
      assert.equal(outcome.status, conflict ? 'rejected' : 'fulfilled');
      if (conflict) {
        assert.equal(outcome.reason.code, 'AI_STATE_CONFLICT');
        assert.equal(outcome.reason.status, 409);
        assert.equal(outcome.reason.message, '世界书状态已变更，请基于当前状态重新规划后再试');
      }
    }
    assert.equal(ports.commits.length, 1);
    assert.strictEqual(pipeline.pendingWorldStates.get(job.requestId), replacement);
    ports.worlds.commit = commit;
    await pipeline.commitWorldState(job.requestId, 'summary');
    assert.equal(ports.commits.length, 2);
    assert.deepEqual(ports.commits[1].nextState, replacement.nextState);
    assert.equal(pipeline.pendingWorldStates.has(job.requestId), false);
  }
});

test('summary plan splits at the processed budget and resolves bound books for each raw batch', async () => {
  const preset = presetFixture({
    extensions: {
      tavern_helper: {
        scripts: [
          { id: '2c7d747c-22d4-4e8b-95f8-5620b552fe6e', enabled: true, content: 'fixture' },
        ],
      },
    },
  });
  const entries = Object.fromEntries(
    ['A', 'B'].map((suffix, i) => [
      i,
      {
        ...newWorldEntry(i),
        content: `WORLD_${suffix}`,
        key: [`KEY_${suffix}`],
        characterFilter: { names: ['actor'] },
        apiTargets: ['summary'],
      },
    ]),
  );
  const input = {
    party: [{ id: 'actor', name: 'fixture' }],
    items: ['A', 'B'].map((suffix) => ({
      id: suffix,
      kind: 'chat',
      label: 'fixture',
      text: `KEY_${suffix} ${'x'.repeat(300)}`,
      rawFixtureField: suffix,
    })),
  };
  let contextSize = 2_000_000;
  const ports = makePipelinePorts({ readText, world: worldFixture(entries, {}, { step: 7 }) });
  ports.settings.get = (kind) => {
    assert.equal(kind, 'summary');
    return profileFixture({ maxTokens: 1000, contextSize, promptProcessing: 'none' });
  };
  const resolve = ports.worlds.resolve;
  ports.worlds.resolve = async (kind, request, override) => {
    const world = await resolve(kind, request, override);
    if (!request.party?.some(({ id }) => id === 'actor')) world.books = [];
    return world;
  };
  const pipeline = createAiPipeline({
    ...ports,
    promptSource: {
      async get(kind) {
        assert.equal(kind, 'summary');
        return preset;
      },
    },
  });
  const singles = await Promise.all(
    input.items.map((item) =>
      pipeline.buildRequest('summary', { ...input, items: [item] }, preset),
    ),
  );
  const together = await pipeline.buildRequest('summary', input, preset);
  contextSize = Math.max(...singles.map((request) => request.tokens.totalBudgetEstimate));
  assert.ok(together.tokens.totalBudgetEstimate > contextSize);
  for (const [index, prepared] of singles.entries()) {
    assert.ok(prepared.tokens.toolTokens > 0);
    assert.equal(prepared.nextWorldState.step, 8);
    assert.ok(
      prepared.messages.some(({ content }) => content.includes(`WORLD_${input.items[index].id}`)),
    );
    assert.equal(
      prepared.messages.some(({ content }) =>
        content.includes(`WORLD_${input.items[1 - index].id}`),
      ),
      false,
    );
  }
  const before = ports.resolves.length;
  const plan = await pipeline.planSummary(input);
  assert.deepEqual(plan, {
    batches: singles.map((prepared, index) => ({
      ids: [input.items[index].id],
      inputEstimate: prepared.tokens.inputEstimate,
    })),
    inputEstimate: singles.reduce((sum, { tokens }) => sum + tokens.inputEstimate, 0),
    tokenizer: 'o200k_base',
  });
  assert.deepEqual(
    ports.resolves.slice(before).map(({ input: candidate }) => candidate),
    [{ ...input, items: [input.items[0]] }, input, { ...input, items: [input.items[1]] }],
  );
  assert.equal(ports.commits.length, 0);
  assert.equal(pipeline.pendingWorldStates.size, 0);
});

test('summary planning identifies an oversized singleton and propagates preset processing errors', async () => {
  const ports = makePipelinePorts({ readText, profile: profileFixture({ contextSize: 1 }) });
  let preset = presetFixture();
  const pipeline = createAiPipeline({ ...ports, promptSource: { get: async () => preset } });
  await assert.rejects(pipeline.planSummary(summaryInput), {
    code: 'AI_SUMMARY_ITEM_TOO_LARGE',
    status: 400,
  });
  assert.equal(ports.resolves.length, 1);
  preset = {
    ...preset,
    extensions: {
      SPreset: {
        ChatSquash: {
          squashed_post_script_enable: true,
          squashed_post_script: 'fixture-unreviewed',
        },
      },
    },
  };
  let processingError;
  await assert.rejects(pipeline.buildRequest('summary', summaryInput, preset), (failure) => {
    processingError = failure.message;
    return true;
  });
  assert.ok(processingError);
  await assert.rejects(pipeline.planSummary(summaryInput), (failure) => {
    assert.equal(failure.message, processingError);
    assert.equal(failure.code, undefined);
    return true;
  });
  assert.equal(ports.resolves.length, 3);
  assert.equal(ports.commits.length, 0);
});

test('standalone summary planning keeps legacy and preset signatures with their matching builders', async () => {
  const { countTokens } = makePipelinePorts();
  const profile = profileFixture();
  const preset = presetFixture();
  const options = { profile, countTokens, readText };
  const legacy = await summaryPlan(summaryInput, profile, countTokens, readText);
  const modern = await summaryPlan(summaryInput, preset, options);
  assert.equal(
    legacy.inputEstimate,
    (await summaryRequest(summaryInput, profile, countTokens, readText)).tokens.inputEstimate,
  );
  assert.equal(
    modern.inputEstimate,
    (await summaryRequest(summaryInput, preset, options)).tokens.inputEstimate,
  );
  assert.deepEqual(
    modern,
    await summaryPlan(summaryInput, profile, countTokens, readText, { preset }),
  );
});

test('intentional envelope contract: assets accept bare JSON at the parser boundary and character requires a tag', async () => {
  const ports = makePipelinePorts({ readText });
  const pipeline = createAiPipeline(ports);
  const creation = {
    items: [{ id: 'ore', name: 'fixture', description: 'fixture', value: 10, script: 'fixture' }],
  };
  const output = {
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
  for (const content of [JSON.stringify(output), wrap(output)]) {
    const job = await runtimeJob(pipeline, 'creation', creation);
    const reply = await pipeline.acceptResult(job, { content, usage });
    assert.equal(reply.items[0].price, 10);
  }

  // Empty map JSON fails the map schema in either form. Both forms must reach that parser.
  const map = { brief: 'fixture' };
  const mapJob = await runtimeJob(pipeline, 'map', map);
  let mapError;
  assert.throws(
    () => mapResponse('{}', map),
    (failure) => {
      mapError = failure.message;
      return true;
    },
  );
  for (const content of ['{}', wrap({})]) {
    await assert.rejects(pipeline.acceptResult(mapJob, { content, usage }), (failure) => {
      assert.equal(failure.message, mapError);
      assert.equal(failure.diagnostic.stage, 'asset-response');
      return true;
    });
  }
  assert.equal(ports.commits.length, 2);

  const character = {
    brief: 'fixture',
    complexity: 1,
    rollId: 'fixture-roll',
    purpose: 'protagonist',
  };
  const job = await runtimeJob(pipeline, 'character', character);
  const document = characterDocument();
  await assert.rejects(
    pipeline.acceptResult(job, { content: JSON.stringify(document), usage }),
    (failure) => {
      assert.equal(failure.diagnostic.stage, 'envelope');
      return true;
    },
  );
  assert.equal(ports.commits.length, 2);
  const accepted = await pipeline.acceptResult(job, { content: wrap(document), usage });
  assert.equal(accepted.entry.combat.limit, 2);
  assert.equal(ports.commits.length, 3);
});

test('acceptResult normalizes returned and diagnostic usage without mutating upstream', async () => {
  const pipeline = createAiPipeline(makePipelinePorts({ readText }));
  const input = { brief: 'fixture', complexity: 1, rollId: 'fixture-roll', purpose: 'protagonist' };
  const job = await runtimeJob(pipeline, 'character', input);
  const upstreamUsage = {
    input: '3',
    output: 5.5,
    total: Infinity,
    completion_tokens_details: { reasoning_tokens: -1, note: 'kept' },
  };
  const upstream = { content: wrap(characterDocument()), usage: upstreamUsage };
  const before = structuredClone(upstream);
  const reply = await pipeline.acceptResult(job, upstream);
  const expected = {
    input: 0,
    output: 5.5,
    completion_tokens_details: { note: 'kept' },
  };
  assert.deepEqual(reply.usage, expected);
  assert.strictEqual(job.requestReport.usage, reply.usage);
  assert.deepEqual(reply.diagnostic.request.usage, expected);
  assert.notStrictEqual(reply.usage, upstreamUsage);
  assert.strictEqual(upstream.usage, upstreamUsage);
  assert.deepEqual(upstream, before);
});
