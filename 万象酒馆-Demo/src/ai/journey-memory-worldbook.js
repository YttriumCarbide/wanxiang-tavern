import { memoryHash } from '../memory.js';
import { newWorldEntry } from './worldbook.js';
import { scanWorldbooks } from './worldbook-scan.js';

export function journeyMemoryBook(input) {
  const entries = {};
  const linked = new Set(input.journeyContinuationIds || []);
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
    const constant = record.recent === true || linked.has(record.id);
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
      ],
      content: `【已发生的旅途记录 · ${record.title.slice(0, 100)}】\n${record.text}`,
      constant,
      ignoreBudget: record.recent === true,
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
    const uid = Number(memoryHash(String(npc.id || name)).split(':')[1]);
    entries[uid] = {
      ...newWorldEntry(uid),
      comment: `NPC角色条目：${name}`,
      key: [name],
      content: npc.content,
      position: 1,
      preventRecursion: true,
      excludeRecursion: true,
      apiTargets: ['script', 'chat'],
    };
  }
  return { id: 'archived-npcs', name: 'NPC角色条目', entries };
}

export function scanSpecialJourneyMemories(input, countTokens) {
  return scanWorldbooks({
    books: [journeyMemoryBook(input), archivedNpcBook(input.archivedNpcs)],
    settings: {},
    countTokens,
    context: {
      kind: 'script',
      messages: [
        {
          role: 'user',
          content: [input.brief, ...(input.party || []).map((member) => member.name)]
            .filter(Boolean)
            .join('\n'),
        },
      ],
    },
  }).entries.map((entry) => ({ role: 'system', content: entry.content }));
}
