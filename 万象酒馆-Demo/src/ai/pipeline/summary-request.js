import { finalizeRequest } from './prompt-processing.js';
import { normalizePromptPreset, composePromptPreset, presetSampling } from '../presets.js';
import { scanWorldbooks, injectWorldbookMessages } from '../worldbook-scan.js';
import { presetOutputWarnings } from '../preset-output.js';
import { memoryKeywords } from '../../memory.js';
import { buildTriggerIds } from '../worldbook-triggers.js';

export function summaryItems(input) {
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 10000)
    throw Error('请选择1～10000条未总结记录');
  const ids = new Set();
  return input.items.map((item) => {
    if (
      !item ||
      typeof item.id !== 'string' ||
      !item.id ||
      item.id.length > 200 ||
      ids.has(item.id) ||
      !['chat', 'quick', 'dungeon', 'invitation', 'overland', 'quest'].includes(item.kind) ||
      typeof item.label !== 'string' ||
      item.label.length > 300 ||
      typeof item.text !== 'string' ||
      !item.text.trim() ||
      item.text.length > 200000
    )
      throw Error('总结条目格式无效或ID重复');
    ids.add(item.id);
    return {
      id: item.id,
      kind: item.kind,
      label: item.label,
      text: item.text,
      ...(typeof item.gameTime === 'string' ? { gameTime: item.gameTime.slice(0, 60) } : {}),
      ...(typeof item.place === 'string' ? { place: item.place.slice(0, 80) } : {}),
      ...(Array.isArray(item.people)
        ? {
            people: item.people
              .filter((name) => typeof name === 'string')
              .slice(0, 12)
              .map((name) => name.slice(0, 60)),
          }
        : {}),
    };
  });
}

async function buildPipelineSummary(items, source, options = {}) {
  const { profile = {}, readText, runRegexTasks } = options;
  const regexScripts = options.regexScripts || [];
  const inputText = JSON.stringify({ items });
  const raw =
    source ||
    (readText ? JSON.parse(await readText('framework/summary-default.json')) : { prompts: [] });
  const { preset } = normalizePromptPreset(raw, raw.id);
  const scan = options.worldInfo
    ? scanWorldbooks({
        ...options.worldInfo,
        countTokens: options.countTokens,
        context: {
          kind: 'summary',
          triggerIds: buildTriggerIds('summary', { items }),
          trigger: 'normal',
          messages: [{ role: 'user', content: inputText }],
          names: [],
          characterIds: [],
          characters: '',
          personalities: '',
          scenario: '',
          persona: '',
          tags: [],
        },
      })
    : null;
  if (scan && regexScripts.length && runRegexTasks) {
    const processed = await runRegexTasks(
      regexScripts,
      scan.entries.map((entry) => ({
        text: entry.content,
        placement: 5,
        options: { kind: 'summary', isPrompt: true, variables: { user: '玩家', char: '' } },
      })),
    );
    scan.entries.forEach((entry, index) => {
      entry.content = processed[index].text;
    });
  }
  const wiBefore =
    scan?.entries
      .filter((entry) => entry.position === 0)
      .map((entry) => entry.content)
      .join('\n\n') || '';
  const wiAfter =
    scan?.entries
      .filter((entry) => entry.position === 1)
      .map((entry) => entry.content)
      .join('\n\n') || '';
  const variables = {
    input: inputText,
    brief: `总结 ${items.length} 条记录`,
    task: '记忆总结',
    user: '玩家',
    char: '',
    description: '',
    personality: '',
    characters: '',
    worldbook:
      scan?.entries
        .filter((entry) => !entry.extensions?.wanxiang?.generationRule?.endsWith('-output'))
        .map((entry) => entry.content)
        .join('\n\n') || '',
    outputschema: '',
    scenario: '',
    persona: '',
    history: '',
    wibefore: wiBefore,
    wiafter: wiAfter,
    mesexamples: '',
    original: '',
    lastmessage: inputText,
    lastusermessage: inputText,
    lastchatmessage: inputText,
    lastcharmessage: '',
    firstmessage: '',
    instruct: '',
    system: '',
  };
  const message = (content, role = 'user') => (content ? [{ role, content }] : []);
  const userMessage = { role: 'user', content: inputText };
  const enabled = preset.prompt_order[0].order
    .filter((item) => item.enabled)
    .map((item) => preset.prompts.find((entry) => entry.identifier === item.identifier))
    .filter(Boolean);
  const hasMacro = (macro) =>
    enabled.some((entry) => new RegExp(`{{\\s*${macro}\\s*}}`, 'i').test(entry.content));
  const markerEntries = enabled.filter((entry) => entry.marker).map((entry) => entry.identifier);
  const ownedBefore = markerEntries.includes('worldInfoBefore') || hasMacro('wiBefore');
  const ownedAfter = markerEntries.includes('worldInfoAfter') || hasMacro('wiAfter');
  const markers = {
    taskContext: [userMessage],
    chatHistory: [userMessage],
    worldInfoBefore: markerEntries.includes('worldInfoBefore') ? message(wiBefore, 'system') : [],
    worldInfoAfter: markerEntries.includes('worldInfoAfter') ? message(wiAfter, 'system') : [],
    charDescription: [],
    charPersonality: [],
    scenario: [],
    personadescription: [],
    dialogueExamples: [],
  };
  let seenInput = false;
  let messages = composePromptPreset(preset, variables, markers).filter((msg) => {
    if (msg !== userMessage) return true;
    if (seenInput) return false;
    seenInput = true;
    return true;
  });
  if (scan) {
    const entries = hasMacro('worldbook')
      ? scan.entries.filter(
          (entry) =>
            entry.position === 7 || entry.extensions?.wanxiang?.generationRule === 'summary-output',
        )
      : scan.entries.filter(
          (entry) =>
            !(entry.position === 0 && ownedBefore) && !(entry.position === 1 && ownedAfter),
        );
    messages = injectWorldbookMessages(
      messages,
      entries,
      options.worldInfo.settings?.authorNote || '',
    );
  }
  const warnings = presetOutputWarnings(preset);
  if (!options.worldInfo && readText) {
    messages.unshift({ role: 'system', content: await readText('summary.system.md') });
  } else if (
    scan &&
    !scan.entries.some((entry) => entry.extensions?.wanxiang?.generationRule === 'summary-output')
  ) {
    warnings.push(
      '当前API的总结规范 @D条目未激活；请在世界书检查开关与发送对象。代码仍会校验返回结构。',
    );
  }
  let regexChanges = [];
  if (runRegexTasks && regexScripts.length) {
    const regexResults = await runRegexTasks(
      regexScripts,
      messages.map((msg, index) => ({
        text: msg.content,
        placement: msg.role === 'assistant' ? 2 : msg.role === 'user' ? 1 : -1,
        options: {
          kind: 'summary',
          isPrompt: true,
          depth: messages.length - index - 1,
          variables: { user: '玩家', char: '' },
        },
      })),
    );
    messages = messages.map((msg, index) => ({ ...msg, content: regexResults[index].text }));
    regexChanges = regexResults.flatMap((result) => result.changes || []);
  }
  return finalizeRequest(
    {
      messages,
      sampling: { temperature: 0.2, ...presetSampling(preset), stream: false },
      transport: {
        format: 'summary-json',
        presetProcessing: options.presetProcessing,
        presetVariables: { user: '玩家', char: '' },
      },
      regex: { scripts: regexScripts.length, changes: regexChanges },
      ...(scan
        ? {
            worldInfo: {
              report: scan.report,
              warnings: scan.warnings,
              usedTokens: scan.usedTokens,
              budget: scan.budget,
              scanDepth: scan.scanDepth,
            },
            nextWorldState: scan.nextState,
          }
        : {}),
      warnings: [...new Set(warnings)],
    },
    profile,
    options.countTokens,
  );
}

export async function summaryRequest(input, profileOrPreset, countTokensOrOptions, readText) {
  const items = summaryItems(input);
  if (typeof countTokensOrOptions === 'object' && countTokensOrOptions !== null) {
    return buildPipelineSummary(items, profileOrPreset, countTokensOrOptions);
  }
  const system = await readText('summary.system.md');
  return buildSummaryRequest(items, system, profileOrPreset, countTokensOrOptions);
}

function buildSummaryRequest(items, system, profile, countTokens) {
  return finalizeRequest(
    {
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: JSON.stringify({ items }) },
      ],
      sampling: { temperature: 0.2, stream: false },
      transport: { format: 'summary-json' },
      warnings: [],
    },
    profile,
    countTokens,
  );
}

/** Plan without truncation; one click can cover all items with bounded sequential requests. */
export async function summaryPlan(input, profile, countTokens, readText, options = null) {
  const items = summaryItems(input);
  const system =
    options?.preset || options?.worldInfo
      ? ''
      : await (options?.readText || readText)('summary.system.md');
  const buildBatch = async (batchItems) => {
    if (options?.preset || options?.worldInfo) {
      return buildPipelineSummary(batchItems, options.preset, {
        ...options,
        profile,
        countTokens,
      });
    }
    return buildSummaryRequest(batchItems, system, profile, countTokens);
  };
  const batches = [];
  let batch = [],
    prepared = null;
  const outputLimit = profile.tokenField === 'none' ? 8192 : profile.maxTokens;
  const maxItems = Math.max(1, Math.min(20, Math.floor(outputLimit / 500)));
  async function flush() {
    if (!batch.length) return;
    batches.push({
      ids: batch.map((item) => item.id),
      inputEstimate: prepared.tokens.inputEstimate,
    });
    batch = [];
    prepared = null;
  }
  for (const item of items) {
    if (batch.length >= maxItems) await flush();
    try {
      prepared = await buildBatch([...batch, item]);
    } catch (failure) {
      if (!failure.message.includes('超过上下文')) throw failure;
      await flush();
      prepared = await buildBatch([item]);
    }
    batch.push(item);
  }
  await flush();
  return {
    batches,
    inputEstimate: batches.reduce((sum, item) => sum + item.inputEstimate, 0),
    tokenizer: 'o200k_base',
  };
}

export function summaryResponse(raw, expected) {
  let result;
  try {
    result = JSON.parse(raw.trim());
  } catch {
    throw Error('总结API未返回完整JSON，本次摘要未保存');
  }
  const sources = new Map(expected.map((item) => [item.id, item]));
  if (
    !result ||
    Object.keys(result).length !== 1 ||
    !Array.isArray(result.items) ||
    result.items.length !== sources.size
  )
    throw Error('总结API遗漏或增加了条目，本次摘要未保存');
  const seen = new Set();
  for (const item of result.items) {
    if (
      !item ||
      Object.keys(item).some((key) => !['id', 'summary', 'keywords'].includes(key)) ||
      !sources.has(item.id) ||
      seen.has(item.id) ||
      typeof item.summary !== 'string' ||
      !item.summary.trim() ||
      item.summary.length > 12000
    )
      throw Error('总结API的条目ID或摘要格式不符，本次摘要未保存');
    seen.add(item.id);
  }
  return result.items.map(({ id, summary, keywords }) => {
    const source = sources.get(id);
    const longRecord = ['dungeon', 'overland', 'invitation', 'quest'].includes(source.kind);
    const body = summary.trim();
    const result = {
      id,
      summary:
        source.gameTime && !body.includes(source.gameTime)
          ? `【${source.gameTime}】${body}`.slice(0, 12000)
          : body,
    };
    if (!longRecord && !source.gameTime && !Array.isArray(keywords)) return result;
    const words = memoryKeywords(keywords);
    words[0] ||= source.place || '';
    words[1] ||= source.people?.[0] || '';
    return { ...result, keywords: memoryKeywords(words) };
  });
}
