import { journeyContinuityMessage } from '../../memory.js';
import { DEFINITIONS } from '../../data.js';
import {
  normalizeOverlandItems,
  normalizeOverlandStory,
  overlandPlan,
} from '../../overland-travel.js';
import { galInstruction } from '../gal-prompt.js';
import { extractGenerationEnvelope } from './output-envelope.js';
import { finalizeRequest } from './prompt-processing.js';
import { scanScenarioWorldbooks } from '../journey-memory-worldbook.js';
import { playerIntentMessages } from './player-intent.js';
import { buildSubScriptRequest } from './script-preset.js';

export const OVERLAND_BATTLE_LOOT_CHANCE = 0.6;

/** Roll which overland battle stages spawn pre-generated equippable loot (~60% per battle). */
export function rollOverlandLootStages(stages, rng = Math.random) {
  return (stages || [])
    .filter((stage) => stage.type === 'battle' && rng() < OVERLAND_BATTLE_LOOT_CHANCE)
    .map((stage) => stage.id);
}

function overlandStages(input) {
  const plan = overlandPlan(input.overland.from, input.overland.to, input.overland.discovery);
  const party = Array.isArray(input.party) ? input.party.slice(0, 3) : [];
  const stages = plan.stages.map((stage) => ({
    ...stage,
    ...(stage.enemyIds
      ? { enemies: stage.enemyIds.map((id) => ({ id, name: DEFINITIONS[id].name })) }
      : {}),
  }));
  const lootStages = Array.isArray(input.overland.lootStages)
    ? input.overland.lootStages.filter((id) =>
        stages.some((s) => s.id === id && s.type === 'battle'),
      )
    : Array.isArray(input.lootStages)
      ? input.lootStages.filter((id) => stages.some((s) => s.id === id && s.type === 'battle'))
      : rollOverlandLootStages(stages);
  return { plan, party, stages, lootStages };
}

export async function buildOverlandRequest(input, preset, profile, countTokens, options = {}) {
  const { party, stages, lootStages } = overlandStages(input);
  const acts = stages.map((stage, index) => ({
    index,
    id: stage.id,
    type: stage.type === 'battle' ? 'battle' : 'choice',
  }));
  const brief = stages.map((stage) => stage.to.name).join('、');
  return buildSubScriptRequest({
    input: { ...input, party, lootStages },
    scanInput: { ...input, party, brief, lootStages },
    requiredRule: 'script-overland',
    preset,
    profile,
    countTokens,
    worldInfo: options.worldInfo,
    regexScripts: options.regexScripts,
    runRegexTasks: options.runRegexTasks,
    presetProcessing: options.presetProcessing,
    taskLabel: '外出行程剧本',
    brief,
    userPayload: {
      route: { from: input.overland.from, to: input.overland.to },
      acts,
      stages,
      party,
      ...(lootStages.length ? { lootStages } : {}),
    },
  });
}

export function overlandRequest(input, profile, countTokens, worldInfo) {
  const { party, stages, lootStages } = overlandStages(input);
  return finalizeRequest(
    {
      messages: [
        ...journeyContinuityMessage(input),
        {
          role: 'system',
          content: `【外出行程剧本与JSON结构要求】
1. 幕数与顺序：写一趟万象酒馆外出行程的 Gal 剧本，恰好写 ${stages.length} 幕，逐幕照抄程序给出的 id 与顺序。地点、路程、事件主题、选项动作和敌人均由程序给定。
2. 战斗幕与事件幕写法：
- 战斗幕：只提供 id、title、story，正文推进到开战前一刻，不宣布胜负或发放奖励。
- 事件幕：正文写到玩家做选择前；另外必须提供 choices，照抄输入选项的顺序及 id，每项为 {"id":"原选项ID","label":"贴合指定动作的按钮文案","outcome":"选后短正文"}。
3. 玩家意图与战利品：若输入含 lootStages，为这些战斗幕设计可装备战利品并放入 items（每项含 stageId、name、description、value，无数值）。
${galInstruction(input, 'script')}
只输出一组<wanxiang_output>标签，JSON结构为：{"acts":[{"id":"原幕ID","title":"标题","story":"正文"}]}（事件幕附加 choices；若有战利品附加 items）。`,
        },
        ...scanScenarioWorldbooks(
          {
            ...input,
            brief: stages.map((stage) => stage.to.name).join('、'),
            lootStages,
          },
          countTokens,
          worldInfo,
        ),
        {
          role: 'user',
          content: JSON.stringify({
            stages,
            party,
            ...(lootStages.length ? { lootStages } : {}),
          }),
        },
        ...playerIntentMessages(input.playerIntent),
      ],
      transport: { format: 'tagged-json', tag: 'wanxiang_output' },
    },
    profile,
    countTokens,
    party.map((member) => member.name).filter(Boolean),
  );
}

export function overlandResponse(raw, input) {
  const plan = overlandPlan(input.overland.from, input.overland.to, input.overland.discovery);
  const value = JSON.parse(extractGenerationEnvelope('script', raw).candidateText);
  return normalizeOverlandStory(value, plan);
}

export function overlandItemsResponse(raw, input) {
  const plan = overlandPlan(input.overland.from, input.overland.to, input.overland.discovery);
  const value = JSON.parse(extractGenerationEnvelope('script', raw).candidateText);
  return normalizeOverlandItems(value.items, plan);
}
