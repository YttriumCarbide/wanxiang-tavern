function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCount(value) {
  return Number.isFinite(value) && value >= 0;
}

export function normalizeUsage(value) {
  if (!isObject(value)) return { input: 0, output: 0 };

  const usage = { ...value };
  if (!isCount(usage.input)) usage.input = 0;
  if (!isCount(usage.output)) usage.output = 0;
  if (!isCount(usage.total)) delete usage.total;

  if (isObject(usage.completion_tokens_details)) {
    const details = { ...usage.completion_tokens_details };
    if (!isCount(details.reasoning_tokens)) delete details.reasoning_tokens;
    usage.completion_tokens_details = details;
  }
  return usage;
}
