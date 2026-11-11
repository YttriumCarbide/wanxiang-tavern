import { characterEntryCategory, classifyCharacterEntry } from './worldbook.js';

/** Migrate only character titles/targets; their prose and other entry settings survive. */
export function upgradeCharacterEntries(source) {
  const book = structuredClone(source);
  book.extensions ||= {};
  book.extensions.wanxiang ||= {};
  if (book.extensions.wanxiang.characterEntriesRevision >= 55) return book;
  for (const [uid, entry] of Object.entries(book.entries || {})) {
    if (!characterEntryCategory(entry)) continue;
    const id = entry.extensions?.wanxiang?.characterId || '';
    const name = entry.key?.[0] || entry.comment.replace(/^[^：:]*[：:]/u, '');
    book.entries[uid] = classifyCharacterEntry(entry, { id, setting: { name } });
    book.entries[uid].apiTargets = ['script', 'chat'];
    book.entries[uid].extensions.wanxiang.apiTargets = ['script', 'chat'];
    if (id === 'official-aegis')
      book.entries[uid].content = entry.content.replaceAll('攻击方式｜霜月斩', '攻击方式｜月闪');
  }
  book.extensions.wanxiang.characterEntriesRevision = 55;
  return book;
}
