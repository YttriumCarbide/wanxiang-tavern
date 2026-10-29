import { resourceText } from '../resource-text.js';
import { ADVENTURE_NODE_LABELS } from '../adventure/definition.js';
import { rearUnlocked } from '../formation-access.js';
import { emblemRing } from '../emblems.js';
import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from '../content/journey-rules.js';
import { html } from '../shared/html.js';
import { ENCOUNTERS } from '../data.js';
import { currentEncounterSpec } from '../expedition.js';
import { captureLayout, unitOrigins, animateLayout } from '../motion.js';
import { resourceBars, statusIcons, escapeText } from '../ui.js';
import { query as $ } from './dom.js';
import { portraitUrl } from '../catalog.js';

/** @param {import('./context.js').AppContext} context */
export function createRenderer(context) {
  const { session } = context;
  function renderRear(s) {
    const unlocked = rearUnlocked(session.ai.library);
    $('.rear-panel').hidden = !unlocked;
    if (!unlocked) {
      $('#rear-cards').replaceChildren();
      return;
    }
    const ids = (
      session.battle.playing ? s.formation : session.battle.forecast.final.formation
    ).slice(3);
    $('#rear-cards').innerHTML = ids
      .map((id, index) => {
        if (!id)
          return html`<button
            class="rear-card rear-empty"
            data-empty-slot="${index + 3}"
            aria-label="后场空位${index + 1}"
          >
            <span>＋</span><small>后场</small>
          </button>`;
        const d = context.roster.get(id),
          u = s.units?.[id],
          f = session.battle.forecast?.final?.units?.[id] || u;
        if (!d || !u) return '';
        const ready = Boolean(
          u.entryReady && (d.entrySkill || d.combat?.entrySkill || d.setting?.entrySkill),
        );
        return html`<button
          class="rear-card ${session.selection.selected === id ? 'selected' : ''} ${u.hp === 0 ? 'fallen' : ''} ${ready ? 'entry-ready' : ''}"
          style="--unit:${d.color || '#9e9e9e'}"
          data-dragunit="${id}"
          data-rear="${id}"
          aria-label="${escapeText(d.name)}，后场角色${ready ? '，入场技就绪' : ''}"
          ${session.battle.playing ? 'disabled' : ''}
        >
          <img src="${portraitUrl(d)}" alt="" /><svg
            class="selection-frame"
            viewBox="0 0 100 140"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <rect
              x="1"
              y="1"
              width="98"
              height="138"
              rx="2"
              vector-effect="non-scaling-stroke"
            /></svg
          ><span class="card-buffs"
            >${statusIcons(s, id, session.battle.forecast.final, session.battle.playing ? [] : session.battle.forecast.events)}</span
          ><strong class="rear-name">${escapeText(d.name)}</strong>
          ${ready ? html`<span class="entry-tag" title="${escapeText(resourceText(d.entrySkill?.name ? `入场技【${d.entrySkill.name}】就绪：${d.entrySkill.text || ''}` : '入场技就绪'))}">入场</span>` : ''}
          <div class="rear-resources">${resourceBars(u, f)}</div>
          ${emblemRing(d, u, false, session.battle.playing ? u : f)}
        </button>`;
      })
      .join('');
    $('#rear-cards')
      .querySelectorAll('[data-rear]')
      .forEach(
        (b) =>
          (b.onclick = () => {
            if (!session.runtime.drag?.moved) context.selection.selectHero(b.dataset.rear);
          }),
      );
  }
  function render(options = {}) {
    if (session.runtime.disposed || ['inn', 'event'].includes(session.runtime.mode)) return;
    const emblemState = session.battle.playing
      ? session.battle.display || session.battle.state
      : session.battle.forecast?.final || session.battle.state;
    const selectedUnit =
      session.selection.selected && emblemState?.units
        ? emblemState.units[session.selection.selected]
        : null;
    const emblemActive = !!selectedUnit && (selectedUnit.combined || 0) > 0;
    $('#battle').classList.toggle('emblem-active', emblemActive);
    $('#emblem-screen')?.classList.toggle('active', emblemActive);
    const layout = captureLayout(),
      s = session.battle.display || session.battle.state;
    $('#encounter-label').textContent =
      `${session.battle.state.encounter + 1}/${ENCOUNTER_COUNT} · ${currentEncounterSpec(session.journey.expedition).name}`;
    $('#journey-progress').innerHTML = ENCOUNTERS.map(
      (r, i) =>
        html`<i
          class="${i < session.battle.state.encounter ? 'done' : i === session.battle.state.encounter ? 'current' : ''}"
          title="${session.journey.expedition.adventure ? ADVENTURE_NODE_LABELS[i] : currentEncounterSpec(session.journey.expedition, i).name}"
          >${i === FINAL_ENCOUNTER ? '◆' : session.journey.expedition.adventure && [1, 3].includes(i) ? '◇' : i + 1}</i
        >`,
    ).join('');
    $('#round-label').textContent =
      session.battle.state.phase === 'opening'
        ? '第 1 回合'
        : `第 ${session.battle.state.round} 回合`;
    $('#stage-note').textContent = session.battle.playing
      ? '正在执行时间轴'
      : '敌人攻击位置 · 实时预演';
    context.details.renderDetails(s);
    context.timeline.renderTimeline();
    renderRear(s);
    $('#combat-log').innerHTML =
      session.battle.history
        .slice(-35)
        .reverse()
        .map((t) => html`<p>${t}</p>`)
        .join('') || '<p>选角色、技能和目标，再放进左侧时间轴。</p>';
    session.runtime.view?.setSpeed(session.battle.speed);
    session.runtime.view?.draw(
      s,
      session.battle.forecast,
      session.selection.selected,
      session.selection.target,
      session.battle.playing,
      unitOrigins(layout),
    );
    if (options.animate !== false) animateLayout(layout, context.roster.all());
    context.selection.refreshInteraction();
    context.backpack?.render();
    context.battleReading?.render();
    context.checkpoint?.schedule();
  }
  return { renderRear, render };
}
