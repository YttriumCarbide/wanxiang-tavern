import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  extractGenerationEnvelope,
  OUTPUT_OPEN,
  OUTPUT_CLOSE,
} from '../server/output-envelope.mjs';
import { readGenerationResult } from '../server/generation-result.mjs';
import { generationSourceWarnings } from '../server/generation-source.mjs';
import { createCharacterReader } from '../server/character-reader.mjs';
import { createAiApi } from '../server/ai-api.mjs';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { newLibrary } from '../src/ai/library.js';
import { settingOnly } from '../src/ai/contracts.js';
import { characterResponse, scriptFixture, compactCharacterDocument } from './fixtures/ai.js';

const wrap = (json) => `${OUTPUT_OPEN}\n${json}\n${OUTPUT_CLOSE}`;

test('only the tagged payload becomes character or script data, regardless of outside wrappers and JSON', () => {
  const read = createCharacterReader();
  const party = newLibrary().characters.map(settingOnly);
  for (const [kind, json] of [
    ['character', characterResponse()],
    ['script', JSON.stringify(scriptFixture(party.map((entry) => entry.id)))],
  ]) {
    const prefix = '<think>非结果文本 {"data":{"hp":999}}</think>\n<analysis>其他文字</analysis>\n';
    const suffix = '\n```json\n{"not":"the result"}\n```';
    const raw = prefix + wrap(json) + suffix;
    const extracted = extractGenerationEnvelope(kind, raw);
    assert.equal(extracted.candidateText.trim(), json);
    assert.equal(extracted.envelope.ignoredCharacters, prefix.length + suffix.length);
    const result = readGenerationResult(kind, extracted.candidateText, { party }, read);
    assert.equal(result.diagnostic.stage, 'complete');
    assert(!JSON.stringify(result.entry).includes('非结果文本'));
  }
  const literal = {
    text: '引号"、反斜杠\\、<wanxiang_json>与</wanxiang_json>只是字符串',
    next: true,
  };
  const extracted = extractGenerationEnvelope('character', wrap(JSON.stringify(literal)));
  assert.deepEqual(JSON.parse(extracted.candidateText), literal);
});

test('missing, incomplete, empty, nested and ambiguous envelopes fail instead of scanning arbitrary braces', () => {
  for (const raw of [
    characterResponse(),
    '<json>{"ok":true}</json>',
    OUTPUT_OPEN + '{"ok":true}',
    OUTPUT_OPEN + '"unterminated' + OUTPUT_CLOSE,
    wrap(' \n '),
    wrap(wrap('{}')),
    wrap('{}') + wrap('{}'),
    wrap('{}') + OUTPUT_CLOSE,
  ])
    assert.throws(
      () => extractGenerationEnvelope('character', raw),
      (failure) => {
        assert.equal(failure.diagnostic.rawText, raw);
        assert.equal(failure.diagnostic.candidateText, '');
        assert.equal(failure.diagnostic.stage, 'envelope');
        assert.equal(failure.diagnostic.issues[0].path, 'output.envelope');
        return true;
      },
    );
});

test('reasoning and inline protocol references do not count as actual result envelopes', () => {
  const json = characterResponse();
  const planning = `<konatan_planning~>\nJSONは\`${OUTPUT_OPEN}\`内に出力。\n${wrap('{"example":true}')}\n</konatan_planning~>`;
  const references = `\n说明：\`${OUTPUT_OPEN}\` 和 \`${OUTPUT_CLOSE}\` 是边界。\n`;
  const suffix = `\n<analysis>标签自查：${OUTPUT_OPEN}</analysis>`;
  const raw = planning + references + wrap(json) + suffix;
  const result = extractGenerationEnvelope('character', raw);
  assert.equal(result.candidateText.trim(), json);
  assert.equal(
    result.envelope.ignoredCharacters,
    planning.length + references.length + suffix.length,
  );
  assert.throws(() => extractGenerationEnvelope('character', planning + references));
  assert.throws(() => extractGenerationEnvelope('character', planning + wrap(wrap(json))));
  assert.throws(() => extractGenerationEnvelope('character', planning + wrap(json) + wrap(json)));
  assert.throws(() =>
    extractGenerationEnvelope('character', wrap('{"text":"<think>"}') + wrap(json)),
  );
});

test('safe JSON repairs still operate inside the envelope without changing string values', () => {
  const json = characterResponse();
  const extracted = extractGenerationEnvelope(
    'character',
    '<analysis>{broken}</analysis>' + wrap('```json\n' + json.slice(0, -1) + ',}\n```'),
  );
  const result = readGenerationResult(
    'character',
    extracted.candidateText,
    {},
    createCharacterReader(),
  );
  assert.equal(result.diagnostic.candidateText, json);
  assert.equal(result.entry.combat.hp, 50);
  assert(result.diagnostic.repairs.some((repair) => repair.message.includes('逗号')));
});

test('both actual generation routes use tagged JSON, local validation and matching request previews', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/envelope-api-'));
  const party = newLibrary().characters.map(settingOnly);
  const calls = [];
  let output = '';
  const api = await createAiApi({
    root: process.cwd(),
    port: 0,
    settingsFile: path.join(directory, 'config.json'),
    promptsDirectory: path.join(directory, 'prompts'),
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      return Response.json({
        choices: [
          { finish_reason: 'stop', message: { content: output, reasoning_content: '忽略此字段' } },
        ],
      });
    },
  });
  const server = createServer((req, res) => void api(req, res, req.url));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const post = async (route, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ai/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    for (const kind of ['character', 'script']) {
      assert.equal(
        (
          await post('config', {
            kind,
            baseUrl: 'https://example.com/v1',
            model: 'mock',
            tokenField: 'max_tokens',
            jsonMode: true,
            strictJson: true,
          })
        ).status,
        200,
      );
      const input =
        kind === 'character'
          ? { brief: '召唤巡灯术士' }
          : { brief: '调查旧渠', boss: 'bossGate', party };
      const preview = await post('prompts/preview', { kind, input });
      assert.equal(preview.status, 200);
      assert.equal(calls.length, kind === 'character' ? 0 : 1);
      assert.equal(preview.body.transport.format, 'tagged-json');
      assert.equal(preview.body.tokens.responseFormatTokens, 0);
      assert(preview.body.messages.at(-1).content.includes(OUTPUT_OPEN));
      assert(
        !preview.body.messages.some(
          (message) => message.role === 'assistant' && message.content.startsWith(OUTPUT_OPEN),
        ),
      );
      if (kind === 'character') {
        assert(!JSON.stringify(preview.body.messages).includes('格雷'));
        assert(JSON.stringify(preview.body.messages).includes('性格必须直接写成字符串'));
      } else assert(!JSON.stringify(preview.body.messages).includes('断流的水渠'));
      const script = scriptFixture(party.map((entry) => entry.id));
      script.opening = '进入遗迹。';
      for (const scene of script.scenes) {
        delete scene.encounter;
        scene.opening = '继续调查。';
        scene.before = [];
        scene.after = [];
        scene.interlude = [];
      }
      output =
        '<analysis>外部文字与JSON {"hp":999}</analysis>\n' +
        wrap(
          kind === 'character'
            ? JSON.stringify(compactCharacterDocument())
            : JSON.stringify(script),
        ) +
        '\n外部结束';
      const generated = await post(`generate/${kind}`, input);
      assert.equal(generated.status, 200, JSON.stringify(generated.body));
      assert.equal(generated.body.diagnostic.rawText, output);
      assert.equal(generated.body.diagnostic.envelope.tag, 'wanxiang_json');
      if (kind === 'script') {
        assert(generated.body.diagnostic.prose.characters < 1200);
        const validated = await post('validate/script', { content: JSON.stringify(script), input });
        assert.equal(validated.status, 200);
      }
      assert(!generated.body.diagnostic.candidateText.includes('外部文字'));
      assert(!JSON.stringify(generated.body.entry).includes('外部文字'));
      assert(!('response_format' in calls.at(-1)));
      assert.deepEqual(calls.at(-1).messages, preview.body.messages);
    }
    const saved = await post('prompts/save', {
      preset: {
        name: '用户自选的格式示例',
        prompts: [
          { identifier: 'main', role: 'system', content: '按实际要求生成新角色。' },
          { identifier: 'example', role: 'assistant', content: wrap(characterResponse()) },
          { identifier: 'chatHistory', marker: true },
        ],
      },
    });
    assert.equal(saved.status, 200);
    await post('prompts/select', { kind: 'character', id: saved.body.preset.id });
    output = wrap(characterResponse());
    const copied = await post('generate/character', { brief: '生成一名与示例完全不同的弓手' });
    assert.equal(copied.status, 200);
    assert.equal(copied.body.diagnostic.stage, 'complete');
    assert.equal(copied.body.diagnostic.warnings[0].path, 'output.source');
    assert.equal(copied.body.diagnostic.rawText, output);
    assert.equal(copied.body.entry.setting.name, '灯河');
    // No regex may convert text outside a missing envelope into accepted game data.
    await post('regex', {
      scripts: [
        {
          id: 'inject',
          scriptName: '不能绕过标签',
          findRegex: '/^[\\s\\S]*$/',
          replaceString: wrap(characterResponse()),
          placement: [2],
        },
      ],
    });
    output = characterResponse();
    const failed = await post('generate/character', { brief: '测试缺失标签' });
    assert.equal(failed.status, 400);
    assert.equal(failed.body.diagnostic.stage, 'envelope');
    assert.equal(failed.body.diagnostic.rawText, output);
    const accepted = await post('validate/character', { content: characterResponse(), input: {} });
    assert.equal(accepted.status, 200);
    assert.equal(calls.length, 4, 'local correction must not call the model');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('version 4 migrates only protocol paragraphs and examples, preserving edits and injection settings', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/envelope-migration-'));
  const store = await createWorldbookStore(directory);
  const saved = await store.get('tavern-world');
  const rules = Object.values(saved.book.entries);
  const output = rules.find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'character-output',
  );
  output.content =
    '【角色生成输出格式 / CHARACTER v3】\n仅输出一个完整JSON对象，禁止XML。\n我自己的字段补充\n{{outputSchema}}';
  Object.assign(output, {
    depth: 2,
    order: 4321,
    disable: true,
    apiTargets: ['character', 'script'],
  });
  const example = rules.find((entry) => entry.comment === '角色生成 · JSON格式示例 @D');
  example.content = characterResponse();
  const unrelated = rules.find((entry) => entry.uid !== output.uid && entry.uid !== example.uid);
  const original = structuredClone(unrelated);
  await store.save(saved);
  await writeFile(path.join(directory, 'builtin-content.json'), '{"version":3}\n');
  const migrated = await createWorldbookStore(directory);
  const result = await migrated.get('tavern-world');
  const entry = result.book.entries[output.uid];
  assert(entry.content.includes(OUTPUT_OPEN));
  assert(entry.content.includes('我自己的字段补充'));
  assert(!entry.content.includes('禁止XML'));
  assert.deepEqual(
    [entry.depth, entry.order, entry.disable, entry.apiTargets],
    [2, 4321, true, ['character', 'script']],
  );
  assert.deepEqual(result.book.entries[unrelated.uid], original);
  assert.equal(
    extractGenerationEnvelope(
      'character',
      result.book.entries[example.uid].content,
    ).candidateText.trim(),
    characterResponse(),
  );
  entry.content += '\n迁移后编辑';
  await migrated.save(result);
  const restarted = await createWorldbookStore(directory);
  assert.equal(
    (await restarted.get('tavern-world')).book.entries[output.uid].content,
    entry.content,
  );
  assert.equal(
    JSON.parse(await readFile(path.join(directory, 'builtin-content.json'), 'utf8')).version,
    27,
  );
});

test('example-copy diagnostics are informational and never reject valid prose', () => {
  const content = characterResponse();
  const parsed = JSON.parse(content);
  const reordered = JSON.stringify({
    data: parsed.data,
    setting: parsed.setting,
    schemaVersion: parsed.schemaVersion,
  });
  const messages = [{ role: 'assistant', content: wrap(reordered) }];
  const warnings = generationSourceWarnings('character', content, messages);
  assert.equal(warnings[0].path, 'output.source');
  parsed.setting.personality += '喜欢收集船票。';
  assert.deepEqual(generationSourceWarnings('character', JSON.stringify(parsed), messages), []);
  assert.deepEqual(
    generationSourceWarnings('character', content, [
      { role: 'user', content: wrap(content) },
      { role: 'assistant', content: '好的，请告诉我要求。' },
    ]),
    [],
  );
  assert.deepEqual(generationSourceWarnings('character', '{broken', messages), []);
});

test('version 5 retires stock examples once without disabling user examples or deleting reference content', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/example-retirement-'));
  const store = await createWorldbookStore(directory);
  const saved = await store.get('tavern-world');
  const examples = Object.values(saved.book.entries).filter((entry) =>
    /JSON格式示例 @D$/.test(entry.comment),
  );
  assert.equal(examples.length, 2);
  assert(examples.every((entry) => entry.disable));
  const character = examples.find((entry) => entry.apiTargets.includes('character'));
  const original = character.content;
  character.disable = false;
  const script = examples.find((entry) => entry.apiTargets.includes('script'));
  script.content = wrap(JSON.stringify({ user: '我手写的示例，不可覆盖' }));
  script.disable = false;
  await store.save(saved);
  await writeFile(path.join(directory, 'builtin-content.json'), '{"version":4}');
  const upgraded = await createWorldbookStore(directory);
  const result = await upgraded.get('tavern-world');
  assert(result.book.entries[character.uid].disable);
  assert.equal(result.book.entries[character.uid].content, original);
  assert.equal(result.book.entries[script.uid].disable, false);
  assert.equal(result.book.entries[script.uid].content, script.content);
  result.book.entries[character.uid].disable = false;
  await upgraded.save(result);
  const restarted = await createWorldbookStore(directory);
  assert.equal((await restarted.get('tavern-world')).book.entries[character.uid].disable, false);
});
