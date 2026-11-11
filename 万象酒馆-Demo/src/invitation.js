import { INVITATION_ACTIVITIES, TOWN_SCENES } from './daily.js';
import { parseGalText } from './gal.js';
import { applyDialoguePatches, galSceneLines, linesProse } from './adventure/patches.js';

export const INVITATION_SCENES = Object.freeze({ tavern: '酒馆', ...TOWN_SCENES });
export const RECRUIT_TRUST = 60;
export const PERSONAL_EVENT_TRUST = 20;
export const INVITATION_PATCH_LIMIT = 3;

function boundedText(value, max, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw Error(`${field}格式不正确`);
  return value.trim();
}

export function invitationExcerpt(source, limit = 150) {
  const lines = parseGalText(source)
    .map((beat) => beat.text)
    .filter(Boolean);
  const text = lines.join(' ').replace(/\s+/g, ' ');
  return text.length > limit ? text.slice(0, limit - 1) + '…' : text;
}

function invitationScene(raw) {
  if (!Object.hasOwn(INVITATION_SCENES, raw?.scene)) throw Error('约见地点不可达');
  return {
    title: boundedText(raw.title, 65, '幕名'),
    scene: raw.scene,
    intro: boundedText(raw.intro, Infinity, '本幕演出正文'),
  };
}

export function normalizeInvitationPlan(raw) {
  if (!Array.isArray(raw?.stages) || raw.stages.length < 3 || raw.stages.length > 5)
    throw Error('约见需要 3～5 幕互动和一幕收尾');
  return {
    title: boundedText(raw.title, 70, '约见标题'),
    premise: boundedText(raw.premise, Infinity, '事件缘由'),
    stages: raw.stages.map((stage, index) => {
      const scene = invitationScene(stage);
      if (!Array.isArray(stage.tasks) || !stage.tasks.length || stage.tasks.length > 3)
        throw Error('每幕需要1～3项任务');
      return {
        ...scene,
        id: `stage-${index + 1}`,
        ...(typeof stage.description === 'string' ? { description: stage.description.trim() } : {}),
        ...(typeof stage.hint === 'string' ? { hint: stage.hint.trim() } : {}),
        minTurns: 1,
        maxTurns: 4,
        goals: stage.tasks.map((task, i) => ({
          id: `goal-${i + 1}`,
          description: boundedText(task, 180, '本幕任务'),
        })),
      };
    }),
    finale: invitationScene(raw.finale),
  };
}

export function invitationBrief(run) {
  const { plan, unread } = run;
  const stage = plan.stages[run.index];
  const interacting = !run.destination && (!unread || unread.type === 'reply');
  const done = new Set(
    run.turns.filter((turn) => turn.stageId === stage.id).flatMap((turn) => turn.completed),
  );
  const current = (interacting && stage.hint) || stage.description;
  return {
    overall: invitationExcerpt(plan.premise || plan.title, Infinity),
    current: run.destination
      ? ''
      : unread?.type === 'finale'
        ? plan.finale.title
        : current
          ? invitationExcerpt(current, Infinity)
          : invitationExcerpt(invitationSceneProse(run, stage), 40),
    tasks: interacting
      ? stage.goals.map((goal) => ({ text: goal.description, done: done.has(goal.id) }))
      : [],
  };
}

export function invitationSceneProse(run, scene) {
  const draft = run.sceneEdits?.[scene.id || 'finale'];
  return draft ? linesProse(draft.lines) : scene.intro;
}

export function invitationNextScene(run) {
  if (run.unread) return null;
  const scene = run.plan.stages[run.index + 1] || run.plan.finale;
  if (!scene) return null;
  const id = scene.id || 'finale';
  const draft = run.sceneEdits?.[id];
  return {
    id,
    title: scene.title,
    scene: scene.scene,
    revision: draft?.revision ?? 0,
    lines: draft?.lines ?? galSceneLines(scene.intro, id),
  };
}

function invitationPatchMatches(raw, next) {
  return (
    next &&
    raw.nextSceneId === next.id &&
    raw.revision === next.revision &&
    Array.isArray(raw.patches) &&
    raw.patches.length > 0 &&
    raw.patches.length <= INVITATION_PATCH_LIMIT
  );
}

export function applyInvitationPatches(run, reply, actors, protagonistId) {
  if (reply.stageId !== run.plan.stages[run.index].id || !reply.patches?.length) return;
  const next = invitationNextScene(run);
  if (!invitationPatchMatches(reply, next)) return;
  const speakers = new Set([
    '旁白',
    ...next.lines.map((line) => line.speaker),
    ...actors.map(({ id }) => id),
  ]);
  const playerName = actors.find(({ id }) => id === protagonistId)?.name;
  for (const name of [protagonistId, playerName, 'user', '玩家']) speakers.delete(name);
  const patches = reply.patches.filter((patch) => {
    if (!patch || typeof patch.speaker !== 'string' || !speakers.has(patch.speaker.trim()))
      return false;
    if (
      typeof patch.text !== 'string' ||
      /[<>]|【(?:旁白|清场)】|【(?:对白|登场|退场)[:：]/u.test(patch.text)
    )
      return false;
    return (
      patch.op !== 'replace' ||
      next.lines.find((line) => line.id === patch.id)?.speaker === patch.speaker.trim()
    );
  });
  const draft = run.sceneEdits?.[next.id] || {
    lines: next.lines,
    revision: next.revision,
    patches: [],
  };
  applyDialoguePatches(draft, patches, reply.revision, run.turns.length + 1, next.id);
  if (draft.revision !== next.revision) (run.sceneEdits ||= {})[next.id] = draft;
}

export function normalizeInvitationTurn(raw, request) {
  if (
    raw?.stageId !== request.stageId ||
    !Number.isInteger(raw.score) ||
    raw.score < 0 ||
    raw.score > 5 ||
    !Array.isArray(raw.completed) ||
    raw.completed.length > 3 ||
    raw.completed.some((id) => !request.goals.some((goal) => goal.id === id))
  )
    throw Error('约见评分或目标数据无效，已确认进度保留');
  return {
    stageId: raw.stageId,
    score: raw.score,
    completed: [...new Set(raw.completed)],
    ...(typeof raw.note === 'string' && raw.note.trim()
      ? { note: boundedText(raw.note, 220, '本轮经过') }
      : {}),
    ...(invitationPatchMatches(raw, request.nextScene)
      ? { nextSceneId: raw.nextSceneId, revision: raw.revision, patches: raw.patches }
      : {}),
  };
}

export function invitationRecord(run, state = 'ongoing') {
  const { plan } = run;
  const stages = plan.stages.slice(0, run.index + 1).flatMap((stage, index) => {
    const notes = run.notes?.[stage.id];
    if (!notes && index === run.index && run.unread?.type === 'intro') return [];
    const turns = run.turns.filter((turn) => turn.stageId === stage.id);
    const done = new Set(turns.flatMap((turn) => turn.completed));
    return [
      {
        title: stage.title || `第 ${index + 1} 幕`,
        scene: notes?.scene || (index === run.index ? run.scene : stage.scene),
        summary:
          notes?.recap ||
          turns.at(-1)?.note ||
          invitationExcerpt(notes?.opening || invitationSceneProse(run, stage)),
        goals: stage.goals.filter((goal) => done.has(goal.id)).map((goal) => goal.description),
        turns: turns.length,
      },
    ];
  });
  return {
    title: plan.title,
    premise: plan.premise || '',
    state,
    stages,
  };
}

export function invitationTranscript(run) {
  if (Array.isArray(run.played)) return run.played;
  // Earlier saves kept the replies and short recaps, but not the original transition text.
  const played = [];
  const turns = run.unread?.type === 'reply' ? run.turns.slice(0, -1) : run.turns;
  let cursor = 0;
  for (const stage of run.plan.stages.slice(0, run.index + 1)) {
    const notes = run.notes?.[stage.id];
    if (notes?.opening) played.push(stage.intro);
    for (const turn of turns) {
      if (turn.stageId !== stage.id) continue;
      const player = run.history?.[cursor++];
      const reply = run.history?.[cursor++];
      if (player && reply) played.push(`玩家：${player.content}\n\n${reply.content}`);
    }
    if (notes?.recap) played.push(`转场记录：${notes.recap}`);
  }
  return played;
}

export function invitationAdvance(run) {
  const stage = run.plan.stages[run.index];
  const turns = run.turns.filter((turn) => turn.stageId === stage.id);
  const done = new Set(turns.flatMap((turn) => turn.completed));
  return (
    turns.length >= stage.maxTurns ||
    (turns.length >= stage.minTurns && stage.goals.every((goal) => done.has(goal.id)))
  );
}

export function invitationTrust(run) {
  const turns = run.turns;
  const evidence = new Set(
    turns.flatMap((turn) => turn.completed.map((id) => `${turn.stageId}:${id}`)),
  );
  return Math.min(
    18,
    Math.floor(turns.reduce((total, turn) => total + turn.score, 0) / 3) + evidence.size,
  );
}

export function invitationActivityName(id) {
  return INVITATION_ACTIVITIES[id] || '';
}
