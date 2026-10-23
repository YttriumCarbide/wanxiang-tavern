import { HEROES } from './data.js';
import {
  EMBLEM_ID,
  OVERLOAD_EMBLEM_ID,
  DRAGON_EMBLEM_ID,
  MASK_EMBLEM_ID,
  SUPREME_EMBLEM_ID,
} from './emblems.js';

/** Grant the authored ring once at the corridor Boss boundary, never in a preview. */
export function prepareCorridorRing(library, expedition) {
  const route = expedition.exploration;
  if (
    !library.campaign ||
    route?.world ||
    route?.map !== 'ruins' ||
    route.sequence !== 1 ||
    expedition.index !== 4
  )
    return false;
  if (library.progression?.corridorRingAcquired) return false;
  const id = library.campaign.protagonistId;
  const member = library.characters.find((entry) => entry.id === id);
  const slot = HEROES[(expedition.partyIds || library.party).indexOf(id)]?.id;
  if (!member || !slot || !expedition.heroDefinitions[slot]) return false;
  library.emblems ||= [];
  if (!library.emblems.includes(EMBLEM_ID)) library.emblems.push(EMBLEM_ID);
  for (const entry of library.characters) {
    if (entry.emblemId === EMBLEM_ID) delete entry.emblemId;
  }
  for (const roster of [expedition.heroDefinitions, expedition.carried?.heroDefinitions]) {
    if (!roster) continue;
    for (const definition of Object.values(roster)) {
      if (definition.emblemId === EMBLEM_ID) delete definition.emblemId;
    }
    roster[slot].emblemId = EMBLEM_ID;
  }
  member.emblemId = EMBLEM_ID;
  expedition.corridorRing = { actor: slot, encounter: 4 };
  library.progression.corridorRingAcquired = true;
  library.progression.emblemLesson = 'corridor-intro';
  return true;
}

/** Authored Boss rewards are granted once on entering the matching final battle. */
export function prepareBossEmblem(library, expedition) {
  const route = expedition.exploration;
  if (!route || route.world || expedition.index !== 4) return false;
  const id =
    route.map === 'ruins'
      ? route.sequence === 2
        ? OVERLOAD_EMBLEM_ID
        : route.sequence === 5
          ? DRAGON_EMBLEM_ID
          : null
      : route.map === 'forest'
        ? route.sequence === 1
          ? SUPREME_EMBLEM_ID
          : route.sequence === 3
            ? MASK_EMBLEM_ID
            : null
        : null;
  if (!id || library.emblems?.includes(id)) return false;
  library.emblems ||= [];
  library.emblems.push(id);
  expedition.emblemArrival = { id, shown: false };
  if (id === OVERLOAD_EMBLEM_ID && library.progression)
    library.progression.overloadLesson = 'equip';
  return true;
}
