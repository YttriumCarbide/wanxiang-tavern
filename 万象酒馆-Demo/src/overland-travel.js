export const OVERLAND_STOPS = Object.freeze([
  { id: 'outskirts', name: '星钟城 · 旧哨塔' },
  { id: 'road-bridge', name: '双拱石桥' },
  { id: 'road-reeds', name: '芦苇浅滩' },
  { id: 'road-capital', name: '银冠城外门' },
]);

export const OVERLAND_LEGS = Object.freeze([
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

const stopIndex = (id) => OVERLAND_STOPS.findIndex((stop) => stop.id === id);

export function overlandOrigin(scene) {
  if (typeof scene !== 'string') return null;
  if (stopIndex(scene) >= 0) return scene;
  return scene.startsWith('road-') || scene === 'tavern' ? null : 'outskirts';
}

export function overlandPlan(from, to) {
  return planWithStops(from, to, OVERLAND_STOPS, OVERLAND_LEGS);
}

function planWithStops(from, to, stops, legs) {
  const start = stops.findIndex((stop) => stop.id === from);
  const end = stops.findIndex((stop) => stop.id === to);
  if (start < 0 || end < 0 || start === end) throw Error('请选择不同的有效出发地和目的地');
  const direction = start < end ? 1 : -1;
  const stages = Array.from({ length: Math.abs(end - start) }, (_, index) => {
    const current = start + direction * index;
    const next = current + direction;
    return {
      ...legs[Math.min(current, next)],
      from: stops[current],
      to: stops[next],
    };
  });
  return { from, to, stages, turns: stages.reduce((sum, stage) => sum + stage.turns, 0) };
}

export function overlandRunPlan(run) {
  const plan = overlandPlan(run.from, run.to);
  if (
    run.acts?.length === plan.stages.length &&
    plan.stages.every((stage, index) => stage.id === run.acts[index]?.id)
  )
    return plan;
  // Trips already generated before the stop order changed finish with their original acts.
  const [starbell, bridge, reeds, capital] = OVERLAND_STOPS;
  const [bridgeLeg, reedsLeg, capitalLeg] = OVERLAND_LEGS;
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

export function normalizeOverlandStory(raw, plan) {
  if (Object.keys(raw || {}).some((key) => key !== 'acts')) throw Error('外出剧本只能返回acts');
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
      index,
      phase,
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
