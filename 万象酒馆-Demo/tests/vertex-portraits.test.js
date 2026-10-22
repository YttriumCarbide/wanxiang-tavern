import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compatibleRequest } from '../src/ai/compatible.js';
import { createConnectionStore } from '../src/ai/connection-store.js';
import { vertexURL } from '../src/ai/vertex.js';
import { PORTRAIT_TEMPLATES } from '../src/content/portrait-templates.js';
import { normalizeCharacter } from '../src/ai/contracts.js';
import { restoreLibrary } from '../src/ai/library.js';
import { worldReference } from '../src/worlds.js';
import { portraitUrl } from '../src/portraits.js';

const profile = {
  provider: 'vertex',
  vertexAuth: 'api-key',
  baseUrl: 'https://aiplatform.googleapis.com/v1',
  model: 'gemini-2.5-flash',
  apiKey: 'fixture-vertex-secret',
  tokenField: 'max_tokens',
  maxTokens: 8192,
  temperature: null,
};
const messages = [
  { role: 'system', content: '规则甲' },
  { role: 'user', content: '问' },
  { role: 'assistant', content: '答' },
  { role: 'system', content: '规则乙' },
  { role: 'user', content: '继续' },
];
const answer = (text) => ({
  candidates: [
    {
      content: { parts: [{ thought: true, text: 'private reasoning' }, { text }] },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 9 },
});

test('Vertex Express uses native route and API-key header, preserves roles and reads only final text', async () => {
  let request;
  const result = await compatibleRequest(profile, messages, {
    outputEnvelope: true,
    sampling: { temperature: 0.8, top_p: 0.9, maxTokens: 4096 },
    fetchImpl: async (url, options) => {
      request = { url: String(url), ...options, body: JSON.parse(options.body) };
      return Response.json(answer('正文'));
    },
  });
  assert.equal(
    request.url,
    'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent',
  );
  assert.equal(request.headers['x-goog-api-key'], profile.apiKey);
  assert.equal(request.headers.Authorization, undefined);
  assert.equal(request.headers['x-opencode-client'], undefined);
  assert.equal(request.redirect, 'error');
  assert.deepEqual(request.body.systemInstruction.parts, [{ text: '规则甲' }, { text: '规则乙' }]);
  assert.deepEqual(
    request.body.contents.map((entry) => entry.role),
    ['user', 'model', 'user'],
  );
  assert.deepEqual(request.body.generationConfig, {
    temperature: 0.8,
    topP: 0.9,
    maxOutputTokens: 4096,
  });
  assert.equal(result.content, '正文');
  assert.deepEqual(result.usage, { input: 7, output: 9 });
});

test('Vertex OAuth project endpoint, saved connection and reuse retain provider without exporting secrets', async () => {
  let snapshot;
  const store = createConnectionStore({
    save: async (value) => {
      snapshot = value;
    },
  });
  await store.saveProfile({
    ...profile,
    kind: 'script',
    vertexAuth: 'oauth',
    baseUrl:
      'https://us-central1-aiplatform.googleapis.com/v1/projects/test-project/locations/us-central1',
  });
  const saved = await store.preset({ kind: 'script', action: 'save', name: 'Vertex fixture' });
  await store.preset({ kind: 'map', action: 'apply', id: saved.presets[0].id });
  const restored = createConnectionStore({ snapshot });
  assert.equal(restored.visible().map.vertexAuth, 'oauth');
  assert.equal(restored.visible().map.apiKey, undefined);
  await compatibleRequest(restored.get('map'), messages, {
    fetchImpl: async (url, options) => {
      assert.match(
        String(url),
        /projects\/test-project\/locations\/us-central1\/publishers\/google\/models/,
      );
      assert.equal(options.headers.Authorization, `Bearer ${profile.apiKey}`);
      assert.equal(options.headers['x-goog-api-key'], undefined);
      return Response.json(answer('OK'));
    },
  });
  assert.throws(
    () => vertexURL({ ...profile, baseUrl: profile.baseUrl + '?key=secret' }),
    /查询参数/,
  );
  assert.throws(() => vertexURL({ ...profile, model: '../other' }), /模型ID/);
});

test('native Vertex supports preset text tool output and incremental UTF8 SSE, discards thoughts', async () => {
  const outputTool = {
    name: 'game_content',
    description: '正文',
    parameters: {
      type: 'object',
      properties: { content: { type: 'string' } },
      required: ['content'],
      additionalProperties: false,
    },
  };
  const encoder = new TextEncoder();
  const wire = encoder.encode(
    [
      { candidates: [{ content: { parts: [{ thought: true, text: '不可显示' }] } }] },
      {
        candidates: [
          {
            content: {
              parts: [{ functionCall: { name: 'game_content', args: { content: '完整正文' } } }],
            },
            finishReason: 'STOP',
          },
        ],
      },
    ]
      .map((value) => `data: ${JSON.stringify(value)}\r\n\r\n`)
      .join(''),
  );
  const result = await compatibleRequest({ ...profile, stream: true }, messages, {
    outputTool,
    fetchImpl: async (url, options) => {
      assert.match(String(url), /:streamGenerateContent\?alt=sse$/);
      const payload = JSON.parse(options.body);
      assert.deepEqual(payload.toolConfig.functionCallingConfig, {
        mode: 'ANY',
        allowedFunctionNames: ['game_content'],
      });
      assert.equal(payload.tools[0].functionDeclarations[0].parametersJsonSchema.type, 'object');
      return new Response(
        new ReadableStream({
          start(controller) {
            for (let start = 0; start < wire.length; start += 7)
              controller.enqueue(wire.slice(start, start + 7));
            controller.close();
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      );
    },
  });
  assert.equal(result.content, '完整正文');
  const deltas = [];
  const plain = await compatibleRequest({ ...profile, stream: true }, messages, {
    onDelta: (text) => deltas.push(text),
    fetchImpl: async () =>
      new Response(`data: ${JSON.stringify(answer('流式正文'))}\n\n`, {
        headers: { 'content-type': 'text/event-stream' },
      }),
  });
  assert.equal(plain.content, '流式正文');
  assert.equal(deltas.join(''), '流式正文');
});

test('Vertex errors retain diagnostic text, redact credentials, never retry, propagate abort', async () => {
  let requests = 0;
  await assert.rejects(
    compatibleRequest(profile, messages, {
      fetchImpl: async () => {
        requests++;
        return Response.json(
          { error: { code: 429, message: `Quota exceeded ${profile.apiKey}` } },
          { status: 429 },
        );
      },
    }),
    (failure) => {
      assert.equal(failure.diagnostic.stage, 'upstream-quota');
      assert(!JSON.stringify(failure.diagnostic).includes(profile.apiKey));
      return true;
    },
  );
  assert.equal(requests, 1);
  await assert.rejects(
    compatibleRequest(profile, messages, {
      fetchImpl: async () => Response.json({ unexpectedNativeField: 'original diagnostic' }),
    }),
    (failure) => {
      assert.match(JSON.stringify(failure.diagnostic), /unexpectedNativeField/);
      return true;
    },
  );
  await assert.rejects(
    compatibleRequest(profile, messages, {
      fetchImpl: async () =>
        Response.json({
          candidates: [{ content: { parts: [{ text: '半截' }] }, finishReason: 'MAX_TOKENS' }],
        }),
    }),
    /截断/,
  );
  await assert.rejects(
    compatibleRequest(profile, messages, {
      fetchImpl: async () => Response.json({ promptFeedback: { blockReason: 'SAFETY' } }),
    }),
    /拒绝/,
  );
  await assert.rejects(
    compatibleRequest(profile, [], {
      models: true,
      fetchImpl: async () => {
        throw Error('must not call');
      },
    }),
    /手动|填写/,
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    compatibleRequest(profile, messages, {
      signal: controller.signal,
      fetchImpl: async (_url, options) => {
        options.signal.throwIfAborted();
      },
    }),
    { name: 'AbortError' },
  );
  await compatibleRequest({ ...profile, provider: 'openai' }, messages, {
    fetchImpl: async (url, options) => {
      assert.match(String(url), /\/chat\/completions$/);
      assert.equal(options.headers.Authorization, `Bearer ${profile.apiKey}`);
      return Response.json({ choices: [{ message: { content: 'compatible OK' } }] });
    },
  });
});

test('all six companion portraits compile by weapon and gender, survive restores and are excluded from enemy appearances', async () => {
  const fixture = JSON.parse(
    await readFile(new URL('./fixtures/silvia-character.json', import.meta.url), 'utf8'),
  );
  for (const template of PORTRAIT_TEMPLATES) {
    const raw = structuredClone(fixture);
    raw.setting.gender = template.gender === 'female' ? '女' : 'male';
    raw.data.weapon = template.weapon;
    const entry = normalizeCharacter(raw, 'character-template-test');
    assert.equal(entry.combat.portrait, template.portrait);
    const library = restoreLibrary({ version: 1, characters: [entry] });
    assert.equal(
      library.characters.find((member) => member.id === entry.id).combat.portrait,
      template.portrait,
    );
    assert(!worldReference().appearances.some((item) => item.portrait === template.portrait));
    const bytes = await readFile(
      new URL(`../assets/portraits/${template.portrait}`, import.meta.url),
    );
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert(bytes.length < 600000);
    assert.equal(
      portraitUrl({ portrait: template.portrait, customPortrait: 'custom.png' }),
      'custom.png',
    );
  }
});
