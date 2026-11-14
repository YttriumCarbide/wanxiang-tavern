import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  normalizeWorldbook,
  normalizeWorldSettings,
  newWorldEntry,
  characterWorldEntry,
  syncBuiltinWorldbook,
} from '../src/ai/worldbook.js';
import { scanWorldbooks, injectWorldbookMessages } from '../src/ai/worldbook-scan.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { generationRequest } from '../server/prompts.mjs';
import { requestTokenReport } from '../server/request-tokens.mjs';
import { createWorldbookCounter, createCharacterReader } from '../server/character-reader.mjs';
import { readGenerationResult } from '../server/generation-result.mjs';
import { UNIVERSAL_ENEMIES, UNIVERSAL_BOSSES } from '../src/content/universal-adversaries.js';
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

test('output tag migration updates owned prompt rules and preserves user entries', async () => {
  const builtin = JSON.parse(
    await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
  );
  const source = book([
    {
      extensions: { wanxiang: { generationRule: 'script-output' } },
      content: '格式 <wanxiang_json>{}</wanxiang_json> 与 <wanxiang_chat>正文</wanxiang_chat>',
    },
    { comment: '我的格式补充', content: '请保留 <wanxiang_chat>原样</wanxiang_chat>' },
  ]);
  const upgraded = syncBuiltinWorldbook(source, builtin);
  assert.match(upgraded.entries[0].content, /<wanxiang_output>/u);
  assert.equal(upgraded.entries[1].content, source.entries[1].content);
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

test('worldbook targets use the six current APIs and map legacy quick-chat to chat', () => {
  const normalized = normalizeWorldbook({
    entries: {
      0: { uid: 0, apiTargets: ['script', 'quick-chat', 'chat', 'summary'], content: '怪物设定' },
    },
  }).book;
  assert.deepEqual(normalized.entries[0].apiTargets, ['script', 'chat', 'summary']);
  assert.deepEqual(normalized.entries[0].extensions.wanxiang.apiTargets, [
    'script',
    'chat',
    'summary',
  ]);
  assert.throws(() =>
    normalizeWorldbook({ entries: { 0: { uid: 0, apiTargets: ['quick-chat-old'] } } }),
  );
  const quickChatScan = scan(
    [
      {
        key: ['怪物名'],
        content: '被聊天提及的怪物设定',
        apiTargets: ['chat'],
      },
    ],
    { context: { kind: 'quick-chat', messages: [{ role: 'user', content: '怪物名' }] } },
  );
  assert.equal(quickChatScan.entries[0].content, '被聊天提及的怪物设定');
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
  await restored.delete('tavern-world');
  assert.equal((await (await createWorldbookStore(directory)).list()).length, 0);
});

test('monster lore is split into named script/chat entries and game rules are removed', async () => {
  const builtin = JSON.parse(
    await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
  );
  const result = syncBuiltinWorldbook({ entries: {} }, builtin);
  const entries = Object.values(result.entries).filter(
    (entry) => entry.extensions?.wanxiang?.monsterId,
  );
  assert(entries.length >= UNIVERSAL_ENEMIES.length + UNIVERSAL_BOSSES.length + 1);
  assert(!Object.values(result.entries).some((entry) => /通用敌人库/.test(entry.comment || '')));
  for (const entry of entries) {
    assert.equal(entry.comment, '怪物图鉴：' + entry.key[1]);
    assert.deepEqual(entry.key, [entry.extensions.wanxiang.monsterId, entry.key[1]]);
    assert.deepEqual(entry.apiTargets, ['script', 'chat']);
    assert(!/速度均为|行动顺序|必须全部击败|替代旧数字/.test(entry.content));
  }
});

test('design notes do not reject valid characters, while missing design and unknown executable data remain invalid', () => {
  const raw = characterDocument();
  raw.setting.attack.description_note = '这是辅助备注，不是角色正文';
  const text = JSON.stringify(raw);
  const result = readGenerationResult('character', text, {}, createCharacterReader());
  assert.equal(result.diagnostic.rawText, text);
  assert(
    result.diagnostic.repairs.some(
      (repair) => repair.path === 'character.setting.attack.description_note',
    ),
  );
  assert(!result.entry.setting.worldbook.includes('辅助备注'));
  const missing = structuredClone(raw);
  delete missing.setting.attack.description;
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
  assert.equal(entry.comment, 'ai角色条目：测试勇者');
  assert.deepEqual(entry.apiTargets, ['script', 'chat']);
  assert.equal(entry.constant, false); // 绿灯
  assert.equal(entry.position, 1); // 角色定义之后
  assert.equal(entry.order, 100);
  assert.equal(entry.probability, 100);
  assert.deepEqual(entry.key, ['character-test-1', '测试勇者']);
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

test('character entries use three dialogue purposes and separate protagonist, generated and recruitable categories', async () => {
  const { classifyCharacterEntry, characterEntryCategory } = await import('../src/ai/worldbook.js');
  const entries = [
    characterWorldEntry(
      {
        id: 'character-player',
        source: 'generated',
        setting: { name: '玩家', worldbook: '玩家资料' },
      },
      0,
      'character-player',
    ),
    characterWorldEntry(
      {
        id: 'character-new',
        source: 'generated',
        setting: { name: '新客', worldbook: 'AI角色资料' },
      },
      1,
    ),
    characterWorldEntry(
      {
        id: 'official-aegis',
        source: 'official',
        setting: { name: '长景月汐', worldbook: '攻击方式｜月闪：挥剑。' },
      },
      2,
    ),
  ];
  assert.deepEqual(
    entries.map((entry) => entry.comment),
    ['主角设定：玩家', 'ai角色条目：新客', '角色条目：长景月汐'],
  );
  for (const entry of entries) assert.deepEqual(entry.apiTargets, ['script', 'chat']);
  assert.deepEqual(entries.map(characterEntryCategory), [
    'protagonist',
    'ai-character',
    'character',
  ]);
  const classified = classifyCharacterEntry(
    {
      ...entries[1],
      comment: '人物详情：新客',
      apiTargets: ['character', 'script'],
      order: 456,
      content: '玩家编辑过的设定',
    },
    { id: 'character-new', source: 'generated', setting: { name: '新客' } },
  );
  assert.equal(classified.comment, 'ai角色条目：新客');
  assert.equal(classified.order, 456);
  assert.equal(classified.content, '玩家编辑过的设定');
  assert.deepEqual(classified.apiTargets, ['script', 'chat']);
  assert.equal(
    classifyCharacterEntry(
      entries[1],
      { id: 'character-new', source: 'generated', setting: { name: '新客' } },
      'character-new',
    ).comment,
    '主角设定：新客',
  );
});

test('all builtin character and official NPC entries include IDs in keys and trigger modular rules via ID combinations', async () => {
  const { buildTriggerIds } = await import('../src/ai/worldbook-triggers.js');
  const { syncSummaryWorldbook, syncArchivedNpcEntries } =
    await import('../src/ai/journey-memory-worldbook.js');
  const builtin = JSON.parse(
    await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
  );
  for (const entry of Object.values(builtin.entries)) {
    const w = entry.extensions?.wanxiang;
    if (w?.characterId) assert(entry.key.includes(w.characterId), entry.comment);
    if (w?.officialNpcId) {
      assert(entry.key.includes(w.officialNpcId), entry.comment);
      assert(entry.apiTargets.includes('chat'), entry.comment);
    }
  }
  assert.deepEqual(
    new Set(
      buildTriggerIds('script', {
        invitation: { activity: 'walk', stageCount: 3 },
        party: [{ id: 'official-edith', name: '伊蒂丝' }],
      }),
    ),
    new Set(['official-edith', 'script:gal', 'script:invitation', 'script:invitation-acts-3']),
  );
  assert(
    buildTriggerIds('summary', {
      items: [
        { id: 's1', kind: 'chat' },
        { id: 's2', kind: 'invitation' },
        { id: 's3', kind: 'dungeon' },
        { id: 's4', kind: 'overland' },
      ],
    }).every((id) =>
      ['summary:chat', 'summary:invitation', 'summary:dungeon', 'summary:overland'].includes(id),
    ),
  );
  const library = newLibrary();
  library.archives.npcs = [
    { id: 'npc-gray', name: '灰伯', content: '港口老钟表匠。', recent: true },
    { id: 'official-edith', name: '伊蒂丝', content: '重复测试' },
  ];
  library.summaryWorldbook = {
    id: 'tavern-summary',
    name: '总结世界书',
    entries: {
      99: {
        comment: 'NPC角色条目：灰伯',
        content: '旧摘要NPC',
        key: ['灰伯'],
        extensions: { wanxiang: { archivedNpcId: 'npc-gray' } },
      },
    },
    extensions: { sources: { 'npc:npc-gray': { uid: 99 } } },
  };
  const summaryBook = syncSummaryWorldbook(library, []);
  assert.equal(
    Object.values(summaryBook.entries).some((entry) => /NPC角色条目/.test(entry.comment)),
    false,
  );
  const mainBook = {
    id: 'tavern-world',
    name: '万象酒馆世界书',
    entries: structuredClone(builtin.entries),
  };
  assert.equal(syncArchivedNpcEntries(mainBook, library.archives.npcs), true);
  const npcEntries = Object.values(mainBook.entries).filter(
    (entry) => entry.extensions?.wanxiang?.archivedNpcId,
  );
  assert.equal(npcEntries.length, 1);
  assert.deepEqual(npcEntries[0].key, ['npc-gray', '灰伯']);
});

test('shared combat encyclopedia targets only design APIs, prunes obsolete EX entries, and blocks exclusive buffs', async () => {
  const { characterGameReference } = await import('../src/ai/pipeline/game-reference.js');
  const { characterOutputSchema } = await import('../src/ai/character-schema.js');
  const { compileCharacterDesign, characterGenerationPlan } =
    await import('../src/character-generation.js');
  const { compileEquipmentDesign } = await import('../src/equipment-generation.js');
  const { normalizeEnemy } = await import('../src/worlds.js');
  const { worldFixture } = await import('./fixtures/multiverse.js');
  const builtin = JSON.parse(
    await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
  );
  const obsoleteBook = {
    id: 'tavern-world',
    entries: {
      901: {
        uid: 901,
        content: '旧以太',
        extensions: { wanxiang: { currencyRule: 'ether' } },
      },
      902: {
        uid: 902,
        content: '旧词典',
        extensions: { wanxiang: { generationRule: 'status-emblems' } },
      },
      903: {
        uid: 903,
        content: '旧休整',
        extensions: { wanxiang: { generationRule: 'battle-balance' } },
      },
      904: {
        uid: 904,
        content: '旧状态',
        extensions: { wanxiang: { generationRule: 'town-guest-statuses' } },
      },
    },
  };
  const synced = syncBuiltinWorldbook(obsoleteBook, builtin);
  for (const uid of [901, 902, 903, 904]) assert.equal(synced.entries[uid], undefined);
  const encyclopedia = Object.values(synced.entries).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'combat-encyclopedia',
  );
  assert(encyclopedia);
  assert.equal(encyclopedia.constant, true);
  assert.deepEqual(encyclopedia.apiTargets, ['character', 'map', 'creation']);

  const hasEncyclopedia = (kind) =>
    scanWorldbooks({
      books: [synced],
      settings: normalizeWorldSettings({ globalSelect: [synced.id] }),
      context: { kind, messages: [{ role: 'user', content: '测试' }] },
      countTokens: (text) => text.length,
    }).entries.some(
      (entry) => entry.extensions?.wanxiang?.generationRule === 'combat-encyclopedia',
    );

  for (const kind of ['character', 'map', 'creation']) assert.equal(hasEncyclopedia(kind), true);
  for (const kind of ['script', 'chat', 'summary']) assert.equal(hasEncyclopedia(kind), false);

  const refIds = characterGameReference().statuses.map((item) => item.id);
  for (const exclusive of ['meteor', 'balance', 'sacrifice']) assert(!refIds.includes(exclusive));
  const schemaText = JSON.stringify(
    characterOutputSchema({ plan: characterGenerationPlan({ complexity: 4 }) }),
  );
  for (const exclusive of ['meteor', 'balance', 'sacrifice'])
    assert(!schemaText.includes(`"${exclusive}"`));

  for (const exclusive of ['meteor', 'balance', 'sacrifice']) {
    assert.throws(() =>
      compileCharacterDesign({
        schemaVersion: 4,
        setting: {
          name: '试作员',
          gender: '女',
          appearance: '短发。',
          personality: '冷静。',
          history: '来自港口的测绘员。',
          attack: { name: '轻击', description: '攻击' },
          skills: [
            { name: '试作一', description: '造成伤害' },
            { name: '试作二', description: '赋予状态' },
          ],
          entrySkill: { name: '入场', description: '入场技' },
        },
        data: {
          archetype: 'lyria',
          weapon: 'sword',
          profile: 'balanced',
          skills: [
            {
              kind: 'active',
              ap: 1,
              cost: 'low',
              target: 'enemy',
              effects: [{ type: 'damage', power: 'standard' }],
            },
            {
              kind: 'active',
              ap: 1,
              cost: 'standard',
              target: 'self',
              effects: [{ type: 'buff', buff: exclusive, power: 'low' }],
            },
          ],
          entrySkill: { target: 'opposite', effects: [{ type: 'damage', power: 'low' }] },
        },
      }),
    );
    assert.throws(() =>
      compileEquipmentDesign(
        {
          design: {
            statFocus: ['hp'],
            rules: [
              {
                mode: 'event',
                event: 'battleStart',
                target: 'self',
                conditions: [],
                effects: [{ type: 'buff', buff: exclusive, power: 'low' }],
              },
            ],
          },
        },
        { id: 'eq', name: '测试器', description: '测试', value: 120 },
      ),
    );
    const enemy = {
      ...structuredClone(worldFixture().enemies[0]),
      id: `enemy-ex-${exclusive}`,
      intents: [
        {
          name: '越界',
          text: '专属状态',
          slots: [0],
          effects: [{ type: 'buff', buff: exclusive, value: 1, target: 'self' }],
        },
      ],
    };
    assert.throws(() => normalizeEnemy(enemy), /敌人状态无效/);
  }
});
