import { APEP_PALETTE } from './apep-presentation.js';

export function createApepEffects({ pixelFx, animate, ring, sparks, reduced }) {
  function spawn(id, point, options = {}) {
    if (!point) return;
    pixelFx.spawn(id, {
      x: point.x,
      y: point.y,
      palette: APEP_PALETTE,
      anchorToOrigin: true,
      light: 0.72,
      ...options,
    });
  }

  function surge(kind, delay, extraClass = '') {
    const element = document.createElement('div');
    element.className = `apep-screen-surge ${extraClass}`.trim();
    element.dataset.effect = `apep-${kind}-surge`;
    element.dataset.surge = kind;
    const isHeavy = ['plague', 'tide', 'eclipse', 'tick'].includes(kind);
    animate(
      element,
      [
        { opacity: 0, transform: 'scale(1.04)' },
        { opacity: isHeavy ? 0.96 : 0.85, transform: 'scale(1)', offset: 0.14 },
        { opacity: isHeavy ? 0.52 : 0.25, transform: 'scale(1.01)', offset: 0.45 },
        { opacity: 0, transform: 'scale(1.03)' },
      ],
      isHeavy ? 1280 : 950,
      delay,
    );
  }

  function aperture(delay = 0, duration = 1120) {
    if (reduced) return;
    const gate = document.createElement('div');
    gate.className = 'apep-gaze-aperture';
    gate.dataset.effect = 'apep-gaze-aperture';
    animate(
      gate,
      [
        { opacity: 0, '--apep-jaw': '0%' },
        { opacity: 0.94, '--apep-jaw': '100%', offset: 0.22 },
        { opacity: 0.88, '--apep-jaw': '100%', offset: 0.62 },
        { opacity: 0, '--apep-jaw': '0%' },
      ],
      duration,
      delay,
    );
  }

  function link(kind, from, to, arrival) {
    if (reduced || !from || !to) return;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 2) return;
    const element = document.createElement('div');
    element.className = 'apep-strike-trail';
    element.dataset.effect = `apep-${kind}-trail`;
    element.dataset.trail = kind;
    element.style.left = `${from.x}px`;
    element.style.top = `${from.y}px`;
    element.style.width = `${length}px`;
    element.style.rotate = `${Math.atan2(dy, dx)}rad`;
    const travel = kind === 'beam' ? 110 : 270;
    animate(
      element,
      [
        { opacity: 0, scale: '0.07 0.4' },
        { opacity: 1, scale: '1 1', offset: travel / (travel + 270) },
        { opacity: 0, scale: '1 0.2' },
      ],
      travel + 270,
      Math.max(0, arrival - travel),
    );
  }

  function attack(move, source, targets, floors, hitAt) {
    spawn(move.windup, source, { scale: 0.94, speedRate: 2, maxDuration: 1150 });
    if (['plague', 'tide', 'eclipse'].includes(move.type)) {
      surge(move.type, hitAt, 'apep-border-crush');
    }
    if (['gaze', 'eclipse'].includes(move.type)) {
      aperture(Math.max(0, hitAt - 180), move.type === 'eclipse' ? 1320 : 1040);
    }
    if (move.type === 'shell' && source) {
      spawn('divine-shield', source, { delay: hitAt * 0.65, scale: 1.28, maxDuration: 1150 });
      ring(source, '#d18782', 'cast-rune', hitAt * 0.75);
    }
    if (move.type === 'gaze') {
      spawn('life-steal', source, { delay: hitAt + 140, scale: 1.18, maxDuration: 1200 });
    }
    const landings = move.type === 'plague' ? floors : targets;
    landings.forEach((point, index) => {
      const arrival = hitAt + index * (move.type === 'plague' ? 65 : 35);
      link(move.link, source, point, arrival);
      spawn(move.hit, point, {
        delay: arrival - (move.type === 'tide' ? 390 : 80),
        scale: move.type === 'gaze' || move.type === 'eclipse' ? 1.32 : 1.08,
        speedRate: move.type === 'tide' ? 3.1 : 1.85,
        maxDuration: 1380,
      });
      ring(point, '#f48684', 'apep-landing-ripple', arrival);
      if (!reduced) sparks(point, '#ffc9ad', move.type === 'eclipse' ? 10 : 7, arrival);
    });
  }

  function tick(floors, targets, delay = 0) {
    surge('tick', delay, 'apep-border-crush');
    for (const point of floors) {
      ring(point, '#c74f68', 'apep-landing-ripple', delay);
    }
    for (const point of targets) {
      spawn('shadow-tendrils', point, { delay, scale: 0.94, speedRate: 2.4, maxDuration: 960 });
    }
  }

  function phase(source) {
    surge('eclipse', 280, 'apep-border-crush');
    aperture(180, 1450);
    spawn('black-hole', source, { scale: 1.56, speedRate: 2.0, delay: 240, maxDuration: 1350 });
    spawn('mana-burst', source, { scale: 1.24, delay: 450, maxDuration: 950 });
  }

  return { attack, tick, phase };
}
