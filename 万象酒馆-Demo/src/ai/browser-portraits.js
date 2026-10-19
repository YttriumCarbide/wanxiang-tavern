const MAX_BYTES = 6 * 1024 * 1024;
const EXTENSIONS = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

function imageType(bytes) {
  const text = (start, end) => String.fromCharCode(...bytes.subarray(start, end));
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value))
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') return 'image/webp';
  if (/^GIF8[79]a/.test(text(0, 6))) return 'image/gif';
  if (text(4, 8) === 'ftyp' && /avif|avis/.test(text(8, 32))) return 'image/avif';
  throw Error('请选择PNG、JPG、WebP、GIF或AVIF图片');
}

function toDataURL(bytes, mime) {
  let text = '';
  for (let offset = 0; offset < bytes.length; offset += 8192)
    text += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return `data:${mime};base64,${btoa(text)}`;
}

/** Original image bytes live in IndexedDB; the portrait worker serves stable local references. */
export function createBrowserPortraits(database, { fetchImpl = fetch, virtualImages = true } = {}) {
  return {
    async save(dataUrl) {
      if (
        typeof dataUrl !== 'string' ||
        dataUrl.length > 8500000 ||
        !/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-zA-Z0-9+/=\r\n]+$/.test(dataUrl)
      )
        throw Error('请选择6MB以内的有效立绘');
      const raw = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
      const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
      if (!bytes.length || bytes.length > MAX_BYTES) throw Error('图片不能超过6MB');
      const mime = imageType(bytes);
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
      const name =
        Array.from(digest, (value) => value.toString(16).padStart(2, '0')).join('') +
        '.' +
        EXTENSIONS[mime];
      await database.write([['portrait.' + name, new Blob([bytes], { type: mime })]]);
      return { url: virtualImages ? `./__portraits/${name}` : toDataURL(bytes, mime) };
    },
    async import(url, signal) {
      const target = new URL(url);
      if (!['https:', 'http:'].includes(target.protocol) || target.username || target.password)
        throw Error('请输入不含账号密码的图片直链');
      let response;
      try {
        response = await fetchImpl(target, {
          signal,
          credentials: 'omit',
          referrerPolicy: 'no-referrer',
        });
      } catch (failure) {
        throw Error('图床不允许跨域读取或网络失败，请下载图片后从本地导入。', { cause: failure });
      }
      if (!response.ok) throw Error('图片读取失败：HTTP ' + response.status);
      const reader = response.body.getReader();
      const chunks = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) throw Error('图片不能超过6MB');
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return { dataUrl: toDataURL(bytes, imageType(bytes)) };
    },
  };
}
