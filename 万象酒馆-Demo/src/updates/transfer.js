import { sha256, sourceUrl } from './manifest.js';

const checkpointBytes = 8 * 1024 * 1024;

function requestSignal(signal, ms) {
  return AbortSignal.any([signal, AbortSignal.timeout(ms)]);
}

export async function rankSources(sources, manifestUrl, file, { fetchImpl, signal, probeMs }) {
  const preferred = [...sources].sort((a, b) => a.priority - b.priority);
  const mirrors = preferred.filter((source) => source.kind !== 'local');
  const local = preferred.filter((source) => source.kind === 'local');
  if (mirrors.length < 2) return [...mirrors, ...local];
  const results = await Promise.all(
    mirrors.map(async (source) => {
      const start = performance.now();
      try {
        const response = await fetchImpl(sourceUrl(source, manifestUrl, file), {
          method: 'HEAD',
          cache: 'no-store',
          credentials: 'omit',
          signal: requestSignal(signal, probeMs),
        });
        if (response.ok) return { source, ms: performance.now() - start };
      } catch {
        // HEAD may be blocked while GET still works. Keep this mirror in the retry order.
      }
      return { source, ms: Infinity };
    }),
  );
  return [...results.sort((a, b) => a.ms - b.ms).map(({ source }) => source), ...local];
}

export async function matchesFile(blob, file) {
  return blob?.size === file.bytes && (await sha256(await blob.arrayBuffer())) === file.sha256;
}

function acceptRange(response, offset, bytes) {
  const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
  return (
    range &&
    offset === Number(range[1]) &&
    Number(range[2]) === bytes - 1 &&
    Number(range[3]) === bytes
  );
}

function transferError(code) {
  return Object.assign(Error(code), { code });
}

async function receiveFile(response, file, partial, save, progress, signal) {
  let loaded = partial?.size || 0;
  if (response.status === 200) {
    partial = null;
    loaded = 0;
    progress(0);
  } else if (response.status !== 206 || !acceptRange(response, loaded, file.bytes)) {
    await response.body?.cancel();
    throw transferError(response.status === 206 ? 'invalid-range' : 'http-' + response.status);
  }
  const type = partial?.type || response.headers.get('content-type') || '';
  let parts = partial ? [partial] : [];
  let saved = loaded;
  function snapshot() {
    return new Blob(parts, { type });
  }
  const reader = response.body?.getReader();
  try {
    if (reader) {
      while (true) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        if (done) break;
        loaded += value.byteLength;
        if (loaded > file.bytes) throw transferError('size-mismatch');
        parts.push(value);
        if (loaded - saved >= checkpointBytes && loaded < file.bytes) {
          const checkpoint = snapshot();
          await save(checkpoint);
          parts = [checkpoint];
          saved = loaded;
        }
        progress(loaded);
      }
    }
    signal.throwIfAborted();
    if (loaded !== file.bytes) throw transferError('incomplete');
    return snapshot();
  } catch (error) {
    await reader?.cancel().catch(() => {});
    if (loaded > saved && loaded < file.bytes) await save(snapshot());
    throw error;
  } finally {
    reader?.releaseLock();
  }
}

export async function transferFile(file, options) {
  const { store, sources, manifestUrl, fetchImpl, signal, requestMs, attempts, progress } = options;
  const cached = await store.read('verified', file);
  if (await matchesFile(cached, file)) return;
  if (cached) await store.remove('verified', file).catch(() => {});
  let partial = await store.read('partial', file);
  async function discardPartial() {
    partial = null;
    // A stale checkpoint must not prevent a full transfer from another source.
    await store.remove('partial', file).catch(() => {});
  }
  if (partial && (partial.size >= file.bytes || !partial.size)) {
    await discardPartial();
  }
  async function save(blob) {
    partial = blob;
    // Keeping the in-memory prefix still permits failover if a checkpoint cannot be written.
    await store.write('partial', file, blob).catch(() => {});
  }
  let failure;
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const source of await sources()) {
      signal.throwIfAborted();
      const update = (bytes) => progress(bytes, source.id);
      update(partial?.size || 0);
      try {
        const deadline = requestSignal(signal, requestMs);
        const response = await fetchImpl(sourceUrl(source, manifestUrl, file), {
          cache: 'no-store',
          credentials: 'omit',
          headers: partial ? { Range: 'bytes=' + partial.size + '-' } : undefined,
          signal: deadline,
        });
        const blob = await receiveFile(response, file, partial, save, update, deadline);
        if (!(await matchesFile(blob, file))) {
          await discardPartial();
          update(0);
          throw transferError('integrity');
        }
        signal.throwIfAborted();
        await store.write('verified', file, blob);
        await store.remove('partial', file).catch(() => {});
        return;
      } catch (error) {
        signal.throwIfAborted();
        failure = error;
        if (['invalid-range', 'http-416'].includes(error.code)) {
          await discardPartial();
          update(0);
        }
      }
    }
  }
  throw failure || transferError('no-source');
}
