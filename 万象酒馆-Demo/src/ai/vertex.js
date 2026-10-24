/** Translate the existing text-only transport to Google's native Gemini protocol. */
export function isVertex(profile) {
  return (
    profile.provider === 'vertex' ||
    (profile.provider !== 'openai' &&
      /(^|\.)[a-z0-9-]*aiplatform\.googleapis\.com$/i.test(new URL(profile.baseUrl).hostname) &&
      !profile.baseUrl.includes('/endpoints/'))
  );
}

export function vertexURL(profile, stream = false) {
  const url = new URL(profile.baseUrl);
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
  )
    throw Error('Vertex 地址需使用HTTPS，不能携带账户、密钥或查询参数');
  let prefix = url.pathname
    .replace(/\/+$/, '')
    .replace(/\/publishers\/google\/models(?:\/[^/]+)?$/, '');
  if (!prefix) prefix = '/v1';
  if (!/^\/v1(?:beta1)?(?:\/projects\/[a-zA-Z0-9_.:-]+\/locations\/[a-z0-9-]+)?$/.test(prefix))
    throw Error(
      'Vertex Base URL 请填写 https://aiplatform.googleapis.com/v1，或带 projects/项目/locations/区域 的前缀',
    );
  const model = String(profile.model || '').replace(
    /^(?:google\/|publishers\/google\/models\/)/,
    '',
  );
  if (model && !/^[a-zA-Z0-9_.@-]+$/.test(model)) throw Error('Vertex 模型ID无效');
  url.pathname = `${prefix}/publishers/google/models/${model || 'model'}:${stream ? 'streamGenerateContent' : 'generateContent'}`;
  if (stream) url.searchParams.set('alt', 'sse');
  return url;
}

function textParts(content) {
  if (typeof content === 'string') return content ? [{ text: content }] : [];
  if (!Array.isArray(content)) return [];
  if (content.some((part) => !['text', 'input_text'].includes(part.type)))
    throw Error('Vertex 当前接入支持文字消息，不会静默丢弃非文字内容');
  return content.map((part) => ({ text: part.text }));
}

export function vertexRequest(profile, payload) {
  const system = [],
    contents = [];
  const callNames = new Map();
  for (const message of payload.messages) {
    if (['system', 'developer'].includes(message.role)) {
      system.push(...textParts(message.content));
      continue;
    }
    const role = message.role === 'assistant' ? 'model' : 'user';
    const parts = textParts(message.content);
    for (const call of message.tool_calls || []) {
      callNames.set(call.id, call.function.name);
      parts.push({
        functionCall: {
          name: call.function.name,
          args: JSON.parse(call.function.arguments || '{}'),
        },
      });
    }
    if (message.role === 'tool') {
      const name = message.name || callNames.get(message.tool_call_id);
      if (!name) throw Error('Vertex 工具历史缺少函数名称');
      parts.splice(0, parts.length, {
        functionResponse: { name, response: { content: message.content } },
      });
    }
    if (!parts.length) continue;
    const previous = contents.at(-1);
    if (previous?.role === role) previous.parts.push(...parts);
    else contents.push({ role, parts });
  }
  const generationConfig = {};
  for (const [source, target] of Object.entries({
    temperature: 'temperature',
    top_p: 'topP',
    frequency_penalty: 'frequencyPenalty',
    presence_penalty: 'presencePenalty',
  }))
    if (Number.isFinite(payload[source])) generationConfig[target] = payload[source];
  // Presets use zero to disable top-k. Vertex requires a positive value, so defer to its default.
  if (Number.isInteger(payload.top_k) && payload.top_k > 0)
    generationConfig.topK = Math.min(64, payload.top_k);
  const limit = payload.max_completion_tokens ?? payload.max_tokens;
  if (limit) generationConfig.maxOutputTokens = limit;
  if (payload.stop?.length) generationConfig.stopSequences = payload.stop;
  if (payload.reasoning_effort && /gemini-(?:[3-9]|[1-9]\d)/.test(profile.model))
    generationConfig.thinkingConfig = { thinkingLevel: payload.reasoning_effort.toUpperCase() };
  else if (payload.reasoning_effort && /gemini-2\.5/.test(profile.model))
    generationConfig.thinkingConfig = {
      thinkingBudget:
        { minimal: 128, low: 1024, medium: 8192, high: 24576 }[payload.reasoning_effort] ?? -1,
    };
  if (payload.response_format) {
    generationConfig.responseMimeType = 'application/json';
    if (payload.response_format.json_schema)
      generationConfig.responseJsonSchema = payload.response_format.json_schema.schema;
  }
  const body = { contents, generationConfig };
  if (system.length) body.systemInstruction = { parts: system };
  if (payload.tools?.length) {
    body.tools = [
      {
        functionDeclarations: payload.tools.map(({ function: fn }) => ({
          name: fn.name,
          description: fn.description,
          parametersJsonSchema: fn.parameters,
        })),
      },
    ];
    const name = payload.tool_choice?.function?.name;
    body.toolConfig = {
      functionCallingConfig: name
        ? { mode: 'ANY', allowedFunctionNames: [name] }
        : { mode: 'AUTO' },
    };
  }
  const headers = { 'Content-Type': 'application/json' };
  if (profile.apiKey) {
    if (profile.vertexAuth === 'oauth') headers.Authorization = `Bearer ${profile.apiKey}`;
    else headers['x-goog-api-key'] = profile.apiKey;
  }
  return { url: vertexURL(profile, payload.stream), headers, body };
}

function converted(value, streaming, state) {
  if (value.error) return value;
  const candidate = value.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text)
    .join('');
  const calls = parts
    .filter((part) => part.functionCall)
    .map((part) => ({
      index: state.call++,
      id: `vertex-${state.call}`,
      type: 'function',
      function: {
        name: part.functionCall.name,
        arguments: JSON.stringify(part.functionCall.args || {}),
      },
    }));
  const reason = candidate?.finishReason;
  const blocked =
    value.promptFeedback?.blockReason ||
    (reason && !['STOP', 'MAX_TOKENS', 'CONTINUATION'].includes(reason) ? reason : null);
  const message = {
    content: text,
    ...(calls.length ? { tool_calls: calls } : {}),
    ...(blocked ? { refusal: `Vertex 返回受阻：${blocked}` } : {}),
  };
  return {
    choices: [
      {
        [streaming ? 'delta' : 'message']: message,
        finish_reason: ['MAX_TOKENS', 'CONTINUATION'].includes(reason)
          ? 'length'
          : reason
            ? 'stop'
            : null,
      },
    ],
    ...(value.usageMetadata
      ? {
          usage: {
            prompt_tokens: value.usageMetadata.promptTokenCount || 0,
            completion_tokens: value.usageMetadata.candidatesTokenCount || 0,
          },
        }
      : {}),
  };
}

/** Reuse the shared bounded SSE reader, output processing, tool handling and diagnostics. */
export async function vertexResponse(response) {
  if (!response.ok) return response;
  const state = { call: 0 };
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const raw = await response.text();
    if (raw.length > 2000000) throw Error('Vertex 接口返回内容过大');
    try {
      const result = Response.json(converted(JSON.parse(raw), false, state));
      result.vertexRawText = raw;
      return result;
    } catch {
      return new Response(raw, { headers: { 'content-type': 'text/plain' } });
    }
  }
  const decoder = new TextDecoder(),
    encoder = new TextEncoder();
  let buffer = '';
  function drain(controller, flush = false) {
    buffer = buffer.replace(/\r\n/g, '\n');
    let boundary;
    while ((boundary = buffer.indexOf('\n\n')) >= 0 || (flush && buffer.trim())) {
      const block = boundary < 0 ? buffer : buffer.slice(0, boundary);
      buffer = boundary < 0 ? '' : buffer.slice(boundary + 2);
      const data = block
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');
      if (!data) continue;
      if (data.trim() === '[DONE]') {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        continue;
      }
      let value;
      try {
        value = JSON.parse(data);
      } catch {
        throw Object.assign(Error('Vertex 流式返回不是完整JSON'), { rawText: data });
      }
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(converted(value, true, state))}\n\n`),
      );
      if (value.candidates?.[0]?.finishReason)
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
    }
  }
  const body = response.body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        if (buffer.length > 8000000) throw Error('Vertex 流式返回过大');
        drain(controller);
      },
      flush(controller) {
        buffer += decoder.decode();
        drain(controller, true);
      },
    }),
  );
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}
