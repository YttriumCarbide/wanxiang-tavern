import { overlordTargetStage } from './overlord-mechanics.js';

/** Authored machine phase rules shared by intention, timeline and the sole simulation. */
export function nextBossStage(state, id, definition) {
  const unit = state.units[id];
  if (!definition?.boss || definition.phaseMode === 'cycle' || !unit?.hp) return 0;
  if (Array.isArray(definition.overlordPhases) && definition.overlordPhases.length >= 2) {
    const target = overlordTargetStage(unit, definition);
    return target > (unit.bossStage || 1) ? target : 0;
  }
  if (unit.enraged) return 0;
  const threshold = unit.maxHp * (definition.phaseThreshold || 0.5);
  if (definition.tactic?.mode === 'ares' ? unit.hp < threshold : unit.hp <= threshold) return 2;
  if (
    definition.tactic?.mode === 'ares' &&
    ['aresCannonLeft', 'aresCannonRight'].every(
      (cannon) => state.units[cannon] && state.units[cannon].hp <= 0,
    )
  )
    return 2;
  return 0;
}

export function shouldEnrage(state, id, definition) {
  return nextBossStage(state, id, definition) > 0;
}
export function aresDecision(state, id, definition) {
  const unit = state.units[id];
  const enraged = unit.enraged || shouldEnrage(state, id, definition);
  const index = enraged
    ? Math.max(0, Math.max(1, state.round) - (unit.phaseStartRound || Math.max(1, state.round))) % 5
    : (Math.max(1, state.round) - 1) % 4;
  const actual = !enraged && index === 3 && (unit.buffs.iron || 0) < 2 ? 0 : index;
  const move = (enraged ? definition.enragedIntents : definition.intents)[actual];
  const effects = structuredClone(move.effects);
  if (!enraged && index === 1) {
    effects.splice(
      0,
      effects.length,
      { type: 'damage', value: 13, targetSlots: [1] },
      { type: 'damage', value: 6, targetSlots: [0, 2] },
    );
  }
  if (enraged && index === 2) {
    effects.splice(
      0,
      effects.length,
      ...[0, 1, 2].flatMap((slot) => [
        { type: 'damage', value: (slot + 1) * 3, targetSlots: [slot] },
        { type: 'buff', buff: 'bleed', value: 3 - slot, targetSlots: [slot] },
      ]),
    );
  }
  if (enraged && index === 3) effects.length = 0;
  const front = state.formation
    .slice(0, 3)
    .map((actor, slot) => ({ actor, slot, hp: state.units[actor]?.hp || 0 }))
    .filter((entry) => entry.hp > 0);
  const lowest = [...front].sort((a, b) => a.hp - b.hp || a.slot - b.slot)[0]?.slot ?? 1;
  return {
    ...move,
    index: actual,
    round: state.round,
    enraged,
    effects,
    ...(enraged && index === 1 ? { slot: lowest, slots: [lowest], priority: true } : {}),
    ...(!enraged && actual === 0
      ? { selfBuff: { iron: Math.max(0, Math.min(1, 2 - (unit.buffs.iron || 0))) } }
      : {}),
    ...(enraged && index === 2 ? { selfCleanse: true } : {}),
  };
}
