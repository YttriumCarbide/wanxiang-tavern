import { createRequestScope } from './request-policy.js';
import { createBrowserStores } from './browser-stores.js';
import { createBrowserPortraits } from './browser-portraits.js';
import { createWorldbookCounter } from './tokenizer.js';
import { createAiPipeline } from './pipeline/runtime.js';
import { createAntiRouteService } from './anti-route-service.js';
import { createOpencodeBrowserFetch } from './opencode-browser.js';
import { creationPlan } from './pipeline/creation-request.js';
import { readGenerationResult, redactDiagnostic } from './pipeline/generation-result.js';
import { createBuiltinPromptSource } from './builtin-prompt.js';
import { API_KINDS } from './connection-store.js';

function normalizeRequestObject(value, field = '请求正文') {
  if (value == null) return {};
  if (typeof value === 'object' && !Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype === Object.prototype || prototype === null) return value;
  }
  throw Object.assign(new TypeError(`${field}必须是对象`), {
    code: 'AI_INVALID_REQUEST',
    status: 400,
  });
}

/** In-process backend: requests here are function calls, with AI sent directly by the browser. */
export async function createStaticBackend(
  database,
  { fetchImpl = fetch, virtualImages = true } = {},
) {
  const modelFetch = await createOpencodeBrowserFetch(fetchImpl);
  const readText = async (name) => {
    if (!/^(?!.*\.\.)[a-z0-9/.-]+\.(md|json)$/.test(name)) throw Error('内置提示词路径无效');
    const response = await fetchImpl(new URL('../../prompts/' + name, import.meta.url));
    if (!response.ok) throw Error('内置提示词读取失败');
    return response.text();
  };
  const bookResponse = await fetchImpl(
    new URL('../../assets/builtin-worldbook.json', import.meta.url),
  );
  if (!bookResponse.ok) throw Error('内置世界书读取失败');
  const stores = await createBrowserStores(database, readText, await bookResponse.json());
  const { settings, worlds } = stores;
  const promptSource = await createBuiltinPromptSource(readText, settings);
  const antiRoute = createAntiRouteService({ settings, fetchImpl: modelFetch });
  const countTokens = createWorldbookCounter();
  const pipeline = createAiPipeline({
    ...stores,
    countTokens,
    readText,
    promptSource,
  });
  const portraits = createBrowserPortraits(database, { fetchImpl, virtualImages });
  const controllers = new Set();
  const openGenerationIds = new Set();
  let disposed = false;
  async function generate(match, data, options) {
    const kind = match[2],
      models = match[1] === 'models';
    if (controllers.size >= 2) {
      throw Object.assign(Error('已有生成任务在进行，请稍候'), { code: 'AI_BUSY', status: 429 });
    }
    const input = normalizeRequestObject(data);
    const controller = createRequestScope(options);
    controllers.add(controller);
    let job;
    try {
      controller.signal.throwIfAborted();
      const profile = settings.get(kind);
      const source = models ? null : await promptSource.get(kind);
      const prepared = models ? null : await pipeline.buildRequest(kind, input, source);
      controller.signal.throwIfAborted();
      const requestId = crypto.randomUUID(),
        messages = prepared?.messages || [];
      const requestReport = prepared
        ? {
            id: requestId,
            messages,
            tokens: prepared.tokens,
            worldInfo: prepared.worldInfo,
            warnings: prepared.warnings,
            sampling: prepared.sampling,
            transport: prepared.transport,
          }
        : null;
      job = { input, kind, models, profile, source, prepared, messages, requestId, requestReport };
      openGenerationIds.add(requestId);
      if (prepared?.nextWorldState) {
        if (pipeline.pendingWorldStates.size >= 20)
          pipeline.pendingWorldStates.delete(pipeline.pendingWorldStates.keys().next().value);
        pipeline.pendingWorldStates.set(requestId, {
          kind,
          nextState: prepared.nextWorldState,
          expectedStep: prepared.nextWorldState.step - 1,
        });
      }
      const result = await antiRoute.request(profile, messages, {
        ...pipeline.completionOptions(job),
        signal: controller.signal,
        fetchImpl: modelFetch,
        onDelta: options.onDelta,
      });
      controller.signal.throwIfAborted();
      return await pipeline.acceptResult(job, result, controller.signal);
    } catch (failure) {
      if (controller.signal.aborted || failure.name === 'AbortError') {
        if (job) pipeline.pendingWorldStates.delete(job.requestId);
        throw Error('请求已取消或超过15分钟，请检查服务后重试', { cause: failure });
      }
      if (failure.diagnostic) {
        failure.diagnostic.kind = kind;
        failure.diagnostic.request = job?.requestReport;
      }
      for (const purpose of API_KINDS) {
        const key = settings.get(purpose).apiKey;
        failure.message = redactDiagnostic(failure.message, key);
        failure.diagnostic = redactDiagnostic(failure.diagnostic, key);
      }
      throw failure;
    } finally {
      if (job) openGenerationIds.delete(job.requestId);
      controller.close();
      controllers.delete(controller);
    }
  }
  async function request(path, data, options = {}) {
    if (disposed) throw Error('接口已关闭');
    options.signal?.throwIfAborted();
    const match =
      /^(generate|models)\/(character|script|chat|quick-chat|summary|creation|map)$/.exec(path);
    if (match) return generate(match, data, options);
    const hasData = data != null;
    data = normalizeRequestObject(data);
    if (path === 'anti-route') return antiRoute.handle(hasData ? data : undefined, options.signal);
    if (path === 'config')
      return hasData
        ? settings.saveProfile({ ...data, requestMode: 'browser' })
        : settings.visible();
    if (path === 'presets')
      return hasData ? settings.preset(data) : { presets: settings.listPresets() };
    if (path === 'tokens') {
      if (
        !Array.isArray(data.texts) ||
        data.texts.length > 1000 ||
        data.texts.some((text) => typeof text !== 'string' || text.length > 100000)
      )
        throw Error('Token统计需要文字列表');
      return { counts: data.texts.map(countTokens), tokenizer: 'o200k_base' };
    }
    if (path === 'summary/plan') return pipeline.planSummary(data);
    if (path === 'creation/plan') return creationPlan(data, settings.get('creation'), countTokens);
    if (path === 'portrait') return portraits.import(data.url, options.signal);
    if (path === 'portrait/save') return portraits.save(data.dataUrl);
    if (path === 'worldbooks') return worlds.visible();
    if (path.startsWith('worldbooks/')) {
      const action = path.slice(11);
      if (!hasData) return worlds.get(action);
      if (action === 'save') return worlds.save(data);
      if (action === 'settings') return { settings: await worlds.configure(data.settings) };
      if (action === 'delete') {
        await worlds.delete(data.id);
        return worlds.visible();
      }
    }
    if (path === 'prompt-options') {
      const options = hasData
        ? await settings.savePromptOptions(data.options)
        : settings.promptOptions();
      return { options, attribution: promptSource.attribution };
    }
    if (path === 'prompts/preview') {
      const input = normalizeRequestObject(data.input, 'input');
      const source =
        data.preset == null ? await promptSource.get(data.kind) : structuredClone(data.preset);
      const { nextWorldState: _state, ...preview } = await pipeline.buildRequest(
        data.kind,
        input,
        source,
        data.worldInfoOverride,
      );
      return preview;
    }
    if (/^validate\/(character|script)$/.test(path)) {
      const kind = path.slice(9);
      const input = normalizeRequestObject(data.input, 'input');
      if (typeof data.content !== 'string' || data.content.length > 1000000)
        throw Error('待校验正文超过容量');
      if (openGenerationIds.has(data.requestId)) {
        throw Object.assign(Error('请求仍在进行，请稍后再校验'), {
          code: 'AI_REQUEST_ACTIVE',
          status: 409,
        });
      }
      try {
        const result = readGenerationResult(kind, data.content, input);
        await pipeline.commitWorldState(data.requestId, kind);
        for (const purpose of API_KINDS) {
          result.diagnostic = redactDiagnostic(result.diagnostic, settings.get(purpose).apiKey);
        }
        return result;
      } catch (failure) {
        for (const purpose of API_KINDS) {
          const key = settings.get(purpose).apiKey;
          failure.message = redactDiagnostic(failure.message, key);
          failure.diagnostic = redactDiagnostic(failure.diagnostic, key);
        }
        throw failure;
      }
    }
    throw Error('操作不存在：' + path);
  }
  return {
    request,
    staticMode: true,
    hasCredential: (kind) => Boolean(settings.get(kind).apiKey),
    setCredential() {
      /* Connection settings own the page credential, with an explicit remember option. */
    },
    dispose() {
      disposed = true;
      antiRoute.dispose();
      for (const controller of controllers) controller.abort();
      controllers.clear();
    },
  };
}
