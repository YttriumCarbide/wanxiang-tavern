import { BASE_WORLDS } from './worlds.js';
import { enemyIntentText } from './enemy-intent-text.js';
import { combatScale, scaleLevelEffects } from './combat-scale.js';

const MAP_LEVELS = Object.freeze({ ruins: 1, forest: 5, frost: 9, forge: 14, tide: 24 });
const MAIN_OFFSETS = [0, 1, 1, 2, 2, 3];

function seedOf(text) {
  let value = 2166136261;
  for (const char of String(text)) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}

export function encounterLevel(entry) {
  if (!entry || entry.tutorial) return 1;
  if (Number.isInteger(entry.level)) return Math.max(1, Math.min(99, entry.level));
  const base = MAP_LEVELS[entry.map] || 5;
  const official = BASE_WORLDS.includes(entry.world?.id || entry.map);
  if (official && entry.sequence < 6) return base + MAIN_OFFSETS[entry.sequence];
  const tier = Math.floor(entry.sequence / 6) + (official ? 0 : 1);
  return Math.min(99, base + (official ? 3 : 0) + 5 * tier);
}

export function enemyGrowth(entry, index, id, boss = false) {
  const level = encounterLevel(entry);
  const scale = combatScale(level);
  const roll = level === 1 || boss ? 0 : (seedOf(`${entry.seed}:${index}:${id}`) % 3) - 1;
  return { level, hpScale: scale * (1 + roll * 0.05), damageScale: scale * (1 - roll * 0.03) };
}

/** Decorate an authored move once, including tactical and multi-part boss attacks. */
export function leveledIntent(move, bonus = 0, scale = 1) {
  const hasDamage = move.effects?.some((effect) => effect.type === 'damage' && !effect.flat);
  if (scale === 1 && (!bonus || !hasDamage)) return move;
  const effects = scaleLevelEffects(move.effects || [], scale, bonus);
  const scalePos = (v) => (v > 0 ? Math.max(1, Math.round(v * scale)) : v);
  const scaled = { ...move, effects };
  if (move.selfShield) scaled.selfShield = scalePos(move.selfShield);
  if (move.selfHeal) scaled.selfHeal = scalePos(move.selfHeal);
  if (move.selfBuff && scale !== 1 && (move.selfBuff.poison || move.selfBuff.bleed)) {
    scaled.selfBuff = { ...move.selfBuff };
    for (const key of ['poison', 'bleed'])
      if (scaled.selfBuff[key]) scaled.selfBuff[key] = scalePos(scaled.selfBuff[key]);
  }
  return { ...scaled, text: enemyIntentText({ ...scaled, text: '' }) };
}
