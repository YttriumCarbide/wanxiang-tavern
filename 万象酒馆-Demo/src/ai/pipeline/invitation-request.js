import { journeyContinuityMessage } from '../../memory.js';
import { galInstruction } from '../gal-prompt.js';
import { TOWN_SIDE_PLACES } from '../../content/town-side-places.js';
import { presetSampling } from '../presets.js';
import {
  INVITATION_SCENES,
  INVITATION_PATCH_LIMIT,
  invitationActivityName,
  normalizeInvitationPlan,
  normalizeInvitationTopics,
} from '../../invitation.js';
import { extractGenerationEnvelope } from './output-envelope.js';
import { finalizeRequest } from './prompt-processing.js';
import { scanScenarioWorldbooks } from '../journey-memory-worldbook.js';
import { playerIntentMessages } from './player-intent.js';
import { buildSubScriptRequest } from './script-preset.js';

const sideLocations = Object.entries(TOWN_SIDE_PLACES).map(([id, { parent, environment }]) => ({
  id,
  parent,
  environment,
}));

function invitationActs(stageCount) {
  const count = Number(stageCount);
  if ([3, 4, 5].includes(count)) {
    return [
      ...Array.from({ length: count }, (_, index) => ({
        index,
        id: `stage-${index + 1}`,
        type: 'interaction',
      })),
      { index: count, id: 'finale', type: 'finale' },
    ];
  }
  return [
    { index: 0, type: 'interaction' },
    { index: 1, type: 'interaction' },
    { index: 2, type: 'interaction' },
    { index: 3, type: 'finale', minInteractionActs: 3, maxInteractionActs: 5 },
  ];
}

export async function buildInvitationRequest(input, preset, profile, countTokens, options = {}) {
  const invite = input.invitation;
  if (
    !invitationActivityName(invite?.activity) ||
    !Array.isArray(input.party) ||
    input.party.length < 1 ||
    input.party.length > 2
  )
    throw Error('约见请求缺少人物或活动');
  return buildSubScriptRequest({
    input,
    requiredRule: 'script-invitation',
    preset,
    profile,
    countTokens,
    worldInfo: options.worldInfo,
    regexScripts: options.regexScripts,
    runRegexTasks: options.runRegexTasks,
    presetProcessing: options.presetProcessing,
    taskLabel: '酒馆约见剧本',
    brief: invite.topic || invitationActivityName(invite.activity),
    userPayload: {
      ...invite,
      activityName: invitationActivityName(invite.activity),
      acts: invitationActs(invite.stageCount),
      allowedScenes: INVITATION_SCENES,
      sideLocations,
      characters: input.party,
    },
    samplingAdjust: (base) => ({
      ...base,
      maxTokens: Math.max(8000, base.maxTokens ?? profile?.maxTokens ?? 0),
    }),
  });
}

export function invitationRequest(input, preset, profile, countTokens, worldInfo) {
  const invite = input.invitation;
  if (
    !invitationActivityName(invite?.activity) ||
    !Array.isArray(input.party) ||
    input.party.length < 1 ||
    input.party.length > 2
  )
    throw Error('约见请求缺少人物或活动');
  const instructions = `【约见剧本创作与JSON结构要求】
1. 整体结构：一次写完一件从头到尾成立的 Gal 事件，含 3～5 幕互动（stages）和单独一幕收尾（finale）。「${invitationActivityName(invite.activity)}」只是两人见面的由头，不能只靠吃饭、走路、闲聊撑满整个事件；topic 存在时以它为本次事件主题。
2. 事件优先：先想清楚当天出了什么具体的事、为什么得处理、最初以为是什么而后来发现了什么、玩家在哪个选择上能改变局面、最后什么有了可见变化；再用约见对象的经验、顾虑和说话方式改写他的反应与收尾。personal 为真时，在事件中安排一次能体现该角色真实在意什么的选择。
3. 历史避重：参考旅途记录与约见对象的 invitationMemory，不重复过往事件的起因、关键物件、冲突、解法或收尾（换标题或换地点仍算重复）。
4. 标题与提示文案：
- title 与每幕幕名：用自然具体的话起名（如“谁敲了停用的钟”“多出来的一桌客人”），少用抽象比喻。
- premise（来意）、description（眼下发生的事）、hint（可留意的方向）：各写一句约 20 字的话。
- tasks：列出 1～3 项给玩家看的任务，每项用一句大白话说清要达成什么（如“弄清那张告示为什么被换过”），允许多种做法。
5. 各幕演出与选项（stages）：
- intro（本幕开场 Gal 正文）：先用对白和动作演出场景，停在玩家可以介入的位置，不替玩家解谜或做决定。第一幕约 850～1150 字，中间每幕约 400～650 字；换地点时把理由写进前一幕，下一幕从抵达后写起。
- choices：提供两个各约 20 字的玩家回应，给出两种不同且实际可行的说法或行动。最后一条玩家消息若有补充意图，将它融入可尝试的方向。
6. 收尾幕（finale）：包含标题、地点与约 850～1200 字的完整正文，让人物用对话和动作回扣开头，展示事情落定后的实际变化，能承接不同互动结果，不设置新任务。
7. 输出 JSON 字段（stages 示意一幕，实际写 3～5 幕）：{"title":"事件标题","premise":"来意","stages":[{"title":"幕名","scene":"合法地点ID","description":"眼前情境","hint":"可以留意的方向","intro":"Gal正文","tasks":["玩家可见的任务"],"choices":["回应一","回应二"]}],"finale":{"title":"收尾幕名","scene":"合法地点ID","intro":"收尾Gal正文"}}`;
  const sampling = presetSampling(preset);
  sampling.maxTokens = Math.max(8000, sampling.maxTokens ?? profile.maxTokens ?? 0);
  return finalizeRequest(
    {
      messages: [
        ...journeyContinuityMessage(input),
        {
          role: 'system',
          content: `你负责酒馆约见剧情。地点白名单：${JSON.stringify(INVITATION_SCENES)}。小地点从parent对应的街区进入：${JSON.stringify(sideLocations)}。露天描写遵循timeOfDay指定的白天或夜晚；无窗室内用室内灯光。人物的invitationMemory是此人与玩家亲历的过去约见。protagonistId是玩家操控的人，不能把他写成第三个在场人物，也不能替他说话或行动。不写副本、不战斗，不凭空改变好感度。\n${galInstruction(input, 'script')}\n${instructions}\n只输出一组<wanxiang_output>与</wanxiang_output>标签，JSON置于标签内。`,
        },
        ...scanScenarioWorldbooks({ ...input, brief: invite.topic }, countTokens, worldInfo),
        { role: 'user', content: JSON.stringify({ ...invite, characters: input.party }) },
        ...playerIntentMessages(input.playerIntent),
      ],
      sampling,
      warnings: [],
      transport: { format: 'tagged-json', tag: 'wanxiang_output' },
    },
    profile,
    countTokens,
    input.party.map((member) => member.name),
  );
}

export function invitationResponse(raw) {
  const value = JSON.parse(extractGenerationEnvelope('script', raw).candidateText);
  return normalizeInvitationPlan(value, { requireChoices: true });
}

export async function buildInvitationTopicsRequest(
  input,
  preset,
  profile,
  countTokens,
  options = {},
) {
  const { person, title, premise, transcript } = input.invitationTopics;
  return buildSubScriptRequest({
    input,
    requiredRule: 'script-invitation-topics',
    preset,
    profile,
    countTokens,
    worldInfo: options.worldInfo,
    regexScripts: options.regexScripts,
    runRegexTasks: options.runRegexTasks,
    presetProcessing: options.presetProcessing,
    taskLabel: '后续约见主题构思',
    brief: `${person?.name || ''} · ${title || ''}`.trim(),
    userPayload: { person, title, premise, transcript },
    includeActors: false,
    includeIntent: false,
    actorNames: person?.name ? [person.name] : [],
    samplingAdjust: (base) => ({ ...base, maxTokens: 1000 }),
  });
}

export function invitationTopicsRequest(input, profile, countTokens) {
  const { person, title, premise, transcript } = input.invitationTopics;
  return finalizeRequest(
    {
      messages: [
        {
          role: 'system',
          content:
            '根据这次已结束的约见，为同一角色想四个下一次约见可以选的事件主题。每项写一句给玩家看的具体新事件。unrelated与本次无关；weak恰好两项，各自从不同的旁支、场所或人物发散；strong直接承接本次的主要事件，写出接下来可能发生的新情况。四项互不重复，不预设玩家会怎么做。只在<wanxiang_output>标签内输出JSON，字段为{"unrelated":"主题","weak":["主题","主题"],"strong":"主题"}。',
        },
        { role: 'user', content: JSON.stringify({ person, title, premise, transcript }) },
      ],
      sampling: { maxTokens: 1000 },
      transport: { format: 'tagged-json', tag: 'wanxiang_output' },
    },
    profile,
    countTokens,
    [],
  );
}

export function invitationTopicsResponse(raw) {
  return normalizeInvitationTopics(
    JSON.parse(extractGenerationEnvelope('script', raw).candidateText),
  );
}

export function invitationChatInstruction(turn) {
  if (!turn) return '';
  const next = turn.nextScene;
  const destination = next && INVITATION_SCENES[next.scene];
  const travel =
    destination && destination !== turn.scene
      ? `下一幕在「${destination}」。若本轮完成本幕剩余任务，或已达到本幕最后一轮，在对白中自然提出要去那里，以及为什么；此轮的正文仍留在当前地点，实际赶路由玩家完成。不要写已经抵达。`
      : '';
  const editing = next?.id
    ? `如本轮确实发生了值得后续接住的事，可以用patches微调下一幕（最后一次互动时是收尾）。nextSceneId与revision照抄下一幕的id和revision，每轮最多${INVITATION_PATCH_LIMIT}条。替换一句用{"op":"replace","id":"已有台词ID","speaker":"该句原说话人","text":"新台词"}；插入一句用{"op":"insert","after":"前一句ID","before":"紧邻后一句ID","speaker":"现有角色ID或旁白","text":"新台词"}。text只写可演出的纯文本。cue是舞台指令，跳过它，不修改它或跨过它插入。只用下面的真实ID，不改幕名、地点、任务或其他幕，不代替玩家发言，不把未发生的事写成结果。不需要修改时patches填[]。本轮评分块外层形状：${JSON.stringify({ stageId: turn.stageId, score: 3, completed: [], note: '', nextSceneId: next.id, revision: next.revision, patches: [] })}。`
    : '本轮没有可编辑的后续场景，patches填[]。';
  return `本轮是约见事件互动。正文通常写180～320字，用角色台词、具体动作和自然反应推进眼前事件。能给出具体线索或后果时就直接演出来，少复述玩家的话或退回无关闲聊。任务达成时在对白和动作里写出实际结果；还有可尝试的事时给玩家留出回应空间。protagonistId是玩家操控的人，不作为第三个人发言，不代替他行动或承诺。${travel}角色不朗读任务、正确做法或分数。正文在唯一一组wanxiang_output标签内，随后输出<wanxiang_invitation>JSON</wanxiang_invitation>：stageId原样照抄；score是0～5的整数（正常2～3）；completed是本轮正文实际达成的任务ID数组（未达成用[]）；note用1句客观概述玩家做了什么、角色如何回应，只记录已发生事实。
${editing}
当前事件：${JSON.stringify(turn)}`;
}

export function invitationTurnContext(turn) {
  if (!turn) return '';
  const next = turn.nextScene;
  const destination = next && INVITATION_SCENES[next.scene];
  const template = next?.id
    ? {
        stageId: turn.stageId,
        score: 3,
        completed: [],
        note: '',
        nextSceneId: next.id,
        revision: next.revision,
        patches: [],
      }
    : { stageId: turn.stageId, score: 3, completed: [], note: '', patches: [] };
  return `【本轮约见数据】${JSON.stringify({
    ...(destination && destination !== turn.scene ? { nextDestination: destination } : {}),
    patchLimit: next?.id ? INVITATION_PATCH_LIMIT : 0,
    template,
    turn,
  })}`;
}
