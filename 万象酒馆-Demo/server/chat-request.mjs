import * as shared from '../src/ai/pipeline/chat-request.js';
export * from '../src/ai/pipeline/chat-request.js';
import { runRegexTasks } from './regex-runtime.mjs';
export const chatRequest = (kind, input, source, options) =>
  shared.chatRequest(kind, input, source, { ...options, runRegexTasks });
