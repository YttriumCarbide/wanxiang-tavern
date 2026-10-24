import { newWorldEntry } from './worldbook.js';

/** Add an editable request-specific instruction without replacing any existing player prose. */
export function upgradeCharacterConstraints(source, content) {
  const book = structuredClone(source);
  if (
    Object.values(book.entries || {}).some(
      (entry) => entry.extensions?.wanxiang?.generationRule === 'character-complexity',
    )
  )
    return book;
  const uid =
    Math.max(
      -1,
      ...Object.keys(book.entries || {})
        .map(Number)
        .filter(Number.isFinite),
    ) + 1;
  book.entries ||= {};
  book.entries[uid] = {
    ...newWorldEntry(uid),
    comment: '角色生成 · 本次机制权限与自检',
    content,
    constant: true,
    preventRecursion: true,
    ignoreBudget: true,
    apiTargets: ['character'],
    position: 4,
    role: 0,
    depth: 0,
    order: 9998,
    extensions: { wanxiang: { generationRule: 'character-complexity' } },
  };
  return book;
}
