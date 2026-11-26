import { CHAT_PLACES, cityChatPlace } from '../../chat-places.js';
import {
  SCENE_ENVIRONMENT_END,
  SCENE_ENVIRONMENT_START,
  SCENE_ENVIRONMENT_TEXT_LIMIT,
} from '../../scene-environment.js';
import { composePromptPreset, presetSampling } from '../presets.js';
import { scanWorldbooks, injectWorldbookMessages } from '../worldbook-scan.js';
import { finalizeRequest } from './prompt-processing.js';
import { presetOutputTransport, presetOutputWarnings } from '../preset-output.js';
import { QUEST_LEAD_TYPES } from '../output-protocol.js';
import { adviceTranscript } from '../advice.js';
import {
  galInstruction,
  galSceneCastInstruction,
  hasGalEnsembleGuidance,
  hasGalReactionGuidance,
} from '../gal-prompt.js';
import {
  adventureChatRules,
  adventureOutputBoundary,
  adventureTurnTask,
  adventureBoundaryIds,
} from '../adventure-prompt.js';
import { FOOD_WORLDBOOK_CONTENT } from '../../content/dining.js';
import { newWorldEntry } from '../worldbook.js';
import { invitationChatInstruction, invitationTurnContext } from './invitation-request.js';
import { INVITATION_CONTEXT_LIMIT, journeyContinuityMessage } from '../../memory.js';
import { buildTriggerIds } from '../worldbook-triggers.js';
import { DC_RP_SYSTEM_RULES, fixedChoicePromptSummary, freeDcPromptSummary } from '../../dc-rp.js';

export function chatInput(kind, input) {
  if (!['chat', 'quick-chat'].includes(kind)) throw Error('聊天接口类型无效');
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 10000)
    throw Error('发言需要1～10000字');
  if (kind === 'chat' && !Object.hasOwn(CHAT_PLACES, input.place)) throw Error('请先选择交流地点');
  if (!Array.isArray(input.characters) || input.characters.length > 100)
    throw Error('角色列表无效');
  const history = Array.isArray(input.history) ? input.history : [];
  if (history.length > 100000) throw Error('聊天上下文条目过多，请整理记录');
  if (
    history.some(
      (message) =>
        !['user', 'assistant', 'system'].includes(message.role) ||
        typeof message.content !== 'string' ||
        message.content.length > 200000,
    )
  )
    throw Error('聊天记录格式无效');
  const mentions = [input.text, input.activities || ''].join('\n');
  const selected = new Set(Array.isArray(input.selected) ? input.selected : []);
  const characters = input.characters
    .filter(
      (character) =>
        selected.has(character.id) || (character.name && mentions.includes(character.name)),
    )
    .map((character) => ({
      id: String(character.id).slice(0, 100),
      name: String(character.name).slice(0, 60),
      worldbook: String(character.worldbook || '').slice(0, 24000),
      ...(typeof character.invitationMemory === 'string' && character.invitationMemory
        ? { invitationMemory: character.invitationMemory.slice(0, INVITATION_CONTEXT_LIMIT) }
        : {}),
    }));
  return { ...input, text: input.text.trim(), history, characters };
}

/** All chat prompts, dry previews and actual calls share this exact assembler. */
export async function chatRequest(
  kind,
  rawInput,
  preset,
  { profile, worldInfo, countTokens, presetProcessing, advice },
) {
  if (kind !== 'chat') advice = null;
  const input = chatInput(kind, rawInput);
  const cityPlace = kind === 'chat' ? cityChatPlace(input.place) : null;
  // Legacy world entries enabled for script are also useful to chat, except generation contracts.
  const books = structuredClone(worldInfo.books);
  const hasDiningEntry = books.some((book) =>
    Object.values(book.entries).some((entry) => entry.extensions?.wanxiang?.dining),
  );
  if (kind === 'chat' && input.dining && !hasDiningEntry) {
    books.push({
      id: 'meal-context',
      name: '酒馆食材与菜肴',
      entries: {
        0: {
          ...newWorldEntry(0),
          comment: '酒馆食材与菜肴 · 仅用餐',
          key: ['chat:dining'],
          constant: false,
          ignoreBudget: true,
          position: 4,
          depth: 0,
          order: 9000,
          apiTargets: ['chat'],
          content: FOOD_WORLDBOOK_CONTENT,
          extensions: { wanxiang: { dining: true } },
        },
      },
    });
  }
  const CHAT_RULE_BLOCKLIST = new Set(['generation-boundary-output', 'adventure-nodes']);
  for (const book of books)
    for (const entry of Object.values(book.entries)) {
      if (entry.extensions?.wanxiang?.dining && (kind !== 'chat' || !input.dining)) {
        entry.disable = true;
      }
      const rule = entry.extensions?.wanxiang?.generationRule;
      const chatAllowedRule =
        rule &&
        (['chat-writing', 'chat-boundary'].includes(rule) ||
          (entry.apiTargets?.includes('chat') &&
            !CHAT_RULE_BLOCKLIST.has(rule) &&
            !/^(character|script|map|creation|summary)-/.test(rule)));
      if (
        (rule && !chatAllowedRule) ||
        entry.extensions?.wanxiang?.generationExample ||
        entry.extensions?.wanxiang?.officialDungeonId
      )
        entry.disable = true;
    }
  const history = input.history.map(({ role, content }) => ({ role, content }));
  if (kind === 'chat')
    history.push({
      role: 'system',
      content:
        '【当前场景状态，优先于旧聊天正文】在场同行者：' +
        input.characters
          .filter((member) => (input.selected || []).includes(member.id))
          .map((member) => member.name)
          .join('、') +
        '。未勾选角色不在场；资料因本轮提及而发送，不代表其重新到场。历史中的到场状态已经过去，以最新的离开、换位通知与本条当前名单为准。',
    });
  const characters = input.characters
    .map((character) => {
      const setting = `${character.name}（id：${character.id}）\n${character.worldbook}`;
      return character.invitationMemory
        ? `${setting}\n【此人与玩家过去共同经历的约见】\n${character.invitationMemory}`
        : setting;
    })
    .join('\n\n');
  const environment =
    kind === 'chat'
      ? `${CHAT_PLACES[input.place].name}：${CHAT_PLACES[input.place].environment}\n${String(input.activities || '').slice(0, 15000)}`
      : String(input.environment || '').slice(0, 15000);
  const scan = scanWorldbooks({
    books,
    settings: worldInfo.settings,
    state: worldInfo.state,
    countTokens,
    context: {
      kind,
      triggerIds: buildTriggerIds(kind, input),
      messages: [...history, { role: 'user', content: input.text }],
      names: input.characters.map((character) => character.name),
      characterIds: input.characters.map((character) => character.id),
      characters,
      personalities: characters,
      scenario: environment,
      persona: worldInfo.settings.persona || '玩家',
      tags: [],
    },
  });
  const hasWorldbookChatTeaching =
    scan.entries.some((entry) => entry.extensions?.wanxiang?.generationRule === 'chat-writing') &&
    scan.entries.some((entry) => entry.extensions?.wanxiang?.generationRule === 'chat-boundary');
  const sampling = presetSampling(preset);
  const warnings = presetOutputWarnings(preset);
  const fixedCheck =
    input.dcContext?.mode === 'fixed'
      ? input.dcContext.choiceCheck
      : input.adventure?.mode === 'event'
        ? input.adventure.choiceCheck
        : null;
  const rules =
    kind === 'chat'
      ? '直接续写当前地点的人物言语、行动与环境正文，沿用预设文风，可以使用HTML，不说明“正在聊天”、不解释界面、不写聊天总结。正文只放在唯一一组<wanxiang_output>与</wanxiang_output>内。随后在唯一一组<wanxiang_actions>与</wanxiang_actions>内输出JSON：{"affection":[{"id":"队友ID","delta":1}],"agreeToAdventure":[]}。affection中的id与agreeToAdventure中的每一项，都必须原样使用人物资料标明的内部id，不能填写角色姓名、昵称、站位或编造ID；正文仍自然称呼角色姓名，不展示内部id。根据本轮实际互动给出-5～5的好感增量（冒犯或伤害关系可扣分，没有变化时affection为空）。只有角色在正文中明确同意与玩家一起进入副本，才把其ID放入agreeToAdventure。指令只针对在场或本轮提及的已知角色，不含主角，不凭空替玩家作决定。'
      : input.dialogueContext
        ? fixedCheck
          ? '这是外出旅途中的固定抉择事件。顺着玩家所选方案与系统既定判定结果直接演对手戏，在行动爆发处单独另起一行插入 [[DC_CHECK]] 并外附唯一一组 <wanxiang_dc>JSON</wanxiang_dc>，正文放在唯一一组<wanxiang_output>正文</wanxiang_output>标签内。'
          : input.dcContext?.mode === 'free'
            ? '这是外出旅途中的奇遇自由互动。顺着玩家本轮的言行与当前旅途遭遇，直接演对手戏并推进眼前的事件。仅当行动面临明显阻力或风险时，才自主决定发起 2D6 DC 检定（插入 [[DC_CHECK]] 并外附 <wanxiang_dc>）；日常互动可免检。正文放在唯一一组<wanxiang_output>正文</wanxiang_output>标签内。'
            : '这是外出旅途中的奇遇自由互动。顺着玩家本轮的言行与当前旅途遭遇，直接演对手戏并推进眼前的事件，不替玩家做后续决定，不擅自发放战斗数值奖励，也不进行DC检定（禁止输出 [[DC_CHECK]] 与 <wanxiang_dc>）。只回复唯一一组<wanxiang_output>正文</wanxiang_output>标签。'
        : '这是当前战斗/剧情间隙的简短闲聊，不是后续剧本。正文只放在唯一一组<wanxiang_output>与</wanxiang_output>内；除本轮明确启用的附录外，不返回JSON。不得推进剧情或改变战斗。';
  const leanTaskRule =
    kind === 'chat'
      ? '【本轮模式：chat】'
      : input.invitation
        ? '【本轮模式：quick-chat / invitation】'
        : input.dialogueContext
          ? '【本轮模式：quick-chat / overland】'
          : '【本轮模式：quick-chat / quick】';
  const previousScript = String(input.previousScript || '').slice(0, 500000);
  const base = [
    {
      role: 'system',
      content: '基础世界设定以本次激活的世界书为准，人物设定与酒馆规则须保持一致。',
    },
    {
      role: 'system',
      content: `所在环境\n${environment}\n\n在场与被提及人物\n${characters || '暂时没有指定人物。'}`,
    },
    ...(previousScript
      ? [
          {
            role: 'system',
            content: `上一次副本的内部剧本原文，仅作过去的背景参考以保持文风与大体因果一致，不继续推进，也严禁模仿其叙事结构或桥段套路：\n${previousScript}`,
          },
        ]
      : []),
  ];
  if (kind === 'quick-chat' && input.adventure) {
    const stateContext = { ...input.adventure };
    delete stateContext.history;
    if (stateContext.mode === 'event') {
      delete stateContext.choiceCheck;
      if (stateContext.choice) {
        const { id, label, detail } = stateContext.choice;
        stateContext.choice = { id, label, detail };
      }
      if (stateContext.event?.choices) {
        stateContext.event = {
          ...stateContext.event,
          choices: stateContext.event.choices.map(({ id, label, detail }) => ({
            id,
            label,
            detail,
          })),
        };
      }
    }
    base.push({
      role: 'system',
      content: '当前五节点冒险上下文（未来预定不是已发生历史）：\n' + JSON.stringify(stateContext),
    });
  }
  if (fixedCheck) {
    base.push({
      role: 'system',
      content: `${fixedChoicePromptSummary(fixedCheck)}\n${DC_RP_SYSTEM_RULES}`,
    });
  } else if (input.dcContext?.mode === 'free') {
    const forcePrefix = input.dcContext?.forced
      ? '【本轮为第四节点自由任务判定回合】你必须依据玩家本轮行动挑选最契合的属性与角色进行 2D6 判定：在出手关键处单独另起一行插入 [[DC_CHECK]]，并在 <wanxiang_output> 之外输出 <wanxiang_dc>（设为 "triggered": true）。注意：DC 判定成败只决定本回合代价与波折，任务目标是否 completed 仅看剧情是否达成目的，DC 失败绝不锁死任务。\n'
      : '';
    base.push({
      role: 'system',
      content: `${forcePrefix}${freeDcPromptSummary(input.dcContext)}\n${DC_RP_SYSTEM_RULES}`,
    });
  } else if (kind === 'quick-chat') {
    base.push({
      role: 'system',
      content:
        '【检定限制】本轮不是选择事件判定，严禁进行属性/DC检定，严禁在正文中写入 [[DC_CHECK]]，严禁输出 <wanxiang_dc> 标签。',
    });
  }
  if (input.archiveContext)
    base.push({
      role: 'system',
      content: `关键词触发的已知档案，仅为既有经历：\n${JSON.stringify(input.archiveContext)}`,
    });
  if (input.dialogueContext)
    base.push({
      role: 'system',
      content: `【当前外出行程及已演出内容】\n${JSON.stringify(input.dialogueContext)}`,
    });
  if (kind === 'chat' && input.dining)
    base.push({
      role: 'system',
      content: `【本次餐桌数据】${JSON.stringify(input.dining)}`,
    });
  if ((kind === 'chat' || input.dialogueContext) && input.protagonistId)
    base.push({
      role: 'system',
      content: `【玩家主角与关系状态】${JSON.stringify({
        protagonistId: String(input.protagonistId).slice(0, 100),
        relationships: input.relationships || {},
      })}`,
    });
  let dropped = 0;
  async function assemble() {
    const transcript = [...history, { role: 'user', content: input.text }];
    const enabledPrompts = preset.prompt_order[0].order
      .filter((item) => item.enabled)
      .map((item) => preset.prompts.find((entry) => entry.identifier === item.identifier))
      .filter(Boolean);
    const hasHistoryMarker = enabledPrompts.some(
      (entry) => entry.marker && ['chatHistory', 'taskContext'].includes(entry.identifier),
    );
    const inputOnly =
      !hasHistoryMarker &&
      enabledPrompts.some((entry) => !entry.marker && /{{\s*input\s*}}/i.test(entry.content));
    const effectiveAdvice = inputOnly ? null : advice;
    const projection = adviceTranscript(transcript, effectiveAdvice);
    const variables = {
      input: projection.messages.at(-1).content,
      lastchatmessage: projection.messages.at(-1).content,
      lastcharmessage:
        projection.messages.findLast((message) => message.role === 'assistant')?.content || '',
      brief: projection.messages.at(-1).content,
      task: kind === 'chat' ? '酒馆交流' : input.dialogueContext ? '旅途奇遇扮演' : '战斗闲聊',
      char: input.characters.map((character) => character.name).join('、'),
      user: '玩家',
      description: characters,
      personality: characters,
      characters,
      scenario: environment,
      history: projection.messages
        .slice(0, -1)
        .map((message) => `${message.role}：${message.content}`)
        .join('\n\n'),
      persona: worldInfo.settings.persona,
      worldbook: scan.entries.map((entry) => entry.content).join('\n\n'),
    };
    const prompt = composePromptPreset(preset, variables, {
      taskContext: transcript,
      chatHistory: transcript,
      charDescription: [],
      charPersonality: [],
      scenario: [],
      personaDescription: [],
      worldInfoBefore: [],
      worldInfoAfter: [],
      dialogueExamples: [],
    });
    // The current message and history cannot disappear or repeat when both markers are enabled.
    const seen = new Set();
    const unique = prompt.filter((message) => {
      const index = transcript.indexOf(message);
      if (index < 0) return true;
      if (seen.has(index)) return false;
      seen.add(index);
      return true;
    });
    let messages = injectWorldbookMessages(
      [...base, ...unique],
      scan.entries,
      worldInfo.settings.authorNote,
      { characterText: characters },
    );
    const galOptions = {
      reactionInWorldbook: hasGalReactionGuidance(messages),
      ensembleInWorldbook: hasGalEnsembleGuidance(messages),
    };
    messages.push({
      role: 'system',
      content: hasWorldbookChatTeaching
        ? kind === 'quick-chat' && input.adventure
          ? `${adventureTurnTask(input.adventure, !!input.dialogueScenes?.length)}\n${galSceneCastInstruction(input, kind, galOptions)}`
          : `${leanTaskRule}\n${galSceneCastInstruction(input, kind, galOptions)}`
        : (kind === 'quick-chat' && input.adventure
            ? adventureChatRules(input.adventure, !!input.dialogueScenes?.length)
            : rules) +
          '\n' +
          galInstruction(input, kind, galOptions),
    });
    if (cityPlace) {
      const time = input.timeOfDay === 'day' ? '白天' : input.timeOfDay === 'night' ? '夜晚' : '';
      messages.push({
        role: 'system',
        content:
          `【城内交流环境开头】当前地点：${cityPlace.title}${time ? '（' + time + '）' : ''}。` +
          `在唯一的 <wanxiang_output> 正文内，紧接开标签必须先写一组 ${SCENE_ENVIRONMENT_START}纯文本环境描写${SCENE_ENVIRONMENT_END}；两个环境标记原样输出，不在标记内填写地点名、ID 或其他参数。` +
          `环境用两到四句具体的当下感官描写，不超过 ${SCENE_ENVIRONMENT_TEXT_LIMIT} 字，不放 Gal、HTML、图片或检定标记，不替玩家行动，不切换地点。` +
          '闭合环境块后另起一行接本轮 Gal 对白或旁白，后续不再使用环境标记。原有 <wanxiang_actions> 仍在正文标签之外。',
      });
    }
    // Only actual retained conversation objects qualify, never assistant examples or world entries.
    const messageIndices = new Map(messages.map((message, index) => [message, index]));
    const retained = transcript
      .map((message) => messageIndices.get(message))
      .filter((index) => index !== undefined);
    const transfer = adviceTranscript(
      retained.map((index) => messages[index]),
      effectiveAdvice,
    );
    retained.forEach((index, position) => {
      messages[index] = transfer.messages[position];
    });
    const boundary = hasWorldbookChatTeaching
      ? adventureBoundaryIds(input.adventure, !!input.dialogueScenes?.length)
      : adventureOutputBoundary(input.adventure, !!input.dialogueScenes?.length);
    messages.unshift(...journeyContinuityMessage(input));
    if (kind === 'quick-chat' && boundary) messages.push({ role: 'system', content: boundary });
    if (input.questOffer)
      messages.push({
        role: 'system',
        content:
          '【任务日志线索】这是一份独立的可选日志附录，既有动作、检定和冒险状态附录照各自规则输出。只有当本轮正文自然出现值得玩家亲自追查的事件，且已交代可行动的线索时，才在正文关闭标签之后附至多一组：\n' +
          '<wanxiang_quest>{"title":"任务名","description":"任务日志简介","type":"social","level":1}</wanxiang_quest>\n' +
          '只填任务日志面板展示的四个字段。title 用凝练的委托标题，最多 50 个字符；description 用简短纪事交代本轮已出现的人物、地点、缘由和可追查线索，最多 400 个字符，避免保存时截断；如果剧情已点明下一步，可以简述其方向，不替玩家作决定。\n' +
          '标题与简介采用《上古卷轴》式任务日志口吻：标题简短如委托名，简介以玩家能记下的见闻起笔，先记已知事实，再记仍可追查的线索。克制、具体，不抄原作，不用宣传语、Markdown 或 Gal 标记。不得虚构本轮未出现的人物或目标；文风不是程序拒收条件。\n' +
          `type 填 ${QUEST_LEAD_TYPES.join('、')}（依次为社交、人物、战斗）；level 填 1 至 99 的整数，按实际风险推荐。\n` +
          '任务目标、完成条件、进度、结算和奖励由游戏掌控；不要另填这些字段，也不要在简介里宣布任务已完成。普通寒暄、重复线索或无实质后果的跑腿不附任务。',
      });
    if (input.questNegotiation)
      messages.push({
        role: 'system',
        content:
          '这是任务角色的招募交涉。根据角色立场回应，态度和条件可以拒绝玩家。正文后附一组<wanxiang_negotiation>{"score":0}</wanxiang_negotiation>。score 为0至5整数，0代表无进展，5代表有充分理由接受。结合既往交涉判断，不因玩家口头声称而跳过门槛。\n' +
          JSON.stringify(input.questNegotiation),
      });
    if (kind === 'quick-chat' && input.invitation) {
      messages.push({
        role: 'system',
        content: hasWorldbookChatTeaching
          ? invitationTurnContext(input.invitation)
          : invitationChatInstruction(input.invitation),
      });
    }
    if (Array.isArray(input.dialogueScenes) && input.dialogueScenes.length) {
      messages.push({
        role: 'system',
        content: hasWorldbookChatTeaching
          ? `【本轮后续可编辑场景数据】${JSON.stringify(input.dialogueScenes)}`
          : `【本轮闲聊后的台词修改】先完整输出当前回复及本轮任务数据，再输出一组<wanxiang_dialogue>JSON数组</wanxiang_dialogue>。
本轮每个尚未演出的场景都要根据本次对话修改台词或旁白。逐幕逐句处理，充分落实对话产生的影响，不能只象征性改一句或省略后续场景。每个可编辑的台词ID都要给出完整文字，沿用原句时也完整写出。人物、出场顺序、地点、选项、目标、战斗和奖励沿用原安排。保留说话人，跳过舞台指令和玩家台词，不在当前回复提前演出后续内容。
每幕填写原id和revision。patches逐条使用{"op":"replace","id":"已有台词ID","speaker":"原说话人","text":"完整的新台词或旁白"}。保留已有台词ID，不输出HTML或舞台标签。
尚未演出的场景：${JSON.stringify(input.dialogueScenes)}`,
      });
    }
    const adviceStatus = !advice
      ? null
      : !advice.enabled
        ? 'disabled'
        : inputOnly
          ? 'missing-history-marker'
          : transfer.transferred
            ? 'enabled'
            : 'no-paired-assistant';
    return finalizeRequest(
      {
        messages,
        sampling,
        transport: {
          format: 'tagged-prose',
          tag: 'wanxiang_output',
          ...presetOutputTransport(preset),
          presetProcessing,
          presetVariables: { user: variables.user, char: variables.char },
          ...(adviceStatus
            ? {
                advice: {
                  status: adviceStatus,
                  transferred: transfer.transferred,
                  position: advice.position,
                },
              }
            : {}),
        },
        warnings: [
          ...warnings,
          ...(advice?.enabled && inputOnly
            ? ['Advice未应用：预设仅使用input宏，请启用聊天历史占位层；本轮按原输入发送。']
            : []),
          ...(dropped ? [`上下文长度限制：本次未发送最早${dropped}条消息，本地记录保留。`] : []),
        ],
        worldInfo: {
          report: scan.report,
          warnings: scan.warnings,
          usedTokens: scan.usedTokens,
          budget: scan.budget,
        },
        nextWorldState: scan.nextState,
      },
      profile,
      countTokens,
      input.characters.map((character) => character.name),
    );
  }
  for (;;) {
    try {
      return await assemble();
    } catch (failure) {
      if (!failure.message.includes('超过上下文') || !history.length) throw failure;
      history.shift();
      dropped++;
      if (history[0]?.role === 'assistant') {
        history.shift();
        dropped++;
      }
    }
  }
}
