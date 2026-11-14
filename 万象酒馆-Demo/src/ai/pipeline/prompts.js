import { isEndless } from '../../worlds.js';
import { arcFor } from '../../story-arc.js';
import { generationNumbers } from '../../growth.js';
import { characterConstraintText } from '../../character-generation.js';
import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from '../../content/journey-rules.js';
import { OUTPUT_TAG } from './output-envelope.js';
import { encounterSpec, DEFINITIONS } from '../../data.js';
import { normalizePromptPreset, composePromptPreset, presetSampling } from '../presets.js';
import { scriptOutputSchema } from '../script-schema.js';
import { characterOutputSchema } from '../character-schema.js';
import { TAVERN_WORLD, EXPEDITION_PLACES } from '../../content/world.js';
import { officialDungeonFor } from '../../content/official-dungeons.js';
import { rpChapterDirection } from '../../content/rp-outlines.js';
import { characterGameReference } from './game-reference.js';
import { scanWorldbooks, injectWorldbookMessages } from '../worldbook-scan.js';
import { requestTokenReport } from './request-tokens.js';
import { auditPromptPreset } from './prompt-audit.js';
import { encounterEnemies, enemiesForSpec } from './encounter-reference.js';
import { explorationSpec } from '../../exploration.js';
import { REGIONS } from '../../content/regions.js';
import { presetOutputTransport, outputToolRequest } from '../preset-output.js';
import { requireNpcInteraction } from '../../npc-interaction.js';
import { galInstruction, galActorListText } from '../gal-prompt.js';
import { currentEncounterSpec } from '../../expedition.js';
import { ADVENTURE_NODE_TYPES } from '../../adventure/definition.js';
import { storyRingReward } from '../../emblem-progression.js';
import { INVITATION_CONTEXT_LIMIT, journeyContinuityMessage } from '../../memory.js';
import { buildTriggerIds } from '../worldbook-triggers.js';

import { playerIntentMessages, playerIntentText } from './player-intent.js';

export function generationInput(kind, input) {
  if (!['character', 'script'].includes(kind)) throw Error('接口类型无效');
  if (typeof input.brief !== 'string' || input.brief.length < 1 || input.brief.length > 10000)
    throw Error('请填写1～10000字的生成要求');
  if (kind === 'character') {
    const plan = generationNumbers(input);
    return {
      task: 'character',
      world: TAVERN_WORLD,
      design: {
        documentType: '角色设定集，不是小说、剧情片段或宣传文案',
        settingTextTokens: [1000, 1500],
        historyCharacters: '150～260字，目标约200字',
        order:
          '先完成setting人物设计，再用data选择程序允许的机制和强度档位；具体数值由代码编译，一次响应完成',
        categories: [
          '姓名',
          '性别',
          '年龄',
          '外貌',
          '性格（包括说话方式、具体动机和可观察的个人习惯）',
          '经历',
          '攻击方式',
          '主动技能动作描写与被动实际效果',
        ],
      },
      mechanics: { ...characterGameReference(plan), generationNumbers: plan },
      request: {
        purpose: input.purpose || 'standard',
        brief: input.brief,
        ...(input.purpose === 'npc' ? { knownNpc: input.npc } : {}),
        ...(input.purpose === 'protagonist' ? { role: '玩家主角' } : {}),
        ...(input.questCharacter ? { questCharacter: input.questCharacter } : {}),
        existingCharacters: (input.existing || []).slice(0, 12).map((item) => ({
          name: String(item.name || '').slice(0, 30),
          title: String(item.title || '').slice(0, 30),
        })),
      },
    };
  }
  if (!isEndless(input.exploration) && !DEFINITIONS[input.boss]?.boss) throw Error('副本路线无效');
  if (
    !Array.isArray(input.party) ||
    input.party.length < 1 ||
    input.party.length > 6 ||
    new Set(input.party.map((item) => item.id)).size !== input.party.length
  )
    throw Error('剧本需要1～6名不同的入队角色设定');
  const party = input.party.map((item) => ({
    id: String(item.id).slice(0, 80),
    name: String(item.name || '').slice(0, 30),
    title: String(item.title || '').slice(0, 30),
    worldbook: String(item.worldbook || '').slice(0, 24000),
    ...(typeof item.invitationMemory === 'string' && item.invitationMemory
      ? { invitationMemory: item.invitationMemory.slice(0, INVITATION_CONTEXT_LIMIT) }
      : {}),
    ...(Array.isArray(item.tags)
      ? { tags: item.tags.slice(0, 30).map((tag) => String(tag).slice(0, 60)) }
      : {}),
  }));
  const selected = input.exploration ? explorationSpec(input.exploration) : null;
  const officialDungeon = officialDungeonFor(input.exploration);
  const player = party.find((entry) => entry.id === input.protagonistId);
  return {
    task: 'script',
    world: TAVERN_WORLD,
    request: {
      brief: input.brief,
      storyRingReward: storyRingReward(
        input.exploration,
        Array.isArray(input.ownedEmblems) ? input.ownedEmblems : [],
      ),
      ...(input.adventureVersion === 1
        ? { rpChapterDirection: rpChapterDirection(input.exploration) }
        : {}),
      storyArc: arcFor(input),
      ...(requireNpcInteraction(input) ? { npcInteraction: { required: true } } : {}),
      ...(isEndless(input.exploration)
        ? {
            dynamicWorld: {
              background:
                input.exploration.world?.background || REGIONS[input.exploration.map].atmosphere,
              landmarks: input.exploration.world?.landmarks || [],
              goals: input.exploration.world?.goals || [],
              enemies:
                input.enemyPool ||
                (
                  input.exploration.world?.enemyIds || [
                    ...REGIONS[input.exploration.map].enemies,
                    REGIONS[input.exploration.map].boss,
                  ]
                ).map((id) => input.exploration.world?.enemyDefinitions[id] || DEFINITIONS[id]),
            },
          }
        : {}),
      ...(officialDungeon
        ? {
            officialDungeon: {
              id: officialDungeon.id,
              worldbookKey: officialDungeon.key,
              ...(officialDungeon.npcs ? { npcs: officialDungeon.npcs } : {}),
            },
          }
        : {}),
      chapter: input.chapter || 1,
      ...(typeof input.visitId === 'string' ? { visitId: input.visitId.slice(0, 80) } : {}),
      location: selected?.name || REGIONS[input.map || 'ruins']?.name || '副本',
      previousStories: (Array.isArray(input.previousStories) ? input.previousStories : [])
        .slice(-3)
        .map((book) => ({
          title: String(book.title || '').slice(0, 60),
          tags: Array.isArray(book.tags)
            ? book.tags.slice(0, 12).map((tag) => String(tag).slice(0, 40))
            : [],
        })),
      acts: [
        { index: 0, type: 'battle', stage: 'normal' },
        { index: 1, type: 'choice' },
        { index: 2, type: 'battle', stage: 'elite' },
        { index: 3, type: 'quest' },
        {
          index: 4,
          type: 'battle',
          stage: isEndless(input.exploration) ? 'endless-final' : 'boss',
        },
      ],
      narrativeParts: [
        '节点1：普通战斗前Gal正文',
        '节点2：选择事件开场Gal正文，选项填data.adventure.event',
        '节点3：精英战斗前Gal正文',
        '节点4：自由任务开场Gal正文，任务与观察填data.adventure.quest',
        isEndless(input.exploration)
          ? '旅程第五段，继续推进人物与目标，不预写胜负'
          : '节点5：最终Boss战前Gal正文，从commonState承接，不预写胜负',
      ],
      ...(selected
        ? {
            region: {
              id: selected.map,
              name: REGIONS[selected.map].name,
              atmosphere: REGIONS[selected.map].atmosphere,
            },
            continuation:
              typeof input.exploration.continuation === 'string'
                ? input.exploration.continuation.slice(0, 2000)
                : null,
          }
        : {}),
    },
    characters: {
      player: player ? { id: player.id, name: player.name } : null,
      greenLight: party,
    },
    history: {
      keywordArchives: input.archiveContext || { npcs: [], stories: [] },
      tavernPrelude: (Array.isArray(input.tavernPrelude) ? input.tavernPrelude : [])
        .filter(
          (line) => ['user', 'assistant'].includes(line?.role) && typeof line.content === 'string',
        )
        .map(({ role, content, speakerName }) => ({ role, content, speakerName })),
      confirmed: Array.isArray(input.history) ? input.history.slice(-3) : [],
    },
    encounters: isEndless(input.exploration)
      ? Array.from({ length: ENCOUNTER_COUNT }, (_, index) => ({
          index,
          bossRequired: index === FINAL_ENCOUNTER,
        }))
      : selected
        ? Array.from({ length: ENCOUNTER_COUNT }, (_, index) => {
            const spec = currentEncounterSpec(
              {
                exploration: input.exploration,
                adventure: input.adventureVersion === 1 ? {} : null,
              },
              index,
            );
            const rp = input.adventureVersion === 1 && [1, 3].includes(index);
            return {
              index,
              map: spec.map,
              environment: REGIONS[spec.map].atmosphere,
              enemies: rp ? [] : enemiesForSpec(spec),
              encounterReason: spec.description,
              enemyCount: rp ? 0 : spec.enemyIds.length,
              ...(input.adventureVersion === 1 ? { nodeType: ADVENTURE_NODE_TYPES[index] } : {}),
              boss: !!spec.boss,
            };
          })
        : Array.from({ length: ENCOUNTER_COUNT }, (_, index) => {
            const spec = encounterSpec(index, input.boss);
            return {
              index,
              map: spec.map,
              environment: EXPEDITION_PLACES[index],
              enemies: encounterEnemies(index, input.boss),
              enemyCount: spec.enemyIds.length,
              boss: !!spec.boss,
            };
          }),
  };
}

export async function generationRequest(kind, input, source, options = {}) {
  const { readText, runRegexTasks } = options;
  const regexScripts = options.regexScripts || [];
  const variablesForRegex = {
    char: (input.party || []).map((entry) => entry.name).join('、') || '待生成角色',
    user: (input.party || []).find((entry) => entry.id === input.protagonistId)?.name || '玩家',
  };
  const inputPass = await runRegexTasks(regexScripts, [
    { text: input.brief || '', placement: 1, options: { kind, variables: variablesForRegex } },
    {
      text: playerIntentText(input.playerIntent),
      placement: 1,
      options: { kind, variables: variablesForRegex },
    },
  ]);
  input = { ...input, brief: inputPass[0].text };
  const context = options.assetContext || generationInput(kind, input);
  if (options.worldInfo) context.world = '本次已激活的世界书条目';
  const schema = options.assetContext
    ? { type: 'object', description: '完整结构见当前API世界书格式条目，数据参考见本次输入' }
    : kind === 'character'
      ? characterOutputSchema({ plan: context.mechanics.generationNumbers })
      : scriptOutputSchema(context.characters.greenLight.map((entry) => entry.id));
  const raw = source || JSON.parse(await readText(`framework/${kind}-default.json`));
  const { preset } = normalizePromptPreset(raw, raw.id);
  const outputTransport = presetOutputTransport(preset);
  const inputText = JSON.stringify(context, null, 2);
  const characters = (context.characters?.greenLight || [])
    .map((entry) => `${entry.name}（${entry.id}）\n${entry.worldbook}`)
    .join('\n\n');
  const history = JSON.stringify(context.history?.confirmed || [], null, 2);
  const scenario = [
    JSON.stringify(context.encounters || [], null, 2),
    context.request?.officialDungeon?.worldbookKey || '',
    context.request?.location || '',
  ]
    .filter(Boolean)
    .join('\n');
  const triggerIds = buildTriggerIds(kind, {
    ...input,
    ...(kind === 'character' ? { purpose: context.request?.purpose || input.purpose } : {}),
    ...(context.data?.existing ? { existing: context.data.existing } : {}),
    ...(context.data?.continuation ? { continuation: context.data.continuation } : {}),
    officialDungeon: context.request?.officialDungeon,
    npcInteraction: context.request?.npcInteraction,
    storyRingReward: context.request?.storyRingReward,
    storyArc: context.request?.storyArc,
    dynamicWorld: context.request?.dynamicWorld,
    playerIntent: inputPass[1].text,
  });
  const scan = options.worldInfo
    ? scanWorldbooks({
        ...options.worldInfo,
        countTokens: options.countTokens,
        context: {
          kind,
          triggerIds,
          outputSchema: JSON.stringify(schema),
          characterLimits:
            kind === 'character'
              ? characterConstraintText(context.mechanics.generationNumbers)
              : '',
          trigger: 'normal',
          messages: [
            ...(input.history || []).flatMap((record) =>
              (record.confirmedEvents || []).map((line) => ({
                name: line.speaker,
                content: line.text || '',
              })),
            ),
            { role: 'user', content: input.brief },
            ...playerIntentMessages(inputPass[1].text),
          ],
          names: (input.party || []).map((entry) => entry.name),
          characterIds: (input.party || []).map((entry) => entry.id),
          characters,
          personalities: characters,
          scenario,
          persona: '玩家的行为与意愿由玩家决定。',
          tags: [
            ...new Set(
              (input.party || []).flatMap((entry) => (Array.isArray(entry.tags) ? entry.tags : [])),
            ),
          ],
          ...(options.worldInfo.settings.persona
            ? { persona: options.worldInfo.settings.persona }
            : {}),
          characterNotes: options.worldInfo.settings.characterNotes || '',
          creatorNotes: options.worldInfo.settings.creatorNotes || '',
        },
      })
    : null;
  if (scan && regexScripts.length) {
    const processed = await runRegexTasks(
      regexScripts,
      scan.entries.map((entry) => ({
        text: entry.content,
        placement: 5,
        options: { kind, isPrompt: true, variables: variablesForRegex },
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
    brief: context.request.brief,
    task: { character: '角色生成', script: '剧本生成', map: '地图构筑', creation: '以太造物' }[
      kind
    ],
    char:
      kind === 'character'
        ? '待生成角色'
        : (context.characters?.greenLight || []).map((entry) => entry.name).join('、'),
    user: context.characters?.player?.name || '玩家',
    description: characters,
    personality: characters,
    characters,
    worldbook:
      scan?.entries
        .filter((entry) => !entry.extensions?.wanxiang?.generationRule?.endsWith('-output'))
        .map((entry) => entry.content)
        .join('\n\n') || '',
    outputschema: JSON.stringify(schema),
    enemyattacks: options.assetContext?.mechanics?.enemyAttacks?.join(',') || '',
    scenario,
    persona: options.worldInfo?.settings.persona || '玩家的行为与意愿由玩家决定。',
    history,
    wibefore: wiBefore,
    wiafter: wiAfter,
    mesexamples: '',
    original: '',
    charpersonality: characters,
    charscenario: scenario,
    chardescription: characters,
    personadescription: options.worldInfo?.settings.persona || '',
    lastmessage: context.request.brief,
    lastusermessage: context.request.brief,
    lastchatmessage: context.request.brief,
    lastcharmessage: (input.history || []).at(-1)?.confirmedEvents?.at(-1)?.text || '',
    firstmessage: (input.history || [])[0]?.confirmedEvents?.[0]?.text || '',
    instruct: '',
    system: '',
    scriptstyle: kind === 'script' ? await readText('script-style.md') : '',
  };
  for (const entry of scan?.entries.filter((item) => item.position === 7) || []) {
    const key = `outlet::${entry.outletName.toLowerCase()}`;
    variables[key] = (variables[key] ? variables[key] + '\n\n' : '') + entry.content;
  }
  const message = (content, role = 'user') => (content ? [{ role, content }] : []);
  const markers = {
    taskContext: message(inputText),
    chatHistory: message(inputText),
    worldInfoBefore: [],
    worldInfoAfter: [],
    charDescription: message(characters, 'system'),
    charPersonality: [],
    scenario: message(scenario, 'system'),
    personadescription: message(variables.persona),
    dialogueExamples: [],
  };
  let messages = composePromptPreset(preset, variables, markers);
  if (scan) {
    // Marker/macros own their anchors when present; otherwise inject once at a fallback anchor.
    const enabled = preset.prompt_order[0].order
      .filter((item) => item.enabled)
      .map((item) => preset.prompts.find((entry) => entry.identifier === item.identifier));
    const hasMacro = (macro) =>
      enabled.some((entry) => new RegExp(`{{\\s*${macro}\\s*}}`, 'i').test(entry.content));
    const markerEntries = enabled.filter((entry) => entry.marker).map((entry) => entry.identifier);
    const ownedBefore = markerEntries.includes('worldInfoBefore') || hasMacro('wiBefore');
    const ownedAfter = markerEntries.includes('worldInfoAfter') || hasMacro('wiAfter');
    if (markerEntries.includes('worldInfoBefore'))
      markers.worldInfoBefore = message(wiBefore, 'system');
    if (markerEntries.includes('worldInfoAfter'))
      markers.worldInfoAfter = message(wiAfter, 'system');
    messages = composePromptPreset(preset, variables, markers);
    const entries = hasMacro('worldbook')
      ? scan.entries.filter(
          (entry) =>
            entry.position === 7 || entry.extensions?.wanxiang?.generationRule?.endsWith('-output'),
        )
      : scan.entries.filter(
          (entry) =>
            !(entry.position === 0 && ownedBefore) && !(entry.position === 1 && ownedAfter),
        );
    messages = injectWorldbookMessages(
      messages,
      entries,
      options.worldInfo.settings.authorNote || '',
      { characterText: characters },
    );
    for (const entry of scan.entries.filter((item) => item.position === 7))
      if (!hasMacro(`outlet::${entry.outletName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
        scan.warnings.push(
          `Outlet ${entry.outletName}已激活，但预设没有引用{{outlet::${entry.outletName}}}，因此未发送。`,
        );
  }
  const regexResults = await runRegexTasks(
    regexScripts,
    messages.map((message, index) => ({
      text: message.content,
      placement: message.role === 'assistant' ? 2 : message.role === 'user' ? 1 : -1,
      options: {
        kind,
        isPrompt: true,
        depth: messages.length - index - 1,
        variables: variablesForRegex,
      },
    })),
  );
  messages = messages.map((message, index) => ({ ...message, content: regexResults[index].text }));
  // Live API generation receives its format from the visible @D worldbook entry.
  // Standalone callers without a worldbook retain a minimal legacy fallback.
  if (!options.worldInfo) {
    const contract = await readText(`${kind}.system.md`);
    messages.push({
      role: 'system',
      content: contract + '\n本次输出JSON Schema：\n' + JSON.stringify(schema),
    });
  }
  const warnings = auditPromptPreset(kind, preset);
  if (kind === 'script') {
    const boundary = messages.findLastIndex((message) =>
      message.content.startsWith('【数据生成输出边界】'),
    );
    const hasWorldbookScriptTeaching =
      scan?.entries.some(
        (entry) => entry.extensions?.wanxiang?.generationRule === 'script-definition',
      ) &&
      scan?.entries.some((entry) => entry.extensions?.wanxiang?.generationRule === 'script-plot');
    const baseText = hasWorldbookScriptTeaching
      ? galActorListText(input)
      : galInstruction(input, kind) +
        (inputPass[1].text
          ? '\n把玩家补充的意图用作可以尝试的行动或对话，保留玩家选择和实际结果。'
          : '');
    messages.splice(boundary < 0 ? messages.length : boundary, 0, {
      role: 'system',
      content: baseText,
    });
    messages.splice(
      boundary < 0 ? messages.length : boundary + 1,
      0,
      ...playerIntentMessages(inputPass[1].text),
    );
  }
  if (kind === 'character' && input.questCharacter)
    messages.push({
      role: 'system',
      content:
        '本次是任务角色。保留标准角色JSON，省略arrivalDialogue，顶层增加quest对象，包含scene（给定可达地点ID）、story（约500中文字的到场小剧场）、level（1至99，优先尊重身份与世界观）、requirements（tavern 0至10、affection 0至30、partyLevel 1至99、difficulty 为none/low/medium/high、reason 为条件说明）。强大角色可以推迟招募。不要改变本轮人物生成格式的其余字段。',
    });
  if (kind === 'map' && input.discovery)
    messages.push({
      role: 'system',
      content:
        '本次输出为泛生界中的实地地点。保留地图JSON的现有字段，并在同一JSON根对象额外写 linkId（路线中的连接地点ID）和 direction（八方位中文名称）。地点等级由程序依据连接点决定。战斗背景须符合当地气候。结合区域地理、文化和行路经历构思明确的探索吸引点。',
    });
  if (
    scan &&
    !scan.entries.some((entry) => entry.extensions?.wanxiang?.generationRule === `${kind}-output`)
  )
    warnings.push(
      '当前API的JSON输出格式 @D条目未激活；请在世界书检查开关与发送对象。代码仍会校验返回结构。',
    );
  const blocks = [characters, history, scenario].filter((text) => text.length > 100);
  for (const block of blocks)
    if (messages.filter((item) => item.content.includes(block)).length > 1)
      warnings.push('检测到人物、历史或地形上下文重复注入；请关闭重复占位层或宏，减少输入量。');
  if (messages.at(-2)?.role === 'assistant')
    warnings.push(
      '最后一条可编辑消息为ASSISTANT；不要放半截JSON或要求续写，实际响应必须在wanxiang_output标签内提供完整JSON。',
    );
  if (kind === 'script') messages.unshift(...journeyContinuityMessage(input));
  return {
    messages,
    sampling: presetSampling(preset),
    transport: {
      format: 'tagged-json',
      tag: OUTPUT_TAG,
      responseFormat: null,
      ...outputTransport,
      presetProcessing: options.presetProcessing,
      presetVariables: { user: variables.user, char: variables.char },
    },
    regex: {
      scripts: regexScripts.length,
      changes: [...inputPass[0].changes, ...regexResults.flatMap((result) => result.changes)],
    },
    ...(options.countTokens
      ? {
          tokens: requestTokenReport(
            messages,
            options.countTokens,
            null,
            options.maxOutput || 0,
            outputToolRequest(outputTransport.outputTool),
          ),
        }
      : {}),
    worldInfo: scan
      ? {
          report: scan.report,
          warnings: scan.warnings,
          usedTokens: scan.usedTokens,
          budget: scan.budget,
          scanDepth: scan.scanDepth,
        }
      : null,
    warnings: [...new Set(warnings)],
    nextWorldState: scan?.nextState,
  };
}
