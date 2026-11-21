import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { createCharacterReader, createWorldbookCounter } from '../server/character-reader.mjs';
import { parseCharacterOutput } from '../src/ai/contracts.js';
import { createWorldbookCounter as browserCounter } from '../src/ai/tokenizer.js';
import { characterGenerationPlan } from '../src/character-generation.js';
import { newWorldEntry } from '../src/ai/worldbook.js';
import { characterDocument, scriptFixture } from './fixtures/ai.js';
import {
  makePipelinePorts,
  presetFixture,
  profileFixture,
  worldFixture,
} from './backend-pipeline-harness.test.js';

const names = [
  'chat-request',
  'chat-response',
  'creation-request',
  'encounter-reference',
  'game-reference',
  'generation-result',
  'generation-source',
  'output-envelope',
  'preset-processing',
  'prompt-audit',
  'prompt-processing',
  'prompts',
  'request-tokens',
  'summary-request',
];
const mirrors = Object.fromEntries(
  await Promise.all(
    names.map(async (name) => [
      name,
      {
        node: await import(`../server/${name}.mjs`),
        shared: await import(`../src/ai/pipeline/${name}.js`),
      },
    ]),
  ),
);
const readText = (name) => readFile(new URL('../prompts/' + name, import.meta.url), 'utf8');
const countTokens = (text) => text.length;
const wrap = (text) => `<wanxiang_output>${text}</wanxiang_output>`;
const characterInput = { brief: 'fixture', rollId: 'parity-roll', complexity: 1 };
const chatInput = {
  text: 'fixture',
  place: 'table',
  selected: ['actor'],
  characters: [{ id: 'actor', name: 'fixture-actor', worldbook: 'fixture-setting' }],
  history: [],
};
const summaryInput = {
  items: [{ id: 'record', kind: 'chat', label: 'fixture', text: 'fixture-source' }],
};
const creationInput = {
  items: [
    { id: 'ore', name: 'fixture', description: 'fixture', value: 10, script: 'fixture-source' },
  ],
};

function stable(value) {
  return JSON.parse(
    JSON.stringify(value).replace(
      /(?:character|script)-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu,
      'generated-id',
    ),
  );
}

async function observe(action) {
  try {
    return { ok: true, value: stable(await action()) };
  } catch (failure) {
    return {
      ok: false,
      name: failure.name,
      message: failure.message,
      diagnostic: failure.diagnostic && stable(failure.diagnostic),
    };
  }
}

async function compare(name, action) {
  const pair = mirrors[name];
  const node = await observe(() => action(pair.node));
  const shared = await observe(() => action(pair.shared));
  assert.deepEqual(node, shared, name);
  return node;
}

test('all 14 mirrors expose the same actual function objects except documented adapters', () => {
  const adapters = {
    'chat-request': ['chatRequest'],
    'chat-response': ['chatResponse'],
    prompts: ['generationRequest'],
    'summary-request': ['summaryRequest', 'summaryPlan'],
  };
  for (const name of names) {
    const { node, shared } = mirrors[name];
    for (const key of Object.keys(shared)) {
      if (adapters[name]?.includes(key)) {
        assert.notStrictEqual(node[key], shared[key], `${name}.${key} is an adapter`);
      } else {
        assert.strictEqual(node[key], shared[key], `${name}.${key} must be the same object`);
      }
    }
    assert.deepEqual(
      Object.keys(node).filter((key) => key !== 'generationMessages'),
      Object.keys(shared),
      name,
    );
  }
});

test('chat-request preserves selected/mentioned fields, history, actual final TK and failures', async () => {
  const input = structuredClone(chatInput);
  input.characters.push({ id: 'other', name: 'other', worldbook: 'other-setting' });
  input.text = '  fixture other  ';
  input.history = [{ role: 'user', content: 'history' }];
  const before = structuredClone(input);
  for (const kind of ['chat', 'quick-chat']) {
    const result = await compare('chat-request', (module) =>
      module.chatRequest(kind, input, presetFixture(), {
        profile: profileFixture(),
        worldInfo: worldFixture(),
        countTokens,
      }),
    );
    assert.equal(result.ok, true);
    assert.equal(
      result.value.tokens.contentTokens,
      result.value.messages.reduce((sum, message) => sum + countTokens(message.content), 0),
    );
    assert.equal(result.value.nextWorldState.step, 1);
    assert(result.value.messages.some((message) => message.content.includes('other-setting')));
  }
  assert.deepEqual(input, before);
  for (const invalid of [
    { ...input, text: '' },
    { ...input, history: [{ role: 'tool' }] },
  ]) {
    const result = await compare('chat-request', (module) =>
      module.chatRequest('chat', invalid, presetFixture(), {
        profile: profileFixture(),
        worldInfo: worldFixture(),
        countTokens,
      }),
    );
    assert.equal(result.ok, false);
  }
});

test('chat-response supports both signatures, old/current body tags and rejects invalid actions', async () => {
  for (const tag of ['wanxiang_output', 'wanxiang_chat']) {
    const content =
      `<${tag}> fixture </${tag}>` +
      '<wanxiang_actions>{"affection":[{"id":"actor","delta":-1}],"agreeToAdventure":["actor"]}</wanxiang_actions>';
    const current = await compare('chat-response', (module) =>
      module.chatResponse('chat', content, chatInput),
    );
    const legacy = await compare('chat-response', (module) =>
      module.chatResponse('chat', content, [], chatInput),
    );
    assert.deepEqual(current, legacy);
    assert.equal(current.value.content, 'fixture');
    assert.equal(current.value.actions.affection[0].delta, -1);
  }
  for (const content of [
    'untagged',
    wrap('one') + wrap('two'),
    wrap('fixture') +
      '<wanxiang_actions>{"affection":[{"id":"missing","delta":1}],"agreeToAdventure":[]}</wanxiang_actions>',
  ]) {
    assert.equal(
      (await compare('chat-response', (module) => module.chatResponse('chat', content, chatInput)))
        .ok,
      false,
    );
  }
  const optional = await compare('chat-response', (module) =>
    module.chatResponse('quick-chat', wrap('fixture') + '<wanxiang_dialogue>[{', {
      dialogueScenes: [{ id: 'later' }],
    }),
  );
  assert.equal(optional.ok, true);
  assert.equal(optional.value.dialogue, undefined);
});

test('creation-request deduplicates scripts, enforces source identity and compiles fixed price', async () => {
  const input = structuredClone(creationInput);
  input.items.push({ ...input.items[0], id: 'ore-2' });
  const built = await compare('creation-request', (module) => module.creationInput(input));
  assert.deepEqual(built.value.scripts, ['fixture-source']);
  assert.deepEqual(
    built.value.items.map((item) => item.scriptIndex),
    [0, 0],
  );
  const planned = await compare('creation-request', (module) =>
    module.creationPlan(input, profileFixture(), countTokens),
  );
  assert.deepEqual(planned.value.batches, [['ore'], ['ore-2']]);
  const output = JSON.stringify({
    schemaVersion: 2,
    items: [
      {
        id: 'ore',
        name: 'fixture',
        description: 'fixture',
        design: { statFocus: ['hp'], rules: [] },
      },
    ],
  });
  const result = await compare('creation-request', (module) =>
    module.creationResponse(output, creationInput.items),
  );
  assert.equal(result.ok, true);
  assert.equal(result.value[0].price, 10);
  for (const invalid of ['{}', '{', output.replace('ore', 'unknown')]) {
    assert.equal(
      (
        await compare('creation-request', (module) =>
          module.creationResponse(invalid, creationInput.items),
        )
      ).ok,
      false,
    );
  }
});

test('encounter-reference derives enemies, slots and custom opening actions from the actual spec', async () => {
  const normal = await compare('encounter-reference', (module) =>
    module.encounterEnemies(0, 'bossGate'),
  );
  assert(normal.value.length > 0);
  const custom = {
    enemyIds: ['fixture-enemy'],
    enemyDefinitions: {
      'fixture-enemy': {
        id: 'fixture-enemy',
        name: 'fixture',
        boss: true,
        openingIntent: { name: 'opening', text: 'opening-text' },
        intents: [{ name: 'normal' }],
        enragedIntents: [{ name: 'enraged' }],
      },
    },
  };
  const result = await compare('encounter-reference', (module) => module.enemiesForSpec(custom));
  assert.equal(result.value[0].boss, true);
  assert.equal(result.value[0].openingAttack, 'opening-text');
  assert.deepEqual(result.value[0].possibleActions, ['opening', 'normal', 'enraged']);
});

test('game-reference reflects low/high design permissions and never exposes exclusive generated buffs', async () => {
  for (const complexity of [1, 6]) {
    const plan = characterGenerationPlan({ ...characterInput, complexity });
    const result = await compare('game-reference', (module) => module.characterGameReference(plan));
    assert.equal(result.ok, true);
    assert.equal(
      Object.keys(result.value.passives.unifiedRules.events).length > 0,
      plan.limits.passiveModes.includes('event'),
    );
    assert(
      !result.value.statuses.some(({ id }) =>
        ['meteor', 'balance', 'sacrifice', 'melody'].includes(id),
      ),
    );
  }
});

test('generation-result shares finite repair, real character/script compilation and diagnostic failures', async () => {
  const repaired = await compare('generation-result', (module) =>
    module.repairJSONText('\uFEFF```json\n{"literal":",}","values":[1,],}\n```'),
  );
  assert.deepEqual(JSON.parse(repaired.value.candidateText), { literal: ',}', values: [1] });
  const character = await compare('generation-result', (module) =>
    module.readGenerationResult('character', JSON.stringify(characterDocument()), {
      ...characterInput,
      purpose: 'protagonist',
    }),
  );
  assert.equal(character.ok, true);
  assert.equal(character.value.entry.combat.limit, 2);
  const script = await compare('generation-result', (module) =>
    module.readGenerationResult('script', JSON.stringify(scriptFixture(['actor'])), {
      party: [{ id: 'actor', name: 'fixture' }],
    }),
  );
  assert.equal(script.ok, true);
  for (const text of ['{', '[]', '{"schemaVersion":999}']) {
    const failure = await compare('generation-result', (module) =>
      module.readGenerationResult('character', text, characterInput),
    );
    assert.equal(failure.ok, false);
    assert(failure.diagnostic.issues.length);
  }
});

test('generation-source only warns for equivalent complete assistant JSON and does not reject it', async () => {
  const messages = [
    { role: 'assistant', content: wrap('{"b":2,"a":1}') },
    { role: 'user', content: '{}' },
  ];
  const copied = await compare('generation-source', (module) =>
    module.generationSourceWarnings('character', '{"a":1,"b":2}', messages),
  );
  assert.equal(copied.value[0].path, 'output.source');
  const different = await compare('generation-source', (module) =>
    module.generationSourceWarnings('character', '{"a":2}', messages),
  );
  assert.deepEqual(different.value, []);
  const invalid = await compare('generation-source', (module) =>
    module.generationSourceWarnings('script', '{', messages),
  );
  assert.deepEqual(invalid.value, []);
});

test('output-envelope preserves JSON literals and distinguishes legacy compatibility from duplicate/missing output', async () => {
  for (const tag of ['wanxiang_output', 'wanxiang_json']) {
    const result = await compare('output-envelope', (module) =>
      module.extractGenerationEnvelope(
        'character',
        `outside<${tag}>{"literal":"</${tag}>"}</${tag}>after`,
      ),
    );
    assert.equal(result.ok, true);
    assert.equal(result.value.envelope.tag, tag);
    assert.equal(result.value.envelope.ignoredCharacters, 12);
  }
  for (const content of [
    '{}',
    wrap(' '),
    wrap('{}') + '<wanxiang_json>{}</wanxiang_json>',
    '<wanxiang_output>{}',
  ]) {
    const result = await compare('output-envelope', (module) =>
      module.extractGenerationEnvelope('script', content),
    );
    assert.equal(result.ok, false);
    assert.equal(result.diagnostic.stage, 'envelope');
  }
});

test('preset-processing keeps reviewed transformations, stop validation and tool selection identical', async () => {
  const source = [{ role: 'user', content: 'fixture' }];
  const kemini = await compare('preset-processing', (module) =>
    module.prepareKeminiTransport(source, { kemini: true }),
  );
  assert.match(kemini.value.outputTool.name, /^emit_complete_response_[a-f0-9]{24}$/u);
  assert.equal(kemini.value.status.kemini, 'enabled');
  const existing = await compare('preset-processing', (module) =>
    module.prepareKeminiTransport(source, { kemini: true }, true),
  );
  assert.equal(existing.value.status.kemini, 'existing-tool');
  assert.equal(existing.value.outputTool, null);
  for (const value of ['["STOP"]', 'STOP', '[""]']) {
    const result = await compare('preset-processing', (module) =>
      module.presetStopStrings({
        reassembly: {
          enabled: true,
          settings: { enable_stop_string: true, stop_string: value },
        },
      }),
    );
    assert.equal(result.ok, value !== '[""]');
  }
  const unknown = await compare('preset-processing', (module) =>
    module.presetProcessing({
      extensions: {
        SPreset: { OutputPreprocessing: { enabled: true, script: 'UNREVIEWED' } },
      },
    }),
  );
  assert.equal(unknown.ok, false);
  const prose = await compare('preset-processing', (module) => {
    const entry = {
      schemaVersion: 3,
      story: ['finishReason: STOP\n<game>fixture</game>'],
      data: { value: 17 },
    };
    module.processGeneratedProse(entry, 'script', { output: 'reborn-2.4' });
    return entry;
  });
  assert.equal(prose.value.data.value, 17);
  assert(!prose.value.story[0].includes('finishReason'));
});

test('prompt-audit warns on invalid editable examples without rewriting the preset', async () => {
  const preset = presetFixture({
    prompts: [
      { identifier: 'old', role: 'system', content: '<game_data>schemaVersion:1' },
      { identifier: 'example', role: 'assistant', content: '{' },
    ],
  });
  const before = structuredClone(preset);
  const result = await compare('prompt-audit', (module) =>
    module.auditPromptPreset('character', preset),
  );
  assert.equal(result.value.length >= 2, true);
  assert.deepEqual(preset, before);
});

test('prompt-processing counts the final processed/tool payload and enforces the real output budget', async () => {
  const messages = [
    { role: 'system', content: 'one' },
    { role: 'system', content: 'two' },
    { role: 'user', content: 'three' },
  ];
  for (const mode of ['none', 'strict', 'merge_tools', 'unknown']) {
    const result = await compare('prompt-processing', (module) =>
      module.processPrompt(messages, mode, ['fixture']),
    );
    assert.equal(result.ok, mode !== 'unknown');
  }
  for (const tokenField of ['max_tokens', 'none']) {
    const result = await compare('prompt-processing', (module) =>
      module.finalizeRequest(
        {
          messages,
          sampling: { maxTokens: 17 },
          transport: { presetProcessing: { kemini: true } },
        },
        profileFixture({ tokenField }),
        countTokens,
      ),
    );
    assert.equal(result.value.tokens.maxOutput, tokenField === 'none' ? 0 : 17);
    assert(result.value.tokens.toolTokens > 0);
    assert.equal(
      result.value.tokens.contentTokens,
      result.value.messages.reduce((sum, row) => sum + row.content.length, 0),
    );
    assert.equal(
      result.value.tokens.totalBudgetEstimate,
      result.value.tokens.inputEstimate + result.value.tokens.maxOutput,
    );
  }
  assert.equal(
    (
      await compare('prompt-processing', (module) =>
        module.finalizeRequest({ messages }, profileFixture({ contextSize: 1 }), countTokens),
      )
    ).ok,
    false,
  );
});

test('prompts adapters match real shared character/script assembly with explicit file dependencies', async () => {
  for (const [kind, input] of [
    ['character', characterInput],
    [
      'script',
      {
        brief: 'fixture',
        party: [{ id: 'actor', name: 'fixture', worldbook: 'fixture' }],
        boss: 'bossGate',
      },
    ],
  ]) {
    const source = presetFixture();
    const options = { readText, countTokens, worldInfo: worldFixture() };
    const result = await compare('prompts', (module) =>
      module.generationRequest(kind, input, source, options),
    );
    assert.equal(result.ok, true);
    assert.equal(result.value.transport.format, 'tagged-json');
    assert.equal(result.value.nextWorldState.step, 1);
    assert(result.value.tokens.inputEstimate > 0);
    const node = mirrors.prompts.node;
    assert.deepEqual(
      await node.generationMessages(kind, input, source),
      (await node.generationRequest(kind, input, source)).messages,
    );
  }
});

test('both prompt adapters honor the explicit reader', async () => {
  const options = { readText: async () => 'READER_SENTINEL' };
  const node = await mirrors.prompts.node.generationRequest(
    'character',
    characterInput,
    presetFixture(),
    options,
  );
  const shared = await mirrors.prompts.shared.generationRequest(
    'character',
    characterInput,
    presetFixture(),
    options,
  );
  assert(node.messages.some((row) => row.content.includes('READER_SENTINEL')));
  assert(shared.messages.some((row) => row.content.includes('READER_SENTINEL')));
});

test('request-tokens includes content, schema, tool and output budgets without mutating messages', async () => {
  const messages = [
    { role: 'user', content: 'abc' },
    { role: 'assistant', content: 'de' },
  ];
  const result = await compare('request-tokens', (module) =>
    module.requestTokenReport(messages, countTokens, { type: 'object' }, 7, {
      tools: [{ type: 'function' }],
    }),
  );
  assert.equal(result.value.contentTokens, 5);
  assert.equal(result.value.overheadEstimate, 9);
  assert(result.value.responseFormatTokens > 0 && result.value.toolTokens > 0);
  assert.equal(result.value.totalBudgetEstimate, result.value.inputEstimate + 7);
  assert.deepEqual(
    messages.map((row) => row.content),
    ['abc', 'de'],
  );
});

test('summary-request old/new signatures, actual batching and ID/JSON validation remain equivalent', async () => {
  for (const options of [false, true]) {
    const result = await compare('summary-request', (module) =>
      options
        ? module.summaryRequest(summaryInput, presetFixture(), {
            profile: profileFixture(),
            countTokens,
            readText,
            worldInfo: worldFixture(),
          })
        : module.summaryRequest(summaryInput, profileFixture(), countTokens, readText),
    );
    assert.equal(result.ok, true);
    assert.equal(result.value.sampling.stream, false);
    assert.equal(result.value.transport.format, 'summary-json');
  }
  const items = [
    ...summaryInput.items,
    { ...summaryInput.items[0], id: 'record-2' },
    { ...summaryInput.items[0], id: 'record-3' },
  ];
  const plan = await compare('summary-request', (module) =>
    module.summaryPlan({ items }, profileFixture({ maxTokens: 1000 }), countTokens, readText),
  );
  assert.deepEqual(
    plan.value.batches.map((batch) => batch.ids),
    [['record', 'record-2'], ['record-3']],
  );
  for (const content of [
    JSON.stringify({ items: [{ id: 'record', summary: 'fixture' }] }),
    '{',
    wrap('{}'),
    '{"items":[]}',
  ]) {
    const result = await compare('summary-request', (module) =>
      module.summaryResponse(content, summaryInput.items),
    );
    assert.equal(result.ok, content.startsWith('{"items":[{'));
  }
});

test('Node summary adapters prioritize the option reader, positional reader, then disk', async () => {
  const { summaryRequest, summaryPlan } = mirrors['summary-request'].node;
  const profile = profileFixture();
  const worldInfo = worldFixture();
  const calls = [];
  function reader(origin) {
    return async (name) => {
      calls.push([origin, name]);
      return name.endsWith('.json') ? JSON.stringify(presetFixture()) : origin;
    };
  }
  const positional = reader('positional');
  const explicit = reader('explicit');
  const legacy = await summaryRequest(summaryInput, profile, countTokens, positional);
  assert(legacy.messages.some((row) => row.content === 'positional'));
  calls.length = 0;
  assert.deepEqual(
    await summaryRequest(summaryInput, profile, countTokens),
    await summaryRequest(summaryInput, profile, countTokens, readText),
  );
  const frameworkFile = 'framework/summary-default.json';
  for (const [invoke, filename] of [
    [
      (fallback, options) =>
        summaryRequest(
          summaryInput,
          null,
          {
            profile,
            countTokens,
            worldInfo,
            ...options,
          },
          fallback,
        ),
      frameworkFile,
    ],
    [
      (fallback, options) => summaryPlan(summaryInput, profile, countTokens, fallback, options),
      'summary.system.md',
    ],
    [
      (fallback, options) =>
        summaryPlan(summaryInput, profile, countTokens, fallback, {
          worldInfo,
          ...options,
        }),
      frameworkFile,
    ],
  ]) {
    await invoke(positional, { readText: explicit });
    assert.deepEqual(calls.splice(0), [['explicit', filename]]);
    await invoke(positional, {});
    assert.deepEqual(calls.splice(0), [['positional', filename]]);
    assert.deepEqual(await invoke(undefined, {}), await invoke(readText, {}));
  }
});

test('runtime default reader actually compiles the same accepted output as Node reader injection', async () => {
  assert.strictEqual(createCharacterReader(), parseCharacterOutput);
  assert.strictEqual(createWorldbookCounter, browserCounter);
  const counter = createWorldbookCounter();
  const staticCount = browserCounter();
  for (const text of ['fixture', '中文🌙', 'fixture'])
    assert.equal(counter(text), staticCount(text));
  const nodePorts = makePipelinePorts({ readText });
  const browserPorts = makePipelinePorts({ readText });
  const node = createAiPipeline({ ...nodePorts, readCharacter: createCharacterReader() });
  const browser = createAiPipeline(browserPorts);
  const input = { ...characterInput, purpose: 'protagonist' };
  const preparedNode = await node.buildRequest('character', input, presetFixture());
  const preparedBrowser = await browser.buildRequest('character', input, presetFixture());
  assert.deepEqual(preparedNode, preparedBrowser);
  const makeJob = (prepared) => ({
    input,
    kind: 'character',
    profile: profileFixture(),
    prepared,
    messages: prepared.messages,
    requestId: 'parity-id',
    requestReport: { id: 'parity-id' },
  });
  const pending = { kind: 'character', nextState: preparedNode.nextWorldState, expectedStep: 0 };
  node.pendingWorldStates.set('parity-id', pending);
  browser.pendingWorldStates.set('parity-id', pending);
  const result = {
    content: wrap(JSON.stringify(characterDocument())),
    usage: { input: 3, output: 5 },
  };
  const nodeResult = await node.acceptResult(makeJob(preparedNode), result);
  const browserResult = await browser.acceptResult(makeJob(preparedBrowser), result);
  assert.deepEqual(stable(nodeResult), stable(browserResult));
  assert.deepEqual(nodePorts.commits, browserPorts.commits);
  assert.equal(nodePorts.commits.length, 1);
  assert.equal(node.pendingWorldStates.size, 0);
  assert.equal(browser.pendingWorldStates.size, 0);
});

test('runtime completion options and final TK use every real kind without allocating a second module graph', async () => {
  const ports = makePipelinePorts({ readText });
  const pipeline = createAiPipeline(ports);
  const inputs = {
    character: characterInput,
    script: { brief: 'fixture', party: [{ id: 'actor', name: 'fixture' }], boss: 'bossGate' },
    chat: chatInput,
    'quick-chat': chatInput,
    summary: summaryInput,
    creation: creationInput,
    map: { brief: 'fixture' },
  };
  for (const [kind, input] of Object.entries(inputs)) {
    const prepared = await pipeline.buildRequest(kind, input, presetFixture());
    assert.equal(
      prepared.tokens.contentTokens,
      prepared.messages.reduce((sum, row) => sum + row.content.length, 0),
      kind,
    );
    const options = pipeline.completionOptions({ kind, input, prepared, models: false });
    assert.equal(options.outputEnvelope, true);
    assert.equal(Boolean(options.responseSchema), ['character', 'script'].includes(kind));
    assert.equal(options.outputProcessing !== null, ['chat', 'quick-chat'].includes(kind));
  }
  assert.equal(ports.commits.length, 0, 'build/preview must not commit');
  assert.equal(pipeline.pendingWorldStates.size, 0);
});

test('chat runtime propagates selected party to the actual worldbook resolver', async () => {
  const ports = makePipelinePorts({ readText });
  const pipeline = createAiPipeline(ports);
  await pipeline.buildRequest('chat', chatInput, presetFixture());
  assert.deepEqual(
    ports.resolves[0].input.party.map((row) => row.id),
    ['actor'],
  );
  const entry = {
    ...newWorldEntry(0),
    constant: true,
    content: 'fixture',
    apiTargets: ['character'],
  };
  const withWorld = createAiPipeline(
    makePipelinePorts({ readText, world: worldFixture({ 0: entry }) }),
  );
  const request = await withWorld.buildRequest('character', characterInput, presetFixture());
  assert(request.worldInfo.report.some((row) => row.active));
});
