import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnectionStore } from '../src/ai/connection-store.js';
import { exportDatabase, readDatabaseBackup } from '../src/storage/backup.js';

const connection = {
  baseUrl: 'https://fixture.invalid/v1',
  model: 'fixture',
  apiKey: 'DEVICE_FIXTURE_KEY',
  tokenField: 'max_tokens',
  requestMode: 'browser',
  rememberKey: true,
};

test('ordinary backups exclude keys without silently switching remembered connections to session-only', async () => {
  let saved;
  const settings = createConnectionStore({
    save: async (value) => (saved = structuredClone(value)),
  });
  await settings.saveProfile({ ...connection, kind: 'script' });
  await settings.preset({ kind: 'script', action: 'save', name: '设备连接' });
  const backup = await exportDatabase(
    {
      entries: () => [
        ['installation', { version: 1 }],
        ['game.wanxiang.worldbooks.v1', '{}'],
        ['api.config', saved],
      ],
    },
    { getItem: () => null },
  );
  assert(!JSON.stringify(backup).includes(connection.apiKey));
  const restored = readDatabaseBackup(backup).entries.find(([key]) => key === 'api.config')[1];
  assert.equal(restored.profiles.script.rememberKey, true);
  assert.equal(restored.profiles.script.apiKey, '');
  assert.equal(restored.apiPresets[0].rememberKey, true);
  assert.equal(
    saved.profiles.script.apiKey,
    connection.apiKey,
    'export must not mutate local credentials',
  );
  await settings.saveProfile({ ...connection, kind: 'script', rememberKey: false });
  const sessionBackup = await exportDatabase({ entries: () => [['api.config', saved]] }, {});
  assert.equal(
    sessionBackup.entries[0][1].profiles.script.rememberKey,
    false,
    'an explicit opt-out remains an opt-out',
  );
});

test('saving a missing preset key to the device repairs that selected preset and survives applying it to all purposes', async () => {
  let saved;
  const settings = createConnectionStore({
    snapshot: {
      version: 4,
      profiles: {
        script: { ...connection, apiKey: '', rememberKey: false, apiPresetId: 'api-old' },
      },
      apiPresets: [
        { ...connection, apiKey: '', rememberKey: false, id: 'api-old', name: '旧连接' },
      ],
    },
    save: async (value) => (saved = structuredClone(value)),
  });
  await settings.saveProfile({ ...connection, kind: 'script' });
  for (const kind of ['character', 'script', 'chat', 'quick-chat', 'summary', 'creation', 'map'])
    await settings.preset({ kind, action: 'apply', id: 'api-old' });
  const reopened = createConnectionStore({ snapshot: saved });
  for (const profile of Object.values(reopened.visible()))
    assert(profile.hasApiKey && profile.rememberKey);
  assert(!JSON.stringify(reopened.visible()).includes(connection.apiKey));
});

test('a redacted selected preset cannot erase an existing matching key, but a different endpoint does not inherit it', async () => {
  const settings = createConnectionStore({
    snapshot: {
      version: 4,
      profiles: { script: { ...connection, apiPresetId: 'api-redacted' } },
      apiPresets: [
        { ...connection, apiKey: '', rememberKey: false, id: 'api-redacted', name: '旧导入连接' },
        {
          ...connection,
          baseUrl: 'https://other.invalid/v1',
          apiKey: '',
          id: 'api-other',
          name: '另一服务',
        },
      ],
    },
  });
  await settings.preset({ kind: 'script', action: 'apply', id: 'api-redacted' });
  assert.equal(settings.get('script').apiKey, connection.apiKey);
  assert.equal(settings.get('script').rememberKey, true);
  await settings.preset({ kind: 'script', action: 'apply', id: 'api-other' });
  assert.equal(settings.get('script').apiKey, '');
});

test('a failed durable save cannot leave a new unsaved key appearing configured in memory', async () => {
  const settings = createConnectionStore({
    save: async () => {
      throw Error('simulated disk failure');
    },
  });
  await assert.rejects(settings.saveProfile({ ...connection, kind: 'script' }), /未能写入/);
  assert.equal(settings.visible().script.hasApiKey, false);
  assert.equal(settings.get('script').apiKey, '');
});

test('promoting a session-only connection also persists its selected matching preset', async () => {
  let saved;
  const settings = createConnectionStore({
    save: async (value) => (saved = structuredClone(value)),
  });
  const temporary = { ...connection, kind: 'script', rememberKey: false };
  await settings.preset({ kind: 'script', action: 'save', name: '临时连接', profile: temporary });
  const id = settings.get('script').apiPresetId;
  assert.equal(saved.apiPresets[0].apiKey, '');
  await settings.saveProfile({ ...temporary, rememberKey: true });
  await settings.preset({ kind: 'chat', action: 'apply', id });
  const reopened = createConnectionStore({ snapshot: saved });
  assert.equal(reopened.get('script').apiKey, connection.apiKey);
  assert.equal(reopened.get('chat').apiKey, connection.apiKey);
  await settings.saveProfile(temporary);
  assert.equal(createConnectionStore({ snapshot: saved }).get('script').apiKey, '');
});
