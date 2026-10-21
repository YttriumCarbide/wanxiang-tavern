import { createToolContentStream } from './tool-content.js';
import { createPresetOutputProcessor } from './output-processor.js';
import { upstreamError } from './upstream-error.js';

/** Decode upstream SSE across arbitrary UTF-8/chunk boundaries. */
export async function readCompletionStream(
  response,
  onDelta = () => {},
  outputTool = null,
  outputProcessing = null,
) {
  const decoder = new TextDecoder();
  let processor = createPresetOutputProcessor(outputProcessing, onDelta);
  let emittedRaw = '';
  const publish = (text) => {
    emittedRaw += text;
    processor.feed(text);
  };
  const tool = outputTool ? createToolContentStream(outputTool, publish) : null;
  let buffer = '',
    content = '',
    usage = {},
    finish = null,
    size = 0,
    eventCount = 0,
    ended = false,
    wireText = '';
  function event(block) {
    const data = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    if (!data) return;
    eventCount++;
    if (data.trim() === '[DONE]') {
      ended = true;
      return;
    }
    const value = JSON.parse(data);
    if (value.error) {
      const detail =
        typeof value.error === 'string'
          ? value.error
          : value.error.message || JSON.stringify(value.error);
      const info = upstreamError(detail, Number(value.error.code || value.error.status));
      const failure = Error(info.message);
      failure.stage = info.stage;
      failure.rawText = data;
      throw failure;
    }
    if (value.usage) usage = value.usage;
    const choice = value.choices?.[0];
    if (choice?.finish_reason) finish = choice.finish_reason;
    if (choice?.delta?.refusal) throw Error('模型拒绝了这次生成');
    const delta = choice?.delta?.content;
    if (typeof delta === 'string') {
      content += delta;
      if (!tool) publish(delta);
      else tool.plain?.(delta);
    }
    if (tool && choice?.delta?.tool_calls) tool.push(choice.delta.tool_calls);
  }
  try {
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > 8000000) throw Error('流式返回内容过大');
      const decoded = decoder.decode(chunk, { stream: true });
      wireText = (wireText + decoded).slice(0, 2000000);
      buffer = (buffer + decoded).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        event(buffer.slice(0, boundary).replaceAll('\r', ''));
        buffer = buffer.slice(boundary + 2);
        if (ended) break;
      }
      // A completed SSE reply must not wait for the proxy to close its keep-alive connection.
      if (ended) break;
    }
    buffer += decoder.decode();
    if (!ended && buffer.trim()) event(buffer.replaceAll('\r', ''));
    if (finish === 'length') throw Error('生成被长度上限截断，请提高回复上限后重试');
    if (tool) content = tool.finish();
    if (!content.trim()) throw Error('模型没有返回正文');
    const rawContent = content;
    if (tool && emittedRaw !== content) {
      // Multiple upstream channels can disagree. The preset selects one reply, never concatenates them.
      processor = createPresetOutputProcessor(outputProcessing);
      processor.feed(content);
    }
    content = processor.finish();
    return {
      content,
      rawContent,
      usage: {
        input: Number(usage.prompt_tokens || 0),
        output: Number(usage.completion_tokens || 0),
      },
    };
  } catch (failure) {
    failure.rawText = tool?.raw() || content || failure.rawText || wireText;
    failure.delivery = {
      receivedBytes: size,
      eventCount,
      textCharacters: content.length,
      doneMarker: ended,
    };
    failure.stage ||= finish === 'length' ? 'truncated' : tool ? 'tool-response' : 'transport';
    throw failure;
  }
}
