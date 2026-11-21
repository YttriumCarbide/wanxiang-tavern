export const UPDATE_SCHEMA = 1;
export const TUTORIAL_GATE = 'after-tutorial-first-level';

const idPattern = /^[a-z][a-z0-9-]*$/;
const hashPattern = /^[0-9a-f]{64}$/;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?(?:\+[0-9a-z.-]+)?$/i;
const mirrorHosts = Object.freeze({
  'github-raw': 'raw.githubusercontent.com',
  'github-release': 'github.com',
  gitee: 'gitee.com',
});

function requireValid(condition, label) {
  if (!condition) throw Error('Invalid update manifest: ' + label);
}

export function assetPath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

function validId(value) {
  return typeof value === 'string' && idPattern.test(value);
}

function validFile(file) {
  return (
    typeof file?.path === 'string' &&
    !file.path.includes('\\') &&
    [...file.path].every((character) => character >= ' ') &&
    file.path.split('/').every((part) => part && part !== '.' && part !== '..') &&
    Number.isSafeInteger(file.bytes) &&
    file.bytes >= 0 &&
    typeof file.sha256 === 'string' &&
    hashPattern.test(file.sha256)
  );
}

function validateHeader(data) {
  requireValid(data?.schemaVersion === UPDATE_SCHEMA, 'schemaVersion');
  requireValid(typeof data.version === 'string' && versionPattern.test(data.version), 'version');
}

export function validateManifest(manifest) {
  validateHeader(manifest);
  requireValid(validFile(manifest.chunks) && manifest.chunks.path === 'chunks.json', 'chunks.json');
  requireValid(Array.isArray(manifest.sources) && manifest.sources.length > 0, 'sources');
  const ids = new Set();
  for (const source of manifest.sources) {
    requireValid(validId(source?.id) && !ids.has(source.id), 'source ID');
    requireValid(Number.isSafeInteger(source.priority) && source.priority >= 0, 'source priority');
    requireValid(typeof source.baseUrl === 'string' && source.baseUrl.endsWith('/'), 'source URL');
    if (source.kind === 'local') {
      requireValid(source.baseUrl === './', 'local source');
    } else {
      const url = new URL(source.baseUrl);
      requireValid(
        Object.hasOwn(mirrorHosts, source.kind) &&
          url.hostname === mirrorHosts[source.kind] &&
          url.protocol === 'https:' &&
          !url.username &&
          !url.password &&
          !url.port &&
          !url.search &&
          !url.hash &&
          (source.kind !== 'github-release' ||
            /^\/[^/]+\/[^/]+\/releases\/download\/[^/]+\/$/.test(url.pathname)),
        'mirror URL',
      );
    }
    ids.add(source.id);
  }
}

export async function sha256(buffer) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function chunkIdentity(files) {
  return JSON.stringify(files.map(({ path, bytes, sha256 }) => [path, bytes, sha256]));
}

export async function validateIndex(index, version) {
  validateHeader(index);
  requireValid(index.version === version && Array.isArray(index.chunks), 'index version or chunks');
  const paths = new Set();
  const chunks = new Map();
  for (const chunk of index.chunks) {
    requireValid(validId(chunk?.id) && !chunks.has(chunk.id), 'chunk ID');
    const initial = chunk.delivery === 'initial';
    requireValid(initial || ['background', 'on-demand'].includes(chunk.delivery), 'delivery');
    requireValid(Number.isSafeInteger(chunk.priority) && chunk.priority >= 0, 'chunk priority');
    requireValid(Array.isArray(chunk.files), 'chunk files');
    let bytes = 0;
    for (const file of chunk.files) {
      requireValid(validFile(file) && !paths.has(file.path), 'file descriptor or duplicate path');
      requireValid(initial || file.path.startsWith('assets/'), 'deferred asset path');
      paths.add(file.path);
      bytes += file.bytes;
    }
    const hash = await sha256(new TextEncoder().encode(chunkIdentity(chunk.files)));
    requireValid(chunk.bytes === bytes && chunk.sha256 === hash, 'chunk identity');
    chunks.set(chunk.id, chunk);
  }
  requireValid(
    index.chunks.filter((chunk) => chunk.delivery === 'initial').length === 1,
    'initial chunk',
  );
  requireValid(
    index.gates && typeof index.gates === 'object' && !Array.isArray(index.gates),
    'gates',
  );
  for (const [id, required] of Object.entries(index.gates)) {
    requireValid(validId(id) && Array.isArray(required), 'gate ID or dependencies');
    requireValid(
      new Set(required).size === required.length &&
        required.every(
          (chunkId) => chunks.has(chunkId) && chunks.get(chunkId).delivery !== 'initial',
        ),
      'gate chunk dependency',
    );
  }
}

export function sourceUrl(source, manifestUrl, file) {
  const name =
    source.kind === 'github-release' && file.path !== 'chunks.json'
      ? 'asset-' + file.sha256
      : assetPath(file.path);
  return new URL(name, new URL(source.baseUrl, manifestUrl));
}

export function compareReleases(current, next) {
  const previous = new Map(current?.index.chunks.map((chunk) => [chunk.id, chunk.sha256]));
  return {
    versionChanged: current?.manifest.version !== next.manifest.version,
    manifestChanged:
      current?.manifest.chunks.sha256 !== next.manifest.chunks.sha256 ||
      JSON.stringify(current?.manifest.sources) !== JSON.stringify(next.manifest.sources),
    changed: next.index.chunks
      .filter((chunk) => previous.get(chunk.id) !== chunk.sha256)
      .map((chunk) => chunk.id),
    removed: [...previous.keys()].filter(
      (id) => !next.index.chunks.some((chunk) => chunk.id === id),
    ),
  };
}

export async function loadUpdateRelease(
  manifestUrl,
  { fetchImpl = globalThis.fetch, signal, expectedVersion } = {},
) {
  function fetchIndex(url) {
    const timeout = AbortSignal.timeout(15000);
    return fetchImpl(url, {
      cache: 'no-store',
      credentials: 'omit',
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  }
  const response = await fetchIndex(manifestUrl);
  if (!response.ok) throw Error('Update manifest unavailable: HTTP ' + response.status);
  const manifest = await response.json();
  validateManifest(manifest);
  if (expectedVersion) requireValid(manifest.version === expectedVersion, 'shell version');
  const urls = new Set([new URL(manifest.chunks.path, manifestUrl).href]);
  for (const source of [...manifest.sources].sort((a, b) => a.priority - b.priority))
    urls.add(sourceUrl(source, manifestUrl, manifest.chunks).href);
  let failure;
  for (const url of urls) {
    try {
      const response = await fetchIndex(url);
      if (!response.ok) throw Error('HTTP ' + response.status);
      const buffer = await response.arrayBuffer();
      requireValid(
        buffer.byteLength === manifest.chunks.bytes &&
          (await sha256(buffer)) === manifest.chunks.sha256,
        'index size or digest',
      );
      const index = JSON.parse(new TextDecoder().decode(buffer));
      await validateIndex(index, manifest.version);
      return { manifest, index, manifestUrl };
    } catch (error) {
      signal?.throwIfAborted();
      failure = error;
    }
  }
  throw Error('Update chunk index unavailable', { cause: failure });
}
