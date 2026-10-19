/** JSON and streaming chat share a final, validated response contract. */
function responseFailure(result) {
  const failure = Error(result.error || '接口调用失败');
  failure.diagnostic = result.diagnostic;
  return failure;
}

export async function localRequest(path, data, { signal, onDelta, fetchImpl = fetch } = {}) {
  const response = await fetchImpl('/api/ai/' + path, {
    method: data ? 'POST' : 'GET',
    headers: {
      ...(data ? { 'Content-Type': 'application/json' } : {}),
      Accept: onDelta ? 'text/event-stream, application/json' : 'application/json',
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
    signal,
  });
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const result = await response.json();
    if (!response.ok) throw responseFailure(result);
    return result;
  }
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let buffer = '',
    result = null;
  function accept(block) {
    const line = block.split('\n').find((entry) => entry.startsWith('data:'));
    if (!line) return;
    const event = JSON.parse(line.slice(5));
    if (event.type === 'error') throw responseFailure(event);
    if (event.type === 'delta') onDelta?.(event.delta);
    if (event.type === 'complete') result = event.result;
  }
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index;
      while ((index = buffer.indexOf('\n\n')) >= 0) {
        accept(buffer.slice(0, index));
        buffer = buffer.slice(index + 2);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) accept(buffer);
    if (!result) throw Error('流式连接已中断，本次消息未保存，请重试');
    return result;
  } finally {
    reader.releaseLock();
  }
}
