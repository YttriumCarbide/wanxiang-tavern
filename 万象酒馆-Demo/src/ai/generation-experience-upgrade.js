export function upgradeGenerationExperience(source, creationOutput) {
  const book = structuredClone(source);
  let uid = Math.max(-1, ...Object.keys(book.entries || {}).map(Number)) + 1;
  for (const entry of Object.values(book.entries || {})) {
    const marker = entry.extensions?.wanxiang || {};
    const rule = marker.generationRule;
    if (
      rule === 'creation-output' &&
      creationOutput &&
      entry.content.trim() !== creationOutput.trim()
    ) {
      book.entries[uid] = {
        ...structuredClone(entry),
        uid,
        displayIndex: uid,
        disable: true,
        apiTargets: [],
        comment: `${entry.comment} · v2构筑前留存（停用）`,
        extensions: { wanxiangMigration: { originalUid: entry.uid, preserved: true, version: 35 } },
      };
      uid++;
      entry.content = creationOutput;
    }
    if (rule === 'map-output' && !entry.content.includes('【主线后续构筑】'))
      entry.content +=
        '\n\n【主线后续构筑】当本次输入包含continuation时，阅读其中前六关的真实正文，继承其结果，为接下来引入至少三个互不相同、可行动的新目标。额外输出goals字符串数组（至少3项，各含目标、目的地或人物、第一步），并新增敌人及至少一位全新Boss。扩充只写新增内容，不复述旧历史。';
    if (rule === 'script-definition' && !entry.content.includes('【无限探索叙事】'))
      entry.content +=
        '\n\n【无限探索叙事】当本次请求包含dynamicWorld时，正文优先跟随人物、目标、交互和世界变化。禁止在正文使用Boss、首领战等游戏称呼；大多数底层敌人不必写入正文，情节不需要与每场实际战斗同地同敌，不要为了有限敌人池原地打转。确实符合剧情才自然描写敌人。data.encounters仍必须为五场战斗选择合法敌人，最后一场含Boss标记；这是数据配置要求，不是小说情节要求。';
    if (entry.content.includes('灰的真相 · 诅咒显现'))
      entry.content = entry.content.replaceAll('灰的真相 · 诅咒显现', '诅咒显现');
    if (entry.comment.includes('灰的真相 · 诅咒显现'))
      entry.comment = entry.comment.replaceAll('灰的真相 · 诅咒显现', '诅咒显现');
  }
  return book;
}
