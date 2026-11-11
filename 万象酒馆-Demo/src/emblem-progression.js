import { HEROES } from './data.js';
import {
  EMBLEM_ID,
  OVERLOAD_EMBLEM_ID,
  DRAGON_EMBLEM_ID,
  MASK_EMBLEM_ID,
  SUPREME_EMBLEM_ID,
  EMBLEMS,
  applyEmblemStats,
} from './emblems.js';

/** This schedule is shared by actual grants and narrative requests. */
export function storyRingReward(route, owned = []) {
  if (!route || route.world) return null;
  const id =
    route.map === 'ruins'
      ? { 1: EMBLEM_ID, 2: OVERLOAD_EMBLEM_ID, 5: DRAGON_EMBLEM_ID }[route.sequence]
      : route.map === 'forest'
        ? { 1: SUPREME_EMBLEM_ID, 3: MASK_EMBLEM_ID }[route.sequence]
        : null;
  return id && !owned.includes(id) ? { id, name: EMBLEMS[id].emblem.name, encounter: 4 } : null;
}

/** Choose once at the actual reward boundary; never replace another equipped ring. */
function equipStoryRing(library, expedition, emblemId, random) {
  const party = expedition.partyIds || library.party || [];
  const formation =
    expedition.carried?.formation || HEROES.map((hero, index) => (party[index] ? hero.id : null));
  const candidates = (library.characters || []).filter((member) => !member.emblemId);
  const fronts = candidates.filter((member) => {
    const actor = HEROES[party.indexOf(member.id)]?.id;
    return actor && formation.slice(0, 3).includes(actor);
  });
  const pool = fronts.length ? fronts : candidates;
  if (!pool.length) return null;
  const member = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
  const actor = HEROES[party.indexOf(member.id)]?.id || null;
  member.emblemId = emblemId;
  const before =
    actor && (expedition.carried?.heroDefinitions?.[actor] || expedition.heroDefinitions?.[actor]);
  const enhanced = before ? applyEmblemStats(before, emblemId) : null;
  for (const roster of [expedition.heroDefinitions, expedition.carried?.heroDefinitions]) {
    if (actor && roster?.[actor])
      roster[actor] = { ...applyEmblemStats(roster[actor], emblemId), emblemId };
  }
  if (emblemId === OVERLOAD_EMBLEM_ID && actor && expedition.carried?.units?.[actor]) {
    const unit = expedition.carried.units[actor];
    const mp = enhanced ? enhanced.mp - before.mp : Math.round(unit.maxMp * 1.5) - unit.maxMp;
    const hp = enhanced ? enhanced.hp - before.hp : Math.round((unit.maxMp + mp) * 0.25);
    unit.maxMp += mp;
    unit.mp += mp;
    unit.maxHp += hp;
    if (unit.hp > 0) unit.hp += hp;
  }
  return { memberId: member.id, actor, name: member.setting.name };
}

/** Grant the authored ring once at the corridor Boss boundary, never in a preview. */
export function prepareCorridorRing(library, expedition, random = Math.random) {
  if (storyRingReward(expedition.exploration)?.id !== EMBLEM_ID || expedition.index !== 4)
    return false;
  if (library.progression?.corridorRingAcquired) return false;
  library.emblems ||= [];
  if (library.emblems.includes(EMBLEM_ID)) return false;
  library.emblems.push(EMBLEM_ID);
  const recipient = equipStoryRing(library, expedition, EMBLEM_ID, random);
  expedition.corridorRing = { ...recipient, actor: recipient?.actor || null, encounter: 4 };
  library.progression.corridorRingAcquired = true;
  library.progression.emblemLesson = 'corridor-intro';
  return true;
}

/** Authored Boss rewards are granted once on entering the matching final battle. */
export function prepareBossEmblem(library, expedition, random = Math.random) {
  if (expedition.index !== 4) return false;
  const id = storyRingReward(expedition.exploration)?.id;
  if (!id || id === EMBLEM_ID || library.emblems?.includes(id)) return false;
  library.emblems ||= [];
  library.emblems.push(id);
  const recipient = equipStoryRing(library, expedition, id, random);
  expedition.emblemArrival = { id, shown: false, recipient };
  if (id === OVERLOAD_EMBLEM_ID && library.progression)
    library.progression.overloadLesson = recipient ? 'done' : 'equip';
  return true;
}
