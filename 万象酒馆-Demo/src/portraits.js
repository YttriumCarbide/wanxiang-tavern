import { localRequest } from './ai/local-client.js';
const PORTRAITS_KEY = 'wanxiang.portraits.v1';

function getStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    /* Node or restricted iframe environment */
  }
  return null;
}

export function loadCustomPortraits() {
  const storage = getStorage();
  if (!storage) return {};
  try {
    const raw = storage.getItem(PORTRAITS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveCustomPortrait(id, dataUrl) {
  const storage = getStorage();
  if (!storage) return;
  try {
    const all = loadCustomPortraits();
    if (dataUrl) all[id] = dataUrl;
    else delete all[id];
    storage.setItem(PORTRAITS_KEY, JSON.stringify(all));
  } catch (e) {
    console.error('Failed to save custom portrait:', e);
  }
}

export function portraitUrl(d) {
  if (d?.customPortrait) return d.customPortrait;
  const name = d?.portrait || 'guardian';
  return `./assets/portraits/${name}${/\.(svg|png|jpe?g|webp|avif)$/i.test(name) ? '' : '.svg'}`;
}

/** Portraits belong to a companion, so changing party slots cannot transfer their artwork. */
export function savedPortrait(portraits, entry) {
  const legacy = entry.combat?.id || entry.archetype;
  return (
    portraits[entry.id] ||
    entry.combat?.customPortrait ||
    (entry.source === 'official' && entry.id !== 'official-aegis' ? portraits[legacy] : undefined)
  );
}

export async function readPortraitFromUrl(value, signal, request = localRequest) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw Error('请输入完整的http或https图片链接');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw Error('请输入不含账号密码的http或https图片链接');
  const result = await request('portrait', { url: url.href }, { signal });
  return savePortraitOriginal(result.dataUrl, signal, request);
}

async function savePortraitOriginal(dataUrl, signal, request) {
  const result = await request('portrait/save', { dataUrl }, { signal });
  return result.url;
}

/** Keep original bytes and color profile; no canvas resampling or lossy recompression. */
export function readFileAsOptimizedImage(file, request = localRequest) {
  return new Promise((resolve, reject) => {
    if (
      !file ||
      !/^image\/(?:png|jpeg|webp|gif|avif)$/.test(file.type) ||
      file.size > 6 * 1024 * 1024
    ) {
      reject(Error('请选择6MB以内的PNG、JPG、WebP、GIF或AVIF立绘'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(Error('文件读取失败'));
    reader.onload = () =>
      savePortraitOriginal(reader.result, undefined, request).then(resolve, reject);
    reader.readAsDataURL(file);
  });
}
