import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizePromptPreset, composePromptPreset, presetSampling } from '../src/ai/presets.js';
import { normalizeWorldbook, newWorldEntry } from '../src/ai/worldbook.js';
import { scanWorldbooks } from '../src/ai/worldbook-scan.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { generationRequest } from '../server/prompts.mjs';
import { settingOnly } from '../src/ai/contracts.js';
import { newLibrary } from '../src/ai/library.js';
import { createPromptStore } from '../server/prompt-store.mjs';
import { createWorldbookCounter } from '../server/character-reader.mjs';
import { injectWorldbookMessages } from '../src/ai/worldbook-scan.js';

test('imported preset metadata and request-local ST macros survive a save/export cycle', () => {
  const raw = {
    name: '社区预设',
    temperature: 0.8,
    extensions: {
      custom: { keep: true },
    },
    prompts: [
      { identifier: 'vars', role: 'system', content: '{{setvar::tone::短句}}{{//说明}}' },
      {
        identifier: 'main',
        role: 'system',
        content: '{{getvar::tone}}。{{char}}进入{{scenario}}。{{random::甲::乙}}',
      },
      { identifier: 'chatHistory', marker: true },
    ],
  };
  const { preset } = normalizePromptPreset(raw, 'imported');
  assert.equal(preset.temperature, 0.8);
  assert.deepEqual(presetSampling(preset), { temperature: 0.8 });
  assert.deepEqual(preset.extensions, raw.extensions);
  const messages = composePromptPreset(
    preset,
    { char: '灯河', scenario: '旧渠', brief: '调查' },
    { chatHistory: [{ role: 'user', content: '继续' }] },
  );
  assert(messages.some((message) => message.content.includes('短句。灯河进入旧渠')));
  assert(!messages.some((message) => message.content.includes('{{')));
  assert.deepEqual(
    normalizePromptPreset(JSON.parse(JSON.stringify(preset)), 'imported').preset,
    preset,
  );
});

test('entry recipients are checked before recursion, probability, budget and time effects', () => {
  const entries = {
    0: {
      ...newWorldEntry(0),
      constant: true,
      content: '秘密触发词',
      apiTargets: ['character'],
      sticky: 2,
    },
    1: {
      ...newWorldEntry(1),
      content: '不得跨API递归激活',
      key: ['秘密触发词'],
      apiTargets: ['script'],
    },
    2: {
      ...newWorldEntry(2),
      constant: true,
      content: '完全关闭',
      apiTargets: [],
      ignoreBudget: true,
    },
    3: {
      ...newWorldEntry(3),
      constant: true,
      content: '双方共享',
      apiTargets: ['character', 'script'],
    },
  };
  for (const kind of ['character', 'script']) {
    const result = scanWorldbooks({
      books: [{ id: 'one', name: '唯一书', entries }],
      settings: {},
      context: { kind, messages: [] },
      countTokens: (text) => text.length,
    });
    assert(result.entries.some((entry) => entry.uid === 3));
    assert(!result.entries.some((entry) => entry.uid === 2 || entry.uid === 1));
    assert.equal(
      result.entries.some((entry) => entry.uid === 0),
      kind === 'character',
    );
    if (kind === 'script') assert(!result.nextState.effects['one:0']);
  }
  assert.throws(() =>
    normalizeWorldbook({ entries: { 0: { ...entries[0], apiTargets: ['unsupported-api'] } } }),
  );
  const imported = normalizeWorldbook({ entries: { 0: { uid: 0, content: '外部条目' } } }).book;
  assert.deepEqual(imported.entries[0].apiTargets, ['character', 'script']);
});

test('one worldbook contains editable generation rules and injects them alongside a third-party preset', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/adapter-'));
  const store = await createWorldbookStore(directory);
  assert.equal((await store.visible()).books.length, 1);
  const book = await store.get('tavern-world');
  const rule = Object.values(book.book.entries).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'script-plot',
  );
  rule.content += '\nWORLD_RULE_EDITED';
  rule.position = 1;
  await store.save(book);
  const again = await createWorldbookStore(directory);
  const input = {
    brief: '探索旧渠',
    boss: 'bossGate',
    party: newLibrary().characters.map(settingOnly),
    history: [],
  };
  const preset = {
    name: '外部文风',
    prompts: [
      { identifier: 'main', role: 'system', content: 'THIRD_PARTY_STYLE。叙述用短句。' },
      { identifier: 'worldInfoAfter', marker: true },
      { identifier: 'chatHistory', marker: true },
    ],
  };
  const request = await generationRequest('script', input, preset, {
    worldInfo: await again.resolve('script', input),
    countTokens: (text) => text.length,
  });
  assert(request.messages.some((message) => message.content.includes('THIRD_PARTY_STYLE')));
  assert(request.messages.some((message) => message.content.includes('WORLD_RULE_EDITED')));
  assert(!request.messages.at(-1).content.includes('WORLD_RULE_EDITED'));
  assert(!request.messages.some((message) => message.content.includes('老舍')));
  const neutral = JSON.parse(
    await readFile(new URL('../prompts/framework/script-default.json', import.meta.url), 'utf8'),
  );
  assert(!JSON.stringify(neutral).includes('1500'));
});

test('definition anchors bracket the actual character block and depth entries preserve all three roles', () => {
  const entries = [
    { ...newWorldEntry(0), content: 'BEFORE', position: 0 },
    { ...newWorldEntry(1), content: 'AFTER', position: 1 },
    ...[0, 1, 2].map((role) => ({
      ...newWorldEntry(role + 2),
      content: `DEPTH-${role}`,
      position: 4,
      depth: 0,
      role,
    })),
  ];
  const messages = injectWorldbookMessages(
    [
      { role: 'system', content: 'STYLE' },
      { role: 'system', content: 'CHARACTER' },
      { role: 'user', content: 'TASK' },
    ],
    entries,
    '',
    { characterText: 'CHARACTER' },
  );
  assert(
    messages.findIndex((message) => message.content === 'BEFORE') <
      messages.findIndex((message) => message.content === 'CHARACTER'),
  );
  assert(
    messages.findIndex((message) => message.content === 'AFTER') >
      messages.findIndex((message) => message.content === 'CHARACTER'),
  );
  for (const [role, name] of ['system', 'user', 'assistant'].entries())
    assert.equal(messages.find((message) => message.content === `DEPTH-${role}`).role, name);
});

test('ST addvar appends prose and arrays while numeric counters remain numeric', () => {
  const raw = {
    prompts: [
      {
        identifier: 'main',
        role: 'system',
        content:
          '{{setvar::style::短句}}{{addvar::style::，少比喻}}{{setvar::count::2}}{{addvar::count::3}}{{setvar::list::[]}}{{addvar::list::甲}}{{getvar::style}} / {{getvar::count}} / {{getvar::list}}',
      },
    ],
  };
  const { preset } = normalizePromptPreset(raw);
  const messages = composePromptPreset(preset, {}, { taskContext: [] });
  assert.equal(messages[0].content, '短句，少比喻 / 5 / ["甲"]');
});

test(
  'the user supplied community preset imports and composes against real game world info',
  { skip: !process.env.TAVERN_PRESET_FIXTURE },
  async (t) => {
    const raw = JSON.parse(await readFile(process.env.TAVERN_PRESET_FIXTURE, 'utf8'));
    const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/community-'));
    const store = await createPromptStore(path.join(directory, 'presets'));
    const saved = await store.save({ preset: raw });
    assert.equal(saved.preset.prompts.length, raw.prompts.length);
    assert(saved.warnings.some((warning) => warning.includes('酒馆助手')));
    const worlds = await createWorldbookStore(path.join(directory, 'worlds'));
    const input = {
      brief: '进入遗迹，沿旧渠查明断流。',
      boss: 'bossGate',
      party: newLibrary().characters.map(settingOnly),
      history: [],
    };
    const request = await generationRequest('script', input, saved.preset, {
      worldInfo: await worlds.resolve('script', input),
      countTokens: createWorldbookCounter(),
    });
    assert(request.messages.some((message) => message.content.includes('长景月汐')));
    assert(request.messages.at(-1).content.includes('SCRIPT v4'));
    assert(
      !request.messages.some((message) =>
        /{{(?:getvar|setvar|addvar|lastUserMessage)::?/i.test(message.content),
      ),
    );
    assert(!request.messages.some((message) => message.content.includes('NaN')));
    t.diagnostic(
      JSON.stringify({
        prompts: saved.preset.prompts.length,
        messages: request.messages.length,
        inputTokens: request.tokens.inputEstimate,
        externalCalls: 0,
      }),
    );
  },
);
