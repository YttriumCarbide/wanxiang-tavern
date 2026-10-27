/** Rotated iframes otherwise let Chromium treat a vertical in-game swipe as browser Back. */
export function mountRotatedScrolling(events) {
  if (window === window.top || !window.top.document.body.classList.contains('landscape-host'))
    return;
  let gesture = null;
  function scrollers(target) {
    const result = [];
    for (let node = target instanceof Element ? target : null; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (/(auto|scroll)/u.test(style.overflowY) && node.scrollHeight > node.clientHeight + 1)
        result.push(node);
    }
    return result;
  }
  events.on(
    document,
    'touchstart',
    (event) => {
      if (event.touches.length !== 1) {
        gesture = null;
        return;
      }
      const touch = event.touches[0];
      const targets = scrollers(event.target);
      gesture = targets.length
        ? { x: touch.clientX, y: touch.clientY, previous: touch.clientY, targets, scrolling: false }
        : null;
    },
    { passive: true, capture: true },
  );
  events.on(
    document,
    'touchmove',
    (event) => {
      if (!gesture || event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!gesture.scrolling) {
        const vertical = Math.abs(touch.clientY - gesture.y);
        if (vertical < 5 || vertical < Math.abs(touch.clientX - gesture.x)) return;
        gesture.scrolling = true;
      }
      if (event.cancelable) event.preventDefault();
      let delta = gesture.previous - touch.clientY;
      for (const node of gesture.targets) {
        const previous = node.scrollTop;
        node.scrollTop += delta;
        delta -= node.scrollTop - previous;
        if (Math.abs(delta) < 1) break;
      }
      gesture.previous = touch.clientY;
    },
    { passive: false, capture: true },
  );
  for (const name of ['touchend', 'touchcancel'])
    events.on(
      document,
      name,
      () => {
        gesture = null;
      },
      { passive: true },
    );
}
