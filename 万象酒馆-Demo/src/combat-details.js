/** Small purely visual additions: timeline hand-off and fading marks on the board. */
export function createCombatDetails({ animate }) {
  function thread(layer, point, color, duration) {
    if (!point) return;
    const slot = document.querySelector('.time-action.playing,.time-cell.playing');
    if (!slot) return;
    const rect = slot.getBoundingClientRect();
    const bounds = layer.getBoundingClientRect();
    const x = rect.left + rect.width * 0.5 - bounds.left;
    const y = rect.top - bounds.top;
    const element = document.createElement('div');
    element.className = 'action-thread';
    element.dataset.effect = 'timeline-thread';
    element.innerHTML = `<svg viewBox="0 0 ${bounds.width} ${bounds.height}"><path d="M${x} ${y} Q${(x + point.x) / 2} ${y - 60} ${point.x} ${point.y}" pathLength="1" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray=".1 .9"/></svg>`;
    animate(
      element,
      [
        { opacity: 0, strokeDashoffset: '1' },
        { opacity: 0.6, offset: 0.16 },
        { opacity: 0, strokeDashoffset: '0' },
      ],
      Math.min(duration * 0.6, 430),
    );
  }
  function trace(point, style, delay) {
    const element = document.createElement('div');
    element.className = `ground-trace trace-${style === 'bow' ? 'arrow' : style === 'sword' ? 'cut' : 'rune'}`;
    element.dataset.effect = 'ground-trace';
    element.style.cssText = `left:${point.x}px;top:${point.y + (point.height ? point.height * 0.7 + 25 : 28)}px`;
    animate(
      element,
      [
        { opacity: 0, scale: '.8' },
        { opacity: 0.35, scale: '1', offset: 0.1 },
        { opacity: 0, scale: '1.06' },
      ],
      2100,
      delay,
    );
  }
  return { thread, trace };
}
