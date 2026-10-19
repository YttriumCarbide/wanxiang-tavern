import { query as $ } from './dom.js';

/** @param {import('./context.js').AppContext} context */
export function createViewport(context) {
  const { session } = context;
  const compactLandscape = () =>
    innerWidth > innerHeight && innerHeight <= 600 && innerWidth <= 1100;
  const compactHUD = () => innerWidth < 761 || compactLandscape();
  const canPlan = () =>
    !session.runtime.disposed &&
    !session.battle.playing &&
    session.runtime.mode === 'battle' &&
    ['opening', 'plan'].includes(session.battle.state.phase);
  function openCharacterHUD() {
    if (compactHUD()) {
      $('#details').classList.add('mobile-open');
      $('.turn-column').classList.remove('mobile-open');
    }
  }
  return { compactLandscape, compactHUD, canPlan, openCharacterHUD };
}
