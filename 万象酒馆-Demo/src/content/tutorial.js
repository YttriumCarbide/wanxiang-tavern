import { ENCOUNTER_COUNT } from './journey-rules.js';
import { ruinsEncounterSpec } from './ruins-encounters.js';
export function tutorialSpec(index = 0) {
  if (!Number.isInteger(index) || index < 0 || index >= ENCOUNTER_COUNT)
    throw Error('教学战斗序号无效');
  return ruinsEncounterSpec(0, index, { tutorial: true });
}
