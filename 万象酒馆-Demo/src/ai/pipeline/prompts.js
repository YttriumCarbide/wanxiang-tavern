import { isEndless } from '../../worlds.js';
import { arcFor } from '../../story-arc.js';
import { generationNumbers } from '../../growth.js';
import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from '../../content/journey-rules.js';
import { OUTPUT_TAG } from './output-envelope.js';
import { encounterSpec, DEFINITIONS } from '../../data.js';
import { normalizePromptPreset, composePromptPreset, presetSampling } from '../presets.js';
import { scriptOutputSchema } from '../script-schema.js';
import { characterOutputSchema } from '../character-schema.js';
import { TAVERN_WORLD, EXPEDITION_PLACES } from '../../content/world.js';
import { officialDungeonFor } from '../../content/official-dungeons.js';
import { characterGameReference } from './game-reference.js';
import { scanWorldbooks, injectWorldbookMessages } from '../worldbook-scan.js';
import { requestTokenReport } from './request-tokens.js';
import { auditPromptPreset } from './prompt-audit.js';
import { encounterEnemies, enemiesForSpec } from './encounter-reference.js';
import { explorationSpec } from '../../exploration.js';
import { REGIONS } from '../../content/regions.js';
import { presetOutputTransport, outputToolRequest } from '../preset-output.js';
import { requireNpcInteraction } from '../../npc-interaction.js';

export function generationInput(kind, input) {
  if (!['character', 'script'].includes(kind)) throw Error('接口类型无效');
  if (typeof input.brief !== 'string' || input.brief.length < 1 || input.brief.length > 10000)
    throw Error('请填写1～10000字的生成要求');
  if (kind === 'character')
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
          '职业',
          '性格',
          '经历',
          '攻击方式',
          '主动技能动作描写与被动实际效果',
        ],
      },
      mechanics: { ...characterGameReference(), generationNumbers: generationNumbers(input) },
      request: {
        brief: input.brief,
        unavailableCharacters: ['潘多拉（仅第二次副本结算事件加入，不可抽取）'],
        ...(input.purpose === 'npc'
          ? {
              knownNpc: input.npc,
              guidance:
                '细化此NPC并保留原姓名、外貌、经历与副本身份，补全战斗数据，不重新创作成其他人。',
            }
          : {}),
        ...(input.purpose !== 'protagonist'
          ? {
              arrivalDialogue:
                '根节点额外输出arrivalDialogue数组，2～5句角色与玩家主角的初见对话，每项{speaker:"character"或"player",text:"对白"}，轻松自然，无强制引导。不写入setting；此对话仅本次展示，不留作记忆。',
            }
          : {}),
        ...(input.purpose === 'protagonist'
          ? {
              role: '玩家主角',
              levelUpLines:
                '根节点额外输出levelUpLines数组，恰好5句符合该主角性格的简短升级台词，不存进setting。',
              guidance:
                '忠实保留玩家填写的姓名、身份、性格与动作设想。主角固定出战，程序给予较高基础生命、法力、普攻与固定2次行动；AI只选定位、主动/被动、AP费用与效果档位，不再填写实际基础值。2AP技能必须体现高回报，不得突破本次复杂度或发明未支持的效果。',
            }
          : {}),
        entrySkillGuidance:
          '每个角色必须有一个专属入场技。setting.entrySkill填写{name,description}，data.entrySkill只填写target/effects，各效果写type/power及必要机制参数，不填具体value、AP或费用。支持opposite/lowestEnemy/lowestAlly/allEnemies/allAllies/self，后排就绪换入前场时自动触发。opposite对位为空时该次攻击落空，不追击其他敌人。被动description说明实际效果，不写挥剑、抬手等动作代替规则。',
        existingCharacters: (input.existing || []).slice(0, 12).map((item) => ({
          name: String(item.name || '').slice(0, 30),
          title: String(item.title || '').slice(0, 30),
        })),
      },
    };
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
      storyArc: arcFor(input),
      ...(requireNpcInteraction(input)
        ? {
            npcInteraction: {
              required: true,
              instruction:
                '本次剧本必须安排至少一名非主角团NPC出场，并与主角团发生实质互动：对话、合作、交易、冲突或提供可执行帮助，不能只提到姓名。请在对应story正文实际描写互动，并在data.npcs中按现有格式归档该NPC，encounter填写实际出场场次。不得把队伍成员重复写成NPC；遵守本章大纲和已发生事实。',
            },
          }
        : {}),
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
              instruction:
                '重要：无限探索的正文以人物、目标、事件、抉择和世界变化为主，不能受游戏战斗外观束缚。禁止在正文使用Boss或首领战等游戏称呼，大多数底层敌人不必出现在正文；叙事走到哪里与游戏打什么可以分离，不能为了循环敌人原地打转。只有敌人确实贴合当前情节才自然描写，不勉强塞入。数据仍由你为每场选择敌人：data.encounters恰好五项，每项{enemyIds:[当前世界敌人ID]}，每场1～3个不同ID，最终场至少一位boss=true，只从敌人池选择；这些是程序配置，不是必须写进小说的情节。不输出地图buff，不改写已经历的战斗配置。',
            },
          }
        : {}),
      ...(officialDungeon
        ? {
            officialDungeon: {
              id: officialDungeon.id,
              worldbookKey: officialDungeon.key,
              instruction:
                '沿本次激活的完整官设大纲扩写，由AI根据实际战斗进度自行安排事件的叙述位置，在本次回复中讲完本次旅程。大纲不按场次预先分段，不照搬为已发生的历史。大纲中的<user>是玩家创建的主角代称，正文按characters.player所指角色的实际姓名和设定自然称呼。',
              enemyPolicy:
                'encounters已给出这份剧本的五场固定敌人，必须按真实名单描写，不换成通用怪或其他剧本Boss。沿完整大纲安排事件，不把阵容说明机械拆成五段剧情。',
            },
          }
        : {}),
      chapter: input.chapter || 1,
      ...(input.rewrite
        ? {
            rewrite: {
              instruction:
                '使用当前Schema格式，沿用原剧本角色和副本战斗配置。结合玩家闲聊修改尚未经历的后续正文，返回完整五段；已经经历的部分、已归档NPC与已收集物品不可改变。不要把闲聊当成已发生的游戏事实。',
              lockedThrough: Math.max(
                0,
                Math.min(FINAL_ENCOUNTER, Number(input.rewrite.lockedThrough) || 0),
              ),
              currentScript: String(input.rewrite.currentScript || '').slice(0, 500000),
              conversations: (Array.isArray(input.rewrite.conversations)
                ? input.rewrite.conversations
                : []
              )
                .slice(-100)
                .map(({ role, content }) => ({
                  role,
                  content: String(content || '').slice(0, 10000),
                })),
            },
          }
        : {}),
      ...(typeof input.visitId === 'string' ? { visitId: input.visitId.slice(0, 80) } : {}),
      journey:
        '这是新一趟副本。整趟使用同一个副本地点，不生成每场独立地点名、地点标题或location字段；正文自然叙述环境即可。承接已发生的历史，创作新的事件与开篇，不重新输出上一趟剧本。',
      location: selected?.name || REGIONS[input.map || 'ruins']?.name || '副本',
      previousStories: (Array.isArray(input.previousStories) ? input.previousStories : [])
        .slice(-3)
        .map((book) => ({
          title: String(book.title || '').slice(0, 60),
          tags: Array.isArray(book.tags)
            ? book.tags.map((tag) => String(tag).slice(0, 40)).slice(0, 12)
            : [],
        })),
      previousStoriesUsage: '这些仅是近期剧本的避重复索引，不是范文，也不是已发生的历史。',
      narrativeParts: [
        '旅程第一段（第一场展示）',
        '旅程第二段（第二场展示）',
        '旅程第三段（第三场展示）',
        '旅程第四段（第四场展示）',
        isEndless(input.exploration)
          ? '旅程第五段，继续推进人物与目标，不强行绑定底层战斗或预写胜负'
          : '最终Boss战开始时，推进剧情，不预写胜负',
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
            artReuse:
              '美术地图仅为环境主题，可承载本路线剧情里的其他地点；承接的古堡等地点不要求更换美术模型。',
          }
        : {}),
    },
    characters: {
      player: player
        ? {
            id: player.id,
            name: player.name,
            role: '玩家创建的主角；设定见greenLight中同一ID的角色，不是额外NPC',
          }
        : null,
      greenLight: party,
    },
    history: {
      keywordArchives: input.archiveContext || { npcs: [], stories: [] },
      confirmed: Array.isArray(input.history) ? input.history.slice(-3) : [],
      instruction: '只承接已经发生的事，伏笔不是既成事实。',
    },
    encounters: isEndless(input.exploration)
      ? Array.from({ length: ENCOUNTER_COUNT }, (_, index) => ({
          index,
          bossRequired: index === FINAL_ENCOUNTER,
          instruction:
            '以剧情为先，从request.dynamicWorld.enemies中选择，输出在data.encounters；此处不预先指定敌人。',
        }))
      : selected
        ? Array.from({ length: ENCOUNTER_COUNT }, (_, index) => {
            const spec = explorationSpec(input.exploration, index);
            return {
              index,
              map: spec.map,
              environment: REGIONS[spec.map].atmosphere,
              enemies: enemiesForSpec(spec),
              encounterReason: spec.description,
              enemyCount: spec.enemyIds.length,
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
  ]);
  input = { ...input, brief: inputPass[0].text };
  const context = options.assetContext || generationInput(kind, input);
  if (options.worldInfo)
    context.world = {
      source: '本次已激活的世界书条目',
      instruction: '公共设定来自世界书注入消息；人物私有经历来自characters，游戏协议不作为世界观。',
    };
  const schema = options.assetContext
    ? { type: 'object', description: '完整结构见当前API世界书格式条目，数据参考见本次输入' }
    : kind === 'character'
      ? characterOutputSchema()
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
    context.request.officialDungeon?.worldbookKey || '',
  ]
    .filter(Boolean)
    .join('\n');
  const scan = options.worldInfo
    ? scanWorldbooks({
        ...options.worldInfo,
        countTokens: options.countTokens,
        context: {
          kind,
          outputSchema: JSON.stringify(schema),
          trigger: 'normal',
          messages: [
            ...(input.history || []).flatMap((record) =>
              (record.confirmedEvents || []).map((line) => ({
                name: line.speaker,
                content: line.text || '',
              })),
            ),
            ...(kind === 'script' && (input.party || []).length
              ? [
                  {
                    role: 'system',
                    content: `即将上场出战角色：${(input.party || []).map((entry) => entry.name).join('、')}`,
                  },
                ]
              : []),
            { role: 'user', content: input.brief },
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
      '最后一条可编辑消息为ASSISTANT；不要放半截JSON或要求续写，实际响应必须在wanxiang_json标签内提供完整JSON。',
    );
  return {
    messages,
    sampling: presetSampling(preset),
    transport: {
      format: 'tagged-json',
      tag: OUTPUT_TAG,
      responseFormat: null,
      ...outputTransport,
      presetProcessing: options.presetProcessing,
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
