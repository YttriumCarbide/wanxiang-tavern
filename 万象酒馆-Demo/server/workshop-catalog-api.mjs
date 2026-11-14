import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { WORKSHOP_CATALOG } from '../src/content/workshop-catalog.js';
import { validateWorkshopCatalog } from '../src/workshop/catalog.js';
import { atomicWrite } from './disk-store.mjs';

export function createWorkshopCatalogApi({ directory, port }) {
  const file = path.join(directory, '工坊配置.json');
  let writes = Promise.resolve();

  async function readCatalog() {
    let catalog = WORKSHOP_CATALOG;
    let custom = false;
    try {
      catalog = validateWorkshopCatalog(JSON.parse(await readFile(file, 'utf8')));
      custom = true;
    } catch (failure) {
      if (failure.code !== 'ENOENT') throw failure;
    }
    const revision = createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
    return { catalog, custom, revision };
  }

  return async (request, response) => {
    const host = request.headers.host;
    const origin = request.headers.origin;
    if (
      ![`127.0.0.1:${port}`, `localhost:${port}`].includes(host) ||
      (origin && origin !== `http://${host}`) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    )
      return response.writeHead(403).end();
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      if (request.method === 'GET') return response.end(JSON.stringify(await readCatalog()));
      if (request.method !== 'PUT') return response.writeHead(405).end();
      if (origin !== `http://${host}`) return response.writeHead(403).end();
      if (!request.headers['content-type']?.startsWith('application/json'))
        return response.writeHead(415).end();
      const chunks = [];
      let bytes = 0;
      for await (const chunk of request) {
        bytes += chunk.length;
        if (bytes > 2_000_000)
          return response.writeHead(413).end(JSON.stringify({ error: '工坊配置超过 2 MB' }));
        chunks.push(chunk);
      }
      let catalog;
      try {
        catalog = validateWorkshopCatalog(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (failure) {
        return response.writeHead(400).end(JSON.stringify({ error: failure.message }));
      }
      const commit = writes
        .catch(() => {})
        .then(async () => {
          const current = await readCatalog();
          if (request.headers['if-match'] !== `"${current.revision}"`) return null;
          const text = JSON.stringify(catalog, null, 2) + '\n';
          if (
            current.custom &&
            createHash('sha256').update(JSON.stringify(catalog)).digest('hex') === current.revision
          )
            return current;
          await mkdir(directory, { recursive: true });
          if (current.custom)
            await atomicWrite(file + '.bak', JSON.stringify(current.catalog, null, 2) + '\n');
          await atomicWrite(file, text);
          return readCatalog();
        });
      writes = commit;
      const saved = await commit;
      if (!saved)
        return response
          .writeHead(409)
          .end(JSON.stringify({ error: '游戏配置已被其他窗口修改，请先重读游戏配置。' }));
      return response.end(JSON.stringify(saved));
    } catch (failure) {
      return response
        .writeHead(500)
        .end(JSON.stringify({ error: '无法读取或写入工坊配置：' + failure.message }));
    }
  };
}
