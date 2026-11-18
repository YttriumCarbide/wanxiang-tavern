import { ITEMS } from '../content/items.js';
import { html } from '../shared/html.js';
import { parseTimelineDrop } from './drag-payload.js';
import { intent, enemyTimeline } from '../engine.js';
import { escapeText } from '../ui.js';
import { damageTypeChip, inferDamageType, resolveBasicAttackType } from '../damage-types.js';
import { isFixedFirstSlot } from '../overlord-mechanics.js';
import { query as $ } from './dom.js';

/** @param {import('./context.js').AppContext} context */
export function createTimeline(context) {
  const { session } = context;
  function renderTimeline() {
    const n = session.battle.forecast.slots.length,
      timeline = $('#timeline'),
      opening = session.battle.state.phase === 'opening',
      mobile = context.viewport.compactHUD();
    const geometry = getComputedStyle(timeline);
    const gap = Number.parseFloat(geometry.columnGap) || 8,
      nextState = { ...session.battle.forecast.final, phase: 'plan', round: 1 },
      nextSlots = opening ? enemyTimeline(nextState) : [],
      row =
        Number.parseFloat(geometry.getPropertyValue('--timeline-row-size')) ||
        (context.viewport.compactLandscape() ? 62 : mobile ? 74 : 92),
      previewRow = row;
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
    const ROMAN = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ'];
    const cell = (
      id,
      i,
      readOnly = false,
      s = session.battle.state,
      slotList = session.battle.forecast.slots,
    ) => {
      const openingSlot = opening && !readOnly && !id;
      const hasAction =
        openingSlot && session.battle.plan.some((a) => i >= a.start && i < a.start + a.ap);
      const openingEmpty = openingSlot && !hasAction;
      const cancelled =
          !readOnly && id && session.battle.forecast.deaths.some((d) => d.id === id && d.at < i),
        bound =
          !readOnly &&
          id &&
          session.battle.forecast.events.some(
            (event) => event.actor === id && event.at === i && event.blockedBy === 'bind',
          ),
        totalActions = id ? slotList.filter((entry) => entry === id).length : 0,
        actionIndex = id ? slotList.slice(0, i).filter((entry) => entry === id).length : 0,
        move = id ? intent(s, id, actionIndex) : null,
        enemyDef = id ? context.roster.get(id) : null,
        fixedFirst = id ? isFixedFirstSlot(s, slotList, i, enemyDef) : false,
        isChargeCell = Boolean(move?.isCharge && !fixedFirst),
        isChargedRelease = Boolean(move?.isChargedRelease && !fixedFirst),
        enemyDmgType =
          move && enemyDef
            ? move.effects?.some((ef) => ef.type === 'damage')
              ? inferDamageType(move, enemyDef) || resolveBasicAttackType(enemyDef)
              : null
            : null,
        phaseTag = fixedFirst
          ? ''
          : totalActions > 1
            ? ` ${ROMAN[actionIndex] || `#${actionIndex + 1}`}`
            : '',
        corruptedSlot =
          !readOnly && s.phase !== 'opening' && Number.isInteger(s.sinkingPlague?.corruptedSlot)
            ? s.sinkingPlague.corruptedSlot
            : null,
        isCorruptedEmpty = corruptedSlot === i && !id,
        isCorruptedCleansed = corruptedSlot === i && Boolean(id);
      return html`<button
        class="time-cell ${openingEmpty ? 'opening-empty' : ''} ${id ? 'enemy-cell' : ''} ${fixedFirst ? 'overlord-fixed-cell' : ''} ${isChargeCell ? 'is-charge-cell' : ''} ${isChargedRelease ? 'is-charged-release' : ''} ${fixedFirst && bound ? 'is-chain-broken' : ''} ${isCorruptedEmpty ? 'is-corrupted-slot' : ''} ${isCorruptedCleansed ? 'is-corrupted-cleansed' : ''} ${cancelled ? 'cancelled' : ''} ${bound ? 'bound' : ''} ${!readOnly && (session.battle.activeCell === i || (!session.battle.playing && session.selection.selectedCell === i)) ? 'playing' : ''} ${readOnly ? 'preview-cell' : ''} ${readOnly && id && (session.selection.inspectedPreviewCell !== null ? session.selection.inspectedPreviewCell === i : session.selection.intentScope === 'all' && session.selection.inspectedEnemy ? true : id === session.selection.inspectedEnemy) ? 'playing' : ''}"
        ${readOnly ? `data-preview="${i}"` : `data-start="${i}" data-motion="${id ? `enemy-${id}` : `empty-${i}`}"`}
        ${hasAction ? 'tabindex="-1" aria-hidden="true"' : ''}
        ${session.battle.playing || (readOnly && !id) ? 'disabled' : ''}
        ${id ? `data-tooltip="${escapeText(`${context.roster.get(id).name}${phaseTag} · ${bound ? (fixedFirst ? '破防失衡 · 定式金链已粉碎，本回合跳过' : '破防/禁锢，本回合行动取消') : fixedFirst ? `定式先制 · 免疫迟缓\n${move.name}：${move.text}` : `速度 ${Math.max(1, context.roster.get(id).speed - (s.units[id].buffs.slow || 0))}\n${move.name}：${move.text}`}${isCorruptedCleansed ? '\n★ 已被【缓慢】逼入沉疫腐化格，格位封锁解除！' : ''}`)}"` : isCorruptedEmpty ? `data-tooltip="${escapeText('沉疫腐化回合格\n仅允许放入【换位/调整站位】。\n若用【缓慢】将敌方推到此格，即可破除封锁！')}"` : ''}
      >
        ${
          isCorruptedEmpty
            ? html`<span class="timeline-corrupt-sigil" aria-hidden="true"></span>`
            : ''
        }
        ${
          fixedFirst
            ? html`<span class="timeline-gold-chains" aria-hidden="true"
                ><svg viewBox="0 0 100 100" preserveAspectRatio="none">
                  <rect
                    x="2"
                    y="2"
                    width="96"
                    height="96"
                    rx="6"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="3"
                    stroke-dasharray="10 4"
                  />
                  <circle cx="8" cy="8" r="4.5" fill="currentColor" />
                  <circle cx="92" cy="8" r="4.5" fill="currentColor" />
                  <circle cx="8" cy="92" r="4.5" fill="currentColor" />
                  <circle cx="92" cy="92" r="4.5" fill="currentColor" /></svg
              ></span>`
            : ''
        }
        ${
          bound
            ? html`<span class="timeline-chain" role="img" aria-label="禁锢，行动取消"
                ><svg viewBox="0 0 40 32" aria-hidden="true">
                  <g fill="none" stroke="currentColor" stroke-width="3.5">
                    <rect
                      x="3"
                      y="7"
                      width="21"
                      height="11"
                      rx="5.5"
                      transform="rotate(-34 13 13)"
                    />
                    <rect
                      x="16"
                      y="14"
                      width="21"
                      height="11"
                      rx="5.5"
                      transform="rotate(-34 26 20)"
                    />
                    <path d="m15 20 10-7" />
                  </g></svg
              ></span>`
            : ''
        }
        ${hasAction ? '' : html`<span class="num">${openingEmpty ? '◇' : i + 1}</span>`}${
          id ? damageTypeChip(enemyDmgType, { size: 13, className: 'cell-dmg-type' }) : ''
        }${
          hasAction
            ? ''
            : html`<span class="cell-label"
                >${id ? `${cancelled ? '× ' : ''}${context.roster.get(id).name}${phaseTag}` : openingEmpty ? '先手' : isCorruptedEmpty ? '换位格' : readOnly ? '我方行动' : '＋'}${id ? html`<small>${fixedFirst ? (bound ? '破防震裂' : '定式先制') : isChargedRelease ? (bound ? '破防打断' : '⚡蓄力释放') : isChargeCell ? '蓄力聚能' : isCorruptedCleansed ? '已踩消腐格' : totalActions > 1 ? move.name : `速度 ${Math.max(1, context.roster.get(id).speed - (s.units[id].buffs.slow || 0))}`}</small>` : isCorruptedEmpty ? html`<small>沉疫·只换位</small>` : ''}</span
              >`
        }
      </button>`;
    };
    timeline.innerHTML = session.battle.forecast.slots.map((id, i) => cell(id, i)).join('');
    for (const a of session.battle.plan) {
      const bad = session.battle.forecast.invalid.find((x) => x.id === a.id),
        skip = session.battle.forecast.skipped.find((x) => x.id === a.id),
        casts = session.battle.forecast.events.filter(
          (event) => event.actionId === a.id && event.type === 'hero',
        ),
        repeated = casts.length > 1,
        bound = session.battle.forecast.events.find(
          (event) => event.actionId === a.id && event.blockedBy === 'bind',
        ),
        el = document.createElement('div');
      el.className =
        'time-action' +
        (bad ? ' invalid' : '') +
        (skip ? ' skipped' : '') +
        (bound ? ' bound' : '') +
        (repeated ? ' repeated' : '') +
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
          bound?.label ||
          `${context.planning.actionLabel(a)} · ${a.ap} AP\n拖动调整顺序`,
      );
      const actionDmgChip = (dt) => damageTypeChip(dt, { size: 13, className: 'action-dmg-type' });
      let actionDmgBadge = '';
      if (a.kind === 'skill') {
        const actorDef = context.roster.get(a.actor);
        const ab = context.roster.ability(a.actor, a.skill);
        const dt =
          a.skill === 'attack' ? resolveBasicAttackType(actorDef) : inferDamageType(ab, actorDef);
        actionDmgBadge = actionDmgChip(dt);
      } else if (a.kind === 'engage' && a.followUp) {
        const actorDef = context.roster.get(a.actor);
        const ab = context.roster.ability(a.actor, a.followUp.skill);
        const dt =
          a.followUp.skill === 'attack'
            ? resolveBasicAttackType(actorDef)
            : inferDamageType(ab, actorDef);
        actionDmgBadge = actionDmgChip(dt);
      } else if (
        a.kind === 'swap' &&
        session.battle.state.units[a.incoming]?.entryReady &&
        context.roster.get(a.incoming)?.entrySkill
      ) {
        const incomingDef = context.roster.get(a.incoming);
        actionDmgBadge = actionDmgChip(inferDamageType(incomingDef.entrySkill, incomingDef));
      }
      el.innerHTML = html`<span class="action-number">${a.start + 1}</span>${actionDmgBadge}
        <div class="time-action-body">
          <b
            >${skip ? '× ' : bad ? '! ' : ''}${a.kind === 'item' ? ITEMS[a.item].name : a.kind === 'skill' ? context.roster.ability(a.actor, a.skill).name : a.kind === 'engage' ? `结合${a.followUp ? ' · ' + context.roster.ability(a.actor, a.followUp.skill).name : ''}` : a.kind === 'swap' ? (session.battle.state.units[a.incoming]?.entryReady && context.roster.get(a.incoming)?.entrySkill?.name ? `换入 · ${context.roster.get(a.incoming).entrySkill.name}` : '换入') : '交换'}</b
          >${repeated ? html`<span class="skill-repeat" aria-label="该行动生效两次">×2</span>` : ''}<small
            >${a.kind === 'item' ? context.roster.get(a.target).name : ['skill', 'engage'].includes(a.kind) ? context.roster.get(a.actor).name : a.kind === 'swap' ? context.roster.get(a.incoming).name : '阵型'}
            · ${bound ? (casts.length ? '后次禁锢跳过' : '禁锢 · 跳过') : `${a.ap} AP`}</small
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
          ${nextSlots.map((id, i) => cell(id, i, true, nextState, nextSlots)).join('')}
        </div>`;
    }
    timeline
      .querySelectorAll('[data-start]')
      .forEach((b) => (b.onclick = () => context.selection.chooseCell(Number(b.dataset.start))));
    next.querySelectorAll('[data-preview]').forEach(
      (b) =>
        (b.onclick = () => {
          const previewIndex = Number(b.dataset.preview);
          const nextState = { ...session.battle.forecast.final, phase: 'plan', round: 1 };
          const slots = enemyTimeline(nextState);
          const id = slots[previewIndex];
          if (id) {
            const actionIndex = slots.slice(0, previewIndex).filter((entry) => entry === id).length;
            context.selection.inspectEnemy(id, false, {
              actionIndex,
              previewCell: previewIndex,
            });
          } else context.shell.toast('结算先手后可编排第一回合。');
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
