import { claimKillExperience } from '../growth.js';
import { advance } from '../engine.js';
import { playbackBeats, PLAYBACK_BEAT_MS } from '../playback-timing.js';
import { query as $, sleep } from './dom.js';

/** @param {import('./context.js').AppContext} context */
export function createPlayback(context) {
  const { session } = context;
  async function showTurnNotice(text, subtitle, duration = 540) {
    if (session.runtime.disposed) return;
    const banner = $('#round-start');
    banner.getAnimations().forEach((a) => a.cancel());
    banner.querySelector('small').textContent = subtitle;
    banner.querySelector('strong').textContent = text;
    banner.hidden = false;
    await banner
      .animate(
        [
          { opacity: 0, translate: '0 8px' },
          { opacity: 1, translate: '0 0', offset: 0.18 },
          { opacity: 1, translate: '0 0', offset: 0.72 },
          { opacity: 0, translate: '0 -7px' },
        ],
        { duration: duration / session.battle.speed, easing: 'ease-out' },
      )
      .finished.catch((error) => {
        if (!session.runtime.disposed) throw error;
      });
    if (!session.runtime.disposed) banner.hidden = true;
  }
  async function commit() {
    if (session.battle.playing || session.runtime.mode !== 'battle') return;
    context.planning.recompute();
    if (!session.battle.forecast.valid) return context.shell.toast('请先修正标红的行动。');
    if (context.onboarding && !context.onboarding.beforeCommit()) return;
    if (context.companionEvents && !context.companionEvents.beforeCommit()) return;

    session.battle.playing = true;
    context.selection.clearSelection(true);
    const result = session.battle.forecast;
    const subtitle =
      session.battle.state.phase === 'opening'
        ? '先手准备'
        : `第 ${session.battle.state.round} 回合`;

    document.querySelectorAll('.card-flight,.ui-exit').forEach((element) => element.remove());
    document.querySelectorAll('[data-motion],[data-rear],#round-banner').forEach((element) => {
      element.getAnimations().forEach((animation) => animation.cancel());
    });
    session.runtime.view?.snapFormationOnNextDraw();
    context.renderer.render({ animate: false });
    context.audio.play('round');
    await showTurnNotice('回合开始', subtitle, 320);

    for (const beat of playbackBeats(result)) {
      if (session.runtime.disposed) return;
      session.battle.activeCell = beat.at;
      for (const event of beat.events) {
        if (event.type === 'item') await context.backpack.playItem(event);
        if (session.runtime.disposed) return;
        const before = session.battle.display || session.battle.state;
        session.battle.display = event.after;
        session.battle.history.push(
          `${event.at < result.slots.length ? `[${event.at + 1}]` : '[回合末]'} ${event.label}`,
          ...event.logs,
        );
        context.renderer.render();
        session.runtime.view?.playEvent(event, before);
        context.audio.combat(event, before, session.battle.speed);
      }
      context.renderer.render();
      await sleep(PLAYBACK_BEAT_MS / session.battle.speed);
    }

    await showTurnNotice(
      session.battle.state.phase === 'opening' ? '准备结束' : '回合结束',
      subtitle,
      440,
    );
    if (session.runtime.disposed) return;
    context.generation.recordRound(result, session.battle.state);
    const wasOpening = session.battle.state.phase === 'opening';
    const gains = claimKillExperience(
      session.ai.library,
      session.journey.expedition,
      session.battle.state,
      result,
    );
    (session.journey.expedition.levelUps ||= []).push(
      ...gains.filter((gain) => gain.levels.length),
    );
    session.ai.library.inventory.items = structuredClone(result.final.items);
    context.companionEvents?.accepted(session.battle.state, result);
    session.battle.state = advance(result);
    context.generation.save();
    session.battle.display = null;
    session.battle.playing = false;
    session.battle.activeCell = -1;
    session.battle.plan = [];
    context.selection.clearSelection(true);
    context.planning.recompute();
    context.renderer.render();
    context.onboarding?.roundFinished(wasOpening, result);
    if (session.battle.state.phase === 'victory' || session.battle.state.phase === 'defeat')
      context.journey.showResult();
  }
  return { showTurnNotice, commit };
}
