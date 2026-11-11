import { galInstruction } from '../gal-prompt.js';
import { TOWN_SIDE_PLACES } from '../../content/town-side-places.js';
import { presetSampling } from '../presets.js';
import {
  INVITATION_SCENES,
  INVITATION_PATCH_LIMIT,
  invitationActivityName,
  normalizeInvitationPlan,
} from '../../invitation.js';
import { extractGenerationEnvelope } from './output-envelope.js';
import { finalizeRequest } from './prompt-processing.js';
import { scanSpecialJourneyMemories } from '../journey-memory-worldbook.js';

const sideLocations = Object.entries(TOWN_SIDE_PLACES).map(([id, { parent, environment }]) => ({
  id,
  parent,
  environment,
}));

export function invitationRequest(input, preset, profile, countTokens) {
  const invite = input.invitation;
  if (
    !invitationActivityName(invite?.activity) ||
    !Array.isArray(input.party) ||
    input.party.length < 1 ||
    input.party.length > 2
  )
    throw Error('约见请求缺少人物或活动');
  const instructions = `一次写完一件从头到尾成立的 Gal 事件，含3～5幕互动和单独一幕收尾。「${invitationActivityName(invite.activity)}」只是两人见面的由头，不能用吃饭、走路、闲聊、展示爱好撑满整个事件。
先构思事件，再看人物卡。先想清楚：见面当天出了什么具体的事；为什么得处理；最初以为是什么、后来发现了什么；玩家在哪个选择上能改变局面；最后什么有了可见变化。即使换个约见对象，这件事仍应有开端、发展和结局。把这些体现在演出里，不输出构思或另附大纲。
从当地的人、规矩、消息、物件或当日变化里找起因。可以有悬念、意外、两难或喜剧，规模可以很小，也不必每次都是找失物或破案。开场尽早让意外发生；中间每幕带来新事实、新阻碍、立场变化或一次有分量的决定。每段闲话都要有当下的理由，不靠重复解释凑篇幅。
事件成立后，再用约见对象的经验、顾虑和说话方式改写他会先注意什么、会误会什么、怎样帮忙或反对、最后怎么收尾。角色特点会改变事件的走法；别从角色最显眼的爱好、职业、身世直接推出事件主线。personal为真时，让事件中有一次能体现这位角色真实在意什么的选择，同样遵循先构思事件的顺序。
参考已发送的旅途记录和约见对象的invitationMemory了解已经发生的事。不要重复其中的起因、关键物件、冲突、解法或收尾；同样的事换标题、换地点、换委托人仍算重复。可以简短提起往事，也可以写由旧事引出的一件新事；新事必须有独立起因和新结果。没有历史时也按事件优先。
title和每个幕名都给玩家看。用自然、具体的话给事件起名，比如“谁敲了停用的钟”“多出来的一桌客人”。标题贴着这一幕的人或事，少用抽象比喻和章回腔。
premise、description、hint各写一句约20个字的话，句意完整优先。premise讲来意，description讲眼下发生的事，hint提示可以留意的方向。tasks另列1～3项实际给玩家看的任务，每项用一句自然的话说清要达成什么，允许多种做法。比如“弄清那张告示为什么被换过”，保留答案让玩家自己试。
每幕的intro都是实际播放的正文。先用角色对白和动作演出场景，停在玩家可以介入的位置。本幕的任务留给玩家，开场不要替他解谜、确认答案或做决定。下一幕开头自然接过前一幕的话题或动作；换地点时，把非去那里不可的理由写进前一幕的情节，下一幕从抵达后发生的事写起。玩家自己走地图，中途经过的地方不必另写一幕。可以连续留在同一处。各幕开头只依赖确定发生的事，玩家没做过的事不要写成已经做了。第一幕约850～1150字，中间每幕约400～650字，篇幅随情节调整。
finale是最后一幕，包含要播放的标题、地点、完整正文。同地点直接播放；换地点要等玩家抵达。让人物用对话和动作回扣开头，展示事情落定后实际改变了什么，目标约850～1200字。具体尝试的成败已由互动时的对白表现，收尾能承接不同结果，不替玩家承诺、不宣布尚未达成的任务已完成。收尾不设置新任务。游戏播完后会显示“事件结束”，正文不用念这句话。
只使用以下JSON字段，stages示意一幕，实际写3～5幕：{"title":"事件标题","premise":"来意","stages":[{"title":"幕名","scene":"合法地点ID","description":"眼前情境","hint":"可以留意的方向","intro":"Gal正文","tasks":["玩家可见的任务"]}],"finale":{"title":"收尾幕名","scene":"合法地点ID","intro":"收尾Gal正文"}}`;
  const sampling = presetSampling(preset);
  sampling.maxTokens = Math.max(8000, sampling.maxTokens ?? profile.maxTokens ?? 0);
  return finalizeRequest(
    {
      messages: [
        {
          role: 'system',
          content: `你负责酒馆约见剧情。地点白名单：${JSON.stringify(INVITATION_SCENES)}。小地点从parent对应的街区进入：${JSON.stringify(sideLocations)}。露天描写遵循timeOfDay指定的白天或夜晚；无窗室内用室内灯光。人物的invitationMemory是此人与玩家亲历的过去约见。protagonistId是玩家操控的人，不能把他写成第三个在场人物，也不能替他说话或行动。不写副本、不战斗，不凭空改变好感度。\n${galInstruction(input, 'script')}\n${instructions}\n只输出一组<wanxiang_output>与</wanxiang_output>标签，JSON置于标签内。`,
        },
        ...scanSpecialJourneyMemories(input, countTokens),
        { role: 'user', content: JSON.stringify({ ...invite, characters: input.party }) },
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
  return normalizeInvitationPlan(value);
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
