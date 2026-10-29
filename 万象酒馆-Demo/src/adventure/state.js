import { bossLines, linesProse, applyBossPatches } from './patches.js';
import { claimBattleRewards } from '../rewards.js';

export function createAdventureState(book) {
  const lines = bossLines(book.story[4]);
  return {
    version: 1,
    event: { choiceId: null, supplement: '', resolved: false, rewardClaimed: false },
    goals: Object.fromEntries(
      book.adventure.quest.goals.map((goal) => [goal.id, { status: 'pending', evidence: '' }]),
    ),
    boss: { original: structuredClone(lines), lines, revision: 0, patches: [], locked: false },
    responses: [],
    drafts: {},
    history: [],
    readyPrompted: false,
    questRewardClaimed: false,
  };
}

export function adventureReady(definition, state) {
  return definition.quest.goals
    .filter((goal) => goal.required)
    .every((goal) => state.goals[goal.id]?.status === 'completed');
}

export function confirmEventChoice(definition, state, choiceId, supplement = '') {
  const choice = definition.event.choices.find((item) => item.id === choiceId);
  if (!choice) throw Error('请先选择一个事件选项');
  if (state.event.resolved) throw Error('本事件已经结算');
  if (state.event.choiceId && state.event.choiceId !== choiceId)
    throw Error('已经确认的选项不可更改');
  if (typeof supplement !== 'string' || supplement.length > 10000) throw Error('补充内容过长');
  Object.assign(state.event, { choiceId, supplement });
  return choice;
}

export function validateTaskReply(value, context) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.episodeId !== context.episodeId ||
    !Number.isInteger(value.revision) ||
    value.revision < 0 ||
    !Array.isArray(value.tasks) ||
    value.tasks.length > 6 ||
    Object.keys(value).some((key) => !['episodeId', 'revision', 'tasks', 'patches'].includes(key))
  )
    throw Error('任务结果的副本ID、版本或数据格式不符；已确认进度保留');
  const ids = new Set();
  for (const task of value.tasks) {
    const goal = context.goals.find((item) => item.id === task.id);
    if (
      !goal ||
      ids.has(task.id) ||
      !['pending', 'completed', 'failed'].includes(task.status) ||
      (goal.required && task.status === 'failed') ||
      typeof task.evidence !== 'string' ||
      task.evidence.length > 500 ||
      (task.status === 'completed' && !task.evidence.trim()) ||
      Object.keys(task).some((key) => !['id', 'status', 'evidence'].includes(key))
    )
      throw Error('任务ID、状态或完成依据无效；已确认进度保留');
    ids.add(task.id);
  }
  return structuredClone(value);
}

/** Accept one response once, then use the existing code-owned reward ledger. */
export function acceptAdventureReply(library, expedition, book, turn, reply, responseId) {
  const state = expedition.adventure;
  if (!state || state.responses.includes(responseId)) return { duplicate: true, warnings: [] };
  if (turn.node !== expedition.index || turn.episodeId !== expedition.id || state.boss.locked)
    throw Error('场景已切换，忽略这次回应');
  if (typeof reply.content !== 'string' || !reply.content.trim()) throw Error('事件回应为空');
  const warnings = [];
  if (turn.mode === 'quest' && turn.boss.revision !== state.boss.revision)
    throw Error('当前剧情已更新，请基于最新进度重试');
  if (turn.mode === 'event') {
    const choice = book.adventure.event.choices.find((item) => item.id === state.event.choiceId);
    if (!choice || turn.choice?.id !== choice.id) throw Error('事件选项已变化');
    if (!state.event.resolved) {
      claimBattleRewards(library, `${expedition.id}:event-2`, choice.reward);
      state.event.rewardClaimed = true;
      state.event.resolved = true;
    }
  } else if (turn.mode === 'quest') {
    const result = validateTaskReply(reply.adventure, turn);
    for (const task of result.tasks) {
      if (state.goals[task.id].status === 'completed') continue;
      state.goals[task.id] = { status: task.status, evidence: task.evidence };
    }
    if (adventureReady(book.adventure, state)) {
      warnings.push(
        ...applyBossPatches(state.boss, result.patches ?? [], result.revision, responseId),
      );
      book.story[4] = linesProse(state.boss.lines);
      if (book.display?.story) book.display.story[4] = book.story[4];
    } else if (result.patches?.length) warnings.push('主要目标尚未完成，未应用Boss剧情补丁');
  }
  state.responses.push(responseId);
  state.history.push(
    {
      id: responseId,
      node: expedition.index,
      role: 'user',
      content: turn.playerText || turn.choice?.label || '',
    },
    {
      id: `${responseId}-reply`,
      node: expedition.index,
      role: 'assistant',
      content: reply.content,
    },
  );
  return { duplicate: false, warnings };
}

export function adventureTurnContext(expedition, book, playerText = '') {
  const state = expedition.adventure;
  if (!state || ![1, 3].includes(expedition.index)) return null;
  const event = book.adventure.event;
  const choice = event.choices.find((item) => item.id === state.event.choiceId);
  return {
    mode: expedition.index === 1 ? (state.event.resolved ? 'event-chat' : 'event') : 'quest',
    episodeId: expedition.id,
    node: expedition.index,
    playerText,
    event,
    choice: choice || null,
    goals: book.adventure.quest.goals.map((goal) => ({ ...goal, ...state.goals[goal.id] })),
    scene: book.adventure.quest,
    boss: { revision: state.boss.revision, lines: structuredClone(state.boss.lines) },
    fullScript: book.story.map((text, index) => ({
      node: index + 1,
      temporal:
        index < expedition.index
          ? '已发生'
          : index === expedition.index
            ? '当前'
            : '未来预定，仅供衔接，禁止剧透',
      text,
    })),
    history: structuredClone(state.history),
    npcs: (book.npcs || []).map((npc) => ({
      name: npc.name,
      appearance: npc.appearance,
      history: npc.history,
      setting: npc.setting,
      temporal:
        (npc.encounter ?? 0) <= expedition.index
          ? '已到达的节点人物资料'
          : '未来预定人物，只供衔接禁止剧透',
    })),
  };
}

export function lockBoss(expedition, book) {
  if (!adventureReady(book.adventure, expedition.adventure)) throw Error('主要目标尚未完成');
  expedition.adventure.boss.locked = true;
  if (!expedition.adventure.questRewardClaimed) return true;
  return false;
}
