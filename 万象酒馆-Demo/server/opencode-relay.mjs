import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { REQUEST_TIMEOUT_MS } from '../src/ai/request-policy.js';

/** Optional loopback transport. No credential storage, general proxy, or game logic. */
export async function relayOpencode(req, res, { port, fetchImpl = fetch }) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  const origin = req.headers.origin;
  if (!hosts.includes(req.headers.host) || (origin && origin !== `http://${req.headers.host}`)) {
    res.writeHead(403).end('Local origin required');
    return;
  }
  let target;
  try {
    target = new URL(req.headers['x-wanxiang-upstream']);
    if (
      target.protocol !== 'https:' ||
      target.hostname !== 'opencode.ai' ||
      target.port ||
      target.username ||
      target.password ||
      target.search ||
      target.hash ||
      !/^\/(?:zen\/go\/v1|inference\/go\/openai\/v1)\/(?:models|chat\/completions)$/.test(
        target.pathname,
      )
    )
      throw Error('Invalid target');
    const expected = target.pathname.endsWith('/models') ? 'GET' : 'POST';
    if (req.method !== expected) throw Error('Invalid method');
  } catch {
    res.writeHead(400).end('Unsupported OpenCode endpoint');
    return;
  }
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, REQUEST_TIMEOUT_MS);
  req.once('aborted', abort);
  res.once('close', abort);
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 2000000) {
        res.writeHead(413).end('Request too large');
        return;
      }
      chunks.push(chunk);
    }
    const headers = { 'User-Agent': 'wanxiang-tavern/1.0' };
    for (const name of [
      'authorization',
      'content-type',
      'x-opencode-session',
      'x-opencode-request',
      'x-opencode-client',
    ]) {
      if (typeof req.headers[name] === 'string') headers[name] = req.headers[name];
    }
    const response = await fetchImpl(target, {
      method: req.method,
      headers,
      ...(req.method === 'POST' ? { body: Buffer.concat(chunks) } : {}),
      signal: controller.signal,
      redirect: 'error',
    });
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (response.body)
      await pipeline(Readable.fromWeb(response.body), res, { signal: controller.signal });
    else res.end();
  } catch {
    if (!res.headersSent && !res.destroyed) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { message: '本地 OpenCode 转发已中断，请检查网络。未自动重试。' },
        }),
      );
    } else if (!res.destroyed) res.destroy();
  } finally {
    clearTimeout(timer);
    req.removeListener('aborted', abort);
    res.removeListener('close', abort);
  }
}
