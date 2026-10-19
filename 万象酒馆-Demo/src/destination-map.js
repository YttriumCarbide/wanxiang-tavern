// Presentation only: routes and encounters remain owned by exploration.js.
import { MAP_IDS } from './content/biomes.js';

function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/** Seeded wandering landmarks, without depth columns or equal branch spacing. */
export function destinationMap(entries) {
  const positions = new Map();
  const siblings = new Map();
  for (const entry of [...entries].sort((a, b) => a.sequence - b.sequence)) {
    const parent = positions.get(entry.parentId);
    const ordinal = siblings.get(entry.parentId) || 0;
    siblings.set(entry.parentId, ordinal + 1);
    const rng = random(entry.seed);
    const mapPhase = MAP_IDS.indexOf(entry.map) * 0.83;
    let x = 155 + ordinal * 235 + rng() * 35;
    let y = 400 + Math.sin(ordinal * 2.4) * 225 + rng() * 25;
    if (parent) {
      const turn = Math.sin(entry.sequence * 1.7 + mapPhase) * 1.15 + (rng() - 0.5) * 0.7;
      let distance = 195 + rng() * 105;
      for (let attempt = 0; attempt < 100; attempt++) {
        const angle = parent.heading + turn + attempt * 2.39996;
        x = parent.x + Math.cos(angle) * distance;
        y = parent.y + Math.sin(angle) * distance;
        if (
          x > 90 &&
          y > 110 &&
          [...positions.values()].every((point) => Math.hypot(point.x - x, point.y - y) > 165)
        )
          break;
        distance += 7;
      }
    }
    positions.set(entry.id, {
      x,
      y,
      depth: parent ? parent.depth + 1 : 0,
      heading: parent ? Math.atan2(y - parent.y, x - parent.x) : -0.45 + mapPhase * 0.2,
    });
  }
  return {
    positions,
    width: Math.max(1180, ...[...positions.values()].map(({ x }) => x + 130)),
    height: Math.max(780, ...[...positions.values()].map(({ y }) => y + 110)),
  };
}

function inkPath(points) {
  const number = (value) => value.toFixed(1);
  let path = 'M ' + number(points[0].x) + ' ' + number(points[0].y);
  for (let index = 0; index < points.length - 1; index++) {
    const a = points[Math.max(0, index - 1)];
    const b = points[index];
    const c = points[index + 1];
    const d = points[Math.min(points.length - 1, index + 2)];
    path +=
      ' C ' +
      [
        b.x + (c.x - a.x) / 6,
        b.y + (c.y - a.y) / 6,
        c.x - (d.x - b.x) / 6,
        c.y - (d.y - b.y) / 6,
        c.x,
        c.y,
      ]
        .map(number)
        .join(' ');
  }
  return path;
}

/** Unequal bends and small pen deviations, instead of identical S-shaped connectors. */
export function destinationTrail(a, b, seed) {
  const rng = random(seed ^ 0x728c1);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy) || 1;
  const nx = -dy / length;
  const ny = dx / length;
  const inset = Math.min(22, length * 0.15);
  const travel = (length - inset * 2) / length;
  const bend = (rng() - 0.5) * length * 0.52;
  const drift = (rng() - 0.5) * length * 0.27;
  const steps = Math.max(10, Math.min(24, Math.round(length / 20)));
  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const offset =
      Math.sin(t * Math.PI) * bend +
      Math.sin(t * Math.PI * 2) * drift +
      (index && index < steps ? (rng() - 0.5) * 6 : 0);
    return {
      x: a.x + (dx / length) * inset + dx * travel * t + nx * offset,
      y: a.y + (dy / length) * inset + dy * travel * t + ny * offset,
    };
  });
  return inkPath(points);
}

/** An open, twice-traced pen loop and freehand cross; never a CSS-perfect circle. */
export function destinationMark(seed, cleared) {
  const rng = random(seed ^ 0x53e7);
  const points = Array.from({ length: 24 }, (_, index) => {
    const angle = -0.8 + (index / 23) * Math.PI * 2.16;
    const radius = 20 + (rng() - 0.5) * 3.5;
    return { x: 30 + Math.cos(angle) * radius, y: 30 + Math.sin(angle) * radius * 0.91 };
  });
  const loop = inkPath(points);
  const retrace = inkPath(
    points.slice(5, 12).map((point) => ({ x: point.x + 0.8, y: point.y - 0.6 })),
  );
  const cross = cleared
    ? '<path class="sketch-cross" d="M 18 18 Q 29 30 42 43 M 42 17 Q 29 31 18 42"/>'
    : '';
  return (
    '<svg class="destination-sketch-mark" viewBox="0 0 60 60" aria-hidden="true"><path class="sketch-ring" d="' +
    loop +
    '"/><path class="sketch-retrace" d="' +
    retrace +
    '"/>' +
    cross +
    '</svg>'
  );
}
