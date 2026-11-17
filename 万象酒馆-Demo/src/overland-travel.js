import { OVERLAND_ROAD } from './content/overland-road.js';
import { SILVER_CROWN_PLACES } from './content/silver-crown-scenes.js';
import {
  ETERNAL_CITY_GATE,
  ETERNAL_CITY_PLACES,
  ETERNAL_CITY_STOPS,
} from './content/eternal-city-scenes.js';
import {
  IMPERIAL_BRANCH_LEGS,
  IMPERIAL_CROSSROADS,
  IMPERIAL_DUNGEONS,
  IMPERIAL_FORTS,
} from './content/imperial-network.js';
import { stripGalTags } from './gal.js';
import { normalizeDcSpec } from './dc.js';
import { normalizeEquipmentCategory } from './equipment.js';

export const SILVER_ROAD_STOPS = Object.freeze([
  { id: 'outskirts', name: '星钟城 · 旧哨塔' },
  { id: 'road-bridge', name: '双拱石桥' },
  { id: 'road-reeds', name: '芦苇浅滩' },
  { id: 'road-capital', name: '银冠城外门' },
]);

export const SILVER_ROAD_LEGS = Object.freeze([
  {
    id: 'bridge-patrol',
    turns: 3,
    level: 3,
    type: 'battle',
    enemyIds: ['patrolHound'],
  },
  {
    id: 'meadow-crossing',
    turns: 3,
    level: 2,
    type: 'event',
  },
  {
    id: 'capital-road',
    turns: 4,
    level: 4,
    type: 'event',
  },
]);

export const CAPITAL_ROAD_STOPS = Object.freeze([
  SILVER_ROAD_STOPS[0],
  ...Object.entries(ETERNAL_CITY_STOPS).map(([id, name]) => ({ id, name })),
  { id: ETERNAL_CITY_GATE, name: '艾尔鲁斯 · 帝都南门' },
]);

export const CAPITAL_ROAD_LEGS = Object.freeze([
  {
    id: 'orchard-post',
    turns: 3,
    level: 2,
    type: 'event',
  },
  {
    id: 'mill-creek',
    turns: 3,
    level: 3,
    type: 'event',
  },
  {
    id: 'triumphal-check',
    turns: 3,
    level: 4,
    type: 'event',
  },
  {
    id: 'eternal-gate',
    turns: 4,
    level: 4,
    type: 'event',
  },
]);

export const OVERLAND_STOPS = Object.freeze([...SILVER_ROAD_STOPS, ...CAPITAL_ROAD_STOPS.slice(1)]);

export const ALL_OVERLAND_STOPS = Object.freeze([
  ...OVERLAND_STOPS,
  ...IMPERIAL_CROSSROADS.map(({ id, name }) => ({ id, name })),
  ...IMPERIAL_FORTS.map(({ id, name }) => ({ id, name })),
  ...IMPERIAL_DUNGEONS.map(({ id, name }) => ({ id, name })),
]);

const GRAPH_STOPS = Object.freeze([...ALL_OVERLAND_STOPS, { id: 'silver-fork', name: '东郊岔口' }]);

const stopMap = new Map(GRAPH_STOPS.map((stop) => [stop.id, stop]));

const GRAPH_EDGES = Object.freeze([
  ...SILVER_ROAD_LEGS.map((leg, index) => ({
    ...leg,
    from: SILVER_ROAD_STOPS[index].id,
    to: SILVER_ROAD_STOPS[index + 1].id,
  })),
  ...CAPITAL_ROAD_LEGS.map((leg, index) => ({
    ...leg,
    from: CAPITAL_ROAD_STOPS[index].id,
    to: CAPITAL_ROAD_STOPS[index + 1].id,
  })),
  {
    id: 'silver-fork-link',
    from: 'road-capital',
    to: 'silver-fork',
    turns: 1,
    level: 4,
    type: 'event',
  },
  ...IMPERIAL_BRANCH_LEGS,
]);

const travelStops = Object.freeze([...CAPITAL_ROAD_STOPS.slice(1).reverse(), ...SILVER_ROAD_STOPS]);
const travelLegs = Object.freeze([...CAPITAL_ROAD_LEGS.toReversed(), ...SILVER_ROAD_LEGS]);

const stopIndex = (id) => OVERLAND_STOPS.findIndex((stop) => stop.id === id);

export function overlandOrigin(scene) {
  if (typeof scene !== 'string') return null;
  if (stopIndex(scene) >= 0) return scene;
  if (stopMap.has(scene) && scene !== 'silver-fork') return scene;
  if (Object.hasOwn(SILVER_CROWN_PLACES, scene)) return 'road-capital';
  if (Object.hasOwn(ETERNAL_CITY_PLACES, scene)) return ETERNAL_CITY_GATE;
  const section = OVERLAND_ROAD.findIndex(({ id }) => id === scene);
  if (section >= 0) {
    const lastStop = OVERLAND_ROAD.slice(0, section).findLast(({ id }) => stopIndex(id) >= 0);
    return lastStop?.id ?? 'outskirts';
  }
  return scene.startsWith('road-') || scene === 'tavern' ? null : 'outskirts';
}

function mergeLegGroup(group) {
  if (group.length === 1) return { ...group[0] };
  const last = group.at(-1);
  const via = group.slice(0, -1).map((leg) => leg.to.name);
  return {
    id: last.id,
    from: group[0].from,
    to: last.to,
    ...(via.length ? { via } : {}),
    turns: group.reduce((sum, leg) => sum + leg.turns, 0),
    level: Math.max(...group.map((leg) => leg.level)),
    type: 'event',
  };
}

function condenseStages(legs) {
  if (legs.length <= 2) return legs;
  if (legs[0].type === 'battle') {
    return [mergeLegGroup([legs[0]]), mergeLegGroup(legs.slice(1))];
  }
  if (legs.at(-1).type === 'battle') {
    return [mergeLegGroup(legs.slice(0, -1)), mergeLegGroup([legs.at(-1)])];
  }
  const hub = legs.findIndex((leg, index) => index < legs.length - 1 && leg.to.id === 'outskirts');
  const split = hub >= 0 ? hub + 1 : Math.ceil(legs.length / 2);
  return [mergeLegGroup(legs.slice(0, split)), mergeLegGroup(legs.slice(split))];
}

function planWithGraph(from, to) {
  if (!stopMap.has(from) || !stopMap.has(to) || from === to) {
    throw Error('请选择不同的有效出发地和目的地');
  }
  const adj = new Map();
  for (const edge of GRAPH_EDGES) {
    if (!adj.has(edge.from)) adj.set(edge.from, []);
    if (!adj.has(edge.to)) adj.set(edge.to, []);
    adj.get(edge.from).push({ edge, next: edge.to });
    adj.get(edge.to).push({ edge, next: edge.from });
  }
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const visited = new Set();
  const queue = [from];
  while (queue.length) {
    queue.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    if (current === to) break;
    const baseCost = dist.get(current) ?? Infinity;
    for (const { edge, next } of adj.get(current) || []) {
      const nextCost = baseCost + edge.turns;
      if (nextCost < (dist.get(next) ?? Infinity)) {
        dist.set(next, nextCost);
        prev.set(next, { from: current, edge });
        queue.push(next);
      }
    }
  }
  if (!prev.has(to)) throw Error('请选择不同的有效出发地和目的地');
  const routeLegs = [];
  let cursor = to;
  while (cursor !== from) {
    const step = prev.get(cursor);
    routeLegs.unshift({
      ...step.edge,
      from: stopMap.get(step.from),
      to: stopMap.get(cursor),
    });
    cursor = step.from;
  }
  return {
    from,
    to,
    legs: routeLegs,
    stages: condenseStages(routeLegs),
    turns: routeLegs.reduce((sum, stage) => sum + stage.turns, 0),
  };
}

export function overlandPlan(from, to, discovery) {
  if (discovery && discovery.id === to) {
    const link = ALL_OVERLAND_STOPS.find((stop) => stop.id === discovery.linkId);
    if (
      !link ||
      !/^world-[a-z0-9-]+$/.test(to) ||
      typeof discovery.name !== 'string' ||
      !Number.isInteger(discovery.level) ||
      discovery.level < 1 ||
      discovery.level > 99
    )
      throw Error('外出地点资料无效');
    const route = from === link.id ? null : overlandPlan(from, link.id);
    const stage = {
      id: 'discovery-approach',
      from: link,
      to: { id: to, name: discovery.name.slice(0, 40) },
      turns: 2,
      level: discovery.level,
      type: 'event',
    };
    const legs = [...(route?.legs || []), stage];
    return {
      from,
      to,
      legs,
      stages: route ? [mergeLegGroup(route.legs), stage] : [stage],
      turns: (route?.turns || 0) + stage.turns,
      discovery: { ...discovery },
    };
  }
  if (stopIndex(from) >= 0 && stopIndex(to) >= 0) {
    return planWithStops(from, to, travelStops, travelLegs);
  }
  return planWithGraph(from, to);
}

function planWithStops(from, to, stops, legs) {
  const start = stops.findIndex((stop) => stop.id === from);
  const end = stops.findIndex((stop) => stop.id === to);
  if (start < 0 || end < 0 || start === end) throw Error('请选择不同的有效出发地和目的地');
  const direction = start < end ? 1 : -1;
  const routeLegs = Array.from({ length: Math.abs(end - start) }, (_, index) => {
    const current = start + direction * index;
    const next = current + direction;
    const legIndex = Math.min(current, next);
    return {
      ...legs[legIndex],
      from: stops[current],
      to: stops[next],
    };
  });
  return {
    from,
    to,
    legs: routeLegs,
    stages: condenseStages(routeLegs),
    turns: routeLegs.reduce((sum, stage) => sum + stage.turns, 0),
  };
}

export function overlandRunPlan(run) {
  const plan = overlandPlan(run.from, run.to, run.discovery);
  if (
    run.acts?.length === plan.stages.length &&
    plan.stages.every((stage, index) => stage.id === run.acts[index]?.id)
  )
    return plan;
  if (
    plan.legs &&
    run.acts?.length === plan.legs.length &&
    plan.legs.every((leg, index) => leg.id === run.acts[index]?.id)
  )
    return { ...plan, stages: plan.legs };
  // Trips already generated before the stop order changed finish with their original acts.
  const [starbell, bridge, reeds, capital] = SILVER_ROAD_STOPS;
  const [bridgeLeg, reedsLeg, capitalLeg] = SILVER_ROAD_LEGS;
  const legacy = planWithStops(
    run.from,
    run.to,
    [starbell, reeds, bridge, capital],
    [reedsLeg, bridgeLeg, capitalLeg],
  );
  return { ...legacy, stages: legacy.legs };
}

function prose(value, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw Error('外出剧本缺少合规的正文或选项文案');
  return value.trim();
}

function normalizeChoice(item, index) {
  if (typeof item === 'string') {
    return { id: `choice-${index + 1}`, label: prose(item, 80) };
  }
  const allowed = ['id', 'label', 'outcome', 'attr', 'dc', 'actor', 'dcCheck'];
  if (
    !item ||
    typeof item !== 'object' ||
    Array.isArray(item) ||
    Object.keys(item).some((key) => !allowed.includes(key))
  ) {
    throw Error('外出事件选项与路线不一致');
  }
  const id =
    typeof item.id === 'string' && item.id.trim()
      ? item.id.trim().slice(0, 40)
      : `choice-${index + 1}`;
  const label = prose(item.label, 80);
  const dcCheck = normalizeDcSpec(item.dcCheck || item);
  const result = { id, label, ...(dcCheck ? { dcCheck } : {}) };
  if (typeof item.outcome === 'string' && item.outcome.trim()) {
    result.outcome = prose(item.outcome, 2400);
  }
  return result;
}

export function normalizeOverlandItems(rawItems, plan) {
  if (rawItems === undefined || rawItems === null) return [];
  if (!Array.isArray(rawItems)) throw Error('外出战利品必须为数组');
  const battleStages = new Set(
    (plan?.stages || []).filter((stage) => stage.type === 'battle').map((stage) => stage.id),
  );
  const seenStages = new Set();
  return rawItems.map((entry) => {
    if (!entry || typeof entry !== 'object') throw Error('外出战利品格式无效');
    if (
      Object.keys(entry).some(
        (key) => !['stageId', 'name', 'description', 'value', 'category'].includes(key),
      )
    )
      throw Error('外出战利品只能包含 stageId/name/description/value/category');
    if (!battleStages.has(entry.stageId) || seenStages.has(entry.stageId))
      throw Error('外出战利品只能对应存在战斗的路线站且每站至多一件');
    seenStages.add(entry.stageId);
    const name = prose(entry.name, 24);
    const description = prose(entry.description, 48);
    if (!Number.isInteger(entry.value) || entry.value < 4 || entry.value > 120)
      throw Error('外出战利品以太价值必须为 4～120 整数');
    const category = normalizeEquipmentCategory(entry.category);
    if (category === 'gem') throw Error('战利品分类不能指定宝石');
    return {
      stageId: entry.stageId,
      name,
      description,
      value: entry.value,
      ...(category ? { category } : {}),
    };
  });
}

function normalizeOverlandBattleLines(rawLines) {
  if (rawLines === undefined || rawLines === null) return null;
  if (!rawLines || typeof rawLines !== 'object' || Array.isArray(rawLines))
    throw Error('外出战斗台词格式无效');
  if (Object.keys(rawLines).some((key) => !['intro', 'defeat'].includes(key)))
    throw Error('外出战斗台词只能包含 intro 与 defeat');
  const result = {};
  for (const key of ['intro', 'defeat']) {
    if (typeof rawLines[key] === 'string' && rawLines[key].trim()) {
      result[key] = stripGalTags(prose(rawLines[key], 120));
    }
  }
  return Object.keys(result).length ? result : null;
}

export function normalizeOverlandTheater(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const result = {};
  if (typeof raw.prologue === 'string' && raw.prologue.trim()) {
    const cleaned = stripGalTags(prose(raw.prologue, 1000));
    if (cleaned) result.prologue = cleaned;
  }
  if (typeof raw.epilogueGal === 'string' && raw.epilogueGal.trim()) {
    result.epilogueGal = prose(raw.epilogueGal, 4000);
  }
  if (typeof raw.epilogueProse === 'string' && raw.epilogueProse.trim()) {
    const cleaned = stripGalTags(prose(raw.epilogueProse, 1000));
    if (cleaned) result.epilogueProse = cleaned;
  }
  return result;
}

export function normalizeOverlandStory(raw, plan) {
  if (
    Object.keys(raw || {}).some(
      (key) => !['acts', 'items', 'prologue', 'epilogueGal', 'epilogueProse'].includes(key),
    )
  )
    throw Error('外出剧本只能返回acts、首尾剧场段及可选items');
  if (!Array.isArray(raw?.acts) || raw.acts.length !== plan.stages.length)
    throw Error(`外出剧本必须恰好包含 ${plan.stages.length} 幕`);
  return plan.stages.map((stage, index) => {
    const act = raw.acts[index];
    if (act?.id !== stage.id) throw Error('外出剧本幕序与路线不一致');
    const allowed =
      stage.type === 'event'
        ? ['id', 'title', 'story', 'choices']
        : ['id', 'title', 'story', 'battleLines'];
    if (Object.keys(act).some((key) => !allowed.includes(key)))
      throw Error('外出剧本只能提供本幕正文和选项文案');
    const result = { id: stage.id, title: prose(act.title, 80), story: prose(act.story, 5000) };
    if (stage.type === 'battle') {
      const lines = normalizeOverlandBattleLines(act.battleLines);
      if (lines) result.battleLines = lines;
    }
    if (stage.type === 'event') {
      if (!Array.isArray(act.choices) || act.choices.length < 2 || act.choices.length > 4)
        throw Error('外出事件需要 2～4 个互动建议');
      result.choices = act.choices.map((item, choiceIndex) => normalizeChoice(item, choiceIndex));
    }
    return result;
  });
}

export function restoreOverlandRun(value) {
  if (typeof value?.id !== 'string' || value.id.length > 100) return null;
  try {
    const plan = overlandRunPlan(value);
    const acts = normalizeOverlandStory({ acts: value.acts }, plan);
    const theater = normalizeOverlandTheater(value);
    const items = Array.isArray(value.items) ? normalizeOverlandItems(value.items, plan) : [];
    const index = value.index;
    if (!Number.isInteger(index) || index < 0 || index >= acts.length) return null;
    const phase = ['depart', 'intro', 'choice', 'outcome', 'battle'].includes(value.phase)
      ? value.phase
      : 'depart';
    const picked = acts[index].choices?.find((item) => item.id === value.choice);
    const choice = picked?.id;
    if (phase === 'outcome' && !picked?.outcome) return null;
    if (phase === 'battle' && plan.stages[index].type !== 'battle') return null;
    if (phase === 'choice' && plan.stages[index].type !== 'event') return null;
    const history = Array.isArray(value.history)
      ? value.history
          .filter(
            (entry) =>
              ['user', 'assistant'].includes(entry?.role) &&
              typeof entry?.content === 'string' &&
              entry.content.trim(),
          )
          .map((entry) => ({
            role: entry.role,
            content: entry.content,
            ...(Number.isInteger(entry.index) && entry.index >= 0 ? { index: entry.index } : {}),
          }))
      : [];
    return {
      id: value.id,
      from: plan.from,
      to: plan.to,
      acts,
      ...theater,
      ...(items.length ? { items } : {}),
      index,
      phase,
      ...(value.discovery ? { discovery: value.discovery } : {}),
      ...(value.discoveryAttempted === true ? { discoveryAttempted: true } : {}),
      ...(typeof value.gameTime === 'string' ? { gameTime: value.gameTime.slice(0, 60) } : {}),
      ...(Array.isArray(value.lines)
        ? {
            lines: value.lines.filter(
              (line) => typeof line?.text === 'string' && typeof line.speaker === 'string',
            ),
          }
        : {}),
      ...(history.length ? { history } : {}),
      ...(typeof value.draft === 'string' && value.draft
        ? { draft: value.draft.slice(0, 3000) }
        : {}),
      ...(choice ? { choice } : {}),
    };
  } catch {
    return null;
  }
}
