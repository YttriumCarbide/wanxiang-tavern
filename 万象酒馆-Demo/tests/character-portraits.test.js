import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { HEROES } from '../src/data.js';
import { newBattle, preview, makeAction } from '../src/engine.js';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { portraitUrl, savedPortrait } from '../src/portraits.js';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import {
  importRemotePortrait,
  portraitImageURL,
  publicImageAddress,
} from '../server/portrait-images.mjs';

test('长景月汐 replaces the first companion while old party IDs, other settings and history survive', () => {
  const library = newLibrary();
  const old = structuredClone(library);
  old.characters[0].setting = { name: '格雷', worldbook: '旧格雷的私人编辑', edited: true };
  old.characters[1].setting.worldbook = '仍然保留的其他人物设定';
  old.characters[1].setting.edited = true;
  old.history = [{ runId: 'past', lines: ['旧的故事'] }];
  const restored = restoreLibrary(old);
  assert.equal(restored.characters[0].setting.name, '长景月汐');
  assert(restored.characters[0].setting.worldbook.includes('王国公主'));
  assert(!restored.characters[0].setting.worldbook.includes('私人编辑'));
  assert.equal(restored.characters[1].setting.worldbook, old.characters[1].setting.worldbook);
  assert.deepEqual(restored.party, old.party);
  assert.deepEqual(restored.history, old.history);
  assert.equal(portraitUrl(HEROES[0]), './assets/portraits/changjing-yuexi.png');
  assert.equal(savedPortrait({ aegis: 'old-guardian' }, restored.characters[0]), undefined);
  assert.equal(
    savedPortrait({ 'official-aegis': 'new-user-picture' }, restored.characters[0]),
    'new-user-picture',
  );
  const state = newBattle(['warden']);
  const action = makeAction(state, 'aegis', 'bastion', 'warden', 0);
  const result = preview(state, [action]);
  assert(result.valid);
  assert.equal(result.final.units.warden.buffs.vulnerable, 1);
  assert.equal(result.final.units.aegis.mp, 15);
});

test('official worldbook migration replaces only the former 格雷 entry and preserves injection controls', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/fan-worldbook-'));
  const store = await createWorldbookStore(directory);
  const { book } = await store.get('tavern-world');
  const entry = Object.values(book.entries).find(
    (entry) => entry.extensions?.wanxiang?.characterId === 'official-aegis',
  );
  entry.comment = '人物详情：格雷';
  entry.content = '姓名：格雷\n职业：铁卫';
  entry.order = 321;
  entry.depth = 3;
  await store.save({ id: 'tavern-world', book });
  await writeFile(path.join(directory, 'builtin-content.json'), JSON.stringify({ version: 9 }));
  const restored = await createWorldbookStore(directory);
  const updated = Object.values((await restored.get('tavern-world')).book.entries).find(
    (item) => item.uid === entry.uid,
  );
  assert.equal(updated.comment, '人物详情：长景月汐');
  assert(updated.content.includes('星月剑士'));
  assert.equal(updated.order, 321);
  assert.equal(updated.depth, 3);
});

test('image-host imports follow public redirects, validate image bytes and reject local targets/oversize/non-images', async () => {
  const bytes = await readFile(new URL('../assets/portraits/fan-yuexi.webp', import.meta.url));
  const addresses = [{ address: '93.184.216.34', family: 4 }];
  const calls = [];
  const result = await importRemotePortrait('https://images.example/portrait', {
    lookup: async () => addresses,
    read: async (url, pinned) => {
      assert.deepEqual(pinned, addresses);
      calls.push(url.href);
      return calls.length === 1 ? { status: 302, location: '/final.webp' } : { status: 200, bytes };
    },
  });
  assert(result.dataUrl.startsWith('data:image/webp;base64,'));
  assert.equal(calls.length, 2);
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '192.168.2.1',
    '169.254.169.254',
    '::1',
    '0:0:0:0:0:0:0:1',
    '::ffff:127.0.0.1',
    'fd00::2',
  ])
    assert.equal(publicImageAddress(address), false, address);
  for (const value of [
    'file:///private.png',
    'javascript:alert(1)',
    'http://localhost/a',
    'http://2130706433/a',
    'https://user:password@example.com/a',
  ])
    assert.throws(() => portraitImageURL(value));
  await assert.rejects(
    importRemotePortrait('https://images.example/a', {
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    }),
    /内网/,
  );
  await assert.rejects(
    importRemotePortrait('https://images.example/a', {
      lookup: async () => addresses,
      read: async () => ({ status: 302, location: 'http://127.0.0.1/private' }),
    }),
    /公网/,
  );
  await assert.rejects(
    importRemotePortrait('https://images.example/a', {
      lookup: async () => addresses,
      read: async () => ({ status: 200, bytes: Buffer.from('<html>not an image</html>') }),
    }),
    /直链/,
  );
  await assert.rejects(
    importRemotePortrait('https://images.example/a', {
      lookup: async () => addresses,
      read: async () => ({ status: 200, bytes: Buffer.alloc(6 * 1024 * 1024 + 1) }),
    }),
    /6MB/,
  );
});
