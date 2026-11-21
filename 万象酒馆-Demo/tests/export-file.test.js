import test from 'node:test';
import assert from 'node:assert/strict';
import { exportJsonFile } from '../src/storage/export-file.js';

const ORIGIN = 'https://appassets.androidplatform.net';
const json = JSON.stringify({ note: '测试'.repeat(26000) });

function parseFrame(data) {
  const view = new DataView(data);
  const headerSize = view.getUint32(0, false);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 4, headerSize)));
  const body = new Uint8Array(data, 4 + headerSize);
  return { header, body };
}

function makeChannel() {
  const channel = new EventTarget();
  const frames = [];
  channel.postMessage = (data) => {
    frames.push(parseFrame(data));
  };
  channel.reply = (payload) => {
    channel.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(payload) }));
  };
  return { channel, frames };
}

function makeEnvironment(channel, overrides = {}) {
  return Object.assign(
    new EventTarget(),
    {
      location: { origin: ORIGIN },
      Blob,
      TextEncoder,
      crypto: globalThis.crypto,
      setTimeout,
      clearTimeout,
      wanxiangNativeExport: channel,
    },
    overrides,
  );
}

function waitForFrame(frames, predicate) {
  const deadline = Date.now() + 1000;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const found = frames.find(predicate);
      if (found) resolve(found);
      else if (Date.now() >= deadline) reject(Error('Missing native export message'));
      else setTimeout(tick, 0);
    };
    tick();
  });
}

test('native export streams full UTF8 body across 64KiB chunks and resolves on finish', async () => {
  const { channel, frames } = makeChannel();
  const environment = makeEnvironment(channel);

  const resultPromise = exportJsonFile(json, 'data.json', { environment, timeoutMs: 5000 });

  const begin = await waitForFrame(frames, (f) => f.header.op === 'begin');
  assert.equal(begin.header.name, 'data.json');
  assert.equal(begin.header.size, new TextEncoder().encode(json).length);
  channel.reply({ id: begin.header.id, ok: true, offset: 0 });

  const chunks = [];
  let offset = 0;
  while (offset < begin.header.size) {
    const chunk = await waitForFrame(
      frames,
      (f) => f.header.op === 'chunk' && f.header.offset === offset,
    );
    assert.ok(chunk.body.length <= 65536);
    chunks.push(chunk.body);
    offset += chunk.body.length;
    channel.reply({ id: chunk.header.id, ok: true, offset });
  }

  const combined = new Uint8Array(begin.header.size);
  let pos = 0;
  for (const c of chunks) {
    combined.set(c, pos);
    pos += c.length;
  }
  assert.equal(new TextDecoder().decode(combined), json);

  const finish = await waitForFrame(frames, (f) => f.header.op === 'finish');
  channel.reply({ id: finish.header.id, ok: true, done: true });

  assert.deepEqual(await resultPromise, { method: 'native' });
});

test('ignores other ids and rejects a finish response without completion', async () => {
  const { channel, frames } = makeChannel();
  const environment = makeEnvironment(channel);
  const resultPromise = exportJsonFile('{}', 'data.json', { environment, timeoutMs: 1000 });
  const rejected = assert.rejects(resultPromise, /保存未完成/);
  const begin = await waitForFrame(frames, (f) => f.header.op === 'begin');
  channel.reply({ id: 'another-export', ok: false, error: 'ignored' });
  channel.reply({ id: begin.header.id, ok: true, offset: 0 });
  const chunk = await waitForFrame(frames, (f) => f.header.op === 'chunk');
  channel.reply({ id: chunk.header.id, ok: true, offset: chunk.body.length });
  const finish = await waitForFrame(frames, (f) => f.header.op === 'finish');
  channel.reply({ id: finish.header.id, ok: true, done: false });
  await rejected;
});

test('cancelled error code is preserved and no download is started', async () => {
  const { channel, frames } = makeChannel();
  const environment = makeEnvironment(channel);

  const resultPromise = exportJsonFile('{}', 'data.json', { environment, timeoutMs: 1000 });
  const rejected = assert.rejects(resultPromise, { code: 'cancelled' });
  const begin = await waitForFrame(frames, (f) => f.header.op === 'begin');
  channel.reply({ id: begin.header.id, ok: true, offset: 0 });
  const chunk = await waitForFrame(frames, (f) => f.header.op === 'chunk');
  channel.reply({ id: chunk.header.id, ok: true, offset: chunk.body.length });
  const finish = await waitForFrame(frames, (f) => f.header.op === 'finish');
  channel.reply({ id: finish.header.id, ok: false, error: '已取消', code: 'cancelled' });
  await rejected;
});

test('missing native channel asks to update the Android package', async () => {
  const environment = makeEnvironment(undefined);
  await assert.rejects(
    exportJsonFile(json, 'data.json', { environment, timeoutMs: 5000 }),
    /请更新安卓安装包/,
  );
});

test('begin without reply times out and sends cancel', async () => {
  const { channel, frames } = makeChannel();
  const environment = makeEnvironment(channel);

  await assert.rejects(
    exportJsonFile(json, 'data.json', { environment, timeoutMs: 30, chooserTimeoutMs: 30 }),
    /导出超时/,
  );

  const cancel = await waitForFrame(frames, (f) => f.header.op === 'cancel');
  assert.ok(cancel.header.id);
});

test('non-APK origin falls back to browser download', async () => {
  const { channel } = makeChannel();
  const created = [];
  const environment = makeEnvironment(channel, {
    location: { origin: 'https://example.com' },
    URL: {
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {},
    },
    document: {
      createElement: () => {
        const el = { click: () => created.push(el), remove: () => {} };
        return el;
      },
      body: { appendChild: () => {} },
    },
  });

  const result = await exportJsonFile(json, 'data.json', { environment, timeoutMs: 5000 });
  assert.deepEqual(result, { method: 'download' });
  assert.equal(created[0]?.download, 'data.json');
});
