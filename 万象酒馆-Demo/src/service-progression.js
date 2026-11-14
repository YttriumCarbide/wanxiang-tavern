export const SERVICE_ROLES = Object.freeze({
  front: '前台',
  cook: '掌勺',
  server: '服务员',
  clean: '保洁',
});

export const SERVICE_REPUTATION_MAX = 5000;
export const SERVICE_PROFICIENCY_MAX = 1000;
export const SERVICE_REPUTATION_STEP = 400;
export const SERVICE_MAX_TABLES = 19;

function bounded(value, maximum) {
  return Number.isFinite(value) ? Math.max(0, Math.min(maximum, Math.floor(value))) : 0;
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
      Object.fromEntries(
        Object.keys(SERVICE_ROLES).map((role) => [
          role,
          bounded(roles?.[role], SERVICE_PROFICIENCY_MAX),
        ]),
      ),
    ]),
  );
  return {
    reputation: bounded(raw?.reputation, SERVICE_REPUTATION_MAX),
    training,
    shifts: Number.isSafeInteger(raw?.shifts) ? Math.max(0, raw.shifts) : 0,
    specialties: Object.fromEntries(
      Object.entries(raw?.specialties || {}).map(([id, count]) => [id, bounded(count, 1000)]),
    ),
  };
}

export function serviceProficiency(growth, member, role) {
  if (!member) return 0;
  const base = 20 + (serviceSeed(`${member}:${role}`) % 26);
  const training = growth?.training;
  const experience = training && Object.hasOwn(training, member) ? training[member][role] : 0;
  return bounded(base + (experience || 0), SERVICE_PROFICIENCY_MAX);
}

export function serviceAutoChance(level) {
  return level < 40 ? 0 : Math.min(52, 3 + Math.floor(Math.sqrt(level - 40) * 1.6));
}

export function serviceWaitBonus(level) {
  return Math.floor(Math.sqrt(Math.max(0, level)) * 0.62);
}

export function servicePriceBonus(levels, reputation) {
  const total = Object.keys(SERVICE_ROLES).reduce((sum, role) => sum + (levels?.[role] || 0), 0);
  return Math.floor(total / 80) + Math.floor((reputation || 0) / 100);
}

export function expectedServiceTables(reputation) {
  return Math.min(
    SERVICE_MAX_TABLES,
    7 + Math.floor(bounded(reputation, SERVICE_REPUTATION_MAX) / SERVICE_REPUTATION_STEP),
  );
}

export function settleServiceGrowth(growth, shift) {
  growth.shifts = (growth.shifts || 0) + 1;
  const trained = [];
  for (const role of Object.keys(SERVICE_ROLES)) {
    const id = shift.staff[role];
    const before = serviceProficiency(growth, id, role);
    const points = Math.min(
      8,
      shift.completedByRole?.[role] || 0,
      SERVICE_PROFICIENCY_MAX - before,
    );
    if (!id || !points) continue;
    const training = Object.hasOwn(growth.training, id) ? growth.training[id] : {};
    growth.training = {
      ...growth.training,
      [id]: { ...training, [role]: (training[role] || 0) + points },
    };
    trained.push({ id, role, points });
  }
  const previous = growth.reputation;
  growth.reputation = bounded(
    previous + shift.served - shift.missed + (shift.special?.paid || 0),
    SERVICE_REPUTATION_MAX,
  );
  if (shift.special?.paid > 0) {
    growth.specialties ||= {};
    const id = shift.special.id;
    growth.specialties[id] = bounded((growth.specialties[id] || 0) + shift.special.paid, 1000);
  }
  return { reputationChange: growth.reputation - previous, trained };
}
