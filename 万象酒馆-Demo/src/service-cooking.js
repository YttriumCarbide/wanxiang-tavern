const clamp = (n) => Math.max(0, Math.min(1, n));

export const COOKING = Object.freeze({
  cut: ['切料', '按住刀扫过食材，可以一口气切完'],
  pour: ['倒饮料', '把壶嘴移到杯口上方，液面到刻线时把壶移开或松手'],
  stir: ['搅拌', '拖着勺子在汤里画圈'],
  heat: ['控火', '拨动风门，让指针在金色区停稳'],
  roll: ['擀面', '拖着擀面杖从面团的一边滚到另一边'],
  flip: ['翻面', '等锅里的饼边变金黄，拖住锅柄向上一挑'],
  season: ['调味', '拖着调料罐扫过盘里的食材'],
  whisk: ['打蛋', '拖着打蛋器在碗中来回抽打'],
  sear: ['煎封', '用锅铲压住肉片，煎到边缘变色再换一块'],
  skim: ['撇沫', '拖着漏勺从汤面捞过浮沫'],
  knead: ['揉面', '从亮起的面团边缘向中央折叠'],
  pipe: ['裱花', '按住裱花嘴，从亮起的起点拖过整条花纹'],
});

export const COOKING_POINTS = Object.freeze({
  cut: [
    [0.29, 0.52],
    [0.49, 0.52],
    [0.69, 0.52],
  ],
  season: [
    [0.34, 0.52],
    [0.5, 0.4],
    [0.66, 0.54],
  ],
  sear: [
    [0.32, 0.5],
    [0.5, 0.43],
    [0.68, 0.53],
  ],
  skim: [
    [0.33, 0.42],
    [0.46, 0.58],
    [0.57, 0.38],
    [0.67, 0.55],
  ],
  knead: [
    [0.32, 0.51],
    [0.58, 0.71],
    [0.61, 0.33],
  ],
  pipe: [
    [0.31, 0.59],
    [0.4, 0.41],
    [0.5, 0.36],
    [0.6, 0.41],
    [0.69, 0.59],
  ],
});

export const CUP = Object.freeze({ x: 0.69, rim: 0.49, low: 0.68, high: 0.9 });
export const HEAT_BAND = Object.freeze([0.54, 0.76]);
const initialTools = Object.freeze({
  cut: [0.2, 0.72],
  pour: [0.24, 0.38],
  stir: [0.43, 0.41],
  heat: [0.25, 0.81],
  roll: [0.28, 0.51],
  flip: [0.73, 0.61],
  season: [0.27, 0.42],
  whisk: [0.4, 0.49],
  sear: [0.24, 0.64],
  skim: [0.32, 0.63],
  knead: [0.32, 0.51],
  pipe: [0.31, 0.59],
});

export function cookingState(kind, saved) {
  if (saved?.kind === kind && saved.recipe === 2) return saved;
  const [x, y] = initialTools[kind];
  return { kind, recipe: 2, x, y, progress: 0 };
}

function distanceToSegment(from, to, [x, y]) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = dx * dx + dy * dy;
  const t = length ? clamp(((x - from.x) * dx + (y - from.y) * dy) / length) : 0;
  return Math.hypot(x - from.x - t * dx, y - from.y - t * dy);
}

function markPath(state, from, to, radius, ordered = false) {
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.002) return;
  const points = COOKING_POINTS[state.kind];
  for (const [i, point] of points.entries()) {
    if (ordered && i > state.marks.length) break;
    if (!state.marks.includes(i) && distanceToSegment(from, to, point) <= radius)
      state.marks.push(i);
  }
  state.progress = state.marks.length / points.length;
}

function pour(state, type, point, seconds) {
  // The kettle tips on docking, and its spout is 0.10 board widths to the right.
  const aimed =
    type !== 'release' &&
    Math.abs(point.x + 0.1 - CUP.x) <= 0.095 &&
    point.y >= 0.16 &&
    point.y <= 0.38;
  const fill = state.fill || 0;
  state.flow = aimed && !state.overflow;
  if (state.flow) {
    state.fill = clamp(fill + seconds * 0.62);
    state.overflow = state.fill > CUP.high;
    if (state.overflow) state.flow = false;
    state.progress = state.fill;
  }
  if (!aimed) {
    if (state.overflow) {
      state.fill = state.progress = 0;
      state.overflow = false;
      return '杯子满了，移开茶壶后可以重倒。';
    }
    if (fill >= CUP.low && fill <= CUP.high) state.progress = 1;
  }
  return '';
}

function stir(state, from, to) {
  const a = [(from.x - 0.5) * 1.75, from.y - 0.5];
  const b = [(to.x - 0.5) * 1.75, to.y - 0.5];
  if ([a, b].some(([x, y]) => Math.hypot(x, y) < 0.09 || Math.hypot(x, y) > 0.41)) return;
  const angle = Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
  if (Math.abs(angle) > 1.5) return;
  state.arc = (state.arc || 0) + angle;
  state.progress = clamp(Math.abs(state.arc) / (2.3 * Math.PI));
}

function rollingStroke(state, from, to, kind) {
  if (Math.abs(to.y - 0.5) > 0.27) {
    state.stroke = 0;
    return;
  }
  const move = to.x - from.x;
  if (Math.abs(move) < 0.0005) return;
  const direction = Math.sign(move);
  state.stroke =
    state.direction === direction ? (state.stroke || 0) + Math.abs(move) : Math.abs(move);
  state.direction = direction;
  const distance = kind === 'roll' ? 0.32 : 0.21;
  if (state.stroke >= distance && state.lastStroke !== direction) {
    state.lastStroke = direction;
    state.strokes = (state.strokes || 0) + 1;
  }
  state.progress = clamp((state.strokes || 0) / (kind === 'roll' ? 3 : 5));
}

function sear(state, to, seconds) {
  const points = COOKING_POINTS.sear;
  state.contact = points.findIndex(
    ([x, y], i) => !state.marks.includes(i) && Math.hypot(x - to.x, y - to.y) <= 0.11,
  );
  state.times = state.times?.slice() || points.map(() => 0);
  if (state.contact >= 0) {
    const i = state.contact;
    state.times[i] = Math.min(0.48, state.times[i] + seconds);
    if (state.times[i] === 0.48) state.marks.push(i);
  }
  state.progress = state.times.reduce((total, time) => total + time, 0) / (0.48 * points.length);
}

function fold(state, from, to) {
  const points = COOKING_POINTS.knead;
  const edge = points[state.marks.length];
  if (distanceToSegment(from, to, edge) <= 0.1) state.fold = true;
  if (state.fold && Math.hypot(to.x - 0.5, to.y - 0.51) <= 0.1) {
    state.marks.push(state.marks.length);
    state.fold = false;
  }
  state.progress = state.marks.length / points.length;
}

export function cookGesture(activity, { from, to, start, type, seconds }) {
  const state = {
    ...activity.state,
    x: to.x,
    y: to.y,
    marks: activity.state.marks?.slice() || [],
  };
  let error = '';
  if (type === 'start') {
    state.stroke = 0;
    state.fold = false;
  }
  switch (activity.kind) {
    case 'pour':
      error = pour(state, type, to, seconds);
      break;
    case 'heat':
      if (type !== 'idle' && type !== 'release') state.heat = to.x;
      state.heat ??= 0.25;
      state.held =
        state.heat >= HEAT_BAND[0] && state.heat <= HEAT_BAND[1] ? (state.held || 0) + seconds : 0;
      state.progress = clamp(state.held / 1.15);
      break;
    case 'flip':
      state.lift = type === 'release' ? 0 : clamp((start.y - to.y) / 0.25);
      if (type === 'move' && activity.ready && state.lift === 1) state.progress = 1;
      break;
    case 'sear':
      if (type !== 'release') sear(state, to, seconds);
      else state.contact = -1;
      break;
    default:
      if (type !== 'move') break;
      if (activity.kind === 'stir') stir(state, from, to);
      else if (['roll', 'whisk'].includes(activity.kind))
        rollingStroke(state, from, to, activity.kind);
      else if (activity.kind === 'knead') fold(state, from, to);
      else
        markPath(state, from, to, activity.kind === 'cut' ? 0.09 : 0.11, activity.kind === 'pipe');
  }
  return { valid: true, state, done: state.progress >= 1, error };
}
