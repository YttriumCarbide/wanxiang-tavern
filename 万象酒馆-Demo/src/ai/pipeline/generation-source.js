import { extractGenerationEnvelope, OUTPUT_OPEN } from './output-envelope.js';
import { repairJSONText } from './generation-result.js';

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])]),
    );
  return value;
}

/** Report copied examples for diagnostics; prose quality never blocks a well-formed result. */
export function generationSourceWarnings(kind, content, messages) {
  const repaired = repairJSONText(content);
  let candidate;
  try {
    candidate = JSON.stringify(canonical(JSON.parse(repaired.candidateText)));
  } catch {
    return []; // Syntax errors are reported by the shared JSON reader.
  }
  for (const message of messages.filter((entry) => entry.role === 'assistant')) {
    let example;
    try {
      const text = message.content.trim().startsWith(OUTPUT_OPEN)
        ? extractGenerationEnvelope(kind, message.content).candidateText
        : message.content;
      example = JSON.stringify(canonical(JSON.parse(repairJSONText(text).candidateText)));
    } catch {
      continue; // Ordinary dialogue and incomplete examples are not structured results.
    }
    if (candidate !== example) continue;
    return [
      {
        path: 'output.source',
        message: '返回与发送中的Assistant格式示例相同；仅供对照，不影响格式校验或接收。',
      },
    ];
  }
  return [];
}
