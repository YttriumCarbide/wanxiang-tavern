import { ITEMS } from '../content/items.js';
import { html } from '../shared/html.js';
import { parseTimelineDrop } from './drag-payload.js';
import { intent, enemyTimeline } from '../engine.js';
import { escapeText } from '../ui.js';
import { query as $ } from './dom.js';

/** @param {import('./context.js').AppContext} context */
export function createTimeline(context) {
  const { session } = context;
  function renderTimeline() {
    const n = session.battle.forecast.slots.length,
      timeline = $('#timeline'),
      opening = session.battle.state.phase === 'opening',
      mobile = context.viewport.compactHUD();
    const gap = 8,
      nextState = { ...session.battle.forecast.final, phase: 'plan', round: 1 },
      nextSlots = opening ? enemyTimeline(nextState) : [],
      row = context.viewport.compactLandscape() ? 62 : mobile ? 74 : 92,
      previewRow = context.viewport.compactLandscape() ? 62 : mobile ? 74 : 92;
    const used = session.battle.plan.reduce((n, a) => n + a.ap, 0),
      ap = opening ? 1 : 3;
    timeline.classList.toggle('opening-timeline', opening);
    timeline.style.gridTemplateColumns = `repeat(${n},1fr)`;
    timeline.style.gridTemplateRows = `${row}px`;
    timeline.style.setProperty('--timeline-height', `${row}px`);
    timeline.style.setProperty('--slots', n);
    timeline.style.width = opening ? 'var(--opening-width)' : '100%';
    timeline.parentElement.style.setProperty(
      '--opening-width',
      `calc((100% - ${nextSlots.length * gap}px)/${nextSlots.length + 1})`,
    );
    $('#timeline-title').textContent = '时间轴';
    $('#ap-label').textContent = String(Math.max(0, ap - used));
    $('#ap-orb').style.setProperty('--ap-fraction', Math.max(0, ap - used) / ap);
    const cell = (id, i, readOnly = false, s = session.battle.state) => {
      const cancelled =
          !readOnly && id && session.battle.forecast.deaths.some((d) => d.id === id && d.at < i),
        move = id ? intent(s, id) : null;
      return html`<button
        class="time-cell ${id ? 'enemy-cell' : ''} ${cancelled ? 'cancelled' : ''} ${!readOnly && (session.battle.activeCell === i || (!session.battle.playing && session.selection.selectedCell === i)) ? 'playing' : ''} ${readOnly ? 'preview-cell' : ''} ${readOnly && id && id === session.selection.inspectedEnemy ? 'playing' : ''}"
        ${readOnly ? `data-preview="${i}"` : `data-start="${i}" data-motion="${id ? `enemy-${id}` : `empty-${i}`}"`}
        ${session.battle.playing || (readOnly && !id) ? 'disabled' : ''}
        ${id ? `data-tooltip="${escapeText(`${context.roster.get(id).name} · 速度 ${Math.max(1, context.roster.get(id).speed - (s.units[id].buffs.slow || 0))}\n${move.name}：${move.text}`)}"` : ''}
      >
        <span class="num">${opening && !readOnly ? '◇' : i + 1}</span
        ><span class="cell-label"
          >${id ? `${cancelled ? '× ' : ''}${context.roster.get(id).name}` : opening && !readOnly ? '先手' : readOnly ? '我方行动' : '＋'}${id ? html`<small>速度 ${Math.max(1, context.roster.get(id).speed - (s.units[id].buffs.slow || 0))}</small>` : ''}</span
        >
      </button>`;
    };
    timeline.innerHTML = session.battle.forecast.slots.map((id, i) => cell(id, i)).join('');
    for (const a of session.battle.plan) {
      const bad = session.battle.forecast.invalid.find((x) => x.id === a.id),
        skip = session.battle.forecast.skipped.find((x) => x.id === a.id),
        el = document.createElement('div');
      el.className =
        'time-action' +
        (bad ? ' invalid' : '') +
        (skip ? ' skipped' : '') +
        (session.battle.activeCell === a.start ? ' playing' : '');
      el.style.top = '0px';
      el.style.height = `${row}px`;
      el.style.left = `calc(${(a.start / n) * 100}% + ${(a.start / n) * gap}px)`;
      el.style.right = 'auto';
      el.style.width = `calc(${(a.ap / n) * 100}% + ${(a.ap / n) * gap - gap}px)`;
      el.dataset.motion = `action-${a.id}`;
      el.draggable = !session.battle.playing;
      el.dataset.action = a.id;
      el.dataset.startAction = a.start;
      el.setAttribute(
        'data-tooltip',
        bad?.message ||
          skip?.message ||
          `${context.planning.actionLabel(a)} · ${a.ap} AP\n拖动调整顺序`,
      );
      el.innerHTML = html`<span class="action-number">${opening ? '◇' : a.start + 1}</span>
        <div>
          <b
            >${skip ? '× ' : bad ? '! ' : ''}${a.kind === 'item' ? ITEMS[a.item].name : a.kind === 'skill' ? context.roster.ability(a.actor, a.skill).name : a.kind === 'engage' ? `结合${a.followUp ? ' · ' + context.roster.ability(a.actor, a.followUp.skill).name : ''}` : a.kind === 'swap' ? (session.battle.state.units[a.incoming]?.entryReady && context.roster.get(a.incoming)?.entrySkill?.name ? `换入 · ${context.roster.get(a.incoming).entrySkill.name}` : '换入') : '交换'}</b
          ><small
            >${a.kind === 'item' ? context.roster.get(a.target).name : ['skill', 'engage'].includes(a.kind) ? context.roster.get(a.actor).name : a.kind === 'swap' ? context.roster.get(a.incoming).name : '阵型'}
            · ${a.ap} AP</small
          >
        </div>
        <button
          class="remove"
          data-remove="${a.id}"
          aria-label="删除${context.planning.actionLabel(a)}"
          ${session.battle.playing ? 'disabled' : ''}
        >
          ×
        </button>`;
      el.onclick = (e) => {
        if (e.target.closest('[data-remove]')) return;
        context.selection.clearSelection();
        if (a.kind === 'engage') {
          session.selection.selected = a.actor;
          session.selection.selectedCell = a.start;
          session.selection.interactionStep = 'skill';
        }
        context.renderer.render();
      };
      el.ondragstart = (e) =>
        e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'move', id: a.id }));
      timeline.append(el);
    }
    for (const d of session.battle.forecast.deaths) {
      const el = document.createElement('span');
      el.className = 'death-marker';
      el.style.top = `${row - 2}px`;
      el.style.left = `${(Math.min(n, d.at + 1) / n) * 100}%`;
      el.textContent = `${context.roster.get(d.id).name} ×`;
      timeline.append(el);
    }
    const next = $('#opening-preview');
    next.hidden = !opening;
    if (opening) {
      next.innerHTML = html`<div class="next-round-label">第 1 回合 · 敌方速度预览</div>
        <div
          class="preview-grid"
          style="grid-template-columns:repeat(${nextSlots.length},1fr);grid-template-rows:${previewRow}px"
        >
          ${nextSlots.map((id, i) => cell(id, i, true, nextState)).join('')}
        </div>`;
    }
    timeline
      .querySelectorAll('[data-start]')
      .forEach((b) => (b.onclick = () => context.selection.chooseCell(Number(b.dataset.start))));
    next.querySelectorAll('[data-preview]').forEach(
      (b) =>
        (b.onclick = () => {
          const nextState = { ...session.battle.forecast.final, phase: 'plan', round: 1 },
            id = enemyTimeline(nextState)[Number(b.dataset.preview)];
          if (id) context.selection.inspectEnemy(id, true);
          else context.shell.toast('结算先手后可编排第一回合。');
        }),
    );
    const dropIndex = (e) =>
      Math.max(
        0,
        Math.min(
          n - 1,
          Math.floor(
            (e.clientX - timeline.getBoundingClientRect().left) /
              ((timeline.clientWidth + gap) / n),
          ),
        ),
      );
    timeline.ondragover = (e) => {
      if (!context.viewport.canPlan()) return;
      e.preventDefault();
      timeline.querySelectorAll('.target-cell').forEach((b) => b.classList.remove('target-cell'));
      timeline.querySelector(`[data-start="${dropIndex(e)}"]`)?.classList.add('target-cell');
    };
    timeline.ondragleave = () =>
      timeline.querySelectorAll('.target-cell').forEach((b) => b.classList.remove('target-cell'));
    timeline.ondrop = (e) => {
      e.preventDefault();
      if (!context.viewport.canPlan()) return;
      const payload = parseTimelineDrop(
        e.dataTransfer.getData('application/json'),
        context.roster.all(),
      );
      if (!payload) return;
      const start = dropIndex(e);
      if (payload.kind === 'move') {
        context.planning.moveAction(payload.id, start);
        return;
      }
      const skill = context.roster.ability(payload.actor, payload.skill);
      session.selection.pending = { ...payload, target: undefined };
      session.selection.selectedCell = start;
      session.selection.interactionStep = 'target';
      if (['self', 'allAllies', 'allEnemies'].includes(skill.target)) {
        session.selection.pending.target = payload.actor;
        context.planning.put(start);
      } else context.renderer.render();
    };
    timeline.querySelectorAll('[data-remove]').forEach(
      (b) =>
        (b.onclick = (e) => {
          e.stopPropagation();
          context.planning.removeAction(b.dataset.remove);
        }),
    );
    const note = $('#forecast-note');
    note.className = session.battle.forecast.valid ? '' : 'error';
    note.textContent = session.battle.forecast.invalid.length
      ? session.battle.forecast.invalid.map((x) => x.message).join('；')
      : '';
    $('#commit').disabled =
      session.battle.playing ||
      session.runtime.mode === 'loading' ||
      !session.battle.forecast.valid ||
      ['victory', 'defeat'].includes(session.battle.state.phase);
    $('#commit').textContent = session.battle.playing
      ? '结算中…'
      : ['victory', 'defeat'].includes(session.battle.state.phase)
        ? '战斗结束'
        : !session.battle.forecast.valid
          ? '修正冲突'
          : opening
            ? '结算先手'
            : '确认结算';
    $('#clear').disabled = session.battle.playing || !session.battle.plan.length;
  }
  return { renderTimeline };
}
