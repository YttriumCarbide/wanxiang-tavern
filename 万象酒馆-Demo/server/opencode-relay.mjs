import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createRequestScope } from '../src/ai/request-policy.js';
import { readRequestBytes, RequestBodyError } from './request-json.mjs';

/** Optional loopback transport. No credential storage, general proxy, or game logic. */
export async function relayOpencode(req, res, { port, fetchImpl = fetch }) {
  const hosts = [`127.0.0.1:${port}`, `localhost:${port}`];
  const origin = req.headers.origin;
  if (
    !hosts.includes(req.headers.host) ||
    (origin !== undefined && origin !== `http://${req.headers.host}`)
  ) {
    res.writeHead(403, { Connection: 'close' }).end('Local origin required');
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
    res.writeHead(400, { Connection: 'close' }).end('Unsupported OpenCode endpoint');
    return;
  }
  const scope = createRequestScope();
  const cancel = () => {
    if (!res.writableFinished) scope.abort();
  };
  res.once('close', cancel);
  if (res.destroyed) cancel();
  try {
    const body = await readRequestBytes(req, 2_000_000, scope.signal);
    scope.signal.throwIfAborted();
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
      ...(req.method === 'POST' ? { body } : {}),
      signal: scope.signal,
      redirect: 'error',
    });
    res.writeHead(response.status, {
      'Content-Type': response.headers.get('content-type') || 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (response.body)
      await pipeline(Readable.fromWeb(response.body), res, { signal: scope.signal });
    else res.end();
  } catch (failure) {
    scope.abort();
    if (!res.headersSent && !res.destroyed) {
      if (failure instanceof RequestBodyError && failure.status === 413) {
        res.writeHead(413, { Connection: 'close' }).end('Request too large');
        return;
      }
      if (!req.complete) res.setHeader('Connection', 'close');
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: { message: '本地 OpenCode 转发已中断，请检查网络。未自动重试。' },
        }),
      );
    } else if (!res.destroyed) res.destroy();
  } finally {
    scope.close();
    res.off('close', cancel);
  }
}
