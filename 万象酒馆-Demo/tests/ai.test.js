import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  parseGeneratedJSON,
  parseCharacterOutput,
  normalizeCharacter,
  normalizeScript,
  settingOnly,
} from '../src/ai/contracts.js';
import { newLibrary, compileRoster, restoreLibrary } from '../src/ai/library.js';
import { newBattle, preview, makeAction, advance, newEncounter } from '../src/engine.js';
import { abilityFor } from '../src/catalog.js';
import { encounterSpec, HEROES } from '../src/data.js';
import { generationMessages } from '../server/prompts.mjs';
import { completionURL, compatibleRequest } from '../server/compatible.mjs';
import { createAiApi } from '../server/ai-api.mjs';
import { createCharacterReader } from '../server/character-reader.mjs';
import {
  characterFixture,
  characterResponse,
  characterDocument,
  scriptFixture,
  requestContext,
} from './fixtures/ai.js';

test('generated data compiles once into an independent combat snapshot with real custom skills', () => {
  const library = newLibrary(),
    raw = characterFixture(),
    entry = normalizeCharacter(raw, 'character-test');
  library.characters.push(entry);
  library.party[0] = entry.id;
  const roster = compileRoster(library),
    state = newBattle(undefined, roster);
  assert.equal(state.units.aegis.hp, 50);
  assert.equal(abilityFor(state, 'aegis', 'generated-1').name, '凝灯');
  const result = preview(state, [makeAction(state, 'aegis', 'generated-1', 'mossSlime', 0)]);
  assert(result.valid);
  assert.equal(
    result.final.units.aegis.mp,
    state.units.aegis.mp - abilityFor(state, 'aegis', 'generated-1').mp,
  );
  entry.combat.attack = 3;
  assert.equal(abilityFor(state, 'aegis', 'attack').effects[0].value, 12);
  assert.equal(HEROES[0].attack, 6);
  const next = newEncounter(encounterSpec(1), advance(result), 1);
  assert.equal(abilityFor(next, 'aegis', 'attack').effects[0].value, 12);
  assert.equal(next.units.aegis.mp, result.final.units.aegis.mp);
  assert(!('combat' in settingOnly(entry)));
  assert.equal(restoreLibrary(JSON.parse(JSON.stringify(library))).party[0], entry.id);
});

test('invalid generated mechanics, malformed JSON and unknown speakers never enter the engine', () => {
  assert.throws(() => parseGeneratedJSON('not JSON'));
  for (const edit of [
    (data) => {
      data.hp = 9999;
    },
    (data) => {
      data.skills[0].effects[0].type = 'runScript';
    },
    (data) => {
      data.weapon = 'url';
    },
  ]) {
    const raw = characterFixture();
    edit(raw.data);
    assert.throws(() => normalizeCharacter(raw, 'character-test'));
  }
  const ids = newLibrary().party,
    script = scriptFixture(ids);
  script.scenes[0].before[0].speaker = 'unknown';
  assert.throws(() => normalizeScript(script, 'script-test', ids));
  script.scenes.pop();
  assert.throws(() => normalizeScript(script, 'script-test', ids));
});

test('script context receives green-light settings and confirmed history without combat data', async () => {
  const library = newLibrary(),
    party = library.characters.map(settingOnly);
  const messages = await generationMessages('script', {
    brief: '寻找旧路',
    boss: 'bossGate',
    party,
    history: [],
  });
  const context = requestContext(messages);
  assert.equal(context.characters.greenLight.length, 6);
  assert(context.characters.greenLight.every((entry) => !entry.data && !entry.combat && !entry.hp));
  assert.equal(context.encounters.length, 5);
  assert(messages.at(-1).content.includes('SCRIPT v4'));
  assert(messages.at(-1).content.includes('story'));
  assert(messages.some((message) => message.role === 'user'));
  assert(messages.at(-1).content.includes('JSON Schema'));
  assert.equal(
    normalizeScript(scriptFixture(library.party), 'script-test', library.party).scenes.length,
    5,
  );
});

test('OpenAI compatible transport normalizes endpoints, tolerates text JSON and reports truncation', async () => {
  assert.equal(completionURL('https://example.com/v1/').pathname, '/v1/chat/completions');
  assert.equal(
    completionURL('http://127.0.0.1:9999/v1/chat/completions').pathname,
    '/v1/chat/completions',
  );
  assert.throws(() => completionURL('http://remote.example/v1'));
  let sent;
  const result = await compatibleRequest(
    {
      baseUrl: 'https://example.com/v1',
      model: 'model-id',
      apiKey: 'private-test',
      jsonMode: false,
      temperature: null,
      maxTokens: 1000,
      tokenField: 'max_completion_tokens',
    },
    [{ role: 'system', content: 'JSON only' }],
    {
      fetchImpl: async (_url, options) => {
        sent = options;
        return Response.json({
          choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
        });
      },
    },
  );
  assert.equal(sent.headers.Authorization, 'Bearer private-test');
  assert.equal(JSON.parse(sent.body).max_completion_tokens, 1000);
  assert(!('response_format' in JSON.parse(sent.body)));
  assert.equal(parseGeneratedJSON(result.content).ok, true);
  await assert.rejects(
    compatibleRequest({ baseUrl: 'https://example.com/v1', model: 'test', apiKey: '' }, [], {
      fetchImpl: async () => Response.json({ choices: [{ finish_reason: 'length' }] }),
    }),
    /截断/,
  );
});

test('local API proxies generation, keeps keys private and rejects foreign origins', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/ai-unit-'));
  let calls = 0;
  const settingsFile = path.join(directory, 'config.json');
  const api = await createAiApi({
    root: process.cwd(),
    port: 0,
    settingsFile,
    fetchImpl: async (_url, options) => {
      assert(!('response_format' in JSON.parse(options.body)));
      calls++;
      return Response.json({
        choices: [
          { message: { content: `<wanxiang_json>\n${characterResponse()}\n</wanxiang_json>` } },
        ],
        usage: { prompt_tokens: 12, completion_tokens: 34 },
      });
    },
  });
  const server = createServer((req, res) => {
    void api(req, res, req.url);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, data, extra = {}) =>
    fetch(base + url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify(data),
    });
  try {
    const saved = await post('/api/ai/config', {
      kind: 'character',
      baseUrl: 'https://example.com/v1',
      model: 'mock',
      apiKey: 'private-test-key',
      rememberKey: false,
      jsonMode: true,
      tokenField: 'max_tokens',
      temperature: null,
    });
    assert.equal(saved.status, 200);
    assert(!(await saved.text()).includes('private-test-key'));
    assert(!(await readFile(settingsFile, 'utf8')).includes('private-test-key'));
    const generated = await post('/api/ai/generate/character', { brief: '生成守灯人' });
    assert.equal((await generated.json()).entry.setting.name, '灯河');
    assert.equal(calls, 1);
    const rejected = await post(
      '/api/ai/generate/character',
      { brief: 'bad' },
      { Origin: 'https://other.example' },
    );
    assert.equal(rejected.status, 403);
    assert.equal(calls, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('character protocol accepts prose lengths while preserving structure and discarding raw JSON layers', () => {
  const read = createCharacterReader();
  const raw = read(characterResponse());
  const entry = normalizeCharacter(raw, 'character-prose');
  assert(entry.setting.worldbook.includes('二十九岁'));
  assert(entry.setting.worldbook.includes('攻击方式｜灯火弹'));
  assert(!('attack' in entry.setting));
  assert(!('gender' in entry.setting));
  assert(!JSON.stringify(entry).includes('<game_data>'));
  assert(!('data' in entry));
  assert(!('combat' in settingOnly(entry)));
  const library = newLibrary();
  library.characters.push(entry);
  library.party[0] = entry.id;
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.equal(restored.characters.at(-1).setting.worldbook, entry.setting.worldbook);
  assert.equal(compileRoster(restored).aegis.attack, 12);
  const short = characterDocument();
  short.setting.appearance = '短发。';
  short.setting.personality = '谨慎。';
  short.setting.attack.description = '凝成灯火。';
  assert.doesNotThrow(() => read(JSON.stringify(short)));
  const long = characterDocument();
  long.setting.appearance = long.setting.appearance.repeat(4);
  assert.doesNotThrow(() => read(JSON.stringify(long)));
  assert.throws(() => parseCharacterOutput(JSON.stringify(characterFixture())));
  assert.throws(() => parseCharacterOutput(characterResponse() + '\n多余内容'));
});
