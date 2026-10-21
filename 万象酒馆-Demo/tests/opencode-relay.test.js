import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { relayOpencode } from '../server/opencode-relay.mjs';
import { createOpencodeBrowserFetch } from '../src/ai/opencode-browser.js';

test('local relay preserves streams and targets while rejecting other hosts and cross-origin requests', async () => {
  const calls = [];
  const server = createServer((req, res) => {
    void relayOpencode(req, res, {
      port: server.address().port,
      fetchImpl: async (url, options) => {
        calls.push({ url: url.href, options });
        return new Response('data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        });
      },
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const target = 'https://opencode.ai/zen/go/v1/chat/completions';
  const headers = {
    'x-wanxiang-upstream': target,
    'Content-Type': 'application/json',
    Authorization: 'Bearer LOCAL_FIXTURE_KEY',
    'x-opencode-session': 'ses_test',
    'x-opencode-request': 'msg_test',
    'x-opencode-client': 'cli',
  };
  try {
    const response = await fetch(base, { method: 'POST', headers, body: '{"model":"fixture"}' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    assert.match(await response.text(), /OK/);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, target);
    assert.equal(calls[0].options.body.toString(), '{"model":"fixture"}');
    assert.equal(calls[0].options.headers.authorization, headers.Authorization);
    assert.equal(calls[0].options.headers['x-opencode-request'], 'msg_test');
    assert.equal(calls[0].options.redirect, 'error');
    for (const invalid of [
      { ...headers, Origin: 'https://unrelated.invalid' },
      { ...headers, 'x-wanxiang-upstream': 'https://other.invalid/chat/completions' },
      { ...headers, 'x-wanxiang-upstream': 'https://opencode.ai/account' },
      { ...headers, 'x-wanxiang-upstream': target + '?key=forbidden' },
    ]) {
      const rejected = await fetch(base, { method: 'POST', headers: invalid });
      assert([400, 403].includes(rejected.status));
      await rejected.text();
    }
    assert.equal(calls.length, 1);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('browser selects a confirmed loopback transport before requesting; production keeps direct fetch', async () => {
  const requests = [];
  const client = async (url, options) => {
    requests.push({ url: String(url), options });
    return Response.json({ opencodeRelay: true });
  };
  const root = 'http://127.0.0.1:4180/';
  const transport = await createOpencodeBrowserFetch(client, { root, pageUrl: root });
  const controller = new AbortController();
  await transport('https://opencode.ai/zen/go/v1/models', {
    headers: { Authorization: 'Bearer TEST' },
    signal: controller.signal,
  });
  assert.equal(requests[1].url, root + '__demo/opencode');
  assert.equal(requests[1].options.signal, controller.signal);
  assert.equal(
    requests[1].options.headers['x-wanxiang-upstream'],
    'https://opencode.ai/zen/go/v1/models',
  );
  await transport('https://other.invalid/v1/models');
  assert.equal(requests[2].url, 'https://other.invalid/v1/models');
  assert.equal(
    await createOpencodeBrowserFetch(client, {
      root: 'https://example.github.io/game/',
      pageUrl: 'https://example.github.io/game/',
    }),
    client,
  );
  const absent = async () => new Response('Not Found', { status: 404 });
  assert.equal(await createOpencodeBrowserFetch(absent, { root, pageUrl: root }), absent);
});

test('closing a browser request cancels its upstream relay request', async () => {
  let ready, cancelled;
  const started = new Promise((resolve) => {
    ready = resolve;
  });
  const aborted = new Promise((resolve) => {
    cancelled = resolve;
  });
  const server = createServer((req, res) => {
    void relayOpencode(req, res, {
      port: server.address().port,
      fetchImpl: (url, { signal }) =>
        new Promise((resolve, reject) => {
          ready();
          signal.addEventListener(
            'abort',
            () => {
              cancelled();
              reject(signal.reason);
            },
            { once: true },
          );
        }),
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const controller = new AbortController();
  try {
    const pending = fetch(`http://127.0.0.1:${server.address().port}`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'x-wanxiang-upstream': 'https://opencode.ai/zen/go/v1/chat/completions' },
      body: '{}',
    });
    await started;
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    await Promise.race([
      aborted,
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Upstream was not cancelled')), 2000);
        timer.unref();
      }),
    ]);
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
