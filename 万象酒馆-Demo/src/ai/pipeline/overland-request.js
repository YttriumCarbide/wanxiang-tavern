import { journeyContinuityMessage } from '../../memory.js';
import { DEFINITIONS } from '../../data.js';
import {
  normalizeOverlandItems,
  normalizeOverlandStory,
  normalizeOverlandTheater,
  overlandPlan,
} from '../../overland-travel.js';
import { galInstruction, hasGalEnsembleGuidance, hasGalReactionGuidance } from '../gal-prompt.js';
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
  const worldbookMessages = scanScenarioWorldbooks(
    { ...input, brief: stages.map((stage) => stage.to.name).join('、'), lootStages },
    countTokens,
    worldInfo,
  );
  const galOptions = {
    reactionInWorldbook: hasGalReactionGuidance(worldbookMessages),
    ensembleInWorldbook: hasGalEnsembleGuidance(worldbookMessages),
  };
  return finalizeRequest(
    {
      messages: [
        ...journeyContinuityMessage(input),
        {
          role: 'system',
          content: `【外出行程剧本与JSON结构要求】
1. 幕数与顺序：写一趟万象酒馆外出行程的 Gal 剧本，恰好写 ${stages.length} 幕，逐幕照抄程序给出的 id 与顺序（起点、终点、途经地见 stages）。
2. 拒绝流水账与套路复读：围绕沿途风貌、同行队友性格、世界观暗流与玩家意图构思真正有戏可演的旅途奇遇（奇人异事、同伴羁绊、突发危机、势力纠葛），保持文风与大体因果一致，但严禁模仿上文的故事结构或机械重复“男主赶路→小怪冒出来拦路”的套路，严禁写排队办手续、枯燥等待或纯看景打卡桥段。
3. 战斗幕与互动幕写法：
- 战斗幕（type 为 "battle"）：提供 id、title、story，并可附带可选 "battleLines":{"intro":"开战短台词（30字内）","defeat":"战毕短台词（30字内）"}；正文推进到开战前一刻，不宣布胜负或发放奖励。
- 互动幕（type 为 "event"）：正文停在正好需要玩家开口表态或出手应对的悬念处（后续由实时 AI RP 接续），绝不替玩家拍板或写出结果；另外提供 2～3 条不同方向的简短行动建议 "choices"（可写字符串或带检定标注的对象 {"label":"建议","attr":"str|dex|con|int|wis|cha","dc":9}，不写 outcome 结局）。
4. 首尾剧场段落（必填）与战利品：
- prologue（顶层，100～150 字全屏报幕开场序幕，纯散文自然分两段用 \n\n 隔开，**严禁包含【旁白】等 Gal 标记**）：只写出发时的天气、沿途远景与出门由头，不写成行程大纲，严禁剧透后半程伏笔、拦截对手身份或胜负结果。
- epilogueGal（顶层，200～350 字带标准 Gal 标记正文）：描写办完事后归途中的歇脚、分食或打趣互动。
- epilogueProse（顶层，80～120 字纯散文，**不含任何 Gal 标记**）：描写夕阳或晚风中返回酒馆的余韵。
- 战利品：若输入含 lootStages，为这些战斗幕设计可装备战利品并放入 items（每项含 stageId、name、description、value，以及平衡分布的可选 category:"weapon"|"armor"|"pendant"，绝不生成 gem；普通战斗可直接掉落实用制式武器/护甲/挂坠而不必硬写进台词，关键敌首可掉落对应信物/部位装备）。
${galInstruction(input, 'script', galOptions)}
只输出一组<wanxiang_output>标签，JSON结构为：{"prologue":"出发纯散文","acts":[{"id":"原幕ID","title":"标题","story":"正文"}],"epilogueGal":"归途Gal正文","epilogueProse":"返馆纯散文"}（battle 幕可附加 battleLines，event 幕附加 "choices":["建议一","建议二"]；若有战利品附加 items）。`,
        },
        ...worldbookMessages,
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

export function overlandTheaterResponse(raw) {
  const value = JSON.parse(extractGenerationEnvelope('script', raw).candidateText);
  return normalizeOverlandTheater(value);
}

export function overlandItemsResponse(raw, input) {
  const plan = overlandPlan(input.overland.from, input.overland.to, input.overland.discovery);
  const value = JSON.parse(extractGenerationEnvelope('script', raw).candidateText);
  return normalizeOverlandItems(value.items, plan);
}
