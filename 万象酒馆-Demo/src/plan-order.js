import { preview } from './engine.js';

/** Reordering is atomic: validate both exchanged actions against the real simulation. */
export function reorderPlan(state, plan, id, start) {
  const source = plan.find((action) => action.id === id);
  if (!source || !Number.isInteger(start)) return { error: '行动或时间位置无效。' };
  if (start >= source.start && start < source.start + source.ap)
    return { plan, forecast: preview(state, plan), swapped: false };
  const target = plan.find(
    (action) => action.id !== id && start >= action.start && start < action.start + action.ap,
  );
  const candidate = plan.map((action) => {
    if (action.id === id) return { ...action, start: target ? target.start : start };
    if (target && action.id === target.id) return { ...action, start: source.start };
    return { ...action };
  });
  const forecast = preview(state, candidate);
  if (!forecast.valid)
    return {
      error: `${target ? '这两项行动暂时不能交换' : '这里无法放置行动'}：${forecast.invalid[0].message}`,
    };
  return { plan: candidate, forecast, swapped: !!target };
}
