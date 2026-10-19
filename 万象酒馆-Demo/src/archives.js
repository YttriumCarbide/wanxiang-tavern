import { memoryText } from './memory.js';

const normalizedName = (name) =>
  String(name || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();

export function restoreArchives(value) {
  return {
    npcs: Array.isArray(value?.npcs) ? structuredClone(value.npcs) : [],
    items: Array.isArray(value?.items) ? structuredClone(value.items) : [],
  };
}

function itemMap(library, item) {
  return (
    item.map ||
    item.source?.map ||
    library.history?.find((record) => record.runId === item.source?.runId)?.map ||
    library.scripts?.find((book) => book.id === item.source?.scriptId)?.exploration?.map ||
    'ruins'
  );
}

/** Backfill old loot from its saved journey, instead of assigning every old item to ruins. */
export function hydrateArchiveMaps(library) {
  for (const item of library.archives?.items || []) item.map = itemMap(library, item);
}

/** Archive only prose milestones the player has actually reached; rewrites cannot mint duplicates. */
export function archiveMilestone(library, book, record, encounter) {
  library.archives ||= restoreArchives();
  record.archiveClaims ||= [];
  const partyNames = new Set((book.party || []).map((member) => normalizedName(member.name)));
  const map = book.exploration?.map || record.map || 'ruins';
  const source = { runId: record.runId, scriptId: book.id, title: book.title, map, encounter };
  for (const [index, npc] of (book.npcs || []).entries()) {
    if (
      (npc.encounter ?? 0) !== encounter ||
      partyNames.has(normalizedName(npc.name)) ||
      library.refinedNpcs?.some((name) => normalizedName(name) === normalizedName(npc.name))
    )
      continue;
    const claim = `npc:${encounter}:${normalizedName(npc.name)}`;
    if (record.archiveClaims.includes(claim)) continue;
    let entry = library.archives.npcs.find(
      (item) => normalizedName(item.name) === normalizedName(npc.name),
    );
    const content = npc.setting || `外貌：${npc.appearance}\n经历：${npc.history}`;
    if (!entry) {
      entry = {
        id: `npc-${record.runId}-${index}`,
        name: npc.name,
        content,
        sources: [],
        keywords: [npc.name],
      };
      library.archives.npcs.push(entry);
    } else if (!entry.content.includes(content)) {
      entry.content += `\n\n【${book.title}】\n${content}`;
    }
    if (!entry.sources.some((item) => item.runId === record.runId && item.encounter === encounter))
      entry.sources.push(source);
    record.archiveClaims.push(claim);
  }
  for (const [index, item] of (book.items || []).entries()) {
    if (item.encounter !== encounter) continue;
    const claim = `item:${encounter}:${normalizedName(item.name)}`;
    if (record.archiveClaims.includes(claim)) continue;
    const old = library.archives.items.findLast(
      (archived) =>
        !archived.superseded &&
        !archived.conflictWith &&
        itemMap(library, archived) === map &&
        normalizedName(archived.name) === normalizedName(item.name),
    );
    const resolved = item.reference ? resolveItemReferences([item], old ? [old] : [])[0] : item;
    const conflict =
      old && (old.description !== resolved.description || old.value !== resolved.value);
    library.archives.items.push({
      ...structuredClone(resolved),
      map,
      ...(conflict ? { conflictWith: old.id } : {}),
      id: `item-${record.runId}-${index}`,
      source,
      converted: false,
    });
    record.archiveClaims.push(claim);
  }
}

export function dungeonLoot(library, runId) {
  return (library.archives?.items || []).filter((item) => item.source?.runId === runId);
}

export function settleEther(library, runId) {
  library.rewardClaims ||= [];
  const claim = `ether:${runId}`;
  if (library.rewardClaims.includes(claim)) return 0;
  const items = dungeonLoot(library, runId);
  if (items.some((item) => item.conflictWith)) throw Error('请先处理同名物品冲突');
  const value = items.reduce((sum, item) => sum + item.value, 0);
  library.inventory.ether = Math.min(999999999, (library.inventory.ether || 0) + value);
  items.forEach((item) => {
    item.converted = true;
  });
  library.rewardClaims.push(claim);
  return value;
}

/** Keyword-triggered archives behave as local worldbook entries, never as future facts. */
export function relevantArchives(library, text, map = null) {
  const query = String(text || '').toLowerCase();
  const npcs = (library.archives?.npcs || [])
    .filter((entry) =>
      [entry.name, ...(entry.keywords || [])].some(
        (key) => key && query.includes(String(key).toLowerCase()),
      ),
    )
    .map((entry) => ({
      name: entry.name,
      content: entry.content,
      sources: entry.sources.map((source) => source.title),
    }));
  const stories = (library.history || [])
    .filter((record) =>
      (record.tags || []).some((key) => key && query.includes(String(key).toLowerCase())),
    )
    .map((record) => ({
      title: record.title,
      content: (record.lines || [])
        .filter((line) => line.stage !== 'combat')
        .map((line) => memoryText(line.text, line.summary))
        .join('\n\n'),
    }));
  const known = new Map();
  for (const entry of library.archives?.items || []) {
    const mapId = itemMap(library, entry);
    if (
      entry.conflictWith ||
      entry.superseded ||
      !(map ? map === mapId : query.includes(normalizedName(entry.name)))
    )
      continue;
    known.set(mapId + ':' + normalizedName(entry.name), {
      name: entry.name,
      description: entry.description,
      value: entry.value,
      map: mapId,
    });
  }
  return { npcs, stories, items: [...known.values()] };
}

export function resolveItemReferences(items, known) {
  return items.map((item) => {
    if (!item.reference) return item;
    const old = known.find((entry) => normalizedName(entry.name) === normalizedName(item.name));
    if (!old) throw Error('归档物品不存在：' + item.name + '，新物品必须提供描述与价值');
    return {
      name: old.name,
      description: old.description,
      value: old.value,
      encounter: item.encounter,
    };
  });
}
export function itemConflicts(library, runId) {
  return (library.archives?.items || []).filter(
    (item) => item.source?.runId === runId && item.conflictWith,
  );
}
export function resolveItemConflict(library, id, choice, rename = '') {
  const items = library.archives.items;
  const current = items.find((item) => item.id === id);
  const old = items.find((item) => item.id === current?.conflictWith);
  if (!current || !old) throw Error('物品冲突已经变化');
  if (!['old', 'new', 'rename-new', 'rename-old'].includes(choice)) throw Error('请选择保留方式');
  const map = current.map || current.source.map;
  if (choice.startsWith('rename')) {
    const name = String(rename).trim().slice(0, 30);
    if (
      !name ||
      items.some(
        (item) =>
          item !== current &&
          item !== old &&
          (item.map || item.source?.map) === map &&
          normalizedName(item.name) === normalizedName(name),
      ) ||
      normalizedName(name) === normalizedName(current.name)
    )
      throw Error('请填写该地图内尚未使用的新名字');
    (choice === 'rename-new' ? current : old).name = name;
  } else if (choice === 'old') {
    current.description = old.description;
    current.value = old.value;
  } else
    for (const item of items)
      if (
        item !== current &&
        (item.map || item.source?.map) === map &&
        normalizedName(item.name) === normalizedName(current.name)
      )
        item.superseded = true;
  delete current.conflictWith;
  return current;
}
