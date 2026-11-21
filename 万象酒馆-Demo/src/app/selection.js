import { targetsPlayer } from '../enemy-targets.js';
import { canSoulRevive } from '../companion-mechanics.js';
import { canCombine } from '../emblems.js';
import { ITEMS } from '../content/items.js';
import { preview, getEnemies, intent } from '../engine.js';
import { overlordMechanicBadges } from '../battle-overlord-badges.js';
import { query as $ } from './dom.js';

/** @param {import('./context.js').AppContext} context */
export function createSelection(context) {
  const { session } = context;
  function clearSelection(clearActor = false) {
    if (clearActor) {
      session.selection.selected = null;
      $('#details').classList.remove('mobile-open');
    }
    session.selection.target = null;
    session.selection.selectedCell = -1;
    session.selection.interactionStep = null;
    session.selection.inspectedEnemy = null;
    session.selection.inspectedActionIndex = null;
    session.selection.inspectedPreviewCell = null;
    session.selection.intentScope = 'single';
    session.selection.pending = null;
    $('#drag-menu').hidden = true;
    context.drag.clearDropHighlights();
    session.runtime.view?.clearHints();
  }
  function chooseCell(start) {
    if (!context.viewport.canPlan()) return;
    const slots = session.battle.forecast.slots;
    const enemy = slots[start];
    if (enemy) {
      const actionIndex = slots.slice(0, start).filter((entry) => entry === enemy).length;
      session.selection.selectedCell = start;
      session.selection.pending = null;
      session.selection.interactionStep = 'enemy-preview';
      session.selection.inspectedEnemy = enemy;
      session.selection.inspectedActionIndex = actionIndex;
      session.selection.inspectedPreviewCell = null;
      session.selection.intentScope = 'single';
      session.selection.target = enemy;
      $('#drag-menu').hidden = true;
      context.renderer.render();
      context.onboarding?.intentViewed();
      return;
    }
    if (!context.planning.fitsAt(start, 1))
      return context.shell.toast('请选择一个空的我方时间格。');
    session.selection.selectedCell = start;
    session.selection.interactionStep = 'actor';
    if (context.viewport.compactHUD()) $('#details').classList.remove('mobile-open');
    session.selection.inspectedEnemy = null;
    session.selection.inspectedActionIndex = null;
    session.selection.inspectedPreviewCell = null;
    session.selection.pending = null;
    $('#drag-menu').hidden = true;
    context.renderer.render();
  }
  function inspectEnemy(id, all = true, options = {}) {
    if (!context.viewport.canPlan()) return;
    session.selection.inspectedEnemy = id;
    session.selection.intentScope = all ? 'all' : 'single';
    session.selection.inspectedActionIndex = all ? null : (options.actionIndex ?? null);
    session.selection.inspectedPreviewCell = all ? null : (options.previewCell ?? null);
    session.selection.target = id;
    session.selection.pending = null;
    session.selection.interactionStep = 'enemy-preview';
    if (options.previewCell !== undefined) {
      session.selection.selectedCell = -1;
    } else {
      const at = session.battle.forecast.slots.indexOf(id);
      if (at >= 0) session.selection.selectedCell = at;
    }
    context.renderer.render();
    context.onboarding?.intentViewed();
  }
  function enemyIntentPreview() {
    if (
      !session.selection.inspectedEnemy ||
      session.battle.playing ||
      session.runtime.mode !== 'battle'
    )
      return null;
    const ids =
      session.selection.intentScope === 'all'
        ? getEnemies(session.battle.state)
            .filter((enemy) => session.battle.state.units[enemy.id].hp > 0)
            .map((enemy) => enemy.id)
        : [session.selection.inspectedEnemy];
    let base = session.battle.state,
      result = session.battle.forecast;
    if (session.battle.state.phase === 'opening') {
      base = structuredClone(session.battle.forecast.final);
      base.phase = 'plan';
      base.round = 1;
      result = preview(base, []);
    }
    const actionIndex =
      session.selection.intentScope === 'single' ? session.selection.inspectedActionIndex : null;
    return ids.map((id) => previewEnemy(id, base, result, actionIndex));
  }
  function previewEnemy(id, base, result, actionIndex = null) {
    const d = context.roster.get(id);
    const matching = result.events
      .map((event, index) => ({ event, index }))
      .filter(
        ({ event }) =>
          event.actor === id &&
          ['enemy', 'skip'].includes(event.type) &&
          (actionIndex === null || (event.actionIndex ?? 0) === actionIndex),
      );
    const active = matching.filter(({ event }) => event.type === 'enemy');
    if (!matching.length || !active.length)
      return { id, name: d.name, cancelled: true, targets: [] };
    const moves = [];
    const targetMap = new Map();
    const selfBuffMap = new Map();
    let selfHeal = 0;
    let selfMana = 0;
    const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'];
    for (const { event, index } of active) {
      const before = index ? result.events[index - 1].after : base;
      const actionIdx = event.actionIndex ?? 0;
      const move = intent(before, id, actionIdx);
      moves.push(
        active.length > 1 ? `${ROMAN[actionIdx] || actionIdx + 1} ${move.name}` : move.name,
      );
      selfHeal += Math.max(0, event.after.units[id].hp - before.units[id].hp);
      selfMana += Math.max(0, event.after.units[id].mp - before.units[id].mp);
      const selfBuffKeys = [
        ...[
          ...new Set([
            ...Object.keys(move.selfBuff || {}),
            ...(move.effects || [])
              .filter((effect) => effect.type === 'buff' && !targetsPlayer(effect))
              .map((effect) => effect.buff),
          ]),
        ],
        ...(move.selfShield ? ['shield'] : []),
      ];
      for (const key of selfBuffKeys) {
        const gained =
          key === 'shield'
            ? Math.max(0, event.after.units[id].block - before.units[id].block)
            : Math.max(
                0,
                (event.after.units[id].buffs[key] || 0) - (before.units[id].buffs[key] || 0),
              );
        if (gained > 0) selfBuffMap.set(key, (selfBuffMap.get(key) || 0) + gained);
      }
      const hitSlots = (move.effects || []).some(targetsPlayer)
        ? before.units[id].buffs.balance
          ? [0, 1, 2]
          : move.slots || [move.slot]
        : [];
      for (const slot of hitSlots) {
        const unitId = before.formation[slot];
        if (!unitId) {
          if (!targetMap.has(`empty-${slot}`))
            targetMap.set(`empty-${slot}`, { slot, id: null, name: '空位', damage: 0, buffs: [] });
          continue;
        }
        const targetName = context.roster.get(unitId).name;
        const prefix = `${d.name} → ${targetName}：`;
        const damage = event.logs
          .filter((t) => t.startsWith(prefix))
          .reduce((n, t) => n + Number(t.match(/：(\d+)伤害/)?.[1] || 0), 0);
        const buffs = (move.effects || [])
          .filter((e) => e.type === 'buff')
          .map((e) => ({
            key: e.buff,
            value: Math.max(
              0,
              (event.after.units[unitId].buffs[e.buff] || 0) -
                (before.units[unitId].buffs[e.buff] || 0),
            ),
          }))
          .filter((b) => b.value > 0);
        const key = `${slot}:${unitId}`;
        const existing = targetMap.get(key) || {
          slot,
          id: unitId,
          name: targetName,
          damage: 0,
          buffs: [],
        };
        existing.damage += damage;
        for (const b of buffs) {
          const prev = existing.buffs.find((item) => item.key === b.key);
          if (prev) prev.value += b.value;
          else existing.buffs.push({ ...b });
        }
        targetMap.set(key, existing);
      }
    }
    return {
      id,
      name: d.name,
      mechanicBadges: overlordMechanicBadges(active[0].event.after, id, d),
      at: active[0].event.at,
      move: moves.join(' / '),
      selfHeal,
      selfMana,
      selfBuffs: [...selfBuffMap.entries()].map(([key, value]) => ({ key, value })),
      cancelled: false,
      targets: [...targetMap.values()],
    };
  }
  function eligibleTargets() {
    if (!context.viewport.canPlan()) return [];
    const formation = session.battle.forecast.final.formation;
    if (session.selection.interactionStep === 'skill')
      return formation.slice(3).filter((id) => session.battle.state.units[id]?.hp > 0);
    if (session.selection.interactionStep === 'exchange')
      return formation.filter(
        (id) => id !== session.selection.selected && session.battle.state.units[id]?.hp > 0,
      );
    if (session.selection.interactionStep === 'actor')
      return formation.filter((id) => session.battle.state.units[id]?.hp > 0);
    if (session.selection.interactionStep === 'swap') return formation.slice(0, 3);
    if (
      session.selection.interactionStep === 'target' &&
      ['skill', 'item'].includes(session.selection.pending?.kind)
    ) {
      const a =
        session.selection.pending.kind === 'item'
          ? ITEMS[session.selection.pending.item]
          : context.roster.ability(
              session.selection.pending.actor,
              session.selection.pending.skill,
            );
      return (
        a.target === 'enemy'
          ? getEnemies(session.battle.state).map((e) => e.id)
          : a.mechanic === 'soul-banquet'
            ? formation
                .slice(0, 3)
                .filter(
                  (id) =>
                    id !== session.selection.pending.actor &&
                    !Object.values(session.battle.forecast.final.soulLoans || {}).includes(id),
                )
            : formation
      ).filter((id) =>
        a.mechanic === 'soul-revive'
          ? canSoulRevive(session.battle.forecast.final, id)
          : session.battle.state.units[id]?.hp > 0,
      );
    }
    return [];
  }
  function refreshInteraction() {
    $('#battle').classList.toggle(
      'choosing-formation',
      context.viewport.canPlan() &&
        ['swap', 'exchange'].includes(session.selection.interactionStep),
    );
    $('#battle').classList.toggle(
      'choosing-target',
      context.viewport.compactHUD() &&
        ['actor', 'target', 'swap', 'exchange'].includes(session.selection.interactionStep),
    );
    const eligible = new Set(eligibleTargets());
    document.querySelectorAll('[data-unit],[data-rear]').forEach((el) => {
      const id = el.dataset.unit || el.dataset.rear;
      el.classList.toggle('targetable', eligible.has(id));
      el.dataset.selectLabel =
        session.selection.interactionStep === 'actor'
          ? '选择角色'
          : session.selection.interactionStep === 'target'
            ? session.selection.pending?.kind === 'item'
              ? '道具目标'
              : '技能目标'
            : session.selection.interactionStep === 'exchange'
              ? '交换'
              : '换入';
      el.classList.toggle(
        'chosen-actor',
        session.selection.interactionStep === 'skill' && id === session.selection.selected,
      );
    });
    $('#selection-hint').textContent =
      session.selection.interactionStep === 'actor'
        ? '选择角色'
        : session.selection.interactionStep === 'skill'
          ? '选择技能'
          : session.selection.interactionStep === 'target'
            ? '选择目标'
            : session.selection.interactionStep === 'swap'
              ? '选择换入位置'
              : session.selection.interactionStep === 'exchange'
                ? '选择交换角色'
                : '';
    $('#ap-orb').setAttribute(
      'data-tooltip',
      `剩余 ${$('#ap-label').textContent} AP；${session.battle.plan.reduce((n, a) => n + a.ap, 0)} AP已编排`,
    );
    session.runtime.view?.showIntent(enemyIntentPreview());
  }
  function selectUnit(id, side, slot) {
    if (session.battle.playing || session.runtime.drag?.moved) return;
    if (
      session.selection.interactionStep === 'target' &&
      ['skill', 'item'].includes(session.selection.pending?.kind)
    ) {
      if (!eligibleTargets().includes(id)) return;
      session.selection.pending.target = id;
      if (side === 'Enemy') session.selection.target = id;
      context.planning.put(session.selection.selectedCell);
      return;
    }
    if (session.selection.interactionStep === 'swap' && side === 'Friendly') {
      context.planning.queueSwap(session.selection.pending.incoming, slot);
      return;
    }
    if (session.selection.interactionStep === 'exchange' && side === 'Friendly') {
      context.planning.queueSwap(session.selection.selected, slot);
      return;
    }
    if (side === 'Enemy') {
      const actor = session.selection.selected;
      if (
        context.viewport.canPlan() &&
        (session.selection.interactionStep === 'skill' || !$('#drag-menu').hidden) &&
        session.battle.forecast.final.formation.slice(0, 3).includes(actor) &&
        session.battle.forecast.final.units[actor]?.hp > 0 &&
        session.battle.forecast.final.units[id]?.hp > 0
      ) {
        context.drag.showDropMenu(actor, id, 'Enemy');
        return;
      }
      inspectEnemy(id, true);
      return;
    }
    if (
      session.selection.selected === id &&
      session.selection.interactionStep === 'skill' &&
      canCombine(session.battle.forecast.final, id)
    ) {
      context.planning.queueEngage(id);
      context.drag.showDropMenu(id, id, 'Friendly');
      return;
    }
    session.selection.selected = id;
    session.selection.pending = null;
    session.selection.inspectedEnemy = null;
    if (
      session.selection.selectedCell >= 0 &&
      session.battle.forecast.slots[session.selection.selectedCell]
    )
      session.selection.selectedCell = -1;
    session.selection.interactionStep = context.viewport.canPlan() ? 'skill' : null;
    context.viewport.openCharacterHUD();
    context.renderer.render();
    if (
      context.viewport.canPlan() &&
      session.battle.forecast.final.formation.slice(0, 3).includes(id)
    )
      context.drag.showDropMenu(id, id, 'Friendly');
  }
  function selectHero(id) {
    if (session.battle.playing || session.runtime.drag?.moved) return;
    if (['skill', 'exchange'].includes(session.selection.interactionStep)) {
      const slot = session.battle.forecast.final.formation.indexOf(session.selection.selected);
      if (slot >= 0 && slot < 3) {
        context.planning.queueSwap(id, slot);
        return;
      }
    }
    if (
      session.selection.interactionStep === 'target' &&
      ['skill', 'item'].includes(session.selection.pending?.kind)
    ) {
      if (eligibleTargets().includes(id)) {
        session.selection.pending.target = id;
        context.planning.put(session.selection.selectedCell);
      }
      return;
    }
    session.selection.selected = id;
    session.selection.inspectedEnemy = null;
    if (context.viewport.canPlan() && session.battle.state.units[id].hp > 0) {
      session.selection.pending = {
        kind: 'swap',
        incoming: id,
        start: session.selection.selectedCell,
      };
      session.selection.interactionStep = 'swap';
    } else {
      session.selection.pending = null;
      session.selection.interactionStep = null;
    }
    if (session.selection.interactionStep === 'swap' && context.viewport.compactHUD())
      $('#details').classList.remove('mobile-open');
    else context.viewport.openCharacterHUD();
    context.renderer.render();
  }
  function pickSkill(skill) {
    if (
      !context.viewport.canPlan() ||
      !session.battle.forecast.final.formation.slice(0, 3).includes(session.selection.selected)
    )
      return;
    const a = context.roster.ability(session.selection.selected, skill),
      start = context.planning.preferredStart(a.ap);
    if (!context.planning.fitsSkillAt(start, a.ap))
      return context.shell.toast(
        a.ap === 2 ? '这个技能需要两个连续空格。' : '没有空余的我方时间格。',
      );
    session.selection.selectedCell = start;
    session.selection.inspectedEnemy = null;
    session.selection.pending = {
      kind: 'skill',
      actor: session.selection.selected,
      skill,
      target: session.selection.selected,
    };
    const beforeAction =
      session.battle.forecast.events.filter((event) => event.at < start).at(-1)?.after ||
      session.battle.state;
    const enemies = getEnemies(beforeAction).filter((enemy) => beforeAction.units[enemy.id].hp > 0);
    if (a.target === 'enemy' && enemies.length === 1) {
      session.selection.pending.target = enemies[0].id;
      context.planning.put(start);
      return;
    }
    if (['self', 'allAllies', 'allEnemies'].includes(a.target)) {
      context.planning.put(start);
      return;
    }
    session.selection.interactionStep = 'target';
    if (context.viewport.compactHUD()) $('#details').classList.remove('mobile-open');
    context.renderer.render();
  }
  return {
    clearSelection,
    chooseCell,
    inspectEnemy,
    enemyIntentPreview,
    eligibleTargets,
    refreshInteraction,
    selectUnit,
    selectHero,
    pickSkill,
  };
}
