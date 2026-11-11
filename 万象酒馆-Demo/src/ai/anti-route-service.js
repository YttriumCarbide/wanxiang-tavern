import { compatibleRequest, completionURL } from './compatible.js';
import { isVertex } from './vertex.js';
import { redactDiagnostic } from './diagnostic.js';
import { REQUEST_TIMEOUT_MS } from './request-policy.js';
import {
  ANTI_ROUTE_VERSION,
  newRouteAccumulator,
  absorbRouteResponse,
  normalizeRouteModel,
} from './anti-route.js';

function rejectsModelName(failure) {
  if (![400, 404, 422].includes(failure.status)) return false;
  if (/api[_ -]?key|credentials|authentication|quota|rate limit/i.test(failure.message))
    return false;
  return /(?:model[_ -]not[_ -]found|unknown model|invalid model(?: id| name)?|model[^\n]{0,130}(?:does not exist|not found|not supported)|模型[^\n]{0,50}(?:不存在|找不到|不支持|无效))/i.test(
    failure.message,
  );
}

async function connectionSignature(profile) {
  const values = [
    profile.baseUrl,
    profile.model,
    profile.provider,
    profile.sessionId,
    profile.vertexAuth,
    profile.vertexProject,
    profile.vertexLocation,
    profile.apiKey,
  ];
  const bytes = new TextEncoder().encode(JSON.stringify(values));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).join('.');
}

/** Settings own persistence; response records and replay material live only in this session. */
export function createAntiRouteService({ settings, fetchImpl = fetch, publish } = {}) {
  const records = [];
  const latest = new Map();
  const channels = new Map();
  const controllers = new Set();
  let disposed = false;
  function rememberChannel(signature, evidence) {
    if (channels.size >= 32) channels.delete(channels.keys().next().value);
    channels.set(signature, evidence);
  }
  function record(input) {
    const entry = {};
    for (const key of [
      'at',
      'text',
      'thought',
      'thoughtTokens',
      'candidatesTokens',
      'ms',
      'status',
      'retries',
    ])
      entry[key] = Number.isFinite(input[key]) ? input[key] : 0;
    for (const key of ['reqModel', 'respModel', 'level', 'verdict', 'finish', 'kind', 'error'])
      entry[key] = String(input[key] || '').slice(0, 400);
    entry.raw = String(input.raw || '').slice(0, 4000);
    for (const key of ['entropy', 'healed']) entry[key] = input[key] === true;
    records.push(entry);
    if (records.length > 60) records.shift();
    try {
      const pending = publish?.(entry);
      pending?.catch(() => {});
    } catch {
      // Recording cannot invalidate a completed generation.
    }
  }
  async function request(profile, messages, options = {}) {
    const {
      signal,
      onDelta,
      onRouteReport: _report,
      fetchImpl: _fetch,
      ...replayOptions
    } = options;
    if (!options.models)
      latest.set(options.routeKind || 'chat', {
        messages: structuredClone(messages),
        options: structuredClone(replayOptions),
      });
    const routeChannel =
      options.antiRoute?.verify && channels.size
        ? channels.get(await connectionSignature(profile))
        : undefined;
    return compatibleRequest(profile, messages, {
      ...options,
      fetchImpl,
      signal,
      onDelta,
      routeChannel,
      onRouteReport: (entry) => record({ ...entry, kind: options.routeKind }),
    });
  }
  async function probe(profile, input, signal) {
    if (disposed) throw Error('接口已关闭');
    const controller = new AbortController();
    const cancel = () => controller.abort(signal?.reason);
    signal?.addEventListener('abort', cancel, { once: true });
    if (signal?.aborted) cancel();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      controller.signal.throwIfAborted();
      return await executeProbe(profile, input, controller.signal);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      controllers.delete(controller);
    }
  }
  async function executeProbe(profile, input, signal) {
    if (!profile?.model?.trim()) throw Error('请先在接口设置中保存此用途的模型名称');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(
      completionURL(profile.baseUrl).hostname,
    );
    if (!profile.apiKey && !local)
      throw Error('此用途尚无可用密钥，请先保存连接或重新输入本次密钥');
    const config = settings.routeSettings();
    const tiny = [{ role: 'user', content: 'Reply with the single word: ok' }];
    const probeOptions = {
      signal,
      fetchImpl,
      sampling: { stream: false, maxTokens: 128 },
      antiRoute: { ...config, enabled: false, verify: true, scope: 'all' },
    };
    if (input.type === 'effort') {
      const last = latest.get(input.kind);
      if (!last) throw Error('此用途还没有可重发的请求，请先正常生成一次');
      const results = [];
      for (const high of [false, true]) {
        signal?.throwIfAborted();
        let report;
        const sampling = { ...last.options.sampling };
        delete sampling.reasoning_effort;
        if (high) sampling.reasoning_effort = 'high';
        await compatibleRequest(profile, last.messages, {
          ...last.options,
          ...probeOptions,
          sampling,
          antiRoute: {
            ...last.options.antiRoute,
            thinking: false,
            retryEmpty: false,
            verify: true,
          },
          onDelta: undefined,
          onRouteReport: (value) => {
            report = value;
          },
        });
        results.push(report);
      }
      const [plain, high] = results;
      return {
        text: `未设档位 / high：思考字符 ${plain.thought} / ${high.thought}，思考 TK ${plain.thoughtTokens < 0 ? '未知' : plain.thoughtTokens} / ${high.thoughtTokens < 0 ? '未知' : high.thoughtTokens}。单次对照受随机性影响，不能据此确认降级。`,
      };
    }
    if (input.type === 'dual') {
      const signature = await connectionSignature(profile);
      channels.delete(signature);
      profile = { ...profile, tokenField: 'max_tokens' };
      let real;
      await compatibleRequest(profile, tiny, {
        ...probeOptions,
        onRouteReport: (value) => {
          real = value;
        },
      });
      try {
        await compatibleRequest(
          { ...profile, model: profile.model + '-zzz-not-a-real-model' },
          tiny,
          probeOptions,
        );
      } catch (failure) {
        if (signal?.aborted) throw failure;
        if (rejectsModelName(failure)) {
          rememberChannel(signature, 'reads-model');
          return {
            text: `真实模型请求成功（${real.respModel || '未回报模型名'}）；虚构模型请求失败，接口明确拒绝了该模型名。说明接口会校验名称，不能证明实际模型身份。`,
          };
        }
        return {
          text: `真实模型请求成功（${real.respModel || '未回报模型名'}）；虚构模型请求失败：${failure.message}。无法判断接口是否会校验名称。`,
        };
      }
      rememberChannel(signature, 'ignores-model');
      return {
        text: '虚构模型名也获得正文：接口可能忽略模型名或使用默认模型。本会话内对此连接的模型回报仅标记为「渠道回显」。',
      };
    }
    if (input.type === 'aliases') {
      const models = [
        ...new Set(
          String(input.aliases || '')
            .split(/[\s,，;；]+/)
            .filter(Boolean),
        ),
      ];
      if (
        !models.length ||
        models.length > 4 ||
        models.some((model) => !/^[\w./:-]{1,120}$/.test(model))
      )
        throw Error('请填写 1–4 个候选模型 ID，用空格或逗号分开。');
      const results = [];
      for (const model of models) {
        signal.throwIfAborted();
        let report;
        try {
          await compatibleRequest({ ...profile, model, tokenField: 'max_tokens' }, tiny, {
            ...probeOptions,
            onRouteReport: (value) => {
              report = value;
            },
          });
          results.push(`${model}：成功 → ${report.respModel || '未回报模型名'}`);
        } catch (failure) {
          if (signal.aborted) throw failure;
          results.push(
            `${model}：${rejectsModelName(failure) ? '接口明确拒绝模型名' : '请求失败，无法判断'}`,
          );
        }
      }
      return { text: results.join('；') + '。探测未修改当前连接。' };
    }
    if (input.type !== 'native') throw Error('未知探针类型');
    profile = { ...profile, tokenField: 'max_tokens' };
    if (isVertex(profile)) {
      let report;
      await compatibleRequest(profile, tiny, {
        ...probeOptions,
        onRouteReport: (value) => {
          report = value;
        },
      });
      return {
        text: `原生探针 HTTP ${report.status} · modelVersion：${report.respModel || '未提供'}。仅代表这次探针请求。`,
      };
    }
    const url = completionURL(profile.baseUrl);
    url.pathname =
      url.pathname.replace(/\/(?:v1(?:beta)?\/)?chat\/completions$/, '') +
      `/v1beta/models/${encodeURIComponent(normalizeRouteModel(profile.model))}:generateContent`;
    const response = await fetchImpl(url, {
      method: 'POST',
      signal,
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        ...(profile.apiKey
          ? { 'x-goog-api-key': profile.apiKey, Authorization: `Bearer ${profile.apiKey}` }
          : {}),
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: tiny[0].content }] }],
        generationConfig: { maxOutputTokens: 16, temperature: 0 },
      }),
    });
    const text = redactDiagnostic(await response.text(), profile.apiKey);
    if (!response.ok) throw Error(`原生探针 HTTP ${response.status}：${text.slice(0, 200)}`);
    const acc = newRouteAccumulator();
    absorbRouteResponse(acc, JSON.parse(text));
    return {
      text: `原生探针 HTTP ${response.status} · modelVersion：${acc.modelVersion || acc.model || '未提供'}。请求仍经过所选接口，仅代表本次探针。`,
    };
  }
  async function handle(input, signal) {
    if (input?.action === 'save') await settings.saveRouteSettings(input.config);
    else if (input?.action === 'clear') records.length = 0;
    else if (input?.action === 'report') record(input.report || {});
    else if (input?.action === 'probe') return probe(settings.get(input.kind), input, signal);
    else if (input?.action) throw Error('未知 Anti-Route 操作');
    return {
      version: ANTI_ROUTE_VERSION,
      config: settings.routeSettings(),
      records: structuredClone(records),
    };
  }
  return {
    request,
    handle,
    probe,
    dispose() {
      disposed = true;
      for (const controller of controllers) controller.abort();
      controllers.clear();
      records.length = 0;
      latest.clear();
      channels.clear();
    },
  };
}
