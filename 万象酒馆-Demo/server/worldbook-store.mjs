import { setTimeout as waitForFile } from 'node:timers/promises';
import { mkdir, readFile, writeFile, rename, readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  normalizeWorldbook,
  normalizeWorldSettings,
  newWorldEntry,
  syncBuiltinWorldbook,
} from '../src/ai/worldbook.js';
import { tavernCanonText } from '../src/content/world.js';

const root = fileURLToPath(new URL('../', import.meta.url));
let cachedBuiltinBook = null;

async function loadBuiltinWorldbook() {
  if (!cachedBuiltinBook) {
    const raw = JSON.parse(
      await readFile(path.join(root, 'assets/builtin-worldbook.json'), 'utf8'),
    );
    cachedBuiltinBook = normalizeWorldbook(raw, '万象酒馆世界书').book;
  }
  return structuredClone(cachedBuiltinBook);
}

/** Local JSON books and selection settings. Never reads the user's SillyTavern private data. */
export async function createWorldbookStore(directory) {
  const booksDirectory = path.join(directory, 'books');
  await mkdir(booksDirectory, { recursive: true });
  let writes = Promise.resolve();
  const write = (file, value) => {
    writes = writes
      .catch(() => {})
      .then(async () => {
        await writeFile(file + '.tmp', JSON.stringify(value, null, 2) + '\n');
        for (let attempt = 0; ; attempt++) {
          try {
            await rename(file + '.tmp', file);
            break;
          } catch (failure) {
            if (
              process.platform !== 'win32' ||
              !['EPERM', 'EBUSY'].includes(failure.code) ||
              attempt >= 5
            )
              throw failure;
            await waitForFile(25 * 2 ** attempt);
          }
        }
      });
    return writes;
  };
  const fileFor = (id) => {
    if (typeof id !== 'string' || !/^[a-z0-9-]{1,100}$/.test(id)) throw Error('世界书ID无效');
    return path.join(booksDirectory, id + '.json');
  };
  const initialized = await readFile(path.join(directory, 'settings.json')).then(
    () => true,
    (failure) => {
      if (failure.code !== 'ENOENT') throw failure;
      return false;
    },
  );
  try {
    await readFile(fileFor('tavern-canon'));
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
    if (!initialized) {
      await write(fileFor('tavern-canon'), {
        name: '万象酒馆 · 公共设定',
        entries: {
          0: {
            ...newWorldEntry(),
            comment: '酒馆与召唤的公共设定（可编辑）',
            content: tavernCanonText(),
            constant: true,
            ignoreBudget: true,
            order: 1000,
          },
        },
      });
    }
  }
  let settings;
  try {
    settings = normalizeWorldSettings(
      JSON.parse(await readFile(path.join(directory, 'settings.json'), 'utf8')),
    );
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
    settings = normalizeWorldSettings({ globalSelect: ['tavern-world'] });
  }
  let states;
  try {
    states = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
    states = {};
  }

  const builtin = await loadBuiltinWorldbook();
  let existingWorld = null;
  try {
    existingWorld = JSON.parse(await readFile(fileFor('tavern-world'), 'utf8'));
  } catch (failure) {
    if (failure.code !== 'ENOENT') throw failure;
  }
  if (!existingWorld && !initialized) {
    await write(fileFor('tavern-world'), syncBuiltinWorldbook({ entries: {} }, builtin));
  } else if (existingWorld) {
    const synced = syncBuiltinWorldbook(existingWorld, builtin);
    if (JSON.stringify(synced) !== JSON.stringify(existingWorld)) {
      await write(fileFor('tavern-world'), synced);
    }
  }
  if (!initialized) {
    await write(path.join(directory, 'settings.json'), settings);
  }

  async function get(id) {
    const raw = JSON.parse(await readFile(fileFor(id), 'utf8'));
    return { id, ...normalizeWorldbook(raw) };
  }
  async function list() {
    const result = [];
    for (const file of await readdir(booksDirectory)) {
      if (!file.endsWith('.json')) continue;
      const id = file.slice(0, -5);
      try {
        const { book, warnings } = await get(id);
        result.push({ id, name: book.name, entries: Object.keys(book.entries).length, warnings });
      } catch (failure) {
        result.push({ id, name: id, invalid: true, warnings: [failure.message] });
      }
    }
    return result;
  }
  const selectedIds = (kind, input = {}) => {
    const ids = new Set([...(settings.globalSelect || []), ...(settings[kind] || [])]);
    for (const member of input.party || []) {
      for (const bound of settings.bindings?.[member.id] || []) ids.add(bound);
    }
    return [...ids];
  };
  return {
    list,
    get,
    async visible() {
      return { books: (await list()).filter((book) => book.id !== 'tavern-canon'), settings };
    },
    async save({ id = 'world-' + randomUUID().slice(0, 8), book }) {
      const normalized = normalizeWorldbook(book, book?.name || id);
      await write(fileFor(id), normalized.book);
      return { id, ...normalized };
    },
    async delete(id) {
      await unlink(fileFor(id));
      const clean = (items = []) => items.filter((item) => item !== id);
      settings = normalizeWorldSettings({
        ...settings,
        globalSelect: clean(settings.globalSelect),
        character: clean(settings.character),
        script: clean(settings.script),
        chat: clean(settings.chat),
        summary: clean(settings.summary),
        map: clean(settings.map),
        creation: clean(settings.creation),
        bindings: Object.fromEntries(
          Object.entries(settings.bindings || {}).map(([key, value]) => [key, clean(value)]),
        ),
      });
      await write(path.join(directory, 'settings.json'), settings);
      return this.visible();
    },
    async configure(next) {
      settings = normalizeWorldSettings(next);
      await write(path.join(directory, 'settings.json'), settings);
      return this.visible();
    },
    async resolve(kind, input = {}) {
      const books = [];
      for (const id of selectedIds(kind, input)) {
        try {
          const { book } = await get(id);
          books.push({ ...book, id });
        } catch (failure) {
          if (failure.code !== 'ENOENT') throw failure;
        }
      }
      return {
        books,
        settings,
        state: states[kind] || { step: 0, effects: {} },
      };
    },
    async commit(kind, nextState, expectedStep) {
      const current = states[kind]?.step || 0;
      if (expectedStep !== undefined && current !== expectedStep) return false;
      states[kind] = nextState;
      await write(path.join(directory, 'state.json'), states);
      return true;
    },
  };
}
