export function relationship(library, id) {
  return library.relationships?.[id] || { affection: 0, gains: 0, agreed: false };
}

export function resetRelationshipGains(library) {
  for (const value of Object.values(library.relationships || {})) value.gains = 0;
}

/** Only validated tavern replies affect relationships; no combat attributes are changed. */
export function applyRelationshipActions(library, actions = {}) {
  library.relationships ||= {};
  const companions = new Set(
    library.characters
      .filter((entry) => entry.id !== library.campaign?.protagonistId)
      .map((entry) => entry.id),
  );
  const changed = [];
  const seen = new Set();
  for (const item of actions.affection || []) {
    if (!companions.has(item.id) || seen.has(item.id)) continue;
    seen.add(item.id);
    const state = (library.relationships[item.id] ||= { ...relationship(library, item.id) });
    if (state.gains >= 3 || !Number.isInteger(item.delta) || item.delta < 1 || item.delta > 5)
      continue;
    const gain = Math.min(item.delta, 100 - state.affection);
    if (gain <= 0) continue;
    state.affection += gain;
    state.gains++;
    changed.push({ id: item.id, delta: gain });
  }
  for (const id of actions.agreeToAdventure || []) {
    if (companions.has(id))
      (library.relationships[id] ||= { ...relationship(library, id) }).agreed = true;
  }
  return changed;
}
