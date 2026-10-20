export const STORY_ARC = Object.freeze(['起', '承1', '承2', '转1', '转2', '合']);
export const ARC_DIRECTION = Object.freeze({
  起: '确立明确的事件、目标与可采取的行动，真正开始解决问题。',
  承1: '沿已获得的线索行动，取得新结果，离开起点。',
  承2: '在承1的结果上进一步落实关键行动，抵达新的局势，禁止重复调查。',
  转1: '让重要变化或冲突实际发生，揭示会改变行动方向的具体事实。',
  转2: '面对变化作出选择、采取行动并承担结果，把主要问题推到解决前。',
  合: '兑现主要目标、解决本轮核心问题，并留下可行动的新起点；不能只说秘密以后揭晓。',
});
export function nextArcPhase(previous) {
  const phase =
    previous?.phase ||
    String(previous?.setting || '').match(/伏笔[：:]\s*(起|承[12]|转[12]|合)/)?.[1];
  const index = STORY_ARC.indexOf(phase);
  return STORY_ARC[(index + 1) % STORY_ARC.length];
}
export function arcFor(input) {
  const previous = [...(input.history || [])]
    .reverse()
    .find((record) => record.unresolvedHook?.phase || record.nextHook?.phase);
  const phase = STORY_ARC.includes(input.storyArc?.phase)
    ? input.storyArc.phase
    : nextArcPhase(previous?.unresolvedHook || previous?.nextHook);
  return {
    phase,
    direction: ARC_DIRECTION[phase],
    sequence: STORY_ARC,
    requirement:
      '本次正文按phase推进；nextHook同时输出phase与setting。setting以“伏笔：阶段”开头，明确下一步去哪里、找谁、做什么，不写谜语或重复等待。下次请求按阶段顺序推进，合之后开始新的起。',
  };
}
