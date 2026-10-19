import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import {
  createConnectionStore,
  DEFAULT_OUTPUT_TOKENS,
  API_KINDS,
} from '../src/ai/connection-store.js';
export { DEFAULT_OUTPUT_TOKENS, MAX_OUTPUT_TOKENS, API_KINDS } from '../src/ai/connection-store.js';

export async function createAiSettings(settingsFile) {
  let snapshot = {};
  try {
    snapshot = JSON.parse(await readFile(settingsFile, 'utf8'));
  } catch {
    /* Fresh install. */
  }
  if ((snapshot.version || 1) < 3) {
    for (const kind of API_KINDS) {
      const entry = snapshot.profiles?.[kind] || snapshot[kind];
      if (entry && [4096, 8192, 16384].includes(entry.maxTokens))
        entry.maxTokens = DEFAULT_OUTPUT_TOKENS;
    }
    for (const entry of snapshot.apiPresets || [])
      if ([4096, 8192, 16384].includes(entry.maxTokens)) entry.maxTokens = DEFAULT_OUTPUT_TOKENS;
  }
  return createConnectionStore({
    snapshot,
    initial: {
      baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
      model: process.env.OPENAI_MODEL || '',
      apiKey: process.env.OPENAI_API_KEY || '',
    },
    save: async (value) => {
      await mkdir(path.dirname(settingsFile), { recursive: true });
      await writeFile(settingsFile + '.tmp', JSON.stringify(value, null, 2), { mode: 0o600 });
      await rename(settingsFile + '.tmp', settingsFile);
    },
  });
}
