import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp } from 'node:fs/promises';
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

test('failed generation can be corrected and accepted locally without another provider request', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/diagnostic-'));
  let calls = 0;
  const raw = characterDocument();
  raw.data.hp = 999;
  const upstream = `<wanxiang_json>\n${JSON.stringify(raw)}\n</wanxiang_json>`;
  const api = await createAiApi({
    root: process.cwd(),
    port: 0,
    settingsFile: path.join(directory, 'config.json'),
    promptsDirectory: path.join(directory, 'prompts'),
    fetchImpl: async () => {
      calls++;
      return Response.json({ choices: [{ message: { content: upstream } }] });
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
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
