import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { scriptOutputSchema } from '../src/ai/script-schema.js';
import { readGenerationResult } from '../server/generation-result.mjs';
import { settingOnly } from '../src/ai/contracts.js';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { normalizeRegexScripts } from '../src/ai/regex.js';
import { generationInput, generationRequest } from '../server/prompts.mjs';
import { formatRegexPresentation } from '../server/regex-presentation.mjs';

const example = async () =>
  JSON.parse(
    await readFile(new URL('../prompts/worldbook/script-example.json', import.meta.url), 'utf8'),
  );

test('novel output accepts five unstructured prose blocks and retains strict metadata validation', async () => {
  const raw = await example();
  raw.story[0] = '风穿过空窗。\n\n' + '水面只有倒影，没有人说话。'.repeat(80);
  raw.story[1] = '“雨停了？”\n“还没有。”';
  const text = JSON.stringify(raw);
  const { entry, diagnostic } = readGenerationResult('script', text, { party: [] });
  assert.deepEqual(entry.story, raw.story);
  assert(!entry.scenes && !entry.opening && !entry.data);
  assert.equal(diagnostic.candidateText, text);
  assert.equal(diagnostic.issues.length, 0);
  assert.deepEqual(Object.keys(scriptOutputSchema().properties), [
    'schemaVersion',
    'story',
    'data',
  ]);
  for (const invalid of [
    raw.story.slice(0, 4),
    [...raw.story, '多一段'],
    [null, ...raw.story.slice(1)],
  ])
    assert.throws(() =>
      readGenerationResult('script', JSON.stringify({ ...raw, story: invalid }), { party: [] }),
    );
  const badData = structuredClone(raw);
  badData.data.nextHook.map = 'unregistered-map';
  assert.throws(() => readGenerationResult('script', JSON.stringify(badData), { party: [] }));
});

test('compiled novel metadata survives a save without wrappers and display regex never edits the source', async () => {
  const raw = await example();
  raw.story[0] = '旧铜灯亮着。\n\n风从门里进来。';
  const { entry } = readGenerationResult('script', JSON.stringify(raw), { party: [] });
  await formatRegexPresentation(
    entry,
    'script',
    normalizeRegexScripts([
      {
        id: 'novel-view',
        scriptName: '只改显示',
        findRegex: '/旧铜灯/g',
        replaceString: '新铜灯',
        placement: [2],
        markdownOnly: true,
        promptOnly: false,
        disabled: false,
      },
    ]),
  );
  assert.equal(entry.story[0], raw.story[0]);
  assert(entry.display.story[0].includes('新铜灯'));
  const library = newLibrary();
  library.scripts.push({
    ...entry,
    party: library.characters.map(settingOnly),
    chapter: 1,
    boss: 'bossGate',
  });
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.equal(restored.scripts.length, 1);
  assert.deepEqual(restored.scripts[0].story, raw.story);
  assert.deepEqual(restored.scripts[0].nextHook, { ...raw.data.nextHook, phase: '起' });
  assert(!restored.scripts[0].data);
});

test('v8 migrates only owned script rules, keeps injection controls and archives old constraints outside requests', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/free-script-'));
  const store = await createWorldbookStore(directory);
  const saved = await store.get('tavern-world');
  const owned = Object.values(saved.book.entries).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'script-plot',
  );
  owned.content = '先交代本趟要完成的具体目标。人物互动只有推动任务才写。用户原备注。';
  owned.position = 4;
  owned.role = 1;
  owned.depth = 2;
  owned.order = 345;
  const uid = Math.max(...Object.keys(saved.book.entries).map(Number)) + 1;
  saved.book.entries[uid] = {
    ...structuredClone(owned),
    uid,
    content: '我自己的文风：使用潮湿的长句。',
    comment: '自定义文风',
    extensions: {},
  };
  await store.save(saved);
  await writeFile(path.join(directory, 'builtin-content.json'), JSON.stringify({ version: 7 }));
  const upgraded = await createWorldbookStore(directory);
  const { book } = await upgraded.get('tavern-world');
  const rule = book.entries[owned.uid];
  assert.deepEqual(
    [rule.position, rule.role, rule.depth, rule.order, rule.apiTargets],
    [4, 1, 2, 345, owned.apiTargets],
  );
  assert(!rule.content.includes('具体目标'));
  const archived = [
    ...Object.values(book.entries),
    ...(book.extensions?.wanxiang?.retiredPromptArchive || []).map((item) => item.entry),
  ].find((entry) => entry.content === owned.content);
  assert(archived.disable && archived.apiTargets.length === 0);
  assert.equal(book.entries[uid].content, saved.book.entries[uid].content);
  const library = newLibrary();
  const input = {
    brief: '让故事逐渐推进，并留下伏笔。',
    boss: 'bossGate',
    chapter: 1,
    party: library.characters.map(settingOnly),
  };
  const preset = {
    name: '自由文风预设',
    prompts: [
      { identifier: 'style', role: 'system', content: '我的预设文风标记：长句与环境描写。' },
      { identifier: 'chatHistory', marker: true, role: 'user' },
    ],
    prompt_order: [
      {
        character_id: 100001,
        order: [
          { identifier: 'style', enabled: true },
          { identifier: 'chatHistory', enabled: true },
        ],
      },
    ],
  };
  const request = await generationRequest('script', input, preset, {
    worldInfo: await upgraded.resolve('script', input),
    countTokens: (text) => text.length,
  });
  const sent = request.messages.map((message) => message.content).join('\n');
  assert(sent.includes('我的预设文风标记'));
  assert(sent.includes('我自己的文风'));
  assert(!sent.includes(owned.content));
  assert(!sent.includes('先交代本趟') && !sent.includes('老舍《断魂枪》'));
  const context = generationInput('script', input);
  assert(!context.outputBudget && context.encounters.every((room) => !room.milestone));
  assert(request.messages.some((message) => message.content.includes('SCRIPT v4')));
  assert(request.messages.at(-1).content.includes('【数据生成输出边界】'));
  const again = await createWorldbookStore(directory);
  assert.deepEqual((await again.get('tavern-world')).book, book);
});

test('legacy six-part saves retain original prose and records but cannot become a new prepared trip', async () => {
  const raw = await example();
  raw.story.push('旧第六场收尾，原文继续保留。');
  const library = newLibrary();
  library.scripts.push({
    ...raw,
    id: 'old-six',
    party: library.characters.map(settingOnly),
    boss: 'bossGate',
    chapter: 1,
  });
  library.prepared = 'old-six';
  library.history.push({ title: '旧旅程', lines: [{ encounter: 5, text: '旧最终场已展示。' }] });
  const restored = restoreLibrary(library);
  assert.deepEqual(restored.scripts[0].story, raw.story);
  assert.deepEqual(restored.history, library.history);
  assert.equal(restored.prepared, null);
  assert.throws(() => readGenerationResult('script', JSON.stringify(raw), { party: [] }));
});
