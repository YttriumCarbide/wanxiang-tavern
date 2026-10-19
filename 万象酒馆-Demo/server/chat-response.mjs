import * as shared from '../src/ai/pipeline/chat-response.js';
export * from '../src/ai/pipeline/chat-response.js';
import { runRegexTasks } from './regex-runtime.mjs';
export const chatResponse = (kind, content, scripts, input) =>
  shared.chatResponse(kind, content, scripts, input, runRegexTasks);
