import { serviceItemArtwork } from './service-game-view.js';

function center(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function createServiceDragView(board) {
  let source;
  let origin;
  let hovered;
  let animation;
  let point;
  const preview = () => board.querySelector('.service-drag-preview');
  const workspace = () => board.querySelector('[data-service-workspace]');

  function highlight(target) {
    if (hovered === target) return;
    hovered?.removeAttribute('data-drop-hover');
    hovered = target;
    hovered?.setAttribute('data-drop-hover', '');
  }

  function reset() {
    animation?.cancel();
    animation = null;
    highlight(null);
    source?.removeAttribute('data-drag-source');
    source = null;
    const node = preview();
    if (node) node.hidden = true;
    workspace()?.removeAttribute('data-dragging');
  }

  function move(event) {
    point = { x: event.clientX, y: event.clientY };
    const bounds = board.getBoundingClientRect();
    const x = point.x - bounds.left - board.clientLeft + board.scrollLeft;
    const y = point.y - bounds.top - board.clientTop + board.scrollTop;
    const node = preview();
    node.style.setProperty('--drag-x', x + 'px');
    node.style.setProperty('--drag-y', y + 'px');
    const target = document.elementFromPoint(point.x, point.y)?.closest('[data-service-dropzone]');
    highlight(target && workspace().contains(target) ? target : null);
  }

  function start(item, event) {
    reset();
    source = item;
    origin = center(item);
    item.setAttribute('data-drag-source', '');
    workspace().setAttribute('data-dragging', '');
    const node = preview();
    const label = document.createElement('span');
    label.textContent = item.dataset.dragChoice;
    node.innerHTML = serviceItemArtwork(item.dataset.dragChoice);
    node.append(label);
    node.hidden = false;
    move(event);
  }

  function release(accept, event) {
    move(event);
    const target = hovered;
    const destination = target ? center(target) : origin;
    const correct = Boolean(target && accept(target.dataset.serviceDropzone));
    const end = correct ? destination : origin;
    source?.removeAttribute('data-drag-source');
    source = null;
    highlight(null);
    workspace().removeAttribute('data-dragging');
    const node = preview();
    const settleScale = correct ? 0.55 : 0.86;
    const settleY = end.y - point.y + (node.offsetHeight * settleScale) / 2;
    animation = node.animate(
      [
        { translate: '0 0', scale: 1, opacity: 1 },
        {
          translate: `${end.x - point.x}px ${settleY}px`,
          scale: settleScale,
          opacity: 0,
        },
      ],
      {
        duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : correct ? 220 : 280,
        easing: 'cubic-bezier(0.2, 0.75, 0.24, 1)',
        fill: 'forwards',
      },
    );
    animation.addEventListener('finish', reset, { once: true });
  }

  return { start, move, release, reset };
}
