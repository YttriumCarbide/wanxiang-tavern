import { newWorldEntry } from './worldbook.js';

/** Replace only project-owned generation instructions; preserve custom prose as inactive copies. */
export function upgradeCharacterGeneration(source, { rules, reference }) {
  const book = structuredClone(source);
  let uid =
    Math.max(
      -1,
      ...Object.keys(book.entries || {})
        .map(Number)
        .filter(Number.isFinite),
    ) + 1;
  for (const [key, entry] of Object.entries(book.entries || {})) {
    const marker = entry.extensions?.wanxiang;
    if (
      marker?.generationExample === 'character' ||
      ['角色生成 · 完整格式示例', '角色生成 · JSON格式示例 @D'].includes(entry.comment)
    ) {
      delete book.entries[key];
      continue;
    }
    const rule = marker?.generationRule;
    if (!Object.hasOwn(rules, rule) || entry.content.trim() === rules[rule].trim()) continue;
    book.entries[uid] = {
      ...structuredClone(entry),
      uid,
      displayIndex: uid,
      comment: `${entry.comment} · v4迁移前留存（停用）`,
      disable: true,
      apiTargets: [],
      extensions: { wanxiangMigration: { originalUid: entry.uid, preserved: true, version: 33 } },
    };
    uid++;
    entry.content = rules[rule];
  }
  const existing = Object.values(book.entries).find(
    (entry) => entry.extensions?.wanxiang?.generationRule === 'character-numeric-reference',
  );
  if (existing) existing.content = reference;
  else {
    book.entries[uid] = {
      ...newWorldEntry(uid),
      comment: '角色生成 · 官方基础数值参考',
      content: reference,
      constant: true,
      preventRecursion: true,
      ignoreBudget: true,
      apiTargets: ['character'],
      position: 4,
      role: 0,
      depth: 0,
      order: 9997,
      extensions: { wanxiang: { generationRule: 'character-numeric-reference' } },
    };
  }
  return book;
}
