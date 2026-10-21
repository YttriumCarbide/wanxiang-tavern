import { REQUEST_TIMEOUT_MS } from './request-policy.js';
import { compatibleRequest, completionURL, validateApiKey } from './compatible.js';
import { localRequest } from './local-client.js';
import { redactDiagnostic } from './diagnostic.js';

/** One application-owned gateway. Credentials stay in this page's memory, never in saves. */
export function createApiClient({ fetchImpl = fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const credentials = new Map();
  const controllers = new Set();
  let disposed = false;
  const credentialId = (kind, profile) => `${kind}:${completionURL(profile.baseUrl).href}`;
  const local = (path, data, options = {}) => localRequest(path, data, { ...options, fetchImpl });
  function setCredential(kind, profile, key) {
    validateApiKey(key);
    const id = credentialId(kind, profile);
    if (key) credentials.set(id, key);
    else credentials.delete(id);
  }
  function hasCredential(kind, profile) {
    return credentials.has(credentialId(kind, profile));
  }
  async function request(path, data, options = {}) {
    if (disposed) throw Error('接口已关闭');
    const route =
      /^(generate|models)\/(character|script|chat|quick-chat|summary|creation|map)$/.exec(path);
    if (!route) return local(path, data, options);
    const controller = new AbortController();
    controllers.add(controller);
    const cancel = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const bounded = { ...options, signal: controller.signal };
    let key = '',
      ticket = null,
      requestReport = null;
    try {
      const kind = route[2];
      const profiles = await local('config', undefined, bounded);
      const profile = profiles[kind];
      if (profile.requestMode !== 'browser') return await local(path, data, bounded);
      key = credentials.get(credentialId(kind, profile)) || '';
      const host = new URL(profile.baseUrl).hostname;
      if (!key && !['localhost', '127.0.0.1', '[::1]'].includes(host))
        throw Error('浏览器直连需要在接口设置中重新输入密钥；密钥仅在当前页面保留。');
      const plan = await local('transport/prepare', { path, input: data }, bounded);
      ticket = plan.ticket;
      requestReport = plan.request;
      // The server returns no credential. It owns prompt preparation and validation for step one.
      const result = await compatibleRequest({ ...plan.profile, apiKey: key }, plan.messages, {
        ...plan.options,
        signal: controller.signal,
        fetchImpl,
        onDelta: options.onDelta,
      });
      return await local('transport/complete', { ticket, result }, bounded);
    } catch (failure) {
      if (failure.name === 'AbortError' || controller.signal.aborted)
        throw Error('请求已取消或超过15分钟，请检查服务后重试', { cause: failure });
      if (failure instanceof TypeError && key)
        failure.message =
          '浏览器直连失败，请检查网络、HTTPS及接口是否允许跨域（CORS）。未自动重试。';
      if (failure.diagnostic) {
        failure.diagnostic.kind = route[2];
        if (requestReport) failure.diagnostic.request = requestReport;
      }
      failure.message = redactDiagnostic(failure.message, key);
      failure.diagnostic = redactDiagnostic(failure.diagnostic, key);
      throw failure;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      controllers.delete(controller);
      if (ticket) void local('transport/cancel', { ticket }).catch(() => {});
    }
  }
  return {
    request,
    setCredential,
    hasCredential,
    dispose() {
      disposed = true;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      credentials.clear();
    },
  };
}
