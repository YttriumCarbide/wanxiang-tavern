import { EMBLEMS } from '../emblems.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';
import { query as $ } from './dom.js';

/** @param {import('./context.js').AppContext} context */
export function createDrag(context) {
  const { session } = context;
  function showDropMenu(actor, targetId, side, x, y) {
    session.selection.selected = actor;
    session.selection.pending = null;
    session.selection.interactionStep = null;
    session.selection.inspectedEnemy = null;
    session.selection.target = targetId;
    if (context.viewport.compactHUD()) $('#details').classList.remove('mobile-open');
    if (x == null || y == null) {
      const card = [...document.querySelectorAll('[data-unit]')].find(
        (element) => element.dataset.unit === targetId,
      );
      const rect = card?.getBoundingClientRect();
      x = rect ? rect.left + rect.width / 2 : innerWidth / 2;
      y = rect ? rect.top + rect.height / 2 : innerHeight / 2;
    }
    const d = context.roster.get(actor),
      u = session.battle.forecast?.final?.units?.[actor];
    if (!d || !u) return;
    const emblemSkill = EMBLEMS[d.emblemId]?.skill,
      activeEmblemSkill = u.combined && !u.combineSkillUsed && emblemSkill ? [emblemSkill] : [],
      skills = [
        context.roster.ability(actor, 'attack'),
        ...(d.skills || []).filter((a) => !a.passive),
        ...activeEmblemSkill,
      ].filter((a) =>
        side === 'Enemy'
          ? ['enemy', 'allEnemies'].includes(a.target)
          : ['ally', 'self', 'allAllies'].includes(a.target),
      );
    const menu = $('#drag-menu');
    menu.innerHTML = html`<span>${d.name} → ${context.roster.get(targetId).name}</span
      >${side === 'Friendly' ? '<button data-drop-swap>交换 · 1 AP</button>' : ''}${skills
        .map((a) => {
          const unavailable =
            u.mp < a.mp ||
            (a.hp && u.hp <= a.hp) ||
            u.used >= d.limit ||
            !context.planning.fitsAt(context.planning.preferredStart(a.ap), a.ap);
          return html`<button
            data-drop-skill="${a.id}"
            ${unavailable ? 'disabled' : ''}
            data-tooltip="${escapeText(`${a.text || `造成${d.attack}伤害`}\n${a.ap} AP · ${a.mp} 蓝量${a.hp ? ` · ${a.hp} 生命` : ''}`)}"
          >
            ${a.name}<small
              >${a.ap} AP${a.mp ? ` · ${a.mp} 蓝` : ''}${a.hp ? ` · ${a.hp} 生命` : ''}</small
            >
          </button>`;
        })
        .join('')}`;
    menu.hidden = false;
    menu.style.left = `${Math.max(10, Math.min(innerWidth - menu.offsetWidth - 10, x + 10))}px`;
    menu.style.top = `${Math.max(60, Math.min(innerHeight - menu.offsetHeight - 10, y - 20))}px`;
    menu
      .querySelector('[data-drop-swap]')
      ?.addEventListener('click', () =>
        context.planning.queueSwap(
          actor,
          session.battle.forecast.final.formation.indexOf(targetId),
        ),
      );
    menu
      .querySelectorAll('[data-drop-skill]')
      .forEach(
        (b) =>
          (b.onclick = () =>
            context.planning.queueDirectSkill(actor, b.dataset.dropSkill, targetId)),
      );
    context.renderer.render();
  }
  function prepareDraggedActor(id, start) {
    if (!context.planning.fitsAt(start, 1)) {
      context.shell.toast('请选择一个空的我方时间格。');
      return;
    }
    session.selection.selectedCell = start;
    session.selection.selected = id;
    session.selection.inspectedEnemy = null;
    $('#drag-menu').hidden = true;
    if (session.battle.forecast.final.formation.indexOf(id) < 3) {
      session.selection.interactionStep = 'skill';
      session.selection.pending = null;
    } else {
      session.selection.interactionStep = 'swap';
      session.selection.pending = { kind: 'swap', incoming: id, start };
    }
    if (session.selection.interactionStep === 'swap' && context.viewport.compactHUD())
      $('#details').classList.remove('mobile-open');
    else context.viewport.openCharacterHUD();
    context.renderer.render();
  }
  function clearDropHighlights() {
    document
      .querySelectorAll('.drop-target,.card-slot-drop,.blocked-card-drop,.drop-incoming')
      .forEach((el) =>
        el.classList.remove('drop-target', 'card-slot-drop', 'blocked-card-drop', 'drop-incoming'),
      );
    document.body.classList.remove('drag-from-reserve');
  }
  function finishDrag(e, cancel = false) {
    if (!session.runtime.drag || session.runtime.drag.finished) return;
    const current = session.runtime.drag;
    if (current.moved) {
      current.finished = true;
      const hit = !cancel ? document.elementFromPoint(e.clientX, e.clientY) : null,
        drop = hit?.closest('[data-unit],[data-rear],[data-empty-slot]'),
        slotDrop = hit?.closest('[data-start]'),
        targetId = drop?.dataset?.unit || drop?.dataset?.rear,
        formation = session.battle.forecast.final.formation,
        from = formation.indexOf(current.id),
        to = formation.indexOf(targetId);
      session.runtime.view?.endDrag();
      session.runtime.view?.cancelReleasedDrag(current.id);
      current.source.classList.remove('is-drag-source');
      document.body.classList.remove('is-dragging');
      clearDropHighlights();
      if (drop?.hasAttribute('data-empty-slot'))
        context.planning.queueSwap(current.id, Number(drop.dataset.emptySlot));
      else if (slotDrop) prepareDraggedActor(current.id, Number(slotDrop.dataset.start));
      else if (targetId && targetId !== current.id) {
        if (from >= 3 && to >= 0 && to < 3) context.planning.queueSwap(current.id, to);
        else if (from < 3 && to >= 3) context.planning.queueSwap(targetId, from);
        else if (from < 3 && to >= 0 && to < 3)
          showDropMenu(current.id, targetId, 'Friendly', e.clientX, e.clientY);
        else if (from < 3 && drop.dataset.side === 'Enemy')
          showDropMenu(current.id, targetId, 'Enemy', e.clientX, e.clientY);
        else context.shell.toast('备用角色先换入前场。');
      }
      setTimeout(() => {
        if (session.runtime.drag === current) session.runtime.drag = null;
      }, 0);
    } else session.runtime.drag = null;
  }
  return { showDropMenu, prepareDraggedActor, clearDropHighlights, finishDrag };
}
