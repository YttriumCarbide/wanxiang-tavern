import { mergeMessages } from '../../../vendor/sillytavern/merge-messages.mjs';
import { requestTokenReport } from './request-tokens.js';
import { outputToolRequest } from '../preset-output.js';
import { miaosaiyaFinalRequest, miaosaiyaPromptMessages } from '../miaosaiya-processing.js';
import {
  processPresetMessages,
  prepareKeminiTransport,
  presetStopStrings,
} from './preset-processing.js';

/** Use the upstream SillyTavern implementation for both supported processing modes. */
export function processPrompt(messages, mode = 'merge_tools', names = []) {
  if (mode === 'none') return structuredClone(messages);
  if (!['strict', 'merge_tools'].includes(mode)) throw Error('提示词后处理类型无效');
  return mergeMessages(
    structuredClone(messages),
    {
      charName: names.join('、'),
      userName: '玩家',
      groupNames: names,
      startsWithGroupName: (text) => names.some((name) => text.startsWith(`${name}: `)),
    },
    { strict: mode === 'strict', placeholders: mode === 'strict', tools: mode === 'merge_tools' },
  );
}

export function finalizeRequest(prepared, profile, countTokens, names = []) {
  const sampling = prepared.sampling || {};
  const maxOutput = profile.tokenField === 'none' ? 0 : (sampling.maxTokens ?? profile.maxTokens);
  const mode = prepared.transport?.promptProcessing || profile.promptProcessing || 'merge_tools';
  const processed = processPresetMessages(
    miaosaiyaPromptMessages(prepared.messages, prepared.transport?.presetProcessing),
    prepared.transport?.presetProcessing,
    prepared.transport?.presetVariables,
  );
  const kemini = prepareKeminiTransport(
    processPrompt(processed.messages, mode, names),
    prepared.transport?.presetProcessing,
    Boolean(prepared.transport?.outputTool),
  );
  const final = miaosaiyaFinalRequest(kemini.messages, prepared.transport?.presetProcessing);
  const messages = final.messages;
  const outputTool = kemini.outputTool || prepared.transport?.outputTool;
  const tokens = requestTokenReport(
    messages,
    countTokens,
    null,
    maxOutput,
    outputToolRequest(outputTool, final.contextTool),
  );
  const contextSize = sampling.contextSize ?? profile.contextSize ?? 131072;
  if (tokens.totalBudgetEstimate > contextSize)
    throw Error(
      `请求需要约${tokens.totalBudgetEstimate} TK，超过上下文${contextSize}；请减少上下文或回复上限`,
    );
  return {
    ...prepared,
    messages,
    tokens,
    transport: {
      ...prepared.transport,
      promptProcessing: mode,
      stream: sampling.stream ?? profile.stream ?? false,
      contextSize,
      ...(outputTool ? { outputTool } : {}),
      ...(final.contextTool ? { contextTool: final.contextTool } : {}),
      processingStatus: { ...processed.status, ...kemini.status, ...final.status },
      stop: presetStopStrings(prepared.transport?.presetProcessing),
    },
  };
}
