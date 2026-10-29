import { discardUnfinishedTrip } from '../abandoned-trip.js';
import { adventureSnapshot, validAdventureSnapshot } from '../adventure/snapshot.js';

const KEY = 'wanxiang.battle-checkpoint.v1';

/** Save a coherent playable round, never half of an animation or a partially accepted reward. */
export function createCheckpoint(context) {
  const { session, storage } = context;
  let timer = null;
  function saveNow() {
    clearTimeout(timer);
    if (!context.apiClient.staticMode || session.runtime.disposed || session.runtime.needsStart)
      return;
    if (session.runtime.mode === 'inn') {
      storage.removeItem(KEY);
      return;
    }
    const adventure = adventureSnapshot(session);
    if (adventure) {
      storage.setItem(KEY, JSON.stringify({ ...adventure, library: session.ai.library }));
      return;
    }
    if (
      session.runtime.mode !== 'battle' ||
      session.battle.playing ||
      !(
        ['opening', 'plan'].includes(session.battle.state.phase) ||
        (['victory', 'defeat'].includes(session.battle.state.phase) &&
          session.journey.expedition?.pendingResult)
      )
    )
      return;
    storage.setItem(
      KEY,
      JSON.stringify({
        version: 1,
        library: session.ai.library,
        state: session.battle.state,
        plan: session.battle.plan,
        history: session.battle.history,
        journey: session.journey,
        activeScript: session.ai.activeScript,
        storyView: session.ai.storyView,
        quick: session.ai.chat.quick,
      }),
    );
  }
  function pending() {
    let activeScript = null;
    try {
      const value = JSON.parse(storage.getItem(KEY));
      if (validAdventureSnapshot(value) && value.library) return value;
      activeScript = value?.activeScript;
    } catch {
      // A damaged checkpoint must not prevent returning to the hall.
    }
    if (discardUnfinishedTrip(session.ai.library, activeScript))
      storage.setItem('wanxiang.worldbooks.v1', JSON.stringify(session.ai.library));
    storage.removeItem(KEY);
    return null;
  }
  return {
    pending,
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
