import { definition, abilityFor, definitionsFor } from '../catalog.js';
export function createRoster({ session }) {
  return {
    get: (id) => definition(session.battle.state, id),
    ability: (id, skill) => abilityFor(session.battle.state, id, skill),
    all: () => definitionsFor(session.battle.state),
  };
}
