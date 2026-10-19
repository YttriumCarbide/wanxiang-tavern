import * as shared from '../src/ai/pipeline/regex-presentation.js';
export * from '../src/ai/pipeline/regex-presentation.js';
import { runRegexTasks } from './regex-runtime.mjs';
export const formatRegexPresentation = (entry, kind, scripts) =>
  shared.formatRegexPresentation(entry, kind, scripts, runRegexTasks);
