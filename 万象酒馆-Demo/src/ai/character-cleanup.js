export const CHARACTER_CLEANUP_REVISION = '2026-10-19-personas';
const retained = ['official-edith', 'official-aegis', 'official-pandora'];

/** One requested cleanup; future summons with new IDs are unaffected. */
export function cleanCharacterEntries(book) {
  const removed = [];
  for (const [uid, entry] of Object.entries(book.entries)) {
    const id = entry.extensions?.wanxiang?.characterId;
    const persona = id || entry.comment?.startsWith('人物详情：');
    if (!persona || retained.includes(id) || entry.comment === '人物详情：青缘') continue;
    removed.push(structuredClone(entry));
    delete book.entries[uid];
  }
  book.extensions = {
    ...book.extensions,
    wanxiang: {
      ...book.extensions?.wanxiang,
      characterCleanup: {
        revision: CHARACTER_CLEANUP_REVISION,
        removedIds: removed.map((entry) => entry.extensions?.wanxiang?.characterId).filter(Boolean),
      },
    },
  };
  return removed;
}

/** Remove only the retired IDs from an active campaign, keeping its player and all history. */
export function cleanLibraryCharacters(library, removedIds) {
  if (!library.campaign) return false;
  const retired = new Set(removedIds);
  retired.delete(library.campaign.protagonistId);
  for (const id of retained) retired.delete(id);
  const changed = library.characters.some((member) => retired.has(member.id));
  if (!changed) return false;
  library.characters = library.characters.filter((member) => !retired.has(member.id));
  library.party = library.party.map((id) => (retired.has(id) ? null : id));
  for (const id of retired) delete library.relationships[id];
  library.prepared = null;
  return true;
}
