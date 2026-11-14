import { CHAT_PLACES } from '../../chat.js';
import { composePromptPreset, presetSampling } from '../presets.js';
import { scanWorldbooks, injectWorldbookMessages } from '../worldbook-scan.js';
import { finalizeRequest } from './prompt-processing.js';
import { presetOutputTransport, presetOutputWarnings } from '../preset-output.js';
import { adviceTranscript } from '../advice.js';
import { galInstruction, galActorListText } from '../gal-prompt.js';
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

export function chatInput(kind, input) {
  if (!['chat', 'quick-chat'].includes(kind)) throw Error('聊天接口类型无效');
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 10000)
    throw Error('发言需要1～10000字');
  if (kind === 'chat' && !CHAT_PLACES[input.place]) throw Error('请先选择酒馆座位');
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
  { profile, worldInfo, regexScripts, countTokens, presetProcessing, advice, runRegexTasks },
) {
  if (kind !== 'chat') advice = null;
  regexScripts = chatRegexScripts(kind, regexScripts);
  const input = chatInput(kind, rawInput);
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
  const rules =
    kind === 'chat'
      ? '直接续写当前酒馆内的人物言语、行动与环境正文，沿用预设文风，可以使用HTML，不说明“正在聊天”、不解释界面、不写聊天总结。正文只放在唯一一组<wanxiang_output>与</wanxiang_output>内。随后在唯一一组<wanxiang_actions>与</wanxiang_actions>内输出JSON：{"affection":[{"id":"队友ID","delta":1}],"agreeToAdventure":[]}。affection中的id与agreeToAdventure中的每一项，都必须原样使用人物资料标明的内部id，不能填写角色姓名、昵称、站位或编造ID；正文仍自然称呼角色姓名，不展示内部id。根据本轮实际互动给出0～5的好感增量；没有变化时affection为空。只有角色在正文中明确同意与玩家一起进入副本，才把其ID放入agreeToAdventure。指令只针对在场或本轮提及的已知角色，不含主角，不凭空替玩家作决定。'
      : '这是当前战斗/剧情间隙的简短闲聊，不是后续剧本。只回复一组<wanxiang_output>正文</wanxiang_output>标签，不返回JSON。不得推进剧情或改变战斗。';
  const leanTaskRule =
    kind === 'chat'
      ? `【本轮模式：chat】\n${galActorListText(input)}`
      : input.invitation
        ? `【本轮模式：quick-chat / invitation】\n${galActorListText(input)}`
        : `【本轮模式：quick-chat / quick】\n${galActorListText(input)}`;
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
            content: `上一次副本的内部剧本原文，仅作过去的背景，不继续推进：\n${previousScript}`,
          },
        ]
      : []),
  ];
  if (kind === 'quick-chat' && input.adventure) {
    const stateContext = { ...input.adventure };
    delete stateContext.history;
    base.push({
      role: 'system',
      content: '当前五节点冒险上下文（未来预定不是已发生历史）：\n' + JSON.stringify(stateContext),
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
  if (kind === 'chat' && input.protagonistId)
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
      task: kind === 'chat' ? '酒馆交流' : '战斗闲聊',
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
    messages.push({
      role: 'system',
      content: hasWorldbookChatTeaching
        ? kind === 'quick-chat' && input.adventure
          ? `${adventureTurnTask(input.adventure, !!input.dialogueScenes?.length)}\n${galActorListText(input)}`
          : leanTaskRule
        : (kind === 'quick-chat' && input.adventure
            ? adventureChatRules(input.adventure, !!input.dialogueScenes?.length)
            : rules) +
          '\n' +
          galInstruction(input, kind),
    });
    const processed = await runRegexTasks(
      regexScripts,
      messages.map((message, index) => ({
        text: message.content,
        placement: message.role === 'user' ? 1 : message.role === 'assistant' ? 2 : 5,
        options: { kind: 'script', isPrompt: true, depth: messages.length - index - 1, variables },
      })),
    );
    // Apply after prompt regexes: an Advice cleanup regex must not erase the input just moved.
    // Only actual retained conversation objects qualify, never assistant examples or world entries.
    const messageIndices = new Map(messages.map((message, index) => [message, index]));
    const retained = transcript
      .map((message) => messageIndices.get(message))
      .filter((index) => index !== undefined);
    const transfer = adviceTranscript(
      retained.map((index) => ({ ...messages[index], content: processed[index].text })),
      effectiveAdvice,
    );
    messages = messages.map((message, index) => ({ ...message, content: processed[index].text }));
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
          '只有当本轮正文自然提到值得玩家亲自追查的特殊事件、地点或人物，并且已有具体可行动线索时，正文后可附至多一组<wanxiang_quest>{"title":"任务名","description":"给玩家看的具体介绍","hook":"本轮正文中的线索与后续悬念","type":"social|character|battle 三选一","level":1}</wanxiang_quest>。level 为1至99，按真实内容判断；普通寒暄、重复线索、无实质后果的跑腿一律省略。',
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

export function chatRegexScripts(kind, scripts) {
  return scripts.map((script) => ({
    ...script,
    apiTargets:
      script.apiTargets.includes(kind) || script.apiTargets.includes('script') ? ['script'] : [],
  }));
}
