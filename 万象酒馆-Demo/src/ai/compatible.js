import { generationDiagnostic, redactDiagnostic } from './diagnostic.js';
import { readCompletionStream } from './completion-stream.js';
import { readToolContent } from './tool-content.js';
import { outputToolRequest } from './preset-output.js';
import { createPresetOutputProcessor } from './output-processor.js';
import { opencodeHeaders } from './opencode-headers.js';
import { upstreamError } from './upstream-error.js';
import { isVertex, vertexRequest, vertexResponse } from './vertex.js';
import { serviceAccountToken } from './vertex-service-account.js';

export function validateApiKey(apiKey) {
  if (typeof apiKey !== 'string' || apiKey.length > 2000 || /[^\x21-\x7e]/.test(apiKey))
    throw Error('API Key 格式无效：请只粘贴密钥本身，不能包含中文、空格或换行');
}

export function completionURL(base) {
  const url = new URL(base);
  if (url.username || url.password || url.search || url.hash)
    throw Error('接口地址不能携带账户、密钥或查询参数');
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  )
    throw Error('接口需使用HTTPS，本地模型可使用HTTP');
  url.pathname =
    url.pathname.replace(/\/+$/, '').replace(/\/chat\/completions$/, '') + '/chat/completions';
  return url;
}
export async function compatibleRequest(
  profile,
  messages,
  {
    signal,
    fetchImpl = fetch,
    models = false,
    responseSchema = null,
    sampling = {},
    outputEnvelope = false,
    outputTool = null,
    outputProcessing = null,
    stop = null,
    onDelta,
  } = {},
) {
  const nativeVertex = isVertex(profile);
  const serviceAccount = nativeVertex && profile.vertexAuth === 'service-account';
  if (!serviceAccount) validateApiKey(profile.apiKey || '');
  if (models && nativeVertex)
    throw Error(
      'Vertex 原生接口未提供快捷模式模型列表，请在模型栏填写 Google 控制台显示的 Gemini 模型ID；未发送付费请求。',
    );
  let url = completionURL(profile.baseUrl);
  if (models) url.pathname = url.pathname.replace(/\/chat\/completions$/, '/models');
  let headers = { 'Content-Type': 'application/json', ...opencodeHeaders(profile) };
  if (profile.apiKey) headers.Authorization = `Bearer ${profile.apiKey}`;
  const payload = {
    model: profile.model,
    messages,
    stream: sampling.stream ?? profile.stream ?? false,
  };
  if (!models) {
    if (!profile.model) throw Error('请先填写模型名称');
    const toolRequest = outputToolRequest(outputTool);
    if (toolRequest) Object.assign(payload, toolRequest);
    else if (!outputEnvelope && profile.strictJson && responseSchema)
      payload.response_format = {
        type: 'json_schema',
        json_schema: { name: 'wanxiang_generation', strict: true, schema: responseSchema },
      };
    else if (!outputEnvelope && profile.jsonMode) payload.response_format = { type: 'json_object' };
    if (profile.temperature !== null) payload.temperature = profile.temperature;
    for (const key of ['temperature', 'top_k', 'top_p', 'frequency_penalty', 'presence_penalty'])
      if (Number.isFinite(sampling[key])) payload[key] = sampling[key];
    if (sampling.reasoning_effort) payload.reasoning_effort = sampling.reasoning_effort;
    if (stop?.length) payload.stop = stop;
    const maxTokens = sampling.maxTokens ?? profile.maxTokens;
    if (maxTokens && profile.tokenField !== 'none') payload[profile.tokenField] = maxTokens;
  }
  let body = payload;
  let vertexToken = '';
  if (nativeVertex) {
    if (serviceAccount)
      vertexToken = await serviceAccountToken(profile.apiKey, { fetchImpl, signal });
    const vertex = vertexRequest(
      serviceAccount ? { ...profile, apiKey: vertexToken, vertexAuth: 'oauth' } : profile,
      payload,
    );
    url = vertex.url;
    headers = vertex.headers;
    body = vertex.body;
  }
  let response = await fetchImpl(url, {
    method: models ? 'GET' : 'POST',
    headers,
    ...(models ? {} : { body: JSON.stringify(body) }),
    signal,
    redirect: 'error',
  });
  const redact = (value) =>
    redactDiagnostic(redactDiagnostic(value, vertexToken), profile.apiKey) ?? value;
  if (nativeVertex) response = await vertexResponse(response);
  if (!models && response.ok && response.headers.get('content-type')?.includes('text/event-stream'))
    try {
      return await readCompletionStream(response, onDelta, outputTool, outputProcessing);
    } catch (failure) {
      failure.diagnostic = redact({
        ...generationDiagnostic(
          'character',
          failure.rawText || '',
          failure.message,
          failure.stage || 'transport',
        ),
        delivery: failure.delivery,
      });
      throw failure;
    }
  const content = redact(await response.text());
  if (content.length > 2000000) throw Error('接口返回内容过大');
  const rejected = (message, rawText = response.vertexRawText || content, stage = 'transport') => {
    const failure = Error(message);
    failure.diagnostic = redact(
      generationDiagnostic(
        responseSchema?.properties?.schemaVersion?.const === 2 ? 'script' : 'character',
        rawText,
        message,
        stage,
      ),
    );
    return failure;
  };
  if (models && response.status === 404)
    throw rejected(
      `模型列表接口不存在（HTTP 404，路径 ${url.pathname}），请检查 Base URL 是否需要 /v1；也可手动填写模型 ID。`,
    );
  let data;
  try {
    data = JSON.parse(content);
  } catch {
    if (response.status === 429) {
      const info = upstreamError(content, response.status);
      throw rejected(info.message, content, info.stage);
    }
    throw rejected(`接口未返回JSON（HTTP ${response.status}），请检查Base URL`);
  }
  if (!response.ok || data?.error) {
    const detail = String(
      data?.error?.message ||
        (typeof data?.error === 'string' ? data.error : '') ||
        `HTTP ${response.status}`,
    )
      .replaceAll(profile.apiKey || '\0', '[密钥已隐藏]')
      .slice(0, 350);
    if (url.hostname === 'opencode.ai' && /requires Global regions/i.test(detail))
      throw rejected(
        'OpenCode 当前模型要求工作区 Privacy 使用 Global 地区。请在 OpenCode 控制台检查隐私地区设置，或选择符合当前设置的模型。未自动重试。',
      );
    const info = upstreamError(detail, response.status);
    throw rejected(
      info.stage === 'upstream-quota'
        ? info.message
        : `上游接口失败：${detail}${outputTool ? `；本次预设使用${outputTool.name}输出，请确认API支持工具调用` : ''}`,
      vertexToken ? content.replaceAll(vertexToken, '[令牌已隐藏]') : content,
      info.stage,
    );
  }
  if (models) return { models: (data.data || []).map((model) => String(model.id)).slice(0, 300) };
  const result = data.choices?.[0];
  const text = result?.message?.content;
  let output = Array.isArray(text)
    ? text
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('')
    : text;
  if (result?.finish_reason === 'length')
    throw rejected(
      '生成被长度上限截断，请提高输出长度后重新生成；原文已保留，不自动补写缺失内容',
      output || (outputTool ? JSON.stringify(result?.message?.tool_calls || []) : ''),
      'truncated',
    );
  if (result?.message?.refusal)
    throw rejected('模型拒绝了这次生成，请调整要求', result.message.refusal, 'refusal');
  if (outputTool) {
    try {
      output = readToolContent(result?.message, outputTool);
    } catch (failure) {
      throw rejected(failure.message, content, 'tool-response');
    }
  }
  if (typeof output !== 'string' || !output.trim())
    throw rejected('模型没有返回正文，请检查模型是否支持Chat Completions');
  const processor = createPresetOutputProcessor(outputProcessing);
  processor.feed(output);
  return {
    content: processor.finish(),
    rawContent: output,
    usage: {
      input: Number(data.usage?.prompt_tokens || 0),
      output: Number(data.usage?.completion_tokens || 0),
    },
  };
}
