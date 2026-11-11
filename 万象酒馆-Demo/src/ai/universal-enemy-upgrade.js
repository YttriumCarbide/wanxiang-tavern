import { newWorldEntry } from './worldbook.js';
import { UNIVERSAL_ENEMIES, UNIVERSAL_BOSSES } from '../content/universal-adversaries.js';
import { monsterNarrativeText } from './monster-narrative.js';

/** Store each generic creature's world lore as its own script/chat-triggered entry. */
export function upgradeUniversalEnemies(source) {
  const book = structuredClone(source);
  const old = Object.values(book.entries || {}).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'universal-enemies',
  );
  if (old) delete book.entries[old.uid];
  const existingIds = new Set(
    Object.values(book.entries)
      .map((entry) => entry.extensions?.wanxiang?.monsterId)
      .filter(Boolean),
  );
  let uid = Math.max(-1, ...Object.keys(book.entries || {}).map(Number)) + 1;
  for (const enemy of [...UNIVERSAL_ENEMIES, ...UNIVERSAL_BOSSES]) {
    if (existingIds.has(enemy.id)) continue;
    book.entries[uid] = {
      ...newWorldEntry(uid),
      comment: `怪物图鉴：${enemy.name}`,
      key: [enemy.id, enemy.name],
      content: `名称：${enemy.name}\n设定：${monsterNarrativeText(enemy.description)}`,
      matchScenario: true,
      preventRecursion: true,
      order: 200,
      apiTargets: ['script', 'chat'],
      extensions: { wanxiang: { monsterId: enemy.id, apiTargets: ['script', 'chat'] } },
    };
    uid++;
  }
  return book;
}
