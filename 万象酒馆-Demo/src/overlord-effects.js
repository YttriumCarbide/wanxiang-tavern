import { OVERLORD_FX_ART } from './overlord-effect-art.js';

const WEAPONS = Object.freeze({
  poison: {
    color: '#58d68d',
    pixels: 'acid-splash',
    palette: ['#153c31', '#389e69', '#82efaf', '#e3ffb7'],
  },
  bleed: {
    color: '#ef5350',
    pixels: 'dagger-flurry',
    palette: ['#411820', '#a93644', '#ff7766', '#ffe2c9'],
  },
  weak: {
    color: '#bc8ee4',
    pixels: 'hex-sigil',
    palette: ['#392349', '#7855a1', '#cc9cf0', '#eee0ff'],
  },
  vulnerable: {
    color: '#f5b041',
    pixels: 'thrust',
    palette: ['#493011', '#b57a33', '#ffca68', '#fff0cc'],
  },
});
const SCALE = '#c9a7f2';
const RIFT = '#b693e1';
const MOON = '#d8f3ff';
const SCALE_PALETTE = ['#392943', '#73589e', '#b898e2', '#eee2fc'];
const RIFT_PALETTE = ['#211930', '#584272', '#ad8ed4', '#e6d4f5'];
const MOTIONS = Object.freeze({
  lock: [
    { opacity: 0, scale: '.35', rotate: '-40deg' },
    { opacity: 1, scale: '1.12', rotate: '8deg', offset: 0.2 },
    { opacity: 0.96, scale: '1', rotate: '0deg', offset: 0.56 },
    { opacity: 0, scale: '.78', translate: '0 -22px' },
  ],
  rise: [
    { opacity: 0, scale: '.48', translate: '0 30px' },
    { opacity: 1, scale: '.96', translate: '0 4px', offset: 0.27 },
    { opacity: 0.9, scale: '1.05', translate: '0 -8px', offset: 0.63 },
    { opacity: 0, scale: '1.1', translate: '0 -24px' },
  ],
  fracture: [
    { opacity: 0.28, scale: '.84', rotate: '5deg' },
    { opacity: 1, scale: '1.07', rotate: '-4deg', offset: 0.16 },
    { opacity: 0.78, scale: '1.2', offset: 0.42 },
    { opacity: 0, scale: '1.54', translate: '0 14px' },
  ],
  rift: [
    { opacity: 0, scale: '.12 .35' },
    { opacity: 0.9, scale: '1.12 .84', offset: 0.28 },
    { opacity: 1, scale: '1 1', offset: 0.52 },
    { opacity: 0, scale: '1.32 .63', translate: '0 12px' },
  ],
  gather: [
    { opacity: 0.22, scale: '1.28', rotate: '-15deg' },
    { opacity: 0.88, scale: '.95', rotate: '-4deg', offset: 0.36 },
    { opacity: 1, scale: '.68', rotate: '0deg', offset: 0.63 },
    { opacity: 0, scale: '.22' },
  ],
});

function cueNode(signal, role, id, point, color, size) {
  const element = document.createElement('div');
  element.className = 'overlord-mechanic-fx';
  element.dataset.overlordEffect = signal.type;
  element.dataset.effectRole = role;
  element.dataset.unitId = id;
  element.setAttribute('aria-hidden', 'true');
  element.style.left = point.x + 'px';
  element.style.top = point.y + 'px';
  element.style.width = size + 'px';
  element.style.height = size + 'px';
  element.style.marginLeft = -size / 2 + 'px';
  element.style.marginTop = -size / 2 + 'px';
  element.style.setProperty('--overlord-fx', color);
  return element;
}

/** All cues are keyed by authored engine events and share the battle layer's animation lifetime. */
export function createOverlordEffects({ center, animate, pixelFx, reduced }) {
  function play(event, impactDelay, retiredAnchors) {
    let end = 0;

    function pointFor(id) {
      return id && (retiredAnchors?.get(id) || center(id));
    }

    function mark(signal, id, art, color, options = {}) {
      const point = pointFor(id);
      if (!point) return;
      const {
        delay = impactDelay,
        duration = 560,
        lift = 0,
        motion = 'rise',
        role = 'mark',
      } = options;
      const size = Math.round(Math.min(124, Math.max(54, point.width * (options.scale || 0.86))));
      const anchor = { x: point.x, y: point.y + point.height * lift };
      const node = cueNode(signal, role, id, anchor, color, size);
      node.innerHTML = OVERLORD_FX_ART[art];
      const frames = reduced
        ? [
            { opacity: 0, scale: '1', translate: '0 0' },
            { opacity: 0.9, scale: '1', translate: '0 0', offset: 0.18 },
            { opacity: 0.9, scale: '1', translate: '0 0', offset: 0.74 },
            { opacity: 0, scale: '1', translate: '0 0' },
          ]
        : MOTIONS[motion];
      animate(node, frames, reduced ? 440 : duration, delay);
      end = Math.max(end, delay + (reduced ? 440 : duration));
      if (!reduced && options.pixels) {
        pixelFx.spawn(options.pixels, {
          ...anchor,
          anchorToOrigin: true,
          palette: options.palette || SCALE_PALETTE,
          delay: delay + (options.pixelDelay || 0),
          scale: Math.min(1.32, size / 90),
          light: 0.68,
          zIndex: 0,
        });
      }
    }

    function transfer(signal, fromId, toId, color, delay, duration, bend) {
      if (reduced || fromId === toId) return;
      const from = pointFor(fromId),
        to = pointFor(toId);
      if (!from || !to) return;

      const dx = to.x - from.x,
        dy = to.y - from.y;
      const lane = bend * Math.min(65, Math.max(16, Math.abs(dx) * 0.27));
      const rotation = (Math.atan2(dy, dx) * 180) / Math.PI;
      const distance = Math.hypot(dx, dy);
      const node = cueNode(signal, 'transfer', fromId, from, color, 18);
      node.dataset.destinationId = toId;
      node.style.rotate = rotation + 'deg';
      node.style.setProperty('--trail-length', Math.round(Math.min(74, distance * 0.32)) + 'px');
      const at = (fraction, rise = 0) => dx * fraction + 'px ' + (dy * fraction + rise) + 'px';
      node.innerHTML = '<span class="overlord-mechanic-fx-trail"></span>';
      animate(
        node,
        [
          { opacity: 0, translate: at(0), scale: '.32' },
          { opacity: 0.92, translate: at(0.23, lane * 0.86), scale: '1', offset: 0.28 },
          { opacity: 0.9, translate: at(0.67, lane), scale: '.86', offset: 0.62 },
          { opacity: 0, translate: at(1), scale: '.25' },
        ],
        duration,
        delay,
      );
      end = Math.max(end, delay + duration);
    }

    function playLock(signal) {
      const weapon = WEAPONS[signal.weapon?.buff];
      if (!weapon) return;
      const color = /^#[0-9a-f]{6}$/i.test(signal.weapon.color)
        ? signal.weapon.color
        : weapon.color;
      mark(signal, signal.actor, signal.weapon.buff, color, {
        delay: 0,
        duration: 680,
        lift: -0.35,
        scale: 0.68,
        motion: 'lock',
        pixels: weapon.pixels,
        palette: weapon.palette,
        pixelDelay: 100,
      });
    }

    function playReflect(signal) {
      const color = WEAPONS[signal.buff]?.color || MOON;
      mark(signal, signal.target, 'reflect', MOON, {
        motion: 'gather',
        role: 'origin',
        scale: 0.68,
      });
      transfer(signal, signal.target, signal.id, color, impactDelay + 45, 320, -1);
      mark(signal, signal.id, 'reflect', color, {
        delay: impactDelay + (reduced ? 0 : 290),
        duration: 340,
        motion: 'fracture',
        role: 'target',
        scale: 0.57,
      });
    }

    function playArmor(signal) {
      if (signal.type === 'eclipsescaleGrow') {
        mark(signal, signal.id, 'grow', SCALE, {
          lift: 0.02,
          motion: 'rise',
          pixels: 'divine-shield',
          pixelDelay: 70,
        });
        return;
      }
      const broken = signal.type === 'eclipsescaleBreak';
      mark(signal, signal.id, broken ? 'break' : 'shed', broken ? '#efe0ff' : SCALE, {
        duration: broken ? 700 : 520,
        motion: 'fracture',
        scale: broken ? 1.08 : 0.86,
        pixels: 'dark-explosion',
      });
    }

    function playRally(signal) {
      mark(signal, signal.id, 'rally', RIFT, {
        lift: 0.28,
        duration: 600,
        motion: 'rift',
        role: 'origin',
      });
      signal.targets?.forEach((id, index) => {
        mark(signal, id, 'rally', '#debcff', {
          delay: impactDelay + (reduced ? 0 : 95 + index * 65),
          duration: 590,
          lift: 0.25,
          motion: 'rift',
          role: 'target',
          pixels: 'shadow-flames',
          palette: RIFT_PALETTE,
        });
      });
    }

    function playConsume(signal) {
      signal.targets?.forEach((id, index) => {
        const delay = impactDelay + (reduced ? 0 : index * 65);
        mark(signal, id, 'consume', RIFT, { delay, role: 'origin', motion: 'gather', scale: 0.72 });
        transfer(signal, id, signal.id, RIFT, delay + 60, 340, index % 2 ? -1 : -0.82);
      });
      mark(signal, signal.id, 'consume', SCALE, {
        delay: impactDelay + (reduced ? 0 : 355),
        duration: 460,
        motion: 'gather',
        role: 'target',
        pixels: 'soul-drain',
        palette: RIFT_PALETTE,
      });
    }

    if (event.type === 'hiddenWeaponLock') playLock(event);
    if (event.type === 'counter' && event.isOverlordCounter) {
      const reject = event.overlordCounterReason === 'collected-reject';
      const casterColor = reject ? '#f0c368' : '#d98b4e';
      const art = reject ? 'collect' : 'counter';
      mark({ type: 'overlordCounter' }, event.actor, art, casterColor, {
        delay: 40,
        duration: 460,
        motion: 'lock',
        role: 'origin',
        scale: 0.72,
      });
      for (const tid of event.targets || []) {
        transfer(
          { type: 'overlordCounter' },
          event.actor,
          tid,
          casterColor,
          impactDelay * 0.45,
          260,
          -0.7,
        );
        mark({ type: 'overlordCounter' }, tid, 'counter', reject ? '#d97bf5' : '#f29e61', {
          delay: impactDelay * 0.72,
          duration: 360,
          motion: 'fracture',
          role: 'target',
          scale: 0.64,
          pixels: reject ? 'arcane-beam' : 'heavy-cleave',
        });
      }
    }
    if (event.type === 'enemy' && event.clip === 'Talon_Rend' && !event.fixedFirstSlot) {
      mark({ type: 'overlordSlam' }, event.actor, 'counter', '#f0c368', {
        delay: impactDelay * 0.4,
        duration: 520,
        motion: 'fracture',
        scale: 1.04,
        pixels: event.actor === 'silverCrownSyndicateArchon' ? 'holy-slash' : 'ground-slam',
      });
    }
    const signals = event.statusTriggers || [];
    const reflectSeen = new Map();
    const armorBroken = new Set(
      signals.filter((signal) => signal.type === 'eclipsescaleBreak').map((signal) => signal.id),
    );
    for (const signal of signals) {
      switch (signal.type) {
        case 'negativeReflect': {
          // Several damage packets can return the same weapon from the same target in one event.
          const key = signal.id + '/' + signal.target;
          if (reflectSeen.has(key)) break;
          reflectSeen.set(key, true);
          playReflect(signal);
          break;
        }
        case 'eclipsescaleShed':
          if (!armorBroken.has(signal.id)) playArmor(signal);
          break;
        case 'eclipsescaleGrow':
        case 'eclipsescaleBreak':
          playArmor(signal);
          break;
        case 'warlordRally':
          playRally(signal);
          break;
        case 'warlordConsume':
          playConsume(signal);
          break;
      }
    }
    return end;
  }

  return { play };
}
