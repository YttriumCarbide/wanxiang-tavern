import { HEROES } from './data.js';
import { officialCharacter } from './ai/library.js';
import { BASE_WORLDS } from './worlds.js';
import { REGIONS } from './content/regions.js';
import { OFFICIAL_VISITORS } from './content/official-visitors.js';

/** Canon NPCs join only after their six-site story; custom and endless encounters stay free. */
export function npcSummonStatus(library, npc) {
  const sources = npc.sources?.length ? npc.sources : [npc.source || {}];
  const locked = new Set();
  for (const source of sources) {
    const script = library.scripts?.find((entry) => entry.id === source.scriptId);
    const node = script?.exploration;
    const record = library.history?.find((entry) => entry.runId === source.runId);
    const map = source.worldId || node?.world?.id || source.map || node?.map || record?.map;
    const sequence = source.sequence ?? node?.sequence;
    if (source.endless || node?.world || sequence >= 6 || !BASE_WORLDS.includes(map))
      return { allowed: true, reason: '' };
    const route = library.exploration?.[map];
    if (route?.cleared?.some((entry) => entry.sequence === 5) || route?.completed >= 6)
      return { allowed: true, reason: '' };
    locked.add(REGIONS[map].name);
  }
  return {
    allowed: false,
    reason: `通关${[...locked].join('或')}第六关后可召唤`,
  };
}

export function knownNpcSummonPool(library) {
  return (library.archives?.npcs || []).filter(
    (npc) =>
      npc.name !== '潘多拉' &&
      !library.characters.some((member) => member.setting.name === npc.name) &&
      npcSummonStatus(library, npc).allowed,
  );
}

/** Worldbook prose is editable; official identities and combat definitions stay code-owned. */
export function officialSummonPool(library, book) {
  const owned = new Set(library.characters.map((entry) => entry.id));
  return [...HEROES.map((hero) => hero.id), 'edith', ...Object.keys(OFFICIAL_VISITORS)].flatMap(
    (id) => {
      const entry = officialCharacter(id);
      if (owned.has(entry.id)) return [];
      const lore = Object.values(book?.entries || {}).find(
        (item) => item.extensions?.wanxiang?.characterId === entry.id,
      );
      if (!lore || typeof lore.content !== 'string' || !lore.content.trim()) return [];
      entry.setting.worldbook = lore.content.trim();
      entry.setting.edited = true;
      return [entry];
    },
  );
}

export function summonSource(mode, roll) {
  if (!['official', 'chaos', 'infinite', 'npc'].includes(mode)) throw Error('召唤术无效');
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw Error('召唤随机值无效');
  return mode === 'chaos' ? (roll < 1 / 3 ? 'official' : roll < 2 / 3 ? 'npc' : 'infinite') : mode;
}
