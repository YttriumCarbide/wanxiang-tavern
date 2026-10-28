import { newWorldEntry } from './worldbook.js';

/** Keep imported presets intact; place the game output boundary after its format entries. */
export function upgradeGenerationBoundary(source, content) {
  const book = structuredClone(source);
  book.entries ||= {};
  if (
    Object.values(book.entries).some(
      (entry) => entry.extensions?.wanxiang?.generationRule === 'generation-boundary-output',
    )
  )
    return book;
  const uid = Math.max(-1, ...Object.keys(book.entries).map(Number).filter(Number.isFinite)) + 1;
  book.entries[uid] = {
    ...newWorldEntry(uid),
    comment: '数据生成 · 禁止预设额外正文与输出外壳',
    content,
    constant: true,
    preventRecursion: true,
    ignoreBudget: true,
    apiTargets: ['character', 'script', 'map', 'creation'],
    position: 4,
    role: 0,
    depth: 0,
    order: 10000,
    extensions: { wanxiang: { generationRule: 'generation-boundary-output' } },
  };
  return book;
}
