import { query as $ } from './dom.js';

export function createDebugAPI(context) {
  const { session } = context;
  return {
    flushStorage: async () => {
      context.checkpoint?.saveNow();
      await context.storage.flush?.();
    },
    getChat: () => structuredClone(session.ai.chat),
    getActiveScript: () => structuredClone(session.ai.activeScript),
    getLibrary: () => structuredClone(session.ai.library),
    newAdventure: () => context.onboarding.open(),
    getExpedition: () => structuredClone(session.journey.expedition),
    getState: () => structuredClone(session.battle.state),
    getPlan: () => structuredClone(session.battle.plan),
    getArtStatus: () => session.runtime.view?.artStatus() || null,
    getWeatherStatus: () => session.runtime.view?.weatherStatus() || null,
    getEmblemStatus: () => session.runtime.view?.emblemStatus() || null,
    getAudioStatus: context.audio.status,
    getForecast: () => structuredClone(session.battle.forecast),
    getStatus: () => ({
      mode: session.runtime.mode,
      playing: session.battle.playing,
      selected: session.selection.selected,
      pending: session.selection.pending,
      selectedCell: session.selection.selectedCell,
      interactionStep: session.selection.interactionStep,
      inspectedEnemy: session.selection.inspectedEnemy,
      eligibleTargets: context.selection.eligibleTargets(),
      animating: !!session.runtime.view?.isAnimating(),
      deaths: session.runtime.view?.deathStatus() || null,
      dragging: session.runtime.view?.dragState() || null,
      transitioning: !$('#round-start').hidden,
    }),
    startBattle: context.journey.startBattle,
    returnInn: context.journey.returnInn,
    getExploration: () => structuredClone(session.ai.library.exploration),
    getSaves: () => context.saves?.getStore?.(),
    saveSlot: (id) => context.saves?.saveSlot?.(id),
    loadSlot: (id) => context.saves?.loadSlot?.(id),
    chooseBoss(id) {
      if (session.runtime.mode === 'inn') session.journey.bossChoice = id;
    },
  };
}
