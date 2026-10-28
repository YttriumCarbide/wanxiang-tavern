import { claimKillExperience } from '../growth.js';
import { claimCooperationAffection } from '../cooperation.js';
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

    if (context.emblems && !context.emblems.beforeCommit()) return;
    session.battle.playing = true;
    try {
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
          if (event.type === 'engage') {
            const screen = document.querySelector('#emblem-screen');
            if (screen) {
              screen.classList.remove('awakening');
              void screen.offsetWidth;
              screen.classList.add('awakening');
              setTimeout(() => screen.classList.remove('awakening'), 1100);
            }
          }
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
          if (event.type === 'bossPhase')
            await showTurnNotice(
              '第二阶段',
              `${event.after.heroDefinitions?.[event.actor]?.name || event.after.enemyDefinitions?.[event.actor]?.name || event.actor} · 冲击禁锢，本回合剩余行动跳过`,
              2200 * session.battle.speed,
            );
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
      (session.journey.expedition.experienceAwards ||= []).push(...gains);
      (session.journey.expedition.levelUps ||= []).push(
        ...gains.filter((gain) => gain.levels.length),
      );
      session.ai.library.inventory.items = structuredClone(result.final.items);
      context.companionEvents?.accepted(session.battle.state, result);
      const cooperation = claimCooperationAffection(
        session.ai.library,
        session.journey.expedition,
        result,
      );
      if (cooperation?.delta)
        context.shell.toast(`合作击破 · ${cooperation.name}好感 +${cooperation.delta}`);
      context.emblems?.accepted(result);
      session.battle.state = advance(result);
      context.generation.save();
      session.battle.plan = [];
      context.selection.clearSelection(true);
      context.planning.recompute();
      context.renderer.render();
      context.onboarding?.roundFinished(wasOpening, result);
      if (session.battle.state.phase === 'victory' || session.battle.state.phase === 'defeat')
        context.journey.showResult();
    } finally {
      session.battle.display = null;
      session.battle.playing = false;
      session.battle.activeCell = -1;
      context.renderer.render();
      context.emblems?.check();
    }
  }
  return { showTurnNotice, commit };
}
