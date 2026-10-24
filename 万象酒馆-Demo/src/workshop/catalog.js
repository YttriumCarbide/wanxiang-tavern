import { WORKSHOP_CATALOG } from '../content/workshop-catalog.js';

export const WORKSHOP_CATALOG_KEY = 'wanxiang.workshop.catalog.v1';
export const WORKSHOP_DRAFT_KEY = 'wanxiang.workshop.draft.v1';
export const WORKSHOP_LIMIT = 1e12;

/** Imported authoring data is inert JSON; validate every reference before replacing a live catalog. */
export function validateWorkshopCatalog(value) {
  const data = JSON.parse(JSON.stringify(value));
  const fail = (message) => {
    throw Error('工坊配置：' + message);
  };
  const number = (n, min = 0, max = WORKSHOP_LIMIT) => {
    if (!Number.isFinite(n) || n < min || n > max) fail('数值越界');
  };
  const text = (s) => {
    if (typeof s !== 'string' || !s.trim() || s.length > 300) fail('名称或ID为空/过长');
  };
  if (data.version !== 1) fail('版本不支持');
  text(data.name);
  text(data.currency);
  const maps = {};
  for (const key of ['items', 'stations', 'research']) {
    if (
      !Array.isArray(data[key]) ||
      data[key].length > 250 ||
      (key === 'items' && !data[key].length)
    )
      fail('目录数量无效');
    maps[key] = new Map();
    for (const entry of data[key]) {
      text(entry.id);
      text(entry.name);
      if (!/^[a-z][a-z0-9-]{0,79}$/.test(entry.id) || maps[key].has(entry.id))
        fail('ID无效或重复：' + entry.id);
      maps[key].set(entry.id, entry);
      if (
        entry.description != null &&
        (typeof entry.description !== 'string' || entry.description.length > 3000)
      )
        fail('说明过长');
      if (entry.position != null) {
        number(entry.position.x, -20000, 20000);
        number(entry.position.y, -20000, 20000);
      }
    }
  }
  const ref = (id, type) => {
    if (!maps[type]?.has(id)) fail('找不到引用：' + id);
  };
  const quantities = (object, type = 'items', max = WORKSHOP_LIMIT) => {
    if (!object || typeof object !== 'object' || Array.isArray(object)) fail('数量表必须是对象');
    for (const [id, count] of Object.entries(object)) {
      ref(id, type);
      number(count, 1, max);
      if (!Number.isInteger(count)) fail('数量必须为整数');
    }
  };
  const visibility = (entry) => {
    const v = entry.visibility;
    if (
      !v ||
      ![
        'always',
        'auto',
        'passive',
        'base_materials',
        'research',
        'core_level',
        'composite',
      ].includes(v.mode)
    )
      fail('可见规则无效');
    if (!['and', 'or'].includes(v.logic)) fail('可见逻辑无效');
    quantities(v.items);
    quantities(v.research, 'research', 100);
    number(v.core, 0, 100);
    if (
      !Array.isArray(v.rules) ||
      v.rules.some(
        (rule) => !['always', 'passive', 'base_materials', 'research', 'core_level'].includes(rule),
      )
    )
      fail('组合可见规则无效');
  };
  ref(data.researchKey, 'items');
  for (const item of data.items) {
    quantities(item.inputs);
    number(item.seconds, 0.5, 86400);
    number(item.value, 1);
    visibility(item);
  }
  for (const station of data.stations) {
    quantities(station.outputs, 'items', 1000);
    if (!Object.keys(station.outputs).length) fail('设施必须有产出');
    quantities(station.materials);
    quantities(station.requires, 'research', 100);
    number(station.price);
    number(station.max, 1, 1000);
    number(station.multiplier, 0, 10);
    number(station.exponentialAt, 1, 1000);
    number(station.exponential, 1, 3);
    if (!Array.isArray(station.stations)) fail('设施前置无效');
    station.stations.forEach((id) => ref(id, 'stations'));
    visibility(station);
  }
  for (const tech of data.research) {
    if (!Array.isArray(tech.costs) || !tech.costs.length || tech.costs.length > 100)
      fail('研修等级无效');
    tech.costs.forEach((cost) => quantities(cost));
    quantities(tech.requires, 'research', 100);
    for (const [id, count] of Object.entries(tech.requires))
      if (count > maps.research.get(id).costs.length) fail('前置等级超出上限');
    if (!['and', 'or'].includes(tech.logic)) fail('研修前置逻辑无效');
    if (tech.station) ref(tech.station, 'stations');
    for (const effect of tech.effects) {
      if (!['item', 'station'].includes(effect.type)) fail('效果类型无效');
      ref(effect.id, effect.type === 'item' ? 'items' : 'stations');
      for (const key of ['speed', 'parallel']) {
        const modifier = effect[key];
        if (!modifier || !['none', 'add', 'mul', 'pow'].includes(modifier.mode))
          fail('增益模式无效');
        number(modifier.growth, 0, 10000);
        for (const [level, n] of Object.entries(modifier.levels)) {
          if (!/^\d+$/.test(level)) fail('逐级增益等级无效');
          number(n, 0, 100000);
        }
      }
    }
    for (const unlock of tech.unlocks) {
      if (!['item', 'station'].includes(unlock.type)) fail('解锁类型无效');
      ref(unlock.id, unlock.type === 'item' ? 'items' : 'stations');
      number(unlock.level, 1, tech.costs.length);
    }
  }
  if (!Array.isArray(data.core) || data.core.length > 100) fail('炉心等级无效');
  for (const step of data.core) {
    quantities(step.materials);
    quantities(step.items);
    number(step.price);
    number(step.production, 0, 10000);
    number(step.manual, 0, 10000);
    step.unlocks.forEach((id) => ref(id, 'items'));
  }
  for (const [type, links] of [
    ['items', (e) => Object.keys(e.inputs)],
    ['research', (e) => Object.keys(e.requires)],
    ['stations', (e) => e.stations],
  ]) {
    const done = new Set(),
      visiting = new Set();
    function visit(id) {
      if (visiting.has(id)) fail('依赖循环：' + id);
      if (done.has(id)) return;
      visiting.add(id);
      links(maps[type].get(id)).forEach(visit);
      visiting.delete(id);
      done.add(id);
    }
    maps[type].forEach((_, id) => visit(id));
  }
  return data;
}

export function loadWorkshopCatalog(storage) {
  try {
    const saved = storage.getItem(WORKSHOP_CATALOG_KEY);
    if (saved) return validateWorkshopCatalog(JSON.parse(saved));
  } catch {
    /* A damaged custom catalog must not prevent the main game from starting. */
  }
  return validateWorkshopCatalog(WORKSHOP_CATALOG);
}

export function workshopReferences(catalog, type, id) {
  const found = [];
  const scan = (value, label) => {
    if (typeof value === 'string' && value === id) found.push(label);
    else if (Array.isArray(value)) value.forEach((entry) => scan(entry, label));
    else if (value && typeof value === 'object')
      for (const [key, child] of Object.entries(value)) {
        if (key === id) found.push(label);
        scan(child, label);
      }
  };
  for (const key of ['items', 'stations', 'research'])
    for (const entry of catalog[key]) {
      if (key === type && entry.id === id) continue;
      scan(entry, entry.name);
    }
  scan(catalog.core, '炉心升级');
  if (id === catalog.researchKey) found.push('研修入口');
  return [...new Set(found)];
}
