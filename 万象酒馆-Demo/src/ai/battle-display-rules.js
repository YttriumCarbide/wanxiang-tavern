/** Append owned integration guidance once, preserving existing content and switches. */
export function upgradeBattleDisplayRules(book, guidance) {
  const result = structuredClone(book);
  const kinds = ['character-output', 'script-output', 'map-output', 'creation-output'];
  for (const entry of Object.values(result.entries || {})) {
    if (
      kinds.includes(entry.extensions?.wanxiang?.generationRule) &&
      !entry.content.includes('【战斗说明用语与地点】')
    )
      entry.content += '\n\n' + guidance;
  }
  return result;
}
