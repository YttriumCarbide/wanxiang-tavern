export const CHARACTER_CLEANUP_REVISION = '2026-10-19-personas';

export const RETIRED_OFFICIAL_DRAFT_IDS = Object.freeze([
  'official-lyria',
  'official-morrow',
  'official-serin',
  'official-vesper',
  'official-rook',
]);

const RETIRED_OFFICIAL_DRAFT_SET = new Set(RETIRED_OFFICIAL_DRAFT_IDS);

export function hasCampaignCharacterPortrait(entry) {
  if (entry?.combat?.customPortrait || entry?.combat?.customStanding) return true;
  const portrait = String(entry?.combat?.portrait || entry?.portrait || '').trim();
  return /\.(png|jpe?g|webp|avif)(?:$|\?)/i.test(portrait);
}

export function isRetiredCampaignCharacter(entry, protagonistId = null) {
  if (!entry || typeof entry.id !== 'string') return false;
  if (entry.id === protagonistId) return false;
  if (RETIRED_OFFICIAL_DRAFT_SET.has(entry.id)) return true;
  if (entry.questRecruit === true || entry.source === 'official') return false;
  const hasLore =
    typeof entry.setting?.worldbook === 'string' && entry.setting.worldbook.trim().length > 0;
  return !hasCampaignCharacterPortrait(entry) && !hasLore;
}

/** One requested cleanup; future summons with new IDs are unaffected. */
export function cleanCharacterEntries(book) {
  const removed = [];
  for (const [uid, entry] of Object.entries(book.entries)) {
    const id = entry.extensions?.wanxiang?.characterId;
    const persona = id || entry.comment?.startsWith('人物详情：');
    const isOfficial = typeof id === 'string' && id.startsWith('official-');
    if (!persona || isOfficial || entry.comment === '人物详情：青缘') continue;
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
  for (const id of retired) {
    if (typeof id === 'string' && id.startsWith('official-')) retired.delete(id);
  }
  retired.delete(library.campaign.protagonistId);
  const changed = library.characters.some((member) => retired.has(member.id));
  if (!changed) return false;
  library.characters = library.characters.filter((member) => !retired.has(member.id));
  library.party = library.party.map((id) => (retired.has(id) ? null : id));
  for (const id of retired) delete library.relationships[id];
  library.prepared = null;
  return true;
}
