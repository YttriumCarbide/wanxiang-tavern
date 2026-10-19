import { finalizeRequest } from './prompt-processing.js';

export function summaryItems(input) {
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 10000)
    throw Error('请选择1～10000条未总结记录');
  const ids = new Set();
  return input.items.map((item) => {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      item.id.length > 200 ||
      ids.has(item.id) ||
      !['chat', 'quick', 'dungeon'].includes(item.kind) ||
      typeof item.label !== 'string' ||
      item.label.length > 300 ||
      typeof item.text !== 'string' ||
      !item.text.trim() ||
      item.text.length > 200000
    )
      throw Error('总结条目格式无效或ID重复');
    ids.add(item.id);
    return { id: item.id, kind: item.kind, label: item.label, text: item.text };
  });
}

export async function summaryRequest(input, profile, countTokens, readText) {
  const items = summaryItems(input);
  const system = await readText('summary.system.md');
  return buildSummaryRequest(items, system, profile, countTokens);
}

function buildSummaryRequest(items, system, profile, countTokens) {
  return finalizeRequest(
    {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ items }) },
      ],
      sampling: { temperature: 0.2, stream: false },
      transport: { format: 'summary-json' },
      warnings: [],
    },
    profile,
    countTokens,
  );
}

/** Plan without truncation; one click can cover all items with bounded sequential requests. */
export async function summaryPlan(input, profile, countTokens, readText) {
  const items = summaryItems(input);
  const system = await readText('summary.system.md');
  const batches = [];
  let batch = [],
    prepared = null;
  const outputLimit = profile.tokenField === 'none' ? 8192 : profile.maxTokens;
  const maxItems = Math.max(1, Math.min(20, Math.floor(outputLimit / 500)));
  async function flush() {
    if (!batch.length) return;
    batches.push({
      ids: batch.map((item) => item.id),
      inputEstimate: prepared.tokens.inputEstimate,
    });
    batch = [];
    prepared = null;
  }
  for (const item of items) {
    if (batch.length >= maxItems) await flush();
    try {
      prepared = buildSummaryRequest([...batch, item], system, profile, countTokens);
    } catch (failure) {
      if (!failure.message.includes('超过上下文')) throw failure;
      await flush();
      prepared = buildSummaryRequest([item], system, profile, countTokens);
    }
    batch.push(item);
  }
  await flush();
  return {
    batches,
    inputEstimate: batches.reduce((sum, item) => sum + item.inputEstimate, 0),
    tokenizer: 'o200k_base',
  };
}

export function summaryResponse(raw, expected) {
  let result;
  try {
    result = JSON.parse(raw.trim());
  } catch {
    throw Error('总结API未返回完整JSON，本次摘要未保存');
  }
  const ids = new Set(expected.map((item) => item.id));
  if (
    !result ||
    Object.keys(result).length !== 1 ||
    !Array.isArray(result.items) ||
    result.items.length !== ids.size
  )
    throw Error('总结API遗漏或增加了条目，本次摘要未保存');
  const seen = new Set();
  for (const item of result.items) {
    if (
      !item ||
      Object.keys(item).sort().join(',') !== 'id,summary' ||
      !ids.has(item.id) ||
      seen.has(item.id) ||
      typeof item.summary !== 'string' ||
      !item.summary.trim() ||
      item.summary.length > 12000
    )
      throw Error('总结API的条目ID或摘要格式不符，本次摘要未保存');
    seen.add(item.id);
  }
  return result.items.map(({ id, summary }) => ({ id, summary: summary.trim() }));
}
