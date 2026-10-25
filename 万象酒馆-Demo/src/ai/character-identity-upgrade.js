import { newWorldEntry } from './worldbook.js';

/** Add only a project instruction, leaving all imported prose and player edits intact. */
export function upgradeCharacterIdentity(source, content) {
  const book = structuredClone(source);
  book.entries ||= {};
  if (
    Object.values(book.entries).some(
      (entry) => entry.extensions?.wanxiang?.generationRule === 'character-identity',
    )
  )
    return book;
  const uid = Math.max(-1, ...Object.keys(book.entries).map(Number).filter(Number.isFinite)) + 1;
  book.entries[uid] = {
    ...newWorldEntry(uid),
    comment: '角色生成 · 特色、说话方式与主动技能差异',
    content,
    constant: true,
    preventRecursion: true,
    ignoreBudget: true,
    apiTargets: ['character'],
    position: 4,
    role: 0,
    depth: 0,
    order: 9997,
    extensions: { wanxiang: { generationRule: 'character-identity' } },
  };
  return book;
}
