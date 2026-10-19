import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { characterWorldEntry } from '../src/ai/worldbook.js';

/** Reproducible public canon, built without reading any user configuration or saved worldbook. */
export async function buildBuiltinWorld() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await mkdir(path.join(root, '.runtime'), { recursive: true });
  const directory = await mkdtemp(path.join(root, '.runtime/public-world-'));
  const resolved = path.resolve(directory);
  if (!resolved.startsWith(path.join(root, '.runtime') + path.sep))
    throw Error('拒绝清理工作区之外的目录');
  try {
    const store = await createWorldbookStore(directory);
    const { book } = await store.get('tavern-world');
    const retained = JSON.parse(
      await readFile(path.join(root, 'src/content/retained-lore.json'), 'utf8'),
    );
    for (const [uid, entry] of Object.entries(book.entries)) {
      if (entry.extensions?.wanxiang?.characterId) delete book.entries[uid];
    }
    let uid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
    for (const [id, setting] of Object.entries(retained)) {
      book.entries[uid] = characterWorldEntry(
        { id, setting: { name: setting.name, worldbook: setting.content } },
        uid,
      );
      uid++;
    }
    book.extensions = {
      wanxiang: {
        publicSeed: 1,
        characterCleanup: {
          revision: 'public-canon',
          removedIds: [
            'official-lyria',
            'official-morrow',
            'official-serin',
            'official-vesper',
            'official-rook',
          ],
        },
      },
    };
    await writeFile(
      path.join(root, 'assets/builtin-worldbook.json'),
      JSON.stringify(book, null, 2) + '\n',
    );
    return book;
  } finally {
    await rm(resolved, { recursive: true, force: true });
  }
}
