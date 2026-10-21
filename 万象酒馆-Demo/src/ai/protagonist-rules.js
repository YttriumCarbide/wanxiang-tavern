export function upgradeProtagonistRules(book, guidance) {
  const next = structuredClone(book);
  for (const entry of Object.values(next.entries || {})) {
    if (
      entry.extensions?.wanxiang?.generationRule !== 'character-output' ||
      entry.content.includes('【主角强势开局】')
    )
      continue;
    entry.content = entry.content
      .replaceAll('第三次完整副本结算', '第二次完整副本结算')
      .replaceAll('第三次副本结算事件', '第二次副本结算事件');
    entry.content += '\n\n【主角强势开局】\n' + guidance;
  }
  return next;
}
