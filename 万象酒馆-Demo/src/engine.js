import { resolveBattleRoundEnd } from './battle-round-end.js';
export {
  makeAction,
  makeEngage,
  makeItem,
  makeReposition,
  makeSwap,
} from './battle-plan-actions.js';
import { enemyTimeline, intent } from './battle-enemy-intents.js';
export { enemyActionsCount, enemyIntents, enemyTimeline, intent } from './battle-enemy-intents.js';
import { effectiveBuff, front, getEnemies, livingEnemies, rear } from './battle-state-readers.js';
export { effectiveBuff, front, getEnemies, livingEnemies, rear } from './battle-state-readers.js';
import { createAuxiliaryActions } from './battle-auxiliary-actions.js';
import { enemyEffectSide } from './enemy-targets.js';
import { withoutDiningBonus } from './dining.js';
import { aresDecision, nextBossStage } from './ares.js';
import { createCompanionMechanics } from './companion-mechanics.js';
import { createTownGuestMechanics } from './town-guest-mechanics.js';
import { lockEnemyDecisions } from './enemy-tactics.js';
import {
  alchemicalBombDamage,
  createOverlordMechanics,
  lockHiddenWeapons,
  isPlagueSealed,
  overlordPhaseLog,
  overlordPhaseProfile,
  pickBombTarget,
  pickCorruptedTimelineSlot,
} from './overlord-mechanics.js';
import { BREAKER_EMBLEM_ID, canCombine, EMBLEMS, OVERLOAD_EMBLEM_ID } from './emblems.js';
import { restoreBag } from './content/items.js';
import { definition, definitionsFor, heroesFor, abilityFor } from './catalog.js';
import { validateAction } from './validation.js';
import { HEROES, DEFINITIONS, BUFFS, encounterSpec, enemySlots } from './data.js';
import {
  rulesFor,
  conditionsMet,
  triggerTargets,
  ruleUsageKey,
  ruleHasUnlimitedUses,
  POSITIVE_BUFFS,
} from './triggers.js';
import {
  statusStacks,
  NEGATIVE_STATUSES,
  blindedTarget,
  pickAttackTarget,
  applyStrengthBonus,
  applyWeakReduction,
  applyVulnerableBonus,
  applyIronReduction,
  applyGuardShield,
} from './status-rules.js';
import { recordCooperationHit } from './cooperation.js';
import { enemyGrowth } from './enemy-growth.js';
import { REST_LOSS_RECOVERY } from './content/journey-rules.js';
import {
  createEmblemMechanics,
  emblemTargetError,
  clearBattleMechanics,
  negativeImmune,
} from './emblem-mechanics.js';
import { inferDamageType, isDamageType, resolveBasicAttackType } from './damage-types.js';
import {
  breakImpactDelta,
  createBreakWindow,
  mergeRevealedWeaknessMap,
  resolveEnemyBreakProfile,
  shouldOpenBreakWindow,
  speciesKeyOf,
} from './octopath.js';
export const clone = (x) => structuredClone(x);
export function battleResourceLimits(definition) {
  const hp = definition.hp;
  const mp =
    definition.mp +
    (definition.skills || []).reduce(
      (total, skill) => total + (skill.location === '战斗外' ? skill.bonusMp || 0 : 0),
      0,
    );
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
                  toughness: enemyBreak.alwaysBreakWindow ? enemyBreak.maxToughness : 0,
                  maxToughness: enemyBreak.alwaysBreakWindow ? enemyBreak.maxToughness : 0,
                  weaknesses: [...enemyBreak.weaknesses],
                  breakWindow: enemyBreak.alwaysBreakWindow
                    ? createBreakWindow(d, null, 1, Boolean(d.fixedFirstSlot))
                    : null,
                  broken: false,
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
  const corruptedSlot =
    s.phase !== 'opening' && Number.isInteger(work.sinkingPlague?.corruptedSlot)
      ? work.sinkingPlague.corruptedSlot
      : null;
  const valid = [];
  for (const a of sorted) {
    let error = '';
    if (
      !Number.isSafeInteger(a.start) ||
      a.start < 0 ||
      !Number.isSafeInteger(a.ap) ||
      a.ap < 1 ||
      a.start > slots.length ||
      a.ap > slots.length - a.start
    ) {
      invalid.push({ id: a.id, message: '没有足够的连续时间格' });
      continue;
    }
    for (let i = a.start; i < a.start + a.ap; i++) {
      if (slots[i]) error = '与敌人行动重叠';
      if (usedSlots.has(i)) error = '与其他行动重叠';
      if (
        !error &&
        corruptedSlot !== null &&
        i === corruptedSlot &&
        !slots[corruptedSlot] &&
        !['swap', 'reposition'].includes(a.kind)
      ) {
        error = '该格已被【沉疫】腐化：仅限换位，或以迟缓逼敌踩占解除';
      }
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
    currentStatusApplications = [],
    currentProcs = [],
    procSource = null,
    attackHits = null,
    attackInjuries = null;
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
          !conditionsMet(work, hero.id, rule.conditions, {
            target: detail.targets?.[0],
            allowDefeatedTarget: event === 'kill',
          }) ||
          (!ruleHasUnlimitedUses(rule) && (work.procUses[key] || 0) >= rule.limit)
        )
          continue;
        const targets = triggerTargets(work, hero.id, rule.target, detail);
        if (!targets.length) continue;
        if (!ruleHasUnlimitedUses(rule)) work.procUses[key] = (work.procUses[key] || 0) + 1;
        currentLogs.push(`${hero.name} · ${rule.name}`);
        currentProcs.push({
          owner: hero.id,
          key: rule.key,
          name: rule.name,
          equipment: rule.key.startsWith('equipment:'),
        });
        const previousSource = procSource;
        procSource = rule.name;
        try {
          effects(hero.id, targets, rule.effects, true);
        } finally {
          procSource = previousSource;
        }
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
    u.hp = Math.max(work.developerLockHp === true && u.side === 'hero' ? 1 : 0, u.hp - n);
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
    if (!u || u.hp <= 0) return;
    if (isPlagueSealed(work, id)) {
      if (n > 0) currentLogs.push(`${definitions[id].name}受【沉疫封锁】影响，无法回复生命`);
      return;
    }
    const gain = Math.max(0, Math.min(n, u.maxHp - u.hp));
    u.hp += gain;
    if (gain) {
      currentLogs.push(`${definitions[id].name}回复${gain}生命`);
      if (!generated) trigger('healed', id, { targets: [id] });
    }
  }
  function restoreMana(id, n, generated = false) {
    const unit = work.units[id];
    if (!unit || unit.hp <= 0) return 0;
    if (isPlagueSealed(work, id)) {
      if (n > 0) currentLogs.push(`${definitions[id].name}受【沉疫封锁】影响，无法回复法力`);
      return 0;
    }
    const gained = Math.max(0, Math.min(n, unit.maxMp - unit.mp));
    unit.mp += gained;
    if (gained) currentLogs.push(`${definitions[id].name}回复${gained}法力`);
    if (gained && !generated) trigger('manaRestored', id, { targets: [id] });
    return gained;
  }
  function clearRearPlagueSeals() {
    if (!work.sinkingPlague) return;
    work.sinkingPlague.frontStreak ||= {};
    work.sinkingPlague.sealed ||= {};
    for (const id of rear(work)) {
      if (!id) continue;
      work.sinkingPlague.frontStreak[id] = 0;
      if (work.sinkingPlague.sealed[id]) {
        delete work.sinkingPlague.sealed[id];
        currentLogs.push(`${definitions[id].name}退回后场，【沉疫封锁】立刻解除！`);
      }
    }
  }
  function applyBuff(actor, id, key, value, generated = false, source = procSource) {
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
    if (gained > 0 && NEGATIVE_STATUSES.includes(key) && !negativeImmune(work, id)) {
      currentStatusApplications.push({ actor, target: id, buff: key, value: gained, source });
      overlords.onNegative(id);
    }
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
  function cleanse(id, buffs = NEGATIVE_STATUSES) {
    const unit = work.units[id];
    const removed = buffs.filter((key) => unit.buffs[key] > 0);
    for (const key of removed) delete unit.buffs[key];
    if (removed.length)
      currentLogs.push(
        `${definitions[id].name} · 净化：移除${removed.map((key) => BUFFS[key].name).join('、')}`,
      );
  }
  function confusionFor(actor, actionIndex = 0) {
    if (!effectiveBuff(work, actor, 'confusion')) return {};
    const hero = work.units[actor].side === 'hero';
    const team = hero ? heroes.map((member) => member.id) : work.enemyIds;
    const living = team.filter((id) => id !== actor && work.units[id]?.hp > 0);
    // Player targeting uses the round-start roster so editing plans cannot reroll a living target.
    const initial = hero
      ? pickAttackTarget(
          s,
          actor,
          team.filter((id) => id !== actor && s.units[id]?.hp > 0),
        )
      : null;
    const target = living.includes(initial)
      ? initial
      : pickAttackTarget(work, actor, living, actionIndex);
    return target ? { confusionTarget: target } : { confusionReduction: true };
  }
  function reportConfusion(actor, { confusionTarget, confusionReduction }) {
    if (!confusionTarget && !confusionReduction) return;
    const text = confusionTarget
      ? `转而攻击${definitions[confusionTarget].name}`
      : '没有存活队友，攻击伤害降低15%';
    currentLogs.push(`${definitions[actor].name} · 混乱：${text}`);
    currentStatusTriggers.push({ id: actor, type: 'confusion', value: 1 });
  }
  function heroAttackStatus(actor, targets, list, echo = false) {
    if (!list.some((effect) => effect.type === 'damage')) return {};
    const status = confusionFor(actor);
    if (status.confusionTarget || !effectiveBuff(work, actor, 'blind')) return status;
    const damageTargets = list
      .filter((effect) => effect.type === 'damage')
      .flatMap((effect) => (effect.target === 'allEnemies' || echo ? work.enemyIds : targets));
    return { ...status, blindTarget: blindedTarget(work, actor, damageTargets) };
  }
  const mechanics = createEmblemMechanics(work, definitions, {
    lose,
    heal,
    restoreMana,
    buff: applyBuff,
    statusTrigger: (entry) => currentStatusTriggers.push(entry),
    log: (text) => currentLogs.push(text),
    damage: (actor, target, value) =>
      effects(actor, [target], [{ type: 'damage', value, flat: true }], true),
  });
  const companions = createCompanionMechanics(work, definitions, {
    log: (text) => currentLogs.push(text),
    effect: (id, effect) => effects(id, [id], [effect], true),
    basicAttack: counterAttack,
    heal: (id, amount) => heal(id, amount, true),
    restoreMana: (id, amount) => restoreMana(id, amount, true),
    record,
  });
  const guests = createTownGuestMechanics(work, definitions, {
    effects,
    log: (text) => currentLogs.push(text),
  });
  work.revealedWeaknesses = mergeRevealedWeaknessMap({}, work.revealedWeaknesses);
  const isBreakerCombined = (actorId) =>
    Boolean(
      actorId &&
      work.units[actorId]?.hp > 0 &&
      work.units[actorId]?.combined > 0 &&
      definitions[actorId]?.emblemId === BREAKER_EMBLEM_ID,
    );
  const grantShield = (unitId, baseValue) => {
    const unit = work.units[unitId];
    if (!unit || unit.hp <= 0) return false;
    if (isPlagueSealed(work, unitId)) {
      if (baseValue > 0)
        currentLogs.push(`${definitions[unitId].name}受【沉疫封锁】影响，无法获得护盾`);
      return false;
    }
    const n = applyGuardShield(baseValue, effectiveBuff(work, unitId, 'guard'));
    unit.block += n;
    companions.gain(unitId, { type: 'shield', value: n });
    currentLogs.push(`${definitions[unitId].name}获得${n}护盾`);
    return true;
  };
  const grantFrontBreakerShield = (actorId, reason) => {
    for (const fid of front(work)) {
      if (work.units[fid]?.hp > 0) grantShield(fid, 6);
    }
    currentLogs.push(
      `${definitions[actorId]?.name || actorId} · 破壳共鸣：${reason}，全前排获得6护盾`,
    );
  };
  const overlords = createOverlordMechanics(work, definitions, {
    buff: applyBuff,
    shield: grantShield,
    log: (text) => currentLogs.push(text),
    statusTrigger: (entry) => currentStatusTriggers.push(entry),
    record,
  });
  function applyBreakImpact(targetId, damageType, actorId) {
    const breakerActive = isBreakerCombined(actorId);
    if (!isDamageType(damageType) && !breakerActive) return;
    const targetUnit = work.units[targetId];
    if (!targetUnit || targetUnit.side !== 'enemy') return;
    if (targetUnit.hp <= 0 || targetUnit.broken || !targetUnit.breakWindow?.active) return;
    const baseDelta = isDamageType(damageType)
      ? breakImpactDelta(targetUnit.breakWindow, damageType)
      : 0;
    const delta = baseDelta + (breakerActive ? 1 : 0);
    if (delta <= 0) return;
    if (baseDelta > 0 && isDamageType(damageType)) {
      const spKey = targetUnit.speciesKey || speciesKeyOf(definitions[targetId] || targetId);
      if (spKey) {
        const existing = work.revealedWeaknesses[spKey] || [];
        if (!existing.includes(damageType)) {
          work.revealedWeaknesses[spKey] = [...existing, damageType];
        }
      }
    }
    targetUnit.breakWindow.current = Math.max(0, targetUnit.breakWindow.current - delta);
    targetUnit.toughness = targetUnit.breakWindow.current;
    if (targetUnit.breakWindow.current === 0) {
      targetUnit.broken = true;
      targetUnit.breakWindow = null;
      targetUnit.toughness = 0;
      delete targetUnit.chargingMove;
      overlords.onBreak(targetId);
      currentStatusTriggers.push({ id: targetId, type: 'break', value: delta });
      currentLogs.push(
        `${definitions[actorId]?.name || ''}击破了${definitions[targetId].name}的破绽！本回合后续行动全部打断，陷入破防失衡（本回合受伤+50%）！`,
      );
      if (breakerActive) grantFrontBreakerShield(actorId, '触发破防');
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
    attackStatus = {},
  ) {
    let consumedMark = false;
    const allowed = (effect, id) =>
      !effect.when || conditionsMet(work, actor, [effect.when], { target: id, mark: markSnapshot });
    for (const eff of list || []) {
      const value = (eff.value || 0) + (eff.perMark || 0) * markSnapshot;
      let applied = false;
      if (eff.type === 'selfHeal') {
        if (!allowed(eff, actor)) continue;
        heal(actor, value, generated);
        consumedMark ||= eff.consumeMark === true;
        continue;
      }
      if (eff.type === 'selfMana') {
        const unit = work.units[actor];
        if (!unit || unit.hp <= 0 || !allowed(eff, actor)) continue;
        restoreMana(actor, value, generated);
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
      const redirected =
        attackStatus.confusionTarget &&
        (eff.type === 'damage' || (eff.type === 'buff' && NEGATIVE_STATUSES.includes(eff.buff))) &&
        !['self', 'allAllies', 'lowestAlly'].includes(eff.target);
      const selected = redirected
        ? [attackStatus.confusionTarget]
        : actor && ['self', 'target', 'lowestAlly', 'allAllies', 'allEnemies'].includes(eff.target)
          ? triggerTargets(work, actor, eff.target, { targets })
          : targets;
      const affected =
        eff.type === 'damage' && echo && !redirected
          ? [...new Set([...selected, ...work.enemyIds])]
          : eff.type === 'damage' && split && !redirected
            ? front(work).filter(Boolean)
            : selected;
      for (const id of affected) {
        const u = work.units[id];
        if (!u || u.hp <= 0 || !allowed(eff, id)) continue;
        applied = true;
        if (eff.type === 'damage') {
          const strength = actor && !eff.flat ? effectiveBuff(work, actor, 'strength') : 0;
          let n = applyStrengthBonus(value + bonus, strength);
          if (work.units[actor]?.side === 'enemy')
            n = Math.max(1, Math.round(n * (work.enemyDamageScale || 1)));
          if (!eff.flat) n = overlords.damageBonus(actor, n);
          if (!eff.flat && actor) n = applyWeakReduction(n, effectiveBuff(work, actor, 'weak'));
          if (!eff.flat && actor && n > 0 && effectiveBuff(work, actor, 'balance'))
            n = Math.max(1, Math.floor((n * 85) / 100));
          if (attackStatus.confusionReduction) n = Math.floor((n * 85) / 100);
          if (!eff.flat) n = applyVulnerableBonus(n, effectiveBuff(work, id, 'vulnerable'));
          if (!eff.flat && u.broken) n = Math.round(n * 1.5);
          if (split && !redirected) {
            const total = n * split;
            const position = front(work).indexOf(id);
            n = Math.floor(total / 3) + (position < total % 3 ? 1 : 0);
          }
          if (effectiveBuff(work, id, 'flying')) n = Math.floor(n / 2);
          n = applyIronReduction(n, effectiveBuff(work, id, 'iron'));
          const missedByBlind = attackStatus.blindTarget === id;
          if (missedByBlind) n = 0;
          if (!generated && !missedByBlind && attackHits && u.side === 'enemy') attackHits.add(id);
          const breakerActive = !generated && u.side === 'enemy' && isBreakerCombined(actor);
          const hadShield = u.block > 0;
          let absorbed;
          let damage;
          if (breakerActive && hadShield && n > 0) {
            absorbed = Math.min(u.block, n * 2);
            u.block -= absorbed;
            damage = Math.max(0, n - Math.ceil(absorbed / 2));
          } else {
            absorbed = Math.min(u.block, n);
            u.block -= absorbed;
            damage = n - absorbed;
          }
          const lost = lose(u, damage, '攻击', true);
          if (!missedByBlind && n > 0) overlords.onAttackHit(actor, id, Boolean(redirected));
          if (breakerActive && hadShield && u.block === 0) {
            grantFrontBreakerShield(actor, '击破护盾');
          }
          if (!generated && !missedByBlind && (damageType || breakerActive)) {
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
          heal(id, recovery, generated);
        }
        if (eff.type === 'mana') {
          const recovery = eff.maxMpPercent ? Math.round(u.maxMp * eff.maxMpPercent) : value;
          restoreMana(id, recovery, generated);
        }
        if (eff.type === 'cleanse') cleanse(id, eff.buffs);
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
    const attackStatus = heroAttackStatus(id, esTargets, effectsList);
    if (es.selfDamage) lose(unit, es.selfDamage, '入场技 · 自身伤害');
    if (unit.hp > 0 && !guests.entry(id, es, outgoing)) {
      if (es.mechanic === 'luo-entry') {
        if (!isPlagueSealed(work, id)) {
          // In-progress legacy battles still use the old attack-based shield.
          const shield = inDef.growthRevision
            ? effectsList.find((effect) => effect.type === 'shield')?.value
            : undefined;
          unit.block += shield ?? inDef.attack;
        } else {
          currentLogs.push(`${definitions[id].name}受【沉疫封锁】影响，无法获得护盾`);
        }
        unit.nextBasicDouble = true;
      } else {
        reportConfusion(id, attackStatus);
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
          attackStatus,
        );
      }
    }
    currentLogs.push(
      `${inDef.name}入场触发【${es.name}】${es.target === 'opposite' && !esTargets.length ? '，对位无存活敌人' : ''}`,
    );
    record(
      'entrySkill',
      id,
      es.name,
      attackStatus.confusionTarget ? [attackStatus.confusionTarget] : esTargets,
      actionId,
      es.id,
      {
        ...(entryDamageType ? { damageType: entryDamageType } : {}),
        ...attackStatus,
      },
    );
  }
  function counterAttack(actor, target) {
    const unit = work.units[actor];
    let damage = 0;
    const repeats = unit.buffs.meteor ? 2 : 1;
    const basicDamageType = resolveBasicAttackType(definitions[actor]);
    for (let cast = 0; cast < repeats && unit.hp > 0 && work.units[target].hp > 0; cast++) {
      const skill = abilityFor(work, actor, 'attack');
      const list = skill.effects.map((effect) => ({
        ...effect,
        value: effect.value * (unit.nextBasicDouble ? 2 : 1),
      }));
      unit.nextBasicDouble = false;
      const echo = !!unit.combined && definitions[actor].emblemId === 'tan-hongyu';
      const attackStatus = heroAttackStatus(actor, [target], list, echo);
      const hit = attackStatus.confusionTarget || target;
      reportConfusion(actor, attackStatus);
      trigger('beforeAttack', actor, { targets: [hit] });
      if (unit.hp <= 0 || work.units[hit].hp <= 0) break;
      attackHits = new Set();
      const before = work.units[hit].hp;
      effects(
        actor,
        [target],
        list,
        false,
        echo,
        false,
        0,
        work.units[actor]?.mark || 0,
        basicDamageType,
        attackStatus,
      );
      damage += Math.max(0, before - work.units[hit].hp);
      mechanics.attack(actor, attackHits);
      attackHits = null;
      trigger('afterAttack', actor, { targets: [hit] });
      record('counter', actor, '毅明 · ' + skill.name, [hit], null, 'attack', {
        repeatIndex: cast + 1,
        repeatCount: repeats,
        damageType: basicDamageType,
        ...attackStatus,
      });
    }
    return damage;
  }
  function record(type, actor, label, targetIds = [], actionId = null, skill = null, detail = {}) {
    const statusApplications = currentStatusApplications.map((application) => ({
      ...application,
      source: application.source || label,
    }));
    const statusLogs = statusApplications.map(
      ({ actor: sourceId, target, buff, value, source }) =>
        `${definitions[sourceId]?.name || '效果'} · ${source} → ${definitions[target].name}：施加${value}层${BUFFS[buff]?.name || buff}`,
    );
    events.push({
      type,
      at: ['bossPhase', 'bombDetonate', 'bombDefuse', 'hiddenWeaponLock'].includes(type)
        ? Math.max(0, at)
        : at,
      actor,
      label,
      targets: targetIds,
      actionId,
      skill,
      ...detail,
      logs: [...currentLogs, ...statusLogs],
      statusTriggers: [...currentStatusTriggers],
      ...(statusApplications.length ? { statusApplications } : {}),
      procs: [...currentProcs],
      after: clone(work),
    });
    currentLogs = [];
    currentStatusTriggers = [];
    currentStatusApplications = [];
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
        unit.breakWindow = null;
        unit.toughness = 0;
        unit.maxToughness = 0;
        delete unit.chargingMove;
        delete unit.buffs.bind;
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
        currentLogs.push(overlordPhaseLog(id, def, nextStage, profile, shield));
        record('bossPhase', id, def.name, targets, null, null, {
          phaseStage: nextStage,
          overlord: true,
          enraged: nextStage >= 2,
          clip: id === 'apepLamb' ? 'Apep_Eclipse' : 'Special_Action',
        });
        continue;
      }
      prepareAresRound(id);
      unit.broken = false;
      unit.breakWindow = null;
      unit.toughness = 0;
      unit.maxToughness = 0;
      unit.justEnragedWindow = true;
      delete unit.chargingMove;
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
  overlords.roundStart();
  const beforeTriggers = JSON.stringify(work);
  if (s.phase === 'opening') companions.start();
  for (const id of work.enemyIds) prepareAresRound(id);
  if (s.phase === 'opening') trigger('battleStart');
  else trigger('roundStart');
  guests.roundStart(slots);
  if (JSON.stringify(work) !== beforeTriggers) record('trigger', null, '装备与被动 · 开始');
  else flushBossPhases();
  const auxiliaryActions = createAuxiliaryActions({
    work,
    definitions,
    invalid,
    movedToFront,
    log: (entry) => currentLogs.push(entry),
    record,
    effects,
    trigger,
    bleed,
    clearRearPlagueSeals,
    triggerEntrySkill,
    rear,
  });
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
      if ((u.broken || u.buffs.bind) && !unbreakableFixed) {
        currentLogs.push(
          u.broken
            ? `${definitions[enemy].name}处于破防失衡，本回合行动取消`
            : `${definitions[enemy].name}受到禁锢，本回合行动取消`,
        );
        currentStatusTriggers.push({ id: enemy, type: u.broken ? 'breakSkip' : 'bind', value: 1 });
        record(
          'skip',
          enemy,
          u.broken
            ? move.fixedFirstSlot
              ? '破防失衡 · 定式先制跳过'
              : '破防失衡 · 行动取消'
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
      const lockOwner =
        ['moonCrown', 'moonRoot'].includes(enemy) && work.units.moonEye?.hp > 0 ? 'moonEye' : enemy;
      const newlyLockedUi = Boolean(definitions[enemy]?.overlord && !work.overlordUiLocked);
      if (newlyLockedUi) work.overlordUiLocked = lockOwner;
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
      if (move.selfCleanse) cleanse(enemy);
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
      const attacks = resolvedEffects.filter(
        ({ effect, effectTarget }) => effect.type === 'damage' && effectTarget === 'opponents',
      );
      const attackStatus = attacks.length ? confusionFor(enemy, actionIdx) : {};
      const redirected = attackStatus.confusionTarget;
      const damageSlots = [
        ...new Set(
          attacks.flatMap(({ effect }) => effect.targetSlots || move.slots || [move.slot]),
        ),
      ];
      const hitSlot = redirected ? pickAttackTarget(work, enemy, damageSlots, actionIdx + 1) : null;
      reportConfusion(enemy, attackStatus);
      const missed =
        !redirected && effectiveBuff(work, enemy, 'blind')
          ? blindedTarget(
              work,
              enemy,
              attacks.flatMap(({ ownTargets }) =>
                u.buffs.balance ? front(work).filter(Boolean) : ownTargets,
              ),
            )
          : null;
      attackStatus.blindTarget = missed;
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
        const opposing = effectTarget === 'opponents';
        if (
          redirected &&
          opposing &&
          effect.type === 'damage' &&
          !(effect.targetSlots || move.slots || [move.slot]).includes(hitSlot)
        )
          continue;
        effects(
          enemy,
          ownTargets,
          [effect],
          false,
          false,
          opposing && u.buffs.balance ? (move.slots || [move.slot]).length : false,
          0,
          work.units[enemy]?.mark || 0,
          enemyDamageType,
          opposing ? attackStatus : undefined,
        );
      }
      overlords.afterMove(enemy, move);
      if (move.sinkingPlague) {
        if (!work.sinkingPlague) {
          work.sinkingPlague = {
            source: enemy,
            ages: [0, 0, 0],
            frontStreak: {},
            sealed: {},
            backfieldTurns: {},
            corruptedSlot: null,
            stage2CorruptTick: 0,
          };
        } else {
          work.sinkingPlague.source = enemy;
          work.sinkingPlague.frontStreak ||= {};
          work.sinkingPlague.sealed ||= {};
        }
      }
      if (move.plagueAdd && work.sinkingPlague) {
        work.sinkingPlague.ages = (work.sinkingPlague.ages || [0, 0, 0]).map(
          (age) => (age || 0) + move.plagueAdd,
        );
      }
      const slowClearedCorrupt = Boolean(
        corruptedSlot !== null &&
        at === corruptedSlot &&
        work.sinkingPlague &&
        !work.sinkingPlague.slowCleansed,
      );
      if (slowClearedCorrupt) {
        work.sinkingPlague.slowCleansed = true;
        currentLogs.push(`${definitions[enemy].name}踩中腐化回合格，沉疫格位封锁解除！`);
      }
      if (move.isCharge) {
        u.chargingMove = { round: work.round + 1, stage: u.bossStage || 1 };
        u.lastChargeRound = work.round;
      } else if (
        !move.fixedFirstSlot &&
        u.breakWindow?.active &&
        actionIdx >= (u.breakWindow.triggerActionIndex ?? 0)
      ) {
        u.breakWindow = null;
        u.toughness = 0;
        delete u.chargingMove;
      }
      const isOverlord = Boolean(definitions[enemy]?.overlord);
      record(
        'enemy',
        enemy,
        (isOverlord ? '' : u.bossStage >= 3 ? '【第三阶段】' : move.enraged ? '【第二阶段】' : '') +
          move.name,
        redirected
          ? [redirected]
          : u.buffs.balance
            ? [...new Set([...targets, ...front(work).filter(Boolean)])]
            : targets,
        null,
        null,
        {
          blindTarget: missed,
          ...(redirected ? { confusionTarget: redirected, confusionSlot: hitSlot } : {}),
          actionIndex: actionIdx,
          enraged: Boolean(u.enraged || move.enraged),
          bossStage: u.bossStage || 1,
          ...(move.clip ? { clip: move.clip } : {}),
          ...(move.isCharge ? { chargeStarted: true } : {}),
          ...(move.isChargedRelease ? { chargedRelease: true } : {}),
          ...(newlyLockedUi ? { overlordDomainLock: true } : {}),
          ...(slowClearedCorrupt ? { clearedCorruptedSlot: true } : {}),
          ...(enemyDamageType ? { damageType: enemyDamageType } : {}),
        },
      );
      if (move.effects.some((effect) => effect.type === 'damage'))
        companions.afterEnemyAttack(enemy, redirected ? [redirected] : targets);
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
          emblemId = definitions[a.actor]?.emblemId,
          embName = EMBLEMS[emblemId]?.emblem?.name || '檀虹羽';
        unit.emblemCharge = 0;
        unit.combined = 3;
        unit.combineSkillUsed = false;
        if (emblemId === OVERLOAD_EMBLEM_ID) {
          const baseMaxHp = unit.maxHp;
          const baseMaxMp = unit.maxMp;
          unit.maxMp = baseMaxMp * 2;
          unit.mp = unit.maxMp;
          unit.overloadEngage = {
            baseMaxHp,
            baseMaxMp,
            gainedMaxMp: baseMaxMp,
            gainedMaxHp: 0,
          };
          currentLogs.push(
            `${definitions[a.actor].name} · 灵能血装：最大法力翻倍至${unit.maxMp}并回满`,
          );
        }
        record('engage', a.actor, `结合 · ${embName}`, [a.actor], a.id);
        if (!a.followUp) continue;
        a = {
          ...a,
          kind: 'skill',
          skill: a.followUp.skill,
          target: a.followUp.target,
        };
      }
      const auxiliary = auxiliaryActions[a.kind];
      if (auxiliary) {
        auxiliary(a);
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
      const isOverloaded = !!u.buffs.overload && EMBLEMS[def.emblemId]?.skill?.id !== a.skill;
      const mpCost = skill.mp;
      const hpCost = skill.hp || 0;
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
      let savedOverloadBonus = 0;
      if (isOverloaded) {
        savedOverloadBonus = u.overloadSavedBonus || 0;
        delete u.overloadSavedBonus;
        delete u.buffs.overload;
        currentLogs.push(`${definitions[a.actor].name}超限负荷：行动重复生效`);
      }
      u.used++;
      const attack = skill.effects.some((effect) => effect.type === 'damage');
      let attackedEnemy = false;
      const repeats = 1 + (isOverloaded ? 1 : 0) + (a.skill === 'attack' && u.buffs.meteor ? 1 : 0);
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
            `${def.name} · ${isOverloaded ? '超限负荷：行动额外生效一次' : '流星剑姿：普通攻击额外攻击一次'}`,
          );
        const echo =
          !!u.combined &&
          attack &&
          skill.target === 'enemy' &&
          (!def.emblemId || def.emblemId === 'tan-hongyu');
        const attackStatus = heroAttackStatus(a.actor, targets, skill.effects, echo);
        const redirected = attackStatus.confusionTarget;
        const actualTargets = redirected ? [redirected] : targets;
        if (cast === 0)
          attackedEnemy =
            attack &&
            actualTargets.some((id) => work.units[id]?.side === 'enemy' && work.units[id].hp > 0);
        reportConfusion(a.actor, attackStatus);
        if (attack) trigger('beforeAttack', a.actor, { targets: actualTargets });
        if (u.hp <= 0) break;
        attackHits = new Set();
        attackInjuries = new Set();
        const bonus =
          isOverloaded && attack
            ? u.overloadEngage
              ? (u.overloadEngage.gainedMaxMp || 0) + (u.overloadEngage.gainedMaxHp || 0)
              : savedOverloadBonus
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
              attackStatus,
            );
          companions.cast(a.actor, skill, redirected || a.target);
        } else if (skill.mechanic) mechanics.cast(a.actor, skill, a.target);
        else {
          const list =
            a.skill === 'attack' && u.nextBasicDouble
              ? skill.effects.map((effect) =>
                  effect.type === 'damage' ? { ...effect, value: effect.value * 2 } : effect,
                )
              : skill.effects;
          if (a.skill === 'attack') u.nextBasicDouble = false;
          effects(
            a.actor,
            targets,
            list,
            false,
            echo,
            false,
            bonus,
            undefined,
            heroDamageType,
            attackStatus,
          );
        }
        mechanics.attack(a.actor, attackHits);
        if (a.skill === 'attack') guests.afterBasicAttack(a.actor, attackInjuries);
        guests.afterCast(a.actor, skill);
        attackHits = null;
        attackInjuries = null;
        if (a.skill !== 'attack') trigger('skillCast', a.actor, { targets: actualTargets });
        if (cast === 0 && a.skill === 'attack' && attackedEnemy && def.basicAttackMark && u.hp > 0)
          u.mark = Math.min(def.mechanicMark?.max || 3, (u.mark || 0) + def.basicAttackMark);
        if (attack) trigger('afterAttack', a.actor, { targets: actualTargets });
        if (EMBLEMS[def.emblemId]?.skill?.id === a.skill) u.combineSkillUsed = true;
        if (cast === repeats - 1) {
          if (attackedEnemy && def.emblemId && !u.combined)
            u.emblemCharge = Math.min(6, (u.emblemCharge || 0) + 1);
        }
        record('hero', a.actor, skill.name, actualTargets, a.id, a.skill, {
          repeatCount: repeats,
          repeatIndex: cast + 1,
          costs: { mp: cast ? 0 : mpCost, hp: cast ? 0 : hpCost },
          ...(heroDamageType ? { damageType: heroDamageType } : {}),
          ...attackStatus,
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
            clearRearPlagueSeals();
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
    resolveBattleRoundEnd(work, {
      definitions,
      heroes,
      rearAtStart,
      movedToFront,
      trigger,
      mechanics,
      overlords,
      record,
      heal,
      lose,
      log: (entry) => currentLogs.push(entry),
      statusTrigger: (entry) => currentStatusTriggers.push(entry),
    });
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
export function syncEnemyBreakWindows(s) {
  if (!s?.enemyIds || !s?.units) return s;
  const defs = definitionsFor(s);
  s.enemyIds.forEach((id, enemyIndex) => {
    const u = s.units[id];
    const d = defs[id];
    if (!u || !d || u.hp <= 0) return;
    if (shouldOpenBreakWindow(s, id, d, enemyIndex)) {
      const stage = u.bossStage || (u.enraged ? 2 : 1);
      const win = createBreakWindow(d, u, stage, Boolean(d.fixedFirstSlot));
      u.breakWindow = win;
      u.toughness = win ? win.current : 0;
      u.maxToughness = win ? win.max : 0;
    } else {
      u.breakWindow = null;
      u.toughness = 0;
      u.maxToughness = 0;
    }
    delete u.justEnragedWindow;
    delete u.forceBreakWindow;
  });
  return s;
}
export function openBreakWindow(s, id, options = {}) {
  const u = s?.units?.[id];
  const d = definition(s, id);
  if (!u || !d || u.hp <= 0) return null;
  const stage = u.bossStage || (u.enraged ? 2 : 1);
  let win = createBreakWindow(d, u, stage, Boolean(d.fixedFirstSlot));
  if (!win && options.force) {
    win = {
      active: true,
      mode: 'plain',
      current: Math.max(1, Math.min(2, Number(options.layers) || 1)),
      max: Math.max(1, Math.min(2, Number(options.layers) || 1)),
      majorWeakness: null,
      minorWeaknesses: [],
      triggerActionIndex: d.fixedFirstSlot ? 1 : 0,
      source: 'window',
    };
  }
  u.breakWindow = win;
  u.toughness = win ? win.current : 0;
  u.maxToughness = win ? win.max : 0;
  return win;
}
export function advance(result) {
  if (!result.valid) throw Error('Invalid plan');
  const s = clone(result.final);
  delete s.bombExpired;
  if (result.outcome) {
    delete s.pendingAlchemicalBomb;
    delete s.activeAlchemicalBomb;
    delete s.overlordUiLocked;
    delete s.activeHiddenWeapons;
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
      u.broken = false;
      u.breakWindow = null;
      u.toughness = 0;
      u.maxToughness = 0;
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
  if (s.dragonVeinMeta?.expiredAtNextRoundStart) {
    delete s.dragonVein;
    delete s.dragonVeinMeta;
  }
  syncEnemyBreakWindows(s);
  lockHiddenWeapons(s, definitionsFor(s));
  lockEnemyDecisions(s, definitionsFor(s));
  if (s.sinkingPlague) {
    delete s.sinkingPlague.slowCleansed;
    const sourceUnit = s.units?.[s.sinkingPlague.source];
    const stage = sourceUnit?.bossStage || (sourceUnit?.enraged ? 2 : 1);
    if (stage === 2) {
      s.sinkingPlague.stage2CorruptTick = (s.sinkingPlague.stage2CorruptTick || 0) + 1;
    }
    s.sinkingPlague.corruptedSlot = pickCorruptedTimelineSlot(s, enemyTimeline(s));
  }
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
    for (const [key, value] of Object.entries(spec.initialHeroDebuffs?.[h.id] || {})) {
      const stacks = statusStacks(key, units[h.id].buffs[key]) + statusStacks(key, value);
      units[h.id].buffs[key] = statusStacks(key, stacks);
    }
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
      toughness: enemyBreak.alwaysBreakWindow ? enemyBreak.maxToughness : 0,
      maxToughness: enemyBreak.alwaysBreakWindow ? enemyBreak.maxToughness : 0,
      weaknesses: [...enemyBreak.weaknesses],
      breakWindow: enemyBreak.alwaysBreakWindow
        ? createBreakWindow(d, null, 1, Boolean(d.fixedFirstSlot))
        : null,
      broken: false,
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
    if (recovery === 'sleep')
      unit.hp += Math.ceil(Math.max(0, unit.maxHp - unit.hp) * REST_LOSS_RECOVERY);
    if (recovery === 'meal')
      unit.mp += Math.ceil(Math.max(0, unit.maxMp - unit.mp) * REST_LOSS_RECOVERY);
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
