import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWorldKeywords } from '../src/app/worldbook-fields.js';
import { createPromptStore } from '../server/prompt-store.mjs';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';

test('ST comma keyword editor keeps regex commas and supports optional empty filters', () => {
  assert.deepEqual(parseWorldKeywords('遗迹，矿窟, /石,木/i, 遗迹'), ['遗迹', '矿窟', '/石,木/i']);
  assert.deepEqual(parseWorldKeywords(''), []);
  assert.deepEqual(parseWorldKeywords('/[a,b]+/i, 潮声'), ['/[a,b]+/i', '潮声']);
  assert.deepEqual(parseWorldKeywords('[变量], 门'), ['[变量]', '门']);
  assert.deepEqual(parseWorldKeywords('["a,b","门"]'), ['a,b', '门']);
});
test('a fresh imported preset library is empty while the internal neutral adapter remains available', async () => {
  const store = await createPromptStore(
    await mkdtemp(path.join(process.cwd(), '.runtime/tests/empty-presets-')),
  );
  assert.deepEqual(await store.list(), []);
  assert((await store.get('script-default')).preset.prompts.length > 0);
});
