import { paintedSceneChecks } from './painted-scenes.mjs';

export function explorationGroundingChecks(options) {
  return paintedSceneChecks(options, ['city-center', 'market', 'rampart', 'outskirts']);
}
