import { journeyContinuityMessage } from '../../memory.js';
import { normalizePromptPreset, composePromptPreset, presetSampling } from '../presets.js';
import { scanWorldbooks, injectWorldbookMessages } from '../worldbook-scan.js';
import { buildTriggerIds } from '../worldbook-triggers.js';
import { presetOutputTransport, outputToolRequest } from '../preset-output.js';
import { auditPromptPreset } from './prompt-audit.js';
import { OUTPUT_TAG } from './output-envelope.js';
import { requestTokenReport } from './request-tokens.js';
import { finalizeRequest } from './prompt-processing.js';
import { playerIntentMessages, playerIntentText } from './player-intent.js';
import { galActorListText } from '../gal-prompt.js';

/**
 * Composes preset + ID/keyword-triggered worldbook requests for script sub-modes.
 * Returns null if worldInfo lacks the required rule entry so callers can fall back cleanly.
 */
export async function buildSubScriptRequest({
  input,
  scanInput = input,
  requiredRule,
  preset,
  profile,
  worldInfo,
  countTokens,
  regexScripts = [],
  runRegexTasks = null,
  presetProcessing = null,
  taskLabel,
  brief,
  scenario = brief,
  userPayload,
  includeActors = true,
  includeIntent = true,
  actorNames = null,
  samplingAdjust = null,
}) {
  if (!worldInfo?.books?.length || !preset) return null;
  const { preset: normalized } = normalizePromptPreset(preset, preset.id);
  const party = Array.isArray(input?.party) ? input.party : [];
  const characters = party
    .map((entry) => {
      const setting = `${entry.name}（${entry.id}）\n${entry.worldbook || ''}`;
      return entry.invitationMemory
        ? `${setting}\n【此人与玩家过去共同经历的约见】\n${entry.invitationMemory}`
        : setting;
    })
    .join('\n\n');
  const intentText = includeIntent ? playerIntentText(input?.playerIntent) : '';
  const variablesForRegex = {
    char: party
      .map((entry) => entry.name)
      .filter(Boolean)
      .join('、'),
    user: party.find((entry) => entry.id === input?.protagonistId)?.name || '玩家',
  };
  const scan = scanWorldbooks({
    ...worldInfo,
    countTokens,
    context: {
      kind: 'script',
      triggerIds: buildTriggerIds('script', scanInput),
      outputSchema: JSON.stringify({
        type: 'object',
        description: '完整结构见当前API世界书格式条目，数据参考见本次输入',
      }),
      trigger: 'normal',
      messages: [
        ...(brief ? [{ role: 'user', content: String(brief) }] : []),
        ...(intentText ? playerIntentMessages(intentText) : []),
      ],
      names: party.map((entry) => entry.name).filter(Boolean),
      characterIds: party.map((entry) => entry.id).filter(Boolean),
      characters,
      personalities: characters,
      scenario: String(scenario || ''),
      persona: worldInfo.settings?.persona || '玩家的行为与意愿由玩家决定。',
      tags: [...new Set(party.flatMap((entry) => (Array.isArray(entry.tags) ? entry.tags : [])))],
    },
  });
  if (
    requiredRule &&
    !scan.entries.some((entry) => entry.extensions?.wanxiang?.generationRule === requiredRule)
  ) {
    return null;
  }
  if (runRegexTasks && regexScripts.length) {
    const processed = await runRegexTasks(
      regexScripts,
      scan.entries.map((entry) => ({
        text: entry.content,
        placement: 5,
        options: { kind: 'script', isPrompt: true, variables: variablesForRegex },
      })),
    );
    scan.entries.forEach((entry, index) => {
      entry.content = processed[index].text;
    });
  }
  const wiBefore = scan.entries
    .filter((entry) => entry.position === 0)
    .map((entry) => entry.content)
    .join('\n\n');
  const wiAfter = scan.entries
    .filter((entry) => entry.position === 1)
    .map((entry) => entry.content)
    .join('\n\n');
  const inputText = JSON.stringify(userPayload, null, 2);
  const variables = {
    input: inputText,
    brief: String(brief || ''),
    task: taskLabel,
    char: variablesForRegex.char,
    user: variablesForRegex.user,
    description: characters,
    personality: characters,
    characters,
    worldbook: scan.entries
      .filter((entry) => !entry.extensions?.wanxiang?.generationRule?.endsWith('-output'))
      .map((entry) => entry.content)
      .join('\n\n'),
    outputschema: '',
    scenario: String(scenario || ''),
    persona: worldInfo.settings?.persona || '玩家的行为与意愿由玩家决定。',
    history: '',
    wibefore: wiBefore,
    wiafter: wiAfter,
    mesexamples: '',
    original: '',
    lastmessage: String(brief || ''),
    lastusermessage: String(brief || ''),
    lastchatmessage: String(brief || ''),
    lastcharmessage: '',
    firstmessage: '',
    instruct: '',
    system: '',
  };
  for (const entry of scan.entries.filter((item) => item.position === 7)) {
    const key = `outlet::${entry.outletName.toLowerCase()}`;
    variables[key] = (variables[key] ? variables[key] + '\n\n' : '') + entry.content;
  }
  const message = (content, role = 'user') => (content ? [{ role, content }] : []);
  const enabled = normalized.prompt_order[0].order
    .filter((item) => item.enabled)
    .map((item) => normalized.prompts.find((entry) => entry.identifier === item.identifier))
    .filter(Boolean);
  const hasMacro = (macro) =>
    enabled.some((entry) => new RegExp(`{{\\s*${macro}\\s*}}`, 'i').test(entry.content));
  const markerEntries = enabled.filter((entry) => entry.marker).map((entry) => entry.identifier);
  const ownedBefore = markerEntries.includes('worldInfoBefore') || hasMacro('wiBefore');
  const ownedAfter = markerEntries.includes('worldInfoAfter') || hasMacro('wiAfter');
  const markers = {
    taskContext: message(inputText),
    chatHistory: message(inputText),
    worldInfoBefore: markerEntries.includes('worldInfoBefore') ? message(wiBefore, 'system') : [],
    worldInfoAfter: markerEntries.includes('worldInfoAfter') ? message(wiAfter, 'system') : [],
    charDescription: message(characters, 'system'),
    charPersonality: [],
    scenario: message(String(scenario || ''), 'system'),
    personadescription: message(variables.persona),
    dialogueExamples: [],
  };
  let messages = composePromptPreset(normalized, variables, markers);
  const injectedEntries = hasMacro('worldbook')
    ? scan.entries.filter(
        (entry) =>
          entry.position === 7 || entry.extensions?.wanxiang?.generationRule?.endsWith('-output'),
      )
    : scan.entries.filter(
        (entry) => !(entry.position === 0 && ownedBefore) && !(entry.position === 1 && ownedAfter),
      );
  messages = injectWorldbookMessages(
    messages,
    injectedEntries,
    worldInfo.settings?.authorNote || '',
    { characterText: characters },
  );
  if (runRegexTasks && regexScripts.length) {
    const regexResults = await runRegexTasks(
      regexScripts,
      messages.map((msg, index) => ({
        text: msg.content,
        placement: msg.role === 'assistant' ? 2 : msg.role === 'user' ? 1 : -1,
        options: {
          kind: 'script',
          isPrompt: true,
          depth: messages.length - index - 1,
          variables: variablesForRegex,
        },
      })),
    );
    messages = messages.map((msg, index) => ({ ...msg, content: regexResults[index].text }));
  }
  if (includeActors && party.length) {
    messages.push({ role: 'system', content: galActorListText(input) });
  }
  if (input.socialQuest) messages.push({ role: 'system', content: brief });
  if (intentText) {
    messages.push(...playerIntentMessages(intentText));
  }
  const outputTransport = presetOutputTransport(normalized);
  const baseSampling = presetSampling(normalized);
  const sampling = samplingAdjust ? samplingAdjust(baseSampling) : baseSampling;
  const warnings = [...new Set([...auditPromptPreset('script', normalized), ...scan.warnings])];
  const names = actorNames ?? party.map((entry) => entry.name).filter(Boolean);
  return finalizeRequest(
    {
      messages: [...journeyContinuityMessage(input), ...messages],
      sampling,
      transport: {
        format: 'tagged-json',
        tag: OUTPUT_TAG,
        responseFormat: null,
        ...outputTransport,
        presetProcessing,
        presetVariables: { user: variables.user, char: variables.char },
      },
      ...(countTokens
        ? {
            tokens: requestTokenReport(
              messages,
              countTokens,
              null,
              profile?.maxTokens || 0,
              outputToolRequest(outputTransport.outputTool),
            ),
          }
        : {}),
      worldInfo: {
        report: scan.report,
        warnings: scan.warnings,
        usedTokens: scan.usedTokens,
        budget: scan.budget,
        scanDepth: scan.scanDepth,
      },
      warnings,
      nextWorldState: scan.nextState,
    },
    profile,
    countTokens,
    names,
  );
}
