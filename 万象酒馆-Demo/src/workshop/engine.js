import { WORKSHOP_LIMIT } from './catalog.js';

const count = (n, max = WORKSHOP_LIMIT) =>
  Math.min(max, Math.max(0, Math.floor(Number.isFinite(n) ? n : 0)));
const combine = (results, logic = 'and') =>
  logic === 'or' ? results.some(Boolean) : results.every(Boolean);
const has = (state, costs) => Object.entries(costs).every(([id, n]) => (state.items[id] || 0) >= n);
const researchHas = (state, costs, logic) =>
  combine(
    Object.entries(costs).map(([id, n]) => (state.research[id] || 0) >= n),
    logic,
  );

export function restoreWorkshop(value, catalog, now = 0) {
  const state = {
    version: 1,
    at: Number.isFinite(value?.at) ? Math.max(0, Math.min(value.at, now)) : now,
    items: {},
    known: [],
    discovered: [],
    stations: {},
    research: {},
    manual: {},
    core: 0,
    coins: 0,
    delivered: 0,
  };
  if (value?.version !== 1) return discoverWorkshop(state, catalog);
  state.coins = count(value.coins);
  state.delivered = count(value.delivered);
  state.core = count(value.core, catalog.core.length);
  for (const item of catalog.items) {
    state.items[item.id] = count(value.items?.[item.id]);
    if (state.items[item.id] || (Array.isArray(value.known) && value.known.includes(item.id)))
      state.known.push(item.id);
    if (Array.isArray(value.discovered) && value.discovered.includes('item:' + item.id))
      state.discovered.push('item:' + item.id);
    const job = value.manual?.[item.id];
    if (job?.active === true)
      state.manual[item.id] = {
        active: true,
        work: Math.min(item.seconds, Math.max(0, Number.isFinite(job.work) ? job.work : 0)),
      };
  }
  for (const station of catalog.stations) {
    const saved = value.stations?.[station.id];
    if (!saved) continue;
    const built = count(saved.count, station.max);
    const jobs = Object.fromEntries(
      Object.keys(station.outputs).map((id) => [
        id,
        Math.min(
          catalog.items.find((i) => i.id === id).seconds,
          Math.max(0, Number.isFinite(saved.jobs?.[id]) ? saved.jobs[id] : 0),
        ),
      ]),
    );
    state.stations[station.id] = { count: built, active: count(saved.active, built), jobs };
    if (
      built ||
      (Array.isArray(value.discovered) && value.discovered.includes('station:' + station.id))
    )
      state.discovered.push('station:' + station.id);
  }
  for (const tech of catalog.research)
    state.research[tech.id] = count(value.research?.[tech.id], tech.costs.length);
  return discoverWorkshop(state, catalog);
}

function unlockHits(state, catalog, type, id) {
  return catalog.research.flatMap((tech) =>
    tech.unlocks
      .filter((u) => u.type === type && u.id === id)
      .map((u) => (state.research[tech.id] || 0) >= u.level),
  );
}

export function workshopUnlocked(state, catalog, type, entry) {
  const hits = unlockHits(state, catalog, type, entry.id);
  if (type === 'station') {
    hits.push(...Object.entries(entry.requires).map(([id, n]) => (state.research[id] || 0) >= n));
    if (entry.stations.some((id) => !state.stations[id]?.count)) return false;
  }
  if (hits.length && !combine(hits, entry.visibility.logic)) return false;
  return (
    type !== 'item' ||
    catalog.core.every((step, level) => !step.unlocks.includes(entry.id) || state.core > level)
  );
}

export function workshopVisible(state, catalog, type, entry) {
  if (type === 'research')
    return (
      state.known.includes(catalog.researchKey) && researchHas(state, entry.requires, entry.logic)
    );
  if (!workshopUnlocked(state, catalog, type, entry)) return false;
  const v = entry.visibility;
  const known =
    state.discovered.includes(type + ':' + entry.id) ||
    (type === 'item' ? state.known.includes(entry.id) : state.stations[entry.id]?.count > 0);
  if (v.permanent && known) return true;
  function rule(mode) {
    if (mode === 'always') return true;
    if (mode === 'auto') return known;
    if (mode === 'passive')
      return (
        known ||
        (type === 'item' &&
          catalog.stations.some((s) => s.outputs[entry.id] && state.stations[s.id]?.count))
      );
    if (mode === 'core_level') return state.core >= v.core;
    if (mode === 'base_materials') {
      const inputs = Object.keys(v.items).length
        ? v.items
        : type === 'item'
          ? entry.inputs
          : entry.materials;
      return (
        Object.keys(inputs).length > 0 &&
        Object.keys(inputs).every((id) => (state.items[id] || 0) > 0)
      );
    }
    if (mode === 'research') {
      const hits = [
        ...Object.entries(v.research).map(([id, n]) => (state.research[id] || 0) >= n),
        ...unlockHits(state, catalog, type, entry.id),
      ];
      if (type === 'station')
        hits.push(
          ...Object.entries(entry.requires).map(([id, n]) => (state.research[id] || 0) >= n),
        );
      return hits.length > 0 && combine(hits, v.logic);
    }
    return false;
  }
  return v.mode === 'composite'
    ? combine((v.rules.length ? v.rules : ['base_materials', 'core_level']).map(rule), v.logic)
    : rule(v.mode);
}

function discoverWorkshop(state, catalog) {
  for (const [type, entries] of [
    ['item', catalog.items],
    ['station', catalog.stations],
  ])
    for (const entry of entries) {
      const key = type + ':' + entry.id;
      if (workshopVisible(state, catalog, type, entry) && !state.discovered.includes(key))
        state.discovered.push(key);
    }
  return state;
}

function modifierValue(modifier, level, base = 1, parallel = false) {
  if (!level) return 0;
  if (modifier.levels[String(level)] != null) return modifier.levels[String(level)];
  const growth = modifier.growth;
  if (modifier.mode === 'add') return growth * level;
  if (modifier.mode === 'mul')
    return parallel ? base * growth * level : (Math.pow(1 + growth / 100, level) - 1) * 100;
  if (modifier.mode === 'pow') return Math.pow(growth, level);
  return 0;
}

export function workshopRate(state, catalog, itemId, stationId = '') {
  let percent = catalog.core
    .slice(0, state.core)
    .reduce((sum, step) => sum + step.production + (stationId ? 0 : step.manual), 0);
  for (const tech of catalog.research)
    for (const effect of tech.effects) {
      if (
        (effect.type === 'item' && effect.id === itemId) ||
        (effect.type === 'station' && effect.id === stationId)
      )
        percent += modifierValue(effect.speed, state.research[tech.id] || 0);
    }
  return Math.min(1000, Math.max(0.1, 1 + percent / 100));
}

export function workshopParallel(state, catalog, station, id) {
  const base = station.outputs[id];
  let bonus = 0;
  for (const tech of catalog.research)
    for (const effect of tech.effects)
      if (effect.type === 'station' && effect.id === station.id)
        bonus += modifierValue(effect.parallel, state.research[tech.id] || 0, base, true);
  return count((base + bonus) * (state.stations[station.id]?.active || 0), 1e6);
}

export function workshopBuildCost(state, station) {
  const n = state.stations[station.id]?.count || 0;
  const factor =
    n < station.exponentialAt
      ? 1 + n * station.multiplier
      : (1 + (station.exponentialAt - 1) * station.multiplier) *
        Math.pow(station.exponential, n - station.exponentialAt + 1);
  const bounded = (value) => Math.min(WORKSHOP_LIMIT, Math.ceil(value * factor));
  return {
    coins: bounded(station.price),
    materials: Object.fromEntries(
      Object.entries(station.materials).map(([id, amount]) => [id, bounded(amount)]),
    ),
  };
}

function add(state, id, amount) {
  state.items[id] = count((state.items[id] || 0) + amount);
  if (amount > 0 && !state.known.includes(id)) state.known.push(id);
}
function spend(state, costs, units = 1) {
  for (const [id, amount] of Object.entries(costs)) state.items[id] -= amount * units;
}

/** One authoritative event-boundary simulator for online, offline and modifier time advances. */
export function advanceWorkshop(input, catalog, now) {
  const state = structuredClone(input);
  const events = [];
  if (!Number.isFinite(now)) return { state, events };
  let remaining = Math.min(8 * 3600, Math.max(0, (now - state.at) / 1000));
  state.at = Math.max(state.at, now);
  const produced = {};
  const tasks = [];
  for (const station of catalog.stations) {
    const record = state.stations[station.id];
    if (!record?.active || !workshopUnlocked(state, catalog, 'station', station)) continue;
    for (const id of Object.keys(station.outputs)) {
      const item = catalog.items.find((i) => i.id === id);
      if (!workshopUnlocked(state, catalog, 'item', item)) continue;
      tasks.push({
        id,
        item,
        station,
        rate: workshopRate(state, catalog, id, station.id),
        units: workshopParallel(state, catalog, station, id),
        get: () => record.jobs[id] || 0,
        set: (n) => {
          record.jobs[id] = n;
        },
      });
    }
  }
  for (const item of catalog.items) {
    const job = state.manual[item.id];
    if (job?.active)
      tasks.push({
        id: item.id,
        item,
        manual: job,
        rate: workshopRate(state, catalog, item.id),
        units: 1,
        get: () => job.work,
        set: (n) => {
          job.work = n;
        },
      });
  }
  // A long offline run is chunked without discarding unpaid simulation time.
  // Every simultaneous finish settles in catalog order, independent of frames.
  let iterations = 0;
  while (remaining > 1e-8 && iterations++ < 20000) {
    const working = tasks.filter((task) => task.units > 0 && (!task.manual || task.manual.active));
    if (!working.length) {
      remaining = 0;
      break;
    }
    const step = Math.min(
      remaining,
      ...working.map((task) => Math.max(0, task.item.seconds - task.get()) / task.rate),
    );
    for (const task of working) task.set(task.get() + step * task.rate);
    remaining -= step;
    for (const task of working) {
      if (task.get() < task.item.seconds - 1e-7) continue;
      let units = task.units;
      if (!task.manual)
        for (const [id, n] of Object.entries(task.item.inputs))
          units = Math.min(units, Math.floor((state.items[id] || 0) / n));
      if (units > 0) {
        if (!task.manual) spend(state, task.item.inputs, units);
        add(state, task.id, units);
        produced[task.id] = (produced[task.id] || 0) + units;
      }
      task.set(0);
      if (task.manual) task.manual.active = false;
    }
  }
  state.at -= Math.max(0, remaining) * 1000;
  for (const [id, amount] of Object.entries(produced)) events.push({ type: 'produce', id, amount });
  return {
    state: discoverWorkshop(state, catalog),
    events,
    pendingSeconds: Math.max(0, remaining),
  };
}

export function workshopAction(input, catalog, action) {
  const state = structuredClone(input),
    events = [];
  const reject = (error) => ({ state: input, events, error });
  const item = catalog.items.find((entry) => entry.id === action.id);
  const station = catalog.stations.find((entry) => entry.id === action.id);
  if (action.type === 'craft') {
    if (!item || !workshopVisible(state, catalog, 'item', item)) return reject('尚未发现这项工艺');
    if (state.manual[item.id]?.active) return reject('这项手作正在进行');
    if (!has(state, item.inputs)) return reject('原料不足');
    spend(state, item.inputs);
    state.manual[item.id] = { active: true, work: 0 };
  } else if (action.type === 'build') {
    if (!station || !workshopVisible(state, catalog, 'station', station))
      return reject('设施尚未解锁');
    const cost = workshopBuildCost(state, station);
    const record = state.stations[station.id] || { count: 0, active: 0, jobs: {} };
    if (record.count >= station.max) return reject('设施已达上限');
    if (state.coins < cost.coins || !has(state, cost.materials)) return reject('工坊券或建材不足');
    spend(state, cost.materials);
    state.coins -= cost.coins;
    record.count++;
    record.active++;
    state.stations[station.id] = record;
    for (const id of Object.keys(station.outputs))
      if (!state.known.includes(id)) state.known.push(id);
  } else if (action.type === 'active') {
    if (!station || !state.stations[station.id]) return reject('尚未建造');
    state.stations[station.id].active = count(action.amount, state.stations[station.id].count);
  } else if (action.type === 'sell') {
    const amount = count(action.amount, state.items[action.id] || 0);
    if (!item || !amount) return reject('没有可交付的物资');
    state.items[item.id] -= amount;
    state.coins = count(state.coins + amount * item.value);
    state.delivered = count(state.delivered + amount);
  } else if (action.type === 'research') {
    const tech = catalog.research.find((entry) => entry.id === action.id);
    const level = state.research[action.id] || 0;
    if (!tech || !workshopVisible(state, catalog, 'research', tech))
      return reject('前置研修未完成');
    if (tech.station && !state.stations[tech.station]?.count) return reject('需要先建造对应设施');
    if (level >= tech.costs.length) return reject('研修已完成');
    if (!has(state, tech.costs[level])) return reject('研修物资不足');
    spend(state, tech.costs[level]);
    state.research[tech.id] = level + 1;
  } else if (action.type === 'core') {
    const step = catalog.core[state.core];
    if (!step) return reject('炉心已达最高等级');
    if (state.coins < step.price || !has(state, step.materials)) return reject('炉心升级物资不足');
    spend(state, step.materials);
    state.coins -= step.price;
    state.core++;
    for (const [id, amount] of Object.entries(step.items)) add(state, id, amount);
  } else return reject('未知工坊操作');
  events.push({ type: action.type, id: action.id });
  return { state: discoverWorkshop(state, catalog), events };
}

/** Debug values still pass the same state sanitizer; only the developer controller exposes this. */
export function modifyWorkshop(input, catalog, patch, now) {
  return restoreWorkshop({ ...input, ...patch, version: 1, at: now }, catalog, now);
}
