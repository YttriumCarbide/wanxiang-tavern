import { enemyEffectSide } from './enemy-targets.js';
import { withoutDiningBonus } from './dining.js';
import { aresDecision, nextBossStage, shouldEnrage } from './ares.js';
import { createCompanionMechanics } from './companion-mechanics.js';
import { createTownGuestMechanics, blindedTarget } from './town-guest-mechanics.js';
import { tacticalDecision, lockEnemyDecisions } from './enemy-tactics.js';
import {
  alchemicalBombDamage,
  overlordPhaseProfile,
  overlordTargetStage,
  pickBombTarget,
} from './overlord-mechanics.js';
import { canCombine, EMBLEMS, OVERLOAD_EMBLEM_ID } from './emblems.js';
import { ITEMS, restoreBag } from './content/items.js';
import { definition, definitionsFor, heroesFor, abilityFor } from './catalog.js';
import { validateAction } from './validation.js';
import { HEROES, DEFINITIONS, BUFFS, encounterSpec, enemySlots } from './data.js';
import {
  auraValue,
  rulesFor,
  conditionsMet,
  triggerTargets,
  ruleUsageKey,
  POSITIVE_BUFFS,
} from './triggers.js';
import {
  decayStatuses,
  statusStacks,
  NEGATIVE_STATUSES,
  applyStrengthBonus,
  applyWeakReduction,
  applyVulnerableBonus,
  applyIronReduction,
  applyGuardShield,
  regenHealAmount,
} from './status-rules.js';
import { recordCooperationHit } from './cooperation.js';
import { enemyGrowth, leveledIntent } from './enemy-growth.js';
import { REST_LOSS_RECOVERY } from './content/journey-rules.js';
import {
  createEmblemMechanics,
  positionBuff,
  emblemTargetError,
  clearBattleMechanics,
  negativeImmune,
} from './emblem-mechanics.js';
import { inferDamageType, isDamageType, resolveBasicAttackType } from './damage-types.js';
import { mergeRevealedWeaknessMap, resolveEnemyBreakProfile, speciesKeyOf } from './octopath.js';
export const clone = (x) => structuredClone(x);
export function battleResourceLimits(definition) {
  let hp = definition.hp;
  let mp =
    definition.mp +
    (definition.skills || []).reduce(
      (total, skill) => total + (skill.location === '战斗外' ? skill.bonusMp || 0 : 0),
      0,
    );
  if (definition.emblemId === OVERLOAD_EMBLEM_ID && !definition._overloadApplied) {
    mp = Math.round(mp * 1.5);
    hp = Math.round(hp + mp * 0.25);
  }
  return { hp, mp };
}

export function newBattle(
  enemyIds = encounterSpec(0).enemyIds,
  heroDefinitions = {},
  enemyDefinitions = {},
  revealedWeaknesses = {},
) {
  const heroes = HEROES.map((hero) => heroDefinitions[hero.id] || hero).filter(
    (hero) => !hero.inactive,
  );
  return {
    heroDefinitions: clone(heroDefinitions),
    enemyDefinitions: clone(enemyDefinitions),
    revealedWeaknesses: mergeRevealedWeaknessMap({}, revealedWeaknesses),
    phase: 'opening',
    round: 0,
    enemyIds: [...enemyIds],
    formation: HEROES.map((h) => (heroes.some((hero) => hero.id === h.id) ? h.id : null)),
    units: Object.fromEntries(
      [...heroes, ...enemyIds.map((id) => enemyDefinitions[id] || DEFINITIONS[id])].map((d) => {
        const { hp, mp } = battleResourceLimits(d);
        const enemyBreak = d.speed ? resolveEnemyBreakProfile(d) : null;
        return [
          d.id,
          {
            id: d.id,
            side: d.speed ? 'enemy' : 'hero',
            hp,
            maxHp: hp,
            mp,
            maxMp: mp,
            block: 0,
            buffs: Object.fromEntries(
              Object.entries(d.buffs || {}).map(([key, value]) => [key, statusStacks(key, value)]),
            ),
            entryReady: false,
            used: 0,
            ...(d.mechanicMark ? { mark: 0 } : {}),
            ...(enemyBreak
              ? {
                  bossStage: 1,
                  speciesKey: enemyBreak.speciesKey,
                  toughness: enemyBreak.maxToughness,
                  maxToughness: enemyBreak.maxToughness,
                  weaknesses: [...enemyBreak.weaknesses],
                  broken: false,
                  brokenNextRound: false,
                }
              : {}),
          },
        ];
      }),
    ),
    items: restoreBag(),
    seed: 37,
  };
}
export const front = (s) => s.formation.slice(0, 3);
export const rear = (s) => s.formation.slice(3);
export const getEnemies = (s) => s.enemyIds.map((id) => definition(s, id));
export const livingEnemies = (s) => getEnemies(s).filter((e) => s.units[e.id].hp > 0);
export function effectiveBuff(s, id, key) {
  if (NEGATIVE_STATUSES.includes(key) && negativeImmune(s, id)) return 0;
  const value =
    (s.units[id]?.buffs[key] || 0) +
    positionBuff(s, id, key) +
    (s.units[id]?.hp > 0 ? auraValue(s, heroesFor(s), id, key) : 0);
  return key === 'haste' ? Math.min(2, value) : value;
}
export function enemyActionsCount(s, id) {
  const def = definition(s, id);
  const unit = s?.units?.[id];
  if (!def || !unit || unit.hp <= 0) return 0;
  if (s.phase === 'opening') return 1;
  const fixedExtra = def.fixedFirstSlot ? 1 : 0;
  if (Array.isArray(def.overlordPhases) && def.overlordPhases.length >= 2) {
    const stage = Math.max(unit.bossStage || 1, overlordTargetStage(unit, def));
    return overlordPhaseProfile(def, stage).regularActions + fixedExtra;
  }
  const enraged = !!(
    def.boss &&
    def.phaseMode !== 'cycle' &&
    (unit.enraged || shouldEnrage(s, id, def))
  );
  const count = enraged ? (def.enragedActions ?? def.actions ?? 1) : (def.actions ?? 1);
  return Math.max(1, Number(count) || 1) + fixedExtra;
}
function fixedFirstIntent(s, id, authored) {
  const bombTarget = pickBombTarget(s, s.round);
  const frontSlot = bombTarget ? (s.formation || []).slice(0, 3).indexOf(bombTarget) : -1;
  const slot = frontSlot >= 0 ? frontSlot : 1;
  const unit = s.units?.[id];
  const stage = Math.max(unit?.bossStage || 1, overlordTargetStage(unit, authored));
  const sec = overlordPhaseProfile(authored, stage).bombSeconds;
  return {
    ...authored.fixedFirstSlot,
    name: `${authored.fixedFirstSlot.name}（${sec}s）`,
    text: `先制投出定时炼金炸弹，下回合需在 ${sec} 秒内确认结算，否则引爆造成高额伤害并强制结束回合。`,
    slot,
    slots: [slot],
    effects: [],
    enraged: stage >= 2,
    fixedFirstSlot: true,
    bombTarget,
    bombSeconds: sec,
  };
}
export function intent(s, id, actionIndex = 0) {
  const authored = definition(s, id);
  const scaleIntent = (move) =>
    move.fixedFirstSlot
      ? move
      : leveledIntent(move, s.units[id]?.attackBonus, s.units[id]?.damageScale);
  if (authored.tactic?.mode === 'ares') return scaleIntent(aresDecision(s, id, authored));
  const hasFixedFirst = s.phase !== 'opening' && Boolean(authored.fixedFirstSlot);
  if (hasFixedFirst && actionIndex === 0) return fixedFirstIntent(s, id, authored);
  const regIndex = hasFixedFirst ? Math.max(0, actionIndex - 1) : actionIndex;
  const tactical =
    s.enemyDecisions?.[id]?.round === s.round
      ? s.enemyDecisions[id]
      : tacticalDecision(s, id, definition(s, id));
  if (tactical) {
    const def = definition(s, id);
    const bossStage =
      tactical.bossStage ||
      (Array.isArray(def.overlordPhases)
        ? Math.max(s.units[id]?.bossStage || 1, overlordTargetStage(s.units[id], def))
        : tactical.enraged
          ? 2
          : 1);
    const list =
      bossStage >= 3 && def.finalPhaseIntents?.length
        ? def.finalPhaseIntents
        : tactical.enraged
          ? def.enragedIntents
          : def.intents;
    const useOpening =
      Boolean(authored.openingIntent) &&
      !s.units[id]?.openingAttackUsed &&
      (!authored.openingIntent.lowestHpPosition || s.round <= 1);
    if (useOpening && regIndex === 0) {
      const opening = authored.openingIntent;
      const openingSlot = opening.slot ?? tactical.slot;
      const openingSlots =
        opening.slots ||
        (opening.adjacent ? [openingSlot, openingSlot === 2 ? 1 : openingSlot + 1] : [openingSlot]);
      return scaleIntent({
        ...opening,
        slot: openingSlot,
        slots: openingSlots,
        enraged: tactical.enraged,
      });
    }
    const offset = useOpening ? regIndex - 1 : regIndex;
    const tacticalIndex = (tactical.index + offset) % list.length;
    if (regIndex === 0 && !hasFixedFirst) {
      return scaleIntent({ ...list[tacticalIndex], ...tactical });
    }
    const move = list[tacticalIndex];
    const targetSlot =
      def.tactic?.target === 'fixed'
        ? (move.slot ?? tactical.slot ?? 1)
        : (move.slot ?? tactical.slot);
    const targetSlots =
      move.slots ||
      (move.adjacent ? [targetSlot, targetSlot === 2 ? 1 : targetSlot + 1] : [targetSlot]);
    return scaleIntent({
      ...move,
      slot: targetSlot,
      slots: targetSlots,
      enraged: tactical.enraged || bossStage >= 2,
    });
  }
  const def = definition(s, id),
    stage = Array.isArray(def.overlordPhases)
      ? Math.max(s.units[id].bossStage || 1, overlordTargetStage(s.units[id], def))
      : def.boss &&
          def.phaseMode !== 'cycle' &&
          (s.units[id].enraged || s.units[id].hp <= s.units[id].maxHp * def.phaseThreshold)
        ? 2
        : 1,
    enraged = stage >= 2;
  const list =
    stage >= 3 && def.finalPhaseIntents?.length
      ? def.finalPhaseIntents
      : enraged
        ? def.enragedIntents
        : def.intents;
  const useOpening =
    def.openingIntent &&
    !s.units[id].openingAttackUsed &&
    (!def.openingIntent.lowestHpPosition || s.round <= 1);
  const move =
    useOpening && regIndex === 0
      ? def.openingIntent
      : useOpening && regIndex > 0
        ? list[(regIndex - 1) % list.length]
        : s.units[id].openingUsedRound === s.round
          ? list[Math.max(0, regIndex - 1) % list.length]
          : list[(Math.max(1, s.round) - 1 + regIndex) % list.length];
  return scaleIntent({
    ...move,
    ...(move.lowestHpPosition
      ? s.openingTargetSlots?.[id] !== undefined
        ? { slot: s.openingTargetSlots[id] }
        : {
            slot: s.formation
              .slice(0, 3)
              .reduce(
                (lowest, id, slot) =>
                  s.units[id]?.hp > 0 &&
                  (lowest < 0 || s.units[id].hp < s.units[s.formation[lowest]].hp)
                    ? slot
                    : lowest,
                -1,
              ),
          }
      : {}),
    ...(s.enemyIntentSlots?.[id] !== undefined ? { slot: s.enemyIntentSlots[id] } : {}),
    enraged: !!enraged,
  });
}
export function enemyIntents(s, id) {
  const count = enemyActionsCount(s, id);
  return Array.from({ length: count }, (_, actionIndex) => intent(s, id, actionIndex));
}
export function enemyTimeline(s, extraSlow = {}) {
  if (s.phase === 'opening') return [null];
  const enemies = livingEnemies(s),
    entries = enemies.map((e, i) => ({
      def: e,
      id: e.id,
      count: enemyActionsCount(s, e.id),
      fixedFirst: Boolean(e.fixedFirstSlot),
      speed:
        e.tactic?.mode === 'ares' && aresDecision(s, e.id, e).priority
          ? 999
          : Math.max(1, e.speed - (s.units[e.id].buffs.slow || 0) - (extraSlow[e.id] || 0)),
      tie:
        e.tactic?.mode === 'moon-tree'
          ? { crown: 2, eye: 1, root: 0 }[e.tactic.part]
          : (i * 17 + s.seed + s.round * 11) % 31,
    })),
    totalEnemyActions = entries.reduce((sum, entry) => sum + entry.count, 0),
    length = 3 + totalEnemyActions,
    slots = Array(length).fill(null);
  let lockedFrontCount = 0;
  for (const entry of entries) {
    if (!entry.fixedFirst) continue;
    while (lockedFrontCount < length && slots[lockedFrontCount]) lockedFrontCount++;
    if (lockedFrontCount < length) slots[lockedFrontCount++] = entry.id;
  }
  const minSlot = lockedFrontCount;
  const actions = [];
  for (const entry of entries) {
    const regularCount = Math.max(0, entry.count - (entry.fixedFirst ? 1 : 0));
    if (!regularCount) continue;
    const speed = entry.speed === 999 ? length + 1 : entry.speed;
    if (regularCount === 1 || entry.def.splitActions === false) {
      const desired = Math.max(minSlot, Math.min(length - 1, length - speed));
      for (let actionIndex = 0; actionIndex < regularCount; actionIndex++) {
        actions.push({
          id: entry.id,
          speed,
          tie: entry.tie,
          actionIndex: actionIndex + (entry.fixedFirst ? 1 : 0),
          desired,
        });
      }
    } else {
      const first = Math.max(
        minSlot,
        Math.min(length - regularCount, length - speed - (regularCount - 1)),
      );
      const span = length - 1 - first;
      for (let actionIndex = 0; actionIndex < regularCount; actionIndex++) {
        const desired =
          regularCount === 2 && actionIndex === 1
            ? Math.min(length - 1, first + Math.min(3, span))
            : Math.min(
                length - 1,
                first + Math.round((actionIndex * span) / Math.max(1, regularCount - 1)),
              );
        actions.push({
          id: entry.id,
          speed,
          tie: entry.tie,
          actionIndex: actionIndex + (entry.fixedFirst ? 1 : 0),
          desired,
        });
      }
    }
  }
  actions.sort((a, b) => b.speed - a.speed || a.tie - b.tie || a.actionIndex - b.actionIndex);
  for (const item of actions) {
    let at = item.desired;
    while (at < length && slots[at]) at++;
    if (at === length) {
      at = item.desired - 1;
      while (at >= minSlot && slots[at]) at--;
      if (at < minSlot) {
        at = length - 1;
        while (at >= minSlot && slots[at]) at--;
      }
    }
    if (at >= minSlot) slots[at] = item.id;
  }
  return slots;
}
export function makeReposition(a, b, start) {
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36),
    kind: 'reposition',
    a,
    b,
    start,
    ap: 1,
  };
}
export function makeAction(s, actor, skill, target, start) {
  const a = abilityFor(s, actor, skill);
  if (!a) throw Error('Unknown ability');
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36),
    actor,
    skill,
    target,
    start,
    ap: a.ap,
    kind: 'skill',
  };
}
export function makeItem(item, target, start) {
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36),
    kind: 'item',
    item,
    target,
    start,
    ap: 1,
  };
}
export function makeSwap(incoming, slot, start) {
  return {
    id: globalThis.crypto?.randomUUID?.() || Math.random().toString(36),
    kind: 'swap',
    incoming,
    slot,
    start,
    ap: 1,
  };
}
export function makeEngage(actor, start) {
  return { id: globalThis.crypto.randomUUID(), kind: 'engage', actor, start, ap: 1 };
}
function simulate(s, plan, slots) {
  const definitions = definitionsFor(s),
    heroes = heroesFor(s);
  const work = clone(s),
    rearAtStart = new Set(rear(s)),
    movedToFront = new Set(),
    events = [],
    invalid = [],
    skipped = [],
    deaths = [],
    slows = {},
    pendingPhases = new Map(),
    usedSlots = new Map();
  for (const u of Object.values(work.units)) {
    const nextStage = nextBossStage(work, u.id, definitions[u.id]);
    if (nextStage > 0) {
      u.bossStage = nextStage;
      u.enraged = nextStage >= 2;
      u.phaseStartRound = Math.max(1, s.round);
      pendingPhases.set(u.id, nextStage);
    }
  }
  const seenIDs = new Set();
  const sorted = plan
    .filter((action) => {
      const message = validateAction(work, action, seenIDs);
      if (!message) {
        seenIDs.add(action.id);
        return true;
      }
      invalid.push({ id: action?.id || 'invalid-action', message });
      return false;
    })
    .sort((a, b) => a.start - b.start);
  const valid = [];
  for (const a of sorted) {
    let error = '';
    if (!Number.isInteger(a.start) || a.start < 0 || a.start + a.ap > slots.length)
      error = '没有足够的连续时间格';
    for (let i = a.start; i < a.start + a.ap; i++) {
      if (slots[i]) error = '与敌人行动重叠';
      if (usedSlots.has(i)) error = '与其他行动重叠';
    }
    if (error) {
      invalid.push({ id: a.id, message: error });
      continue;
    }
    for (let i = a.start; i < a.start + a.ap; i++) usedSlots.set(i, a.id);
    valid.push(a);
  }
  let at = -1,
    currentLogs = [],
    currentStatusTriggers = [],
    currentProcs = [],
    attackHits = null,
    attackInjuries = null,
    blindMiss = null;
  work.procUses ||= {};
  work.cooperationHits = {};
  work.cooperations = [];
  function trigger(event, owner = null, detail = {}) {
    for (const hero of heroesFor(work)) {
      if (owner && hero.id !== owner) continue;
      for (const rule of rulesFor(hero)) {
        const key = ruleUsageKey(work, hero.id, rule);
        if (
          rule.mode !== 'event' ||
          (rule.event !== event && rule.event !== 'conditionStart') ||
          !conditionsMet(work, hero.id, rule.conditions, { target: detail.targets?.[0] }) ||
          (work.procUses[key] || 0) >= rule.limit
        )
          continue;
        const targets = triggerTargets(work, hero.id, rule.target, detail);
        if (!targets.length) continue;
        work.procUses[key] = (work.procUses[key] || 0) + 1;
        currentLogs.push(`${hero.name} · ${rule.name}`);
        currentProcs.push({
          owner: hero.id,
          key: rule.key,
          name: rule.name,
          equipment: rule.key.startsWith('equipment:'),
        });
        effects(hero.id, targets, rule.effects, true);
      }
    }
  }
  function death(u, reason) {
    if (u.hp === 0 && !deaths.some((d) => d.id === u.id)) {
      deaths.push({ id: u.id, at, reason });
      currentLogs.push(
        definitions[u.id]?.nonlethal
          ? `${definitions[u.id].name}解除武装，保持存活`
          : `${definitions[u.id]?.name || u.id}濒死，后续行动失效`,
      );
      mechanics.onDeath(u.id);
    }
  }
  function lose(u, n, reason, reduced = false) {
    if (u.hp <= 0) return 0;
    if (!reduced && effectiveBuff(work, u.id, 'flying')) n = Math.floor(n / 2);
    const before = u.hp;
    u.hp = Math.max(0, u.hp - n);
    for (const candidate of Object.values(work.units)) {
      const nextStage = nextBossStage(work, candidate.id, definitions[candidate.id]);
      if (nextStage > 0) {
        candidate.bossStage = nextStage;
        candidate.enraged = nextStage >= 2;
        candidate.phaseStartRound = Math.max(1, work.round);
        pendingPhases.set(candidate.id, nextStage);
      }
    }
    death(u, reason);
    return before - u.hp;
  }
  function heal(id, n, generated = false) {
    const u = work.units[id];
    if (u.hp <= 0) return;
    const gain = Math.min(n, u.maxHp - u.hp);
    u.hp += gain;
    if (gain) {
      currentLogs.push(`${definitions[id].name}回复${gain}生命`);
      if (!generated) trigger('healed', id, { targets: [id] });
    }
  }
  function applyBuff(actor, id, key, value, generated = false) {
    const unit = work.units[id];
    if (!unit || unit.hp <= 0 || mechanics.reflect(actor, id, key, value)) return;
    if (
      NEGATIVE_STATUSES.includes(key) &&
      value > 0 &&
      !negativeImmune(work, id) &&
      (unit.buffs.artifact || 0) > 0
    ) {
      unit.buffs.artifact -= 1;
      if (unit.buffs.artifact <= 0) delete unit.buffs.artifact;
      currentStatusTriggers.push({ id, type: 'artifactBlock', blockedBuff: key, value: 1 });
      currentLogs.push(
        `${definitions[id]?.name || id}的【人工制品】抵消了${BUFFS[key]?.name || key}（剩余${unit.buffs.artifact || 0}层）`,
      );
      return;
    }
    const before = unit.buffs[key] || 0;
    unit.buffs[key] = statusStacks(key, before + value);
    if (POSITIVE_BUFFS.includes(key) && unit.buffs[key] > before)
      companions.gain(id, { type: 'buff', buff: key, value: unit.buffs[key] - before });
    const gained = unit.buffs[key] - before;
    const hasMovableSlot = slots.some(
      (slotId, slotIndex) =>
        slotId === id && slotIndex > at && !(slotIndex === 0 && definitions[id]?.fixedFirstSlot),
    );
    if (key === 'slow' && unit.side === 'enemy' && hasMovableSlot)
      slows[id] = (slows[id] || 0) + gained;
    if (gained && !generated) {
      trigger('gainBuff', id, { targets: [id] });
      trigger(POSITIVE_BUFFS.includes(key) ? 'gainPositive' : 'gainNegative', id, {
        targets: [id],
      });
    }
  }
  const mechanics = createEmblemMechanics(work, definitions, {
    lose,
    heal,
    buff: applyBuff,
    log: (text) => currentLogs.push(text),
    damage: (actor, target, value) =>
      effects(actor, [target], [{ type: 'damage', value, flat: true }], true),
  });
  const companions = createCompanionMechanics(work, definitions, {
    log: (text) => currentLogs.push(text),
    effect: (id, effect) => effects(id, [id], [effect], true),
    basicAttack: counterAttack,
    record,
  });
  const guests = createTownGuestMechanics(work, definitions, {
    effects,
    log: (text) => currentLogs.push(text),
  });
  work.revealedWeaknesses = mergeRevealedWeaknessMap({}, work.revealedWeaknesses);
  function applyBreakImpact(targetId, damageType, actorId) {
    if (!isDamageType(damageType)) return;
    const targetUnit = work.units[targetId];
    if (!targetUnit || targetUnit.side !== 'enemy') return;
    const weaknesses = Array.isArray(targetUnit.weaknesses)
      ? targetUnit.weaknesses
      : resolveEnemyBreakProfile(definitions[targetId] || targetId).weaknesses;
    if (!weaknesses.includes(damageType)) return;
    const spKey = targetUnit.speciesKey || speciesKeyOf(definitions[targetId] || targetId);
    if (spKey) {
      const existing = work.revealedWeaknesses[spKey] || [];
      if (!existing.includes(damageType)) {
        work.revealedWeaknesses[spKey] = [...existing, damageType];
      }
    }
    if (targetUnit.hp > 0 && !targetUnit.broken && targetUnit.toughness > 0) {
      targetUnit.toughness = Math.max(0, targetUnit.toughness - 1);
      if (targetUnit.toughness === 0) {
        targetUnit.broken = true;
        targetUnit.brokenNextRound = true;
        targetUnit.buffs.bind = 1;
        currentStatusTriggers.push({ id: targetId, type: 'break', value: 1 });
        currentLogs.push(
          `${definitions[actorId]?.name || ''}击破了${definitions[targetId].name}的韧性，陷入晕眩！`,
        );
      }
    }
  }
  function effects(
    actor,
    targets,
    list = [],
    generated = false,
    echo = false,
    split = false,
    bonus = 0,
    markSnapshot = work.units[actor]?.mark || 0,
    damageType = null,
  ) {
    let consumedMark = false;
    const allowed = (effect, id) =>
      !effect.when || conditionsMet(work, actor, [effect.when], { target: id, mark: markSnapshot });
    const grantShield = (unitId, baseValue) => {
      const unit = work.units[unitId];
      if (!unit || unit.hp <= 0) return false;
      const n = applyGuardShield(baseValue, effectiveBuff(work, unitId, 'guard'));
      unit.block += n;
      companions.gain(unitId, { type: 'shield', value: n });
      currentLogs.push(`${definitions[unitId].name}获得${n}护盾`);
      return true;
    };
    for (const eff of list || []) {
      const value = (eff.value || 0) + (eff.perMark || 0) * markSnapshot;
      let applied = false;
      if (eff.type === 'selfHeal') {
        if (!allowed(eff, actor)) continue;
        heal(actor, value + bonus, generated);
        consumedMark ||= eff.consumeMark === true;
        continue;
      }
      if (eff.type === 'selfMana') {
        const unit = work.units[actor];
        if (unit.hp <= 0 || !allowed(eff, actor)) continue;
        const gained = Math.min(value, unit.maxMp - unit.mp);
        unit.mp += gained;
        if (gained) currentLogs.push(`${definitions[actor].name}回复${gained}法力`);
        if (gained && !generated) trigger('manaRestored', actor, { targets: [actor] });
        consumedMark ||= eff.consumeMark === true;
        continue;
      }
      if ((eff.type === 'shield' && eff.target === 'self') || eff.type === 'selfShield') {
        if (allowed(eff, actor) && grantShield(actor, value))
          consumedMark ||= eff.consumeMark === true;
        continue;
      }
      if (eff.type === 'mark') {
        const unit = work.units[actor];
        if (unit?.hp > 0 && allowed(eff, actor)) {
          unit.mark = Math.min(
            definitions[actor]?.mechanicMark?.max || 3,
            (unit.mark || 0) + value,
          );
          currentLogs.push(
            `${definitions[actor].name}积累${definitions[actor].mechanicMark?.name || '标记'}，当前${unit.mark}层`,
          );
        }
        continue;
      }
      const selected =
        actor && ['self', 'target', 'lowestAlly', 'allAllies', 'allEnemies'].includes(eff.target)
          ? triggerTargets(work, actor, eff.target, { targets })
          : targets;
      const affected =
        eff.type === 'damage' && echo
          ? [...new Set([...selected, ...work.enemyIds])]
          : eff.type === 'damage' && split
            ? front(work).filter(Boolean)
            : selected;
      for (const id of affected) {
        const u = work.units[id];
        if (!u || u.hp <= 0 || !allowed(eff, id)) continue;
        applied = true;
        if (eff.type === 'damage') {
          if (!generated && attackHits && u.side === 'enemy') attackHits.add(id);
          const strength = actor && !eff.flat ? effectiveBuff(work, actor, 'strength') : 0;
          let n = applyStrengthBonus(value + bonus, strength);
          if (work.units[actor]?.side === 'enemy')
            n = Math.max(1, Math.round(n * (work.enemyDamageScale || 1)));
          if (!eff.flat && actor) n = applyWeakReduction(n, effectiveBuff(work, actor, 'weak'));
          if (!eff.flat) n = applyVulnerableBonus(n, effectiveBuff(work, id, 'vulnerable'));
          if (split) {
            const total = n * split;
            const position = front(work).indexOf(id);
            n = Math.floor(total / 3) + (position < total % 3 ? 1 : 0);
          }
          if (effectiveBuff(work, id, 'flying')) n = Math.floor(n / 2);
          n = applyIronReduction(n, effectiveBuff(work, id, 'iron'));
          const missedByBlind = blindMiss?.actor === actor && blindMiss.target === id;
          if (missedByBlind) n = 0;
          const absorbed = Math.min(u.block, n);
          u.block -= absorbed;
          const damage = n - absorbed;
          const lost = lose(u, damage, '攻击', true);
          if (!generated && !missedByBlind && damageType) {
            applyBreakImpact(id, damageType, actor);
          }
          if (lost && u.side === 'enemy' && !generated) attackInjuries?.add(id);
          if (!generated) recordCooperationHit(work, actor, id, damage);
          const killed = u.hp === 0;
          currentLogs.push(
            `${definitions[actor]?.name || '道具'} → ${definitions[id].name}：${damage}伤害${absorbed ? `，护盾抵挡${absorbed}` : ''}`,
          );
          if (damage && !generated) {
            trigger('damageTaken', id, { attacker: actor, targets: [actor] });
            if (actor) trigger('damageDealt', actor, { targets: [id] });
          }
          if (killed && actor && !generated) trigger('kill', actor, { targets: [id] });
          if (!generated) mechanics.damage(actor, id, damage);
        }
        if (eff.type === 'shield') grantShield(id, value);
        if (eff.type === 'heal') {
          const recovery = eff.maxHpPercent ? Math.round(u.maxHp * eff.maxHpPercent) : value;
          heal(id, recovery + bonus, generated);
        }
        if (eff.type === 'mana') {
          const recovery = eff.maxMpPercent ? Math.round(u.maxMp * eff.maxMpPercent) : value;
          const gained = Math.min(recovery, u.maxMp - u.mp);
          u.mp += gained;
          currentLogs.push(`${definitions[id].name}回复${gained}法力`);
          if (gained && !generated) trigger('manaRestored', id, { targets: [id] });
        }
        if (eff.type === 'cleanse') for (const buff of eff.buffs) delete u.buffs[buff];
        if (eff.type === 'buff') applyBuff(actor, id, eff.buff, value, generated);
      }
      if (applied && eff.consumeMark) consumedMark = true;
    }
    if (consumedMark && work.units[actor]) work.units[actor].mark = 0;
  }
  function bleed(id) {
    const u = work.units[id];
    const value = effectiveBuff(work, id, 'bleed');
    if (u?.hp > 0 && value) {
      lose(u, value, '行动前流血');
      currentLogs.push(`${definitions[id].name}行动前流血${value}`);
      currentStatusTriggers.push({ id, type: 'bleed', value });
      record('status', id, '行动前 · 流血');
      return u.hp === 0;
    }
    return false;
  }
  function triggerEntrySkill(id, actionId, slot, outgoing = null) {
    const unit = work.units[id],
      inDef = definitions[id];
    const es = inDef?.entrySkill || inDef?.combat?.entrySkill;
    if (!unit?.entryReady || !es) return;
    unit.entryReady = false;
    let esTargets;
    if (es.target === 'allEnemies') {
      esTargets = getEnemies(work)
        .filter((e) => work.units[e.id]?.hp > 0)
        .map((e) => e.id);
    } else if (es.target === 'allAllies') {
      esTargets = heroes.filter((h) => work.units[h.id]?.hp > 0).map((h) => h.id);
    } else if (es.target === 'self') {
      esTargets = [id];
    } else if (es.target === 'lowestEnemy') {
      const living = work.enemyIds.filter((eid) => work.units[eid]?.hp > 0);
      living.sort((a, b) => work.units[a].hp - work.units[b].hp);
      esTargets = living.length ? [living[0]] : [];
    } else if (es.target === 'lowestAlly') {
      const living = heroes.map((h) => h.id).filter((hid) => work.units[hid]?.hp > 0);
      living.sort(
        (a, b) => work.units[a].hp / work.units[a].maxHp - work.units[b].hp / work.units[b].maxHp,
      );
      esTargets = living.length ? [living[0]] : [];
    } else if (es.target === 'opposite') {
      const opposite = enemySlots(work.enemyIds, definitions)[slot];
      esTargets = opposite && work.units[opposite]?.hp > 0 ? [opposite] : [];
    } else if (es.target === 'enemy') {
      const eSlots = enemySlots(work.enemyIds, definitions);
      let oppId = slot !== undefined && slot !== null ? eSlots[slot] : null;
      if (!oppId || work.units[oppId]?.hp <= 0) {
        const living = work.enemyIds.filter((eid) => work.units[eid]?.hp > 0);
        if (living.length > 0) {
          if (slot !== undefined && slot !== null) {
            living.sort((a, b) => {
              const posA = eSlots.indexOf(a);
              const posB = eSlots.indexOf(b);
              const distA = posA >= 0 ? Math.abs(posA - slot) : 99;
              const distB = posB >= 0 ? Math.abs(posB - slot) : 99;
              return distA - distB;
            });
          }
          oppId = living[0];
        }
      }
      esTargets = oppId ? [oppId] : [];
    } else {
      esTargets = [id];
    }
    const effectsList = Array.isArray(es.effects) ? es.effects : [{ type: 'damage', value: 5 }];
    const entryDamageType = inferDamageType({ ...es, effects: effectsList }, inDef);
    if (es.selfDamage) lose(unit, es.selfDamage, '入场技 · 自身伤害');
    if (unit.hp > 0 && !guests.entry(id, es, outgoing)) {
      if (es.mechanic === 'luo-entry') {
        unit.block += definitions[id].attack;
        unit.nextBasicDouble = true;
      } else {
        effects(
          id,
          esTargets,
          effectsList,
          false,
          false,
          false,
          0,
          work.units[id]?.mark || 0,
          entryDamageType,
        );
      }
    }
    currentLogs.push(
      `${inDef.name}入场触发【${es.name}】${es.target === 'opposite' && !esTargets.length ? '，对位无存活敌人' : ''}`,
    );
    record('entrySkill', id, es.name, esTargets, actionId, es.id, {
      ...(entryDamageType ? { damageType: entryDamageType } : {}),
    });
  }
  function counterAttack(actor, target) {
    const unit = work.units[actor];
    const before = work.units[target].hp;
    const repeats = unit.buffs.meteor ? 2 : 1;
    const basicDamageType = resolveBasicAttackType(definitions[actor]);
    for (let cast = 0; cast < repeats && unit.hp > 0 && work.units[target].hp > 0; cast++) {
      const skill = abilityFor(work, actor, 'attack');
      const list = skill.effects.map((effect) => ({
        ...effect,
        value: effect.value * (unit.nextBasicDouble ? 2 : 1),
      }));
      unit.nextBasicDouble = false;
      trigger('beforeAttack', actor, { targets: [target] });
      attackHits = new Set();
      effects(
        actor,
        [target],
        list,
        false,
        !!unit.combined && definitions[actor].emblemId === 'tan-hongyu',
        false,
        0,
        work.units[actor]?.mark || 0,
        basicDamageType,
      );
      mechanics.attack(actor, attackHits);
      attackHits = null;
      trigger('afterAttack', actor, { targets: [target] });
      record('counter', actor, '毅明 · ' + skill.name, [target], null, 'attack', {
        repeatIndex: cast + 1,
        repeatCount: repeats,
        damageType: basicDamageType,
      });
    }
    return Math.max(0, before - work.units[target].hp);
  }
  function record(type, actor, label, targetIds = [], actionId = null, skill = null, detail = {}) {
    events.push({
      type,
      at: ['bossPhase', 'bombDetonate', 'bombDefuse'].includes(type) ? Math.max(0, at) : at,
      actor,
      label,
      targets: targetIds,
      actionId,
      skill,
      ...detail,
      logs: [...currentLogs],
      statusTriggers: [...currentStatusTriggers],
      procs: [...currentProcs],
      after: clone(work),
    });
    currentLogs = [];
    currentStatusTriggers = [];
    currentProcs = [];
    flushBossPhases();
  }
  function flushBossPhases() {
    const entries = [...pendingPhases.entries()];
    pendingPhases.clear();
    for (const [id, nextStage] of entries) {
      const unit = work.units[id];
      const def = definitions[id];
      if (!unit || unit.hp <= 0 || !def) continue;
      if (Array.isArray(def.overlordPhases) && def.overlordPhases.length >= 2) {
        const profile = overlordPhaseProfile(def, nextStage);
        unit.bossStage = nextStage;
        unit.enraged = nextStage >= 2;
        unit.broken = false;
        unit.brokenNextRound = false;
        delete unit.buffs.bind;
        unit.maxToughness = profile.toughness;
        unit.toughness = profile.toughness;
        const scale = unit.damageScale || 1;
        const shield = Math.round((profile.shield || 0) * scale);
        if (shield > 0) unit.block += shield;
        if (profile.strengthBonus) {
          unit.buffs.strength = Math.max(unit.buffs.strength || 0, profile.strengthBonus);
        }
        if (profile.artifactBonus) {
          unit.buffs.artifact = statusStacks(
            'artifact',
            (unit.buffs.artifact || 0) + profile.artifactBonus,
          );
        }
        const targets = heroes.map((hero) => hero.id).filter((target) => work.units[target].hp > 0);
        // A phase transition interrupts the remaining player turn, even with negative-status immunity.
        for (const target of targets) work.units[target].buffs.bind = 1;
        currentLogs.push(
          nextStage >= 3
            ? `${def.name}胸口的核心彻底碎裂暴走，滚烫炼金雾席卷全场（获得${profile.artifactBonus || 0}层人工制品与${shield}护盾，震退并打断我方本回合剩余行动）`
            : `${def.name}体内的反重力发条猛然失衡逆转（获得${profile.artifactBonus || 0}层人工制品与${shield}护盾，震退并打断我方本回合剩余行动）`,
        );
        record('bossPhase', id, def.name, targets, null, null, {
          phaseStage: nextStage,
          overlord: true,
          enraged: nextStage >= 2,
          clip: 'Special_Action',
        });
        continue;
      }
      prepareAresRound(id);
      const targets = heroes.map((hero) => hero.id).filter((target) => work.units[target].hp > 0);
      // A phase transition interrupts the remaining player turn, even with negative-status immunity.
      for (const target of targets) work.units[target].buffs.bind = 1;
      currentLogs.push(`${definitions[id].name}进入第二阶段，禁锢我方，本回合剩余行动跳过`);
      record('bossPhase', id, '第二阶段 · 禁锢冲击', targets);
    }
  }
  function prepareAresRound(id) {
    const unit = work.units[id];
    if (
      definitions[id]?.tactic?.mode !== 'ares' ||
      !unit.enraged ||
      unit.aresPreparedRound === work.round ||
      work.phase === 'opening'
    )
      return;
    unit.aresPreparedRound = work.round;
    const charge = aresDecision(work, id, definitions[id]).charging;
    unit.block += 5 + (charge ? 100 : 0);
    currentLogs.push(`${definitions[id].name} · 紧急肃清：获得${charge ? 105 : 5}护盾`);
  }
  if (s.phase !== 'opening' && work.activeAlchemicalBomb) {
    const bomb = clone(work.activeAlchemicalBomb);
    const targetUnit =
      work.units[bomb.target]?.hp > 0
        ? work.units[bomb.target]
        : work.units[heroes.find((h) => work.units[h.id]?.hp > 0)?.id];
    work.activeAlchemicalBomb = null;
    const expired = Boolean(work.bombExpired);
    work.bombExpired = false;
    if (expired && targetUnit) {
      const raw = alchemicalBombDamage(targetUnit);
      const absorbed = Math.min(targetUnit.block, raw);
      targetUnit.block -= absorbed;
      const damage = raw - absorbed;
      lose(targetUnit, damage, '定时炸弹引爆', true);
      if (targetUnit.hp > 0) applyBuff(bomb.owner, targetUnit.id, 'vulnerable', 2, true);
      currentLogs.push(
        `${definitions[bomb.owner]?.name || '炼金傀偶'}的定时炸弹在${definitions[targetUnit.id]?.name || targetUnit.id}身上引爆：造成${damage}伤害${absorbed ? `（护盾抵挡${absorbed}）` : ''}并附加2层易伤`,
      );
      record(
        'bombDetonate',
        bomb.owner,
        '超时引爆 · 炼金怀表炸裂！',
        [targetUnit.id],
        null,
        'alchemical-bomb-blast',
        {
          bomb,
          damage,
          absorbed,
        },
      );
      flushBossPhases();
    } else if (targetUnit) {
      currentLogs.push(
        `${definitions[targetUnit.id]?.name || targetUnit.id}身上的定时炼金炸弹已在限时内安全拆解`,
      );
      record(
        'bombDefuse',
        bomb.owner,
        '限时拆解 · 炼金引信锁死',
        [targetUnit.id],
        null,
        'alchemical-bomb-defuse',
        {
          bomb,
        },
      );
    }
  }
  const beforeTriggers = JSON.stringify(work);
  if (s.phase === 'opening') companions.start();
  for (const id of work.enemyIds) prepareAresRound(id);
  if (s.phase === 'opening') trigger('battleStart');
  else trigger('roundStart');
  guests.roundStart(slots);
  if (JSON.stringify(work) !== beforeTriggers) record('trigger', null, '装备与被动 · 开始');
  else flushBossPhases();
  const enemyActionIndex = {};
  for (at = 0; at < slots.length; at++) {
    let a = valid.find((a) => a.start === at);
    const enemy = slots[at];
    if (enemy) {
      const u = work.units[enemy];
      const actionIdx = enemyActionIndex[enemy] || 0;
      enemyActionIndex[enemy] = actionIdx + 1;
      if (u.hp <= 0) {
        record('skip', enemy, '敌人已濒死', [], null, null, { actionIndex: actionIdx });
        continue;
      }
      const move = intent(work, enemy, actionIdx);
      const unbreakableFixed = Boolean(
        move.fixedFirstSlot && definitions[enemy]?.fixedFirstSlot?.breakable === false,
      );
      if (u.buffs.bind && !unbreakableFixed) {
        currentLogs.push(
          u.broken
            ? `${definitions[enemy].name}处于击破晕眩，本回合行动取消`
            : `${definitions[enemy].name}受到禁锢，本回合行动取消`,
        );
        currentStatusTriggers.push({ id: enemy, type: u.broken ? 'break' : 'bind', value: 1 });
        record(
          'skip',
          enemy,
          u.broken
            ? move.fixedFirstSlot
              ? '击破震裂 · 定式先制跳过'
              : '击破晕眩 · 行动取消'
            : '禁锢 · 行动取消',
          [],
          null,
          null,
          {
            blockedBy: 'bind',
            ...(u.broken ? { broken: true } : {}),
            ...(move.fixedFirstSlot ? { fixedSlotBroken: true } : {}),
            actionIndex: actionIdx,
          },
        );
        continue;
      }
      bleed(enemy);
      if (u.hp <= 0) {
        record('skip', enemy, '流血致死 · 行动取消', [], null, null, { actionIndex: actionIdx });
        continue;
      }
      const newlyLockedUi = Boolean(definitions[enemy]?.overlord && !work.overlordUiLocked);
      if (newlyLockedUi) work.overlordUiLocked = enemy;
      if (move.fixedFirstSlot) {
        const bombTarget =
          move.bombTarget && work.units[move.bombTarget]?.hp > 0
            ? move.bombTarget
            : pickBombTarget(work, work.round);
        const bombArmed = bombTarget
          ? {
              owner: enemy,
              target: bombTarget,
              durationSec: move.bombSeconds || 40,
              phaseStage: u.bossStage || 1,
              round: work.round,
            }
          : null;
        if (bombArmed) work.pendingAlchemicalBomb = clone(bombArmed);
        currentLogs.push(
          `${definitions[enemy].name}触发先制【${move.name}】${bombTarget ? `，向${definitions[bombTarget]?.name || bombTarget}掷出定时炼金炸弹（限时${move.bombSeconds || 40}秒）` : ''}`,
        );
        record(
          'enemy',
          enemy,
          move.name,
          bombTarget ? [bombTarget] : [],
          null,
          'alchemical-time-bomb',
          {
            actionIndex: actionIdx,
            fixedFirstSlot: true,
            clip: move.clip || 'Bomb_Toss',
            ...(bombArmed ? { bombArmed: clone(bombArmed) } : {}),
            ...(newlyLockedUi ? { overlordDomainLock: true } : {}),
          },
        );
        continue;
      }
      const originalTargets = (move.slots || [move.slot])
          .map((slot) => work.formation[slot])
          .filter(Boolean),
        targets = move.effects.some((effect) => effect.type === 'damage')
          ? companions.forceTarget(enemy, originalTargets)
          : originalTargets;
      const forced = targets !== originalTargets;
      if (definitions[enemy].openingIntent && !u.openingAttackUsed && actionIdx === 0) {
        u.openingAttackUsed = true;
        u.openingUsedRound = work.round;
      } else if (definitions[enemy].openingIntent && !u.openingAttackUsed) {
        u.openingAttackUsed = true;
      }
      if (move.selfShield) effects(enemy, [enemy], [{ type: 'shield', value: move.selfShield }]);
      if (move.selfHeal) heal(enemy, move.selfHeal);
      if (move.selfCleanse) for (const key of NEGATIVE_STATUSES) delete u.buffs[key];
      if (move.selfBuff)
        effects(
          enemy,
          [enemy],
          Object.entries(move.selfBuff).map(([buff, value]) => ({ type: 'buff', buff, value })),
        );
      const resolvedEffects = [];
      for (const effect of move.effects) {
        const effectTarget = enemyEffectSide(effect);
        if (
          effect.type === 'buff' &&
          effect.buff === 'slow' &&
          effectTarget === 'opponents' &&
          !targets.some((id) => negativeImmune(work, id))
        )
          continue;
        const allied = work.enemyIds.filter((id) => work.units[id].hp > 0);
        const ownTargets =
          effectTarget === 'self'
            ? [enemy]
            : effectTarget === 'allAllies'
              ? allied
              : effectTarget === 'lowestAlly'
                ? [...allied]
                    .sort(
                      (a, b) =>
                        work.units[a].hp / work.units[a].maxHp -
                        work.units[b].hp / work.units[b].maxHp,
                    )
                    .slice(0, 1)
                : forced
                  ? targets
                  : effect.targetSlots
                    ? effect.targetSlots.map((slot) => work.formation[slot]).filter(Boolean)
                    : targets;
        resolvedEffects.push({ effect, ownTargets, effectTarget });
      }
      const missed = blindedTarget(
        work,
        enemy,
        resolvedEffects.flatMap(({ effect, ownTargets, effectTarget }) =>
          effect.type !== 'damage' || effectTarget !== 'opponents'
            ? []
            : u.buffs.balance
              ? front(work).filter(Boolean)
              : ownTargets,
        ),
      );
      blindMiss = missed ? { actor: enemy, target: missed } : null;
      if (missed) {
        currentLogs.push(
          `${definitions[enemy].name} · 致盲：对${definitions[missed].name}的伤害变为0`,
        );
        currentStatusTriggers.push({ id: enemy, type: 'blind', value: 1 });
      }
      const enemyDamageType = move.effects.some((effect) => effect.type === 'damage')
        ? inferDamageType(move, definitions[enemy]) || resolveBasicAttackType(definitions[enemy])
        : null;
      for (const { effect, ownTargets, effectTarget } of resolvedEffects) {
        effects(
          enemy,
          ownTargets,
          [effect],
          false,
          false,
          effectTarget === 'opponents' && u.buffs.balance
            ? (move.slots || [move.slot]).length
            : false,
          0,
          work.units[enemy]?.mark || 0,
          enemyDamageType,
        );
      }
      if (move.sinkingPlague && !work.sinkingPlague)
        work.sinkingPlague = { source: enemy, ages: [0, 0, 0] };
      const isOverlord = Boolean(definitions[enemy]?.overlord);
      record(
        'enemy',
        enemy,
        (isOverlord ? '' : u.bossStage >= 3 ? '【第三阶段】' : move.enraged ? '【第二阶段】' : '') +
          move.name,
        u.buffs.balance ? [...new Set([...targets, ...front(work).filter(Boolean)])] : targets,
        null,
        null,
        {
          blindTarget: missed,
          actionIndex: actionIdx,
          enraged: Boolean(u.enraged || move.enraged),
          bossStage: u.bossStage || 1,
          ...(move.clip ? { clip: move.clip } : {}),
          ...(newlyLockedUi ? { overlordDomainLock: true } : {}),
          ...(enemyDamageType ? { damageType: enemyDamageType } : {}),
        },
      );
      blindMiss = null;
      if (move.effects.some((effect) => effect.type === 'damage'))
        companions.afterEnemyAttack(enemy, targets);
    } else if (a) {
      const participants =
        a.kind === 'reposition'
          ? [work.formation[a.a], work.formation[a.b]]
          : a.kind === 'swap'
            ? [a.incoming, work.formation[a.slot]]
            : [a.actor];
      if (a.kind === 'skill') {
        const candidateSkill = abilityFor(work, a.actor, a.skill);
        const targetIssue =
          candidateSkill &&
          emblemTargetError(work, definitions[a.target], a.actor, candidateSkill, a.target);
        if (targetIssue) {
          invalid.push({ id: a.id, message: targetIssue });
          record('invalid', a.actor, targetIssue, [], a.id);
          continue;
        }
      }
      const bound = participants.find((id) => work.units[id]?.hp > 0 && work.units[id].buffs.bind);
      if (bound) {
        const message = `${definitions[bound].name}被禁锢，行动跳过`;
        skipped.push({ id: a.id, message });
        currentLogs.push(message);
        currentStatusTriggers.push({ id: bound, type: 'bind', value: 1 });
        record('skip', bound, '禁锢 · 行动跳过', [], a.id, a.skill || a.followUp?.skill, {
          blockedBy: 'bind',
        });
        continue;
      }
      if (a.kind === 'engage') {
        if (!canCombine(work, a.actor)) {
          invalid.push({ id: a.id, message: '结合需要存活的前场角色及六格充能' });
          record('invalid', a.actor, '无法结合', [], a.id);
          continue;
        }
        const unit = work.units[a.actor],
          embName = EMBLEMS[definitions[a.actor]?.emblemId]?.emblem?.name || '檀虹羽';
        unit.emblemCharge = 0;
        unit.combined = 3;
        unit.combineSkillUsed = false;
        record('engage', a.actor, `结合 · ${embName}`, [a.actor], a.id);
        if (!a.followUp) continue;
        a = { ...a, ...a.followUp, kind: 'skill', actor: a.actor };
      }
      if (a.kind === 'item') {
        const item = ITEMS[a.item];
        const unit = work.units[a.target];
        const count = work.items?.[a.item] || 0;
        const error = !unit || unit.hp <= 0 ? '道具目标已濒死' : count < 1 ? '道具数量不足' : '';
        if (error) {
          invalid.push({ id: a.id, message: error });
          record('invalid', null, error, [], a.id);
          continue;
        }
        work.items[a.item]--;
        currentLogs.push(`使用${item.name} → ${definitions[a.target].name}（1 AP）`);
        effects(null, [a.target], item.effects);
        trigger('itemUsed', null, { targets: [a.target] });
        record('item', null, item.name, [a.target], a.id, a.item);
        continue;
      }
      if (a.kind === 'reposition') {
        if (a.a === a.b || ![a.a, a.b].every((x) => Number.isInteger(x) && x >= 0 && x < 6)) {
          invalid.push({ id: a.id, message: '交换位置无效' });
          record('invalid', null, '交换位置无效', [], a.id);
          continue;
        }
        const first = work.formation[a.a],
          second = work.formation[a.b];
        if (bleed(first)) {
          record('skip', first, '流血致死 · 换位取消', [], a.id);
          continue;
        }
        [work.formation[a.a], work.formation[a.b]] = [second, first];
        if (a.a < 3 !== a.b < 3) {
          for (const [id, destination] of [
            [first, a.b],
            [second, a.a],
          ]) {
            if (id) {
              if (destination < 3) movedToFront.add(id);
              trigger(destination < 3 ? 'enterFront' : 'enterRear', id, { targets: [id] });
              if (destination < 3)
                triggerEntrySkill(id, a.id, destination, id === first ? second : first);
            }
          }
        }
        currentLogs.push(
          `${definitions[first]?.name || '空位'}与${definitions[second]?.name || '空位'}调整站位（1 AP）`,
        );
        record('swap', first || second, '调整站位', [second], a.id);
        continue;
      }
      if (a.kind === 'swap') {
        const outgoing = work.formation[a.slot],
          incoming = work.units[a.incoming];
        if (!incoming || incoming.hp <= 0 || !rear(work).includes(a.incoming)) {
          invalid.push({ id: a.id, message: '换入角色必须是存活的后场角色' });
          record('invalid', outgoing, '替换无效', [], a.id);
          continue;
        }
        if (bleed(outgoing || a.incoming)) {
          record('skip', outgoing || a.incoming, '流血致死 · 替换取消', [], a.id);
          continue;
        }
        const back = work.formation.indexOf(a.incoming);
        [work.formation[a.slot], work.formation[back]] = [a.incoming, outgoing];
        movedToFront.add(a.incoming);
        trigger('enterFront', a.incoming, { targets: [a.incoming] });
        if (outgoing) trigger('enterRear', outgoing, { targets: [outgoing] });
        const incDef = definitions[a.incoming];
        const hasEntry = incoming.entryReady && incDef?.entrySkill;
        currentLogs.push(
          hasEntry
            ? `${incDef.name}换入 · ${incDef.entrySkill.name}`
            : `${incDef.name}换入${['左', '中', '右'][a.slot]}位，${definitions[outgoing]?.name || '空位'}退到后场`,
        );
        record(
          'swap',
          a.incoming,
          hasEntry ? `换入 · ${incDef.entrySkill.name}` : '替换前场',
          [outgoing],
          a.id,
        );
        triggerEntrySkill(a.incoming, a.id, a.slot, outgoing);
        continue;
      }
      const u = work.units[a.actor],
        skill = abilityFor(work, a.actor, a.skill),
        def = definitions[a.actor];
      if (u.hp <= 0) {
        skipped.push({ id: a.id, message: '角色在此之前已濒死' });
        record('skip', a.actor, '濒死行动取消', [], a.id);
        continue;
      }
      const isOverloaded =
        !!u.buffs.overload && a.skill !== 'attack' && EMBLEMS[def.emblemId]?.skill?.id !== a.skill;
      const mpCost = skill.mp * (isOverloaded ? 2 : 1);
      const hpCost = (skill.hp || 0) * (isOverloaded ? 2 : 1);
      let error = '';
      if (EMBLEMS[def.emblemId]?.skill?.id === a.skill && (!u.combined || u.combineSkillUsed))
        error = '结合技需要结合状态，且每次结合限用一次';
      else if (!front(work).includes(a.actor)) error = '角色此时仍在后场，需要先换入';
      else if (u.used >= def.limit + effectiveBuff(work, a.actor, 'haste'))
        error = '超过角色本回合行动次数';
      else if (u.mp < mpCost) error = '蓝量不足';
      else if (hpCost && u.hp <= hpCost) error = '生命不足，不能支付生命消耗';
      let targets =
        skill.target === 'allAllies'
          ? heroes.map((h) => h.id)
          : skill.target === 'allEnemies'
            ? getEnemies(work).map((e) => e.id)
            : [a.target];
      targets = guests.targets(a.actor, skill, targets);
      if (
        targets.some(
          (id) =>
            !work.units[id] ||
            (skill.target === 'enemy' && work.units[id].side !== 'enemy') ||
            (skill.target === 'ally' && work.units[id].side !== 'hero'),
        )
      )
        error = '技能目标无效';
      error ||= emblemTargetError(work, definitions[a.target], a.actor, skill, a.target);
      error ||= companions.targetError(a.actor, skill, a.target);
      if (error) {
        invalid.push({ id: a.id, message: error });
        record('invalid', a.actor, error, [], a.id);
        continue;
      }
      bleed(a.actor);
      if (u.hp <= 0) {
        skipped.push({ id: a.id, message: '行动前流血致死' });
        record('skip', a.actor, '流血致死 · 行动取消', [], a.id);
        continue;
      }
      if (hpCost && u.hp <= hpCost) {
        skipped.push({ id: a.id, message: '流血后生命不足以支付技能消耗' });
        record('skip', a.actor, '生命消耗不足 · 行动取消', [], a.id);
        continue;
      }
      u.mp -= mpCost;
      if (mpCost) trigger('manaSpent', a.actor, { targets });
      if (hpCost) {
        u.hp -= hpCost;
        currentLogs.push(`${definitions[a.actor].name}消耗${hpCost}生命`);
      }
      if (isOverloaded) {
        delete u.buffs.overload;
        currentLogs.push(`${definitions[a.actor].name}超限负荷：消耗翻倍`);
      }
      u.used++;
      const attack = skill.effects.some((effect) => effect.type === 'damage');
      const attackedEnemy =
        attack && targets.some((id) => work.units[id]?.side === 'enemy' && work.units[id].hp > 0);
      const repeats = isOverloaded || (a.skill === 'attack' && u.buffs.meteor) ? 2 : 1;
      for (let cast = 0; cast < repeats && u.hp > 0; cast++) {
        if (cast && u.buffs.bind) {
          const message = `${def.name}被禁锢，后一次施放跳过`;
          currentLogs.push(message);
          record('skip', a.actor, message, [], a.id, a.skill, {
            blockedBy: 'bind',
            repeatIndex: cast + 1,
          });
          break;
        }
        if (cast)
          currentLogs.push(
            `${def.name} · ${isOverloaded ? '超限负荷：技能额外生效一次' : '流星剑姿：普通攻击额外攻击一次'}`,
          );
        if (attack) trigger('beforeAttack', a.actor, { targets });
        if (u.hp <= 0) break;
        attackHits = new Set();
        attackInjuries = new Set();
        const echo =
          !!u.combined &&
          attack &&
          skill.target === 'enemy' &&
          (!def.emblemId || def.emblemId === 'tan-hongyu');
        const bonus =
          def.emblemId === OVERLOAD_EMBLEM_ID && a.skill !== 'attack'
            ? Math.round(mpCost * 0.25)
            : 0;
        const heroDamageType =
          a.skill === 'attack' ? resolveBasicAttackType(def) : inferDamageType(skill, def);
        if (['junlue', 'soul-revive', 'soul-banquet'].includes(skill.mechanic)) {
          if (skill.mechanic === 'junlue')
            effects(
              a.actor,
              targets,
              skill.effects,
              false,
              echo,
              false,
              bonus,
              undefined,
              heroDamageType,
            );
          companions.cast(a.actor, skill, a.target);
        } else if (skill.mechanic) mechanics.cast(a.actor, skill, a.target);
        else {
          const list =
            a.skill === 'attack' && u.nextBasicDouble
              ? skill.effects.map((effect) =>
                  effect.type === 'damage' ? { ...effect, value: effect.value * 2 } : effect,
                )
              : skill.effects;
          if (a.skill === 'attack') u.nextBasicDouble = false;
          effects(a.actor, targets, list, false, echo, false, bonus, undefined, heroDamageType);
        }
        mechanics.attack(a.actor, attackHits);
        if (a.skill === 'attack') guests.afterBasicAttack(a.actor, attackInjuries);
        guests.afterCast(a.actor, skill);
        attackHits = null;
        attackInjuries = null;
        if (a.skill !== 'attack') trigger('skillCast', a.actor, { targets });
        if (cast === 0 && a.skill === 'attack' && attackedEnemy && def.basicAttackMark && u.hp > 0)
          u.mark = Math.min(def.mechanicMark?.max || 3, (u.mark || 0) + def.basicAttackMark);
        if (attack) trigger('afterAttack', a.actor, { targets });
        if (EMBLEMS[def.emblemId]?.skill?.id === a.skill) u.combineSkillUsed = true;
        if (cast === repeats - 1) {
          if (attackedEnemy && def.emblemId && !u.combined)
            u.emblemCharge = Math.min(6, (u.emblemCharge || 0) + 1);
        }
        record('hero', a.actor, skill.name, targets, a.id, a.skill, {
          repeatCount: repeats,
          repeatIndex: cast + 1,
          costs: { mp: cast ? 0 : mpCost, hp: cast ? 0 : hpCost },
          ...(heroDamageType ? { damageType: heroDamageType } : {}),
        });
        if (
          cast === repeats - 1 &&
          skill.retreatSwap &&
          u.hp > 0 &&
          front(work).includes(a.actor)
        ) {
          const frontSlot = work.formation.indexOf(a.actor);
          const rearIncoming = work.formation
            .slice(3)
            .find((hid) => hid && work.units[hid]?.hp > 0);
          const backSlot = rearIncoming ? work.formation.indexOf(rearIncoming) : -1;
          if (frontSlot >= 0 && frontSlot < 3 && backSlot >= 3 && rearIncoming) {
            [work.formation[frontSlot], work.formation[backSlot]] = [rearIncoming, a.actor];
            movedToFront.add(rearIncoming);
            trigger('enterFront', rearIncoming, { targets: [rearIncoming] });
            trigger('enterRear', a.actor, { targets: [a.actor] });
            const incDef = definitions[rearIncoming];
            const incomingUnit = work.units[rearIncoming];
            const hasEntry = incomingUnit?.entryReady && incDef?.entrySkill;
            currentLogs.push(
              hasEntry
                ? `${def.name}撤至后场，${incDef.name}换入 · ${incDef.entrySkill.name}`
                : `${def.name}撤至后场，${incDef.name}补位入阵`,
            );
            record(
              'swap',
              rearIncoming,
              hasEntry ? `换入 · ${incDef.entrySkill.name}` : '战术撤换',
              [a.actor],
              a.id,
            );
            triggerEntrySkill(rearIncoming, a.id, frontSlot, a.actor);
          }
        }
      }
    } else if (!usedSlots.has(at)) record('wait', null, '保留行动');
  }
  if (s.phase !== 'opening') {
    at = slots.length;
    trigger('roundEnd');
    mechanics.roundEnd();
    for (const hero of heroes) {
      const unit = work.units[hero.id];
      if (!unit || unit.hp <= 0) continue;
      if (rearAtStart.has(hero.id) && !movedToFront.has(hero.id) && rear(work).includes(hero.id)) {
        unit.entryReady = true;
      }
      if (!hero.emblemId) continue;
      if (!unit.combined && rear(work).includes(hero.id))
        unit.emblemCharge = Math.min(6, (unit.emblemCharge || 0) + 2);
    }
    record('emblem', null, '纹章 · 充能与结合时限');
    for (const u of Object.values(work.units)) {
      const regen = u.hp > 0 ? effectiveBuff(work, u.id, 'regen') : 0;
      if (regen) heal(u.id, regenHealAmount(u.maxHp, regen));
    }
    record('regen', null, '回合末 · 再生先结算');
    for (const u of Object.values(work.units))
      if (u.hp > 0 && effectiveBuff(work, u.id, 'poison')) {
        const value = effectiveBuff(work, u.id, 'poison');
        lose(u, value, '回合末中毒');
        currentLogs.push(`${definitions[u.id].name}中毒${value}`);
        currentStatusTriggers.push({ id: u.id, type: 'poison', value });
      }
    record('poison', null, '回合末 · 中毒结算');
    if (work.sinkingPlague) {
      const targets = [];
      work.sinkingPlague.ages = work.sinkingPlague.ages.map((age, slot) => {
        const elapsed = age + 1;
        const id = work.formation[slot];
        if (work.units[id]?.hp > 0) {
          const value = elapsed * 2;
          lose(work.units[id], value, '沉疫');
          currentLogs.push(`${definitions[id].name}受到沉疫${value}伤害（第${elapsed}回合）`);
          currentStatusTriggers.push({ id, type: 'sinkingPlague', value });
          targets.push(id);
        }
        return elapsed;
      });
      record('sinkingPlague', work.sinkingPlague.source, '回合末 · 沉疫', targets);
    }
    const decay = decayStatuses(work.units);
    for (const change of decay)
      currentLogs.push(
        `${definitions[change.id].name}的${change.buff}从${change.before}层衰减至${change.after}层`,
      );
    if (decay.length) record('decay', null, '回合末 · 状态衰减', [], null, null, { decay });
    for (const unit of Object.values(work.units)) {
      if (unit.combined) {
        unit.combined--;
        if (!unit.combined) unit.combineSkillUsed = false;
      }
    }
    record('emblem', null, '回合末 · 结合时限');
  }
  for (const u of Object.values(work.units)) delete u.buffs.bind;
  return { final: work, events, invalid, skipped, deaths, slows, slots };
}
export function preview(s, plan = s?.plan || []) {
  let extra = {},
    result,
    signature = '',
    stable = false;
  for (let i = 0; i < 12; i++) {
    const slots = enemyTimeline(s, extra);
    result = simulate(s, plan, slots);
    const next = JSON.stringify(result.slows);
    if (next === signature) {
      stable = true;
      break;
    }
    signature = next;
    extra = result.slows;
  }
  if (!stable)
    result.invalid.push({ id: 'timeline', message: '迟缓与行动位置互相冲突，请调整编排' });
  result.valid = result.invalid.length === 0;
  result.outcome =
    livingEnemies(result.final).length === 0
      ? 'victory'
      : heroesFor(result.final).every((h) => result.final.units[h.id].hp === 0)
        ? 'defeat'
        : null;
  return result;
}
export function advance(result) {
  if (!result.valid) throw Error('Invalid plan');
  const s = clone(result.final);
  delete s.bombExpired;
  if (result.outcome) {
    delete s.pendingAlchemicalBomb;
    delete s.activeAlchemicalBomb;
    delete s.overlordUiLocked;
    s.phase = result.outcome;
    return s;
  }
  const opening = s.phase === 'opening';
  s.phase = 'plan';
  s.round = opening ? 1 : s.round + 1;
  if (opening)
    s.openingTargetSlots = Object.fromEntries(
      s.enemyIds
        .filter((id) => definition(s, id).openingIntent?.lowestHpPosition)
        .map((id) => [id, intent(s, id).slot]),
    );
  for (const u of Object.values(s.units)) {
    u.used = 0;
    if (!opening) u.block = 0;
    if (u.side === 'enemy') {
      if (u.brokenNextRound) {
        u.brokenNextRound = false;
        u.buffs.bind = 1;
      } else if (u.broken) {
        u.broken = false;
        u.toughness = u.maxToughness;
      }
    }
  }
  if (s.pendingAlchemicalBomb) {
    const pending = s.pendingAlchemicalBomb;
    delete s.pendingAlchemicalBomb;
    const ownerAlive = s.units[pending.owner]?.hp > 0;
    const targetId = s.units[pending.target]?.hp > 0 ? pending.target : pickBombTarget(s, s.round);
    if (ownerAlive && targetId) {
      s.activeAlchemicalBomb = { ...pending, target: targetId };
    }
  }
  lockEnemyDecisions(s, definitionsFor(s));
  return s;
}
export function newEncounter(spec, prior = null, index = 0, heroDefinitions = {}) {
  if (prior) {
    prior = clone(prior);
    clearBattleMechanics(prior);
  }
  prior = withoutDiningBonus(prior);
  const s = newBattle(
    spec.enemyIds,
    prior?.heroDefinitions || heroDefinitions,
    spec.enemyDefinitions || prior?.enemyDefinitions || {},
    mergeRevealedWeaknessMap(prior?.revealedWeaknesses, spec.revealedWeaknesses),
  );
  s.formation = prior ? [...prior.formation] : s.formation;
  s.procUses = clone(prior?.procUses || {});
  for (const key of ['soulLoans', 'soulSpent', 'expeditionModifiers'])
    if (prior?.[key]) s[key] = clone(prior[key]);
  s.enemyIds = [...spec.enemyIds];
  s.items = restoreBag(prior?.items);
  s.encounter = index;
  s.map = spec.map;
  s.enemyDamageScale = spec.enemyDamageScale || 1;
  s.level = spec.level || 1;
  s.seed += index * 17;
  const units = {};
  for (const h of heroesFor(s)) {
    units[h.id] = prior
      ? {
          ...clone(prior.units[h.id]),
          buffs: clone(s.units[h.id].buffs),
          block: 0,
          used: 0,
          combined: 0,
          combineSkillUsed: false,
          counterDisabled: false,
          nextBasicDouble: false,
          entryReady: s.formation.slice(3).includes(h.id),
          ...(h.mechanicMark ? { mark: 0 } : {}),
        }
      : s.units[h.id];
    if (spec.environment?.bonusMp) units[h.id].maxMp = s.units[h.id].maxMp;
  }
  for (const id of spec.enemyIds) {
    const d = definition(s, id),
      growth = spec.growthEntry
        ? enemyGrowth(spec.growthEntry, index, id, d.boss, d.elite)
        : { level: 1, hpScale: 1, damageScale: 1 },
      hp = Math.max(
        1,
        Math.round(d.hp * growth.hpScale * (d.boss ? spec.bossHpScale || 1 : spec.hpScale || 1)),
      );
    const enemyBreak = resolveEnemyBreakProfile(d);
    units[id] = {
      id,
      side: 'enemy',
      level: growth.level,
      growth: { hp: hp - d.hp },
      damageScale: growth.damageScale,
      hp,
      maxHp: hp,
      mp: 0,
      maxMp: 0,
      block: 0,
      buffs: Object.fromEntries(
        Object.entries(d.buffs || {}).map(([key, value]) => [key, statusStacks(key, value)]),
      ),
      used: 0,
      speciesKey: enemyBreak.speciesKey,
      bossStage: 1,
      toughness: enemyBreak.maxToughness,
      maxToughness: enemyBreak.maxToughness,
      weaknesses: [...enemyBreak.weaknesses],
      broken: false,
      brokenNextRound: false,
    };
  }
  s.units = units;
  for (const [id, charge] of Object.entries(spec.initialEmblemCharge || {})) {
    if (units[id]?.side === 'hero' && EMBLEMS[s.heroDefinitions[id]?.emblemId])
      units[id].emblemCharge = Math.max(0, Math.min(6, charge));
  }
  for (const [id, buffs] of Object.entries(spec.initialEnemyBuffs || {})) {
    if (units[id]?.side === 'enemy')
      for (const [key, value] of Object.entries(buffs))
        units[id].buffs[key] = statusStacks(key, value);
  }
  // Aim the vulnerability lesson at an occupied base once. Later repositioning can still dodge it.
  if (spec.occupiedOpeningTarget) {
    const occupied = s.formation.slice(0, 3).findIndex((id) => units[id]?.hp > 0);
    s.enemyIntentSlots = Object.fromEntries(
      spec.enemyIds.map((id) => {
        const move = intent(s, id);
        const slot = units[s.formation[move.slot]]?.hp > 0 ? move.slot : occupied;
        return [id, slot];
      }),
    );
  }

  return s;
}
/** Battle carry clears transient statuses without restoring either resource. */
export function campRest(s, recovery = null) {
  if (recovery !== null && !['sleep', 'meal'].includes(recovery)) throw Error('休整方式无效');
  const rested = clone(s);
  clearBattleMechanics(rested);
  const changes = [];
  for (const hero of heroesFor(s)) {
    const unit = rested.units[hero.id];
    const before = { hp: unit.hp, mp: unit.mp };
    if (recovery === 'sleep') unit.hp += Math.ceil((unit.maxHp - unit.hp) * REST_LOSS_RECOVERY);
    if (recovery === 'meal') unit.mp += Math.ceil((unit.maxMp - unit.mp) * REST_LOSS_RECOVERY);
    unit.block = 0;
    unit.buffs = {};
    unit.used = 0;
    changes.push({
      id: hero.id,
      before: before.hp,
      after: unit.hp,
      mp: unit.mp,
      beforeMp: before.mp,
      maxHp: unit.maxHp,
      maxMp: unit.maxMp,
    });
  }
  return { state: rested, changes };
}
