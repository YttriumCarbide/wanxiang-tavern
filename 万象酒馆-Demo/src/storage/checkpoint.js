import { restoreLibrary } from '../ai/library.js';
import { preview } from '../engine.js';

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
    if (
      session.runtime.mode !== 'battle' ||
      session.battle.playing ||
      !['opening', 'plan'].includes(session.battle.state.phase)
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
    if (!context.apiClient.staticMode) return null;
    try {
      const value = JSON.parse(storage.getItem(KEY));
      if (
        value?.version !== 1 ||
        !value.journey?.expedition ||
        !['opening', 'plan'].includes(value.state?.phase)
      )
        return null;
      if (!value.state.units || !Array.isArray(value.state.formation)) return null;
      restoreLibrary(value.library);
      preview(value.state, []);
      return value;
    } catch {
      storage.removeItem(KEY);
      return null;
    }
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
