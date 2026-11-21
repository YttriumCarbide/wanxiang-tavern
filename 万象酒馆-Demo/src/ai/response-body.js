const MAX_JSON_RESPONSE_LENGTH = 2000000;
const DECODE_CHUNK_SIZE = 65536;

export function releaseResponseReader(reader, readToEnd) {
  // Cancellation starts immediately, but its promise can reject or stay pending.
  if (!readToEnd) void reader.cancel().catch(() => {});
  reader.releaseLock();
}

export async function readBoundedResponseText(response, errorMessage, { transform, onLimit } = {}) {
  if (!response.body) return '';
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let content = '';
  let readToEnd = false;

  function append(decoded, final = false) {
    content += transform ? transform(decoded, final) : decoded;
    if (content.length > MAX_JSON_RESPONSE_LENGTH) {
      onLimit?.(content);
      throw Error(errorMessage);
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        readToEnd = true;
        break;
      }
      for (let offset = 0; offset < value.length; offset += DECODE_CHUNK_SIZE) {
        const chunk = value.subarray(offset, offset + DECODE_CHUNK_SIZE);
        append(decoder.decode(chunk, { stream: true }));
      }
    }
    append(decoder.decode(), true);
    return content;
  } finally {
    releaseResponseReader(reader, readToEnd);
  }
}
