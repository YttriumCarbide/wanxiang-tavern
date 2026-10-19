import { DEFINITIONS } from '../data.js';
import { query as $ } from './dom.js';
import { readFileAsOptimizedImage } from '../portraits.js';
import { mountBattleTextSelection } from './text-selection.js';
import { createPortraitEditor } from './portrait-editor.js';

export function mountInput(context) {
  mountBattleTextSelection(context);
  const portraitEditor = createPortraitEditor(context);
  const { session } = context;
  context.events.on(document, 'pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('[data-tooltip]')) return;
    const el = e.target.closest('[data-dragunit]');
    if (
      !el ||
      !context.viewport.canPlan() ||
      session.battle.state.units[el.dataset.dragunit].hp <= 0
    )
      return;
    $('#drag-menu').hidden = true;
    session.runtime.drag = {
      id: el.dataset.dragunit,
      x: e.clientX,
      y: e.clientY,
      moved: false,
      source: el,
      rect: el.getBoundingClientRect(),
      pointer: e.pointerId,
    };
  });
  context.events.on(
    document,
    'pointermove',
    (e) => {
      if (
        !session.runtime.drag ||
        session.runtime.drag.finished ||
        e.pointerId !== session.runtime.drag.pointer
      )
        return;
      if (session.runtime.drag.moved && !(e.buttons & 1)) {
        context.drag.clearDropHighlights();
        return;
      }
      if (
        !session.runtime.drag.moved &&
        Math.hypot(e.clientX - session.runtime.drag.x, e.clientY - session.runtime.drag.y) > 9
      ) {
        if (
          !session.runtime.view?.startDrag(
            session.runtime.drag.id,
            session.runtime.drag.x,
            session.runtime.drag.y,
            session.runtime.drag.rect,
          )
        ) {
          session.runtime.drag = null;
          return;
        }
        session.runtime.drag.moved = true;
        context.audio.play('drag');
        session.runtime.drag.source.classList.add('is-drag-source');
        document.body.classList.add('is-dragging');
      }
      if (session.runtime.drag.moved) {
        e.preventDefault();
        session.runtime.view?.moveDrag(e.clientX, e.clientY);
        context.drag.clearDropHighlights();
        const fromReserve =
          session.battle.forecast.final.formation.indexOf(session.runtime.drag.id) >= 3;
        document.body.classList.toggle('drag-from-reserve', fromReserve);
        const hit = document.elementFromPoint(e.clientX, e.clientY),
          slot = hit?.closest('[data-start]');
        if (slot) {
          slot.classList.add(
            context.planning.fitsAt(Number(slot.dataset.start), 1)
              ? 'card-slot-drop'
              : 'blocked-card-drop',
          );
          return;
        }
        const drop = hit?.closest('[data-unit],[data-rear],[data-empty-slot]');
        if ((drop?.dataset?.unit || drop?.dataset?.rear) !== session.runtime.drag.id) {
          drop?.classList.add('drop-target');
          if (fromReserve) drop?.classList.add('drop-incoming');
        }
      }
    },
    { passive: false },
  );
  context.events.on(document, 'pointerup', (e) => context.drag.finishDrag(e));
  context.events.on(document, 'pointercancel', (e) => context.drag.finishDrag(e, true));
  context.events.on(window, 'blur', () => context.drag.finishDrag({}, true));
  context.events.on(document, 'keydown', (e) => {
    if (e.key === 'Escape') {
      if (e.target.closest('dialog[open]')) return;
      if (session.runtime.drag) context.drag.finishDrag({}, true);
      context.selection.clearSelection(true);
      if (session.runtime.mode === 'battle') context.renderer.render();
    }
  });
  context.events.on(document, 'pointerdown', (e) => {
    const panel = e.target.closest('#details');
    if (
      panel &&
      panel.scrollHeight > panel.clientHeight &&
      e.clientX > panel.getBoundingClientRect().right - 14
    )
      return;
    if (
      !context.viewport.canPlan() ||
      session.runtime.drag?.moved ||
      e.target.closest(
        'dialog[open],#tutorial-guide,[data-unit],[data-rear],.time-cell,.time-action,[data-skill],.extra-details summary,#details [data-tooltip],.command-controls button,#drag-menu button,.hud-toggle,#round-label,#ap-orb,#audio-toggle,#audio-panel,#story-toggle',
      )
    )
      return;
    if (
      session.selection.selectedCell >= 0 ||
      session.selection.pending ||
      session.selection.inspectedEnemy ||
      session.selection.interactionStep ||
      session.selection.selected ||
      !$('#drag-menu').hidden
    ) {
      context.selection.clearSelection(true);
      context.renderer.render();
    }
  });
  context.events.on($('#commit'), 'click', context.playback.commit);
  context.events.on($('#clear'), 'click', () => {
    session.battle.plan = [];
    context.selection.clearSelection(true);
    context.planning.recompute();
    context.renderer.render();
  });
  context.events.on($('#speed'), 'click', () => {
    session.battle.speed = session.battle.speed === 1 ? 2 : 1;
    $('#speed').textContent = `演出 ×${session.battle.speed}`;
  });
  context.events.on($('#back-inn'), 'click', () => {
    if (session.battle.playing) return context.shell.toast('请等待本轮结算完成。');
    context.journey.returnInn();
  });
  const portraitInput = document.createElement('input');
  portraitInput.type = 'file';
  portraitInput.accept = 'image/*';
  portraitInput.hidden = true;
  portraitInput.id = 'portrait-file-input';
  document.body.append(portraitInput);

  let editingHeroId = null;

  context.events.on($('#party-toggle'), 'click', () => {
    context.shell.renderParty();
    if ($('#party-panel').open) $('#party-panel').close();
    else $('#party-panel').showModal();
  });

  context.events.on($('#party-panel'), 'click', (e) => {
    const remove = e.target.closest('[data-prepare-remove]');
    if (remove) {
      context.generation.setPartySlot(Number(remove.dataset.prepareRemove), null);
      return;
    }
    const slot = e.target.closest('[data-prepare-slot]');
    if (slot) {
      session.ai.preparationSlot = Number(slot.dataset.prepareSlot);
      context.shell.renderParty();
      return;
    }
    const use = e.target.closest('[data-prepare-use]');
    if (use) {
      context.generation.setPartySlot(session.ai.preparationSlot, use.dataset.prepareUse);
      return;
    }
    const inspect = e.target.closest('[data-prepare-view]');
    if (inspect) {
      session.ai.preparationCharacter = inspect.dataset.prepareView;
      context.shell.renderParty();
      return;
    }

    const urlButton = e.target.closest('[data-portrait-url]');
    if (urlButton) {
      portraitEditor.open(urlButton.dataset.portraitUrl);
      return;
    }
    const resetBtn = e.target.closest('[data-reset-portrait]');
    if (resetBtn) {
      e.stopPropagation();
      const heroId = resetBtn.dataset.resetPortrait;
      context.shell.setCustomPortrait(heroId, null);
      return;
    }
    const editWrap = e.target.closest('[data-edit-portrait]');
    if (editWrap) {
      editingHeroId = editWrap.dataset.editPortrait;
      portraitInput.value = '';
      portraitInput.click();
    }
  });

  for (const id of ['prepare-close', 'prepare-done'])
    context.events.on($('#' + id), 'click', () => $('#party-panel').close());
  context.events.on($('#party-panel'), 'keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const editWrap = e.target.closest('[data-edit-portrait]');
      if (editWrap) {
        e.preventDefault();
        editWrap.click();
      }
    }
  });

  context.events.on($('#party-panel'), 'dragover', (e) => {
    if (e.target.closest('[data-edit-portrait]')) e.preventDefault();
  });

  context.events.on($('#party-panel'), 'drop', async (e) => {
    const editWrap = e.target.closest('[data-edit-portrait]');
    if (editWrap && e.dataTransfer?.files?.[0]) {
      e.preventDefault();
      const heroId = editWrap.dataset.editPortrait;
      try {
        const dataUrl = await readFileAsOptimizedImage(
          e.dataTransfer.files[0],
          context.apiClient.request,
        );
        context.shell.setCustomPortrait(heroId, dataUrl);
      } catch (err) {
        context.shell.toast(err.message || '图片读取失败');
      }
    }
  });

  context.events.on(portraitInput, 'change', async () => {
    const file = portraitInput.files?.[0];
    if (!file || !editingHeroId) return;
    try {
      const dataUrl = await readFileAsOptimizedImage(file, context.apiClient.request);
      context.shell.setCustomPortrait(editingHeroId, dataUrl);
    } catch (err) {
      context.shell.toast(err.message || '图片读取失败');
    }
  });
  document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => $('#rules').close()));
  context.events.on(window, 'message', (e) => {
    if (
      e.origin === location.origin &&
      e.source === $('#inn-frame iframe')?.contentWindow &&
      e.data?.type === 'tavern-portal-visibility'
    ) {
      context.generation.setSummonVisible(e.data.summon === true);
      return;
    }
    if (
      e.origin === location.origin &&
      e.source === $('#inn-frame iframe')?.contentWindow &&
      e.data?.type === 'summon-character'
    ) {
      void context.generation.portal('character');
      return;
    }
    if (
      e.origin === location.origin &&
      e.source === $('#inn-frame iframe')?.contentWindow &&
      e.data?.type === 'enter-dungeon'
    )
      context.destinations.open();
  });
  context.events.on($('#route-close'), 'click', () => $('#route').close());
  context.events.on($('#route-confirm'), 'click', () => {
    $('#route').close();
    $('#mode-label').textContent = `月痕遗迹 · 终点${DEFINITIONS[session.journey.bossChoice].name}`;
  });
  context.events.on($('#result'), 'cancel', (e) => e.preventDefault());
  context.events.on($('#turn-toggle'), 'click', () => {
    $('.turn-column').classList.toggle('mobile-open');
    $('#details').classList.remove('mobile-open');
  });
  context.events.on($('#details-toggle'), 'click', () => {
    $('#details').classList.toggle('mobile-open');
    $('.turn-column').classList.remove('mobile-open');
  });
  context.events.on(window, 'resize', () => {
    if (context.viewport.compactHUD()) $('#details').classList.remove('mobile-open');
    clearTimeout(session.runtime.resizeTimer);
    session.runtime.resizeTimer = setTimeout(() => {
      if (session.runtime.mode === 'battle' && !session.runtime.drag) context.renderer.render();
    }, 80);
  });
}
