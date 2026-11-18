const MIN_WIDTH = 1040;
const BASE_HEIGHT = 520;
const PAD_X = 88;
const PAD_TOP = 72;
const PAD_BOTTOM = 76;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hashSeed(seed) {
  let s = (Number(seed) || 1) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function normalizePresetPoint(pos, authoredSpanW, height) {
  if (!Array.isArray(pos) || pos.length < 2) return null;
  const rawX = Number(pos[0]);
  const rawY = Number(pos[1]);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;
  const spanX = authoredSpanW - PAD_X * 2;
  const spanY = height - PAD_TOP - PAD_BOTTOM;
  if (rawX <= 1.2 && rawY <= 1.2) {
    return {
      x: Math.round(PAD_X + clamp(rawX, 0.04, 0.96) * spanX),
      y: Math.round(PAD_TOP + clamp(rawY, 0.08, 0.92) * spanY),
    };
  }
  if (rawX <= 100 && rawY <= 100) {
    return {
      x: Math.round(PAD_X + (clamp(rawX, 4, 96) / 100) * spanX),
      y: Math.round(PAD_TOP + (clamp(rawY, 8, 92) / 100) * spanY),
    };
  }
  return {
    x: Math.round(clamp(rawX, PAD_X, authoredSpanW - PAD_X)),
    y: Math.round(clamp(rawY, PAD_TOP, height - PAD_BOTTOM)),
  };
}

/**
 * Compute parchment map coordinates for a dungeon route's entries.
 * Authored mainline routes respect declarative `entry.pos` in 1040x520 canvas space;
 * endless and linear routes extend smoothly left-to-right without colliding.
 */
export function destinationMap(entries = []) {
  const list = Array.isArray(entries) ? entries : [];
  const endlessCount = list.filter((entry) => entry?.endless).length;
  const authoredEntries = list.filter((entry) => entry?.authored && Array.isArray(entry.pos));
  const authoredWidth = Math.max(
    MIN_WIDTH,
    ...authoredEntries.map((entry) => Number(entry.pos[0]) + PAD_X),
  );
  const linearWidth =
    list.length <= 1 ? MIN_WIDTH : Math.max(MIN_WIDTH, PAD_X * 2 + (list.length - 1) * 200);
  const width =
    authoredEntries.length > 0
      ? Math.max(MIN_WIDTH, authoredWidth + endlessCount * 195)
      : linearWidth;
  const height = BASE_HEIGHT;
  const positions = new Map();

  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    if (!entry) continue;
    const step = Number.isInteger(entry.step) ? entry.step : entry.sequence || i;
    const branch = Boolean(entry.branch);
    let point = entry.authored ? normalizePresetPoint(entry.pos, authoredWidth, height) : null;

    if (!point && entry.endless && authoredEntries.length > 0) {
      const parentPos = entry.parentId ? positions.get(entry.parentId) : null;
      const baseX = parentPos ? parentPos.x : authoredWidth - PAD_X - 40;
      const idxAfterFour = Math.max(1, step - 3);
      const yWave = idxAfterFour % 2 === 1 ? -44 : 42;
      point = {
        x: Math.round(baseX + 185),
        y: Math.round(clamp(height * 0.49 + yWave, PAD_TOP + 24, height - PAD_BOTTOM - 24)),
      };
    } else if (!point) {
      const startX = list.length <= 1 ? Math.round(width * 0.5) : PAD_X + 68;
      const spacing = list.length <= 1 ? 0 : 200;
      const rand = hashSeed(entry.seed || i + 11);
      const wave = list.length <= 1 ? 0 : (i % 2 === 0 ? -1 : 1) * (28 + Math.round(rand() * 24));
      point = {
        x: Math.round(startX + i * spacing),
        y: Math.round(clamp(height * 0.49 + wave, PAD_TOP + 24, height - PAD_BOTTOM - 24)),
      };
    }

    const parentPos = entry.parentId ? positions.get(entry.parentId) : null;
    const heading = parentPos
      ? Math.atan2(point.y - parentPos.y, Math.max(1, point.x - parentPos.x))
      : 0;
    positions.set(entry.id, {
      x: point.x,
      y: point.y,
      depth: step,
      heading,
      branch,
    });
  }

  return { positions, width, height };
}

export const OVERLAND_DUNGEON_ARCH_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11a7 7 0 0 1 14 0v9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 20v-7.5a3.5 3.5 0 0 1 7 0V20M3 20h18" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 10.5l1.6 3.5L12 16l-1.6-2Z" fill="currentColor"/></svg>';

function sanitizeSvgId(value) {
  return String(value || 'map').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function stringSeed(value, fallback = 17) {
  let hash = fallback >>> 0;
  const text = String(value || '');
  for (let i = 0; i < text.length; i++) {
    hash = (Math.imul(hash, 33) ^ text.charCodeAt(i)) >>> 0;
  }
  return hash || fallback;
}

/** Shared seamless borderless Overland paper matching fansheng-atlas #paper-quarter grain. */
export function buildOverlandPaperSvg({
  prefix = 'overland',
  id = 'map',
  width = MIN_WIDTH,
  height = BASE_HEIGHT,
} = {}) {
  const safeId = sanitizeSvgId(id);
  const w = typeof width === 'string' ? width : Math.max(1, Number(width) || MIN_WIDTH);
  const h = typeof height === 'string' ? height : Math.max(1, Number(height) || BASE_HEIGHT);
  return {
    defs: `<defs>
      <svg id="${prefix}-paper-sample-${safeId}" width="86" height="56" viewBox="285 225 946 616">
        <use href="./assets/exploration/fansheng-atlas.svg#paper-quarter"/>
      </svg>
      <pattern id="${prefix}-paper-fiber-${safeId}" x="0" y="0" width="172" height="112" patternUnits="userSpaceOnUse">
        <use href="#${prefix}-paper-sample-${safeId}"/>
        <use href="#${prefix}-paper-sample-${safeId}" transform="translate(172 0) scale(-1 1)"/>
        <use href="#${prefix}-paper-sample-${safeId}" transform="translate(0 112) scale(1 -1)"/>
        <use href="#${prefix}-paper-sample-${safeId}" transform="translate(172 112) scale(-1 -1)"/>
      </pattern>
    </defs>`,
    layers: `<rect width="${w}" height="${h}" fill="#d9bf92"/>
      <rect width="${w}" height="${h}" fill="url(#${prefix}-paper-fiber-${safeId})" opacity=".62"/>
      <rect width="${w}" height="${h}" fill="#e4cc9f" opacity=".18"/>`,
  };
}

function isClearOfNodes(x, y, points, minX = 82, minY = 58) {
  for (const pt of points) {
    if (Math.abs(x - pt.x) < minX && Math.abs(y - pt.y) < minY) {
      return false;
    }
  }
  return true;
}

/** Subtle Overland hills and pine groves placed only in empty parchment pockets. */
export function buildOverlandTerrainAccents({
  width = MIN_WIDTH,
  height = BASE_HEIGHT,
  points = [],
  seed = 1,
  maxHills = 3,
  maxGroves = 5,
} = {}) {
  const rand = hashSeed(seed);
  const w = Math.max(320, Number(width) || MIN_WIDTH);
  const h = Math.max(240, Number(height) || BASE_HEIGHT);
  const hillSpots = [
    [0.14, 0.16],
    [0.84, 0.16],
    [0.5, 0.14],
    [0.16, 0.84],
    [0.82, 0.84],
    [0.48, 0.86],
  ];
  const groveSpots = [
    [0.09, 0.28],
    [0.24, 0.18],
    [0.64, 0.17],
    [0.89, 0.3],
    [0.11, 0.72],
    [0.34, 0.84],
    [0.68, 0.83],
    [0.9, 0.72],
    [0.52, 0.28],
  ];

  const accents = [];
  const placed = [];
  let hillCount = 0;
  for (const [fx, fy] of hillSpots) {
    if (hillCount >= maxHills) break;
    const x = Math.round(fx * w + (rand() - 0.5) * 34);
    const y = Math.round(fy * h + (rand() - 0.5) * 24);
    if (!isClearOfNodes(x, y, points, 92, 62) || !isClearOfNodes(x, y, placed, 95, 58)) {
      continue;
    }
    placed.push({ x, y });
    const rx = 48 + Math.round(rand() * 24);
    const ry = 22 + Math.round(rand() * 10);
    accents.push(
      `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#b59157" fill-opacity="0.13"/>`,
      `<use href="./assets/exploration/fansheng-silver-road.svg#hill-hatch" transform="translate(${x} ${y}) scale(8.2)" opacity="0.46"/>`,
    );
    hillCount++;
  }

  let groveCount = 0;
  for (const [fx, fy] of groveSpots) {
    if (groveCount >= maxGroves) break;
    const x = Math.round(fx * w + (rand() - 0.5) * 36);
    const y = Math.round(fy * h + (rand() - 0.5) * 26);
    if (!isClearOfNodes(x, y, points, 78, 54) || !isClearOfNodes(x, y, placed, 72, 46)) {
      continue;
    }
    placed.push({ x, y });
    const scale = (9.5 + rand() * 3).toFixed(1);
    accents.push(
      `<use href="./assets/exploration/fansheng-silver-road.svg#grove" transform="translate(${x} ${y}) scale(${scale})" opacity="0.52"/>`,
    );
    groveCount++;
  }

  return `<g class="overland-terrain-accents">${accents.join('')}</g>`;
}

/** Crisp curved Overland route trail between two map nodes. */
export function destinationTrail(a, b, seed = 1, options = {}) {
  if (!a || !b) return '';
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const rand = hashSeed(seed);
  const archDir = options.branch ? 1 : rand() > 0.5 ? 1 : -1;
  const maxCurve = options.maxCurve ?? 34;
  const curveFactor = options.curveFactor ?? 0.14;
  const curve = Math.min(maxCurve, dist * curveFactor) * archDir;
  const cx = Math.round((a.x + b.x) / 2 + nx * curve);
  const cy = Math.round((a.y + b.y) / 2 + ny * curve);
  return `M ${Math.round(a.x)} ${Math.round(a.y)} Q ${cx} ${cy} ${Math.round(b.x)} ${Math.round(b.y)}`;
}

/** Overland node pin: 45deg diamond for regular/branch stages, Dungeon Arch crest for Overlords. */
export function destinationMark(seed = 1, cleared = false, options = {}) {
  const { overlord = false, boss = false, branch = false, current = false } = options;
  if (overlord) {
    const cross = cleared
      ? '<path class="sketch-cross" d="M8.5 14.5l3.2 3.2 6.8-7.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
      : '';
    return `<svg class="destination-sketch-mark is-overlord-crest" data-seed="${seed >>> 0}" viewBox="0 0 28 28" aria-hidden="true">
      <rect class="sketch-ring is-dungeon-crest" x="2" y="2" width="24" height="24" rx="6"/>
      <path class="dungeon-arch-line" d="M7.5 21.5V13a6.5 6.5 0 0 1 13 0v8.5" fill="none" stroke-width="1.9" stroke-linecap="round"/>
      <path class="dungeon-arch-inner" d="M10.8 21.5v-6.8a3.2 3.2 0 0 1 6.4 0v6.8M5.8 21.5h16.4" fill="none" stroke-width="1.45" stroke-linecap="round"/>
      <path class="dungeon-arch-gem" d="M14 12.2l1.5 3.1-1.5 1.8-1.5-1.8Z"/>
      ${cross}
    </svg>`;
  }

  const variant = current ? 'is-current' : boss ? 'is-boss' : branch ? 'is-branch' : 'is-stop';
  return `<svg class="destination-sketch-mark ${variant}" data-seed="${seed >>> 0}" viewBox="0 0 24 24" aria-hidden="true">
    <rect class="sketch-halo" x="5.5" y="5.5" width="13" height="13" rx="1.6" transform="rotate(45 12 12)"/>
    <rect class="sketch-ring is-diamond" x="5.5" y="5.5" width="13" height="13" rx="1.6" transform="rotate(45 12 12)"/>
    ${
      cleared
        ? '<path class="sketch-cross" d="M8.3 12.3l2.5 2.5 4.9-5.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
        : ''
    }
  </svg>`;
}

/** Seamless borderless Overland parchment surface + sparse terrain reliefs for dungeon route maps. */
export function destinationRegionTerrain(
  mapId = 'mill',
  width = MIN_WIDTH,
  height = BASE_HEIGHT,
  positions = null,
) {
  const safeW = Math.max(MIN_WIDTH, Number(width) || MIN_WIDTH);
  const safeH = Math.max(BASE_HEIGHT, Number(height) || BASE_HEIGHT);
  const points = positions instanceof Map ? [...positions.values()] : [];
  const paper = buildOverlandPaperSvg({
    prefix: 'dest',
    id: mapId,
    width: safeW,
    height: safeH,
  });
  const terrain = buildOverlandTerrainAccents({
    width: safeW,
    height: safeH,
    points,
    seed: stringSeed(mapId, 41),
    maxHills: 4,
    maxGroves: 5,
  });

  return `<svg class="destination-terrain-layer" viewBox="0 0 ${safeW} ${safeH}" preserveAspectRatio="none" aria-hidden="true">
    ${paper.defs}
    ${paper.layers}
    ${terrain}
  </svg>`;
}
