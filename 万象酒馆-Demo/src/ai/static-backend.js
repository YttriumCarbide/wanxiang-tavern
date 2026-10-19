import { createBrowserStores } from './browser-stores.js';
import { createBrowserPortraits } from './browser-portraits.js';
import { createWorldbookCounter } from './tokenizer.js';
import { createAiPipeline } from './pipeline/runtime.js';
import { compatibleRequest } from './compatible.js';
import { summaryPlan } from './pipeline/summary-request.js';
import { creationPlan } from './pipeline/creation-request.js';
import { readGenerationResult, redactDiagnostic } from './pipeline/generation-result.js';
import { formatRegexPresentation } from './pipeline/regex-presentation.js';
import { presetRegexScripts, normalizeRegexScripts } from './regex.js';
import { API_KINDS } from './connection-store.js';
import { runRegexTasks } from './regex-runtime.js';

/** In-process backend: requests here are function calls, with AI sent directly by the browser. */
export async function createStaticBackend(
  database,
  { fetchImpl = fetch, virtualImages = true, regexRunner = runRegexTasks } = {},
) {
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
  const { settings, prompts, worlds, regexStore, helperStorage } = stores;
  const countTokens = createWorldbookCounter();
  const pipeline = createAiPipeline({
    ...stores,
    countTokens,
    readText,
    runRegexTasks: regexRunner,
  });
  const portraits = createBrowserPortraits(database, { fetchImpl, virtualImages });
  const controllers = new Set();
  let disposed = false;
  async function generate(path, input, options) {
    const match = /^(generate|models)\/(character|script|chat|quick-chat|summary|creation)$/.exec(
      path,
    );
    const kind = match[2],
      models = match[1] === 'models';
    if (controllers.size >= 2) throw Error('已有生成任务在进行，请稍候');
    const controller = new AbortController();
    const cancel = () => controller.abort(options.signal?.reason);
    options.signal?.addEventListener('abort', cancel, { once: true });
    if (options.signal?.aborted) cancel();
    const timer = setTimeout(() => controller.abort(), 180000);
    controllers.add(controller);
    let job;
    try {
      controller.signal.throwIfAborted();
      const profile = settings.get(kind);
      const source =
        models || ['summary', 'creation'].includes(kind)
          ? null
          : (await prompts.get(profile.promptPresetId)).preset;
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
            regex: prepared.regex,
          }
        : null;
      job = { input, kind, models, profile, source, prepared, messages, requestId, requestReport };
      if (prepared?.nextWorldState) {
        if (pipeline.pendingWorldStates.size >= 20)
          pipeline.pendingWorldStates.delete(pipeline.pendingWorldStates.keys().next().value);
        pipeline.pendingWorldStates.set(requestId, {
          kind,
          nextState: prepared.nextWorldState,
          expectedStep: prepared.nextWorldState.step - 1,
        });
      }
      const result = await compatibleRequest(profile, messages, {
        ...pipeline.completionOptions(job),
        signal: controller.signal,
        fetchImpl,
        onDelta: options.onDelta,
      });
      controller.signal.throwIfAborted();
      return await pipeline.acceptResult(job, result);
    } catch (failure) {
      if (controller.signal.aborted || failure.name === 'AbortError')
        throw Error('请求已取消或超过180秒，请检查服务后重试', { cause: failure });
      if (failure instanceof TypeError && !failure.diagnostic)
        failure.message = '浏览器无法连接此接口，请检查网络、HTTPS及跨域支持（CORS）。未自动重试。';
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
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
      controllers.delete(controller);
    }
  }
  async function request(path, data, options = {}) {
    if (disposed) throw Error('接口已关闭');
    options.signal?.throwIfAborted();
    if (/^(generate|models)\/(character|script|chat|quick-chat|summary|creation)$/.test(path))
      return generate(path, data || {}, options);
    if (path === 'config')
      return data ? settings.saveProfile({ ...data, requestMode: 'browser' }) : settings.visible();
    if (path === 'presets')
      return data ? settings.preset(data) : { presets: settings.listPresets() };
    if (path === 'regex') return data ? regexStore.save(data) : { scripts: regexStore.get() };
    if (path === 'regex-test')
      return (
        await regexRunner(normalizeRegexScripts(data.scripts), [
          {
            text: String(data.text || '').slice(0, 100000),
            placement: data.placement ?? 2,
            options: data.options || {},
          },
        ])
      )[0];
    if (path === 'tokens') {
      if (
        !Array.isArray(data.texts) ||
        data.texts.length > 1000 ||
        data.texts.some((text) => typeof text !== 'string' || text.length > 100000)
      )
        throw Error('Token统计需要文字列表');
      return { counts: data.texts.map(countTokens), tokenizer: 'o200k_base' };
    }
    if (path === 'summary/plan')
      return summaryPlan(data, settings.get('summary'), countTokens, readText);
    if (path === 'creation/plan') return creationPlan(data, settings.get('creation'), countTokens);
    if (path === 'portrait') return portraits.import(data.url, options.signal);
    if (path === 'portrait/save') return portraits.save(data.dataUrl);
    if (path.startsWith('helper-storage/')) {
      const id = path.slice(15);
      return data ? helperStorage.save(id, data.storage) : { storage: helperStorage.get(id) };
    }
    if (path === 'worldbooks') return worlds.visible();
    if (path.startsWith('worldbooks/')) {
      const action = path.slice(11);
      if (!data) return worlds.get(action);
      if (action === 'save') return worlds.save(data);
      if (action === 'settings') return { settings: await worlds.configure(data.settings) };
      if (action === 'delete') {
        await worlds.delete(data.id);
        return worlds.visible();
      }
    }
    if (path === 'prompts')
      return {
        presets: await prompts.list(),
        formats: {
          character: await readText('character.system.md'),
          script: await readText('script.system.md'),
        },
      };
    if (path.startsWith('prompts/')) {
      const action = path.slice(8);
      if (!data) return prompts.get(action);
      if (action === 'save') return prompts.save(data);
      if (action === 'select') {
        await prompts.get(data.id);
        return settings.selectPrompt(data.kind, data.id);
      }
      if (action === 'delete') {
        for (const [kind, profile] of Object.entries(settings.visible()))
          if (profile.promptPresetId === data.id)
            await settings.selectPrompt(kind, `${kind}-default`);
        await prompts.delete(data.id);
        return { deleted: true };
      }
      if (action === 'preview') {
        const source =
          data.preset || (await prompts.get(settings.get(data.kind).promptPresetId)).preset;
        const { nextWorldState: _state, ...preview } = await pipeline.buildRequest(
          data.kind,
          data.input,
          source,
          data.worldInfoOverride,
        );
        return preview;
      }
    }
    if (/^validate\/(character|script)$/.test(path)) {
      const kind = path.slice(9);
      if (typeof data.content !== 'string' || data.content.length > 1000000)
        throw Error('待校验正文超过容量');
      const result = readGenerationResult(kind, data.content, data.input || {});
      const preset = (await prompts.get(settings.get(kind).promptPresetId)).preset;
      await formatRegexPresentation(
        result.entry,
        kind,
        [...regexStore.get(), ...presetRegexScripts(preset)],
        regexRunner,
      );
      await pipeline.commitWorldState(data.requestId, kind);
      result.diagnostic = redactDiagnostic(result.diagnostic, settings.get(kind).apiKey);
      return result;
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
      for (const controller of controllers) controller.abort();
      controllers.clear();
    },
  };
}
