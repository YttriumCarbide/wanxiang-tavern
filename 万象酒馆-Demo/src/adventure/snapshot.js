import { normalizeAdventureDefinition, savedAdventureInput } from './definition.js';

/** New adventures resume only from coherent code-owned nodes, never half a combat animation. */
export function adventureSnapshot(session) {
  const expedition = session.journey?.expedition;
  if (
    !expedition?.adventure ||
    expedition.status !== 'active' ||
    !['battle', 'event'].includes(session.runtime.mode) ||
    session.battle.playing
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
    trip?.status !== 'active' ||
    book?.schemaVersion !== 5 ||
    !book.adventure ||
    !Array.isArray(book.adventure?.quest?.goals) ||
    !Array.isArray(book.adventure?.event?.choices) ||
    !state ||
    !state.event ||
    typeof state.event !== 'object' ||
    Array.isArray(state.event) ||
    state.version !== 1 ||
    !Number.isInteger(trip.index) ||
    trip.index < 0 ||
    trip.index > 4 ||
    !Array.isArray(book.story) ||
    book.story.length !== 5 ||
    !snapshot.state?.units ||
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
