import * as shared from '../src/ai/pipeline/summary-request.js';
export * from '../src/ai/pipeline/summary-request.js';
import { readFile } from 'node:fs/promises';
const readText = (name) => readFile(new URL('../prompts/' + name, import.meta.url), 'utf8');
export const summaryRequest = (input, profile, countTokens) =>
  shared.summaryRequest(input, profile, countTokens, readText);
export const summaryPlan = (input, profile, countTokens) =>
  shared.summaryPlan(input, profile, countTokens, readText);
