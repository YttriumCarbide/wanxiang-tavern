import { DEFINITIONS } from '../../data.js';
import { normalizeOverlandStory, overlandPlan } from '../../overland-travel.js';
import { galInstruction } from '../gal-prompt.js';
import { extractGenerationEnvelope } from './output-envelope.js';
import { finalizeRequest } from './prompt-processing.js';
import { scanSpecialJourneyMemories } from '../journey-memory-worldbook.js';

export function overlandRequest(input, profile, countTokens) {
  const plan = overlandPlan(input.overland.from, input.overland.to);
  const party = Array.isArray(input.party) ? input.party.slice(0, 3) : [];
  const stages = plan.stages.map((stage) => ({
    ...stage,
    ...(stage.enemyIds
      ? { enemies: stage.enemyIds.map((id) => ({ id, name: DEFINITIONS[id].name })) }
      : {}),
  }));
  return finalizeRequest(
    {
      messages: [
        {
          role: 'system',
          content: `写一趟万象酒馆外出行程的 Gal 剧本。恰好写 ${stages.length} 幕，逐幕照抄程序给出的 id 与顺序。地点、路程、事件主题、选项动作和敌人由程序决定。只写眼前情景，不替玩家选择，不宣布战斗胜负，不发放奖励或改变行程规则。战斗幕写到开战前。事件幕写到玩家选择前，每个选项另写选择后的短正文。后续幕只依赖确定发生的情节。
${galInstruction(input, 'script')}
只输出一组<wanxiang_output>标签。JSON为{"acts":[{"id":"原幕ID","title":"标题","story":"正文"}]}。事件幕还必须提供choices，照抄输入的选项顺序及ID，每项为{"id":"原选项ID","label":"贴合指定动作的按钮文案","outcome":"选后正文"}。战斗幕只提供id、title、story。`,
        },
        ...scanSpecialJourneyMemories(
          {
            ...input,
            brief: stages.map((stage) => stage.to.name).join('、'),
          },
          countTokens,
        ),
        { role: 'user', content: JSON.stringify({ stages, party }) },
      ],
      transport: { format: 'tagged-json', tag: 'wanxiang_output' },
    },
    profile,
    countTokens,
    party.map((member) => member.name).filter(Boolean),
  );
}

export function overlandResponse(raw, input) {
  const plan = overlandPlan(input.overland.from, input.overland.to);
  const value = JSON.parse(extractGenerationEnvelope('script', raw).candidateText);
  return normalizeOverlandStory(value, plan);
}
