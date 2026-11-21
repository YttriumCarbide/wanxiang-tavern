import { compareReleases, TUTORIAL_GATE } from './manifest.js';
import { createDownloadQueue } from './queue.js';

export function createContentUpdates({ load, store, fetchImpl, emptyGates = [] }) {
  const events = new EventTarget();
  const controller = new AbortController();
  const requested = new Set();
  const knownEmpty = new Set(emptyGates);
  let status = 'idle';
  let error = null;
  let release;
  let loading;
  let queue;
  let unsubscribe;

  function notify() {
    events.dispatchEvent(new Event('change'));
  }
  function dependencies(id) {
    return Object.hasOwn(release?.index.gates || {}, id) ? release.index.gates[id] : [];
  }
  function queryGate(id = TUTORIAL_GATE) {
    const chunks = dependencies(id).map((chunk) => queue.snapshot(chunk));
    return {
      id,
      requested: requested.has(id),
      state: (
        status === 'loaded' ? chunks.every((chunk) => chunk.state === 'ready') : knownEmpty.has(id)
      )
        ? 'ready'
        : 'waiting',
      releaseStatus: status,
      error,
      loadedBytes: chunks.reduce((sum, chunk) => sum + chunk.loadedBytes, 0),
      verifiedBytes: chunks.reduce((sum, chunk) => sum + chunk.verifiedBytes, 0),
      totalBytes: chunks.reduce((sum, chunk) => sum + chunk.totalBytes, 0),
      chunks,
    };
  }
  function start() {
    if (controller.signal.aborted) return Promise.resolve();
    if (loading) return loading;
    if (queue) return Promise.resolve();
    status = 'loading';
    error = null;
    loading = Promise.resolve()
      .then(() => {
        controller.signal.throwIfAborted();
        return load(controller.signal);
      })
      .then((value) => {
        controller.signal.throwIfAborted();
        release = value;
        queue = createDownloadQueue({ release, store, fetchImpl });
        unsubscribe = queue.subscribe(notify);
        status = 'loaded';
        for (const id of requested) void queue.enqueue(dependencies(id));
        return queue.start();
      })
      .catch((failure) => {
        if (controller.signal.aborted) return;
        status = 'failed';
        error = failure.message || String(failure);
      })
      .finally(() => {
        loading = undefined;
        if (!controller.signal.aborted) notify();
      });
    notify();
    return loading;
  }
  function enqueueGate(id, retry) {
    if (controller.signal.aborted) return Promise.resolve();
    const firstRequest = !requested.has(id);
    requested.add(id);
    let pending = loading;
    if (queue) pending = queue.enqueue(dependencies(id), { retry });
    else if (status === 'idle' || (retry && status === 'failed')) pending = start();
    if (firstRequest) notify();
    return pending;
  }
  return {
    start,
    queryGate,
    requestGate(id = TUTORIAL_GATE, { retry = false } = {}) {
      void enqueueGate(id, retry);
      return queryGate(id);
    },
    retryGate(id = TUTORIAL_GATE) {
      return enqueueGate(id, true);
    },
    prefetch(ids) {
      if (!queue) throw Error('Release index is not ready');
      return queue.enqueue(ids, { retry: true });
    },
    async checkForUpdate(loadCandidate = load) {
      const candidate = await loadCandidate(controller.signal);
      controller.signal.throwIfAborted();
      return { candidate, ...compareReleases(release, candidate) };
    },
    subscribe(listener, id = TUTORIAL_GATE) {
      const handle = () => listener(queryGate(id));
      events.addEventListener('change', handle);
      return () => events.removeEventListener('change', handle);
    },
    dispose() {
      status = 'disposed';
      controller.abort();
      unsubscribe?.();
      queue?.dispose();
    },
  };
}
