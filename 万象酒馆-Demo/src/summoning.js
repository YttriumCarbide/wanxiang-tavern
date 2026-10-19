import { HEROES } from './data.js';
import { officialCharacter } from './ai/library.js';

/** Worldbook prose is editable; official identities and combat definitions stay code-owned. */
export function officialSummonPool(library, book) {
  const owned = new Set(library.characters.map((entry) => entry.id));
  return [...HEROES.map((hero) => hero.id), 'edith'].flatMap((id) => {
    const entry = officialCharacter(id);
    if (owned.has(entry.id)) return [];
    const lore = Object.values(book?.entries || {}).find(
      (item) => item.extensions?.wanxiang?.characterId === entry.id,
    );
    if (!lore || typeof lore.content !== 'string' || !lore.content.trim()) return [];
    entry.setting.worldbook = lore.content.trim();
    entry.setting.edited = true;
    return [entry];
  });
}

export function summonSource(mode, roll) {
  if (!['official', 'chaos', 'infinite', 'npc'].includes(mode)) throw Error('召唤术无效');
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw Error('召唤随机值无效');
  return mode === 'chaos' ? (roll < 1 / 3 ? 'official' : roll < 2 / 3 ? 'npc' : 'infinite') : mode;
}
