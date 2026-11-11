import { COOKING, COOKING_POINTS, cookingState, cookGesture } from './service-cooking.js';

const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

const activities = Object.freeze({
  ...COOKING,
  balance: ['端盘', '慢慢向上拖托盘，杯子晃了就停一停'],
  catch: ['接餐', '按住托盘左右移动，接住三份出餐'],
  wipe: ['擦桌', '拖着抹布擦过大部分污渍'],
  mop: ['拖地', '沿脚印长拖，把地面拖干净'],
});

export const SERVICE_PATCHES = Object.freeze({
  ...COOKING_POINTS,
  wipe: [
    [0.25, 0.37],
    [0.36, 0.61],
    [0.47, 0.43],
    [0.59, 0.65],
    [0.67, 0.33],
    [0.76, 0.56],
  ],
  mop: [
    [0.23, 0.76],
    [0.34, 0.64],
    [0.45, 0.54],
    [0.56, 0.43],
    [0.67, 0.32],
    [0.78, 0.22],
  ],
});

const lanes = [0.27, 0.72, 0.46];

export function serviceActivity(kind, guest, elapsed) {
  const [name, note] = activities[kind];
  const state = Object.hasOwn(COOKING, kind)
    ? cookingState(kind, guest.activity)
    : guest.activity?.kind === kind
      ? guest.activity
      : { kind };
  const ready = elapsed >= (guest.cookSince ?? 0) + 1.15;
  return { kind, name, note, state, ready, lane: lanes[state.caught || 0] };
}

function segmentDistance(from, to, [x, y]) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const squared = dx * dx + dy * dy;
  const t = squared ? clamp(((x - from.x) * dx + (y - from.y) * dy) / squared) : 0;
  return Math.hypot(x - from.x - dx * t, y - from.y - dy * t);
}

function sweep(state, from, to, radius, needed) {
  state.marks ||= [];
  for (const [i, point] of SERVICE_PATCHES[state.kind].entries()) {
    if (!state.marks.includes(i) && segmentDistance(from, to, point) <= radius) state.marks.push(i);
  }
  state.progress = clamp(state.marks.length / needed);
  return state.progress === 1;
}

function balance(state, from, to, seconds) {
  const movement = Math.max(0, from.y - to.y);
  const speed = movement / Math.max(seconds, 0.016);
  state.wobble = clamp(
    (state.wobble || 0) + Math.max(0, speed - 0.85) * seconds * 3 - seconds * 1.4,
  );
  state.progress = clamp((state.progress || 0) + movement * (1 - state.wobble) * 1.42);
  return state.progress === 1;
}

function catchDish(state, point, seconds) {
  state.fall = (state.fall || 0) + seconds * 0.96;
  if (state.fall < 1) return false;
  const caught = state.caught || 0;
  if (Math.abs(point.x - lanes[caught]) <= 0.19) state.caught = caught + 1;
  state.fall = 0;
  state.progress = (state.caught || 0) / lanes.length;
  return state.progress === 1;
}

/** Apply only normalized input. A new gesture starts at the pointer, with no teleport progress. */
export function applyServiceGesture(activity, input) {
  const { from, to, start, type } = input;
  if (
    !['start', 'move', 'hold', 'release', 'idle'].includes(type) ||
    ![from, to, start].every(
      (p) => p && [p.x, p.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1),
    )
  )
    return { valid: false };

  const seconds = clamp(Number.isFinite(input.seconds) ? input.seconds : 0, 0, 0.12);
  if (Object.hasOwn(COOKING, activity.kind))
    return cookGesture(activity, { from, to, start, type, seconds });
  const state = { ...activity.state, marks: activity.state.marks?.slice(), x: to.x, y: to.y };
  let done = false;
  if (activity.kind === 'balance' && (type === 'hold' || type === 'move'))
    done = balance(state, from, to, seconds);
  if (activity.kind === 'catch' && type === 'hold') done = catchDish(state, to, seconds);
  if (['wipe', 'mop'].includes(activity.kind) && type === 'move')
    done = sweep(state, from, to, 0.15, 5);
  return { valid: true, state, done, error: '' };
}
