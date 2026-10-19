import { restoreLibrary } from '../ai/library.js';
import { claimCompletionExperience, applyEncounterGrowth, GROWTH_LABELS } from '../growth.js';
import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from '../content/journey-rules.js';
import { html } from '../shared/html.js';
import { HEROES, BOSSES } from '../data.js';
import { escapeText } from '../ui.js';
import { preview, getEnemies } from '../engine.js';
import {
  newExpedition,
  beginEncounter,
  completeEncounter,
  currentEncounterSpec,
} from '../expedition.js';
import { REGIONS } from '../content/regions.js';
import { createBattleView } from '../scene.js';
import { roundBanner } from '../motion.js';
import { query as $ } from './dom.js';
import { portraitUrl } from '../catalog.js';
import { encounterMusic } from '../audio/config.js';
import { claimBattleRewards } from '../rewards.js';
import { dungeonLoot, settleEther } from '../archives.js';
import { resetRelationshipGains } from '../relationships.js';
import { recordSettlement } from '../companion-events.js';
import { developerOption } from '../generation-options.js';

/** @param {import('./context.js').AppContext} context */
export function createJourney(context) {
  const { session } = context;
  async function startBattle(continuing = false) {
    if (session.runtime.disposed || session.runtime.mode === 'loading' || session.battle.playing)
      return;
    if (session.runtime.needsStart) return context.onboarding.open();
    if (!continuing && context.onboarding && !context.onboarding.allowPortal('script')) return;
    if (session.ai.library.campaign && !continuing && !session.ai.library.prepared) {
      context.destinations.open();
      return;
    }
    const newTrip = !continuing || !session.journey.expedition;
    session.runtime.mode = 'loading';
    context.generation.refreshReview();
    if (newTrip) {
      try {
        const roster = await context.generation.prepare();
        resetRelationshipGains(session.ai.library);
        context.chat?.enteredDungeon();
        context.onboarding?.tripStarted();
        if (session.runtime.disposed) return;
        session.journey.expedition = newExpedition(
          session.journey.bossChoice,
          roster,
          session.journey.selectedNode,
        );
      } catch (failure) {
        session.runtime.mode = 'inn';
        context.shell.toast('剧本准备失败：' + failure.message);
        void context.generation.open('剧本准备失败：' + failure.message);
        return;
      }
    }
    session.journey.expedition.partyIds ||= [...session.ai.library.party];
    document.body.classList.add('in-battle');
    if (continuing) applyEncounterGrowth(session.journey.expedition, session.ai.library.characters);
    session.battle.state = beginEncounter(session.journey.expedition);
    session.battle.state.items = structuredClone(session.ai.library.inventory.items);
    session.battle.plan = [];
    session.battle.forecast = preview(session.battle.state, session.battle.plan);
    session.selection.selected = session.ai.library.campaign
      ? session.battle.state.formation.find(Boolean)
      : 'morrow';
    session.selection.target = getEnemies(session.battle.state)[0].id;
    session.selection.pending = null;
    session.battle.history = [];
    session.battle.display = null;
    session.battle.activeCell = -1;
    session.selection.selectedCell = -1;
    session.selection.interactionStep = null;
    session.selection.inspectedEnemy = null;
    await mountEncounter();
  }
  async function mountEncounter(resuming = false) {
    $('#drag-menu').hidden = true;
    $('#speed').hidden = false;
    $('#inn').hidden = true;
    $('#battle').hidden = false;
    $('#party-toggle').hidden = true;
    $('#ai-open').hidden = true;
    $('#back-inn').hidden = !developerOption(session.ai.generationOptions, 'allowRetreat');
    const spec = currentEncounterSpec(session.journey.expedition, session.battle.state.encounter);
    $('#mode-label').textContent = session.journey.expedition.exploration
      ? `${REGIONS[spec.map].name} · 第 ${session.battle.state.encounter + 1}/${ENCOUNTER_COUNT} 战 · ${spec.name}`
      : `第 ${session.battle.state.encounter + 1}/${ENCOUNTER_COUNT} 战 · ${spec.name}`;
    $('#scene-loading').hidden = false;
    $('#scene-loading').textContent = `正在进入${spec.name}…`;
    $('#inn-frame').replaceChildren();
    session.runtime.view?.dispose();
    const load = ++session.runtime.token;
    context.renderer.render();
    try {
      const loaded = await createBattleView($('#stage'), context.selection.selectUnit, {
        map: session.battle.state.map,
        enemyIds: session.battle.state.enemyIds,
        formation: session.battle.state.formation,
        heroDefinitions: session.battle.state.heroDefinitions,
      });
      if (load !== session.runtime.token) {
        loaded.dispose();
        return;
      }
      session.runtime.view = loaded;
      session.runtime.mode = 'battle';
      context.generation.refreshReview();
      context.audio.setScene(encounterMusic(spec));
      $('#scene-loading').hidden = true;
      $('#battle').classList.add('entering');
      setTimeout(() => $('#battle').classList.remove('entering'), 700);
      context.renderer.render();
      if (resuming) {
        context.generation.refreshStory();
        context.onboarding?.resumed();
        return;
      }
      await context.generation.showScene(session.battle.state.encounter, 'before');
      if (!(
        session.journey.expedition.exploration?.tutorial && session.battle.state.encounter === 0
      )) {
        context.generation.openStory(true);
        await context.generation.storyClosed();
      }
      if (load !== session.runtime.token || session.runtime.disposed) return;
      context.onboarding?.battleStarted();
      context.companionEvents?.battleStarted();
      roundBanner(spec.boss ? `最终战 · ${spec.name}` : '先手准备 · 1 AP');
    } catch (e) {
      $('#scene-loading').textContent = '场景载入失败：' + e.message;
      console.error(e);
    }
  }
  async function resume(snapshot) {
    session.ai.library = restoreLibrary(snapshot.library);
    session.battle.state = snapshot.state;
    session.battle.plan = snapshot.plan || [];
    session.battle.history = snapshot.history || [];
    session.battle.forecast = preview(snapshot.state, session.battle.plan);
    if (!session.battle.forecast.valid) {
      session.battle.plan = [];
      session.battle.forecast = preview(snapshot.state, []);
    }
    session.journey = snapshot.journey;
    session.ai.activeScript = snapshot.activeScript;
    session.ai.storyView = snapshot.storyView;
    session.ai.chat.quick = snapshot.quick || [];
    session.selection.selected = snapshot.state.formation.find(Boolean);
    session.selection.target = getEnemies(snapshot.state)[0]?.id;
    session.runtime.mode = 'loading';
    document.body.classList.add('in-battle');
    await mountEncounter(true);
    context.generation.save();
  }
  function returnInn() {
    if (session.battle.playing) return;
    const settled =
      ['victory', 'defeat'].includes(session.battle.state.phase) &&
      (session.journey.expedition?.status === 'complete' ||
        session.battle.state.phase === 'defeat');
    if (
      session.runtime.mode === 'battle' &&
      !settled &&
      !developerOption(session.ai.generationOptions, 'allowRetreat')
    ) {
      context.shell.toast('副本进行中，完成结算后才能返回酒馆。');
      return;
    }
    if (
      session.runtime.mode === 'battle' &&
      context.onboarding &&
      !context.onboarding.allowReturn()
    )
      return;
    if (session.runtime.mode === 'battle' && session.ai.activeScript) {
      session.ai.library.tavernChat.push({
        id: crypto.randomUUID(),
        role: 'system',
        divider: true,
        content: '从《' + session.ai.activeScript.title + '》副本回来。',
      });
      context.generation.save();
    }
    context.backpack?.close();
    context.companionEvents?.leave();
    context.chat?.leave();
    context.generation.cancelScene();
    session.runtime.token++;
    session.runtime.view?.dispose();
    session.runtime.view = null;
    session.runtime.mode = 'inn';
    session.journey.selectedNode = null;
    context.generation.setSummonVisible(false);
    context.audio.setScene('inn');
    document.body.classList.remove('in-battle');
    $('#speed').hidden = true;
    $('#drag-menu').hidden = true;
    session.selection.interactionStep = null;
    session.selection.selectedCell = -1;
    $('#result').open && $('#result').close();
    $('#battle').hidden = true;
    $('#inn').hidden = false;
    $('#party-toggle').hidden = false;
    $('#ai-open').hidden = false;
    $('#back-inn').hidden = true;
    $('#mode-label').textContent = '';
    context.shell.mountInn();
    context.onboarding?.refresh();
    context.companionEvents?.returned();
  }
  async function showResult() {
    if (session.battle.state.phase === 'victory')
      await context.generation.showScene(session.battle.state.encounter, 'after');
    if (
      session.battle.state.phase === 'victory' &&
      session.battle.state.encounter === FINAL_ENCOUNTER
    ) {
      context.generation.openStory(true);
      await context.generation.storyClosed();
    }
    if (session.runtime.disposed || session.runtime.mode !== 'battle') return;
    const won = session.battle.state.phase === 'victory',
      spec = currentEncounterSpec(session.journey.expedition, session.battle.state.encounter),
      next = won ? completeEncounter(session.journey.expedition, session.battle.state) : null,
      complete = next?.complete;
    if (next) {
      claimBattleRewards(session.ai.library, next.rewardId, next.rewards);
      context.generation.save();
    }
    const explored = session.journey.expedition.exploration;
    const runId = session.ai.activeScript?.runId;
    if (
      complete &&
      runId &&
      session.ai.library.campaign &&
      !session.ai.library.campaign.completed &&
      !dungeonLoot(session.ai.library, runId).some((item) => item.value > 0)
    ) {
      session.ai.library.archives.items.push({
        id: `tutorial-ether-${runId}`,
        name: '守门者残晶',
        map: spec.map,
        description: '遗迹守门者留下的晶体',
        value: 10,
        source: {
          runId,
          scriptId: session.ai.activeScript.id,
          title: session.ai.activeScript.title,
          encounter: FINAL_ENCOUNTER,
          map: spec.map,
        },
        converted: false,
      });
    }
    if ((complete || !won) && runId && !(await context.lootConflicts.resolve(runId))) return;
    const levelUps = complete
      ? claimCompletionExperience(session.ai.library, session.journey.expedition)
      : [];
    const gainedLevels = [...(session.journey.expedition.levelUps || []), ...levelUps].filter(
      (gain) => gain.levels.length,
    );
    const loot = runId ? dungeonLoot(session.ai.library, runId) : [];
    const ether = complete && runId ? settleEther(session.ai.library, runId) : 0;
    if (complete) {
      recordSettlement(session.ai.library, runId || session.journey.expedition.id);
      context.generation.save();
    }
    const successor =
      won && complete && explored ? context.generation.explorationWon(explored) : null;
    context.audio.play(won ? 'victory' : 'defeat');
    $('#result').innerHTML = html`<span class="eyebrow"
        >${complete ? 'EXPEDITION / COMPLETE' : won ? 'ENCOUNTER / CAMPFIRE' : 'EXPEDITION / DEFEAT'}</span
      >
      <div class="result-icon">${won ? '◇' : '×'}</div>
      <h2>
        ${explored && complete ? '五场完成 · 探索归来' : complete ? '封印已解 · 副本通关' : won ? `${spec.name}已清理` : '全队濒死'}
      </h2>
      <p>
        ${explored && complete ? (session.ai.library.exploration[spec.map].frontier.length ? `已开放${escapeText(REGIONS[spec.map].name)}的后续副本。返回酒馆后可继续选择。` : `${escapeText(REGIONS[spec.map].name)}的六处副本已全部完成。返回酒馆后可选择其他地图。`) : complete ? `五场战斗与${spec.name}最终战全部完成。` : won ? '营火恢复生命与濒死伙伴，蓝量保留剩余值。' : '本地点仍保留，失败不会推进路线。'}<br />${complete ? `总共 ${session.journey.expedition.records.reduce((n, r) => n + r.rounds, 0)} 回合` : `本场 ${Math.max(1, session.battle.state.round)} 回合`}${next && !complete ? ` · 下一战：${next.next.name}` : ''}
      </p>
      <section class="battle-rewards" aria-label="本场获得">
        ${
          complete
            ? html`<div class="ether-reward">
                <strong>物资折算 · 以太 +${ether}</strong>
                <p>
                  ${loot.map((item) => `${escapeText(item.name)}：${item.value}以太`).join(' · ') || '本趟没有收集物资'}
                </p>
                <small
                  >所有副本收获折算为以太，可在酒馆兑换。持有 ${session.ai.library.inventory.ether}
                  以太</small
                >
              </div>`
            : ''
        }
        <small>本场获得</small>
        ${
          next?.rewards.summonContracts
            ? html`<div class="contract-reward">
                <span aria-hidden="true">✦</span
                ><strong>召唤契约 × ${next.rewards.summonContracts}</strong>
                <p>在酒馆的召唤之门使用</p>
              </div>`
            : '<p class="reward-empty">本场无掉落 · 副本通关可获得召唤契约</p>'
        }
        <p>
          金币 + ${next?.rewards.gold || 0} · 持有金币：${session.ai.library.inventory?.gold || 0}
        </p>
        <p>持有召唤契约：${session.ai.library.inventory?.summonContracts || 0}</p>
      </section>
      <div class="level-rewards">
        ${gainedLevels.map((gain) => html`<p>${escapeText(gain.name)} · Lv.${gain.level} ${gain.levels.flatMap((level) => Object.entries(level.gains).map(([key, n]) => GROWTH_LABELS[key] + '+' + n)).join('、') || '本次没有属性增长'}</p>`).join('')}
      </div>
      <div class="result-party">
        ${HEROES.filter((slot) => session.battle.state.units[slot.id])
          .map((slot) => {
            const h = context.roster.get(slot.id);
            const change = next?.changes.find((c) => c.id === h.id);
            return html`<div>
              <img src="${portraitUrl(h)}" alt="${h.name}" /><small
                >${h.name}<br />${session.battle.state.units[h.id].hp}${change ? ` → ${change.after}` : ''}/${h.hp}<br />蓝
                ${session.battle.state.units[h.id].mp}</small
              >
            </div>`;
          })
          .join('')}
      </div>
      ${successor?.continuation ? html`<div class="journey-summary">后续线索：${escapeText(successor.continuation)}</div>` : complete && !explored ? html`<div class="journey-summary">${session.journey.expedition.records.map((r) => html`<span>${r.index + 1}. ${r.name} · ${r.rounds}回合</span>`).join('')}</div>` : ''}
      <div class="result-buttons">
        ${session.ai.activeScript ? '<button id="result-journal">路途手记</button>' : ''}
        ${won && !complete ? '<button id="continue" class="primary">继续深入 · 下一战</button>' : explored ? '' : '<button id="retry" class="primary">' + (complete ? '挑战另一位 Boss' : '重新出发') + '</button>'}<button
          id="result-back"
          ${won && !complete && !developerOption(session.ai.generationOptions, 'allowRetreat') ? 'hidden' : ''}
        >
          返回酒馆
        </button>
      </div>`;
    $('#result-back').onclick = returnInn;
    const journal = $('#result-journal');
    if (journal) journal.onclick = context.generation.openStory;
    const onward = $('#continue');
    if (onward)
      onward.onclick = () => {
        $('#result').close();
        context.generation.showScene(session.battle.state.encounter, 'interlude');
        startBattle(true);
      };
    const retry = $('#retry');
    if (retry)
      retry.onclick = () => {
        $('#result').close();
        if (complete)
          session.journey.bossChoice =
            BOSSES[
              (BOSSES.findIndex((boss) => boss.id === session.journey.expedition.boss) + 1) %
                BOSSES.length
            ].id;
        returnInn();
        void context.generation.portal('script');
      };
    $('#result').showModal();
    context.onboarding?.battleWon(won && complete);
  }
  return { startBattle, returnInn, showResult, resume };
}
