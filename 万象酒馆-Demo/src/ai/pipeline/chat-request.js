import { CHAT_PLACES } from '../../chat.js';
import { composePromptPreset, presetSampling } from '../presets.js';
import { scanWorldbooks, injectWorldbookMessages } from '../worldbook-scan.js';
import { finalizeRequest } from './prompt-processing.js';
import { presetOutputTransport, presetOutputWarnings } from '../preset-output.js';
import { adviceTranscript } from '../advice.js';

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
  for (const book of books)
    for (const entry of Object.values(book.entries)) {
      const rule = entry.extensions?.wanxiang?.generationRule;
      if (
        (rule && rule !== 'chat-boundary') ||
        entry.extensions?.wanxiang?.generationExample ||
        entry.extensions?.wanxiang?.officialDungeonId
      )
        entry.disable = true;
      else if (entry.apiTargets?.includes('script') && !entry.apiTargets.includes(kind))
        entry.apiTargets.push(kind);
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
    .map((character) => `${character.name}（id：${character.id}）\n${character.worldbook}`)
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
  const sampling = presetSampling(preset);
  const warnings = presetOutputWarnings(preset);
  const rules =
    kind === 'chat'
      ? '直接续写当前酒馆内的人物言语、行动与环境正文，沿用预设文风，可以使用HTML，不说明“正在聊天”、不解释界面、不写聊天总结。正文只放在唯一一组<wanxiang_chat>与</wanxiang_chat>内。随后在唯一一组<wanxiang_actions>与</wanxiang_actions>内输出JSON：{"affection":[{"id":"队友ID","delta":1}],"agreeToAdventure":[]}。affection中的id与agreeToAdventure中的每一项，都必须原样使用人物资料标明的内部id，不能填写角色姓名、昵称、站位或编造ID；正文仍自然称呼角色姓名，不展示内部id。根据本轮实际互动给出0～5的好感增量；没有变化时affection为空。只有角色在正文中明确同意与玩家一起进入副本，才把其ID放入agreeToAdventure。指令只针对在场或本轮提及的已知角色，不含主角，不凭空替玩家作决定。'
      : '这是当前战斗/剧情间隙的简短闲聊，不是后续剧本。只回复一组<wanxiang_chat>正文</wanxiang_chat>标签，不返回JSON。不得推进剧情或改变战斗。';
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
  if (input.archiveContext)
    base.push({
      role: 'system',
      content: `关键词触发的已知档案，仅为既有经历：\n${JSON.stringify(input.archiveContext)}`,
    });
  if (kind === 'chat' && input.protagonistId)
    base.push({
      role: 'system',
      content: `玩家主角ID：${String(input.protagonistId).slice(0, 100)}。这是user所指的人物，具体设定见人物资料，不把主角写成另一个同行者。关系状态：${JSON.stringify(input.relationships || {})}`,
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
    messages.push({ role: 'system', content: rules });
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
          tag: 'wanxiang_chat',
          ...presetOutputTransport(preset),
          presetProcessing,
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
