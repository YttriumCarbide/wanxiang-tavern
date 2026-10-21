import { officialCharacter } from './ai/library.js';

export function recordSettlement(library, id) {
  library.progression ||= { settlements: [], pandoraJoined: false, swapLesson: 'none' };
  if (typeof id !== 'string' || !id) throw Error('副本结算标识无效');
  if (!library.progression.settlements.includes(id)) library.progression.settlements.push(id);
}
export function pandoraEligible(library) {
  return (
    !library.progression?.pandoraJoined &&
    library.progression?.settlements.length >= 2 &&
    !library.characters.some((member) => member.id === 'official-pandora')
  );
}
export function joinPandora(library) {
  if (!pandoraEligible(library)) return false;
  if (library.characters.length >= 100) throw Error('角色池已满，请先整理角色再迎接潘多拉');
  library.characters.push(officialCharacter('pandora'));
  const empty = library.party.indexOf(null);
  if (empty >= 0) library.party[empty] = 'official-pandora';
  library.progression.pandoraJoined = true;
  library.progression.swapLesson = 'pending';
  library.progression.entryLesson = 'pending';
  library.prepared = null;
  return true;
}
export function performedFrontRearSwap(state, result) {
  return result.events.some((event, index) => {
    if (event.type !== 'swap') return false;
    const before = index ? result.events[index - 1].after : state;
    return (
      before.formation.indexOf(event.actor) >= 3 &&
      event.after.formation.indexOf(event.actor) >= 0 &&
      event.after.formation.indexOf(event.actor) < 3
    );
  });
}

export function prepareSwapLesson(library) {
  if (
    !['pending', 'active'].includes(library.progression?.swapLesson) ||
    library.party.slice(3).some(Boolean)
  )
    return;
  const index = library.party.indexOf('official-pandora');
  if (index >= 0)
    [library.party[index], library.party[3]] = [library.party[3], library.party[index]];
  else if (library.characters.some((member) => member.id === 'official-pandora'))
    library.party[3] = 'official-pandora';
}

export function performedRetreat(state, result) {
  return result.events.some((event, index) => {
    if (event.type !== 'swap') return false;
    const before = index ? result.events[index - 1].after : state;
    return before.formation.slice(0, 3).some((id) => id && event.after.formation.indexOf(id) >= 3);
  });
}
