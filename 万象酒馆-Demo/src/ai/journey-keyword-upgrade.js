export function upgradeJourneyKeywords(source) {
  const book = structuredClone(source);
  for (const entry of Object.values(book.entries || {})) {
    const rule = entry.extensions?.wanxiang?.generationRule;
    if (typeof entry.content !== 'string' || !['script-output', 'script-definition'].includes(rule))
      continue;
    entry.content = entry.content
      .replaceAll('title/tags/npcs', 'title/npcs')
      .replaceAll(
        'tags是关键词，供副本记录像世界书一样触发；',
        '回顾关键词由总结API在经历结束后提取；',
      );
  }
  return book;
}
