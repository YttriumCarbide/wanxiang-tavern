import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { newWorldEntry } from '../src/ai/worldbook.js';
import { splitGenerationWorldbook } from '../server/worldbook-generation.mjs';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { generationRequest } from '../server/prompts.mjs';
import { newLibrary } from '../src/ai/library.js';
import { settingOnly } from '../src/ai/contracts.js';
import { createWorldbookCounter } from '../server/character-reader.mjs';

test('legacy character and script presets split into definition anchors, data context and @D output entries', async () => {
  const legacy = {};
  for (const [uid, kind] of ['character', 'script'].entries())
    legacy[uid] = {
      ...newWorldEntry(uid),
      comment: kind === 'character' ? '角色生成 · 设定与数据要求' : '副本剧本 · 事件推进与篇幅',
      content: await readFile(new URL(`../prompts/worldbook/${kind}.md`, import.meta.url), 'utf8'),
      apiTargets: [kind],
    };
  const result = await splitGenerationWorldbook({ name: '迁移测试', entries: legacy });
  const rules = Object.values(result.entries);
  assert.equal(rules.length, 8);
  const player = rules.find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'script-player',
  );
  assert.equal(player.position, 0);
  assert.deepEqual(player.apiTargets, ['script']);
  assert(
    rules
      .filter((entry) => entry.comment.includes('定义') || entry.comment.includes('人物设定'))
      .every((entry) => entry.position === 0),
  );
  assert(
    rules
      .filter(
        (entry) =>
          entry.comment.includes('能力') ||
          entry.comment.includes('事件推进') ||
          entry.comment.includes('历史边界'),
      )
      .every((entry) => entry.position === 1),
  );
  const formats = rules.filter((entry) => entry.comment.includes('JSON输出格式'));
  assert.equal(formats.length, 2);
  for (const entry of formats) {
    assert.deepEqual([entry.position, entry.role, entry.depth, entry.order], [4, 0, 0, 9999]);
    assert(entry.content.includes('{{outputSchema}}'));
    assert.equal(entry.apiTargets.length, 1);
  }
});

test('version 2 migration preserves custom additions, unrelated lore and subsequent @D edits across restarts', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/split-'));
  const store = await createWorldbookStore(directory);
  const content = await readFile(
    new URL('../prompts/worldbook/script.md', import.meta.url),
    'utf8',
  );
  await store.save({
    id: 'tavern-world',
    book: {
      name: '我的世界书',
      entries: {
        0: { ...newWorldEntry(0), comment: '我的背景', content: '不能被覆盖', position: 0 },
        1: {
          ...newWorldEntry(1),
          comment: '副本剧本 · 事件推进与篇幅',
          content: content.trim() + '\n\n我自己追加的要求',
          apiTargets: ['script'],
          position: 4,
        },
      },
    },
  });
  await writeFile(path.join(directory, 'builtin-content.json'), JSON.stringify({ version: 2 }));
  const migrated = await createWorldbookStore(directory);
  const result = await migrated.get('tavern-world');
  assert.equal(result.book.entries[0].content, '不能被覆盖');
  assert(
    Object.values(result.book.entries).some(
      (entry) => entry.content === '我自己追加的要求' && !entry.disable,
    ),
  );
  const output = Object.values(result.book.entries).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'script-output',
  );
  output.depth = 2;
  await migrated.save(result);
  const restarted = await createWorldbookStore(directory);
  assert.equal((await restarted.get('tavern-world')).book.entries[output.uid].depth, 2);
});

test('live requests use visible @D schema once with current IDs and no hidden format appended after it', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/split-request-'));
  const store = await createWorldbookStore(directory);
  const countTokens = createWorldbookCounter();
  for (const kind of ['character', 'script']) {
    const input =
      kind === 'character'
        ? { brief: '一位巡灯术士' }
        : {
            brief: '探索旧渠',
            boss: 'bossGate',
            party: newLibrary().characters.map(settingOnly),
            history: [],
          };
    const request = await generationRequest(kind, input, undefined, {
      worldInfo: await store.resolve(kind, input),
      countTokens,
    });
    const output = request.worldInfo.report.find(
      (entry) => entry.active && entry.title.includes('JSON输出格式 @D'),
    );
    assert(output);
    const expected = kind === 'character' ? 'CHARACTER v4' : 'SCRIPT v4';
    assert(request.messages.at(-1).content.includes(expected));
    assert.equal(
      request.messages.filter((message) => message.content.includes('本次动态JSON Schema')).length,
      1,
    );
    assert(!request.messages.some((message) => message.content.includes('{{outputSchema}}')));
    if (kind === 'script') {
      assert(request.messages.some((message) => message.content.includes(input.party[0].id)));
      assert(request.messages.at(-1).content.includes('story'));
    }
    const book = await store.get('tavern-world');
    const format = Object.values(book.book.entries).find(
      (entry) => entry.extensions?.wanxiang?.generationRule === `${kind}-output`,
    );
    format.disable = true;
    await store.save(book);
    const disabled = await generationRequest(kind, input, undefined, {
      worldInfo: await store.resolve(kind, input),
      countTokens,
    });
    assert(disabled.warnings.some((warning) => warning.includes('输出格式 @D条目未激活')));
    assert(!disabled.messages.some((message) => message.content.includes('本次动态JSON Schema')));
  }
});
