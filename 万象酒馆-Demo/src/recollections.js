import { BASE_WORLDS, routeKey } from './worlds.js';
import { dungeonMemoryText, restoredSummary } from './memory.js';
import { ENCOUNTER_COUNT } from './content/journey-rules.js';

export function canRecall(library, entry) {
  return (
    !!entry &&
    !entry.world &&
    BASE_WORLDS.includes(entry.map) &&
    entry.sequence < 6 &&
    !!library.exploration[routeKey(entry)]?.cleared.some((node) => node.id === entry.id)
  );
}

/** A new ephemeral reading/round state; never edit the first run or create AI history. */
export function recollectionScript(library, entry) {
  if (!canRecall(library, entry)) throw Error('仅已通关的主线关卡可以回忆');
  const source = entry.recollection || {};
  const record =
    (source.runId && library.history.find((item) => item.runId === source.runId)) ||
    library.history.find((item) => item.nodeId === entry.id && item.complete);
  const book =
    library.scripts.find((item) => item.id === (source.scriptId || record?.scriptId)) ||
    library.scripts.find((item) => item.exploration?.id === entry.id);
  const summary = record && restoredSummary(record.summary, dungeonMemoryText(record));
  const story = Array.from({ length: ENCOUNTER_COUNT }, (_, index) => {
    if (summary) return summary.text;
    const original = book?.display?.story?.[index] ?? book?.story?.[index];
    if (typeof original === 'string' && original.trim()) return original;
    return (
      (record?.lines || [])
        .filter((line) => line.encounter === index && line.stage !== 'combat')
        .map((line) => line.text)
        .filter(Boolean)
        .join('\n\n') || '无'
    );
  });
  return {
    schemaVersion: 4,
    id: 'recollection-' + crypto.randomUUID(),
    runId: crypto.randomUUID(),
    recollection: true,
    title: '回忆 · ' + (book?.title || record?.title || '旧日旅程'),
    chapter: library.chapter,
    story,
    party: [],
    npcs: [],
    items: [],
    tags: [],
    nextHook: { setting: '' },
  };
}

/** Older saves can recover the original reward from their archive without generating anything. */
export function recollectionEther(library, entry) {
  if (Number.isSafeInteger(entry.recollection?.ether)) return entry.recollection.ether;
  const book = library.scripts.find((item) => item.exploration?.id === entry.id);
  const record = library.history.find((item) => item.nodeId === entry.id && item.complete);
  return library.archives.items
    .filter(
      (item) =>
        (record && item.source?.runId === record.runId) ||
        (book && item.source?.scriptId === book.id),
    )
    .reduce((sum, item) => sum + (item.value || 0), 0);
}
