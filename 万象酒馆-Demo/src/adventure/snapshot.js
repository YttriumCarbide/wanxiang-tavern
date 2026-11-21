import { normalizeAdventureDefinition, savedAdventureInput } from './definition.js';
import { validEventReward } from './rewards.js';
import { FINAL_ENCOUNTER } from '../content/journey-rules.js';

export function adventureResumeStage(trip, battle) {
  if (!trip?.adventure || ![0, 1, 2, 3, FINAL_ENCOUNTER].includes(trip.index)) return null;
  if (!Number.isInteger(battle?.encounter)) return null;
  const { index, pendingResult, status } = trip;
  const { encounter, phase } = battle;
  const won = phase === 'victory';
  const terminal = won || phase === 'defeat';
  if (pendingResult) {
    if (
      !terminal ||
      pendingResult.encounter !== encounter ||
      pendingResult.won !== won ||
      ![0, 2, FINAL_ENCOUNTER].includes(encounter)
    )
      return null;
    if (status === 'complete')
      return won && encounter === FINAL_ENCOUNTER && index === encounter ? 'settlement' : null;
    return status === 'active' && index === encounter + (won ? 1 : 0) ? 'settlement' : null;
  }
  if (status !== 'active') return null;
  if ([1, 3].includes(index)) {
    if (won && encounter === index - 1) return 'event';
    // Older fixtures can start directly at an RP node without a preceding result.
    return phase === 'opening' && !trip.records?.length && encounter >= 0 && encounter < index
      ? 'event'
      : null;
  }
  if (index !== encounter) return null;
  if (terminal) return 'settlement';
  return ['opening', 'plan'].includes(phase) ? 'battle' : null;
}

/** New adventures resume only from coherent code-owned nodes, never half a combat animation. */
export function adventureSnapshot(session) {
  const expedition = session.journey?.expedition;
  if (
    !expedition?.adventure ||
    (!['battle', 'event'].includes(session.runtime.mode) &&
      !(session.runtime.mode === 'loading' && session.runtime.adventureCheckpointLoading)) ||
    session.battle.playing ||
    !adventureResumeStage(expedition, session.battle.state)
  )
    return null;
  return structuredClone({
    version: 2,
    state: session.battle.state,
    plan: session.battle.plan,
    history: session.battle.history,
    journey: session.journey,
    activeScript: session.ai.activeScript,
    storyView: session.ai.storyView,
    quick: session.ai.chat.quick,
  });
}

export function validAdventureSnapshot(snapshot) {
  try {
    return checkAdventureSnapshot(snapshot);
  } catch {
    return false;
  }
}

function checkAdventureSnapshot(snapshot) {
  const trip = snapshot?.journey?.expedition;
  const book = snapshot?.activeScript;
  const state = trip?.adventure;
  if (
    snapshot?.version !== 2 ||
    !adventureResumeStage(trip, snapshot?.state) ||
    book?.schemaVersion !== 5 ||
    !book.adventure ||
    !Array.isArray(book.adventure?.quest?.goals) ||
    !Array.isArray(book.adventure?.event?.choices) ||
    !state ||
    !state.event ||
    typeof state.event !== 'object' ||
    Array.isArray(state.event) ||
    state.version !== 1 ||
    !Array.isArray(book.story) ||
    book.story.length !== 5 ||
    !snapshot.state?.units ||
    !Array.isArray(snapshot.state.enemyIds) ||
    snapshot.state.enemyIds.some(
      (id) => typeof id !== 'string' || !Object.hasOwn(snapshot.state.units, id),
    ) ||
    !Array.isArray(snapshot.state.formation) ||
    !Array.isArray(state.responses) ||
    !Array.isArray(state.history) ||
    !Array.isArray(state.boss?.lines) ||
    !state.boss.lines.length ||
    !Number.isInteger(state.boss.revision) ||
    !Array.isArray(state.boss.patches) ||
    new Set(state.boss.lines.map((line) => line.id)).size !== state.boss.lines.length
  )
    return false;
  const definition = normalizeAdventureDefinition(savedAdventureInput(book.adventure));
  if (state.event.reward !== undefined && !validEventReward(state.event.reward)) return false;
  if (
    book.adventure.event.choices.some(
      (choice, index) => choice.id !== definition.event.choices[index].id,
    ) ||
    book.adventure.quest.goals.some((goal, index) => goal.id !== definition.quest.goals[index].id)
  )
    return false;
  if (
    state.boss.lines.some(
      (line) =>
        typeof line.id !== 'string' ||
        typeof line.text !== 'string' ||
        typeof line.speaker !== 'string',
    )
  )
    return false;
  if (
    book.adventure.quest.goals.some(
      (goal) => !['pending', 'completed', 'failed'].includes(state.goals?.[goal.id]?.status),
    )
  )
    return false;
  if (
    state.event.choiceId &&
    !book.adventure.event.choices.some((choice) => choice.id === state.event.choiceId)
  )
    return false;
  return true;
}
