import { readFile } from 'node:fs/promises';
import { atomicWrite } from './disk-store.mjs';

/** Script-owned preferences stay on this machine, outside exported presets and AI context. */
export async function createHelperStorage(file) {
  let stored = {},
    writes = Promise.resolve();
  try {
    stored = JSON.parse(await readFile(file, 'utf8'));
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
  }
  function check(id) {
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,100}$/.test(id)) throw Error('扩展存储ID无效');
  }
  return {
    get(id) {
      check(id);
      return structuredClone(Object.hasOwn(stored, id) ? stored[id] : {});
    },
    async save(id, value) {
      check(id);
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        Object.values(value).some((item) => typeof item !== 'string') ||
        Buffer.byteLength(JSON.stringify(value)) > 4000000
      )
        throw Error('扩展存储需要不超过4MB的字符串字典');
      const nextValue = structuredClone(value);
      const result = writes
        .catch(() => {})
        .then(async () => {
          const next = { ...stored, [id]: nextValue };
          await atomicWrite(file, JSON.stringify(next));
          stored = next;
          return { saved: true };
        });
      writes = result;
      return result;
    },
  };
}
