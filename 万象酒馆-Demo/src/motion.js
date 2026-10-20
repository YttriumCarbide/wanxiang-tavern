import { html } from './shared/html.js';
import { portraitUrl } from './catalog.js';

export function captureLayout() {
  const map = new Map();
  document.querySelectorAll('[data-motion],[data-unit],[data-rear]').forEach((el) => {
    const key = el.dataset.motion || el.dataset.unit || el.dataset.rear;
    if (!el.getBoundingClientRect().width) return;
    map.set(key, { rect: el.getBoundingClientRect(), el, html: el.outerHTML });
  });
  return map;
}
export function unitOrigins(map) {
  return new Map(
    [...map]
      .filter(([k]) => !k.startsWith('action-') && !k.startsWith('enemy-'))
      .map(([k, v]) => [k, v.rect]),
  );
}
export function animateLayout(old, definitions) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const current = new Set();
  document.querySelectorAll('[data-motion],[data-rear]').forEach((el) => {
    const key = el.dataset.motion || el.dataset.rear,
      previous = old.get(key),
      rect = el.getBoundingClientRect();
    current.add(key);
    if (previous) {
      const dx = previous.rect.left - rect.left,
        dy = previous.rect.top - rect.top;
      if (el.dataset.rear && previous.el.dataset.unit) {
        const ghost = document.createElement('div');
        ghost.className = 'card-flight';
        const def = Array.isArray(definitions)
          ? definitions.find((item) => item?.id === key)
          : definitions?.[key];
        ghost.innerHTML = html`<img src="${portraitUrl(def)}" alt="" />`;
        document.body.append(ghost);
        const a = previous.rect,
          b = rect;
        ghost
          .animate(
            [
              {
                transform: `translate(${a.left}px,${a.top}px) scale(${a.width / 116},${a.height / 170})`,
                transformOrigin: '0 0',
                opacity: 1,
              },
              {
                transform: `translate(${b.left}px,${b.top}px) scale(${b.width / 116},${b.height / 170}) rotate(6deg)`,
                transformOrigin: '0 0',
                opacity: 0,
              },
            ],
            { duration: 560, easing: 'cubic-bezier(.2,.8,.2,1)' },
          )
          .finished.catch(() => {})
          .finally(() => ghost.remove());
      } else if (Math.abs(dx) + Math.abs(dy) > 1)
        el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'translate(0,0)' }], {
          duration: 400,
          easing: 'cubic-bezier(.2,.8,.2,1)',
        });
    } else if (el.dataset.motion)
      el.animate(
        [
          { opacity: 0, transform: 'scale(.9) translateY(8px)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 280, easing: 'ease-out' },
      );
  });
  for (const [key, item] of old) {
    if (current.has(key) || !key.startsWith('action-')) continue;
    const ghost = document.createElement('div');
    ghost.innerHTML = item.html;
    const el = ghost.firstElementChild;
    [el, ...el.querySelectorAll('*')].forEach((n) => {
      for (const a of [...n.attributes])
        if (a.name === 'id' || a.name.startsWith('data-')) n.removeAttribute(a.name);
    });
    el.classList.add('ui-exit');
    Object.assign(el.style, {
      position: 'fixed',
      left: `${item.rect.left}px`,
      top: `${item.rect.top}px`,
      right: 'auto',
      bottom: 'auto',
      width: `${item.rect.width}px`,
      height: `${item.rect.height}px`,
    });
    document.body.append(el);
    el.animate(
      [
        { opacity: 0.75, transform: 'none' },
        { opacity: 0, transform: 'translateX(-22px) scale(.92)' },
      ],
      { duration: 230, easing: 'ease-in' },
    )
      .finished.catch(() => {})
      .finally(() => el.remove());
  }
}
export function roundBanner(text) {
  const el = document.getElementById('round-banner');
  el.textContent = text;
  el.getAnimations().forEach((a) => a.cancel());
  el.animate(
    [
      { opacity: 0, translate: '0 15px' },
      { opacity: 1, translate: '0 0', offset: 0.18 },
      { opacity: 1, translate: '0 0', offset: 0.7 },
      { opacity: 0, translate: '0 -12px' },
    ],
    { duration: 1500, easing: 'ease-out' },
  );
}
