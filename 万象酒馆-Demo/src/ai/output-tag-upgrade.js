const OUTPUT_RULES = new Set([
  'character-output',
  'chat-boundary',
  'creation-output',
  'generation-boundary-output',
  'map-output',
  'script-output',
]);

const replaceOutputTag = (content) =>
  String(content || '')
    .replaceAll('wanxiang_chat', 'wanxiang_output')
    .replaceAll('wanxiang_json', 'wanxiang_output');

/** Migrate only project-owned format rules and examples; preserve user-authored entries. */
export function upgradeOutputTagsWorldbook(source) {
  const book = structuredClone(source || { entries: {} });
  book.entries ||= {};
  for (const entry of Object.values(book.entries || {})) {
    const marker = entry.extensions?.wanxiang || {};
    if (!OUTPUT_RULES.has(marker.generationRule)) continue;
    entry.content = replaceOutputTag(entry.content);
  }
  return book;
}
