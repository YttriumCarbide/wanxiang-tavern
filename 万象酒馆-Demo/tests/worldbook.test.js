import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import {
  normalizeWorldbook,
  normalizeWorldSettings,
  newWorldEntry,
  characterWorldEntry,
} from '../src/ai/worldbook.js';
import { scanWorldbooks, injectWorldbookMessages } from '../src/ai/worldbook-scan.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { generationRequest } from '../server/prompts.mjs';
import { requestTokenReport } from '../server/request-tokens.mjs';
import { createWorldbookCounter, createCharacterReader } from '../server/character-reader.mjs';
import { readGenerationResult } from '../server/generation-result.mjs';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { characterDocument, tavernPresetFixture } from './fixtures/ai.js';

const book = (entries) => ({
  id: 'test',
  name: '测试世界',
  entries: Object.fromEntries(
    entries.map((entry, index) => [
      index,
      { ...newWorldEntry(index), content: `正文${index}`, ...entry },
    ]),
  ),
});
const scan = (entries, options = {}) =>
  scanWorldbooks({
    books: [book(entries)],
    settings: { globalSelect: ['test'], budgetCap: 10000 },
    context: { kind: 'character', messages: [{ role: 'user', content: '遗迹 光明 信任' }] },
    countTokens: (text) => text.length,
    ...options,
  });

test('ST books and embedded character books round-trip every field and unknown extensions', () => {
  const source = book([
    {
      key: ['遗迹'],
      keysecondary: ['光明'],
      selectiveLogic: 3,
      position: 4,
      role: 1,
      depth: 2,
      probability: 45,
      sticky: 3,
      cooldown: 2,
      delay: 1,
      group: 'a,b',
      groupOverride: true,
      groupWeight: 123,
      matchCharacterDescription: true,
      characterFilter: { names: ['甲'], tags: ['伙伴'], isExclude: false },
      extensions: { test: { preserve: true } },
    },
  ]);
  const normalized = normalizeWorldbook(source).book;
  assert.deepEqual(normalizeWorldbook(JSON.parse(JSON.stringify(normalized))).book, normalized);
  assert.deepEqual(normalized.entries[0].extensions.test, source.entries[0].extensions.test);
  assert.deepEqual(normalized.entries[0].extensions.wanxiang.apiTargets, ['character', 'script']);
  const embedded = normalizeWorldbook({
    character_book: {
      name: '内嵌',
      entries: [
        {
          keys: ['林地'],
          secondary_keys: ['露营'],
          content: '有一处营地',
          enabled: true,
          insertion_order: 200,
          position: 'after_char',
          extensions: {
            position: 4,
            depth: 3,
            match_character_description: true,
            ignore_budget: true,
          },
        },
      ],
    },
  }).book;
  assert.equal(embedded.entries[0].position, 4);
  assert.equal(embedded.entries[0].depth, 3);
  assert.equal(embedded.entries[0].matchCharacterDescription, true);
  assert.equal(embedded.entries[0].ignoreBudget, true);
  assert.throws(() => normalizeWorldbook({ entries: { 1: { uid: 1, position: 99 } } }), /位置/);
});

test('keyword, regex, all four secondary logics and field overrides activate correctly', () => {
  const result = scan(
    [
      { key: ['遗迹'], keysecondary: ['光明'], selectiveLogic: 0 },
      { key: ['遗迹'], keysecondary: ['光明', '未出现'], selectiveLogic: 1 },
      { key: ['遗迹'], keysecondary: ['未出现'], selectiveLogic: 2 },
      { key: ['遗迹'], keysecondary: ['光明', '信任'], selectiveLogic: 3 },
      { key: ['/遗.\\s光明/u'] },
      { key: ['TRUST'], caseSensitive: true },
      { key: ['小遗迹'], matchCharacterDescription: true },
    ],
    {
      context: {
        kind: 'character',
        characters: '小遗迹的来客',
        messages: [{ content: '遗迹 光明 信任 trust' }],
      },
    },
  );
  assert.deepEqual(
    result.entries.map((entry) => entry.uid),
    [0, 1, 2, 3, 4, 6],
  );
  const words = scan(
    [
      { key: ['cat'], matchWholeWords: true },
      { key: ['cat'], matchWholeWords: false },
    ],
    { context: { messages: [{ content: 'concatenate' }] } },
  );
  assert.deepEqual(
    words.entries.map((entry) => entry.uid),
    [1],
  );
});

test('recursion, group exclusion, probability and budget restrictions report explicit reasons', () => {
  const result = scan(
    [
      {
        constant: true,
        content: '初始触发词',
        order: 300,
        group: 'exclusive',
        groupOverride: true,
      },
      { constant: true, content: '不会入选', order: 100, group: 'exclusive' },
      { key: ['初始触发词'], content: '递归内容', delayUntilRecursion: 1 },
      { constant: true, probability: 0 },
      { constant: true, content: 'x'.repeat(100), order: 0 },
    ],
    { settings: { globalSelect: ['test'], recursive: true, budgetCap: 30 } },
  );
  assert(result.entries.some((entry) => entry.uid === 2));
  assert(!result.entries.some((entry) => [1, 3, 4].includes(entry.uid)));
  assert(result.report.find((entry) => entry.uid === 1).reason.includes('互斥'));
  assert(result.report.find((entry) => entry.uid === 3).reason.includes('概率'));
  assert(result.report.find((entry) => entry.uid === 4).reason.includes('预算'));
  const prevented = scan([
    { constant: true, content: '递归词', preventRecursion: true },
    { key: ['递归词'] },
  ]);
  assert.equal(prevented.entries.length, 1);
});

test('dry previews share probability and timed state; sticky/cooldown/delay advance only on committed generations', () => {
  const entries = [
    { key: ['遗迹'], sticky: 2, cooldown: 1 },
    { constant: true, delay: 2 },
  ];
  const first = scan(entries);
  assert.deepEqual(scan(entries), first);
  const second = scan(entries, {
    state: first.nextState,
    context: { kind: 'character', messages: [{ content: '不再匹配' }] },
  });
  assert(second.entries.some((entry) => entry.uid === 0));
  const third = scan(entries, { state: second.nextState });
  assert(!third.entries.some((entry) => entry.uid === 0));
  assert(third.entries.some((entry) => entry.uid === 1));
  const fourth = scan(entries, { state: third.nextState });
  assert(fourth.entries.some((entry) => entry.uid === 0));
});

test('all eight anchors are placed once, outlets expand only where requested, and final schema stays last', async () => {
  const source = tavernPresetFixture();
  source.prompts[0].content = '世界出口：{{outlet::map}}';
  const world = book(
    Array.from({ length: 8 }, (_, position) => ({
      constant: true,
      position,
      outletName: position === 7 ? 'map' : '',
      content: `ANCHOR_${position}`,
      depth: 0,
    })),
  );
  world.entries[8] = {
    ...newWorldEntry(8),
    constant: true,
    ignoreBudget: true,
    preventRecursion: true,
    position: 4,
    depth: 0,
    order: 9999,
    content: 'CHARACTER v3 JSON Schema：{{outputSchema}}',
    extensions: { wanxiang: { generationRule: 'character-output' } },
  };
  const countTokens = createWorldbookCounter();
  const request = await generationRequest('character', { brief: '角色生成' }, source, {
    worldInfo: { books: [world], settings: { globalSelect: ['test'] }, state: {} },
    countTokens,
    maxOutput: 32768,
  });
  for (let position = 0; position < 8; position++)
    assert.equal(
      request.messages
        .map((message) => message.content)
        .join('\n')
        .split(`ANCHOR_${position}`).length - 1,
      1,
    );
  assert(request.messages.at(-1).content.includes('CHARACTER v3'));
  assert.equal(
    request.tokens.contentTokens,
    request.messages.reduce((sum, message) => sum + countTokens(message.content), 0),
  );
  assert(request.warnings.some((warning) => warning.includes('不是完整JSON')));
  const placed = injectWorldbookMessages(
    [{ role: 'user', content: '{"task":"x"}' }],
    [{ position: 4, depth: 0, role: 2, content: '深度注入' }],
  );
  assert.equal(placed.at(-1).role, 'assistant');
});

test('worldbook CRUD, bindings and timer state survive restart without changing source application data', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/worldbook-'));
  const store = await createWorldbookStore(directory);
  const imported = await store.save({ book: book([{ constant: true, content: '可编辑世界' }]) });
  const settings = normalizeWorldSettings({
    globalSelect: [],
    script: [imported.id],
    bindings: { 'hero-a': [imported.id] },
  });
  await store.configure(settings);
  assert.equal((await store.resolve('character', {})).books.length, 0);
  assert.equal((await store.resolve('script', {})).books[0].id, imported.id);
  assert.equal(
    (await store.resolve('character', { party: [{ id: 'hero-a' }] })).books[0].id,
    imported.id,
  );
  assert(await store.commit('character', { step: 1, effects: {} }, 0));
  assert.equal(await store.commit('character', { step: 2, effects: {} }, 0), false);
  const restored = await createWorldbookStore(directory);
  assert.equal((await restored.resolve('character', {})).state.step, 1);
  await restored.delete(imported.id);
  assert.deepEqual((await restored.visible()).settings.script, []);
  await restored.delete('tavern-canon');
  await restored.delete('tavern-bestiary');
  await restored.delete('tavern-world');
  assert.equal((await (await createWorldbookStore(directory)).list()).length, 0);
});

test('design notes do not reject valid characters, while missing design and unknown executable data remain invalid', () => {
  const raw = characterDocument();
  raw.setting.profession.description_note = '这是辅助备注，不是角色正文';
  const text = JSON.stringify(raw);
  const result = readGenerationResult('character', text, {}, createCharacterReader());
  assert.equal(result.diagnostic.rawText, text);
  assert(
    result.diagnostic.repairs.some(
      (repair) => repair.path === 'character.setting.profession.description_note',
    ),
  );
  assert(!result.entry.setting.worldbook.includes('辅助备注'));
  const missing = structuredClone(raw);
  delete missing.setting.profession.description;
  assert.throws(
    () => readGenerationResult('character', JSON.stringify(missing), {}, createCharacterReader()),
    /description/,
  );
  raw.data.addExtraAction = true;
  assert.throws(
    () => readGenerationResult('character', JSON.stringify(raw), {}, createCharacterReader()),
    /addExtraAction/,
  );
});

test('token reports separate content, estimated protocol/schema overhead and output allowance; official lore edits restore independently', () => {
  const count = createWorldbookCounter();
  const messages = [
    { role: 'system', content: '规则' },
    { role: 'user', content: '遗迹冒险' },
  ];
  const report = requestTokenReport(messages, count, { type: 'object' }, 32768);
  assert.equal(report.contentTokens, count('规则') + count('遗迹冒险'));
  assert.equal(
    report.inputEstimate,
    report.contentTokens + report.overheadEstimate + report.responseFormatTokens,
  );
  assert.equal(report.totalBudgetEstimate, report.inputEstimate + 32768);
  const library = newLibrary();
  const originalCombat = structuredClone(library.characters[0].combat);
  library.characters[0].setting.worldbook = '玩家编辑的人物设定。';
  library.characters[0].setting.edited = true;
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.equal(restored.characters[0].setting.worldbook, '玩家编辑的人物设定。');
  assert.deepEqual(restored.characters[0].combat, originalCombat);
});

test('character worldbook entries conform to specification and are triggered during script requests', async () => {
  const dummyChar = {
    id: 'character-test-1',
    setting: {
      name: '测试勇者',
      worldbook: '姓名：测试勇者\n\n职业：剑士\n\n经历：来自异界的旅行者。',
    },
  };
  const entry = characterWorldEntry(dummyChar, 42);
  assert.equal(entry.comment, '人物详情：测试勇者');
  assert.equal(entry.constant, false); // 绿灯
  assert.equal(entry.position, 1); // 角色定义之后
  assert.equal(entry.order, 100);
  assert.equal(entry.probability, 100);
  assert.deepEqual(entry.key, ['测试勇者']);
  assert.equal(entry.content, dummyChar.setting.worldbook);
  assert.equal(entry.excludeRecursion, true);
  assert.equal(entry.preventRecursion, true);
  assert.equal(entry.disable, false);

  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/char-wi-'));
  const store = await createWorldbookStore(directory);
  const library = newLibrary();
  const input = {
    brief: '准备启程踏入暗影沼泽',
    boss: 'bossGate',
    party: library.characters.map((item) => ({
      id: item.id,
      name: item.setting.name,
      title: item.setting.title,
      worldbook: item.setting.worldbook,
    })),
    history: [],
  };
  const preset = {
    name: '剧本测试预设',
    prompts: [
      { identifier: 'main', role: 'system', content: '故事预设。' },
      { identifier: 'worldInfoAfter', marker: true },
      { identifier: 'charDescription', marker: true },
      { identifier: 'chatHistory', marker: true },
    ],
    prompt_order: [
      {
        character_id: 100001,
        order: [
          { identifier: 'main', enabled: true },
          { identifier: 'charDescription', enabled: true },
          { identifier: 'worldInfoAfter', enabled: true },
          { identifier: 'chatHistory', enabled: true },
        ],
      },
    ],
  };
  const request = await generationRequest('script', input, preset, {
    worldInfo: await store.resolve('script', input),
    countTokens: (text) => text.length,
  });
  // 验证出场六名角色的关键词全部被触发，世界书条目全部作为 position 1 (worldInfoAfter) 发出
  for (const member of input.party) {
    assert(
      request.messages.some(
        (msg) => msg.content.includes(member.name) && msg.content.includes('技能动作描写'),
      ),
      `出场角色 ${member.name} 的世界书条目应被触发并发送`,
    );
  }
});
