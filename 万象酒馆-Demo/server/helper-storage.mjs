import { readFile, writeFile, rename } from 'node:fs/promises';

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
    if (!/^[a-z0-9-]{1,100}$/.test(id)) throw Error('扩展存储ID无效');
  }
  return {
    get(id) {
      check(id);
      return structuredClone(stored[id] || {});
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
      stored[id] = structuredClone(value);
      const snapshot = JSON.stringify(stored);
      writes = writes
        .catch(() => {})
        .then(async () => {
          await writeFile(file + '.tmp', snapshot, { mode: 0o600 });
          await rename(file + '.tmp', file);
        });
      await writes;
      return { saved: true };
    },
  };
}
