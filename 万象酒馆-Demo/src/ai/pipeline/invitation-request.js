import { journeyContinuityMessage } from '../../memory.js';
import { galInstruction, hasGalEnsembleGuidance, hasGalReactionGuidance } from '../gal-prompt.js';
import { TOWN_SIDE_PLACES } from '../../content/town-side-places.js';
import { CITIES } from '../../city-directory.js';
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

/** City appointments use only the validated venue snapshot supplied by daily-invitation. */
function invitationCityBoundary(invite) {
  const hasBoundary = ['city', 'startScene', 'allowedScenes'].some((key) =>
    Object.hasOwn(invite || {}, key),
  );
  if (!hasBoundary) return null;
  if (!Object.hasOwn(CITIES, invite?.city)) throw Error('约见城市无效');
  const raw = invite?.allowedScenes;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('约见城区名单无效');
  const entries = Object.entries(raw);
  if (entries.length < 1 || entries.length > 256) throw Error('约见城区名单无效');
  const allowedScenes = Object.fromEntries(
    entries.map(([id, label]) => {
      if (
        !/^[a-z0-9][a-z0-9-]{0,95}$/u.test(id) ||
        typeof label !== 'string' ||
        !label.trim() ||
        label.length > 100 ||
        /[<>【】]/u.test(label) ||
        label.includes(String.fromCharCode(10)) ||
        label.includes(String.fromCharCode(13))
      )
        throw Error('约见城区名单无效');
      return [id, label.trim()];
    }),
  );
  if (typeof invite.startScene !== 'string' || !Object.hasOwn(allowedScenes, invite.startScene))
    throw Error('约见开场地点不在本次城区名单中');
  return { city: invite.city, startScene: invite.startScene, allowedScenes };
}

function invitationPlaceContext(boundary) {
  return boundary || { allowedScenes: INVITATION_SCENES, sideLocations };
}

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
  const boundary = invitationCityBoundary(invite);
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
    presetProcessing: options.presetProcessing,
    taskLabel: '酒馆约见剧本',
    brief: invite.topic || invitationActivityName(invite.activity),
    userPayload: {
      ...invite,
      activityName: invitationActivityName(invite.activity),
      acts: invitationActs(invite.stageCount),
      ...invitationPlaceContext(boundary),
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
  const boundary = invitationCityBoundary(invite);
  const placeRule = boundary
    ? `城内约见地点边界（city、startScene 与 allowedScenes 均为本次有效城区）：${JSON.stringify(boundary)}。只能在此白名单内选址，首幕必须使用 startScene；不得切换到酒馆、城外路线或其他城市。每幕 stages[].intro 和 finale.intro 均必须以“【环境】...【环境结束】”开头：标记之间只写对应 scene 的纯文本环境描写，结束标记后再写 Gal 正文；即使连续两幕在同一地点，也要为新一幕提供场景开头。`
    : `地点白名单：${JSON.stringify(INVITATION_SCENES)}。小地点从parent对应的街区进入：${JSON.stringify(sideLocations)}。`;
  const instructions = `【约见剧本创作与JSON结构要求】
1. 整体结构：一次写完一件从头到尾成立的 Gal 事件，含 3～5 幕互动（stages）和单独一幕收尾（finale）。「${invitationActivityName(invite.activity)}」只是两人见面的由头，不能只靠吃饭、走路、闲聊撑满整个事件；topic 存在时以它为本次事件主题。
2. 事件优先：先想清楚当天出了什么具体的事、为什么得处理、最初以为是什么而后来发现了什么、玩家在哪个选择上能改变局面、最后什么有了可见变化；再用约见对象的经验、顾虑和说话方式改写他的反应与收尾。personal 为真时，在事件中安排一次能体现该角色真实在意什么的选择。
3. 历史避重与反套路：参考旅途记录与约见对象的 invitationMemory，保持文风与人物关系大体一致，但严禁模仿上文的故事推进结构，不重复过往事件的开场套路、起因、关键物件、冲突、解法或收尾（换标题或换地点仍算重复）。
4. 标题与开场散文：
- title：格式固定为「支援断章｜XXXX」（如「支援断章｜星灯下的修补针脚」），只点开场氛围与悬念，不剧透后续真相；每幕幕名同样简洁具体。
- prologue（必填，80～120 字全屏报幕开场序幕，纯散文自然分两段用 \n\n 隔开，**严禁包含【旁白】等任何 Gal 标记**）：只写开幕前夕的时辰光影、四周声响及受邀角色独处时的小动作，不概述全文大纲、不剧透后文冲突。
- premise（来意）、description（眼下发生的事）、hint（可留意的方向）：各写一句约 20 字的话。
- tasks：列出 1～3 项给玩家看的任务，每项用一句大白话说清要达成什么，允许多种做法。
5. 各幕演出与选项（stages）：
- intro（本幕开场 Gal 正文）：先用对白和动作演出场景，停在玩家可以介入的位置，不替玩家解谜或做决定。第一幕约 850～1150 字（若已写序幕散文，可紧接主角走近与对方反应展开，在等待玩家发言的一刻自然停住），中间每幕约 400～650 字；换地点时把理由写进前一幕，下一幕从抵达后写起。
- choices：提供两个各约 20 字的玩家回应，给出两种不同且实际可行的说法或行动（也可写成 {"label":"约20字回应","attr":"cha|wis|int|dex|str|con","dc":9} 以标注判定属性与难度）。最后一条玩家消息若有补充意图，将它融入可尝试的方向。
6. 收尾幕（finale）：包含标题、地点与约 850～1200 字的完整正文，让人物用对话和动作回扣开头，展示事情落定后的实际变化，能承接不同互动结果，不设置新任务。
7. 输出 JSON 字段（stages 示意一幕，实际写 3～5 幕）：{"title":"支援断章｜事件标题","prologue":"80～120字纯散文开场白","premise":"来意","stages":[{"title":"幕名","scene":"合法地点ID","description":"眼前情境","hint":"可以留意的方向","intro":"Gal正文","tasks":["玩家可见的任务"],"choices":["回应一","回应二"]}],"finale":{"title":"收尾幕名","scene":"合法地点ID","intro":"收尾Gal正文"}}`;
  const worldbookMessages = scanScenarioWorldbooks(
    { ...input, brief: invite.topic },
    countTokens,
    worldInfo,
  );
  const reactionInWorldbook = hasGalReactionGuidance(worldbookMessages);
  const ensembleInWorldbook = hasGalEnsembleGuidance(worldbookMessages);
  const sampling = presetSampling(preset);
  sampling.maxTokens = Math.max(8000, sampling.maxTokens ?? profile.maxTokens ?? 0);
  return finalizeRequest(
    {
      messages: [
        ...journeyContinuityMessage(input),
        {
          role: 'system',
          content: `你负责酒馆约见剧情。${placeRule}露天描写遵循timeOfDay指定的白天或夜晚；无窗室内用室内灯光。人物的invitationMemory是此人与玩家亲历的过去约见。protagonistId是玩家操控的人，不能把他写成第三个在场人物，也不能替他说话或行动。不写副本、不战斗，不凭空改变好感度。\n${galInstruction(input, 'script', { reactionInWorldbook, ensembleInWorldbook })}\n${instructions}\n只输出一组<wanxiang_output>与</wanxiang_output>标签，JSON置于标签内。`,
        },
        ...worldbookMessages,
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

export function invitationResponse(raw, invite) {
  const value = JSON.parse(extractGenerationEnvelope('script', raw).candidateText);
  const boundary = invitationCityBoundary(invite);
  return normalizeInvitationPlan(value, {
    requireChoices: true,
    ...(boundary ? { allowedScenes: boundary.allowedScenes, startScene: boundary.startScene } : {}),
  });
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
            '根据这次已结束的约见，为同一角色想四个下一次约见可以选的事件主题。每条严格控制在8～18个中文字的精炼行动或去向短句，干脆利落（禁止写成长段落，不预设玩家怎么应对）。unrelated与本次无关；weak恰好两项，各自从不同的旁支、场所或人物发散；strong直接承接本次的主要事件，点出接下来的新动静。四项互不重复。只在<wanxiang_output>标签内输出JSON，字段为{"unrelated":"主题","weak":["主题","主题"],"strong":"主题"}。',
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
  const destination = next?.name || (next && INVITATION_SCENES[next.scene]);
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
  const destination = next?.name || (next && INVITATION_SCENES[next.scene]);
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
