import { OVERLAND_ROAD } from './content/overland-road.js';
import { SILVER_CROWN_PLACES } from './content/silver-crown-scenes.js';
import {
  ETERNAL_CITY_GATE,
  ETERNAL_CITY_PLACES,
  ETERNAL_CITY_STOPS,
} from './content/eternal-city-scenes.js';

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
    premise: '一只巡游猎犬挡住石桥。战斗目标是击退猎犬并通过。',
    enemyIds: ['patrolHound'],
  },
  {
    id: 'meadow-crossing',
    turns: 3,
    level: 2,
    type: 'event',
    premise: '浅滩涨水，找出能通过的水路。',
    choices: [
      { id: 'ford', action: '沿浅水涉过' },
      { id: 'bank', action: '沿高岸绕过' },
    ],
  },
  {
    id: 'capital-road',
    turns: 4,
    level: 4,
    type: 'event',
    premise: '王城大道有检查站，队伍需要选择如何接受检查。',
    choices: [
      { id: 'papers', action: '主动出示行旅文书' },
      { id: 'explain', action: '向守卫说明来意' },
    ],
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
    premise: '果坡驿站正在更换沿途路标，驿吏能提供前方水位和道路消息。',
    choices: [
      { id: 'waybill', action: '向驿吏查看行路簿' },
      { id: 'teamster', action: '向换马的车夫询问路况' },
    ],
    reverse: '经过果坡驿站后，远处已能看到星钟城旧哨塔，队伍可从驿路返回城门。',
  },
  {
    id: 'mill-creek',
    turns: 3,
    level: 3,
    type: 'event',
    premise: '白石水磨开闸放水，行人可以等水落下，或者经磨坊外侧石阶绕过。',
    choices: [
      { id: 'wait', action: '在干岸上等候水位回落' },
      { id: 'steps', action: '沿水磨外侧的石阶绕行' },
    ],
    reverse: '往果坡方向走，水磨正把涨水排入溪沟，等水落下或从石阶走都可以。',
  },
  {
    id: 'triumphal-check',
    turns: 3,
    level: 4,
    type: 'event',
    premise: '凯旋关哨正在查验通往首都的行旅队伍，守卫会记录来路和来访目的。',
    choices: [
      { id: 'register', action: '出示文书并登记来访目的' },
      { id: 'inquire', action: '到岗亭询问临时通行手续' },
    ],
    reverse: '离开关哨的队伍要确认文书，登记完便可顺着溪谷前往白石水磨。',
  },
  {
    id: 'eternal-gate',
    turns: 4,
    level: 4,
    type: 'event',
    premise: '帝都南门的车道留给仪仗，人行道沿城墙分流，守门骑士正在引导队伍。',
    choices: [
      { id: 'pedestrian', action: '按守卫指示从行人拱门进城' },
      { id: 'wait', action: '等仪仗通过后沿大道前行' },
    ],
    reverse: '队伍从艾尔鲁斯南门出城，守卫指引旅客从城墙侧边的小拱门通往凯旋关哨。',
    reverseChoices: [
      { id: 'pedestrian', action: '按守卫指示从行人拱门出城' },
      { id: 'wait', action: '等仪仗通过后沿大道出城' },
    ],
  },
]);

export const OVERLAND_STOPS = Object.freeze([...SILVER_ROAD_STOPS, ...CAPITAL_ROAD_STOPS.slice(1)]);

const travelStops = Object.freeze([...CAPITAL_ROAD_STOPS.slice(1).reverse(), ...SILVER_ROAD_STOPS]);
const travelLegs = Object.freeze([...CAPITAL_ROAD_LEGS.toReversed(), ...SILVER_ROAD_LEGS]);

const stopIndex = (id) => OVERLAND_STOPS.findIndex((stop) => stop.id === id);

export function overlandOrigin(scene) {
  if (typeof scene !== 'string') return null;
  if (stopIndex(scene) >= 0) return scene;
  if (Object.hasOwn(SILVER_CROWN_PLACES, scene)) return 'road-capital';
  if (Object.hasOwn(ETERNAL_CITY_PLACES, scene)) return ETERNAL_CITY_GATE;
  const section = OVERLAND_ROAD.findIndex(({ id }) => id === scene);
  if (section >= 0) {
    const lastStop = OVERLAND_ROAD.slice(0, section).findLast(({ id }) => stopIndex(id) >= 0);
    return lastStop?.id ?? 'outskirts';
  }
  return scene.startsWith('road-') || scene === 'tavern' ? null : 'outskirts';
}

export function overlandPlan(from, to, discovery) {
  if (discovery && discovery.id === to) {
    const link = OVERLAND_STOPS.find((stop) => stop.id === discovery.linkId);
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
      premise: `沿支路前往${discovery.name}，观察入口，留下可以返程的路标。`,
      choices: [
        { id: 'approach', action: '沿路标前往入口' },
        { id: 'observe', action: '先观察附近地形再前往' },
      ],
    };
    return {
      from,
      to,
      stages: [...(route?.stages || []), stage],
      turns: (route?.turns || 0) + stage.turns,
    };
  }
  return planWithStops(from, to, travelStops, travelLegs, CAPITAL_ROAD_LEGS.length);
}

function planWithStops(from, to, stops, legs, capitalLegCount = 0) {
  const start = stops.findIndex((stop) => stop.id === from);
  const end = stops.findIndex((stop) => stop.id === to);
  if (start < 0 || end < 0 || start === end) throw Error('请选择不同的有效出发地和目的地');
  const direction = start < end ? 1 : -1;
  const stages = Array.from({ length: Math.abs(end - start) }, (_, index) => {
    const current = start + direction * index;
    const next = current + direction;
    const legIndex = Math.min(current, next);
    const { reverse, reverseChoices, ...leg } = legs[legIndex];
    if (legIndex < capitalLegCount && direction > 0) {
      leg.premise = reverse;
      if (reverseChoices) leg.choices = reverseChoices;
    }
    return {
      ...leg,
      from: stops[current],
      to: stops[next],
    };
  });
  return { from, to, stages, turns: stages.reduce((sum, stage) => sum + stage.turns, 0) };
}

export function overlandRunPlan(run) {
  const plan = overlandPlan(run.from, run.to, run.discovery);
  if (
    run.acts?.length === plan.stages.length &&
    plan.stages.every((stage, index) => stage.id === run.acts[index]?.id)
  )
    return plan;
  // Trips already generated before the stop order changed finish with their original acts.
  const [starbell, bridge, reeds, capital] = SILVER_ROAD_STOPS;
  const [bridgeLeg, reedsLeg, capitalLeg] = SILVER_ROAD_LEGS;
  return planWithStops(
    run.from,
    run.to,
    [starbell, reeds, bridge, capital],
    [reedsLeg, bridgeLeg, capitalLeg],
  );
}

function prose(value, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum)
    throw Error('外出剧本缺少合规的正文或选项文案');
  return value.trim();
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
      Object.keys(entry).some((key) => !['stageId', 'name', 'description', 'value'].includes(key))
    )
      throw Error('外出战利品只能包含 stageId/name/description/value');
    if (!battleStages.has(entry.stageId) || seenStages.has(entry.stageId))
      throw Error('外出战利品只能对应存在战斗的路线站且每站至多一件');
    seenStages.add(entry.stageId);
    const name = prose(entry.name, 24);
    const description = prose(entry.description, 48);
    if (!Number.isInteger(entry.value) || entry.value < 4 || entry.value > 120)
      throw Error('外出战利品以太价值必须为 4～120 整数');
    return { stageId: entry.stageId, name, description, value: entry.value };
  });
}

export function normalizeOverlandStory(raw, plan) {
  if (Object.keys(raw || {}).some((key) => !['acts', 'items'].includes(key)))
    throw Error('外出剧本只能返回acts及可选items');
  if (!Array.isArray(raw?.acts) || raw.acts.length !== plan.stages.length)
    throw Error(`外出剧本必须恰好包含 ${plan.stages.length} 幕`);
  return plan.stages.map((stage, index) => {
    const act = raw.acts[index];
    if (act?.id !== stage.id) throw Error('外出剧本幕序与路线不一致');
    const allowed =
      stage.type === 'event' ? ['id', 'title', 'story', 'choices'] : ['id', 'title', 'story'];
    if (Object.keys(act).some((key) => !allowed.includes(key)))
      throw Error('外出剧本只能提供本幕正文和选项文案');
    const result = { id: stage.id, title: prose(act.title, 80), story: prose(act.story, 5000) };
    if (stage.type === 'event') {
      if (!Array.isArray(act.choices) || act.choices.length !== stage.choices.length)
        throw Error('外出事件选项数与路线不一致');
      result.choices = stage.choices.map((choice, choiceIndex) => {
        const item = act.choices[choiceIndex];
        if (
          item?.id !== choice.id ||
          Object.keys(item).some((key) => !['id', 'label', 'outcome'].includes(key))
        )
          throw Error('外出事件选项与路线不一致');
        return { id: choice.id, label: prose(item.label, 80), outcome: prose(item.outcome, 2400) };
      });
    }
    return result;
  });
}

export function restoreOverlandRun(value) {
  if (typeof value?.id !== 'string' || value.id.length > 100) return null;
  try {
    const plan = overlandRunPlan(value);
    const acts = normalizeOverlandStory({ acts: value.acts }, plan);
    const items = Array.isArray(value.items) ? normalizeOverlandItems(value.items, plan) : [];
    const index = value.index;
    if (!Number.isInteger(index) || index < 0 || index >= acts.length) return null;
    const phase = ['depart', 'intro', 'choice', 'outcome', 'battle'].includes(value.phase)
      ? value.phase
      : 'depart';
    const choice = acts[index].choices?.find((item) => item.id === value.choice)?.id;
    if (phase === 'outcome' && !choice) return null;
    if (phase === 'battle' && plan.stages[index].type !== 'battle') return null;
    if (phase === 'choice' && plan.stages[index].type !== 'event') return null;
    return {
      id: value.id,
      from: plan.from,
      to: plan.to,
      acts,
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
      ...(choice ? { choice } : {}),
    };
  } catch {
    return null;
  }
}
