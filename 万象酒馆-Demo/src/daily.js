import { restoreServiceShift } from './tavern-service.js';
import { TOWN_SIDE_PLACES } from './content/town-side-places.js';
import { OVERLAND_ROAD } from './content/overland-road.js';
import { restoreServiceGrowth, SERVICE_ROLES } from './service-progression.js';
import { restoreOverlandRun } from './overland-travel.js';

export const DAILY_PERIODS = Object.freeze(['上午', '中午', '下午', '夜晚']);
export const DAILY_ACTIONS = Object.freeze({
  dungeon: { name: '下副本', ap: 2, glyph: '⚔' },
  service: { name: '营业', ap: 1, glyph: '✦' },
  outing: { name: '外出', ap: 1, glyph: '↗' },
  invitation: { name: '约见', ap: 1, glyph: '◇' },
});
export const DAILY_ROLES = SERVICE_ROLES;
export const OUTING_ACTIONS = 10;
export const TOWN_SCENES = Object.freeze({
  street: '酒馆街角',
  'city-center': '星钟广场',
  market: '商业街',
  rampart: '守备区',
  outskirts: '城外',
  ...Object.fromEntries(Object.entries(TOWN_SIDE_PLACES).map(([id, place]) => [id, place.name])),
});
export const OUTING_SCENES = Object.freeze({
  ...TOWN_SCENES,
  ...Object.fromEntries(OVERLAND_ROAD.map(({ id, name }) => [id, name])),
});

export function dailySceneTime(entry) {
  if (!entry) return null;
  let period = entry.at;
  if (entry.kind === 'outing' && Number.isFinite(entry.remaining)) {
    const used = entry.ap * OUTING_ACTIONS - entry.remaining;
    period += Math.max(0, Math.min(entry.ap - 1, Math.floor(used / OUTING_ACTIONS)));
  }
  return period === DAILY_PERIODS.length - 1 ? 'night' : 'day';
}
export const INVITATION_ACTIVITIES = Object.freeze({
  meal: '进餐',
  walk: '散步',
  talk: '谈心',
  music: '听一首曲子',
});

export function dailyUnlocked(library) {
  return (
    library.progression?.pandoraJoined === true &&
    library.characters.length >= 4 &&
    library.characters.some((member) => member.id === 'official-pandora')
  );
}

export function dailyPlan(entries = []) {
  if (!Array.isArray(entries) || entries.length > 4) throw Error('日程最多四个时段');
  const slots = Array(4).fill(null);
  const plan = entries
    .map(({ kind, at, ap = DAILY_ACTIONS[kind]?.ap }) => {
      const action = DAILY_ACTIONS[kind];
      if (
        !Object.hasOwn(DAILY_ACTIONS, kind) ||
        !Number.isInteger(at) ||
        at < 0 ||
        (kind === 'outing' ? !Number.isInteger(ap) || ap < 1 : ap !== action.ap) ||
        at + ap > slots.length
      )
        throw Error('这个行动放不进所选时段');
      const entry = { kind, at, ap };
      for (let index = at; index < at + ap; index++) {
        if (slots[index]) throw Error(`${DAILY_PERIODS[index]}已经安排了行动`);
        slots[index] = entry;
      }
      return entry;
    })
    .sort((a, b) => a.at - b.at);
  return { plan, slots };
}

export function arrangeDaily(entries, kind, at) {
  const expanded = editableDailyPlan(dailyPlan(entries).plan);
  const { slots } = dailyPlan(expanded);
  const next = expanded.filter((entry) => entry.at !== slots[at]?.at);
  if (!kind) return dailyPlan(next).plan;
  const normalized = dailyPlan([...next, { kind, at }]).plan;
  const merged = [];
  for (const entry of normalized) {
    const last = merged.at(-1);
    if (last?.kind === 'outing' && entry.kind === 'outing' && last.at + last.ap === entry.at)
      last.ap += entry.ap;
    else merged.push({ ...entry });
  }
  return merged;
}

export function editableDailyPlan(entries) {
  return entries.flatMap((entry) =>
    entry.kind === 'outing'
      ? Array.from({ length: entry.ap }, (_, index) => ({
          kind: 'outing',
          at: entry.at + index,
          ap: 1,
        }))
      : [{ ...entry }],
  );
}

export function restoreDaily(raw) {
  const day = Number.isSafeInteger(raw?.day) && raw.day > 0 ? raw.day : 1;
  const state = {
    day,
    draft: [],
    plan: [],
    cursor: 0,
    running: false,
    active: null,
    report: null,
    reportDetails: null,
    tutorial: ['intro', 'planning', 'service', 'done'].includes(raw?.tutorial)
      ? raw.tutorial
      : 'intro',
    memory: structuredClone(raw?.memory || {}),
    serviceGrowth: restoreServiceGrowth(raw?.serviceGrowth),
    unlocks: structuredClone(raw?.unlocks || {}),
  };
  try {
    state.draft = editableDailyPlan(dailyPlan(raw?.draft || []).plan);
    state.plan = dailyPlan(raw?.plan || []).plan;
    if (raw?.running !== true || !state.plan.length) return state;
    const cursor = raw.cursor;
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > state.plan.length) return state;
    state.running = true;
    state.cursor = cursor;
    const entry = state.plan[cursor];
    if (entry && raw.active?.kind === entry.kind && raw.active.at === entry.at)
      state.active = { ...structuredClone(raw.active), ...entry };
    if (state.active?.kind === 'service' && state.active.shift)
      state.active.shift = restoreServiceShift(state.active.shift);
    if (state.active?.kind === 'outing' && state.active.overland) {
      const overland = restoreOverlandRun(state.active.overland);
      if (overland) state.active.overland = overland;
      else delete state.active.overland;
    }
    if (typeof raw.report === 'string') {
      state.report = raw.report.slice(0, 600);
      const details = raw.reportDetails;
      if (details && typeof details.title === 'string' && Array.isArray(details.stages))
        state.reportDetails = {
          title: details.title.slice(0, 70),
          premise: String(details.premise || '').slice(0, 360),
          state: details.state === 'completed' ? 'completed' : 'ended',
          stages: details.stages.slice(0, 5).map((stage) => ({
            title: String(stage?.title || '').slice(0, 65),
            scene: String(stage?.scene || '').slice(0, 60),
            summary: String(stage?.summary || '').slice(0, 360),
            turns: Number(stage?.turns) || 0,
            goals: Array.isArray(stage?.goals)
              ? stage.goals.slice(0, 3).map((goal) => String(goal).slice(0, 180))
              : [],
          })),
        };
    }
  } catch {
    return { ...state, draft: [], plan: [], cursor: 0, running: false, active: null, report: null };
  }
  return state;
}

export function startDailyPlan(state) {
  if (state.running) throw Error('今天的安排已经确认');
  const entries = dailyPlan(state.draft).plan;
  const merged = [];
  for (const entry of entries) {
    const last = merged.at(-1);
    if (last?.kind === 'outing' && entry.kind === 'outing' && last.at + last.ap === entry.at)
      last.ap += entry.ap;
    else merged.push({ ...entry });
  }
  if (!merged.length) throw Error('先为一个时段安排活动');
  state.plan = merged;
  state.cursor = 0;
  state.running = true;
  state.report = null;
  state.reportDetails = null;
  if (state.tutorial !== 'done') state.tutorial = 'service';
  return activateDaily(state);
}

export function activateDaily(state) {
  if (!state.running || state.active || state.report) return state.active;
  const entry = state.plan[state.cursor];
  if (!entry) {
    state.day++;
    state.running = false;
    state.plan = [];
    state.draft = [];
    state.cursor = 0;
    return null;
  }
  state.active = { ...entry, stage: 'ready' };
  if (entry.kind === 'outing') state.active.remaining = entry.ap * OUTING_ACTIONS;
  return state.active;
}

export function finishDaily(state, kind, report, details = null) {
  if (state.active?.kind !== kind) return false;
  state.active = null;
  state.cursor++;
  state.report = report;
  state.reportDetails = details;
  if (kind === 'service' && state.tutorial === 'service') state.tutorial = 'done';
  return true;
}

export function consumeOutingAction(active) {
  if (active?.kind !== 'outing' || active.stage !== 'roaming' || active.remaining <= 0)
    return false;
  active.remaining--;
  return true;
}

export function serviceStaff(roles, members) {
  const ids = Object.keys(DAILY_ROLES).map((role) => roles[role]);
  if (ids.some((id) => !members.some((member) => member.id === id)) || new Set(ids).size !== 4)
    throw Error('前台、掌勺、服务员、保洁需要四名不同的角色');
  return Object.fromEntries(Object.keys(DAILY_ROLES).map((role, index) => [role, ids[index]]));
}
