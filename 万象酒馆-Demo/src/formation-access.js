export function rearUnlocked(library) {
  return (
    !library.campaign ||
    library.progression?.pandoraJoined === true ||
    library.characters.some((member) => member.id === 'official-pandora')
  );
}
export function lockUnopenedRear(library) {
  if (rearUnlocked(library)) return;
  const rear = library.party.slice(3).filter(Boolean);
  library.party = [...library.party.slice(0, 3), null, null, null];
  for (const id of rear) {
    const empty = library.party.slice(0, 3).indexOf(null);
    if (empty >= 0 && !library.party.includes(id)) library.party[empty] = id;
  }
}
