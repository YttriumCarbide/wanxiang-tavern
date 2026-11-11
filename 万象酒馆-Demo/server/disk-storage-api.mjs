import { randomBytes, randomUUID } from 'node:crypto';
import { unlinkSync } from 'node:fs';
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createDiskStore } from './disk-store.mjs';

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (failure) {
    if (failure.code === 'ESRCH') return false;
    throw failure;
  }
}

async function claimDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const name = '.writer-' + process.pid + '-' + randomUUID() + '.lock';
  const file = path.join(directory, name);
  await writeFile(file, '', { flag: 'wx', mode: 0o600 });
  try {
    for (const other of await readdir(directory)) {
      const match = /^\.writer-([1-9][0-9]*)-[a-f0-9-]{36}\.lock$/.exec(other);
      if (other !== name && match && processExists(Number(match[1]))) {
        const failure = Error('另一个本地游戏服务正在使用此存档，请先关闭该服务。');
        failure.status = 409;
        throw failure;
      }
    }
  } catch (failure) {
    await unlink(file);
    throw failure;
  }
  process.once('exit', () => {
    try {
      unlinkSync(file);
    } catch {
      // The next service ignores leases from processes that have exited.
    }
  });
}

async function requestBody(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 64 * 1024 * 1024) throw Error('单次存档数据超过64MB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Only the loopback game page can read or write this machine's private save directory. */
export function createDiskStorageApi({ directory, port }) {
  const store = createDiskStore({ directory });
  const token = randomBytes(32).toString('hex');
  let lease = null;
  function claim() {
    lease ||= claimDirectory(directory).catch((failure) => {
      lease = null;
      throw failure;
    });
    return lease;
  }
  return async (request, response) => {
    const host = request.headers.host;
    if (
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(host) ||
      (request.headers.origin && request.headers.origin !== 'http://' + host) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    ) {
      response.writeHead(403).end();
      return;
    }
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (request.method === 'GET') {
        await claim();
        response.end(JSON.stringify({ ...(await store.snapshot()), token }));
        return;
      }
      if (request.method !== 'POST') {
        response.writeHead(405).end();
        return;
      }
      if (request.headers['x-tavern-storage'] !== token) {
        response.writeHead(403).end();
        return;
      }
      if (!request.headers['content-type']?.startsWith('application/json')) {
        response.writeHead(415).end();
        return;
      }
      await claim();
      const value = await store.write(await requestBody(request));
      response.end(JSON.stringify(value));
    } catch (failure) {
      response.statusCode = failure.status || 500;
      response.end(JSON.stringify({ error: failure.message }));
    }
  };
}
