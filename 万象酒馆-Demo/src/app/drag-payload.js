import { HEROES, DEFINITIONS, ability } from '../data.js';

/** External drag payloads are parsed before any application state is modified. */
export function parseTimelineDrop(text, definitions = DEFINITIONS) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (value?.kind === 'move' && typeof value.id === 'string') return { kind: 'move', id: value.id };
  if (value?.kind !== 'new-skill' || !HEROES.some((hero) => hero.id === value.actor)) return null;
  if (!ability(value.actor, value.skill, definitions)) return null;
  return { kind: 'new-skill', actor: value.actor, skill: value.skill };
}
