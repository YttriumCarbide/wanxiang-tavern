import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import {
  serviceAccountToken,
  validateServiceAccount,
  readServiceAccount,
  serviceAccountBase,
} from '../src/ai/vertex-service-account.js';
import { compatibleRequest } from '../src/ai/compatible.js';
import { createConnectionStore } from '../src/ai/connection-store.js';
import { exportDatabase } from '../src/storage/backup.js';

function fixture() {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return {
    pair,
    text: JSON.stringify(
      {
        type: 'service_account',
        project_id: 'tavern-fixture',
        client_email: 'tavern@tavern-fixture.iam.gserviceaccount.com',
        private_key_id: 'test-key',
        private_key: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
        token_uri: 'https://untrusted.invalid/token',
      },
      null,
      2,
    ),
  };
}

test('service account signs RS256 locally and exchanges only the assertion at Google, honoring cancellation', async () => {
  const { text, pair } = fixture();
  assert.equal((await validateServiceAccount(text)).project, 'tavern-fixture');
  assert.throws(() => readServiceAccount('{"type":"authorized_user"}'));
  assert.throws(() => serviceAccountBase('tavern-fixture', 'evil.invalid'));
  const calls = [];
  const fetchImpl = async (url, request) => {
    calls.push(String(url));
    assert.equal(String(url), 'https://oauth2.googleapis.com/token');
    assert(!request.body.includes('PRIVATE KEY'));
    const jwt = new URLSearchParams(request.body).get('assertion').split('.');
    assert.equal(JSON.parse(Buffer.from(jwt[0], 'base64url')).alg, 'RS256');
    const claims = JSON.parse(Buffer.from(jwt[1], 'base64url'));
    assert.equal(claims.aud, String(url));
    assert.equal(claims.exp - claims.iat, 3600);
    assert.equal(claims.scope, 'https://www.googleapis.com/auth/cloud-platform');
    assert(
      verify(
        'RSA-SHA256',
        Buffer.from(jwt.slice(0, 2).join('.')),
        pair.publicKey,
        Buffer.from(jwt[2], 'base64url'),
      ),
    );
    return Response.json({ access_token: 'fixture-access-token' });
  };
  assert.equal(await serviceAccountToken(text, { fetchImpl }), 'fixture-access-token');
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(() => serviceAccountToken(text, { fetchImpl, signal: controller.signal }), {
    name: 'AbortError',
  });
  assert.equal(calls.length, 1);
});

test('Vertex generation exchanges authentication once, sends Bearer and never private JSON to model', async () => {
  const { text } = fixture();
  const calls = [];
  const profile = {
    provider: 'vertex',
    vertexAuth: 'service-account',
    apiKey: text,
    baseUrl: serviceAccountBase('tavern-fixture'),
    model: 'manually-entered-model',
    temperature: null,
    tokenField: 'max_tokens',
    maxTokens: 1024,
  };
  const result = await compatibleRequest(profile, [{ role: 'user', content: '生成文字' }], {
    sampling: { top_k: 0 },
    fetchImpl: async (url, options) => {
      calls.push(String(url));
      if (String(url).includes('oauth2.googleapis.com'))
        return Response.json({ access_token: 'fixture-access-token' });
      assert.equal(options.headers.Authorization, 'Bearer fixture-access-token');
      assert.equal(Object.hasOwn(JSON.parse(options.body).generationConfig, 'topK'), false);
      assert(!options.body.includes('PRIVATE KEY'));
      assert(
        String(url).includes(
          '/projects/tavern-fixture/locations/global/publishers/google/models/manually-entered-model:generateContent',
        ),
      );
      return Response.json({
        candidates: [{ content: { parts: [{ text: '成功' }] }, finishReason: 'STOP' }],
      });
    },
  });
  assert.equal(result.content, '成功');
  assert.equal(calls.length, 2);
  let count = 0;
  await assert.rejects(
    () =>
      compatibleRequest(profile, [], {
        fetchImpl: async () => {
          count++;
          return Response.json({ error: 'invalid_grant' }, { status: 400 });
        },
      }),
    /服务账号认证失败/,
  );
  assert.equal(count, 1, 'Authentication failure must not trigger a model request or retry');
});

test('service JSON persists privately with connection presets and is stripped from backups and visible profiles', async () => {
  const { text } = fixture();
  let saved;
  const store = createConnectionStore({
    save: async (value) => {
      saved = value;
    },
  });
  await store.saveProfile({
    kind: 'map',
    provider: 'vertex',
    vertexAuth: 'service-account',
    vertexLocation: 'global',
    baseUrl: 'https://aiplatform.googleapis.com/v1',
    model: 'user-model',
    apiKey: text,
    tokenField: 'max_tokens',
  });
  assert.equal(store.get('map').apiKey, text.trim());
  assert(!JSON.stringify(store.visible()).includes('PRIVATE KEY'));
  assert.equal(store.visible().map.vertexProject, 'tavern-fixture');
  await store.preset({ kind: 'map', action: 'save', name: '服务账号' });
  const preset = store.listPresets()[0];
  await store.preset({ kind: 'creation', action: 'apply', id: preset.id });
  assert.equal(store.get('creation').vertexAuth, 'service-account');
  assert.equal(store.get('creation').apiKey, text.trim());
  const restored = createConnectionStore({ snapshot: saved });
  assert.equal(restored.get('creation').apiKey, text.trim());
  const backup = await exportDatabase({ entries: () => [['api.config', saved]] }, {});
  assert(!JSON.stringify(backup).includes('PRIVATE KEY'));
  assert(!JSON.stringify(backup).includes('fixture-access-token'));
});
