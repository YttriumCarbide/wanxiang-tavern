import * as shared from '../src/ai/pipeline/summary-request.js';
export * from '../src/ai/pipeline/summary-request.js';
import { readFile } from 'node:fs/promises';
const readText = (name) => readFile(new URL('../prompts/' + name, import.meta.url), 'utf8');
export function summaryRequest(input, profileOrPreset, countTokensOrOptions, maybeReadText) {
  const fallbackReader = maybeReadText ?? readText;
  if (typeof countTokensOrOptions === 'object' && countTokensOrOptions !== null) {
    return shared.summaryRequest(input, profileOrPreset, {
      ...countTokensOrOptions,
      readText: countTokensOrOptions.readText ?? fallbackReader,
    });
  }
  return shared.summaryRequest(input, profileOrPreset, countTokensOrOptions, fallbackReader);
}

export function summaryPlan(input, profile, countTokens, maybeReadText, options = null) {
  const reader = options?.readText ?? maybeReadText ?? readText;
  return shared.summaryPlan(
    input,
    profile,
    countTokens,
    reader,
    options && { ...options, readText: reader },
  );
}
