import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { imageType } from './portrait-images.mjs';

/** Original bytes live on disk; saves contain a small, stable character-owned reference. */
export async function createPortraitStore(directory) {
  await mkdir(directory, { recursive: true });
  const extensions = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };
  return {
    async save(dataUrl) {
      if (
        typeof dataUrl !== 'string' ||
        dataUrl.length > 8500000 ||
        !/^data:image\/(?:png|jpeg|webp|gif|avif);base64,[a-zA-Z0-9+/=\r\n]+$/.test(dataUrl)
      )
        throw Error('请选择6MB以内的有效立绘图片');
      const bytes = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
      if (!bytes.length || bytes.length > 6 * 1024 * 1024) throw Error('图片不能超过6MB');
      const mime = imageType(bytes);
      const name = `${createHash('sha256').update(bytes).digest('hex')}.${extensions[mime]}`;
      await writeFile(path.join(directory, name), bytes, { flag: 'w' });
      return { url: `/api/ai/portraits/${name}` };
    },
    async read(name) {
      if (!/^[a-f0-9]{64}\.(png|jpg|webp|gif|avif)$/.test(name)) throw Error('立绘引用无效');
      const bytes = await readFile(path.join(directory, name));
      return { bytes, mime: imageType(bytes) };
    },
  };
}
