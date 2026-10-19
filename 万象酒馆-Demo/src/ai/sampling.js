/** Portable preset fields; null means defer to the connection/provider. */
export const SAMPLING_FIELDS = [
  { key: 'temperature', label: '温度', min: 0, max: 2, step: 0.05 },
  { key: 'top_k', label: 'Top K', min: 0, max: 1000, step: 1 },
  { key: 'top_p', label: 'Top P', min: 0, max: 1, step: 0.01 },
  { key: 'presence_penalty', label: '存在惩罚', min: -2, max: 2, step: 0.05 },
  { key: 'frequency_penalty', label: '频率惩罚', min: -2, max: 2, step: 0.05 },
  { key: 'contextSize', label: '上下文 TK', min: 1024, max: 4000000, step: 1 },
  { key: 'maxTokens', label: '最大回复 TK', min: 256, max: 131072, step: 1 },
];

export function samplingFromPreset(preset = {}) {
  const source = {
    ...preset,
    contextSize: preset.contextSize ?? preset.openai_max_context ?? preset.max_context,
    maxTokens: preset.maxTokens ?? preset.openai_max_tokens ?? preset.max_completion_tokens,
    stream: preset.stream ?? preset.stream_openai ?? preset.should_stream,
  };
  const result = {};
  for (const { key, min, max, step } of SAMPLING_FIELDS) {
    const value = source[key];
    if (value === undefined || value === null || value === '') continue;
    if (
      !Number.isFinite(value) ||
      value < min ||
      value > max ||
      (step === 1 && !Number.isInteger(value))
    )
      throw Error(`${key}范围无效（${min}～${max}）`);
    result[key] = value;
  }
  if (source.stream !== undefined) {
    if (typeof source.stream !== 'boolean') throw Error('流式传输必须是开关');
    result.stream = source.stream;
  }
  if (source.reasoning_effort && source.reasoning_effort !== 'auto') {
    if (
      !['none', 'minimal', 'min', 'low', 'medium', 'high', 'xhigh', 'max'].includes(
        source.reasoning_effort,
      )
    )
      throw Error('推理强度无效');
    result.reasoning_effort = source.reasoning_effort;
  }
  return result;
}
