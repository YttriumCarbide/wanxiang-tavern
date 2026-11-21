import { scaleMoveEffects } from './combat-scale.js';
import { finalSkillText } from './skill-text.js';

function addSharedSkillDamage(effects, bonus) {
  const total = effects.reduce(
    (sum, effect) => sum + (effect.type === 'damage' && !effect.flat ? effect.value : 0),
    0,
  );
  if (!total) return effects;
  let cumulative = 0;
  let allocated = 0;
  return effects.map((effect) => {
    if (effect.type !== 'damage' || effect.flat) return effect;
    cumulative += effect.value;
    const next = Math.round((cumulative * bonus) / total);
    const value = effect.value + next - allocated;
    allocated = next;
    return { ...effect, value };
  });
}
export function applyEquipment(combat, equipment = []) {
  const result = structuredClone(combat);
  const valid = equipment.filter((item) => item && item.stats);
  for (const item of valid) {
    result.hp += item.stats.hp || 0;
    result.mp += item.stats.mp || 0;
    result.attack += item.stats.attack || 0;
    result.skillDamageBonus = (result.skillDamageBonus || 0) + (item.stats.skillDamage || 0);
    result.limit = Math.min(6, result.limit + (item.stats.limit || 0));
    result.manaCostReduction = Math.min(
      4,
      (result.manaCostReduction || 0) + (item.stats.manaCost || 0),
    );
  }
  const scale = combat.attack ? result.attack / combat.attack : 1;
  result.skills = (result.skills || []).map((skill) => {
    const next = { ...skill };
    if (Array.isArray(next.effects)) {
      next.effects = scaleMoveEffects(next.effects, scale);
    }
    if (next.skillDamageBonus !== false && result.skillDamageBonus) {
      // A skill receives one shared bonus, even when its damage is split into several parts.
      next.effects = addSharedSkillDamage(next.effects || [], result.skillDamageBonus);
    }
    if (result.manaCostReduction && Number.isInteger(next.mana) && next.mana > 0) {
      next.mana = Math.max(0, next.mana - result.manaCostReduction);
    }
    if (next.type !== 'passive' && !next.passive)
      next.text = finalSkillText(next, result.mechanicMark?.name);
    return next;
  });
  result.equipment = valid.map((item) => structuredClone(item));
  return result;
}
