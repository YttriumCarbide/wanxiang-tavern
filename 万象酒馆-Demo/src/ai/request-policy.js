export const REQUEST_TIMEOUT_MS = 15 * 60 * 1000;

/** Own one timeout and one upstream abort listener for a request. */
export function createRequestScope({ signal, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const abort = (reason) => controller.abort(reason);
  const forward = () => abort(signal.reason);
  signal?.addEventListener('abort', forward, { once: true });
  if (signal?.aborted) forward();
  const timer = setTimeout(abort, timeoutMs);
  return {
    signal: controller.signal,
    abort,
    close() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', forward);
    },
  };
}
