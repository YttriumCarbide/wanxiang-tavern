/** Touch handles drag cards without stealing normal scrolling from the reserve list. */
export function mountPreparationTouch(context) {
  const panel = document.querySelector('#party-panel');
  let drag = null;
  let suppressClick = false;
  function clear() {
    if (!drag) return;
    drag.ghost?.remove();
    drag.source.classList.remove('dragging');
    drag.source.draggable = true;
    panel
      .querySelectorAll('.drag-over')
      .forEach((element) => element.classList.remove('drag-over'));
    drag = null;
  }
  context.events.on(panel, 'pointerdown', (event) => {
    suppressClick = false;
    if (event.pointerType === 'mouse' || !event.target.closest('.prepare-drag-handle')) return;
    const source = event.target.closest('[data-prepare-hero]');
    if (!source) return;
    source.draggable = false;
    source.setPointerCapture(event.pointerId);
    drag = {
      source,
      id: source.dataset.prepareHero,
      slot: source.dataset.prepareSlot,
      pointer: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
  });
  context.events.on(panel, 'pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    event.preventDefault();
    if (!drag.ghost) {
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'prepare-drag-ghost';
      drag.ghost.append(drag.source.querySelector('img').cloneNode(true));
      panel.append(drag.ghost);
      drag.source.classList.add('dragging');
    }
    const rect = panel.getBoundingClientRect();
    const rotated = matchMedia('(max-width: 760px) and (orientation: portrait)').matches;
    const x = rotated ? event.clientY - rect.top : event.clientX - rect.left;
    const y = rotated ? rect.right - event.clientX : event.clientY - rect.top;
    drag.ghost.style.transform = `translate(${x - 32}px, ${y - 42}px) rotate(-4deg)`;
    panel
      .querySelectorAll('.drag-over')
      .forEach((element) => element.classList.remove('drag-over'));
    document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-prepare-slot], #prepare-pool')
      ?.classList.add('drag-over');
  });
  context.events.on(panel, 'pointerup', (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.ghost) {
      clear();
      return;
    }
    suppressClick = true;
    event.preventDefault();
    const active = drag;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const slot = target?.closest('[data-prepare-slot]');
    const pool = target?.closest('#prepare-pool');
    clear();
    if (slot) {
      context.session.ai.preparationSlot = Number(slot.dataset.prepareSlot);
      context.session.ai.preparationCharacter = active.id;
      context.generation.setPartySlot(Number(slot.dataset.prepareSlot), active.id);
    } else if (pool && active.slot !== undefined)
      context.generation.setPartySlot(Number(active.slot), null);
  });
  context.events.on(
    panel,
    'click',
    (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true },
  );
  context.events.on(panel, 'pointercancel', clear);
  context.events.on(panel, 'close', clear);
  context.events.on(window, 'blur', clear);
  context.events.on(window, 'pagehide', clear);
}
