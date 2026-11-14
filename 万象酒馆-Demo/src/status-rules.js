/** Stack rules are shared by application, decay, descriptions and generated combat. */
export const DECAYING_STATUSES = Object.freeze([
  'weak',
  'vulnerable',
  'poison',
  'bleed',
  'regen',
  'flying',
  'blind',
]);
export const NEGATIVE_STATUSES = Object.freeze([
  'bind',
  'weak',
  'vulnerable',
  'poison',
  'slow',
  'bleed',
  'blind',
]);

export function statusStacks(key, value) {
  const maximum =
    key === 'haste' ? 2 : ['bind', 'overload', 'meteor', 'sacrifice'].includes(key) ? 1 : Infinity;
  return Math.max(0, Math.min(maximum, Math.floor(value || 0)));
}

export const STRENGTH_STEP = 0.1;
export const VULNERABLE_RATE = 0.5;
export const WEAK_REDUCTION_RATE = 0.25;
export const IRON_STEP = 0.1;
export const IRON_MAX_REDUCTION = 0.7;
export const GUARD_STEP = 0.2;
export const REGEN_STEP = 0.03;
export const REGEN_MAX_RATE = 0.3;

export function applyStrengthBonus(baseDamage, strength = 0) {
  const s = Math.max(0, Math.floor(strength || 0));
  const percent = 100 + s * Math.round(STRENGTH_STEP * 100);
  return Math.round((baseDamage * percent) / 100);
}

export function applyWeakReduction(damage, weak = 0) {
  const w = Math.max(0, Math.floor(weak || 0));
  if (!w || damage <= 0) return Math.max(0, damage);
  const keepPercent = 100 - Math.round(WEAK_REDUCTION_RATE * 100);
  return Math.floor((damage * keepPercent) / 100);
}

export function applyVulnerableBonus(damage, vulnerable = 0) {
  const v = Math.max(0, Math.floor(vulnerable || 0));
  if (!v || damage <= 0) return Math.max(0, damage);
  const percent = 100 + Math.round(VULNERABLE_RATE * 100);
  return Math.round((damage * percent) / 100);
}

export function applyIronReduction(damage, iron = 0) {
  const i = Math.max(0, Math.floor(iron || 0));
  if (!i || damage <= 0) return Math.max(0, damage);
  const keepPercent = Math.max(
    Math.round((1 - IRON_MAX_REDUCTION) * 100),
    100 - i * Math.round(IRON_STEP * 100),
  );
  return Math.max(1, Math.floor((damage * keepPercent) / 100));
}

export function applyGuardShield(baseValue, guard = 0) {
  const value = Math.max(0, Math.round(baseValue || 0));
  const g = Math.max(0, Math.floor(guard || 0));
  const percent = 100 + g * Math.round(GUARD_STEP * 100);
  return Math.round((value * percent) / 100);
}

export function regenHealAmount(maxHp, regen = 0) {
  const r = Math.max(0, Math.floor(regen || 0));
  if (!r || maxHp <= 0) return 0;
  const percent = Math.min(Math.round(REGEN_MAX_RATE * 100), r * Math.round(REGEN_STEP * 100));
  return Math.max(1, Math.round((maxHp * percent) / 100));
}

export function generatedStatusValue(key, value, pure = false) {
  if (['poison', 'bleed'].includes(key)) return Math.max(3, value * 2);
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
