import { rankSources, transferFile } from './transfer.js';

export function createDownloadQueue({
  release,
  store,
  fetchImpl = globalThis.fetch,
  probeMs = 1500,
  requestMs = 120000,
  attempts = 2,
}) {
  const { index, manifest, manifestUrl } = release;
  const controller = new AbortController();
  const { signal } = controller;
  const events = new EventTarget();
  const jobs = new Map(
    index.chunks
      .filter((chunk) => chunk.delivery !== 'initial')
      .map((chunk) => [
        chunk.id,
        {
          chunk,
          requested: false,
          state: 'idle',
          verifiedBytes: 0,
          receivedBytes: 0,
          source: null,
          error: null,
        },
      ]),
  );
  let running;
  let ranked;
  function notify() {
    events.dispatchEvent(new Event('change'));
  }
  function snapshot(id) {
    const job = jobs.get(id);
    if (!job) return null;
    return {
      id,
      state: job.state,
      loadedBytes: job.verifiedBytes + job.receivedBytes,
      verifiedBytes: job.verifiedBytes,
      totalBytes: job.chunk.bytes,
      source: job.source,
      error: job.error,
    };
  }
  async function run(job) {
    job.state = 'downloading';
    notify();
    try {
      for (const file of job.chunk.files) {
        signal.throwIfAborted();
        await transferFile(file, {
          store,
          sources() {
            ranked ||= rankSources(manifest.sources, manifestUrl, file, {
              fetchImpl,
              signal,
              probeMs,
            });
            return ranked;
          },
          manifestUrl,
          fetchImpl,
          signal,
          requestMs,
          attempts,
          progress(bytes, source) {
            if (signal.aborted) return;
            job.receivedBytes = bytes;
            job.source = source;
            notify();
          },
        });
        signal.throwIfAborted();
        job.verifiedBytes += file.bytes;
        job.receivedBytes = 0;
        notify();
      }
      signal.throwIfAborted();
      job.state = 'ready';
    } catch (error) {
      if (signal.aborted) return;
      job.state = 'failed';
      job.error = error.code || error.message || String(error);
    }
    notify();
  }
  async function drain() {
    try {
      while (!signal.aborted) {
        const next = [...jobs.values()]
          .filter(({ state }) => state === 'queued')
          .sort(
            (a, b) =>
              Number(b.requested) - Number(a.requested) || a.chunk.priority - b.chunk.priority,
          )[0];
        if (!next) return;
        await run(next);
      }
    } finally {
      running = undefined;
    }
  }
  function enqueue(ids, { retry = false, requested = true } = {}) {
    if (signal.aborted) return Promise.resolve();
    const pending = [];
    for (const id of ids) {
      const job = jobs.get(id);
      if (!job) throw Error('Unknown deferred chunk: ' + id);
      pending.push(job);
    }
    let changed = false;
    for (const job of pending) {
      job.requested ||= requested;
      if (job.state === 'idle' || (retry && job.state === 'failed')) {
        job.state = 'queued';
        job.verifiedBytes = 0;
        job.receivedBytes = 0;
        job.source = null;
        job.error = null;
        changed = true;
      }
    }
    if (changed) {
      running ||= Promise.resolve().then(drain);
      notify();
    }
    return running || Promise.resolve();
  }
  return {
    start() {
      return enqueue(
        index.chunks.filter((chunk) => chunk.delivery === 'background').map((chunk) => chunk.id),
        { requested: false },
      );
    },
    enqueue,
    snapshot,
    subscribe(listener) {
      events.addEventListener('change', listener);
      return () => events.removeEventListener('change', listener);
    },
    dispose() {
      controller.abort();
    },
  };
}
