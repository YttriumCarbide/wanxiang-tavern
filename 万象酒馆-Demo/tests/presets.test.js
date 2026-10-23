import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizePromptPreset } from '../src/ai/presets.js';
import { generationMessages } from '../server/prompts.mjs';
import { createAiSettings, DEFAULT_OUTPUT_TOKENS } from '../server/ai-settings.mjs';
import { createPromptStore } from '../server/prompt-store.mjs';
import { compatibleRequest } from '../server/compatible.mjs';
import { scriptOutputSchema } from '../src/ai/script-schema.js';
import { normalizeScript } from '../src/ai/contracts.js';
import { tavernPresetFixture, requestContext } from './fixtures/ai.js';
import { createMacroExpander } from '../src/ai/prompt-macros.js';
import { createHelperStorage } from '../server/helper-storage.mjs';

test('model requests reject malformed saved keys before transport and identify upstream model 404s', async () => {
  const profile = { baseUrl: 'https://example.com/v1', apiKey: 'old-key含中文' };
  let called = false;
  await assert.rejects(
    compatibleRequest(profile, [], {
      models: true,
      fetchImpl() {
        called = true;
        throw Error('must not send');
      },
    }),
    /API Key 格式无效/,
  );
  assert.equal(called, false);
  await assert.rejects(
    compatibleRequest({ ...profile, apiKey: 'test-key' }, [], {
      models: true,
      fetchImpl: async () => new Response('not found', { status: 404 }),
    }),
    /模型列表接口不存在.*HTTP 404.*\/v1\/models/,
  );
});

test('script preferences persist separately from exported presets and reject invalid storage shapes', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/helper-storage-'));
  const file = path.join(directory, 'private.json');
  const store = await createHelperStorage(file);
  await store.save('prompt-example', { position: '120,80', privateValue: 'private-helper-value' });
  const restored = await createHelperStorage(file);
  assert.equal(restored.get('prompt-example').privateValue, 'private-helper-value');
  assert.deepEqual(restored.get('another-preset'), {});
  await assert.rejects(store.save('../config', {}));
  await assert.rejects(store.save('prompt-example', { position: 42 }));
});

test('saving a named connection atomically captures the current form and remains selectable after restart', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/connection-save-'));
  const file = path.join(directory, 'settings.json');
  const settings = await createAiSettings(file);
  const result = await settings.preset({
    action: 'save',
    kind: 'chat',
    name: '新插头',
    profile: {
      baseUrl: 'https://example.com/v1',
      model: 'selected-model',
      apiKey: 'atomic-secret',
      tokenField: 'max_tokens',
      maxTokens: 30000,
      temperature: null,
      promptProcessing: 'strict',
    },
  });
  const id = result.profiles.chat.apiPresetId;
  assert.equal(result.presets.find((entry) => entry.id === id).name, '新插头');
  assert(!JSON.stringify(result).includes('atomic-secret'));
  const restored = await createAiSettings(file);
  await restored.preset({ action: 'apply', kind: 'script', id });
  assert.equal(restored.get('script').model, 'selected-model');
  assert.equal(restored.get('script').apiKey, 'atomic-secret');
  assert.equal(restored.get('script').promptPresetId, 'script-default');
  await assert.rejects(
    restored.saveProfile({ ...restored.get('script'), kind: 'script', apiKey: 'key误粘贴说明' }),
    /API Key 格式无效/,
  );
  assert.equal(restored.get('script').apiKey, 'atomic-secret');
  await assert.rejects(
    restored.preset({
      action: 'save',
      kind: 'chat',
      name: '错误连接',
      profile: { baseUrl: 'bad' },
    }),
  );
  assert.equal(restored.listPresets().length, 1);
});

test('Izumi portable macros expand without leaking comments or evaluating imported code', () => {
  const expand = createMacroExpander({ brief: '你好', clock: '2026-10-17T08:00:00Z' });
  const result = expand(
    '{{//导入说明不是应用指令}}{{setvar::name::来客}}{{getvar::name}} {{lastUserMessage}} {{roll 1d999999}} {{date}}',
  );
  assert(!result.includes('导入说明'));
  assert(result.includes('来客 你好'));
  assert(result.includes('2026-10-17'));
  assert.equal(
    result,
    createMacroExpander({ brief: '你好', clock: '2026-10-17T08:00:00Z' })(
      '{{//导入说明不是应用指令}}{{setvar::name::来客}}{{getvar::name}} {{lastUserMessage}} {{roll 1d999999}} {{date}}',
    ),
  );
});

test('Tavern layered prompts preserve role/order/disabled layers and always end with the game contract', async () => {
  const raw = tavernPresetFixture();
  raw.api_key = 'MUST_NOT_IMPORT';
  const { preset } = normalizePromptPreset(raw, 'test');
  assert(!JSON.stringify(preset).includes('MUST_NOT_IMPORT'));
  const messages = await generationMessages(
    'character',
    { brief: '独特的盾卫', existing: [] },
    preset,
  );
  assert.deepEqual(
    messages.slice(0, 3).map((entry) => entry.role),
    ['system', 'user', 'assistant'],
  );
  assert(messages[0].content.includes('独特的盾卫'));
  assert(!messages.some((entry) => entry.content.includes('THIS_LAYER_MUST_NOT_BE_SENT')));
  assert.equal(requestContext(messages).request.brief, '独特的盾卫');
  assert.equal(messages.at(-1).role, 'system');
  assert(messages.at(-1).content.includes('CHARACTER v4'));
  raw.prompts[0].content = '{{unsupported::macro}}';
  await assert.rejects(generationMessages('character', { brief: '盾卫' }, raw), /未适配宏/);
  raw.prompts[0].content = '{{__proto__}}';
  await assert.rejects(generationMessages('character', { brief: '盾卫' }, raw), /未适配宏/);
});

test('request-depth injection remains ordered and cannot replace or truncate the current task', async () => {
  const raw = tavernPresetFixture();
  raw.prompts.push({
    identifier: 'depth-zero',
    role: 'ass',
    name: '尾部',
    content: 'AT_END',
    injection_position: 1,
    injection_depth: 0,
    injection_order: 0,
  });
  raw.prompt_order[0].order.push({ identifier: 'depth-zero', enabled: true });
  raw.prompt_order[0].order.find((item) => item.identifier === 'chatHistory').enabled = false;
  const messages = await generationMessages('character', { brief: '沿河的冒险者' }, raw);
  assert.equal(messages.at(-2).role, 'assistant');
  assert.equal(messages.at(-2).content, 'AT_END');
  assert.equal(requestContext(messages).request.brief, '沿河的冒险者');
  const normalized = normalizePromptPreset(raw).preset;
  assert.equal(normalized.prompts.at(-1).injection_order, 0);
});

test('character reference contains only approved official base numbers while the script example stays parseable', async () => {
  for (const kind of ['character', 'script']) {
    const example = await readFile(
      new URL(`../prompts/worldbook/${kind}-example.json`, import.meta.url),
      'utf8',
    );
    if (kind === 'character') {
      const reference = JSON.parse(example);
      assert.equal(reference.purpose, 'official-base-stat-reference');
      assert.deepEqual(
        reference.characters.map((entry) => entry.name),
        ['青缘', '伊蒂丝', '长景月汐', '潘多拉'],
      );
      assert.equal(reference.characters.find((entry) => entry.name === '伊蒂丝').base.hp, 48);
      assert.equal(reference.setting, undefined);
      assert(!example.includes('格雷'));
    } else
      assert.equal(
        normalizeScript(JSON.parse(example), 'script-example', [
          'official-aegis',
          'official-lyria',
          'official-morrow',
          'official-serin',
          'official-vesper',
          'official-rook',
        ]).story.length,
        5,
      );
  }
});

test('named API presets persist credentials across restart and keep every public response redacted', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/presets-'));
  const file = path.join(directory, 'settings.json');
  const settings = await createAiSettings(file);
  assert.equal(settings.visible().character.maxTokens, 32768);
  await settings.saveProfile({
    rememberKey: false,
    kind: 'character',
    baseUrl: 'https://example.com/v1',
    model: 'test-model',
    apiKey: 'private-key-one',
    tokenField: 'max_tokens',
    temperature: null,
    maxTokens: 24000,
  });
  assert(
    !(await readFile(file, 'utf8')).includes('private-key-one'),
    'A session-only profile remains session-only until explicitly saved as a preset',
  );
  let result = await settings.preset({ action: 'save', kind: 'character', name: '共享连接' });
  const id = result.presets[0].id;
  assert(!JSON.stringify(result).includes('private-key-one'));
  assert((await readFile(file, 'utf8')).includes('private-key-one'));
  const restarted = await createAiSettings(file);
  await restarted.preset({ action: 'apply', kind: 'script', id });
  assert.equal(restarted.get('script').apiKey, 'private-key-one');
  assert.equal(restarted.visible().script.hasApiKey, true);
  assert(!JSON.stringify(restarted.visible()).includes('private-key-one'));
  await settings.selectPrompt('script', 'script-default');
  await settings.preset({ action: 'apply', kind: 'script', id });
  assert.equal(settings.get('script').apiKey, 'private-key-one');
  assert.equal(settings.visible().script.promptPresetId, 'script-default');
  assert.equal(settings.visible().script.maxTokens, 24000);
  const copy = settings.get('script');
  copy.model = 'mutated';
  assert.equal(settings.get('script').model, 'test-model');
  await settings.saveProfile({
    ...settings.get('character'),
    kind: 'character',
    rememberKey: true,
  });
  result = await settings.preset({ action: 'save', kind: 'character', id, name: '更新连接' });
  assert.equal(result.presets.length, 1);
  const restored = await createAiSettings(file);
  await restored.preset({ action: 'apply', kind: 'script', id });
  assert.equal(restored.get('script').apiKey, 'private-key-one');
  assert(!JSON.stringify(restored.listPresets()).includes('private-key-one'));
  await restored.saveProfile({
    ...restored.get('character'),
    kind: 'character',
    apiKey: 'private-key-two',
    model: 'second-model',
    rememberKey: false,
  });
  const secondResult = await restored.preset({
    action: 'save',
    kind: 'character',
    name: '第二连接',
  });
  const second = secondResult.presets.find((entry) => entry.id !== id).id;
  const switched = await createAiSettings(file);
  await switched.preset({ action: 'apply', kind: 'script', id });
  assert.equal(switched.get('script').apiKey, 'private-key-one');
  await switched.preset({ action: 'apply', kind: 'script', id: second });
  assert.equal(switched.get('script').apiKey, 'private-key-two');
  assert.equal(switched.get('script').model, 'second-model');
  assert(!JSON.stringify(switched.listPresets()).includes('private-key-'));
  await restored.preset({ action: 'delete', kind: 'script', id: second });
  await restored.preset({ action: 'delete', kind: 'script', id });
  assert.equal(restored.listPresets().length, 0);
  assert.equal(restored.get('script').model, 'test-model');
});

test('old default output limits migrate upward while custom limits remain explicit and validated', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/settings-'));
  const file = path.join(directory, 'old.json');
  await writeFile(
    file,
    JSON.stringify({ character: { maxTokens: 8192 }, script: { maxTokens: 22000 } }),
  );
  const settings = await createAiSettings(file);
  assert.equal(settings.get('character').maxTokens, DEFAULT_OUTPUT_TOKENS);
  assert.equal(settings.get('script').maxTokens, 22000);
  await assert.rejects(
    settings.saveProfile({ ...settings.get('character'), kind: 'character', maxTokens: 12 }),
    /输出上限/,
  );
});

test('previous shared connection defaults also migrate to 32768 without changing custom limits', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/output-migration-'));
  const file = path.join(directory, 'settings.json');
  await writeFile(
    file,
    JSON.stringify({
      version: 2,
      profiles: { character: { maxTokens: 16384 }, script: { maxTokens: 24000 } },
      apiPresets: [{ id: 'api-saved', name: '旧默认', maxTokens: 16384 }],
    }),
  );
  const settings = await createAiSettings(file);
  assert.equal(settings.get('character').maxTokens, 32768);
  assert.equal(settings.get('script').maxTokens, 24000);
  assert.equal(settings.listPresets()[0].maxTokens, 32768);
});

test('prompt files survive save/import/reload without importing connection secrets or executing unsupported fields', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/prompts-'));
  const store = await createPromptStore(directory);
  const raw = tavernPresetFixture();
  raw.custom_include_headers = 'Authorization: private';
  const saved = await store.save({ preset: raw });
  const restored = await store.get(saved.preset.id);
  assert.equal(restored.preset.prompts[2].role, 'assistant');
  assert(!JSON.stringify(restored).includes('Authorization'));
  assert.equal((await store.list()).length, 1);
  await assert.rejects(store.get('../secret'), /ID无效/);
  await assert.rejects(store.delete('character-default'), /不能删除/);
  await store.delete(saved.preset.id);
  assert.equal((await store.list()).length, 0);
});

test('optional strict script mode sends the five-block novel schema and unchanged metadata', async () => {
  let payload;
  const schema = scriptOutputSchema(['character-one']);
  await compatibleRequest(
    {
      baseUrl: 'https://example.com/v1',
      model: 'test',
      strictJson: true,
      apiKey: '',
      temperature: null,
    },
    [],
    {
      responseSchema: schema,
      fetchImpl: async (_url, options) => {
        payload = JSON.parse(options.body);
        return Response.json({ choices: [{ message: { content: '{}' } }] });
      },
    },
  );
  assert.equal(payload.response_format.type, 'json_schema');
  assert.equal(payload.response_format.json_schema.strict, true);
  assert.equal(schema.properties.story.minItems, 5);
  assert.equal(schema.properties.story.items.type, 'string');
  assert.deepEqual(Object.keys(schema.properties.data.properties.nextHook.properties), [
    'setting',
    'phase',
  ]);
  assert.equal(
    schema.properties.data.properties.items.items.anyOf[2].properties.description.maxLength,
    20,
  );
  assert.deepEqual(schema.required, ['schemaVersion', 'story', 'data']);
  assert.equal(schema.additionalProperties, false);
});
