import { claimKillExperience } from '../growth.js';
import { claimCooperationAffection } from '../cooperation.js';
import { claimEnemyDrops } from '../enemy-drops.js';
import { advance } from '../engine.js';
import { grantMidBattleOverlordEmblem } from '../emblem-progression.js';
import { mergeRevealedWeaknessMap } from '../octopath.js';
import { playbackBeats, PLAYBACK_BEAT_MS } from '../playback-timing.js';
import { APEP_ID, apepAttack } from '../apep-presentation.js';
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
  async function commit(options = {}) {
    if (session.runtime.disposed || session.battle.playing || session.runtime.mode !== 'battle')
      return;
    const forcedByBomb = options?.forcedByBomb === true;
    context.overlordBattle?.disarmBombTimer?.();
    context.planning.recompute();
    if (!session.battle.forecast.valid) return context.shell?.toast('请先修正标红的行动。');
    const guided = !forcedByBomb && !session.journey.expedition?.developerEncounter;
    if (guided && context.onboarding && !context.onboarding.beforeCommit()) return;
    if (guided && context.companionEvents && !context.companionEvents.beforeCommit()) return;

    if (guided && context.emblems && !context.emblems.beforeCommit()) return;
    const token = session.runtime.token;
    const expedition = session.journey.expedition;
    const current = () =>
      !session.runtime.disposed &&
      session.runtime.mode === 'battle' &&
      session.runtime.token === token &&
      session.journey.expedition === expedition;
    session.battle.playing = true;
    context.ledger?.sync();
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
        if (!current()) return;
        session.battle.activeCell = beat.at;
        let beatWaitMs = PLAYBACK_BEAT_MS;
        for (const event of beat.events) {
          if (event.type === 'item') await context.backpack.playItem(event);
          if (!current()) return;

          const before = session.battle.display || session.battle.state;
          session.battle.display = event.after;
          session.battle.history.push(
            `${event.at < result.slots.length ? `[${event.at + 1}]` : '[回合末]'} ${event.label}`,
            ...event.logs,
          );
          context.renderer.render();
          const eventMs = session.runtime.view?.playEvent(event, before) || 0;
          const actorDef = event.actor
            ? context.roster?.get?.(event.actor) ||
              event.after?.enemyDefinitions?.[event.actor] ||
              event.after?.heroDefinitions?.[event.actor]
            : null;
          if (
            (event.type === 'enemy' || (event.type === 'counter' && event.isOverlordCounter)) &&
            (actorDef?.boss || actorDef?.overlord)
          ) {
            beatWaitMs = Math.max(beatWaitMs, eventMs + 140);
          } else if (
            ['enemy', 'entrySkill', 'counter'].includes(event.type) &&
            eventMs > PLAYBACK_BEAT_MS &&
            eventMs < 10000
          ) {
            beatWaitMs = Math.max(beatWaitMs, eventMs + 100);
          } else if (event.type === 'bombDetonate' || event.type === 'bombDefuse') {
            beatWaitMs = Math.max(beatWaitMs, eventMs + 150);
          }
          context.audio.combat(event, before, session.battle.speed, eventMs);
          void context.emblems?.onBattleEvent(event, before);
          if (event.type === 'bossPhase' && (event.overlord || event.actor === APEP_ID)) {
            await context.overlordBattle?.onEvent(event);
          } else if (event.type === 'bossPhase') {
            context.battleBarks?.bossEnraged(event.actor);
            await showTurnNotice(
              '第二阶段',
              `${event.after.heroDefinitions?.[event.actor]?.name || event.after.enemyDefinitions?.[event.actor]?.name || event.actor} · 冲击禁锢，本回合剩余行动跳过`,
              2200 * session.battle.speed,
            );
          } else if (
            (event.actor === APEP_ID && (apepAttack(event) || event.type === 'sinkingPlague')) ||
            event.overlordDomainLock ||
            event.chargeStarted ||
            event.type === 'bombDetonate' ||
            event.type === 'bombDefuse' ||
            event.type === 'hiddenWeaponLock' ||
            (event.type === 'counter' && event.isOverlordCounter) ||
            (event.fixedSlotBroken && event.blockedBy === 'bind') ||
            event.statusTriggers?.some((st) =>
              ['break', 'eclipsescaleShed', 'warlordRally', 'warlordConsume'].includes(st.type),
            )
          ) {
            void context.overlordBattle?.onEvent(event);
          }
          if (!current()) return;
        }
        context.renderer.render();
        await sleep(beatWaitMs / session.battle.speed);
      }

      if (!current()) return;
      const remainingDeathMs = session.runtime.view?.bossDeathRemainingMs?.() || 0;
      if (remainingDeathMs > 0) await sleep(remainingDeathMs);
      if (!current()) return;

      await showTurnNotice(
        session.battle.state.phase === 'opening' ? '准备结束' : '回合结束',
        subtitle,
        440,
      );
      if (!current()) return;
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
      const drops = claimEnemyDrops(
        session.ai.library,
        session.journey.expedition,
        session.battle.state,
        result,
      );
      if (drops.length) {
        const receipt = `击杀掉落 · ${drops.join('、')}`;
        session.battle.history.push(receipt);
        context.shell?.toast(receipt);
      }
      context.companionEvents?.accepted(session.battle.state, result);
      const cooperation = claimCooperationAffection(
        session.ai.library,
        session.journey.expedition,
        result,
      );
      if (cooperation?.delta)
        context.shell?.toast(`合作击破 · ${cooperation.name}好感 +${cooperation.delta}`);
      context.emblems?.accepted(result);
      session.battle.state = advance(result);
      if (!['victory', 'defeat'].includes(session.battle.state.phase)) {
        const award = grantMidBattleOverlordEmblem(
          session.ai.library,
          session.battle.state,
          session.journey.expedition,
        );
        if (award) context.emblems?.queueRingAward(award.id, award.recipient?.actor);
      }
      session.ai.library.discoveredWeaknesses = mergeRevealedWeaknessMap(
        session.ai.library.discoveredWeaknesses,
        session.battle.state.revealedWeaknesses,
      );
      if (drops.length)
        session.battle.state.items = structuredClone(session.ai.library.inventory.items);
      session.battle.plan = [];
      context.selection.clearSelection(true);
      context.planning.recompute();
      context.renderer.render();
      context.onboarding?.roundFinished(wasOpening, result);
      if (session.battle.state.phase === 'victory' || session.battle.state.phase === 'defeat') {
        context.overlordBattle?.disarmBombTimer?.();
        context.overlordBattle?.clearSeal?.();
      } else {
        context.overlordBattle?.sync?.();
        context.overlordBattle?.checkMechanicTutorial?.(result, session.battle.state);
      }
    } finally {
      if (current()) {
        session.battle.display = null;
        session.battle.playing = false;
        session.battle.activeCell = -1;
        context.renderer.render();
        context.emblems?.check();
        context.ledger?.sync();
      }
    }
    if (!current()) return;
    context.generation.save();
    if (['victory', 'defeat'].includes(session.battle.state.phase)) {
      void context.journey.showResult().catch((error) => {
        context.developer?.report(error);
        console.error(error);
      });
    }
  }
  return { showTurnNotice, commit };
}
