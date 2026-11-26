export function relationship(library, id) {
  return library.relationships?.[id] || { affection: 0, gains: 0, agreed: false };
}

export function affectionThreshold(level = 0) {
  return Math.min(100, 20 + Math.max(0, Math.floor(Number(level) || 0)) * 10);
}

export function affectionRank(points = 0) {
  let remaining = Math.max(0, Number.isSafeInteger(points) ? points : 0);
  for (let level = 0; level < 8; level += 1) {
    const required = affectionThreshold(level);
    if (remaining < required) return { level, progress: remaining, required };
    remaining -= required;
  }
  return {
    level: 8 + Math.floor(remaining / 100),
    progress: remaining % 100,
    required: 100,
  };
}

export function affectionLabel(points) {
  const { level, progress, required } = affectionRank(points);
  return `好感 Lv.${level} · ${progress}/${required}`;
}

export function resetRelationshipGains(library) {
  for (const value of Object.values(library.relationships || {})) value.gains = 0;
}

/** Only validated tavern replies affect relationships; no combat attributes are changed. */
export function applyRelationshipActions(library, actions = {}, residents = []) {
  library.relationships ||= {};
  const companions = new Set(
    library.characters
      .filter((entry) => entry.id !== library.campaign?.protagonistId)
      .map((entry) => entry.id),
  );
  const changed = [];
  const seen = new Set();
  for (const item of actions.affection || []) {
    if ((!companions.has(item.id) && !residents.includes(item.id)) || seen.has(item.id)) continue;
    seen.add(item.id);
    const state = (library.relationships[item.id] ||= { ...relationship(library, item.id) });
    if (!Number.isInteger(item.delta) || item.delta === 0 || item.delta < -5 || item.delta > 5)
      continue;
    if (item.delta < 0) {
      const next = Math.max(-100, state.affection + item.delta);
      const loss = next - state.affection;
      if (loss !== 0) {
        state.affection = next;
        changed.push({ id: item.id, delta: loss });
      }
      continue;
    }
    if (state.gains >= 3) continue;
    const gain = Math.min(item.delta, Number.MAX_SAFE_INTEGER - state.affection);
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
