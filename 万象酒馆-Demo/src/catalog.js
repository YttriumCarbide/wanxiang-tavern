import { HEROES, DEFINITIONS, ability } from './data.js';
import { emblemSkill } from './emblems.js';
import { portraitUrl } from './portraits.js';

export const definitionsFor = (state) => ({
  ...DEFINITIONS,
  ...state?.enemyDefinitions,
  ...state?.heroDefinitions,
});
export const definition = (state, id) =>
  state?.heroDefinitions?.[id] || state?.enemyDefinitions?.[id] || DEFINITIONS[id];
export const heroesFor = (state) =>
  HEROES.filter((hero) => !state?.units || state.units[hero.id]).map((hero) =>
    definition(state, hero.id),
  );
export const abilityFor = (state, id, skill) =>
  emblemSkill(definition(state, id), skill) || ability(id, skill, definitionsFor(state));
export { portraitUrl };
