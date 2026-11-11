export const SERVICE_ROLES = Object.freeze({
  front: '前台',
  cook: '掌勺',
  server: '服务员',
  clean: '保洁',
});

function bounded(value) {
  return Number.isFinite(value) ? Math.max(0, Math.min(100, Math.floor(value))) : 0;
}

export function serviceSeed(text) {
  let hash = 2166136261;
  for (const character of text) {
    hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x7feb352d);
  hash = Math.imul(hash ^ (hash >>> 15), 0x846ca68b);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function restoreServiceGrowth(raw) {
  const training = Object.fromEntries(
    Object.entries(raw?.training || {}).map(([id, roles]) => [
      id,
      Object.fromEntries(Object.keys(SERVICE_ROLES).map((role) => [role, bounded(roles?.[role])])),
    ]),
  );
  return { reputation: bounded(raw?.reputation), training };
}

export function serviceProficiency(growth, member, role) {
  if (!member) return 0;
  const base = 20 + (serviceSeed(`${member}:${role}`) % 26);
  const training = growth?.training;
  const experience = training && Object.hasOwn(training, member) ? training[member][role] : 0;
  return bounded(base + (experience || 0));
}

export function serviceAutoChance(level) {
  return level < 40 ? 0 : Math.min(30, 3 + Math.floor((level - 40) * 0.45));
}

export function serviceWaitBonus(level) {
  return Math.floor(level / 10);
}

export function servicePriceBonus(levels, reputation) {
  const total = Object.keys(SERVICE_ROLES).reduce((sum, role) => sum + (levels?.[role] || 0), 0);
  return Math.floor(total / 20) + Math.floor((reputation || 0) / 4);
}

export function expectedServiceTables(reputation) {
  return 7 + Math.floor(bounded(reputation) / 25);
}

export function settleServiceGrowth(growth, shift) {
  const trained = [];
  for (const role of Object.keys(SERVICE_ROLES)) {
    const id = shift.staff[role];
    const before = serviceProficiency(growth, id, role);
    const points = Math.min(8, shift.completedByRole?.[role] || 0, 100 - before);
    if (!id || !points) continue;
    const training = Object.hasOwn(growth.training, id) ? growth.training[id] : {};
    growth.training = {
      ...growth.training,
      [id]: { ...training, [role]: (training[role] || 0) + points },
    };
    trained.push({ id, role, points });
  }
  const previous = growth.reputation;
  growth.reputation = bounded(previous + shift.served - shift.missed + (shift.special?.paid || 0));
  return { reputationChange: growth.reputation - previous, trained };
}
