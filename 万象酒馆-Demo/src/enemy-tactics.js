/** Decisions are pure, deterministic and frozen at the start of each planning round. */
export function tacticalDecision(state, id, definition) {
  const tactic = definition.tactic;
  if (!tactic) return null;
  const unit = state.units[id];
  const enraged = !!(
    definition.boss &&
    (unit.enraged || unit.hp <= unit.maxHp * definition.phaseThreshold)
  );
  const list = enraged ? definition.enragedIntents : definition.intents;
  const front = state.formation
    .slice(0, 3)
    .map((actor, slot) => ({ ...state.units[actor], slot }))
    .filter((entry) => entry.hp > 0);
  const allies = state.enemyIds.map((actor) => state.units[actor]).filter((entry) => entry.hp > 0);
  const score = (entry) => {
    if (tactic.target === 'wounded') return -entry.hp;
    if (tactic.target === 'shielded') return entry.block + (entry.buffs.iron || 0) * 4;
    if (tactic.target === 'charged') return entry.mp;
    if (tactic.target === 'unpoisoned') return -(entry.buffs.poison || 0);
    if (tactic.target === 'empowered')
      return ['strength', 'guard', 'iron', 'haste', 'regen'].reduce(
        (sum, key) => sum + (entry.buffs[key] || 0),
        0,
      );
    return -entry.block;
  };
  front.sort((a, b) => score(b) - score(a) || a.hp - b.hp || a.slot - b.slot);
  let slot = front[0]?.slot ?? 1;
  const round = Math.max(1, state.round);
  let index = (round - 1) % list.length;
  const injured = allies.some((entry) => entry.hp / entry.maxHp <= 0.6);
  switch (tactic.mode) {
    case 'survivor':
      index = unit.hp / unit.maxHp <= 0.45 && unit.block === 0 ? 1 : 0;
      break;
    case 'breaker':
      index = front[0] && front[0].block + (front[0].buffs.iron || 0) * 4 >= 6 ? 1 : 0;
      break;
    case 'medic':
      index = injured && round % 2 === 1 ? 1 : 0;
      break;
    case 'protector': {
      const lowest = [...allies].sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
      index = lowest && lowest.hp < lowest.maxHp && lowest.block < 4 && round % 2 === 1 ? 1 : 0;
      break;
    }
    case 'artillery':
      index = (round - 1) % 2;
      break;
    case 'duelist':
      index = round % 3 === 1 ? 0 : 1;
      break;
    case 'beast':
      index = front.length >= 2 ? 0 : 1;
      break;
    case 'judge': {
      const armor = (entry) => entry.block + (entry.buffs.iron || 0) * 4;
      const shielded = [...front].sort((a, b) => armor(b) - armor(a) || a.slot - b.slot)[0];
      index = shielded && armor(shielded) >= 8 ? 1 : 0;
      if (index === 1) slot = shielded.slot;
      break;
    }
    case 'core':
      index =
        round % 3 === 0 && allies.some((entry) => entry.hp / entry.maxHp < 0.5)
          ? 2
          : round % 3 === 1
            ? 0
            : 1;
      break;
  }
  const move = list[index];
  const slots = move.adjacent ? [slot, slot === 2 ? 1 : slot + 1] : move.slots || [slot];
  return { round: state.round, index, enraged, slot, slots };
}

export function lockEnemyDecisions(state, definitions) {
  state.enemyDecisions = Object.fromEntries(
    state.enemyIds.flatMap((id) => {
      const decision = tacticalDecision(state, id, definitions[id]);
      return decision ? [[id, decision]] : [];
    }),
  );
}
