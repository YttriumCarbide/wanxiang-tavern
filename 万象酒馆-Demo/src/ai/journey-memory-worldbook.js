import { journeyMemories, memoryHash } from '../memory.js';
import { newWorldEntry, normalizeWorldbook } from './worldbook.js';
import { scanWorldbooks } from './worldbook-scan.js';
import { buildTriggerIds } from './worldbook-triggers.js';

export function journeyMemoryBook(input) {
  const entries = {};
  for (const record of Array.isArray(input.journeyMemories) ? input.journeyMemories : []) {
    if (
      typeof record?.id !== 'string' ||
      record.id.length > 200 ||
      typeof record.title !== 'string' ||
      typeof record.text !== 'string' ||
      !record.text.trim()
    )
      continue;
    const uid = Number(memoryHash(record.id).split(':')[1]);
    const constant = record.recent === true && !record.summarized;
    entries[uid] = {
      ...newWorldEntry(uid),
      comment: `旅途记录：${record.title.slice(0, 100)}`,
      key: [
        record.id,
        ...(Array.isArray(record.keywords)
          ? record.keywords
              .filter(
                (key) =>
                  typeof key === 'string' && key.trim() && key.length <= 60 && !key.startsWith('/'),
              )
              .slice(0, 5)
          : []),
        ...(record.gameTime ? ['时间', record.gameTime] : []),
      ],
      content: `【已发生的旅途记录 · ${record.title.slice(0, 100)}${record.gameTime ? ' · ' + record.gameTime : ''}】\n${record.text}`,
      constant,
      ignoreBudget: constant,
      excludeRecursion: true,
      preventRecursion: true,
      matchScenario: true,
      apiTargets: ['character', 'script', 'chat', 'creation', 'map'],
      extensions: { wanxiang: { journeyMemoryId: record.id } },
    };
  }
  return { id: 'journey-memories', name: '旅途记录', entries };
}

export function archivedNpcBook(npcs) {
  const entries = {};
  for (const npc of Array.isArray(npcs) ? npcs : []) {
    if (typeof npc?.name !== 'string' || !npc.name.trim() || typeof npc.content !== 'string')
      continue;
    const name = npc.name.trim().slice(0, 60);
    const id = String(npc.id || '').trim();
    const uid = Number(memoryHash(id || name).split(':')[1]);
    entries[uid] = {
      ...newWorldEntry(uid),
      comment: `NPC角色条目：${name}`,
      key: [...new Set([id, name].filter(Boolean))],
      content: npc.content,
      position: 1,
      preventRecursion: true,
      excludeRecursion: true,
      apiTargets: ['script', 'chat'],
      extensions: { wanxiang: { archivedNpcId: String(npc.id || name) } },
    };
  }
  return { id: 'archived-npcs', name: 'NPC角色条目', entries };
}

function isSummaryNpcEntry(entry) {
  const marker = entry?.extensions?.wanxiang;
  return Boolean(
    marker?.archivedNpcId ||
    (typeof marker?.source === 'string' && marker.source.startsWith('npc:')) ||
    /^NPC角色条目[：:]/u.test(entry?.comment || ''),
  );
}

/** Sync archived non-party NPC entries into the main tavern worldbook only, avoiding duplicates with summary worldbook or existing character/official-NPC entries. */
export function syncArchivedNpcEntries(book, npcs) {
  if (!book?.entries) return false;
  let dirty = false;
  const occupiedNames = new Set();
  const occupiedIds = new Set();
  for (const entry of Object.values(book.entries)) {
    const marker = entry?.extensions?.wanxiang;
    if (marker?.archivedNpcId) continue;
    if (marker?.characterId) occupiedIds.add(String(marker.characterId));
    if (marker?.officialNpcId) occupiedIds.add(String(marker.officialNpcId));
    const match = /^(?:角色条目|ai角色条目|主角设定|人物详情|官设NPC)[：:]\s*(.+)$/u.exec(
      entry?.comment || '',
    );
    if (match?.[1]) occupiedNames.add(match[1].trim());
  }
  const wanted = new Map();
  for (const npc of Array.isArray(npcs) ? npcs : []) {
    if (typeof npc?.name !== 'string' || !npc.name.trim() || typeof npc.content !== 'string')
      continue;
    const name = npc.name.trim().slice(0, 60);
    const archivedId = String(npc.id || name).trim();
    if (occupiedIds.has(archivedId) || occupiedNames.has(name)) continue;
    wanted.set(archivedId, { npc, name, archivedId });
  }
  let nextUid = Math.max(-1, ...Object.keys(book.entries).map(Number)) + 1;
  for (const [uid, entry] of Object.entries(book.entries)) {
    const marker = entry?.extensions?.wanxiang;
    if (!marker?.archivedNpcId) continue;
    if (!wanted.has(marker.archivedNpcId)) {
      delete book.entries[uid];
      dirty = true;
    }
  }
  for (const { npc, name, archivedId } of wanted.values()) {
    const key = [...new Set([String(npc.id || '').trim(), name].filter(Boolean))];
    const existing = Object.values(book.entries).find(
      (entry) => entry?.extensions?.wanxiang?.archivedNpcId === archivedId,
    );
    if (existing) {
      const mergedKeys = [...new Set([...key, ...(existing.key || [])].filter(Boolean))];
      if (JSON.stringify(mergedKeys) !== JSON.stringify(existing.key || [])) {
        existing.key = mergedKeys;
        dirty = true;
      }
      if (!existing.extensions?.wanxiang?.userEdited && existing.content !== npc.content) {
        existing.content = npc.content;
        dirty = true;
      }
      continue;
    }
    const uid = nextUid++;
    book.entries[uid] = {
      ...newWorldEntry(uid),
      comment: `NPC角色条目：${name}`,
      key,
      content: npc.content,
      position: 1,
      preventRecursion: true,
      excludeRecursion: true,
      apiTargets: ['script', 'chat'],
      extensions: { wanxiang: { archivedNpcId: archivedId, apiTargets: ['script', 'chat'] } },
    };
    dirty = true;
  }
  return dirty;
}

export const SUMMARY_WORLDBOOK = 'tavern-summary';

export function syncSummaryWorldbook(library, records = journeyMemories(library)) {
  if (!library) return null;
  const book = (library.summaryWorldbook ||= {
    id: SUMMARY_WORLDBOOK,
    name: '总结世界书',
    entries: {},
    extensions: { sources: {} },
  });
  const sources = ((book.extensions ||= {}).sources ||= {});
  for (const [uid, entry] of Object.entries(book.entries)) {
    if (isSummaryNpcEntry(entry)) delete book.entries[uid];
  }
  for (const source of Object.keys(sources)) {
    if (source.startsWith('npc:')) delete sources[source];
  }
  const recent = new Set(
    records.filter((record) => record.recent && !record.summarized).map((record) => record.id),
  );
  for (const [source, previous] of Object.entries(sources)) {
    if (!previous.recent || recent.has(source.slice('journey:'.length))) continue;
    const entry = book.entries[previous.uid];
    if (entry?.constant === true) entry.constant = false;
    if (entry?.ignoreBudget === true) entry.ignoreBudget = false;
    previous.recent = false;
  }
  const generated = Object.values(journeyMemoryBook({ journeyMemories: records }).entries);
  for (const entry of generated) {
    const marker = entry.extensions.wanxiang;
    const source = 'journey:' + marker.journeyMemoryId;
    const previous = Object.hasOwn(sources, source) ? sources[source] : null;
    if (previous) {
      const current = book.entries[previous.uid];
      if (current && memoryHash(current.content) === previous.hash) current.content = entry.content;
      if (current && JSON.stringify(current.key) === previous.key) current.key = entry.key;
      if (current && previous.recent !== entry.constant) {
        current.constant = entry.constant;
        current.ignoreBudget = entry.ignoreBudget;
      }
      previous.recent = entry.constant;
      previous.hash = memoryHash(entry.content);
      previous.key = JSON.stringify(entry.key);
      continue;
    }
    let uid = entry.uid % 90000000;
    while (Object.hasOwn(book.entries, uid)) uid++;
    book.entries[uid] = { ...entry, uid, displayIndex: Object.keys(book.entries).length };
    sources[source] = {
      uid,
      hash: memoryHash(entry.content),
      key: JSON.stringify(entry.key),
      recent: entry.ignoreBudget,
    };
  }
  return book;
}

export function requestMemoryBooks(input) {
  if (!input.summaryWorldbook) {
    const npcBook = archivedNpcBook(input.archivedNpcs);
    return Object.keys(npcBook.entries).length
      ? [journeyMemoryBook(input), npcBook]
      : [journeyMemoryBook(input)];
  }
  const { book } = normalizeWorldbook(input.summaryWorldbook, '总结世界书');
  const inContinuity = new Set(
    (Array.isArray(input.journeyContinuity) ? input.journeyContinuity : []).map(
      (record) => record.id,
    ),
  );
  for (const [uid, entry] of Object.entries(book.entries)) {
    if (isSummaryNpcEntry(entry) || inContinuity.has(entry.extensions?.wanxiang?.journeyMemoryId))
      delete book.entries[uid];
  }
  return [{ ...book, id: SUMMARY_WORLDBOOK }];
}

export function scanScenarioWorldbooks(input, countTokens, worldInfo, kind = 'script') {
  return scanWorldbooks({
    ...(worldInfo || { books: requestMemoryBooks(input), settings: {} }),
    countTokens,
    context: {
      kind,
      triggerIds: buildTriggerIds(kind, input),
      names: (input.party || []).map((member) => member.name),
      characterIds: (input.party || []).map((member) => member.id),
      scenario: input.brief || '',
      messages: input.brief ? [{ role: 'user', content: input.brief }] : [],
    },
  }).entries.map((entry) => ({ role: 'system', content: entry.content }));
}
