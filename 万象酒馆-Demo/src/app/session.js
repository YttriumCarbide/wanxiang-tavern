import { ENCOUNTER_COUNT } from '../content/journey-rules.js';
import { newBattle, preview } from '../engine.js';
import { newLibrary } from '../ai/library.js';
import { loadCustomPortraits } from '../portraits.js';
import { DEFINITIONS } from '../data.js';
import { GENERATION_OPTIONS_KEY, restoreGenerationOptions } from '../generation-options.js';

/** Mutable application state has a single owner; domain snapshots remain plain data. */
export function createSession(storage = globalThis.localStorage) {
  let generationOptions = restoreGenerationOptions(null);
  try {
    generationOptions = restoreGenerationOptions(
      JSON.parse(storage.getItem(GENERATION_OPTIONS_KEY)),
    );
  } catch {
    // Normal play always requires AI; local generation is an explicit developer option.
  }
  const customPortraits = loadCustomPortraits();
  const heroDefs = {};
  for (const [id, url] of Object.entries(customPortraits)) {
    if (DEFINITIONS[id]) {
      heroDefs[id] = { ...structuredClone(DEFINITIONS[id]), customPortrait: url };
    }
  }
  const state = newBattle(undefined, heroDefs);
  return {
    battle: {
      state,
      plan: [],
      forecast: preview(state, []),
      playing: false,
      display: null,
      activeCell: -1,
      speed: 1,
      history: [],
    },
    selection: {
      selected: 'morrow',
      target: state.enemyIds[0],
      pending: null,
      selectedCell: -1,
      interactionStep: null,
      inspectedEnemy: null,
      intentScope: 'single',
    },
    journey: { expedition: null, bossChoice: 'bossGate', selectedNode: null, regionMap: 'ruins' },
    ai: {
      generationOptions,
      library: newLibrary(),
      activeScript: null,
      storyView: { page: 0, latest: 0, pages: Array.from({ length: ENCOUNTER_COUNT }, () => []) },
      preparationSlot: 0,
      preparationCharacter: null,
      busy: false,
      chat: { selected: [], quick: [], lastRequest: null },
      diagnostics: { character: null, script: null },
      diagnosticKind: null,
      worldEditor: {
        books: [],
        settings: null,
        draft: null,
        id: null,
        uid: null,
        warnings: [],
        saveTimer: null,
        savePromise: null,
        dirty: false,
        revision: 0,
      },
    },
    runtime: {
      needsStart: false,
      disposed: false,
      view: null,
      mode: 'inn',
      summonVisible: false,
      token: 0,
      toastTimer: null,
      resizeTimer: null,
      drag: null,
    },
  };
}
