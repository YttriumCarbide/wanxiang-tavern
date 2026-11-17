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

/** Crisp curved parchment route trail between two map nodes. */
export function destinationTrail(a, b, seed = 1, options = {}) {
  if (!a || !b) return '';
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const rand = hashSeed(seed);
  const archDir = options.branch ? 1 : rand() > 0.5 ? 1 : -1;
  const curve = Math.min(34, dist * 0.14) * archDir;
  const cx = Math.round((a.x + b.x) / 2 + nx * curve);
  const cy = Math.round((a.y + b.y) / 2 + ny * curve);
  return `M ${Math.round(a.x)} ${Math.round(a.y)} Q ${cx} ${cy} ${Math.round(b.x)} ${Math.round(b.y)}`;
}

/** Upright cartographic node stamp icon matching fansheng parchment map style. */
export function destinationMark(seed = 1, cleared = false, options = {}) {
  const { overlord = false, boss = false, branch = false, current = false } = options;
  const ringStroke = overlord ? '#8c3328' : branch ? '#6d5742' : '#79523a';
  const fillTone = cleared ? '#ead9bc' : overlord ? '#f6e1d3' : current ? '#fdf3df' : '#f2e5ce';
  const outerRing = overlord
    ? `<circle cx="24" cy="24" r="19" fill="none" stroke="${ringStroke}" stroke-width="1.3" stroke-dasharray="3 2.5"/>`
    : '';
  const innerIcon = cleared
    ? `<path class="sketch-cross" d="M 16 24.5 L 21.5 30 L 32.5 18" fill="none" stroke="#5d422d" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`
    : overlord
      ? `<path d="M 15 29 L 17 19 L 21.5 24 L 24 16 L 26.5 24 L 31 19 L 33 29 Z" fill="#a23c2c" stroke="#5e2119" stroke-width="1.2" stroke-linejoin="round"/>`
      : boss
        ? `<polygon points="24,14 27.5,21 34,24 27.5,27 24,34 20.5,27 14,24 20.5,21" fill="#8f5d40" fill-opacity="0.22" stroke="${ringStroke}" stroke-width="1.4" stroke-linejoin="round"/>`
        : branch
          ? `<polygon points="24,12 36,24 24,36 12,24" fill="${fillTone}" stroke="${ringStroke}" stroke-width="1.25" stroke-opacity="0.65"/>`
          : '';

  const compassTicks =
    !cleared && !branch
      ? `<path d="M 24 6 V 10 M 24 38 V 42 M 6 24 H 10 M 38 24 H 42" stroke="${ringStroke}" stroke-width="1.15" stroke-opacity="0.58" stroke-linecap="round"/>`
      : '';

  return `<svg class="destination-sketch-mark" data-seed="${seed >>> 0}" viewBox="0 0 48 48" aria-hidden="true">
    ${outerRing}
    <circle class="sketch-ring" cx="24" cy="24" r="15" fill="${fillTone}" stroke="${ringStroke}" stroke-width="${current ? 2.1 : 1.6}"/>
    <circle cx="24" cy="24" r="11.5" fill="none" stroke="${ringStroke}" stroke-width="0.8" stroke-opacity="0.48"/>
    ${compassTicks}
    ${innerIcon}
  </svg>`;
}

function terrainMotifPaths(mapId, width, height) {
  switch (mapId) {
    case 'mill':
      return `<g class="terrain-motif" stroke="#79523a" fill="none" stroke-opacity="0.22" stroke-width="1.2">
        <path d="M 36 ${height - 58} Q ${width * 0.3} ${height - 78} ${width * 0.58} ${height - 50} T ${width - 34} ${height - 62}"/>
        <circle cx="88" cy="76" r="18"/>
        <path d="M 88 54 V 98 M 66 76 H 110 M 74 62 L 102 90 M 102 62 L 74 90"/>
      </g>`;
    case 'ruins':
      return `<g class="terrain-motif" stroke="#79523a" fill="none" stroke-opacity="0.22" stroke-width="1.2">
        <path d="M 48 92 V 56 H 72 V 92 M 56 56 V 48 H 64 V 56"/>
        <path d="M ${width - 96} ${height - 48} L ${width - 78} ${height - 76} L ${width - 58} ${height - 48}"/>
      </g>`;
    case 'forest':
    case 'whisper-grove':
      return `<g class="terrain-motif" stroke="#6f5a3f" fill="none" stroke-opacity="0.22" stroke-width="1.2">
        <path d="M 62 96 L 74 66 L 86 96 Z M 90 96 L 100 72 L 110 96 Z"/>
        <path d="M ${width - 92} 96 L ${width - 80} 66 L ${width - 68} 96 Z"/>
      </g>`;
    case 'frost':
    case 'silver-cistern':
      return `<g class="terrain-motif" stroke="#687279" fill="none" stroke-opacity="0.22" stroke-width="1.2">
        <path d="M 52 86 L 74 52 L 94 86 M 78 86 L 98 60 L 116 86"/>
        <path d="M ${width - 102} 84 L ${width - 80} 50 L ${width - 60} 84"/>
      </g>`;
    case 'forge':
    case 'ash-foundry':
      return `<g class="terrain-motif" stroke="#804b38" fill="none" stroke-opacity="0.22" stroke-width="1.2">
        <path d="M 54 90 L 68 56 H 88 L 102 90"/>
        <path d="M ${width - 98} 88 L ${width - 80} 54 L ${width - 62} 88"/>
      </g>`;
    default:
      return `<g class="terrain-motif" stroke="#79523a" fill="none" stroke-opacity="0.2" stroke-width="1.15">
        <path d="M 42 ${height - 44} Q ${width * 0.25} ${height - 62} ${width * 0.5} ${height - 42} T ${width - 42} ${height - 48}"/>
        <circle cx="${width - 62}" cy="58" r="14"/>
        <path d="M ${width - 62} 40 V 76 M ${width - 80} 58 H ${width - 44}"/>
      </g>`;
  }
}

/** Parchment chart border, contour lines, and subtle compass/terrain watermark for the dungeon route map. */
export function destinationRegionTerrain(
  mapId = 'mill',
  width = MIN_WIDTH,
  height = BASE_HEIGHT,
  positions = null,
) {
  const safeW = Math.max(MIN_WIDTH, Number(width) || MIN_WIDTH);
  const safeH = Math.max(BASE_HEIGHT, Number(height) || BASE_HEIGHT);
  const contours = [];
  if (positions instanceof Map && positions.size > 0) {
    let idx = 0;
    for (const pos of positions.values()) {
      if (idx % 2 === 0) {
        contours.push(
          `<ellipse class="terrain-contour" cx="${Math.round(pos.x)}" cy="${Math.round(pos.y)}" rx="44" ry="24" fill="none" stroke="#8a684b" stroke-opacity="0.14" stroke-width="1" stroke-dasharray="3 4"/>`,
        );
      }
      idx++;
    }
  }

  return `<svg class="destination-terrain-layer" viewBox="0 0 ${safeW} ${safeH}" preserveAspectRatio="none" aria-hidden="true">
    <rect class="terrain-frame-outer" x="14" y="14" width="${safeW - 28}" height="${safeH - 28}" rx="4" fill="none" stroke="#8a6547" stroke-opacity="0.34" stroke-width="1.3"/>
    <rect class="terrain-frame-inner" x="20" y="20" width="${safeW - 40}" height="${safeH - 40}" rx="2" fill="none" stroke="#8a6547" stroke-opacity="0.2" stroke-width="0.9" stroke-dasharray="6 4"/>
    ${terrainMotifPaths(mapId, safeW, safeH)}
    ${contours.join('')}
  </svg>`;
}
