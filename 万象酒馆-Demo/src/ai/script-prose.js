export const SCRIPT_PROSE_BUDGET = Object.freeze({ target: 1500, minimum: 1200, maximum: 1800 });

/** Compare saved source prose, without rejecting valid output or sending old chapters as examples. */
export function scriptRepetitionWarnings(script, previous) {
  if (script.schemaVersion < 3) return [];
  const signature = (book) => JSON.stringify(book.story.map((part) => part.replace(/\s/gu, '')));
  const source = signature(script);
  const match = previous.find((book) => book.schemaVersion >= 3 && signature(book) === source);
  return match
    ? [
        {
          path: 'output.repetition',
          message: `本次正文与已保存的《${match.title}》相同（忽略空白）。本窗口显示本次API原始返回，未使用旧剧本替代，也未自动重试。`,
        },
      ]
    : [];
}

/** Count displayed authored prose once; IDs, metadata, JSON and compiled text are excluded. */
export function scriptProseReport(script) {
  const parts = script.schemaVersion >= 3 ? [...script.story] : [script.opening];
  for (const scene of script.scenes || []) {
    parts.push(scene.opening);
    for (const stage of ['before', 'after', 'interlude'])
      for (const line of scene[stage] || [])
        parts.push(
          ...(typeof line.action === 'string' ? [line.action, line.dialogue] : [line.text]),
        );
  }
  const characters = Array.from(
    parts
      .filter((part) => typeof part === 'string')
      .join('')
      .replace(/\s/gu, ''),
  ).length;
  return {
    ...(script.schemaVersion >= 3 ? {} : SCRIPT_PROSE_BUDGET),
    characters,
    unit: '非空白字符（含标点）',
  };
}
