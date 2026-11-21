const MIN_SIZE = 1;
const MAX_SIZE = 512 * 1024 * 1024;
const CHUNK_SIZE = 65536;
const NATIVE_FILENAME_PATTERN = /^[A-Za-z0-9._-]{1,115}\.json$/;
const NATIVE_ORIGIN = 'https://appassets.androidplatform.net';

function assertJson(json) {
  if (typeof json !== 'string') {
    throw new Error('导出内容必须是字符串');
  }
}

function assertSize(size) {
  if (!Number.isInteger(size) || size < MIN_SIZE || size > MAX_SIZE) {
    throw new Error('导出内容大小必须在1字节到512MB之间');
  }
}

function isNativeEnvironment(environment) {
  return environment.location?.origin === NATIVE_ORIGIN;
}

function downloadBlob(environment, blob, filename) {
  const doc = environment.document;
  const url = environment.URL.createObjectURL(blob);
  const anchor = doc.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  doc.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    environment.setTimeout(() => {
      environment.URL.revokeObjectURL(url);
    }, 1000);
  }
  return { method: 'download' };
}

function createNativeExporter(environment, blob, filename, size, timeoutMs, chooserTimeoutMs) {
  const channel = environment.wanxiangNativeExport;
  const id = environment.crypto.randomUUID();
  const encoder = new environment.TextEncoder();
  let pending = null;
  let aborted = false;

  const encodePacket = (header, body) => {
    const headerBytes = encoder.encode(JSON.stringify(header));
    const packet = new Uint8Array(4 + headerBytes.byteLength + body.byteLength);
    new DataView(packet.buffer).setUint32(0, headerBytes.byteLength, false);
    packet.set(headerBytes, 4);
    packet.set(body, 4 + headerBytes.byteLength);
    return packet;
  };

  const takePending = () => {
    const current = pending;
    pending = null;
    if (current !== null && current.timer !== null) {
      environment.clearTimeout(current.timer);
    }
    return current;
  };

  const postCancel = () => {
    try {
      channel.postMessage(encodePacket({ id, op: 'cancel' }, new Uint8Array(0)).buffer);
    } catch {
      // 取消为尽力而为
    }
  };

  const onReply = (event) => {
    let detail;
    try {
      detail = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!detail || detail.id !== id) {
      return;
    }
    const current = takePending();
    if (current === null) {
      return;
    }
    if (detail.ok !== true) {
      const error = new Error(detail.error || '保存失败');
      if (detail.code !== undefined) {
        error.code = detail.code;
      }
      current.reject(error);
      return;
    }
    current.resolve(detail);
  };

  const request = (header, body, waitMs) =>
    new Promise((resolve, reject) => {
      if (aborted) {
        reject(new Error('导出已取消'));
        return;
      }
      const timer = environment.setTimeout(() => {
        if (pending !== null && pending.timer === timer) {
          pending = null;
          reject(new Error('导出超时，请重试'));
        }
      }, waitMs);
      pending = { resolve, reject, timer };
      try {
        channel.postMessage(encodePacket(header, body).buffer);
      } catch (error) {
        takePending();
        reject(error);
      }
    });

  const onPagehide = () => {
    aborted = true;
    const current = takePending();
    if (current !== null) {
      current.reject(new Error('导出已取消'));
    }
    postCancel();
  };

  const run = async () => {
    channel.addEventListener('message', onReply);
    environment.addEventListener('pagehide', onPagehide);
    try {
      const beginAck = await request(
        { id, op: 'begin', name: filename, size },
        new Uint8Array(0),
        timeoutMs,
      );
      if (beginAck.offset !== 0) {
        throw new Error('原生导出协议错误');
      }
      let offset = 0;
      while (offset < size) {
        const end = Math.min(offset + CHUNK_SIZE, size);
        const buffer = await blob.slice(offset, end).arrayBuffer();
        if (aborted) {
          throw new Error('导出已取消');
        }
        const body = new Uint8Array(buffer);
        const chunkAck = await request({ id, op: 'chunk', offset }, body, timeoutMs);
        if (chunkAck.offset !== offset + body.byteLength) {
          throw new Error('原生导出协议错误');
        }
        offset = end;
      }
      const finishAck = await request({ id, op: 'finish' }, new Uint8Array(0), chooserTimeoutMs);
      if (finishAck.done !== true) {
        throw new Error('保存未完成');
      }
      return { method: 'native' };
    } catch (error) {
      if (!aborted && error?.code !== 'cancelled' && error?.code !== 'busy') {
        postCancel();
      }
      throw error;
    } finally {
      takePending();
      channel.removeEventListener('message', onReply);
      environment.removeEventListener('pagehide', onPagehide);
    }
  };

  return { run };
}

export async function exportJsonFile(
  json,
  filename,
  { environment = globalThis, timeoutMs = 60000, chooserTimeoutMs = 300000 } = {},
) {
  assertJson(json);
  const native = isNativeEnvironment(environment);
  if (native && (typeof filename !== 'string' || !NATIVE_FILENAME_PATTERN.test(filename))) {
    throw Error('导出文件名无效');
  }
  const blob = new environment.Blob([json], { type: 'application/json' });
  assertSize(blob.size);
  if (native) {
    if (
      !environment.wanxiangNativeExport ||
      typeof environment.wanxiangNativeExport.postMessage !== 'function'
    ) {
      throw new Error('请更新安卓安装包后再导出');
    }
    return createNativeExporter(
      environment,
      blob,
      filename,
      blob.size,
      timeoutMs,
      chooserTimeoutMs,
    ).run();
  }
  return downloadBlob(environment, blob, filename);
}
