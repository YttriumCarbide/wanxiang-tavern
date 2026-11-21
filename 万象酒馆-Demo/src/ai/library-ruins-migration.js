import { newExploration } from '../exploration.js';
const RUINS_SCRIPT_IDS = new Set([
  'ruins-tutorial',
  'ruins-corridor',
  'ruins-hall',
  'ruins-sinkhole',
  'ruins-tomb',
  'ruins-curse',
]);
const RUINS_BOSS_IDS = new Set([
  'bossGate',
  'ruinsGate',
  'chasmBeast',
  'brassColossus',
  'cinderPriest',
  'apepLamb',
]);

function isRuinsEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  const map = entry.exploration?.map || entry.map;
  if (map === 'ruins') return true;
  if (
    RUINS_SCRIPT_IDS.has(entry.exploration?.id) ||
    RUINS_SCRIPT_IDS.has(entry.officialDungeonId)
  ) {
    return true;
  }
  return RUINS_BOSS_IDS.has(entry.boss);
}

export function isRuinsAdventureSnapshot(snapshot) {
  const trip = snapshot?.journey?.expedition || snapshot?.adventure?.expedition;
  const map = trip?.exploration?.map || trip?.map || snapshot?.state?.map;
  return map ? map === 'ruins' : isRuinsEntry(snapshot?.activeScript);
}

/** One-time purge of legacy Ruins clears, scripts, and overland unlock state for existing saves. */
export function purgeLegacyRuinsProgress(library) {
  if (!library || typeof library !== 'object' || library.migrations?.ruinsResetV2) return false;
  const seed = library.exploration?.ruins?.seed ?? Math.floor(Math.random() * 4294967296);
  if (library.exploration && typeof library.exploration === 'object') {
    library.exploration.ruins = newExploration(seed).ruins;
  }
  if (Array.isArray(library.unlockedDungeons)) {
    library.unlockedDungeons = library.unlockedDungeons.filter((id) => id !== 'ruins');
  }
  if (Array.isArray(library.atlasDiscoveries)) {
    library.atlasDiscoveries = library.atlasDiscoveries.filter((entry) => entry?.id !== 'ruins');
  }
  if (library.overlandExploration) {
    if (Array.isArray(library.overlandExploration.routes)) {
      library.overlandExploration.routes = library.overlandExploration.routes.filter(
        (key) => !String(key).split('->').includes('ruins'),
      );
    }
    if (Array.isArray(library.overlandExploration.legs)) {
      library.overlandExploration.legs = library.overlandExploration.legs.filter(
        (key) => !String(key).split(':').includes('ruins'),
      );
    }
  }
  const removedIds = new Set();
  if (Array.isArray(library.scripts)) {
    library.scripts = library.scripts.filter((book) => {
      if (isRuinsEntry(book)) {
        if (book.id) removedIds.add(book.id);
        if (book.runId) removedIds.add(book.runId);
        return false;
      }
      return true;
    });
  }
  if (library.prepared && removedIds.has(library.prepared)) {
    library.prepared = null;
  }
  if (Array.isArray(library.history)) {
    library.history = library.history.filter(
      (item) => !isRuinsEntry(item) && !removedIds.has(item?.id) && !removedIds.has(item?.runId),
    );
  }
  if (Array.isArray(library.rewardClaims)) {
    library.rewardClaims = library.rewardClaims.filter(
      (key) => !String(key).startsWith('ruins:') && !removedIds.has(key),
    );
  }
  if (Array.isArray(library.experienceClaims)) {
    library.experienceClaims = library.experienceClaims.filter(
      (key) => !String(key).startsWith('ruins:') && !removedIds.has(key),
    );
  }
  if (Array.isArray(library.tavernQuests)) {
    library.tavernQuests = library.tavernQuests.filter(
      (q) => q?.map !== 'ruins' && !String(q?.id || '').startsWith('ruins'),
    );
  }
  library.migrations = { ...(library.migrations || {}), ruinsResetV2: true };
  return true;
}
