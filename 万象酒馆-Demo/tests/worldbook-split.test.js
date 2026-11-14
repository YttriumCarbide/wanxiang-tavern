import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { newWorldEntry, syncBuiltinWorldbook } from '../src/ai/worldbook.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { generationRequest } from '../server/prompts.mjs';
import { newLibrary } from '../src/ai/library.js';
import { settingOnly } from '../src/ai/contracts.js';
import { createWorldbookCounter } from '../server/character-reader.mjs';

test('legacy character and script presets split into definition anchors, data context and @D output entries', async () => {
  const builtin = JSON.parse(
    await readFile(new URL('../assets/builtin-worldbook.json', import.meta.url), 'utf8'),
  );
  const result = syncBuiltinWorldbook({ name: '迁移测试', entries: {} }, builtin);
  const rules = Object.values(result.entries).filter((entry) =>
    /^(character|script)-/.test(entry.extensions?.wanxiang?.generationRule || ''),
  );
  assert(rules.length >= 6);
  for (const required of [
    'character-output',
    'character-standard',
    'character-protagonist',
    'character-npc',
    'script-definition',
    'script-player',
    'script-plot',
    'script-facts',
    'script-output',
    'script-act-battle',
    'script-act-choice',
    'script-invitation',
    'script-overland',
    'script-invitation-topics',
  ]) {
    assert(
      rules.some((entry) => entry.extensions?.wanxiang?.generationRule === required),
      required,
    );
  }
  const player = rules.find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'script-player',
  );
  assert.equal(player.position, 0);
  assert.deepEqual(player.apiTargets, ['script']);
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
  await store.save({
    id: 'tavern-world',
    book: {
      name: '我的世界书',
      entries: {
        0: { ...newWorldEntry(0), comment: '我的背景', content: '不能被覆盖', position: 0 },
      },
    },
  });
  const migrated = await createWorldbookStore(directory);
  const result = await migrated.get('tavern-world');
  assert.equal(result.book.entries[0].content, '不能被覆盖');
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
    const expected = kind === 'character' ? 'CHARACTER v4' : 'SCRIPT v5';
    assert(request.messages.some((message) => message.content.includes(expected)));
    assert(request.messages.at(-1).content.includes('【数据生成输出边界】'));
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
