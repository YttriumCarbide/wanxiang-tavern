import { newWorldEntry } from './worldbook.js';
/** Append editable asset formats once; imported user edits remain authoritative. */
export function upgradeAssetWorldbook(book, contents) {
  const next = structuredClone(book);
  for (const kind of ['map', 'creation']) {
    if (
      Object.values(next.entries).some(
        (entry) => entry.extensions?.wanxiang?.generationRule === kind + '-output',
      )
    )
      continue;
    const uid = Math.max(-1, ...Object.keys(next.entries).map(Number)) + 1;
    next.entries[uid] = {
      ...newWorldEntry(uid),
      comment: kind === 'map' ? '地图格式与敌我目标' : '以太造物格式',
      constant: true,
      position: 4,
      depth: 0,
      order: 9999,
      ignoreBudget: true,
      preventRecursion: true,
      apiTargets: [kind],
      content: contents[kind],
      extensions: { wanxiang: { generationRule: kind + '-output' } },
    };
  }
  return next;
}
