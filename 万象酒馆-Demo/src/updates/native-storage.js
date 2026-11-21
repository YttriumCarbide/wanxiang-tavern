import { assetPath } from './manifest.js';

const pcOrigin = 'http://127.0.0.1:17371';
const androidOrigin = 'https://appassets.androidplatform.net';

export function createNativeUpdateStore({ base }) {
  if (![pcOrigin, androidOrigin].includes(base.origin) || base.pathname !== '/') return null;
  const channel = base.origin === androidOrigin ? globalThis.wanxiangNativeUpdate : null;
  const pending = new Map();
  let sequence = 0;
  if (channel) {
    channel.onmessage = ({ data }) => {
      const { id, ok } = JSON.parse(data);
      pending.get(id)?.(ok);
    };
  }

  function address(area, file) {
    return new URL(`__wanxiang_native/v1/${area}/${file.sha256}/${assetPath(file.path)}`, base);
  }

  async function change(method, area, file, blob) {
    const url = address(area, file);
    if (channel) {
      const id = ++sequence;
      const header = new TextEncoder().encode(JSON.stringify({ id, method, path: url.pathname }));
      const length = new DataView(new ArrayBuffer(4));
      length.setUint32(0, header.length);
      const parts = [length.buffer, header];
      if (blob) parts.push(blob);
      const message = await new Blob(parts).arrayBuffer();
      const ok = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(Error('Local update storage timed out'));
        }, 60000);
        pending.set(id, (success) => {
          clearTimeout(timer);
          pending.delete(id);
          resolve(success);
        });
        try {
          channel.postMessage(message);
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        }
      });
      if (ok) return;
    } else if (base.origin === pcOrigin) {
      const response = await fetch(url, {
        method,
        body: blob,
        headers: { 'X-Wanxiang-Update': '1' },
      });
      if (response.ok) return;
    }
    throw Error('Local update storage rejected the ' + method + ' operation');
  }

  return {
    async read(area, file) {
      const response = await fetch(address(area, file), { cache: 'no-store' });
      if (response.status === 404) return null;
      if (!response.ok) throw Error('Local update storage read failed');
      return response.blob();
    },
    write(area, file, blob) {
      return change('PUT', area, file, blob);
    },
    remove(area, file) {
      return change('DELETE', area, file);
    },
  };
}
