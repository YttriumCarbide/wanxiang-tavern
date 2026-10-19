import { combatSprites, ATTACK_TIMING } from './combat-art.js';

export function createAttackEffects({ animate, ring, sparks, slash }) {
  function sprite(kind, point, art, color, size, frames, duration) {
    const element = document.createElement('div');
    element.className = `combat-sprite ${kind}`;
    element.dataset.effect = kind;
    element.style.cssText = `left:${point.x}px;top:${point.y}px;width:${size}px;height:${size}px;--fx:${color}`;
    element.innerHTML = `<svg viewBox="0 0 64 64" shape-rendering="crispEdges" aria-hidden="true">${combatSprites[art]}</svg>`;
    animate(element, frames, duration);
    return element;
  }
  function projectile(kind, art, source, target, color, duration, arc = 0, size = 44) {
    const dx = target.x - source.x,
      dy = target.y - source.y;
    const element = sprite(
      kind,
      source,
      art,
      color,
      size,
      [
        { opacity: 0, translate: '0 0', scale: '.3' },
        { opacity: 1, translate: '0 0', scale: '1', offset: 0.22 },
        { opacity: 1, translate: `${dx * 0.45}px ${dy * 0.45 - arc}px`, offset: 0.46 },
        { opacity: 1, translate: `${dx}px ${dy}px`, scale: '.85', offset: 0.74 },
        { opacity: 0, translate: `${dx}px ${dy}px`, scale: '1.35' },
      ],
      duration,
    );
    if (kind === 'bow-arrow') element.style.setProperty('--heading', `${Math.atan2(dy, dx)}rad`);
  }
  function impact(kind, art, target, color, duration, size = 88) {
    sprite(
      kind,
      target,
      art,
      color,
      size,
      [
        { opacity: 0, translate: '0 -64px', rotate: '-28deg', scale: '.65' },
        { opacity: 0, translate: '0 -64px', rotate: '-28deg', offset: 0.42 },
        { opacity: 1, translate: '0 -34px', rotate: '-18deg', offset: 0.56 },
        { opacity: 1, translate: '0 4px', rotate: '12deg', scale: '1.05', offset: 0.74 },
        { opacity: 0, translate: '0 8px', rotate: '14deg', scale: '.9' },
      ],
      duration,
    );
  }
  function charge(kind, art, source, color, duration, size = 60) {
    sprite(
      kind,
      source,
      art,
      color,
      size,
      [
        { opacity: 0, translate: '-8px 12px', rotate: '-20deg', scale: '.75' },
        { opacity: 1, translate: '-8px -8px', rotate: '0deg', scale: '1', offset: 0.22 },
        { opacity: 0.85, translate: '-8px -8px', rotate: '8deg', offset: 0.46 },
        { opacity: 0, translate: '-8px 0', scale: '.8' },
      ],
      duration,
    );
  }
  function strike(style, source, target, color) {
    const duration = ATTACK_TIMING[style];
    if (!duration || !source) return;
    const hitRing = (color, type = 'impact-ring') => ring(target, color, type, duration * 0.7);
    const hitSparks = (color, count) => sparks(target, color, count, duration * 0.7);
    if (style === 'sword') {
      charge('sword-windup', 'sword', source, '#ead6a1', duration, 68);
      impact('sword-cut', 'sword', target, '#fff0c5', duration, 104);
      slash(target, '#f8dfb1', false, duration * 0.7);
      hitSparks('#f5d7a3', 9);
      slash({ x: target.x + 9, y: target.y - 5 }, '#b9d7cf', false, duration * 0.78);
    } else if (style === 'staff') {
      charge('staff-charge', 'staff', source, color, duration, 72);
      ring(source, color, 'cast-rune');
      projectile('staff-bolt', 'orb', source, target, color, duration, 15, 42);
      hitRing(color);
      hitSparks(color, 8);
      ring(source, color, 'cast-rune', duration * 0.15);
    } else if (style === 'bow') {
      charge('bow-draw', 'bow', source, '#e9c790', duration, 76);
      projectile('bow-arrow', 'arrow', source, target, '#e5d6a2', duration, 0, 72);
      hitSparks('#f2e0b1', 8);
      hitRing('#d3c28b', 'arrow-impact');
    } else if (style === 'slime-bounce') {
      projectile(style, 'slime', source, target, '#a6ce83', duration, 90, 78);
      hitRing('#8bb87b', 'slime-splat');
      hitSparks('#9bbe77', 9);
    } else if (style === 'mushroom-bonk') {
      projectile('mushroom-hop', 'mushroom', source, target, '#e3bd86', duration, 62, 58);
      impact(style, 'mushroom', target, '#e3bd86', duration, 78);
      hitSparks('#ddc291', 5);
    } else if (style === 'pebble-shards') {
      for (const offset of [-28, 0, 28])
        projectile(
          style,
          'stone',
          { x: source.x + offset, y: source.y },
          target,
          '#b4c1b5',
          duration,
          40 + Math.abs(offset),
          32,
        );
      hitRing('#b3beaa', 'stone-fracture');
      hitSparks('#acb8a8', 10);
    } else if (style === 'claw-pounce') {
      projectile(style, 'fang', source, target, '#e99a89', duration, 35, 72);
      slash(target, '#f0b1a1', true, duration * 0.7);
      hitSparks('#c68178', 6);
    } else if (style === 'stone-slam' || style === 'gate-crush') {
      impact(
        style,
        style === 'stone-slam' ? 'hammer' : 'fist',
        target,
        '#e1c994',
        duration,
        style === 'gate-crush' ? 132 : 102,
      );
      hitRing('#cfb680', 'shockwave');
      hitRing('#bbaa89', 'stone-fracture');
      hitSparks('#cfbe94', style === 'gate-crush' ? 16 : 11);
    } else if (style === 'ember-bolt') {
      ring(source, '#c78bba', 'curse-effect');
      projectile(style, 'ember', source, target, '#eba977', duration, 22, 64);
      hitRing('#d88678', 'ember-burst');
      hitSparks('#e9a16d', 9);
    } else if (style === 'spore-volley') {
      ring(source, '#c3a7df', 'cast-rune');
      for (const offset of [-32, 0, 32])
        projectile(
          style,
          'spore',
          { x: source.x + offset, y: source.y },
          target,
          '#c3add9',
          duration,
          68 + Math.abs(offset),
          42,
        );
      hitRing('#b7a3ce', 'spore-cloud');
      hitSparks('#b8d9b6', 11);
    } else if (style === 'crystal-ram') {
      charge(style, 'crystal', source, '#b3eaf0', duration, 75);
      projectile('crystal-lance', 'crystal', source, target, '#9edee6', duration, 36, 68);
      hitRing('#b5e6ed', 'stone-fracture');
      hitSparks('#c6f3e6', 13);
    } else if (style === 'cinder-spark') {
      for (const offset of [-20, 0, 20])
        projectile(
          style,
          'ember',
          { x: source.x + offset, y: source.y },
          target,
          '#ffc986',
          duration,
          42 + Math.abs(offset),
          36,
        );
      hitRing('#efb579', 'ember-burst');
      hitSparks('#eeb46e', 12);
    } else if (style === 'tide-ribbon') {
      ring(source, '#b5e7da', 'cast-rune');
      for (const offset of [-16, 16])
        projectile(
          style,
          'tide',
          { x: source.x + offset, y: source.y },
          target,
          '#83d4d6',
          duration,
          72,
          54,
        );
      hitRing('#b7ece5', 'tidal-wave');
      hitSparks('#b5dfc6', 9);
    } else if (style === 'astral-cascade') {
      charge(style, 'star', source, '#dfd3a8', duration, 96);
      for (const offset of [-34, 0, 34])
        projectile(
          style,
          'star',
          { x: source.x + offset, y: source.y - 20 },
          target,
          '#b3e5d9',
          duration,
          80 + Math.abs(offset),
          58,
        );
      hitRing('#a7e4dc', 'tidal-wave');
      hitRing('#e5c995', 'cast-rune');
      hitSparks('#c8ead9', 15);
    }
  }
  return { strike };
}
