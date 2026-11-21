import { abilityFor, definition } from '../../src/catalog.js';
import { ITEMS } from '../../src/content/items.js';
import { canCombine, EMBLEMS } from '../../src/emblems.js';
import { preview } from '../../src/engine.js';

const WEIGHTS = Object.freeze({
  balanced: [1, 0.8, 0.44],
  aggressive: [1.35, 0.57, 0.31],
  conservative: [0.85, 1.25, 0.55],
});

function actionsAt(state, start) {
  const heroes = Object.values(state.units).filter((unit) => unit.side === 'hero');
  const enemies = state.enemyIds.filter((id) => state.units[id]?.hp > 0);
  const alive = heroes.filter((unit) => unit.hp > 0);
  const front = state.formation.slice(0, 3);
  const actions = [];
  for (const actor of front) {
    const unit = state.units[actor];
    if (!unit?.hp) continue;
    const hero = definition(state, actor);
    const emblem = EMBLEMS[hero.emblemId]?.skill;
    const skills = [
      abilityFor(state, actor, 'attack'),
      ...(hero.skills || []).filter((skill) => !skill.passive && skill.location !== '战斗外'),
      ...(unit.combined && !unit.combineSkillUsed && emblem ? [emblem] : []),
    ];
    for (const skill of skills) {
      if (!skill || unit.mp < skill.mp || unit.hp <= (skill.hp || 0)) continue;
      const targets =
        {
          enemy: enemies,
          ally:
            skill.mechanic === 'soul-revive'
              ? heroes.map((ally) => ally.id)
              : alive.map((ally) => ally.id),
          self: [actor],
          allAllies: [actor],
          allEnemies: enemies.slice(0, 1),
        }[skill.target] || [];
      for (const target of targets) {
        actions.push({ kind: 'skill', actor, skill: skill.id, target, ap: skill.ap, start });
      }
    }
    if (canCombine(state, actor)) {
      actions.push({ kind: 'engage', actor, ap: 1, start });
      const targets =
        {
          self: [actor],
          ally: alive.filter((ally) => ally.id !== actor).map((ally) => ally.id),
          allAllies: [actor],
          allEnemies: enemies.slice(0, 1),
          enemy: enemies,
        }[emblem?.target] || [];
      for (const target of targets) {
        actions.push({
          kind: 'engage',
          actor,
          followUp: { skill: emblem.id, target },
          ap: emblem.ap,
          start,
        });
      }
    }
  }
  for (const incoming of state.formation.slice(3)) {
    if (!state.units[incoming]?.hp) continue;
    front.forEach((_, slot) => actions.push({ kind: 'swap', incoming, slot, ap: 1, start }));
  }
  for (let a = 0; a < front.length; a++) {
    for (let b = a + 1; b < front.length; b++) {
      if (state.units[front[a]]?.hp || state.units[front[b]]?.hp) {
        actions.push({ kind: 'reposition', a, b, ap: 1, start });
      }
    }
  }
  for (const [item, count] of Object.entries(state.items || {})) {
    if (!count || !ITEMS[item]) continue;
    const targets = ITEMS[item].target === 'enemy' ? enemies : alive.map((unit) => unit.id);
    for (const target of targets) actions.push({ kind: 'item', item, target, ap: 1, start });
  }
  return actions;
}

function score(result, policy, exerciseEmblem) {
  const [attack, defense, mana] = WEIGHTS[policy];
  const state = result.final;
  let value =
    Number(result.outcome === 'victory') * 100000 - Number(result.outcome === 'defeat') * 100000;
  for (const unit of Object.values(state.units)) {
    const buffs = unit.buffs || {};
    const status =
      (buffs.strength || 0) * 1.7 +
      (buffs.regen || 0) * 0.6 +
      (buffs.artifact || 0) * 2 -
      (buffs.poison || 0) * 0.8 -
      (buffs.bleed || 0) * 0.6 -
      (buffs.weak || 0) -
      (buffs.vulnerable || 0) -
      (buffs.slow || 0) * 0.4;
    if (unit.side === 'enemy') {
      value -=
        attack * (unit.hp + Number(unit.hp > 0) * 12 + status + unit.toughness + unit.block * 0.16);
    } else {
      const front = state.formation.indexOf(unit.id) < 3;
      value +=
        defense *
        (unit.hp + Number(unit.hp > 0) * (25 + Number(front) * 3) + status + unit.block * 0.07);
      value += mana * unit.mp + (unit.emblemCharge || 0) * 0.45 + (unit.mark || 0) * 0.5;
      value += Number(Boolean(unit.combined)) * 3 + Number(Boolean(buffs.overload)) * 5;
    }
  }
  for (const count of Object.values(state.items || {})) value += count * 1.7;
  if (exerciseEmblem) {
    for (const event of result.events) {
      if (event.type === 'engage') value += 70;
      if (
        event.type === 'hero' &&
        EMBLEMS[definition(state, event.actor)?.emblemId]?.skill.id === event.skill
      ) {
        value += 35;
      }
    }
  }
  return value;
}

function randomness(seed) {
  let value = seed >>> 0 || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    return (value >>> 0) / 4294967296;
  };
}

function approximatePriority(state, action, exerciseEmblem) {
  if (action.kind === 'engage') return action.followUp ? 24 : 23;
  if (action.kind === 'swap') return state.units[state.formation[action.slot]]?.hp ? 1 : 8;
  if (action.kind === 'reposition') return 3;
  const skill =
    action.kind === 'item' ? ITEMS[action.item] : abilityFor(state, action.actor, action.skill);
  const target = state.units[action.target];
  if (
    action.kind === 'skill' &&
    exerciseEmblem &&
    EMBLEMS[definition(state, action.actor)?.emblemId]?.skill.id === action.skill
  )
    return 20;
  const effects = skill.effects || [];
  if (effects.some((effect) => effect.type === 'damage')) {
    return 6 + Number(skill.target === 'allEnemies') + 2 / Math.max(1, target.hp);
  }
  if (effects.some((effect) => ['heal', 'selfHeal'].includes(effect.type))) {
    return 1 + (1 - target.hp / target.maxHp) * 7;
  }
  if (effects.some((effect) => ['mana', 'selfMana'].includes(effect.type))) {
    return 1 + (1 - target.mp / (target.maxMp || 1)) * 7;
  }
  return 2 + Number(Boolean(skill.mechanic)) * 2;
}

export function choosePlan(state, { seed, policy, candidateLimit, exerciseEmblem }) {
  const random = randomness(seed ^ Math.imul(state.round + 1, 4679));
  const plan = [];
  let best = preview(state, plan);
  let previews = 1;
  if (!best.valid || best.outcome === 'victory') return { plan, result: best, previews };
  for (let start = 0; start < best.slots.length; start++) {
    if (best.slots[start] || plan.some((action) => start < action.start + action.ap)) continue;
    const at = (best.events.findLast((event) => event.at < start) || {}).after || state;
    const candidates = actionsAt(at, start)
      .filter(
        (action) =>
          action.ap > 0 &&
          start + action.ap <= best.slots.length &&
          !best.slots.slice(start, start + action.ap).some(Boolean),
      )
      .map((action) => ({
        action,
        priority: approximatePriority(at, action, exerciseEmblem) + random(),
      }))
      .sort((first, second) => second.priority - first.priority)
      .slice(0, exerciseEmblem ? candidateLimit + 4 : candidateLimit);
    let winningAction = null;
    let winningResult = best;
    let winningScore = score(best, policy, exerciseEmblem);
    let legalCandidates = 0;
    for (const [index, { action }] of candidates.entries()) {
      const candidate = { ...action, id: `r${state.round}-s${start}-a${index}` };
      const result = preview(state, [...plan, candidate]);
      previews++;
      if (!result.valid) continue;
      legalCandidates++;
      const value = score(result, policy, exerciseEmblem);
      if (value > winningScore + 0.000001) {
        winningAction = candidate;
        winningResult = result;
        winningScore = value;
      }
      if (legalCandidates >= candidateLimit) break;
    }
    if (winningAction) {
      plan.push(winningAction);
      best = winningResult;
    }
    if (best.outcome === 'victory') break;
  }
  return { plan, result: best, previews };
}

export function isBattlePolicy(value) {
  return Object.hasOwn(WEIGHTS, value);
}
