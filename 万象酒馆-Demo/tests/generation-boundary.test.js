import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { createBrowserStores } from '../src/ai/browser-stores.js';
import { upgradeGenerationBoundary } from '../src/ai/generation-boundary-upgrade.js';
import { createAiPipeline } from '../src/ai/pipeline/runtime.js';
import { runRegexTasks } from '../server/regex-runtime.mjs';
import { extractGenerationEnvelope } from '../src/ai/pipeline/output-envelope.js';
import { normalizePromptPreset } from '../src/ai/presets.js';
import { worldFixture } from './fixtures/multiverse.js';

const readText = (file) => readFile(new URL('../prompts/' + file, import.meta.url), 'utf8');

function importedPreset() {
  return normalizePromptPreset(
    {
      name: '额外正文回归样本',
      prompts: [
        {
          identifier: 'main',
          role: 'system',
          content:
            '先用日文输出konatan_planning，再续写战斗，使用emit_answer包装正文。{{worldbook}}',
        },
        { identifier: 'chatHistory', marker: true },
        { identifier: 'ending', role: 'assistant', content: 'Master，开始续写！' },
      ],
      prompt_order: [
        {
          character_id: 100001,
          order: [
            { identifier: 'main', enabled: true },
            { identifier: 'chatHistory', enabled: true },
            { identifier: 'ending', enabled: true },
          ],
        },
      ],
    },
    'boundary-fixture',
  ).preset;
}

test('boundary migration appends one scoped editable rule and preserves all existing entries', async () => {
  const content = await readText('worldbook/generation-boundary.md');
  const source = {
    entries: { 4: { uid: 4, content: '玩家原文', disable: true, extensions: { custom: true } } },
  };
  const book = upgradeGenerationBoundary(source, content);
  assert.deepEqual(book.entries[4], source.entries[4]);
  assert.deepEqual(source, { entries: { 4: source.entries[4] } });
  const guard = book.entries[5];
  assert.deepEqual(guard.apiTargets, ['character', 'script', 'map', 'creation']);
  assert.equal(guard.order, 10000);
  assert.equal(guard.depth, 0);
  assert.equal(guard.role, 0);
  assert(guard.ignoreBudget);
  guard.disable = true;
  guard.content += '\n玩家补充';
  assert.deepEqual(upgradeGenerationBoundary(book, content), book);
});

test('server and browser upgrades inject final boundary after imported prose/format in all four generation requests', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/generation-boundary-'));
  const server = await createWorldbookStore(directory);
  const { book } = await server.get('tavern-world');
  const oldBook = structuredClone(book);
  for (const [uid, entry] of Object.entries(oldBook.entries)) {
    if (entry.extensions?.wanxiang?.generationRule === 'generation-boundary-output')
      delete oldBook.entries[uid];
  }
  const values = new Map([['world.book.tavern-world', oldBook]]);
  const database = {
    get: (key) => structuredClone(values.get(key)),
    entries: () => [...values],
    async write(entries) {
      for (const [key, value] of entries) values.set(key, structuredClone(value));
    },
  };
  const browser = await createBrowserStores(database, readText, book);
  assert.equal(values.get('world.generation-boundary.v42'), true);
  const profile = { contextSize: 400000, maxTokens: 32768, promptProcessing: 'merge_tools' };
  const source = importedPreset();
  const originalPreset = structuredClone(source);
  const inputs = {
    character: { brief: '设计旅人', rollId: 'boundary-test' },
    script: {
      brief: '探索遗迹',
      boss: 'bossGate',
      party: [{ id: 'a', name: '旅人', worldbook: '谨慎的旅人' }],
    },
    map: { brief: '潮灯之国' },
    creation: {
      items: [
        {
          id: 'ore',
          name: '凝蜜晶',
          description: '旧物',
          value: 50,
          map: 'forest',
          script: '战斗正要开始。',
        },
      ],
    },
  };
  for (const worlds of [server, browser.worlds]) {
    const pipeline = createAiPipeline({
      worlds,
      settings: { get: () => profile },
      regexStore: { get: () => [] },
      helperStorage: { get: () => ({}) },
      countTokens: (text) => Math.ceil(text.length / 3),
      readText,
      runRegexTasks,
    });
    for (const [kind, input] of Object.entries(inputs)) {
      const request = await pipeline.buildRequest(kind, input, source);
      const all = request.messages.map((message) => message.content).join('\n');
      const boundary = all.lastIndexOf('【数据生成输出边界】');
      assert(boundary >= 0, kind);
      assert.equal(
        all.split('【数据生成输出边界】').length,
        2,
        'worldbook macro must not duplicate or swallow the guard',
      );
      assert(boundary > all.indexOf('Master，开始续写！'));
      assert(all.slice(boundary).includes('不输出konatan_planning、tucao、emit_answer'));
      assert(all.slice(boundary).includes('小说正文只写入story字符串'));
      assert(all.slice(boundary).includes('不得继续该战斗'));
      if (kind === 'creation' || kind === 'map') {
        const value =
          kind === 'map'
            ? worldFixture()
            : {
                schemaVersion: 2,
                items: [
                  {
                    id: 'ore',
                    name: '凝蜜晶',
                    description: '余辉',
                    design: { statFocus: ['hp'], rules: [] },
                  },
                ],
              };
        const content = '<wanxiang_json>' + JSON.stringify(value) + '</wanxiang_json>';
        const result = await pipeline.acceptResult(
          { input, kind, source, profile, prepared: request, requestId: 'boundary-' + kind },
          { content, rawContent: content, usage: {} },
        );
        assert(kind === 'map' ? result.world : result.items.length === 1);
      }
    }
    const chatInput = { text: '你好', place: 'bar', selected: [], characters: [], history: [] };
    const chat = await pipeline.buildRequest('chat', chatInput, source);
    assert(!chat.messages.some((message) => message.content.includes('【数据生成输出边界】')));
  }
  assert.deepEqual(source, originalPreset);
});

test('a prose reply with a fake emit_answer is still rejected instead of silently scanning its JSON', () => {
  const raw =
    'Master，开始规划！\n<konatan_planning~>计划</konatan_planning~>\n<emit_answer>content:\n小说正文\n```json\n{"schemaVersion":2,"items":[]}\n```</emit_answer>';
  assert.throws(
    () => extractGenerationEnvelope('creation', raw),
    (failure) => {
      assert.equal(failure.diagnostic.rawText, raw);
      assert.equal(failure.diagnostic.stage, 'envelope');
      return true;
    },
  );
});
