import { EQUIPMENT_STATS } from '../../equipment.js';
import { TRIGGER_EVENTS, TRIGGER_TARGETS, POSITIVE_BUFFS } from '../../triggers.js';
import { ENEMY_ATTACKS } from '../../combat-art.js';
import { mapInput, mapResponse } from './map-request.js';
import { generationRequest } from './prompts.js';
import { chatInput, chatRequest } from './chat-request.js';
import { chatResponse } from './chat-response.js';
import { summaryRequest, summaryResponse, summaryItems } from './summary-request.js';
import { creationInput, creationResponse, creationItems } from './creation-request.js';
import { presetProcessing, processGeneratedProse } from './preset-processing.js';
import { adviceSettings } from '../advice.js';
import { presetRegexScripts } from '../regex.js';
import { finalizeRequest } from './prompt-processing.js';
import { extractGenerationEnvelope } from './output-envelope.js';
import { generationSourceWarnings } from './generation-source.js';
import {
  readGenerationResult,
  redactDiagnostic,
  generationDiagnostic,
} from './generation-result.js';
import { formatRegexPresentation } from './regex-presentation.js';
import { characterOutputSchema } from '../character-schema.js';
import { scriptOutputSchema } from '../script-schema.js';
import { parseCharacterOutput } from '../contracts.js';
import { characterGenerationPlan } from '../../character-generation.js';

/** Shared prompt, parser and world-state pipeline. Network and storage are supplied by the host. */
export function createAiPipeline({
  settings,
  worlds,
  regexStore,
  helperStorage,
  countTokens,
  readText,
  runRegexTasks,
  readCharacter = parseCharacterOutput,
}) {
  const pendingWorldStates = new Map();
  async function buildRequest(kind, input, source, override) {
    const profile = settings.get(kind);
    if (kind === 'summary') return summaryRequest(input, profile, countTokens, readText);

    const chatting = ['chat', 'quick-chat'].includes(kind);
    const normalized = chatting ? chatInput(kind, input) : input;
    const asset = ['map', 'creation'].includes(kind);
    const assetData = asset ? (kind === 'map' ? mapInput(input) : creationInput(input)) : null;
    const options = {
      ...(asset
        ? {
            assetContext: {
              task: kind,
              request: { brief: input.brief || '构筑归档装备' },
              data: assetData,
              mechanics:
                kind === 'map'
                  ? { enemyAttacks: ENEMY_ATTACKS }
                  : {
                      stats: EQUIPMENT_STATS,
                      events: TRIGGER_EVENTS,
                      targets: TRIGGER_TARGETS,
                      positiveBuffs: POSITIVE_BUFFS,
                    },
            },
          }
        : {}),
      profile,
      readText,
      runRegexTasks,
      worldInfo: await worlds.resolve(
        kind,
        chatting ? { ...input, party: normalized.characters } : input,
        override,
      ),
      regexScripts: [...regexStore.get(), ...presetRegexScripts(source)],
      countTokens,
      maxOutput: profile.tokenField === 'none' ? 0 : profile.maxTokens,
      presetProcessing: presetProcessing(source, helperStorage.get(source.id)),
      advice: kind === 'chat' ? adviceSettings(source, helperStorage.get(source.id)) : null,
    };
    if (chatting) return chatRequest(kind, input, source, options);
    return finalizeRequest(
      await generationRequest(kind, input, source, options),
      profile,
      countTokens,
      (input.party || []).map((entry) => entry.name),
    );
  }
  async function commitWorldState(requestId, kind) {
    const pending = pendingWorldStates.get(requestId);
    if (!pending || pending.kind !== kind) return;
    await worlds.commit(pending.kind, pending.nextState, pending.expectedStep);
    pendingWorldStates.delete(requestId);
  }
  async function acceptResult(job, result) {
    const { input, kind, models, profile, source, prepared, messages, requestId, requestReport } =
      job;
    const chatting = ['chat', 'quick-chat'].includes(kind);
    const summarizing = kind === 'summary';
    const creating = kind === 'creation';
    if (requestReport) requestReport.usage = result.usage;
    if (models) return result;
    else if (kind === 'map' || creating) {
      try {
        const candidate = /<wanxiang_json\b/i.test(result.content)
          ? extractGenerationEnvelope(kind, result.content).candidateText
          : result.content;
        const scripts = [...regexStore.get(), ...presetRegexScripts(source)];
        const processed = (
          await runRegexTasks(scripts, [{ text: candidate, placement: 2, options: { kind } }])
        )[0].text;
        const value =
          kind === 'map'
            ? { world: mapResponse(processed, input) }
            : { items: creationResponse(processed, creationItems(input)) };
        await commitWorldState(requestId, kind);
        return {
          ...value,
          request: { ...requestReport, tokens: prepared.tokens },
          usage: result.usage,
        };
      } catch (failure) {
        failure.diagnostic = generationDiagnostic(
          kind,
          result.content,
          failure.message,
          'asset-response',
        );
        failure.diagnostic.request = requestReport;
        throw failure;
      }
    } else if (summarizing) {
      const summaries = summaryResponse(result.content, summaryItems(input));
      return {
        items: summaries,
        textTokens: {
          source: summaryItems(input).reduce((sum, item) => sum + countTokens(item.text), 0),
          summary: summaries.reduce((sum, item) => sum + countTokens(item.summary), 0),
        },
        request: { tokens: prepared.tokens },
        usage: result.usage,
      };
    } else if (chatting) {
      const scripts = [...regexStore.get(), ...presetRegexScripts(source)];
      let response;
      try {
        response = await chatResponse(
          kind,
          result.content,
          scripts,
          chatInput(kind, input),
          runRegexTasks,
        );
      } catch (failure) {
        failure.diagnostic = generationDiagnostic(
          kind,
          result.rawContent || result.content,
          failure.message,
          'chat-response',
        );
        throw failure;
      }
      await worlds.commit(kind, prepared.nextWorldState, prepared.nextWorldState.step - 1);
      pendingWorldStates.delete(requestId);
      const reply = { ...response, request: requestReport, usage: result.usage };
      if (input.adventure)
        reply.diagnostic = redactDiagnostic(
          {
            ...generationDiagnostic(kind, result.rawContent || result.content, '', 'complete'),
            request: requestReport,
          },
          profile?.apiKey,
        );
      return reply;
    } else {
      const scripts = [...regexStore.get(), ...presetRegexScripts(source)];
      const extracted = extractGenerationEnvelope(kind, result.content);
      let processed;
      try {
        processed = (
          await runRegexTasks(scripts, [
            {
              text: extracted.candidateText,
              placement: 2,
              options: {
                kind,
                variables: {
                  char: (input.party || []).map((entry) => entry.name).join('、'),
                  user: '玩家',
                },
              },
            },
          ])
        )[0];
      } catch (failure) {
        failure.diagnostic = generationDiagnostic(kind, result.content, failure.message, 'regex');
        Object.assign(failure.diagnostic, extracted, {
          candidateText: extracted.candidateText,
        });
        throw failure;
      }
      let validated;
      try {
        validated = readGenerationResult(kind, processed.text, input, readCharacter);
      } catch (failure) {
        if (failure.diagnostic) {
          failure.diagnostic.rawText = result.content;
          failure.diagnostic.envelope = extracted.envelope;
          failure.diagnostic.repairs.unshift(
            ...extracted.repairs,
            ...processed.changes.map((change) => ({
              message: `正则：${change.name}（${change.beforeCharacters}→${change.afterCharacters}字符）`,
            })),
          );
        }
        throw failure;
      }
      validated.diagnostic.warnings = generationSourceWarnings(kind, processed.text, messages);
      validated.diagnostic.rawText = result.content;
      validated.diagnostic.envelope = extracted.envelope;
      validated.diagnostic.repairs.unshift(
        ...extracted.repairs,
        ...processed.changes.map((change) => ({
          message: `正则：${change.name}（${change.beforeCharacters}→${change.afterCharacters}字符）`,
        })),
      );
      try {
        processGeneratedProse(validated.entry, kind, prepared.transport.presetProcessing);
      } catch (failure) {
        failure.diagnostic = generationDiagnostic(
          kind,
          result.rawContent || result.content,
          failure.message,
          'output-preprocessing',
        );
        throw failure;
      }
      await formatRegexPresentation(validated.entry, kind, scripts, runRegexTasks);
      validated.diagnostic.request = { ...requestReport, usage: result.usage };
      await commitWorldState(requestId, kind);
      validated.diagnostic = redactDiagnostic(validated.diagnostic, profile.apiKey);
      return { ...validated, usage: result.usage };
    }
  }
  function completionOptions(job) {
    const { kind, models, prepared, input } = job;
    return {
      sampling: prepared?.sampling,
      models,
      outputEnvelope: !models,
      outputTool: prepared?.transport?.outputTool,
      contextTool: prepared?.transport?.contextTool,
      outputProcessing: ['chat', 'quick-chat'].includes(kind)
        ? prepared?.transport?.presetProcessing
        : null,
      stop: prepared?.transport?.stop,
      responseSchema:
        models || ['chat', 'quick-chat', 'summary', 'creation', 'map'].includes(kind)
          ? null
          : kind === 'character'
            ? characterOutputSchema({ plan: characterGenerationPlan(input) })
            : scriptOutputSchema(input.party.map((item) => item.id)),
    };
  }
  return { buildRequest, commitWorldState, acceptResult, completionOptions, pendingWorldStates };
}
