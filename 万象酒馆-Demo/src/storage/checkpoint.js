import { discardUnfinishedTrip } from '../abandoned-trip.js';
import { adventureSnapshot, validAdventureSnapshot } from '../adventure/snapshot.js';
import {
  isRuinsAdventureSnapshot,
  purgeLegacyRuinsProgress,
} from '../ai/library-ruins-migration.js';

const KEY = 'wanxiang.battle-checkpoint.v1';
export const GAME_LIBRARY_KEY = 'wanxiang.worldbooks.v1';

function hasBattleRoster(value) {
  const state = value?.state;
  return (
    state?.units &&
    Array.isArray(state.enemyIds) &&
    state.enemyIds.every((id) => typeof id === 'string' && Object.hasOwn(state.units, id))
  );
}

/** Save a coherent playable round, never half of an animation or a partially accepted reward. */
export function createCheckpoint(context) {
  const { session, storage } = context;
  let timer = null;
  function snapshot() {
    const adventure = adventureSnapshot(session);
    if (adventure) return { ...adventure, library: session.ai.library };
    if (
      session.journey.expedition?.adventure ||
      session.runtime.mode !== 'battle' ||
      session.battle.playing ||
      !(
        ['opening', 'plan'].includes(session.battle.state.phase) ||
        (['victory', 'defeat'].includes(session.battle.state.phase) &&
          session.journey.expedition?.pendingResult)
      )
    )
      return null;
    return {
      version: 1,
      library: session.ai.library,
      state: session.battle.state,
      plan: session.battle.plan,
      history: session.battle.history,
      journey: session.journey,
      activeScript: session.ai.activeScript,
      storyView: session.ai.storyView,
      quick: session.ai.chat.quick,
    };
  }
  function canSave() {
    return context.apiClient.staticMode && !session.runtime.disposed && !session.runtime.needsStart;
  }
  function writeLibrary(library, value, clear = false) {
    const entries = [[GAME_LIBRARY_KEY, JSON.stringify(library)]];
    if (value) entries.push([KEY, JSON.stringify({ ...value, pairedLibrary: true })]);
    if (typeof storage.setItems === 'function') {
      storage.setItems(entries, clear ? [KEY] : []);
      return;
    }
    for (const [key, text] of entries) storage.setItem(key, text);
    if (clear) storage.removeItem(KEY);
  }
  function saveLibrary() {
    const library = session.ai.library;
    if (!canSave()) {
      writeLibrary(library);
      return;
    }
    const inInn = session.runtime.mode === 'inn';
    const value = inInn ? null : snapshot();
    if (inInn || value) clearTimeout(timer);
    writeLibrary(library, value, inInn);
  }
  function saveNow() {
    clearTimeout(timer);
    if (!canSave()) return;
    if (session.runtime.mode === 'inn') {
      storage.removeItem(KEY);
      return;
    }
    const value = snapshot();
    if (value) writeLibrary(value.library, value);
  }
  function pending() {
    const raw = storage.getItem(KEY);
    let activeScript = null;
    try {
      const value = JSON.parse(raw);
      activeScript = value?.activeScript;
      const pairedWithCurrentLibrary =
        value?.pairedLibrary !== true ||
        storage.getItem(GAME_LIBRARY_KEY) === JSON.stringify(value.library);
      const needsRuinsMigration = value?.library && !value.library.migrations?.ruinsResetV2;
      const newerLibraryMigration = session.ai.library.migrations?.ruinsResetV2;
      const migratedAway =
        needsRuinsMigration && newerLibraryMigration && isRuinsAdventureSnapshot(value);
      const developerSnapshot =
        session.runtime?.developerSandbox && value?.version === 1 && value.journey?.expedition;
      if (
        pairedWithCurrentLibrary &&
        !migratedAway &&
        value?.library &&
        hasBattleRoster(value) &&
        (developerSnapshot || validAdventureSnapshot(value))
      ) {
        if (needsRuinsMigration && newerLibraryMigration) purgeLegacyRuinsProgress(value.library);
        return value;
      }
    } catch {
      // A damaged checkpoint must not prevent returning to the hall.
    }
    if (discardUnfinishedTrip(session.ai.library, activeScript))
      writeLibrary(session.ai.library, undefined, true);
    else if (raw !== null) storage.removeItem(KEY);
    return null;
  }
  return {
    snapshot,
    clear() {
      clearTimeout(timer);
      storage.removeItem(KEY);
    },
    pending,
    saveLibrary,
    saveNow,
    schedule() {
      if (!context.apiClient.staticMode) return;
      clearTimeout(timer);
      timer = setTimeout(saveNow, 150);
    },
    dispose() {
      clearTimeout(timer);
    },
  };
}
