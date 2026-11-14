import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newWorldEntry, normalizeWorldbook } from '../src/ai/worldbook.js';
import { isMonsterWorldEntry, monsterNarrativeText } from '../src/ai/monster-narrative.js';
import { MONSTER_LORE, monsterWorldbook } from '../src/content/monsters.js';
import { DEFINITIONS } from '../src/data.js';

const root = fileURLToPath(new URL('../', import.meta.url));

/** Normalizes and supplements monster lore directly inside the canonical builtin worldbook asset. */
export async function buildBuiltinWorld() {
  const assetPath = path.join(root, 'assets/builtin-worldbook.json');
  const raw = JSON.parse(await readFile(assetPath, 'utf8'));
  for (const entry of Object.values(raw.entries || {})) {
    if (isMonsterWorldEntry(entry)) {
      entry.content = monsterNarrativeText(entry.content);
    }
  }
  const existingMonsterIds = new Set(
    Object.values(raw.entries || {})
      .map((entry) => entry.extensions?.wanxiang?.monsterId)
      .filter(Boolean),
  );
  let nextUid = Math.max(-1, ...Object.keys(raw.entries || {}).map(Number)) + 1;
  for (const id of Object.keys(MONSTER_LORE)) {
    const def = DEFINITIONS[id];
    if (!def || existingMonsterIds.has(id)) continue;
    raw.entries[nextUid] = {
      ...newWorldEntry(nextUid),
      comment: `怪物图鉴：${def.name}`,
      key: [id, def.name],
      content: monsterNarrativeText(monsterWorldbook(id, def.name)),
      constant: false,
      selective: true,
      order: 180,
      position: 1,
      matchScenario: true,
      excludeRecursion: true,
      preventRecursion: true,
      apiTargets: ['script', 'chat'],
      extensions: {
        wanxiang: {
          monsterId: id,
          apiTargets: ['script', 'chat'],
        },
      },
    };
    nextUid++;
  }
  const { book } = normalizeWorldbook(raw, '万象酒馆世界书');
  await writeFile(assetPath, JSON.stringify(book, null, 2) + '\n');
  return book;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await buildBuiltinWorld();
