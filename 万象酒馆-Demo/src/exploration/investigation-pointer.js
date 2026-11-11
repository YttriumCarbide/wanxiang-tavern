import * as THREE from 'three';
import { CHAPTER_INVESTIGATIONS } from '../chapters/starbell-investigation.js';

/** Hover and taps share the same projected clue area, including a usable touch target. */
export function createInvestigationPointer({ canvas, camera, events, model, context, scene }) {
  const target = document.createElement('button');
  target.className = 'investigation-target';
  target.type = 'button';
  target.setAttribute('aria-label', '调查此处');
  target.innerHTML = '<span aria-hidden="true"></span>';
  target.hidden = true;
  document.body.append(target);
  const projected = new THREE.Vector3();
  let hovered = null;

  function hide() {
    hovered = null;
    target.hidden = true;
    canvas.classList.remove('clue-hovered');
  }
  function pick(x, y) {
    const progress = context()?.investigation;
    const definition = CHAPTER_INVESTIGATIONS[progress?.key];
    const view = model();
    if (
      !progress?.started ||
      progress.available === false ||
      definition?.scene !== scene ||
      !view?.picturePoint ||
      document.body.classList.contains('gal-covered')
    )
      return null;
    const bounds = canvas.getBoundingClientRect();
    const point = view.picturePoint(
      (x - bounds.left) / bounds.width,
      (y - bounds.top) / bounds.height,
      camera,
    );
    const nearby = view.picturePoint(
      (x - bounds.left + 28) / bounds.width,
      (y - bounds.top + 28) / bounds.height,
      camera,
    );
    const radius = (clue, axis) =>
      Math.max(clue.radius[axis], Math.abs(nearby[axis] - point[axis]));
    const distance = (clue) =>
      (point[0] - clue.point[0]) ** 2 / radius(clue, 0) ** 2 +
      (point[1] - clue.point[1]) ** 2 / radius(clue, 1) ** 2;
    return (
      definition.clues
        .filter(
          (clue) =>
            !progress.found.includes(clue.id) &&
            Math.abs(point[0] - clue.point[0]) <=
              Math.max(clue.radius[0], Math.abs(nearby[0] - point[0])) &&
            Math.abs(point[1] - clue.point[1]) <=
              Math.max(clue.radius[1], Math.abs(nearby[1] - point[1])),
        )
        .sort((a, b) => distance(a) - distance(b))[0] || null
    );
  }
  function discover(clue) {
    if (!clue) return false;
    const progress = context()?.investigation;
    hide();
    parent.postMessage(
      { type: 'starbell-clue', scene, key: progress.key, clue: clue.id },
      location.origin,
    );
    return true;
  }
  function move(x, y) {
    const clue = pick(x, y);
    if (!clue) return hide();
    const view = model();
    const image = view.panorama.material.map.image;
    const aspect = image.width / image.height;
    const bounds = canvas.getBoundingClientRect();
    projected.set((clue.point[0] - 0.5) * aspect, 0.5 - clue.point[1], 0.1).project(camera);
    const width = Math.max(
      56,
      ((clue.radius[0] * aspect) / (camera.right - camera.left)) * bounds.width * 2,
    );
    const height = Math.max(
      56,
      (clue.radius[1] / (camera.top - camera.bottom)) * bounds.height * 2,
    );
    target.style.left = `${bounds.left + ((projected.x + 1) * bounds.width) / 2}px`;
    target.style.top = `${bounds.top + ((1 - projected.y) * bounds.height) / 2}px`;
    target.style.width = `${width}px`;
    target.style.height = `${height}px`;
    hovered = clue;
    target.dataset.clue = clue.id;
    target.hidden = false;
    canvas.classList.add('clue-hovered');
  }
  events.on(target, 'click', () => discover(hovered));
  events.on(target, 'pointermove', (event) => move(event.clientX, event.clientY));
  events.on(target, 'pointerleave', hide);
  events.on(canvas, 'pointerleave', (event) => {
    if (event.relatedTarget !== target && !target.contains(event.relatedTarget)) hide();
  });
  return { move, hide, tap: (x, y) => discover(pick(x, y)), dispose: () => target.remove() };
}
