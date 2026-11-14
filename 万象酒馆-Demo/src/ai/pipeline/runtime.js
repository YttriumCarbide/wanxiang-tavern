import { EQUIPMENT_STATS } from '../../equipment.js';
import { TRIGGER_EVENTS, TRIGGER_TARGETS, POSITIVE_BUFFS } from '../../triggers.js';
import { ENEMY_ATTACKS } from '../../combat-art.js';
import { mapInput, mapResponse } from './map-request.js';
import { normalizeQuestCharacter, normalizeSocialQuest } from '../../tavern-quests.js';
import { generationRequest } from './prompts.js';
import { chatInput, chatRequest } from './chat-request.js';
import { chatResponse } from './chat-response.js';
import { summaryRequest, summaryResponse, summaryItems } from './summary-request.js';
import { creationInput, creationResponse, creationItems } from './creation-request.js';
import { presetProcessing, processGeneratedProse } from './preset-processing.js';
import { MEOWSSIAH_COMPATIBILITY, meowssiahGamePreset } from '../miaosaiya-processing.js';
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
import {
  buildInvitationRequest,
  buildInvitationTopicsRequest,
  invitationRequest,
  invitationResponse,
  invitationTopicsRequest,
  invitationTopicsResponse,
} from './invitation-request.js';
import {
  buildOverlandRequest,
  overlandRequest,
  overlandResponse,
  overlandItemsResponse,
} from './overland-request.js';
import { requestMemoryBooks, scanScenarioWorldbooks } from '../journey-memory-worldbook.js';
import { buildSubScriptRequest } from './script-preset.js';
import { journeyContinuityMessage } from '../../memory.js';

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
  async function resolveWorldbooks(kind, input, override) {
    const worldInfo = await worlds.resolve(kind, input, override);
    for (const book of requestMemoryBooks(input)) {
      if (Object.keys(book.entries).length) worldInfo.books.push(book);
    }
    return worldInfo;
  }
  async function buildRequest(kind, input, source, override) {
    const antiRoute = settings.routeSettings?.();
    const profile = { ...settings.get(kind), ...(antiRoute ? { antiRoute, routeKind: kind } : {}) };
    const storage = helperStorage.get(source.id);
    const processing = presetProcessing(source, storage);
    const preset =
      processing.compatibility === MEOWSSIAH_COMPATIBILITY ? meowssiahGamePreset(source) : source;
    if (kind === 'script' && input.socialQuest) {
      const worldInfo = await resolveWorldbooks(kind, input, override);
      const built = await buildSubScriptRequest({
        input,
        preset,
        profile,
        worldInfo,
        countTokens,
        regexScripts: [...regexStore.get(), ...presetRegexScripts(preset)],
        runRegexTasks,
        presetProcessing: processing,
        taskLabel: '社交任务',
        brief: input.brief,
        userPayload: input.socialQuest,
      });
      if (built) return built;
      return finalizeRequest(
        {
          messages: [
            ...journeyContinuityMessage(input),
            ...scanScenarioWorldbooks(input, countTokens, worldInfo),
            { role: 'system', content: input.brief },
            { role: 'user', content: JSON.stringify(input.socialQuest) },
          ],
          transport: { format: 'tagged-json', tag: 'wanxiang_output' },
        },
        profile,
        countTokens,
      );
    }
    if (kind === 'script' && (input.invitationTopics || input.invitation || input.overland)) {
      const worldInfo = await resolveWorldbooks(kind, input, override);
      const subOptions = {
        worldInfo,
        regexScripts: [...regexStore.get(), ...presetRegexScripts(preset)],
        runRegexTasks,
        presetProcessing: processing,
      };
      if (input.invitationTopics) {
        return (
          (await buildInvitationTopicsRequest(input, preset, profile, countTokens, subOptions)) ||
          invitationTopicsRequest(input, profile, countTokens)
        );
      }
      if (input.invitation) {
        return (
          (await buildInvitationRequest(input, preset, profile, countTokens, subOptions)) ||
          invitationRequest(input, source, profile, countTokens, worldInfo)
        );
      }
      return (
        (await buildOverlandRequest(input, preset, profile, countTokens, subOptions)) ||
        overlandRequest(input, profile, countTokens, worldInfo)
      );
    }
    if (kind === 'summary') {
      const worldInfo = await worlds.resolve('summary', input, override);
      return summaryRequest(input, preset, {
        profile,
        readText,
        runRegexTasks,
        worldInfo,
        regexScripts: [...regexStore.get(), ...presetRegexScripts(preset)],
        countTokens,
        maxOutput: profile.tokenField === 'none' ? 0 : profile.maxTokens,
        presetProcessing: processing,
      });
    }
    const chatting = ['chat', 'quick-chat'].includes(kind);
    const normalized = chatting ? chatInput(kind, input) : input;
    const asset = ['map', 'creation'].includes(kind);
    const assetData = asset ? (kind === 'map' ? mapInput(input) : creationInput(input)) : null;
    const worldInfo = await resolveWorldbooks(
      kind,
      chatting ? { ...input, party: normalized.characters } : input,
      override,
    );
    const options = {
      ...(asset
        ? {
            assetContext: {
              task: kind,
              request: {
                brief: input.brief || (kind === 'map' ? '构筑多元世界' : '构筑归档装备'),
              },
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
      worldInfo,
      regexScripts: [...regexStore.get(), ...presetRegexScripts(preset)],
      countTokens,
      maxOutput: profile.tokenField === 'none' ? 0 : profile.maxTokens,
      presetProcessing: processing,
      advice: kind === 'chat' ? adviceSettings(preset, storage) : null,
    };
    if (chatting) return chatRequest(kind, input, preset, options);
    return finalizeRequest(
      await generationRequest(kind, input, preset, options),
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
    const responseScripts = () => [
      ...regexStore.get(),
      ...(prepared?.transport?.presetProcessing?.compatibility === MEOWSSIAH_COMPATIBILITY
        ? []
        : presetRegexScripts(source)),
    ];
    if (requestReport) requestReport.usage = result.usage;
    if (models) return result;
    if (kind === 'script' && input.socialQuest) {
      const raw = JSON.parse(extractGenerationEnvelope(kind, result.content).candidateText);
      const quest = normalizeSocialQuest(raw, input.socialQuest.scenes, input.socialQuest.archives);
      await commitWorldState(requestId, kind);
      return {
        quest,
        request: requestReport,
      };
    }
    if (kind === 'script' && input.invitationTopics)
      return {
        topics: invitationTopicsResponse(result.content),
        request: requestReport,
        usage: result.usage,
      };
    if (kind === 'script' && input.overland)
      return {
        acts: overlandResponse(result.content, input),
        items: overlandItemsResponse(result.content, input),
        request: requestReport,
        usage: result.usage,
      };
    if (kind === 'script' && input.invitation) {
      const raw = result.rawContent || result.content;
      try {
        const invitation = invitationResponse(result.content);
        return {
          invitation,
          diagnostic: redactDiagnostic(
            generationDiagnostic(kind, raw, '', 'complete'),
            profile?.apiKey,
          ),
          request: requestReport,
          usage: result.usage,
        };
      } catch (failure) {
        failure.diagnostic ||= generationDiagnostic(
          kind,
          raw,
          failure.message,
          'invitation-response',
        );
        failure.diagnostic.request = requestReport;
        failure.diagnostic = redactDiagnostic(failure.diagnostic, profile?.apiKey);
        throw failure;
      }
    } else if (kind === 'map' || creating) {
      try {
        const candidate = /<(?:wanxiang_output|wanxiang_json)\b/i.test(result.content)
          ? extractGenerationEnvelope(kind, result.content).candidateText
          : result.content;
        const scripts = responseScripts();
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
      await commitWorldState(requestId, kind);
      return {
        items: summaries,
        textTokens: {
          source: summaryItems(input).reduce((sum, item) => sum + countTokens(item.text), 0),
          summary: summaries.reduce((sum, item) => sum + countTokens(item.summary), 0),
        },
        request: { ...requestReport, tokens: prepared.tokens },
        usage: result.usage,
      };
    } else if (chatting) {
      const scripts = responseScripts();
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
      if (input.adventure || input.invitation)
        reply.diagnostic = redactDiagnostic(
          {
            ...generationDiagnostic(kind, result.rawContent || result.content, '', 'complete'),
            request: requestReport,
          },
          profile?.apiKey,
        );
      return reply;
    } else {
      const scripts = responseScripts();
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
      let questCharacter;
      try {
        if (kind === 'character' && input.questCharacter) {
          const raw = JSON.parse(processed.text);
          questCharacter = normalizeQuestCharacter(raw.quest, input.questCharacter.scenes);
          delete raw.quest;
          delete raw.arrivalDialogue;
          processed.text = JSON.stringify(raw);
        }
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
      return { ...validated, ...(questCharacter ? { questCharacter } : {}), usage: result.usage };
    }
  }
  function completionOptions(job) {
    const { kind, models, prepared, input } = job;
    return {
      antiRoute: settings?.routeSettings?.(),
      routeKind: kind,
      routeEntropy: prepared?.transport?.routeEntropy,
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
        models ||
        input?.invitation ||
        input?.invitationTopics ||
        input?.overland ||
        input?.socialQuest ||
        input?.questCharacter ||
        ['chat', 'quick-chat', 'summary', 'creation', 'map'].includes(kind)
          ? null
          : kind === 'character'
            ? characterOutputSchema({ plan: characterGenerationPlan(input) })
            : scriptOutputSchema(input.party.map((item) => item.id)),
    };
  }
  return { buildRequest, commitWorldState, acceptResult, completionOptions, pendingWorldStates };
}
