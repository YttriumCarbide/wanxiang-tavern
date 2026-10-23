/** Stack rules are shared by application, decay, descriptions and generated combat. */
export const DECAYING_STATUSES = Object.freeze(['weak', 'vulnerable', 'poison', 'bleed', 'regen']);
export const NEGATIVE_STATUSES = Object.freeze([
  'bind',
  'weak',
  'vulnerable',
  'poison',
  'slow',
  'bleed',
]);

export function statusStacks(key, value) {
  const maximum =
    key === 'haste' ? 2 : ['bind', 'overload', 'meteor', 'sacrifice'].includes(key) ? 1 : Infinity;
  return Math.max(0, Math.min(maximum, Math.floor(value || 0)));
}

export function generatedStatusValue(key, value, pure = false) {
  if (['poison', 'bleed', 'regen'].includes(key)) return Math.max(3, value * 2);
  if (pure && ['weak', 'vulnerable'].includes(key)) return Math.max(2, value);
  return statusStacks(key, value);
}

export function upgradeLegacyStatuses(combat) {
  const abilities = [
    ...(combat.skills || []),
    ...(combat.intents || []),
    ...(combat.enragedIntents || []),
    combat.openingIntent,
    combat.entrySkill,
  ].filter(Boolean);
  for (const ability of abilities) {
    const list = ability.effects || [];
    const pure =
      list.length > 0 &&
      list.every(
        (effect) => effect.type === 'buff' && ['weak', 'vulnerable'].includes(effect.buff),
      );
    for (const effect of list)
      if (effect.type === 'buff')
        effect.value = generatedStatusValue(effect.buff, effect.value, pure);
  }
}

export function decayStatuses(units) {
  const changes = [];
  for (const unit of Object.values(units)) {
    if (unit.hp <= 0) continue;
    for (const key of [...DECAYING_STATUSES, 'slow']) {
      const before = unit.buffs[key] || 0;
      const after = Math.max(key === 'slow' ? Math.min(1, before) : 0, before - 1);
      if (after === before) continue;
      if (after) unit.buffs[key] = after;
      else delete unit.buffs[key];
      changes.push({ id: unit.id, buff: key, before, after });
    }
  }
  return changes;
}
