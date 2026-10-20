import { normalizeEquipment, equipmentBudget } from '../../equipment.js';
import { finalizeRequest } from './prompt-processing.js';

export function creationItems(input) {
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 10000)
    throw Error('请选择尚未凝聚的归档物品');
  const ids = new Set();
  return input.items.map((item) => {
    const script = item.script ?? input.scripts?.[item.scriptId];
    if (
      !item ||
      typeof item.id !== 'string' ||
      ids.has(item.id) ||
      typeof item.name !== 'string' ||
      typeof item.description !== 'string' ||
      typeof script !== 'string' ||
      script.length > 200000 ||
      !Number.isInteger(item.value) ||
      item.value < 0 ||
      item.value > 10000
    )
      throw Error('造物来源无效');
    ids.add(item.id);
    return {
      id: item.id,
      name: item.name,
      description: item.description,
      value: item.value,
      map: item.map,
      script,
      budget: equipmentBudget(item.value),
    };
  });
}
export function creationInput(input) {
  const items = creationItems(input);
  const scripts = [];
  const references = items.map(({ script, ...item }) => {
    let index = scripts.indexOf(script);
    if (index < 0) {
      index = scripts.length;
      scripts.push(script);
    }
    return { ...item, scriptIndex: index };
  });
  return { items: references, scripts };
}
/** Conservative batching estimate; the real request includes the selected preset/worldbook and is checked again. */
function creationEstimate(input, profile, countTokens) {
  return finalizeRequest(
    {
      messages: [{ role: 'user', content: JSON.stringify(creationInput(input)) }],
      sampling: {},
      transport: {},
      warnings: [],
    },
    { ...profile, contextSize: Math.max(1, (profile.contextSize || 131072) - 6000) },
    countTokens,
  );
}

export function creationResponse(content, expected) {
  let raw;
  try {
    raw = JSON.parse(content.trim());
  } catch {
    throw Error('造物API需要返回完整JSON，未保存或扣费');
  }
  if (!Array.isArray(raw.items) || raw.items.length !== expected.length)
    throw Error('造物结果遗漏或增加物品');
  const seen = new Set();
  return raw.items.map((item) => {
    const source = expected.find((entry) => entry.id === item.id);
    if (!source || seen.has(item.id)) throw Error('造物来源ID重复或不存在');
    seen.add(item.id);
    return normalizeEquipment(item, source);
  });
}
export function creationPlan(input, profile, countTokens) {
  const items = creationItems(input);
  const batches = [];
  let batch = [];
  const maxItems = Math.max(1, Math.min(12, Math.floor((profile.maxTokens || 8192) / 1000)));
  for (const item of items) {
    if (batch.length >= maxItems) {
      batches.push(batch);
      batch = [];
    }
    try {
      creationEstimate({ items: [...batch, item] }, profile, countTokens);
    } catch (failure) {
      if (!failure.message.includes('超过上下文') || !batch.length) throw failure;
      batches.push(batch);
      batch = [];
      creationEstimate({ items: [item] }, profile, countTokens);
    }
    batch.push(item);
  }
  if (batch.length) batches.push(batch);
  return { batches: batches.map((batch) => batch.map((item) => item.id)) };
}
