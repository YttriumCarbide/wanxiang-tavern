import { ITEMS } from '../content/items.js';
import { preview, makeAction, makeSwap, makeReposition, makeItem } from '../engine.js';
import { reorderPlan } from '../plan-order.js';

/** @param {import('./context.js').AppContext} context */
export function createPlanning(context) {
  const { session } = context;
  function blocked(message) {
    context.audio.play('error');
    return context.shell.toast(message);
  }
  function preferredStart(ap) {
    return session.selection.selectedCell >= 0 &&
      !session.battle.forecast.slots[session.selection.selectedCell]
      ? session.selection.selectedCell
      : fit(ap);
  }
  function fit(ap, exclude) {
    const occupied = new Set();
    for (const a of session.battle.plan) {
      if (a.id === exclude) continue;
      for (let i = a.start; i < a.start + a.ap; i++) occupied.add(i);
    }
    for (let i = 0; i < session.battle.forecast.slots.length; i++) {
      if (i + ap > session.battle.forecast.slots.length) continue;
      let ok = true;
      for (let j = i; j < i + ap; j++)
        if (session.battle.forecast.slots[j] || occupied.has(j)) ok = false;
      if (ok) return i;
    }
    return -1;
  }
  function recompute() {
    session.battle.forecast = preview(session.battle.state, session.battle.plan);
  }
  function fitsAt(start, ap, exclude) {
    if (start < 0 || start + ap > session.battle.forecast.slots.length) return false;
    for (let i = start; i < start + ap; i++) {
      if (session.battle.forecast.slots[i]) return false;
      if (session.battle.plan.some((a) => a.id !== exclude && i >= a.start && i < a.start + a.ap))
        return false;
    }
    return true;
  }
  function put(start) {
    if (!context.viewport.canPlan() || !['skill', 'item'].includes(session.selection.pending?.kind))
      return;
    const a =
      session.selection.pending.kind === 'item'
        ? makeItem(session.selection.pending.item, session.selection.pending.target, start)
        : makeAction(
            session.battle.state,
            session.selection.pending.actor,
            session.selection.pending.skill,
            session.selection.pending.target,
            start,
          );
    if (!fitsAt(start, a.ap))
      return blocked(a.ap === 2 ? '2 AP技能需要两个连续空格。' : '这个时间格已被占据。');
    session.battle.plan.push(a);
    context.audio.play('queue');
    context.selection.clearSelection();
    recompute();
    context.renderer.render();
    context.onboarding?.actionQueued();
    return true;
  }
  function queueSwap(id, slot) {
    if (!context.viewport.canPlan()) return false;
    const start = preferredStart(1);
    if (!fitsAt(start, 1)) return blocked('所选时间格无法交换，请选择空格或取消选择。');
    const formation = session.battle.forecast.final.formation,
      index = formation.indexOf(id);
    if (index === slot) return blocked('角色已经在这个位置。');
    if (session.battle.state.units[id].hp <= 0) return blocked('濒死角色不能换入。');
    session.battle.plan.push(
      index < 3 ? makeReposition(index, slot, start) : makeSwap(id, slot, start),
    );
    context.audio.play('queue');
    context.selection.clearSelection();
    recompute();
    context.renderer.render();
    context.onboarding?.actionQueued();
    return true;
  }
  function queueDirectSkill(actor, skill, targetId) {
    if (!context.viewport.canPlan()) return;
    const a = context.roster.ability(actor, skill),
      start = preferredStart(a.ap);
    if (!fitsAt(start, a.ap))
      return blocked(a.ap === 2 ? '所选位置需要两个连续空格。' : '没有可用时间格。');
    session.selection.pending = { kind: 'skill', actor, skill, target: targetId };
    return put(start);
  }
  function removeAction(id) {
    if (!context.viewport.canPlan()) return;
    session.battle.plan = session.battle.plan.filter((a) => a.id !== id);
    recompute();
    context.renderer.render();
  }
  function moveAction(id, start) {
    if (!context.viewport.canPlan()) return;
    const result = reorderPlan(session.battle.state, session.battle.plan, id, start);
    if (result.error) return blocked(result.error);
    session.battle.plan = result.plan;
    session.battle.forecast = result.forecast;
    context.audio.play('queue');
    context.selection.clearSelection();
    context.renderer.render();
  }
  function actionLabel(a) {
    if (a.kind === 'item') return `使用 ${ITEMS[a.item].name}`;
    if (a.kind === 'swap')
      return `${context.roster.get(a.incoming).name}换入${['左', '中', '右'][a.slot]}位`;
    if (a.kind === 'reposition')
      return `${['左', '中', '右'][a.a]} ↔ ${['左', '中', '右'][a.b]}位交换`;
    return `${context.roster.get(a.actor).name} · ${context.roster.ability(a.actor, a.skill).name}`;
  }
  return {
    preferredStart,
    fit,
    recompute,
    fitsAt,
    put,
    queueSwap,
    queueDirectSkill,
    removeAction,
    moveAction,
    actionLabel,
  };
}
