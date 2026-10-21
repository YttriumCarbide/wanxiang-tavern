/** Select transport before generation; a failed paid request is never retried via another route. */
export async function createOpencodeBrowserFetch(
  fetchImpl,
  { pageUrl = globalThis.location?.href, root = new URL('../../', import.meta.url) } = {},
) {
  if (!pageUrl || !['127.0.0.1', 'localhost'].includes(new URL(pageUrl).hostname)) return fetchImpl;
  const base = new URL(root);
  if (new URL(pageUrl).origin !== base.origin) return fetchImpl;
  try {
    const response = await fetchImpl(new URL('__demo/status', base), {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok || (await response.json()).opencodeRelay !== true) return fetchImpl;
  } catch {
    return fetchImpl;
  }
  const relay = new URL('__demo/opencode', base);
  return (url, options = {}) => {
    const target = new URL(url);
    if (target.hostname !== 'opencode.ai') return fetchImpl(url, options);
    return fetchImpl(relay, {
      ...options,
      headers: { ...options.headers, 'x-wanxiang-upstream': target.href },
    });
  };
}
