import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import {
  chunkIdentity,
  UPDATE_SCHEMA,
  validateIndex,
  validateManifest,
} from '../src/updates/manifest.js';

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function fileDigest(file) {
  const hash = createHash('sha256');
  for await (const bytes of createReadStream(file)) hash.update(bytes);
  return hash.digest('hex');
}

export async function buildUpdateManifests(destination, version, files, plan, env = process.env) {
  const { updates } = plan;
  const onDemand = new Set(
    plan.groups.filter((group) => group.delivery === 'on-demand').map(({ id }) => id),
  );
  for (const id of updates.background)
    if (!onDemand.has(id)) throw Error('Unknown or non-deferred background chunk: ' + id);
  const groups = plan.groups.map(({ id, delivery, match }) => ({
    patterns: match.map((pattern) => new RegExp(pattern)),
    chunk: {
      id,
      delivery: updates.background.includes(id) ? 'background' : delivery,
      priority: updates.priorities[id],
      bytes: 0,
      sha256: '',
      files: [],
    },
  }));
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    const group = groups.find(({ patterns }) =>
      patterns.some((pattern) => pattern.test(file.path)),
    );
    if (!group) throw Error('No update chunk for ' + file.path);
    group.chunk.files.push({
      ...file,
      sha256: await fileDigest(path.join(destination, file.path)),
    });
    group.chunk.bytes += file.bytes;
  }
  const chunks = groups.map(({ chunk }) => {
    chunk.sha256 = digest(chunkIdentity(chunk.files));
    return chunk;
  });
  const index = { schemaVersion: UPDATE_SCHEMA, version, chunks, gates: updates.gates };
  await validateIndex(index, version);
  const indexBytes = Buffer.from(JSON.stringify(index, null, 2) + '\n');
  const sources = updates.mirrors.flatMap(({ env: variable, ...source }) => {
    const baseUrl = env[variable]?.trim();
    return baseUrl ? [{ ...source, baseUrl }] : [];
  });
  sources.push({ id: 'local', kind: 'local', priority: 100, baseUrl: './' });
  const manifest = {
    schemaVersion: UPDATE_SCHEMA,
    version,
    chunks: { path: 'chunks.json', bytes: indexBytes.length, sha256: digest(indexBytes) },
    sources,
  };
  validateManifest(manifest);
  const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
  await writeFile(path.join(destination, 'chunks.json'), indexBytes);
  await writeFile(path.join(destination, 'manifest.json'), manifestBytes);
  return [
    { path: 'chunks.json', bytes: indexBytes.length },
    { path: 'manifest.json', bytes: manifestBytes.length },
  ];
}
