import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createPortraitStore } from '../server/portrait-store.mjs';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { restoreGenerationOptions } from '../src/generation-options.js';
import { packagePortraitAssets, restorePortraitAssets } from '../src/portrait-archive.js';

test('portable saves carry one original image and restore it before storing lightweight references', async () => {
  const url = '/api/ai/portraits/' + 'a'.repeat(64) + '.png';
  const snapshot = {
    data: {
      library: { characters: [{ combat: { customPortrait: url } }] },
      customPortraits: { hero: url },
    },
  };
  const bytes = new Uint8Array([137, 80, 78, 71, 255, 0, 128]);
  let reads = 0;
  const portable = await packagePortraitAssets(snapshot, async (path) => {
    assert.equal(path, url);
    reads++;
    return new Response(bytes, { headers: { 'content-type': 'image/png' } });
  });
  assert.equal(reads, 1);
  assert(!snapshot.data.portraitAssets);
  const restored = await restorePortraitAssets(portable, async (path, options) => {
    assert.equal(path, '/api/ai/portrait/save');
    assert.deepEqual(
      Buffer.from(JSON.parse(options.body).dataUrl.split(',')[1], 'base64'),
      Buffer.from(bytes),
    );
    return Response.json({ url });
  });
  assert.deepEqual(restored, snapshot);
  await assert.rejects(
    () => packagePortraitAssets(snapshot, async () => new Response('', { status: 404 })),
    /导出立绘失败/,
  );
});

test('original portrait bytes and color profile survive storage and service restart without recompression', async () => {
  const directory = await mkdtemp(path.join(process.cwd(), '.runtime/tests/portrait-original-'));
  const bytes = await readFile(new URL('../assets/portraits/pandora.png', import.meta.url));
  const store = await createPortraitStore(directory);
  const result = await store.save('data:image/png;base64,' + bytes.toString('base64'));
  const filename = result.url.split('/').at(-1);
  assert.equal((await store.read(filename)).mime, 'image/png');
  assert.deepEqual((await store.read(filename)).bytes, bytes);
  assert.deepEqual((await (await createPortraitStore(directory)).read(filename)).bytes, bytes);
  await assert.rejects(() => store.save('data:image/png;base64,QUJD'), /图片/);
  await assert.rejects(() => store.read('../ai-config.json'), /引用/);
});

test('AI defaults preserve an existing Qingyuan for explicit developer fallback', () => {
  assert.deepEqual(restoreGenerationOptions(null), {
    skipAiGeneration: false,
    protagonistApi: true,
    scriptApi: true,
    developerMode: false,
    allowRetreat: false,
    editArchives: false,
    tavernVisitors: false,
  });
  const initial = defaultProtagonist({ characters: [] });
  assert.equal(initial.setting.name, '青缘');
  assert.equal(initial.combat.weapon, 'sword');
  initial.combat.customPortrait = '/api/ai/portraits/' + 'a'.repeat(64) + '.png';
  initial.combat.attack = 11;
  const reused = defaultProtagonist({ characters: [initial] });
  assert.deepEqual(reused, initial);
  assert.notEqual(reused, initial);
});
