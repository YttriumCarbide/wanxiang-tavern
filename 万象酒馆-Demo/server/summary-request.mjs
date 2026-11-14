import * as shared from '../src/ai/pipeline/summary-request.js';
export * from '../src/ai/pipeline/summary-request.js';
import { readFile } from 'node:fs/promises';
const readText = (name) => readFile(new URL('../prompts/' + name, import.meta.url), 'utf8');
export const summaryRequest = (input, profileOrPreset, countTokensOrOptions, maybeReadText) =>
  typeof countTokensOrOptions === 'object' && countTokensOrOptions !== null
    ? shared.summaryRequest(input, profileOrPreset, {
        ...countTokensOrOptions,
        readText: countTokensOrOptions.readText || readText,
      })
    : shared.summaryRequest(input, profileOrPreset, countTokensOrOptions, maybeReadText || readText);
export const summaryPlan = (input, profile, countTokens, maybeReadText, options = null) =>
  shared.summaryPlan(input, profile, countTokens, maybeReadText || readText, options);
