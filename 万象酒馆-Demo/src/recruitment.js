import { affectionRank, relationship } from './relationships.js';

export const GUEST_RECRUITMENT = Object.freeze({
  'official-libet': 'none',
  'official-lumi': 'low',
  'official-yuto-nakashi': 'medium',
});

export const RECRUITMENT_DIFFICULTY = Object.freeze({ low: '低', medium: '中', high: '高' });

export function recruitmentStatus(library, id) {
  if (
    !Object.hasOwn(GUEST_RECRUITMENT, id) ||
    library.characters.some((member) => member.id === id)
  )
    return null;
  const tavern = library.daily.rank || 0;
  const affection = affectionRank(relationship(library, id).affection).level;
  return {
    tavern,
    affection,
    ready: tavern >= 2 && affection >= 2,
    difficulty: GUEST_RECRUITMENT[id],
  };
}

export function recruitmentPassed(run, difficulty) {
  if (difficulty === 'none') return true;
  const required = { low: 2, medium: 3, high: 4 }[difficulty];
  if (!run?.plan || !required) return false;
  const averages = run.plan.stages.map(({ id }) => {
    const scores = run.turns.filter((turn) => turn.stageId === id).map((turn) => turn.score);
    return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
  });
  return (
    averages.length > 0 &&
    averages.every((score) => score !== null) &&
    averages.reduce((sum, score) => sum + score, 0) / averages.length >= required
  );
}
