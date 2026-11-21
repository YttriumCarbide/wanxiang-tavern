import { EQUIPMENT_STATS } from '../../equipment.js';
import { TRIGGER_EVENTS, TRIGGER_TARGETS, POSITIVE_BUFFS } from '../../triggers.js';
import { ENEMY_ATTACKS } from '../../combat-art.js';
import { mapInput, mapResponse } from './map-request.js';
import { normalizeQuestCharacter, normalizeSocialQuest } from '../../tavern-quests.js';
import { generationRequest } from './prompts.js';
import { chatInput, chatRequest } from './chat-request.js';
import { chatResponse } from './chat-response.js';
import { summaryPlan, summaryRequest, summaryResponse, summaryItems } from './summary-request.js';
import { creationInput, creationResponse, creationItems } from './creation-request.js';
import { presetProcessing, processGeneratedProse } from './preset-processing.js';
import { MEOWSSIAH_COMPATIBILITY, meowssiahGamePreset } from '../miaosaiya-processing.js';
import { adviceSettings } from '../advice.js';
import { BUILTIN_PROMPT_ID } from '../builtin-prompt.js';
import { normalizeUsage } from '../usage.js';
import { finalizeRequest } from './prompt-processing.js';
import { extractGenerationEnvelope } from './output-envelope.js';
import { generationSourceWarnings } from './generation-source.js';
import {
  readGenerationResult,
  redactDiagnostic,
  generationDiagnostic,
} from './generation-result.js';
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
  overlandTheaterResponse,
} from './overland-request.js';
import { requestMemoryBooks, scanScenarioWorldbooks } from '../journey-memory-worldbook.js';
import { buildSubScriptRequest } from './script-preset.js';
import { journeyContinuityMessage } from '../../memory.js';

function selectScriptMode(kind, input) {
  if (kind !== 'script') return null;
  const modes = ['socialQuest', 'invitationTopics', 'invitation', 'overland'].filter(
    (mode) => input?.[mode],
  );
  if (modes.length > 1) {
    throw Object.assign(Error('剧本请求只能指定一种子模式'), {
      code: 'AI_SCRIPT_MODE_CONFLICT',
      status: 400,
    });
  }
  return modes[0] ?? null;
}

/** Shared prompt, parser and world-state pipeline. Network and storage are supplied by the host. */
export function createAiPipeline({
  settings,
  worlds,
  helperStorage,
  countTokens,
  readText,
  promptSource,
  readCharacter = parseCharacterOutput,
}) {
  const pendingWorldStates = new Map();
  const worldStateCommits = new Map();
  async function resolveWorldbooks(kind, input, override) {
    const worldInfo = await worlds.resolve(kind, input, override);
    for (const book of requestMemoryBooks(input)) {
      if (Object.keys(book.entries).length) worldInfo.books.push(book);
    }
    return worldInfo;
  }
  function requestProfile(kind) {
    const antiRoute = settings.routeSettings?.();
    return { ...settings.get(kind), ...(antiRoute ? { antiRoute } : {}), routeKind: kind };
  }
  function requestPreset(source) {
    const storage =
      source.id && source.id !== BUILTIN_PROMPT_ID ? helperStorage.get(source.id) : {};
    const processing = presetProcessing(source, storage);
    const preset =
      processing.compatibility === MEOWSSIAH_COMPATIBILITY ? meowssiahGamePreset(source) : source;
    return { preset, storage, processing };
  }
  function summaryOptions(profile, processing, override) {
    return {
      profile,
      readText,
      countTokens,
      presetProcessing: processing,
      resolveWorldInfo: (input) => worlds.resolve('summary', input, override),
    };
  }
  async function planSummary(input = {}) {
    if (!promptSource) throw Error('总结规划缺少提示词来源');
    const profile = requestProfile('summary');
    const { preset, processing } = requestPreset(await promptSource.get('summary'));
    return summaryPlan(input, preset, summaryOptions(profile, processing));
  }
  async function buildRequest(kind, input, source, override) {
    const scriptMode = selectScriptMode(kind, input);
    const profile = requestProfile(kind);
    const { preset, storage, processing } = requestPreset(source);
    if (scriptMode === 'socialQuest') {
      const worldInfo = await resolveWorldbooks(kind, input, override);
      const built = await buildSubScriptRequest({
        input,
        preset,
        profile,
        worldInfo,
        countTokens,
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
    if (scriptMode) {
      const worldInfo = await resolveWorldbooks(kind, input, override);
      const subOptions = {
        worldInfo,
        presetProcessing: processing,
      };
      if (scriptMode === 'invitationTopics') {
        return (
          (await buildInvitationTopicsRequest(input, preset, profile, countTokens, subOptions)) ||
          invitationTopicsRequest(input, profile, countTokens)
        );
      }
      if (scriptMode === 'invitation') {
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
      return summaryRequest(input, preset, summaryOptions(profile, processing, override));
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
      worldInfo,
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
  async function commitPendingWorldState(requestId, kind, signal, pending) {
    signal?.throwIfAborted();
    if (!pending || pending.kind !== kind || pendingWorldStates.get(requestId) !== pending) return;
    const active = worldStateCommits.get(requestId);
    if (active?.pending === pending) return active.promise;

    const promise = Promise.resolve().then(async () => {
      signal?.throwIfAborted();
      if (pendingWorldStates.get(requestId) !== pending) return;
      const committed = await worlds.commit(kind, pending.nextState, pending.expectedStep, signal);
      if (committed === false) {
        if (pendingWorldStates.get(requestId) === pending) pendingWorldStates.delete(requestId);
        throw Object.assign(Error('世界书状态已变更，请基于当前状态重新规划后再试'), {
          code: 'AI_STATE_CONFLICT',
          status: 409,
        });
      }
      if (pendingWorldStates.get(requestId) === pending) pendingWorldStates.delete(requestId);
    });
    const operation = { pending, promise };
    worldStateCommits.set(requestId, operation);
    try {
      await promise;
    } finally {
      if (worldStateCommits.get(requestId) === operation) worldStateCommits.delete(requestId);
    }
  }
  async function commitWorldState(requestId, kind, signal) {
    await commitPendingWorldState(requestId, kind, signal, pendingWorldStates.get(requestId));
  }
  async function acceptResult(job, result, signal) {
    signal?.throwIfAborted();
    result = { ...result, usage: normalizeUsage(result.usage) };
    const { input, kind, models, profile, prepared, messages, requestId, requestReport } = job;
    const chatting = ['chat', 'quick-chat'].includes(kind);
    const summarizing = kind === 'summary';
    const creating = kind === 'creation';
    if (requestReport) requestReport.usage = result.usage;
    if (models) return result;
    const scriptMode = selectScriptMode(kind, input);
    const pending = pendingWorldStates.get(requestId);
    const commit = () => commitPendingWorldState(requestId, kind, signal, pending);
    if (scriptMode === 'socialQuest') {
      const raw = JSON.parse(extractGenerationEnvelope(kind, result.content).candidateText);
      const quest = normalizeSocialQuest(raw, input.socialQuest.scenes, input.socialQuest.archives);
      await commit();
      return { quest, request: requestReport, usage: result.usage };
    }
    if (scriptMode === 'invitationTopics') {
      const topics = invitationTopicsResponse(result.content);
      await commit();
      return { topics, request: requestReport, usage: result.usage };
    }
    if (scriptMode === 'overland') {
      const reply = {
        acts: overlandResponse(result.content, input),
        items: overlandItemsResponse(result.content, input),
        ...overlandTheaterResponse(result.content),
        request: requestReport,
        usage: result.usage,
      };
      await commit();
      return reply;
    }
    if (scriptMode === 'invitation') {
      const raw = result.rawContent || result.content;
      let invitation;
      try {
        invitation = invitationResponse(result.content);
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
      const reply = {
        invitation,
        diagnostic: redactDiagnostic(
          generationDiagnostic(kind, raw, '', 'complete'),
          profile?.apiKey,
        ),
        request: requestReport,
        usage: result.usage,
      };
      await commit();
      return reply;
    }
    if (kind === 'map' || creating) {
      let value;
      try {
        // Map and creation deliberately accept legacy bare JSON as well as tagged JSON.
        const candidate = /<(?:wanxiang_output|wanxiang_json)\b/i.test(result.content)
          ? extractGenerationEnvelope(kind, result.content).candidateText
          : result.content;
        value =
          kind === 'map'
            ? { world: mapResponse(candidate, input) }
            : { items: creationResponse(candidate, creationItems(input)) };
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
      const reply = {
        ...value,
        request: { ...requestReport, tokens: prepared.tokens },
        usage: result.usage,
      };
      await commit();
      return reply;
    } else if (summarizing) {
      const items = summaryItems(input);
      const summaries = summaryResponse(result.content, items);
      const reply = {
        items: summaries,
        textTokens: {
          source: items.reduce((sum, item) => sum + countTokens(item.text), 0),
          summary: summaries.reduce((sum, item) => sum + countTokens(item.summary), 0),
        },
        request: { ...requestReport, tokens: prepared.tokens },
        usage: result.usage,
      };
      await commit();
      return reply;
    } else if (chatting) {
      let response;
      try {
        response = await chatResponse(kind, result.content, chatInput(kind, input));
      } catch (failure) {
        failure.diagnostic = generationDiagnostic(
          kind,
          result.rawContent || result.content,
          failure.message,
          'chat-response',
        );
        throw failure;
      }
      const reply = { ...response, request: requestReport, usage: result.usage };
      if (input.adventure || input.invitation)
        reply.diagnostic = redactDiagnostic(
          {
            ...generationDiagnostic(kind, result.rawContent || result.content, '', 'complete'),
            request: requestReport,
          },
          profile?.apiKey,
        );
      await commit();
      return reply;
    } else {
      const extracted = extractGenerationEnvelope(kind, result.content);
      let candidate = extracted.candidateText;
      let validated;
      let questCharacter;
      try {
        if (kind === 'character' && input.questCharacter) {
          const raw = JSON.parse(candidate);
          questCharacter = normalizeQuestCharacter(raw.quest, input.questCharacter.scenes);
          delete raw.quest;
          delete raw.arrivalDialogue;
          candidate = JSON.stringify(raw);
        }
        validated = readGenerationResult(kind, candidate, input, readCharacter);
      } catch (failure) {
        if (failure.diagnostic) {
          failure.diagnostic.rawText = result.content;
          failure.diagnostic.envelope = extracted.envelope;
          failure.diagnostic.repairs.unshift(...extracted.repairs);
        }
        throw failure;
      }
      validated.diagnostic.warnings = generationSourceWarnings(kind, candidate, messages);
      validated.diagnostic.rawText = result.content;
      validated.diagnostic.envelope = extracted.envelope;
      validated.diagnostic.repairs.unshift(...extracted.repairs);
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
      validated.diagnostic.request = { ...requestReport, usage: result.usage };
      validated.diagnostic = redactDiagnostic(validated.diagnostic, profile.apiKey);
      await commit();
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
        selectScriptMode(kind, input) ||
        input?.questCharacter ||
        ['chat', 'quick-chat', 'summary', 'creation', 'map'].includes(kind)
          ? null
          : kind === 'character'
            ? characterOutputSchema({ plan: characterGenerationPlan(input) })
            : scriptOutputSchema(input.party.map((item) => item.id)),
    };
  }
  return {
    buildRequest,
    planSummary,
    commitWorldState,
    acceptResult,
    completionOptions,
    pendingWorldStates,
  };
}
