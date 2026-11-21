export class RequestBodyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Leave the response socket open when rejecting an upload. */
export async function readRequestBytes(request, maxBytes, signal) {
  signal?.throwIfAborted();
  if (Number(request.headers['content-length']) > maxBytes) {
    throw new RequestBodyError('请求内容过长', 413);
  }
  if (request.readableEnded) return Buffer.alloc(0);
  if (request.destroyed) throw new RequestBodyError('请求内容传输中断');

  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    function cleanup() {
      signal?.removeEventListener('abort', abort);
      request.off('data', data);
      request.off('end', end);
      request.off('error', interrupted);
      request.off('close', interrupted);
    }
    function fail(error) {
      request.pause();
      cleanup();
      reject(error);
    }
    function abort() {
      fail(signal.reason);
    }
    function interrupted() {
      fail(new RequestBodyError('请求内容传输中断'));
    }
    function data(chunk) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.length;
      if (bytes > maxBytes) {
        fail(new RequestBodyError('请求内容过长', 413));
        return;
      }
      chunks.push(buffer);
    }
    function end() {
      cleanup();
      resolve(Buffer.concat(chunks, bytes));
    }
    signal?.addEventListener('abort', abort, { once: true });
    request.once('end', end);
    request.once('error', interrupted);
    request.once('close', interrupted);
    request.on('data', data);
  });
}

/** Decode the whole UTF-8 body after enforcing its byte limit. */
export async function readRequestJson(request, maxBytes = 10_000_000, signal) {
  const type = request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase();
  if (type !== 'application/json') throw new RequestBodyError('请求需要application/json');
  const bytes = await readRequestBytes(request, maxBytes, signal);
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    throw new RequestBodyError('请求内容不是有效的 JSON');
  }
}
