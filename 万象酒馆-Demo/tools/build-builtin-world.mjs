import { upgradePlaytestWorldbook } from '../src/ai/playtest-upgrade.js';
import { mkdtemp, readFile, writeFile, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorldbookStore } from '../server/worldbook-store.mjs';
import { characterWorldEntry } from '../src/ai/worldbook.js';
import { upgradeRuinsWorldbook } from '../src/ai/ruins-worldbook.js';
import { upgradeCharacterGeneration } from '../src/ai/character-generation-upgrade.js';
import { characterGenerationSources } from '../server/worldbook-generation.mjs';
import { upgradeContinuityRules } from '../src/ai/continuity-upgrade.js';
import { upgradeGenerationExperience } from '../src/ai/generation-experience-upgrade.js';
import { upgradeStatusEmblems } from '../src/ai/status-emblem-upgrade.js';
import { upgradeUniversalEnemies } from '../src/ai/universal-enemy-upgrade.js';
import { upgradeFrostWorldbook } from '../src/ai/frost-worldbook.js';
import { upgradeEnemyBaseWorldbook } from '../src/ai/enemy-base-upgrade.js';

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
    // Public authored entries are source assets, never read from a player's saved worldbook.
    const extras = JSON.parse(
      await readFile(path.join(root, 'prompts/worldbook/official-extra-entries.json'), 'utf8'),
    );
    for (const [key, entry] of Object.entries(extras)) {
      const marker = entry.extensions?.wanxiang;
      const existing = Object.values(book.entries).find((item) =>
        marker?.dungeonId
          ? [
              item.extensions?.wanxiang?.dungeonId,
              item.extensions?.wanxiang?.officialDungeonId,
            ].includes(marker.dungeonId)
          : marker?.generationRule &&
            item.extensions?.wanxiang?.generationRule === marker.generationRule,
      );
      const targetUid =
        existing?.uid ??
        (book.entries[key] ? Math.max(...Object.keys(book.entries).map(Number)) + 1 : Number(key));
      book.entries[targetUid] = { ...entry, uid: targetUid, displayIndex: targetUid };
    }
    const updated = upgradeCharacterGeneration(
      upgradeRuinsWorldbook(book),
      await characterGenerationSources(),
    );
    book.entries = upgradeGenerationExperience(
      upgradeContinuityRules(updated),
      await readFile(path.join(root, 'prompts/worldbook/creation-output.md'), 'utf8'),
    ).entries;
    book.entries = upgradeFrostWorldbook(
      upgradeUniversalEnemies(upgradeStatusEmblems(book)),
    ).entries;
    book.entries = upgradePlaytestWorldbook(
      upgradeEnemyBaseWorldbook(book),
      (await characterGenerationSources()).rules,
    ).entries;
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
