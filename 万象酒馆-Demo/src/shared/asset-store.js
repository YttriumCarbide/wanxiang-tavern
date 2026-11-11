/** Original bytes are cached by content hash. Each scene/application owns its lifetime. */
export function createAssetStore({ base = new URL('../../', import.meta.url) } = {}) {
  const controller = new AbortController();
  const pending = new Map();
  const images = new Set();
  let catalog = null;
  let cache = null;
  let disposed = false;
  async function manifest() {
    catalog ||= (async () => {
      const url = new URL('assets/asset-catalog.json', base);
      const storage = await disk();
      try {
        const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw Error('资源目录读取失败');
        if (storage) await storage.put(url.href, response.clone()).catch(() => {});
        return response.json();
      } catch (error) {
        if (controller.signal.aborted) throw error;
        const saved = storage && (await storage.match(url.href).catch(() => null));
        if (saved) return saved.json();
        throw error;
      }
    })();
    return catalog;
  }
  async function disk() {
    if (cache === null) {
      try {
        cache = await caches.open('wanxiang-original-assets-v1');
      } catch {
        cache = false;
      }
    }
    return cache;
  }
  async function download(file, update) {
    const url = new URL(file, base);
    const entries = await manifest();
    const key = url.href;
    const relative = url.pathname.slice(new URL(base).pathname.length);
    const info = entries.files[relative];
    const storage = info && (await disk());
    const saved = storage && (await storage.match(key).catch(() => null));
    if (saved && info && saved.headers.get('x-wanxiang-hash') === info.hash) {
      const blob = await saved.blob();
      if (blob.size === info.bytes) {
        update({ loaded: blob.size, total: blob.size, cached: true });
        return blob;
      }
    }
    const response = await fetch(url, {
      cache: info ? 'reload' : 'default',
      signal: controller.signal,
    });
    if (!response.ok) throw Error('资源读取失败：' + url.pathname.split('/').at(-1));
    const total = info?.bytes || Number(response.headers.get('content-length')) || 0;
    const chunks = [];
    let loaded = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        chunks.push(part.value);
        loaded += part.value.byteLength;
        update({ loaded, total, cached: false });
      }
    } else {
      const buffer = await response.arrayBuffer();
      chunks.push(buffer);
      loaded = buffer.byteLength;
    }
    const blob = new Blob(chunks, { type: response.headers.get('content-type') || '' });
    if (info && blob.size !== info.bytes) throw Error('资源文件不完整，请重试');
    if (storage) {
      const headers = new Headers({ 'content-type': blob.type, 'x-wanxiang-hash': info.hash });
      await storage.put(key, new Response(blob, { headers })).catch(() => {});
    }
    update({ loaded, total: loaded, cached: false });
    return blob;
  }
  async function read(file, progress = () => {}) {
    if (disposed) throw new DOMException('资源载入已取消', 'AbortError');
    const key = new URL(file, base).href;
    let job = pending.get(key);
    if (!job) {
      job = { listeners: new Set(), status: null, promise: null };
      job.promise = download(file, (status) => {
        job.status = status;
        job.listeners.forEach((listener) => listener(status));
      }).finally(() => pending.delete(key));
      pending.set(key, job);
    }
    job.listeners.add(progress);
    if (job.status) progress(job.status);
    try {
      return await job.promise;
    } finally {
      job.listeners.delete(progress);
    }
  }
  async function image(file, progress) {
    const blob = await read(file, progress);
    controller.signal.throwIfAborted();
    const element = new Image();
    const url = URL.createObjectURL(blob);
    images.add(url);
    try {
      await decode(element, url);
      controller.signal.throwIfAborted();
      return element;
    } catch (error) {
      await evict(file);
      throw error;
    } finally {
      URL.revokeObjectURL(url);
      images.delete(url);
    }
  }
  async function attach(element, file) {
    element.dataset.asset = file;
    const blob = await read(file);
    if (disposed || !element.isConnected || element.dataset.asset !== file) return;
    const url = URL.createObjectURL(blob);
    images.add(url);
    try {
      await decode(element, url);
    } catch (error) {
      await evict(file);
      throw error;
    } finally {
      URL.revokeObjectURL(url);
      images.delete(url);
    }
  }
  async function evict(file) {
    const storage = await disk();
    if (storage) await storage.delete(new URL(file, base).href).catch(() => {});
  }
  async function decode(element, url) {
    await new Promise((resolve, reject) => {
      element.onload = resolve;
      element.onerror = () => reject(Error('图片解码失败，请重试'));
      element.src = url;
    });
    element.onload = element.onerror = null;
    if (typeof element.decode === 'function') await element.decode();
  }
  return {
    read,
    image,
    attach,
    manifest,
    evict,
    dispose() {
      disposed = true;
      controller.abort();
      images.forEach((url) => URL.revokeObjectURL(url));
      images.clear();
      pending.clear();
    },
  };
}
