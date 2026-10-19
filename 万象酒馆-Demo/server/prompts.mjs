import * as shared from '../src/ai/pipeline/prompts.js';
export * from '../src/ai/pipeline/prompts.js';
import { readFile } from 'node:fs/promises';
const readText = (name) => readFile(new URL('../prompts/' + name, import.meta.url), 'utf8');
import { runRegexTasks } from './regex-runtime.mjs';
export const generationRequest = (kind, input, source, options = {}) =>
  shared.generationRequest(kind, input, source, { ...options, readText, runRegexTasks });
export const generationMessages = async (kind, input, source) =>
  (await generationRequest(kind, input, source)).messages;
