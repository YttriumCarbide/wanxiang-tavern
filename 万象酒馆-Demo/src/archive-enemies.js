import { speciesKeyOf } from './octopath.js';

/** Classify enemies into archive tiers and combine multi-part Overlords cleanly. */
export const ENEMY_ARCHIVE_TIERS = Object.freeze([
  { id: 'minion', label: '小怪', badge: '普通魔物' },
  { id: 'elite', label: '精英', badge: '精英强敌' },
  { id: 'boss', label: '首领', badge: '区域首领' },
  { id: 'overlord', label: '霸主', badge: '灾厄霸主' },
]);

const MOON_TREE_PART_ORDER = ['moonCrown', 'moonEye', 'moonRoot'];
const OVERLORD_CANONICAL_ORDER = [
  'apepLamb',
  'moonTree',
  'ares',
  'radiantWyvern',
  'alchemicalPuppet',
];

export function classifyEnemyArchiveTier(entry, isOfficial = false) {
  if (entry?.overlord) return 'overlord';
  if (entry?.boss) return 'boss';
  if (entry?.elite || (!isOfficial && Number(entry?.hp) >= 56)) return 'elite';
  return 'minion';
}

function isMoonTreePart(entry) {
  return entry?.tactic?.mode === 'moon-tree' || MOON_TREE_PART_ORDER.includes(entry?.id);
}

function worldSourcesFor(ids, worlds) {
  const matched = (worlds || [])
    .filter((world) => ids.some((id) => world.enemyIds?.includes(id)))
    .map((world) => world.name)
    .filter(Boolean);
  return matched.length ? matched.join('、') : '官方敌人';
}

function speciesIdsForEntry(entry) {
  if (entry.id === 'ares') return ['ares', 'aresCannonLeft', 'aresCannonRight'];
  return [entry.id];
}

export function normalizeSeenMonsters(seenMonsters = [], discoveredWeaknesses = {}) {
  const seen = [];
  const pushKey = (value) => {
    const key = speciesKeyOf(value);
    if (key && !seen.includes(key)) seen.push(key);
  };
  for (const item of Array.isArray(seenMonsters) ? seenMonsters : []) {
    pushKey(item);
  }
  if (discoveredWeaknesses && typeof discoveredWeaknesses === 'object') {
    for (const key of Object.keys(discoveredWeaknesses)) {
      pushKey(key);
    }
  }
  return seen;
}

/** Record encountered species keys on the player's save library without touching unlock flags. */
export function recordSeenMonsters(library, unitsOrIds = []) {
  if (!library || !Array.isArray(unitsOrIds) || !unitsOrIds.length) return false;
  library.seenMonsters = normalizeSeenMonsters(library.seenMonsters, library.discoveredWeaknesses);
  let changed = false;
  for (const unit of unitsOrIds) {
    const key = speciesKeyOf(unit);
    if (key && !library.seenMonsters.includes(key)) {
      library.seenMonsters.push(key);
      changed = true;
    }
  }
  return changed;
}

/** Filter enemy archive tiers to only seen monsters unless developer full-codex is active. */
export function filterEnemyArchiveBuckets(buckets, { seenMonsters = [], unlockAll = false } = {}) {
  const seenSet = new Set(normalizeSeenMonsters(seenMonsters));
  const visibleBuckets = {};
  const tierStats = {};
  let totalCount = 0;
  let unlockedCount = 0;

  for (const { id } of ENEMY_ARCHIVE_TIERS) {
    const entries = Array.isArray(buckets?.[id]) ? buckets[id] : [];
    const seenEntries = entries.filter((item) => {
      const ids =
        Array.isArray(item.speciesIds) && item.speciesIds.length ? item.speciesIds : [item.id];
      return ids.some((speciesId) => seenSet.has(speciesId));
    });
    const tierTotal = entries.length;
    const tierUnlocked = unlockAll ? tierTotal : seenEntries.length;
    totalCount += tierTotal;
    unlockedCount += tierUnlocked;
    tierStats[id] = { unlocked: tierUnlocked, total: tierTotal };
    visibleBuckets[id] = unlockAll ? [...entries] : seenEntries;
  }

  return { visibleBuckets, totalCount, unlockedCount, tierStats };
}

export function buildEnemyArchiveEntries(officialDefinitions, worlds = []) {
  const officialIds = new Set(Object.keys(officialDefinitions || {}));
  const merged = Object.values({
    ...officialDefinitions,
    ...Object.assign({}, ...(worlds || []).map((world) => world.enemyDefinitions)),
  }).filter((entry) => entry && entry.speed);

  const buckets = { minion: [], elite: [], boss: [], overlord: [] };
  const moonParts = [];

  for (const entry of merged) {
    const tier = classifyEnemyArchiveTier(entry, officialIds.has(entry.id));
    if (tier === 'overlord') {
      if (isMoonTreePart(entry)) {
        moonParts.push(entry);
      } else {
        buckets.overlord.push({
          id: entry.id,
          speciesIds: speciesIdsForEntry(entry),
          name: entry.name,
          subtitle: entry.title || '灾厄霸主',
          tier: 'overlord',
          overlord: true,
          isComposite: false,
          color: entry.color || '#d8b26e',
          description: entry.description || '',
          entry,
          parts: [entry],
          models: entry.model ? [entry.model] : [],
          sources: worldSourcesFor([entry.id], worlds),
        });
      }
      continue;
    }
    buckets[tier].push({
      id: entry.id,
      speciesIds: speciesIdsForEntry(entry),
      name: entry.name,
      subtitle: entry.title || ENEMY_ARCHIVE_TIERS.find((t) => t.id === tier)?.badge || '',
      tier,
      overlord: false,
      isComposite: false,
      color: entry.color || '#d8b26e',
      description: entry.description || '',
      entry,
      parts: [entry],
      models: entry.model ? [entry.model] : [],
      sources: worldSourcesFor([entry.id], worlds),
    });
  }

  if (moonParts.length) {
    const orderedParts = [...moonParts].sort(
      (a, b) => MOON_TREE_PART_ORDER.indexOf(a.id) - MOON_TREE_PART_ORDER.indexOf(b.id),
    );
    buckets.overlord.push({
      id: 'moonTree',
      speciesIds: ['moonTree', ...orderedParts.map((part) => part.id)],
      name: '母树',
      subtitle: orderedParts.map((part) => part.name).join(' · '),
      tier: 'overlord',
      overlord: true,
      isComposite: true,
      color: '#8cc2b8',
      description:
        '盘踞幽林深处的活体月蚀巨木，由左翼散布瘟疫与生机的「月蚀树冠」、中央嵌着金属虹膜的「月之魔眼」与右翼缠绕分流机械的「月痕树根」三位一体构成。',
      parts: orderedParts,
      models: orderedParts.map((part) => part.model).filter(Boolean),
      sources: worldSourcesFor(
        orderedParts.map((part) => part.id),
        worlds,
      ),
    });
  }

  buckets.overlord.sort((a, b) => {
    const ai = OVERLORD_CANONICAL_ORDER.indexOf(a.id);
    const bi = OVERLORD_CANONICAL_ORDER.indexOf(b.id);
    if (ai !== -1 || bi !== -1) {
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    }
    return a.name.localeCompare(b.name, 'zh-CN');
  });

  return buckets;
}
