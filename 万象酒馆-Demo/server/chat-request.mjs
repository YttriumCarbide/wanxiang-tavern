import * as shared from '../src/ai/pipeline/chat-request.js';
export * from '../src/ai/pipeline/chat-request.js';
export const chatRequest = (kind, input, source, options) =>
  shared.chatRequest(kind, input, source, options);
