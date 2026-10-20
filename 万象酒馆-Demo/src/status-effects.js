/** Consume committed engine annotations; forecasts never call this presenter. */
export function triggeredStatusVisuals(event, before) {
  const signals = [...(event.statusTriggers || [])];
  if (event.type === 'regen')
    for (const [id, unit] of Object.entries(event.after.units))
      if (unit.hp > (before.units[id]?.hp ?? unit.hp)) signals.push({ id, type: 'regen' });
  for (const [id, unit] of Object.entries(event.after.units)) {
    const prior = before.units[id]?.buffs || {};
    for (const [key, val] of Object.entries(unit.buffs || {})) {
      if (
        val > (prior[key] || 0) &&
        ['vulnerable', 'weak', 'slow', 'immobilize', 'bleed', 'poison'].includes(key)
      ) {
        if (!signals.some((s) => s.id === id && s.type === key)) {
          signals.push({ id, type: key, value: val });
        }
      }
    }
  }
  return signals;
}

export function createStatusEffects({ animate, ring, sparks }) {
  function trigger(signal, point, delay = 0) {
    const { type } = signal;
    const color = {
      poison: '#b6da81',
      bleed: '#e59b9a',
      regen: '#b9e5af',
      vulnerable: '#d8b4fe',
      weak: '#93c5fd',
      slow: '#fde047',
      immobilize: '#c084fc',
    }[type];
    if (!color || !point) return;
    const halo = document.createElement('div');
    halo.className = `status-aura status-${type}`;
    halo.dataset.statusTrigger = type;
    halo.style.cssText = `left:${point.x}px;top:${point.y}px;--fx:${color}`;
    halo.innerHTML =
      type === 'bleed'
        ? '<svg viewBox="0 0 100 100"><path d="M24 30 72 66M35 24 78 55" stroke="currentColor" stroke-width="3"/><path d="M34 58q-12 15-2 17 10-1 2-17zM65 67q-10 16 0 17 10-1 0-17z" fill="currentColor"/></svg>'
        : type === 'poison'
          ? '<i></i><i></i><i></i><svg viewBox="0 0 100 100"><path d="M34 35h32v9h9v23H25V44h9zM40 25h20v10H40z" fill="none" stroke="currentColor" stroke-width="2"/><path d="M37 49h6v7h-6zM57 49h6v7h-6zM44 62h12v4H44z" fill="currentColor"/></svg>'
          : type === 'regen'
            ? '<svg viewBox="0 0 100 100"><path d="M50 76V30M50 59Q20 58 25 37q27-3 25 22M50 47q0-23 25-23 7 22-25 23" fill="none" stroke="currentColor" stroke-width="3"/><path d="M46 10h8v8h-8zM13 54h6v6h-6zM80 63h7v7h-7z" fill="currentColor"/></svg>'
            : type === 'vulnerable'
              ? '<svg viewBox="0 0 100 100"><path d="m50 15 30 16v30L50 85 20 61V31z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="m35 40 30 20M65 40 35 60" stroke="#f472b6" stroke-width="3"/></svg>'
              : type === 'weak'
                ? '<svg viewBox="0 0 100 100"><path d="M50 20v60M35 60l15 20 15-20" fill="none" stroke="currentColor" stroke-width="3.5"/><path d="M25 35l25 30 25-30" fill="none" stroke="#60a5fa" stroke-width="2"/></svg>'
                : type === 'slow'
                  ? '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="6 4"/><path d="M50 30v20l14 8" fill="none" stroke="currentColor" stroke-width="3"/></svg>'
                  : '<svg viewBox="0 0 100 100"><rect x="30" y="38" width="40" height="34" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M38 38V28a12 12 0 0 1 24 0v10" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="50" cy="55" r="4" fill="currentColor"/></svg>';
    animate(
      halo,
      [
        { opacity: 0, scale: '.85' },
        { opacity: 0.85, scale: '1', offset: 0.2 },
        { opacity: 0, scale: '1.1', translate: type === 'bleed' ? '0 12px' : '0 -14px' },
      ],
      680,
      delay,
    );
    for (let i = 0; i < 6; i++) {
      const mote = document.createElement('i');
      mote.className = `status-mote status-mote-${type}`;
      mote.style.cssText = `left:${point.x + Math.cos(i * 1.05) * 28}px;top:${point.y + Math.sin(i * 1.05) * 16}px;--fx:${color}`;
      animate(
        mote,
        [
          { opacity: 0, scale: '.5' },
          { opacity: 1, scale: '1', offset: 0.2 },
          {
            opacity: 0,
            translate: `${Math.sin(i * 2) * 16}px ${type === 'bleed' ? 40 : -40}px`,
            scale: '.2',
          },
        ],
        620,
        delay + i * 13,
      );
    }
  }
  function shield(point, broken, delay) {
    const element = document.createElement('div');
    element.className = 'shield-membrane';
    element.dataset.effect = broken ? 'shield-break' : 'shield-absorb';
    element.style.cssText = `left:${point.x}px;top:${point.y}px`;
    element.innerHTML =
      '<svg viewBox="0 0 100 120"><path d="m50 7 36 18v41L50 109 14 66V25zM50 7v102M14 25l72 41M86 25 14 66" fill="#b9dbef14" stroke="#b8dfe7" stroke-width="2"/></svg>';
    animate(
      element,
      [
        { opacity: 0, scale: '.8' },
        { opacity: 0.9, scale: '1.03', offset: 0.2 },
        { opacity: 0, scale: broken ? '1.24' : '1.05' },
      ],
      420,
      delay,
    );
    if (broken) sparks(point, '#c0dce8', 12, delay);
    else ring(point, '#b9dbe0', 'shield-absorption', delay);
  }
  return { trigger, shield };
}
