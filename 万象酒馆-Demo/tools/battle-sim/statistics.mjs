function countBy(values) {
  const counts = new Map();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
}

function rate(count, total) {
  return total > 0 ? count / total : null;
}

function mean(values) {
  if (!values.length) return null;
  const average = values.reduce((sum, value) => sum + value / values.length, 0);
  return Number.isFinite(average) ? average : null;
}

function nearestRank(sorted, percentile) {
  return sorted[Math.ceil(sorted.length * percentile) - 1] ?? null;
}

function wilsonInterval95(successes, attempts) {
  if (!attempts) return null;
  const p = successes / attempts;
  const z = 1.959963984540054;
  const zSquared = z * z;
  const scale = 1 + zSquared / attempts;
  const center = (p + zSquared / (2 * attempts)) / scale;
  const margin = (z * Math.sqrt((p * (1 - p) + zSquared / (4 * attempts)) / attempts)) / scale;
  return [
    successes ? Math.max(0, center - margin) : 0,
    successes === attempts ? 1 : Math.min(1, center + margin),
  ];
}

function resourceRatio(value, maximum) {
  if (!Number.isFinite(value) || !Number.isFinite(maximum) || maximum <= 0) return null;
  const ratio = value / maximum;
  return Number.isFinite(ratio) ? ratio : null;
}

function hpSpendRatio({ before, after }) {
  if (!Number.isFinite(before?.hp) || !Number.isFinite(after?.hp)) return null;
  return resourceRatio(before.hp - after.hp, before.maxHp);
}

function sufferedCasualties({ before, after }) {
  if (!Number.isFinite(before?.alive) || !Number.isFinite(after?.alive)) return null;
  if (Number.isFinite(before.partySize) && Number.isFinite(after.partySize)) {
    if (before.partySize !== after.partySize) return null;
  }
  return before.alive > after.alive;
}

function exhausted({ after }) {
  const ratio = resourceRatio(after?.mp, after?.maxMp);
  if (ratio === null || !Number.isFinite(after?.supplies)) return null;
  return ratio <= 0.1 && after.supplies === 0;
}

function observations(samples, select) {
  return samples.map(select).filter((value) => value !== null);
}

function countTrue(values) {
  return values.filter((value) => value === true).length;
}

function hasRounds({ rounds }) {
  return Number.isInteger(rounds) && rounds >= 0;
}

export function summarizeNode(samples) {
  const attempts = samples.length;
  const outcomes = countBy(samples.map(({ outcome }) => outcome).sort());
  const successes = (outcomes.victory ?? 0) + (outcomes.complete ?? 0);
  const defeats = outcomes.defeat ?? 0;
  const rounds = samples
    .filter(hasRounds)
    .map((sample) => sample.rounds)
    .sort((a, b) => a - b);
  const spending = observations(samples, hpSpendRatio);
  const casualties = observations(samples, sufferedCasualties);
  const endingHp = observations(samples, ({ after }) => resourceRatio(after?.hp, after?.maxHp));
  const endingMp = observations(samples, ({ after }) => resourceRatio(after?.mp, after?.maxMp));
  const exhaustion = observations(samples, exhausted);
  const victories = samples.filter(({ outcome }) => outcome === 'victory');
  const timedWins = victories.filter(hasRounds);
  const bossWins = victories.filter(({ enteredBoss }) => enteredBoss === true);
  const timedBossWins = bossWins.filter(hasRounds);
  const bossActionObservations = bossWins.filter(({ bossActed }) => typeof bossActed === 'boolean');
  const bossMechanicObservations = bossWins.filter(
    ({ bossMechanicSeen }) => typeof bossMechanicSeen === 'boolean',
  );

  return {
    attempts,
    successes,
    defeats,
    outcomes,
    winRate: rate(successes, attempts),
    winInterval95: wilsonInterval95(successes, attempts),
    meanRounds: mean(rounds),
    roundsHistogram: countBy(rounds),
    p50Rounds: nearestRank(rounds, 0.5),
    p90Rounds: nearestRank(rounds, 0.9),
    meanHpSpendRatio: mean(spending),
    casualtyRate: rate(countTrue(casualties), casualties.length),
    lowHpRate: rate(endingHp.filter((value) => value <= 0.25).length, endingHp.length),
    exhaustedRate: rate(countTrue(exhaustion), exhaustion.length),
    meanEndingHpRatio: mean(endingHp),
    meanEndingMpRatio: mean(endingMp),
    oneRoundWins: timedWins.filter(({ rounds }) => rounds === 1).length,
    oneRoundBossWins: timedBossWins.filter(({ rounds }) => rounds === 1).length,
    bossWinsWithoutAction: bossActionObservations.filter(({ bossActed }) => !bossActed).length,
    bossWinsWithoutMechanic: bossMechanicObservations.filter(
      ({ bossMechanicSeen }) => !bossMechanicSeen,
    ).length,
    denominators: {
      winRate: attempts,
      rounds: rounds.length,
      meanHpSpendRatio: spending.length,
      casualtyRate: casualties.length,
      lowHpRate: endingHp.length,
      exhaustedRate: exhaustion.length,
      meanEndingHpRatio: endingHp.length,
      meanEndingMpRatio: endingMp.length,
      oneRoundWins: timedWins.length,
      oneRoundBossWins: timedBossWins.length,
      bossWinsWithoutAction: bossActionObservations.length,
      bossWinsWithoutMechanic: bossMechanicObservations.length,
    },
  };
}
