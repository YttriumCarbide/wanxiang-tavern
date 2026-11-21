import { isDeepStrictEqual } from 'node:util';
import { definition } from '../../src/catalog.js';
import { EMBLEMS } from '../../src/emblems.js';
import { advance, preview } from '../../src/engine.js';
import { choosePlan, isBattlePolicy } from './policy.mjs';

const isResource = (value) => Number.isFinite(value) && value >= 0;

function stateIssues(state) {
  const issues = [];
  const formation = state.formation.filter(Boolean);
  const enemies = new Set(state.enemyIds);
  const heroes = new Set(formation);
  if (state.formation.length !== 6 || formation.length !== heroes.size)
    issues.push('formation-slots');
  if (enemies.size !== state.enemyIds.length) issues.push('duplicate-enemy');
  for (const id of heroes) if (state.units[id]?.side !== 'hero') issues.push(`formation:${id}`);
  for (const id of enemies) if (state.units[id]?.side !== 'enemy') issues.push(`enemy-index:${id}`);
  for (const [id, unit] of Object.entries(state.units)) {
    const { hp, maxHp, mp, maxMp, block, used, side } = unit;
    const withdrawnEnemy = side === 'enemy' && unit.withdrawn === true && hp === 0;
    if (
      unit.id !== id ||
      (side === 'hero' ? !heroes.has(id) : !enemies.has(id) && !withdrawnEnemy)
    ) {
      issues.push(`unit-index:${id}`);
    }
    // Overload intentionally keeps the current hero HP when the temporary max expires.
    if (
      ![hp, maxHp, mp, maxMp, block, used].every(isResource) ||
      !maxHp ||
      mp > maxMp ||
      (side === 'enemy' && hp > maxHp)
    ) {
      issues.push(`unit-resources:${id}`);
    }
    if (!Object.values(unit.buffs || {}).every(isResource)) issues.push(`status-stacks:${id}`);
    if (
      unit.emblemCharge !== undefined &&
      (!isResource(unit.emblemCharge) || unit.emblemCharge > 6)
    ) {
      issues.push(`emblem-charge:${id}`);
    }
    if (
      side === 'enemy' &&
      (!isResource(unit.toughness) ||
        !isResource(unit.maxToughness) ||
        unit.toughness > unit.maxToughness)
    ) {
      issues.push(`enemy-toughness:${id}`);
    }
  }
  for (const [id, count] of Object.entries(state.items || {})) {
    if (!Number.isSafeInteger(count) || count < 0) issues.push(`item-count:${id}`);
  }
  return issues;
}

function outcomeFor(state) {
  const units = Object.values(state.units);
  if (!units.some((unit) => unit.side === 'enemy' && unit.hp > 0)) return 'victory';
  if (!units.some((unit) => unit.side === 'hero' && unit.hp > 0)) return 'defeat';
  return null;
}

function resultIssues(before, plan, result, next, repeat, auditEvents) {
  const issues = [];
  if (!result.valid)
    return result.invalid.map(({ id, message }) => `invalid-plan:${id}:${message}`);
  if (result.outcome !== outcomeFor(result.final)) issues.push('outcome-disagrees-with-units');
  if (
    result.outcome
      ? next.phase !== result.outcome
      : next.phase !== 'plan' || next.round !== before.round + 1
  ) {
    issues.push('advance-phase-or-round');
  }
  if (repeat && !isDeepStrictEqual(result, preview(before, plan)))
    issues.push('non-deterministic-preview');
  const deathIds = result.deaths.map(({ id }) => id);
  if (new Set(deathIds).size !== deathIds.length) issues.push('duplicate-deaths');
  let previous = before;
  const executed = new Map();
  const playerActions = new Map(plan.map((action) => [action.id, action]));
  const skipped = new Set(result.skipped.map(({ id }) => id));
  const enemyActions = new Set();
  let previousSlot = -Infinity;
  for (const event of result.events) {
    if (auditEvents) issues.push(...stateIssues(event.after));
    // Pre-timeline bombs and boss phase cut-ins are displayed at slot zero.
    const slot = Math.max(0, event.at);
    if (!Number.isInteger(event.at) || slot < previousSlot || event.at > result.slots.length) {
      issues.push('event-slot-order');
    }
    previousSlot = slot;
    if (event.type === 'hero') {
      const action = playerActions.get(event.actionId);
      if (!action || action.start !== event.at || action.actor !== event.actor)
        issues.push('hero-action-origin');
      if (
        executed.has(event.actionId) &&
        (event.repeatIndex || 0) <= executed.get(event.actionId)
      ) {
        issues.push(`repeat-order:${event.actionId}`);
      }
      executed.set(event.actionId, event.repeatIndex || 1);
    }
    if (event.type === 'item' && event.skill) {
      if (event.after.items[event.skill] !== previous.items[event.skill] - 1)
        issues.push(`item-consumption:${event.skill}`);
    }
    if (event.type === 'enemy') {
      if (result.slots[event.at] !== event.actor || enemyActions.has(event.at)) {
        issues.push(`enemy-action-slot:${event.actor}`);
      }
      enemyActions.add(event.at);
    }
    if (auditEvents) {
      for (const id of Object.keys(event.after.units)) {
        if (
          previous.units[id]?.hp > 0 &&
          event.after.units[id].hp === 0 &&
          !event.after.units[id].withdrawn &&
          !deathIds.includes(id)
        ) {
          issues.push(`unreported-death:${id}`);
        }
      }
    }
    previous = event.after;
  }
  for (const action of plan) {
    if (!skipped.has(action.id) && !result.events.some((event) => event.actionId === action.id)) {
      issues.push(`action-unaccounted:${action.id}`);
    }
  }
  issues.push(...stateIssues(result.final), ...stateIssues(next));
  return [...new Set(issues)];
}

function replayEvent(event) {
  return {
    type: event.type,
    at: event.at,
    actor: event.actor,
    actionId: event.actionId,
    skill: event.skill,
    targets: event.targets,
    ...(event.type === 'enemy' || event.type === 'bossPhase' ? { label: event.label } : {}),
    ...(event.bossStage || event.phaseStage || event.type === 'bossPhase'
      ? { stage: event.phaseStage || event.bossStage || event.after.units[event.actor]?.bossStage }
      : {}),
    ...(event.chargeStarted ? { chargeStarted: true } : {}),
    ...(event.chargedRelease ? { chargedRelease: true } : {}),
    ...(event.bombArmed ? { bombArmed: event.bombArmed } : {}),
    ...(event.fixedFirstSlot ? { fixedFirstSlot: true } : {}),
    ...(event.clearedCorruptedSlot ? { clearedCorruptedSlot: true } : {}),
    ...(event.statusTriggers.length ? { statusTriggers: event.statusTriggers } : {}),
    ...(event.procs.length ? { procs: event.procs.map(({ owner, key }) => ({ owner, key })) } : {}),
  };
}

function healthMovement(before, result, side) {
  let damage = 0;
  let previous = before;
  for (const { after } of result.events) {
    for (const unit of Object.values(after.units)) {
      if (unit.side === side)
        damage += Math.max(0, (previous.units[unit.id]?.hp ?? unit.hp) - unit.hp);
    }
    previous = after;
  }
  return damage;
}

function unitResources(state) {
  return Object.fromEntries(Object.values(state.units).map(({ id, hp, mp }) => [id, { hp, mp }]));
}

function repeatKey(state) {
  return JSON.stringify([
    state.formation,
    state.items,
    Object.values(state.units).map(
      ({ id, hp, mp, buffs, bossStage, chargingMove, emblemCharge, combined }) => [
        id,
        hp,
        mp,
        Object.entries(buffs).sort(),
        bossStage,
        Boolean(chargingMove),
        emblemCharge,
        combined,
      ],
    ),
  ]);
}

function recordRound(before, result, plan, next, coverage) {
  let previous = before;
  for (const event of result.events) {
    const damage = Object.values(event.after.units)
      .filter((unit) => unit.side === 'hero')
      .reduce(
        (total, unit) => total + Math.max(0, (previous.units[unit.id]?.hp ?? unit.hp) - unit.hp),
        0,
      );
    if (damage) {
      coverage.damageToHeroesByEvent[event.type] =
        (coverage.damageToHeroesByEvent[event.type] || 0) + damage;
    }
    previous = event.after;
    const boss = coverage.bosses[event.actor];
    if (event.type === 'enemy' && boss) {
      boss.actions++;
      const stage = String(event.bossStage || 1);
      boss.actionsByStage[stage] = (boss.actionsByStage[stage] || 0) + 1;
      if (event.chargeStarted) boss.charges++;
      if (event.chargedRelease) boss.releases++;
      if (
        event.chargeStarted ||
        event.chargedRelease ||
        event.bombArmed ||
        event.clearedCorruptedSlot
      )
        boss.mechanics++;
    }
    if (event.type === 'bossPhase' && boss) {
      const stage = event.phaseStage || event.after.units[event.actor]?.bossStage;
      boss.phases.push(stage);
      boss.mechanics++;
    }
    if (boss && ['bombDetonate', 'bombDefuse', 'sinkingPlague'].includes(event.type))
      boss.mechanics++;
    for (const { key, equipment } of event.procs) {
      if (equipment) coverage.equipmentProcs[key] = (coverage.equipmentProcs[key] || 0) + 1;
    }
    if (event.type === 'engage') coverage.engages++;
    if (event.type === 'hero' && definition(before, event.actor)?.emblemId) {
      const id = definition(before, event.actor).emblemId;
      if (EMBLEMS[id]?.skill?.id === event.skill) {
        coverage.emblemSkills[id] = (coverage.emblemSkills[id] || 0) + 1;
      }
    }
  }
  const enemyDamage = healthMovement(before, result, 'enemy');
  const heroDamage = healthMovement(before, result, 'hero');
  if (before.phase !== 'opening' && enemyDamage === 0) coverage.zeroDamageRounds++;
  return {
    round: before.round,
    slots: result.slots,
    plan,
    before: unitResources(before),
    after: unitResources(next),
    enemyDamage,
    heroDamage,
    deaths: result.deaths,
    events: result.events.filter((event) => event.type !== 'wait').map(replayEvent),
    outcome: result.outcome,
  };
}

export function simulateBattle(
  initial,
  {
    seed = 1,
    maxRounds = 60,
    policy = 'balanced',
    candidateLimit = 12,
    checkReplay = true,
    keepTrace = true,
    auditEvents = true,
    exerciseEmblem = false,
    onRound,
  } = {},
) {
  if (!isBattlePolicy(policy)) throw new RangeError(`Unknown battle policy: ${policy}`);
  const state = structuredClone(initial);
  const trace = [];
  const coverage = {
    previews: 0,
    damageToHeroesByEvent: {},
    engages: 0,
    emblemSkills: {},
    equipmentProcs: {},
    zeroDamageRounds: 0,
    longestZeroDamageStreak: 0,
    maxRepeatedState: 0,
    bosses: {},
  };
  let next = state;
  let rounds = 0;
  let zeroDamageStreak = 0;
  const repeated = new Map();
  const violations = [];
  let outcome = outcomeFor(state);
  for (const id of state.enemyIds) {
    if (definition(state, id)?.boss || definition(state, id)?.overlord) {
      coverage.bosses[id] = {
        actions: 0,
        actionsByStage: {},
        phases: [],
        charges: 0,
        releases: 0,
        mechanics: 0,
      };
    }
  }
  for (const issue of stateIssues(state)) violations.push({ round: state.round, issue });
  while (!outcome && !violations.length && rounds < maxRounds) {
    const before = next;
    const beforeSnapshot = checkReplay ? structuredClone(before) : null;
    const chosen = choosePlan(before, { seed, policy, candidateLimit, exerciseEmblem });
    const { plan, result, previews } = chosen;
    coverage.previews += previews;
    const advanced = result.valid ? advance(result) : before;
    const issues = resultIssues(before, plan, result, advanced, checkReplay, auditEvents);
    if (beforeSnapshot && !isDeepStrictEqual(beforeSnapshot, before))
      issues.push('preview-mutated-input');
    if (issues.length) {
      const failedRound = recordRound(before, result, plan, advanced, coverage);
      trace.push(failedRound);
      violations.push(
        ...issues.map((issue) => ({ round: before.round, issue, plan, trace: failedRound })),
      );
      break;
    }
    next = advanced;
    onRound?.({ before, result, next });
    const row = recordRound(before, result, plan, next, coverage);
    if (keepTrace) trace.push(row);
    else if (
      !trace.length ||
      row.events.some(({ type }) => type === 'bossPhase') ||
      Object.keys(coverage.bosses).some(
        (boss) =>
          row.events.some(({ actor, type }) => actor === boss && type === 'enemy') &&
          !trace.some((round) =>
            round.events.some(({ actor, type }) => actor === boss && type === 'enemy'),
          ),
      )
    )
      trace.push(row);
    for (const issue of stateIssues(next))
      violations.push({ round: before.round, issue, plan, trace: row });
    if (before.phase !== 'opening') {
      rounds++;
      zeroDamageStreak = row.enemyDamage === 0 ? zeroDamageStreak + 1 : 0;
      coverage.longestZeroDamageStreak = Math.max(
        coverage.longestZeroDamageStreak,
        zeroDamageStreak,
      );
      const key = repeatKey(next);
      const count = (repeated.get(key) || 0) + 1;
      repeated.set(key, count);
      coverage.maxRepeatedState = Math.max(coverage.maxRepeatedState, count);
    }
    outcome = result.outcome;
    if (!outcome && zeroDamageStreak >= 12 && coverage.maxRepeatedState >= 3) outcome = 'stalled';
  }
  return {
    outcome: violations.length ? 'invariant' : outcome || 'round-limit',
    state: next,
    rounds,
    trace,
    violations,
    coverage,
  };
}
