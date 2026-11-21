import { definition, heroesFor } from './catalog.js';
import { NEGATIVE_STATUSES } from './status-rules.js';
import { negativeImmune, positionBuff } from './emblem-mechanics.js';
import { auraValue } from './triggers.js';
export const front = (s) => s.formation.slice(0, 3);
export const rear = (s) => s.formation.slice(3);
export const getEnemies = (s) => s.enemyIds.map((id) => definition(s, id));
export const livingEnemies = (s) => getEnemies(s).filter((e) => s.units[e.id].hp > 0);
export function effectiveBuff(s, id, key) {
  if (NEGATIVE_STATUSES.includes(key) && negativeImmune(s, id)) return 0;
  const value =
    (s.units[id]?.buffs[key] || 0) +
    positionBuff(s, id, key) +
    (s.units[id]?.hp > 0 ? auraValue(s, heroesFor(s), id, key) : 0);
  if (key === 'haste') {
    const cap = Math.max(2, positionBuff(s, id, 'haste'));
    return Math.min(cap, value);
  }
  return value;
}
