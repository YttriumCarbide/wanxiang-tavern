import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDiskStore } from '../server/disk-store.mjs';

async function saveDirectory(t) {
  const parent = path.resolve(tmpdir());
  const directory = await mkdtemp(path.join(parent, 'wanxiang-disk-test-'));
  assert.equal(path.dirname(directory), parent);
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

const progress = 'game.wanxiang.worldbooks.v1';

test('disk commits survive reopen, reject a stale writer, and restore a corrupt head', async (t) => {
  const directory = await saveDirectory(t);
  let time = Date.now();
  const store = createDiskStore({ directory, now: () => time, backupCount: 2 });
  assert.equal((await store.snapshot()).revision, 0);
  const bytes = Buffer.from('R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=', 'base64');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const portrait = 'portrait.' + hash + '.gif';
  const image = { blob: true, mime: 'image/gif', base64: bytes.toString('base64') };
  await store.write({
    revision: 0,
    entries: [
      ['installation', { version: 1 }],
      [progress, 'first'],
      [portrait, image],
    ],
    deleted: [],
  });
  for (let revision = 1; revision <= 4; revision++) {
    time += 61000;
    await store.write({ revision, entries: [[progress, 'save-' + revision]], deleted: [] });
  }
  assert.equal((await readdir(path.join(directory, '备份'))).length, 2);
  await assert.rejects(store.write({ revision: 1, entries: [[progress, 'stale']], deleted: [] }), {
    status: 409,
  });
  await assert.rejects(
    store.write({ revision: 5, entries: [['api.config', { apiKey: 'secret' }]], deleted: [] }),
    /名称无效/,
  );

  const current = path.join(directory, '当前存档.json');
  const raw = await readFile(current, 'utf8');
  assert(!raw.includes(image.base64));
  const reopened = createDiskStore({ directory });
  assert.deepEqual(new Map((await reopened.snapshot()).entries).get(portrait), image);

  await writeFile(current, 'damaged file');
  const recovered = await createDiskStore({ directory }).snapshot();
  assert.equal(recovered.revision, 4);
  assert.equal(new Map(recovered.entries).get(progress), 'save-3');
  assert((await readdir(directory)).some((file) => file.startsWith('损坏存档-')));
  assert.equal(JSON.parse(await readFile(current, 'utf8')).revision, 4);
});

test('a damaged sole save is preserved and cannot be replaced by a new campaign', async (t) => {
  const directory = await saveDirectory(t);
  const file = path.join(directory, '当前存档.json');
  await writeFile(file, 'truncated');
  const store = createDiskStore({ directory });
  await assert.rejects(store.snapshot(), /磁盘存档损坏/);
  await assert.rejects(
    store.write({ revision: 0, entries: [[progress, 'fresh']], deleted: [] }),
    /磁盘存档损坏/,
  );
  assert.equal(await readFile(file, 'utf8'), 'truncated');
});
