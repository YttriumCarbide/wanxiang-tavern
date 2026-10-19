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
    const ids = (session.battle.playing ? s.formation : session.battle.forecast.final.formation)
      .slice(3)
      .filter(Boolean);
    $('#rear-cards').innerHTML = ids
      .map((id) => {
        const d = context.roster.get(id),
          u = s.units[id],
          f = session.battle.forecast.final.units[id];
        return html`<button
          class="rear-card ${session.selection.selected === id ? 'selected' : ''} ${u.hp === 0 ? 'fallen' : ''}"
          style="--unit:${d.color}"
          data-dragunit="${id}"
          data-rear="${id}"
          aria-label="${escapeText(d.name)}，后场角色"
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
          <div class="rear-resources">${resourceBars(u, f)}</div>
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
    if (session.runtime.disposed || session.runtime.mode === 'inn') return;
    const layout = captureLayout(),
      s = session.battle.display || session.battle.state;
    $('#encounter-label').textContent =
      `${session.battle.state.encounter + 1}/${ENCOUNTER_COUNT} · ${currentEncounterSpec(session.journey.expedition).name}`;
    $('#journey-progress').innerHTML = ENCOUNTERS.map(
      (r, i) =>
        html`<i
          class="${i < session.battle.state.encounter ? 'done' : i === session.battle.state.encounter ? 'current' : ''}"
          title="${currentEncounterSpec(session.journey.expedition, i).name}"
          >${i === FINAL_ENCOUNTER ? '◆' : i + 1}</i
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
    context.checkpoint?.schedule();
  }
  return { renderRear, render };
}
