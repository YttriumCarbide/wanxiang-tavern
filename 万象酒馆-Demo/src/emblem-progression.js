import { HEROES } from './data.js';
import { EMBLEM_ID, OVERLOAD_EMBLEM_ID } from './emblems.js';

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

export function overloadLessonEligible(library) {
  return (
    library.progression?.pandoraJoined &&
    library.progression.settlements.length >= 3 &&
    !library.emblems?.includes(OVERLOAD_EMBLEM_ID)
  );
}
