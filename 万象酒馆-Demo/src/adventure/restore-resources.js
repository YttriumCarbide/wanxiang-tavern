import { HEROES } from '../data.js';
import { applyCompanionModifiers } from '../companion-mechanics.js';
import { diningResourceGain } from '../dining.js';
import { applyEmblemStats } from '../emblems.js';
import { battleResourceLimits } from '../engine.js';
import { applyEquipment } from '../equipment.js';
import { grownCombat } from '../growth.js';

/**
 * Older equipment compilation could write NaN, which JSON stored as null.
 * Recover only the lost fields from the roster that entered this expedition.
 */
export function restoreAdventureResources(snapshot, library) {
  const expedition = snapshot.journey.expedition;
  if (!expedition) return;
  const party = expedition.partyIds || library.party;
  for (const [index, { id }] of HEROES.entries()) {
    const member = library.characters.find((entry) => entry.id === party[index]);
    if (!member) continue;
    recoverResources(expedition.heroDefinitions?.[id], member);
    for (const state of [snapshot.state, expedition.carried]) {
      const unit = state?.units[id];
      if (!unit) continue;
      const modifier = state.expeditionModifiers?.[id];
      const absorption = state.absorptionBases?.[id];
      recoverResources(absorption?.definition, member, absorption, unit.mealBonus, modifier);
      recoverResources(state.heroDefinitions?.[id], member, unit, unit.mealBonus, modifier);
    }
  }
}

function recoverResources(definition, member, unit, meal, modifier) {
  if (!definition || definition.inactive) return;
  const broken = ['hp', 'mp'].filter((key) => {
    const max = key === 'hp' ? 'maxHp' : 'maxMp';
    return (
      !Number.isFinite(definition[key]) ||
      (unit && (!Number.isFinite(unit[max]) || (key in unit && !Number.isFinite(unit[key]))))
    );
  });
  if (!broken.length) return;
  const combat = grownCombat({
    ...member,
    growth: { ...member.growth, level: definition.level ?? member.growth?.level },
  });
  const equipped = applyEquipment(combat, definition.equipment);
  const fallback = applyCompanionModifiers(
    definition._overloadApplied ? applyEmblemStats(equipped, definition.emblemId) : equipped,
    modifier,
  );
  const limits = battleResourceLimits({
    ...fallback,
    ...definition,
    hp: fallback.hp,
    mp: fallback.mp,
  });
  for (const key of broken) {
    const max = key === 'hp' ? 'maxHp' : 'maxMp';
    const mealBonus = unit?.mealBonus || meal;
    let gain = mealBonus?.applied?.[key];
    if (mealBonus && !Number.isFinite(gain)) {
      gain = diningResourceGain(mealBonus.bonus || {}, key, limits[key]);
      if (mealBonus.applied) mealBonus.applied[key] = gain;
    }
    if (!Number.isFinite(definition[key])) definition[key] = fallback[key] + (gain || 0);
    if (!unit) continue;
    if (!Number.isFinite(unit[max])) unit[max] = battleResourceLimits(definition)[key];
    if (key in unit) {
      const current = Number.isFinite(unit[key]) ? unit[key] : unit[max];
      unit[key] = Math.max(0, Math.min(current, unit[max]));
    }
  }
}
