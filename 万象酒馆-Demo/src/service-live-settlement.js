import { INGREDIENTS } from './content/dining.js';
import { settleServiceGrowth } from './service-progression.js';
export function settleLiveServiceShift(library, shift) {
  shift.finished = true;
  if (shift.settled) {
    return {
      reputationChange: 0,
      trained: [],
      totalGold: shift.earnedGold,
      bonusIngredients: shift.bonusIngredients || {},
    };
  }
  shift.settled = true;
  library.inventory.gold = Math.min(
    999999999,
    (library.inventory.gold || 0) + (shift.earnedGold || 0),
  );
  for (const [id, amount] of Object.entries(shift.pantry || {})) {
    if (Object.hasOwn(INGREDIENTS, id)) library.dining.inventory[id] = Math.max(0, amount);
  }
  for (const [id, gain] of Object.entries(shift.bonusIngredients || {})) {
    if (Object.hasOwn(INGREDIENTS, id) && gain > 0) {
      library.dining.inventory[id] = Math.min(9999, (library.dining.inventory[id] || 0) + gain);
    }
  }
  const growth = library.daily.serviceGrowth;
  const previousRep = growth.reputation;
  const { trained } = settleServiceGrowth(growth, {
    staff: shift.staff,
    completedByRole: shift.completedByRole,
    served: shift.servedCount,
    missed: shift.leftAngry,
    special: null,
  });
  growth.reputation = Math.min(
    5000,
    Math.max(0, previousRep + Math.max(shift.repGain || 0, shift.servedCount)),
  );
  growth.specialties = { ...(growth.specialties || {}), ...(shift.specialtiesSnapshot || {}) };

  const seenIds = new Set();
  for (const id of Object.values(shift.staff || {})) {
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    const rel = library.relationships?.[id];
    if (rel) rel.affection = Math.min(Number.MAX_SAFE_INTEGER, (rel.affection || 0) + 2);
  }
  return {
    reputationChange: growth.reputation - previousRep,
    trained,
    totalGold: shift.earnedGold || 0,
    bonusIngredients: shift.bonusIngredients || {},
  };
}
