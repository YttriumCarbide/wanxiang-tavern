import { readFile, writeFile, rename } from 'node:fs/promises';
import { normalizeRegexScripts } from '../src/ai/regex.js';

export async function createRegexStore(file) {
  let scripts;
  try {
    scripts = normalizeRegexScripts(JSON.parse(await readFile(file, 'utf8')));
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
    scripts = [];
  }
  let writes = Promise.resolve();
  return {
    get: () => structuredClone(scripts),
    async save(raw) {
      const next = normalizeRegexScripts(raw);
      writes = writes
        .catch(() => {})
        .then(async () => {
          await writeFile(file + '.tmp', JSON.stringify({ scripts: next }, null, 2));
          await rename(file + '.tmp', file);
          scripts = next;
        });
      await writes;
      return { scripts: structuredClone(scripts) };
    },
  };
}
