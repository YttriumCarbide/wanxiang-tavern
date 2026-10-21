import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  readGenerationResult,
  repairJSONText,
  redactDiagnostic,
} from '../server/generation-result.mjs';
import { createCharacterReader } from '../server/character-reader.mjs';
import { createAiApi } from '../server/ai-api.mjs';
import { compatibleRequest } from '../server/compatible.mjs';
import { characterDocument, characterResponse, scriptFixture } from './fixtures/ai.js';
import { newLibrary } from '../src/ai/library.js';
import { normalizeCharacter, parseCharacterOutput } from '../src/ai/contracts.js';
import { characterInputSchema, characterOutputSchema } from '../src/ai/character-schema.js';
import { checkOutputSchema } from '../src/ai/schema-check.js';

const silviaResponse = await readFile(
  new URL('./fixtures/silvia-character.json', import.meta.url),
  'utf8',
);

test('Silvia personality objects compile losslessly through direct and shared validation', () => {
  const raw = JSON.parse(silviaResponse);
  const personality = `${raw.setting.personality.name}：${raw.setting.personality.description}`;
  checkOutputSchema(raw, characterInputSchema());
  assert.throws(() => checkOutputSchema(raw, characterOutputSchema()));
  assert.equal(parseCharacterOutput(silviaResponse).setting.personality, personality);
  const direct = normalizeCharacter(raw, 'silvia-direct');
  const result = readGenerationResult('character', silviaResponse, {});
  assert.equal(result.diagnostic.rawText, silviaResponse);
  assert.equal(result.diagnostic.stage, 'complete');
  assert.deepEqual(result.diagnostic.issues, []);
  const repair = result.diagnostic.repairs.find(
    (item) => item.path === 'character.setting.personality',
  );
  assert(repair);
  assert.deepEqual(JSON.parse(repair.before), raw.setting.personality);
  const candidate = JSON.parse(result.diagnostic.candidateText);
  assert.equal(candidate.setting.personality, personality);
  assert.deepEqual(candidate.data, raw.data);
  assert.deepEqual(result.arrivalDialogue, raw.arrivalDialogue);
  assert.equal(result.entry.setting.worldbook, direct.setting.worldbook);
  assert(result.entry.setting.worldbook.includes(`性格：${personality}`));
  assert(!result.entry.setting.worldbook.includes('[object Object]'));
  assert.equal(result.entry.combat.hp, 62);
  assert.equal(result.entry.combat.mp, 31);
  assert.deepEqual(result.entry.combat.skills[0].effects, raw.data.skills[0].effects);
  assert.deepEqual(result.entry.combat.skills[1].rules, [
    { id: 'rule-0', ...raw.data.skills[1].rules[0] },
  ]);
  assert.deepEqual(
    readGenerationResult('character', result.diagnostic.candidateText, {}).diagnostic.repairs,
    [],
  );
});

test('personality compatibility still rejects missing, unknown, non-text and oversized content or invalid mechanics', () => {
  for (const personality of [
    null,
    [],
    7,
    { name: '严谨务实' },
    { description: '谨慎。' },
    { name: '严谨务实', description: 7 },
    { name: '严谨务实', description: '' },
    { name: '严谨务实', description: '谨慎。', script: 'unknown' },
    { name: '严谨务实', description: '长'.repeat(2400) },
  ]) {
    const raw = JSON.parse(silviaResponse);
    raw.setting.personality = personality;
    assert.throws(() => parseCharacterOutput(JSON.stringify(raw)));
    assert.throws(() => readGenerationResult('character', JSON.stringify(raw), {}));
  }
  const raw = JSON.parse(silviaResponse);
  raw.data.hp = 999;
  raw.data.skills[0].effects[0].type = 'runScript';
  assert.throws(
    () => readGenerationResult('character', JSON.stringify(raw), {}),
    (failure) => {
      assert(failure.diagnostic.issues.some((issue) => issue.path === 'character.data.hp'));
      assert(failure.diagnostic.issues.some((issue) => issue.path.includes('effects[0]')));
      return true;
    },
  );
});

test('local format repairs preserve original responses and never alter quoted story text or valid numbers', () => {
  const read = createCharacterReader();
  const clean = characterResponse();
  const raw = '\uFEFF```json\n' + clean.slice(0, -1) + ',}\n```';
  const result = readGenerationResult('character', raw, {}, read);
  assert.equal(result.diagnostic.rawText, raw);
  assert.equal(result.diagnostic.candidateText, clean);
  assert.equal(result.entry.combat.hp, 50);
  assert(
    result.diagnostic.repairs.some((repair) => repair.line && repair.message.includes('逗号')),
  );
  assert(result.diagnostic.repairs.some((repair) => repair.message.includes('围栏')));
  assert.deepEqual(readGenerationResult('character', clean, {}, read).diagnostic.repairs, []);
  const literal = '正文,}、网址https://a/b、转义"引号,]';
  const tricky = '{"text":' + JSON.stringify(literal) + ', "array":[1,2,],}';
  const fixed = repairJSONText(tricky);
  assert.equal(fixed.repairs.length, 2);
  assert.equal(JSON.parse(fixed.candidateText).text, '正文,}、网址https://a/b、转义"引号,]');
});

test('diagnostics report all invalid field paths and preserve syntax/rule failures without guessing content', () => {
  const read = createCharacterReader();
  const raw = characterDocument();
  raw.data.hp = 999;
  raw.data.mp = '28';
  delete raw.setting.gender;
  assert.throws(
    () => readGenerationResult('character', JSON.stringify(raw), {}, read),
    (failure) => {
      const paths = failure.diagnostic.issues.map((issue) => issue.path);
      assert(
        paths.includes('character.data.hp') &&
          paths.includes('character.data.mp') &&
          paths.includes('character.setting.gender'),
      );
      assert.equal(JSON.parse(failure.diagnostic.candidateText).data.hp, 999);
      return true;
    },
  );
  const cut = '{\n"schemaVersion":3,\n"setting":';
  assert.throws(
    () => readGenerationResult('character', cut, {}, read),
    (failure) => {
      assert.equal(failure.diagnostic.rawText, cut);
      assert.equal(failure.diagnostic.stage, 'json');
      assert(failure.diagnostic.issues[0].message.includes('JSON'));
      return true;
    },
  );
  const mismatch = characterDocument();
  mismatch.data.attackName = '另一个动作';
  const inherited = readGenerationResult('character', JSON.stringify(mismatch), {}, read);
  assert.equal(inherited.entry.combat.attackName, mismatch.setting.attack.name);
  assert.equal(JSON.parse(inherited.diagnostic.candidateText).data.attackName, '另一个动作');
  const ids = newLibrary().party;
  const script = scriptFixture(ids);
  script.scenes[0].before[0].speaker = 'unknown';
  assert.throws(
    () =>
      readGenerationResult(
        'script',
        JSON.stringify(script),
        { party: ids.map((id) => ({ id })) },
        read,
      ),
    (failure) => {
      assert.equal(failure.diagnostic.issues[0].path, 'script.scenes[0].before[0].speaker');
      return true;
    },
  );
});

test('truncation and non-JSON upstream failures retain raw text with configured keys redacted', async () => {
  const profile = { baseUrl: 'https://example.com/v1', model: 'mock', apiKey: 'secret-"\\key' };
  for (const [response, stage, fragment] of [
    [
      Response.json({
        choices: [{ finish_reason: 'length', message: { content: '{"setting":' } }],
      }),
      'truncated',
      '{"setting":',
    ],
    [new Response('bad gateway ' + profile.apiKey, { status: 502 }), 'transport', 'bad gateway'],
  ]) {
    await assert.rejects(
      compatibleRequest(profile, [], { fetchImpl: async () => response }),
      (failure) => {
        assert.equal(failure.diagnostic.stage, stage);
        assert(failure.diagnostic.rawText.includes(fragment));
        assert(
          !JSON.stringify(failure.diagnostic).includes(JSON.stringify(profile.apiKey).slice(1, -1)),
        );
        return true;
      },
    );
  }
  assert.equal(
    redactDiagnostic({ rawText: profile.apiKey }, profile.apiKey).rawText,
    '[密钥已隐藏]',
  );
});

test('upstream quota failures preserve raw responses and never retry HTTP or SSE requests', async () => {
  const profile = { baseUrl: 'https://example.com/v1', model: 'mock', apiKey: 'private-test-key' };
  const message = '上游 HTTP 429: [,[8,"Quota exceeded",[]]]';
  const raw = JSON.stringify({ error: { message, code: 429 } });
  const prefix =
    'data: ' + JSON.stringify({ choices: [{ delta: { content: '尚未完成的正文' } }] }) + '\n\n';
  for (const [response, expectedRaw] of [
    [new Response(raw, { status: 429 }), raw],
    [new Response(message, { status: 429 }), message],
    [new Response(raw), raw],
    [
      new Response('data: ' + raw + '\n\n', { headers: { 'Content-Type': 'text/event-stream' } }),
      raw,
    ],
    [
      new Response(prefix + 'data: ' + raw + '\n\n', {
        headers: { 'Content-Type': 'text/event-stream' },
      }),
      '尚未完成的正文',
    ],
  ]) {
    let calls = 0;
    await assert.rejects(
      compatibleRequest(profile, [], {
        fetchImpl: async () => {
          calls++;
          return response;
        },
      }),
      (failure) => {
        assert.equal(failure.diagnostic.stage, 'upstream-quota');
        assert.equal(failure.diagnostic.rawText, expectedRaw);
        assert(failure.message.includes('延长超时无法解决'));
        assert(failure.message.includes(message));
        return true;
      },
    );
    assert.equal(calls, 1);
  }
  const disconnect = JSON.stringify({
    error: { message: 'executor 断线后未在暂存窗口内补发结果' },
  });
  await assert.rejects(
    compatibleRequest(profile, [], {
      fetchImpl: async () =>
        new Response('data: ' + disconnect + '\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        }),
    }),
    (failure) => {
      assert.equal(failure.diagnostic.stage, 'transport');
      assert.equal(failure.diagnostic.rawText, disconnect);
      return true;
    },
  );
});

test('failed generation can be corrected and accepted locally without another provider request', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/diagnostic-'));
  let calls = 0;
  let output;
  const raw = characterDocument();
  raw.data.hp = 999;
  const upstream = `<wanxiang_json>\n${JSON.stringify(raw)}\n</wanxiang_json>`;
  output = upstream;
  const api = await createAiApi({
    root: process.cwd(),
    port: 0,
    settingsFile: path.join(directory, 'config.json'),
    promptsDirectory: path.join(directory, 'prompts'),
    fetchImpl: async () => {
      calls++;
      return Response.json({ choices: [{ message: { content: output } }] });
    },
  });
  const server = createServer((req, res) => void api(req, res, req.url));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const post = (route, data) =>
    fetch(`http://127.0.0.1:${server.address().port}/api/ai/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  try {
    const saved = await post('config', {
      kind: 'character',
      baseUrl: 'https://example.com/v1',
      model: 'mock',
      tokenField: 'max_tokens',
    });
    assert.equal(saved.status, 200);
    const failed = await post('generate/character', { brief: '测试角色' });
    assert.equal(failed.status, 400);
    const body = await failed.json();
    assert.equal(body.diagnostic.rawText, upstream);
    assert.equal(body.diagnostic.envelope.tag, 'wanxiang_json');
    assert(body.diagnostic.issues.some((issue) => issue.path === 'character.data.hp'));
    const invalid = await post('validate/character', { content: '{broken', input: {} });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).diagnostic.stage, 'json');
    const accepted = await post('validate/character', { content: characterResponse(), input: {} });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).entry.setting.name, '灯河');
    assert.equal(calls, 1);
    output = `<wanxiang_json>\n${silviaResponse}\n</wanxiang_json>`;
    const generated = await post('generate/character', { brief: '随机，法师，女性' });
    assert.equal(generated.status, 200);
    const silvia = await generated.json();
    assert.equal(silvia.entry.setting.name, '希尔维娅·瓦伦丁');
    assert.equal(silvia.diagnostic.rawText, output);
    const local = await post('validate/character', { content: silviaResponse, input: {} });
    assert.equal(local.status, 200);
    assert.equal((await local.json()).entry.setting.worldbook, silvia.entry.setting.worldbook);
    assert.equal(calls, 2, 'local personality correction must not request the provider');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
