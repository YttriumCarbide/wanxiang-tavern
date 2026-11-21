import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { readRequestJson } from '../server/request-json.mjs';
import { createWorldbookStore } from '../server/worldbook-store.mjs';

function requestFrom(chunks, contentType = 'application/json') {
  const req = Readable.from(chunks);
  req.headers = { 'content-type': contentType };
  return req;
}

test('readRequestJson reassembles a UTF-8 character split across two buffers', async () => {
  const text = '{"name":"万象酒馆"}';
  const bytes = Buffer.from(text, 'utf8');
  const splitAt = bytes.indexOf(Buffer.from('酒', 'utf8')) + 1;
  const first = bytes.subarray(0, splitAt);
  const second = bytes.subarray(splitAt);
  assert(first.length > 0 && second.length > 0);
  const result = await readRequestJson(requestFrom([first, second]));
  assert.deepEqual(result, { name: '万象酒馆' });
});

test('readRequestJson rejects a body that exceeds the byte limit only on the final chunk', async () => {
  const limit = 16;
  const head = Buffer.from('{"a":"', 'utf8');
  const tail = Buffer.from('x'.repeat(limit) + '"}', 'utf8');
  assert(head.length < limit);
  await assert.rejects(readRequestJson(requestFrom([head, tail]), limit));
});

test('readRequestJson rejects a non application/json content type', async () => {
  await assert.rejects(readRequestJson(requestFrom([Buffer.from('{}')], 'text/plain')));
});

test('readRequestJson rejects a body that is not valid JSON', async () => {
  await assert.rejects(readRequestJson(requestFrom([Buffer.from('{not json')])));
});

test('commit failure leaves state at step 0 and a retry with expectedStep 0 persists step 1', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wanxiang-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await createWorldbookStore(directory);

  const blocker = path.join(directory, 'state.json');
  await mkdir(blocker);

  await assert.rejects(store.commit('chat', { step: 1, effects: {} }, 0));
  assert.equal((await store.resolve('chat')).state.step, 0);

  await rm(blocker, { recursive: true, force: true });
  assert.equal(await store.commit('chat', { step: 1, effects: {} }, 0), true);
  assert.equal((await store.resolve('chat')).state.step, 1);

  const reopened = await createWorldbookStore(directory);
  assert.equal((await reopened.resolve('chat')).state.step, 1);
  const persisted = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
  assert.equal(persisted.chat.step, 1);
});

test('concurrent commits at the same expectedStep let only one succeed', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wanxiang-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await createWorldbookStore(directory);

  const results = await Promise.all([
    store.commit('chat', { step: 1, effects: { a: 1 } }, 0),
    store.commit('chat', { step: 1, effects: { b: 2 } }, 0),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal((await store.resolve('chat')).state.step, 1);
});

test('concurrent commits of different kinds do not overwrite each other', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wanxiang-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await createWorldbookStore(directory);

  const results = await Promise.all([
    store.commit('chat', { step: 1, effects: { chat: true } }, 0),
    store.commit('script', { step: 1, effects: { script: true } }, 0),
  ]);
  assert.deepEqual(results, [true, true]);

  const reopened = await createWorldbookStore(directory);
  const chat = await reopened.resolve('chat');
  const script = await reopened.resolve('script');
  assert.equal(chat.state.step, 1);
  assert.equal(script.state.step, 1);
  assert.deepEqual(chat.state.effects, { chat: true });
  assert.deepEqual(script.state.effects, { script: true });
});

test('a cancelled worldbook commit can be retried at the same step', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'wanxiang-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const store = await createWorldbookStore(directory);
  const aborted = AbortSignal.abort();
  const next = { step: 1, effects: {} };
  await assert.rejects(store.commit('chat', next, 0, aborted), { name: 'AbortError' });
  assert.equal((await store.resolve('chat')).state.step, 0);
  assert.equal(await store.commit('chat', next, 0), true);
});
