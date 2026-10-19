import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizePromptPreset } from '../src/ai/presets.js';

export async function createPromptStore(directory) {
  await mkdir(directory, { recursive: true });
  const fileFor = (id) => {
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,100}$/.test(id)) throw Error('提示词预设ID无效');
    return path.join(directory, id + '.json');
  };
  async function get(id) {
    const builtin =
      !id ||
      ['character-default', 'script-default', 'chat-default', 'quick-chat-default'].includes(id);
    const raw = JSON.parse(
      await readFile(
        builtin
          ? new URL(`../prompts/framework/${id || 'character-default'}.json`, import.meta.url)
          : fileFor(id),
        'utf8',
      ),
    );
    return normalizePromptPreset(raw, id);
  }
  let writes = Promise.resolve();
  return {
    get,
    async list() {
      const result = [];
      for (const name of await readdir(directory)) {
        if (!name.endsWith('.json')) continue;
        const id = name.slice(0, -5);
        if (
          ['character-default', 'script-default', 'chat-default', 'quick-chat-default'].includes(id)
        )
          continue;
        try {
          const { preset, warnings } = await get(id);
          result.push({ id, name: preset.name, warnings, builtin: id.endsWith('-default') });
        } catch (failure) {
          result.push({ id, name, invalid: true, warnings: [failure.message] });
        }
      }
      return result;
    },
    async save(input) {
      const id = input.id || `prompt-${randomUUID()}`;
      const result = normalizePromptPreset(input.preset, id);
      const target = fileFor(id);
      writes = writes
        .catch(() => {})
        .then(async () => {
          await writeFile(target + '.tmp', JSON.stringify(result.preset, null, 2) + '\n');
          await rename(target + '.tmp', target);
        });
      await writes;
      return result;
    },
    async delete(id) {
      if (
        ['character-default', 'script-default', 'chat-default', 'quick-chat-default'].includes(id)
      )
        throw Error('默认预设可以编辑，但不能删除');
      await unlink(fileFor(id));
    },
  };
}
