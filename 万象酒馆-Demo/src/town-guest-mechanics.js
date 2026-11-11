/** Pure battle rules; all presentation consumes the engine's recorded events. */
export function adjacentAllies(state, actor, includeSelf = false) {
  const position = state.formation.indexOf(actor);
  if (position < 0) return [];
  const row = Math.floor(position / 3);
  return state.formation.filter(
    (id, index) =>
      state.units[id]?.hp > 0 &&
      Math.floor(index / 3) === row &&
      (index === position ? includeSelf : Math.abs(index - position) === 1),
  );
}

/** Chosen in the deterministic preview, never during animation playback. */
export function blindedTarget(state, actor, targets) {
  if (!state.units[actor]?.buffs.blind) return null;
  const living = [...new Set(targets)].filter((id) => state.units[id]?.hp > 0);
  if (living.length < 2) return null;
  let seed = (state.seed + state.round * 101) >>> 0;
  for (const letter of actor) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0;
  return living[seed % living.length];
}

export function createTownGuestMechanics(state, definitions, ports) {
  function allies() {
    return state.formation.filter((id) => state.units[id]?.hp > 0);
  }
  function addMelody(actor, count) {
    const unit = state.units[actor];
    if (!count || unit?.hp <= 0) return;
    unit.mark = (unit.mark || 0) + count;
    ports.log(`${definitions[actor].name}获得${count}层悠扬，当前${unit.mark}层`);
  }
  return {
    roundStart(slots) {
      if (state.phase === 'opening' || (!slots[0] && !slots.at(-1))) return;
      for (const id of allies()) {
        if (!definitions[id].skills?.some((skill) => skill.mechanic === 'keen-sight')) continue;
        ports.effects(id, [id], [{ type: 'shield', value: 5 }]);
        ports.log(`${definitions[id].name} · 视觉敏锐`);
      }
    },
    targets(actor, ability, fallback) {
      return ability.adjacentAllies ? adjacentAllies(state, actor, ability.includeSelf) : fallback;
    },
    entry(actor, ability, outgoing) {
      if (ability.mechanic === 'libet-entry') {
        if (outgoing && state.units[outgoing]?.hp > 0)
          ports.effects(
            actor,
            [outgoing],
            ability.effects.filter((effect) => effect.type === 'heal'),
          );
        ports.effects(
          actor,
          allies(),
          ability.effects.filter((effect) => effect.type === 'shield'),
        );
        return true;
      }
      if (ability.mechanic === 'melody-entry') {
        addMelody(actor, allies().length);
        ports.effects(actor, state.formation.slice(0, 3).filter(Boolean), ability.effects);
        return true;
      }
      return false;
    },
    afterBasicAttack(actor, injured) {
      if (definitions[actor]?.basicAttackInjuredMark) addMelody(actor, injured.size);
    },
    afterCast(actor, ability) {
      if (!ability.consumeMarkCount) return;
      const unit = state.units[actor];
      const spent = Math.min(unit.mark || 0, ability.consumeMarkCount);
      unit.mark = (unit.mark || 0) - spent;
      if (spent) ports.log(`${definitions[actor].name}消耗${spent}层悠扬，当前${unit.mark}层`);
    },
  };
}
