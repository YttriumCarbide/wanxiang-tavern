import { NEGATIVE_STATUSES, statusStacks } from './status-rules.js';
import { combatScale } from './combat-scale.js';
import { DAMAGE_TYPE_IDS, damageTypeMeta, isDamageType } from './damage-types.js';
import {
  createBreakWindow,
  partyAvailableDamageTypes,
  pickIronCoachWeaknesses,
  resolveEnemyBreakProfile,
} from './octopath.js';

function fnv1a(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function xorshift32(seed) {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}

function deterministicShuffle(list, seed) {
  const arr = [...list];
  const rand = xorshift32(seed);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = rand() % (i + 1);
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function isAlive(state, id) {
  const unit = state.units?.[id];
  return Boolean(unit && unit.hp > 0);
}

function positiveNegativeCount(unit) {
  let count = 0;
  for (const key of NEGATIVE_STATUSES) {
    if ((unit.buffs?.[key] || 0) > 0) count += 1;
  }
  return count;
}

export function lockHiddenWeapons(state, definitions) {
  if (!state || state.phase === 'opening' || !(state.round >= 1) || state.phase !== 'plan') {
    return [];
  }
  const round = state.round;
  state.activeHiddenWeapons ||= {};
  const locked = [];
  for (const id of state.enemyIds || []) {
    if (!isAlive(state, id)) continue;
    const def = definitions?.[id];
    const mechanic = def?.hiddenWeaponMechanic;
    if (!mechanic || mechanic.mode !== 'non-repeating-cycle') continue;
    const weapons = Array.isArray(mechanic.weapons) ? mechanic.weapons : [];
    if (!weapons.length) continue;

    const existing = state.activeHiddenWeapons[id];
    if (existing && existing.round === round) {
      locked.push({ actor: id, weapon: structuredClone(existing) });
      continue;
    }

    const seed = fnv1a(`${state.seed ?? 0}:${id}`);
    const order = deterministicShuffle(weapons, seed);
    const length = order.length;
    let index = (round - 1) % length;
    let weapon = order[index];

    if (existing && existing.id === weapon.id && length > 1) {
      index = (index + 1) % length;
      weapon = order[index];
    }

    const stored = { ...weapon, round };
    state.activeHiddenWeapons[id] = stored;
    locked.push({ actor: id, weapon: structuredClone(stored) });
  }
  return locked;
}

/** Sync White Crow's Collector Archive: top-1 damage type + Stage 2/3 random party attributes. */
export function syncCollectorArchive(state, definitions) {
  if (!state || state.phase === 'opening' || !(state.round >= 1) || state.phase !== 'plan') {
    return [];
  }
  const round = state.round;
  state.activeCollectorArchive ||= {};
  state.collectorDamageByType ||= {};
  const updated = [];
  for (const id of state.enemyIds || []) {
    if (!isAlive(state, id)) continue;
    const def = definitions?.[id];
    const mechanic = def?.collectorMechanic;
    if (!mechanic) continue;
    const existing = state.activeCollectorArchive[id];
    if (existing && existing.round === round) {
      updated.push({ actor: id, archive: structuredClone(existing) });
      continue;
    }
    const unit = state.units[id];
    const stage = unit.bossStage || (unit.enraged ? 2 : 1);
    const dmgMap = state.collectorDamageByType[id] || {};
    let topType = null;
    let topDmg = 0;
    for (const [dtype, amount] of Object.entries(dmgMap)) {
      if (!isDamageType(dtype) || !(amount > 0)) continue;
      if (amount > topDmg || (amount === topDmg && topType && dtype < topType)) {
        topDmg = amount;
        topType = dtype;
      }
    }
    const extraRandomCount = stage === 2 ? 1 : stage >= 3 ? 2 : 0;
    const collected = [];
    if (topType) collected.push(topType);
    const randomTypes = [];
    if (extraRandomCount > 0) {
      const candidates = DAMAGE_TYPE_IDS.filter((t) => !collected.includes(t));
      const shuffled = deterministicShuffle(
        candidates,
        fnv1a(`${state.seed ?? 37}:${round}:${stage}:${id}:collector`),
      );
      for (const pick of shuffled) {
        if (randomTypes.length >= extraRandomCount || collected.length >= 3) break;
        collected.push(pick);
        randomTypes.push(pick);
      }
    }
    const stored = { round, topType, randomTypes, collected };
    state.activeCollectorArchive[id] = stored;
    state.collectorDamageByType[id] = {};
    unit.collectorArchivedTypes = [...collected];
    if (unit.breakWindow?.mode === 'collector') {
      unit.breakWindow.collectedTypes = [...collected];
    }
    updated.push({ actor: id, archive: structuredClone(stored) });
  }
  return updated;
}

/** Keep Iron Coach Stage 2 majorWeakness reachable by living front-row heroes after formation swaps. */
export function refreshIronCoachFrontWeakness(state, definitions, log = null) {
  if (!state || state.phase === 'opening') return;
  for (const id of state.enemyIds || []) {
    if (!isAlive(state, id)) continue;
    const def = definitions?.[id];
    const unit = state.units[id];
    if (!def?.ironCoachMechanic || !unit || unit.broken || !unit.breakWindow?.active) continue;
    const stage = unit.bossStage || (unit.enraged ? 2 : 1);
    if (stage !== 2) continue;
    const frontTypes = partyAvailableDamageTypes(state, definitions, { frontOnly: true });
    if (frontTypes.includes(unit.breakWindow.majorWeakness)) continue;
    const picked = pickIronCoachWeaknesses(
      state,
      definitions,
      def,
      2,
      `:${(state.formation || []).slice(0, 3).join(',')}`,
      unit.coachUsedMajorWeaknesses || [],
    );
    unit.coachUsedMajorWeaknesses ||= [];
    if (picked.majorWeakness && !unit.coachUsedMajorWeaknesses.includes(picked.majorWeakness)) {
      unit.coachUsedMajorWeaknesses.push(picked.majorWeakness);
    }
    unit.breakWindow.majorWeakness = picked.majorWeakness;
    unit.breakWindow.minorWeaknesses = [...picked.minorWeaknesses];
    unit.weaknesses = [...picked.weaknesses];
    if (log) {
      log(
        `${def.name || id}盯紧前场站位变动，大弱点切换为【${damageTypeMeta(picked.majorWeakness).name}】`,
      );
    }
  }
}

export function createOverlordMechanics(state, definitions, ports) {
  function roundStart() {
    const locked = lockHiddenWeapons(state, definitions);
    for (const entry of locked) {
      ports.record('hiddenWeaponLock', entry.actor, entry.weapon.name, [], null, null, {
        weapon: entry.weapon,
      });
    }
    syncCollectorArchive(state, definitions);
  }

  function onAttackHit(actor, target, redirected = false) {
    if (!isAlive(state, actor) || !isAlive(state, target)) return;
    const def = definitions?.[actor];
    if (!def) return;
    const mechanic = def.hiddenWeaponMechanic;
    if (!mechanic) return;
    const actorUnit = state.units?.[actor];
    const targetUnit = state.units?.[target];
    if (!actorUnit || !targetUnit) return;
    if (actorUnit.side !== 'enemy') return;
    if (
      !redirected &&
      (targetUnit.side !== 'hero' || !state.formation.slice(0, 3).includes(target))
    )
      return;
    const active = state.activeHiddenWeapons?.[actor];
    if (!active || active.round !== state.round) return;
    const stacks = mechanic.stacksPerHit || 1;
    ports.buff(actor, target, active.buff, stacks, true, active.name);
  }

  function damageBonus(actor, damage) {
    if (!isAlive(state, actor)) return damage;
    const def = definitions?.[actor];
    const traits = def?.overlordTraits;
    if (!Array.isArray(traits) || !traits.includes('eclipsescaleOverlord')) return damage;
    const config = def.eclipsescaleConfig;
    if (!config) return damage;
    const unit = state.units[actor];
    const iron = Math.max(0, Math.floor(unit.buffs?.iron || 0));
    if (!iron) return damage;
    const percent = config.bonusDamagePercentPerIron || 0;
    const bonus = Math.round(damage * (1 + (iron * percent) / 100)) - damage;
    if (!bonus) return damage;
    return damage + bonus;
  }

  function onNegative(id) {
    const def = definitions?.[id];
    const traits = def?.overlordTraits;
    if (!Array.isArray(traits) || !traits.includes('eclipsescaleOverlord')) return;
    const config = def.eclipsescaleConfig;
    if (!config) return;
    const unit = state.units?.[id];
    if (!unit || unit.hp <= 0) return;
    const threshold = config.multiDebuffThreshold || 2;
    if (positiveNegativeCount(unit) < threshold) return;
    if (unit.eclipsescaleShedRound === state.round) return;
    const iron = Math.max(0, Math.floor(unit.buffs?.iron || 0));
    if (iron <= 0) return;
    const shed = Math.min(iron, config.shedIronOnMultiDebuff || 0);
    if (shed <= 0) return;
    unit.eclipsescaleShedRound = state.round;
    const remaining = iron - shed;
    if (remaining > 0) unit.buffs.iron = remaining;
    else delete unit.buffs.iron;
    ports.statusTrigger({ id, type: 'eclipsescaleShed', value: shed });
    ports.log(`${def.name || id} 蚀鳞震落：铁甲 -${shed}（剩余 ${remaining}）`);
  }

  function onBreak(id) {
    const def = definitions?.[id];
    const traits = def?.overlordTraits;
    if (!Array.isArray(traits) || !traits.includes('eclipsescaleOverlord')) return;
    const config = def.eclipsescaleConfig;
    if (!config || !config.clearIronOnBreak) return;
    const unit = state.units?.[id];
    if (!unit || unit.hp <= 0) return;
    const iron = Math.max(0, Math.floor(unit.buffs?.iron || 0));
    if (iron <= 0) return;
    delete unit.buffs.iron;
    ports.statusTrigger({ id, type: 'eclipsescaleBreak', value: iron });
  }

  function roundEnd() {
    if (state.phase === 'opening' || !(state.round >= 1)) return;
    for (const id of state.enemyIds || []) {
      if (!isAlive(state, id)) continue;
      const def = definitions?.[id];
      const traits = def?.overlordTraits;
      if (!Array.isArray(traits) || !traits.includes('eclipsescaleOverlord')) continue;
      const config = def.eclipsescaleConfig;
      if (!config) continue;
      const unit = state.units[id];
      if (unit.broken) continue;
      if (positiveNegativeCount(unit) > 0) continue;

      const current = Math.max(0, Math.floor(unit.buffs?.iron || 0));
      const cap = config.maxIronStacks ?? Infinity;
      const gainPer = config.gainIronOnCleanRoundEnd || 0;
      const gain = Math.min(cap, current + gainPer) - current;
      if (gain > 0) {
        ports.buff(id, id, 'iron', gain, true);
        ports.statusTrigger({ id, type: 'eclipsescaleGrow', value: gain });
        ports.log(`${def.name || id} 蚀鳞生长：铁甲 +${gain}（${current} → ${current + gain}）`);
      }
      const shieldBase = (config.gainShieldOnCleanRoundEnd || 0) * (unit.damageScale || 1);
      if (shieldBase > 0) ports.shield(id, Math.round(shieldBase));
    }
  }

  function afterMove(actor, move) {
    if (!isAlive(state, actor)) return;
    const def = definitions?.[actor];
    const traits = def?.overlordTraits;
    if (!Array.isArray(traits) || !traits.includes('warlord')) return;
    const config = def.warlordCommand;
    if (!config) return;
    const unit = state.units[actor];

    if (move?.warlordConsume === true) {
      const summonId = config.summonId;
      const consumed = [];
      for (const id of [...(state.enemyIds || [])]) {
        if (id === actor) continue;
        if (!isAlive(state, id)) continue;
        const other = state.units[id];
        const otherDef = definitions?.[id];
        const matches =
          other.speciesKey === summonId || otherDef?.speciesId === summonId || id === summonId;
        if (!matches) continue;
        other.hp = 0;
        other.withdrawn = true;
        other.buffs = {};
        state.enemyIds = state.enemyIds.filter((x) => x !== id);
        consumed.push(id);
      }

      if (consumed.length) {
        const shieldBase = Math.round(
          (config.consumeShieldPerMinion || 0) * (unit.damageScale || 1),
        );
        if (shieldBase > 0) {
          for (let i = 0; i < consumed.length; i += 1) {
            ports.shield(actor, shieldBase);
          }
        }
        const strengthGain = consumed.length * (config.consumeStrengthPerMinion || 0);
        if (strengthGain > 0) ports.buff(actor, actor, 'strength', strengthGain, true);
        ports.statusTrigger({
          id: actor,
          type: 'warlordConsume',
          value: consumed.length,
          targets: consumed,
        });
        ports.log(`${def.name || actor} 吞噬随从 ${consumed.length} 只`);
      }
    }

    if (!move?.warlordRally) return;
    if (!(state.round >= 1)) return;
    const cadence = Math.max(1, config.cadenceRounds || 2);
    const last = unit.lastWarlordRallyRound;
    if (last !== undefined && state.round - last < cadence) return;

    const summonId = config.summonId;
    const template = definitions?.[summonId];
    if (!template) return;

    const maxAlive = config.maxAlive || 3;
    let aliveDust = 0;
    for (const id of state.enemyIds || []) {
      if (!isAlive(state, id)) continue;
      const other = state.units[id];
      const otherDef = definitions?.[id];
      if (other.speciesKey === summonId || otherDef?.speciesId === summonId) aliveDust += 1;
    }
    const aliveCount = (state.enemyIds || []).filter((id) => isAlive(state, id)).length;
    const emptySlots = Math.max(0, 3 - aliveCount);
    const summonCount = config.summonCount || 1;
    const count = Math.min(summonCount, maxAlive - aliveDust, emptySlots);
    unit.lastWarlordRallyRound = state.round;
    if (count <= 0) return;

    const lvl = unit.level || state.level || 1;
    const scale = combatScale(lvl);
    const profile = resolveEnemyBreakProfile(template, 1);
    const alwaysBreakWindow = profile.alwaysBreakWindow === true;
    const maxToughness = alwaysBreakWindow ? profile.maxToughness : 0;

    const buffs = {};
    for (const [key, value] of Object.entries(template.buffs || {})) {
      const stacks = statusStacks(key, value);
      if (stacks > 0) buffs[key] = stacks;
    }

    const targets = [];
    for (let index = 0; index < count; index += 1) {
      state.warlordSummonSerial = (state.warlordSummonSerial || 0) + 1;
      const serial = state.warlordSummonSerial;
      const newId = `${summonId}:${actor}:${serial}`;

      const clone = structuredClone(template);
      clone.id = newId;
      clone.speciesId = summonId;
      clone.summoned = true;
      state.enemyDefinitions ||= {};
      state.enemyDefinitions[newId] = clone;
      definitions[newId] = clone;

      const breakWindow = alwaysBreakWindow ? createBreakWindow(clone, null, 1, false) : null;

      const summoned = {
        id: newId,
        speciesKey: summonId,
        level: lvl,
        hp: Math.round((template.hp || 0) * scale),
        maxHp: Math.round((template.hp || 0) * scale),
        damageScale: scale,
        mp: 0,
        maxMp: 0,
        block: 0,
        buffs: { ...buffs },
        entryReady: false,
        used: 0,
        side: 'enemy',
        bossStage: 1,
        weaknesses: [...(profile.weaknesses || [])],
        breakWindow,
        toughness: maxToughness,
        maxToughness,
      };
      state.units[newId] = summoned;

      let placed = false;
      for (let i = 0; i < (state.enemyIds || []).length; i += 1) {
        const id = state.enemyIds[i];
        const existing = state.units[id];
        if (!existing || existing.hp <= 0) {
          if (existing) existing.withdrawn = true;
          state.enemyIds[i] = newId;
          placed = true;
          break;
        }
      }
      if (!placed) state.enemyIds.push(newId);
      targets.push(newId);
    }

    ports.statusTrigger({
      id: actor,
      type: 'warlordRally',
      value: count,
      targets,
    });
    ports.log(`${def.name || actor} 召唤 ${template.name || summonId} ×${count}`);
  }

  function incomingDamageModifier(targetId, damageType, damage, options = {}) {
    if (
      !isAlive(state, targetId) ||
      options.generated ||
      options.flat ||
      !isDamageType(damageType)
    ) {
      return damage;
    }
    const def = definitions?.[targetId];
    const unit = state.units?.[targetId];
    if (!def?.collectorMechanic || !unit) return damage;
    const collected =
      state.activeCollectorArchive?.[targetId]?.collected || unit.breakWindow?.collectedTypes || [];
    if (collected.includes(damageType)) {
      const mult = def.collectorMechanic.rejectMultiplier ?? 0.6;
      return Math.max(1, Math.round(damage * mult));
    }
    if (unit.breakWindow?.active && unit.breakWindow.mode === 'collector') {
      const mult = def.collectorMechanic.appraiseMultiplier ?? 1.35;
      return Math.max(damage + 1, Math.round(damage * mult));
    }
    return damage;
  }

  function recordIncomingDamage(targetId, damageType, amount) {
    if (!isAlive(state, targetId) || !isDamageType(damageType) || !(amount > 0)) return;
    const def = definitions?.[targetId];
    if (!def?.collectorMechanic) return;
    state.collectorDamageByType ||= {};
    state.collectorDamageByType[targetId] ||= {};
    state.collectorDamageByType[targetId][damageType] =
      (state.collectorDamageByType[targetId][damageType] || 0) + amount;
  }

  function checkCounterOnHit(
    actorId,
    targetId,
    damageType,
    { generated = false, missed = false } = {},
  ) {
    if (generated || missed || !actorId || !targetId) return null;
    if (!isAlive(state, actorId) || !isAlive(state, targetId)) return null;
    const actorUnit = state.units?.[actorId];
    const targetUnit = state.units?.[targetId];
    if (!actorUnit || !targetUnit || actorUnit.side !== 'hero' || targetUnit.side !== 'enemy') {
      return null;
    }
    if (targetUnit.broken || targetUnit.buffs?.bind || !isDamageType(damageType)) return null;
    const def = definitions?.[targetId];
    if (!def) return null;
    const stage = targetUnit.bossStage || (targetUnit.enraged ? 2 : 1);

    if (def.ironCoachMechanic && stage >= 2) {
      const coach = def.ironCoachMechanic;
      const weaknesses = targetUnit.breakWindow?.active
        ? [
            targetUnit.breakWindow.majorWeakness,
            ...(targetUnit.breakWindow.minorWeaknesses || []),
          ].filter(Boolean)
        : targetUnit.weaknesses || [];
      if (!weaknesses.includes(damageType)) {
        return {
          actor: targetId,
          target: actorId,
          name: coach.counterName || '教头截击',
          damage: coach.counterDamageByPhase?.[stage - 1] ?? 10,
          damageType: coach.counterDamageType || 'brawl',
          clip: coach.counterClip || 'Normal_Attack',
          reason: 'non-weakness',
        };
      }
    }

    if (def.collectorMechanic) {
      const col = def.collectorMechanic;
      const collected =
        state.activeCollectorArchive?.[targetId]?.collected ||
        targetUnit.breakWindow?.collectedTypes ||
        [];
      if (collected.includes(damageType)) {
        return {
          actor: targetId,
          target: actorId,
          name: col.counterName || '赝品拒收 · 以太点射',
          damage: col.counterDamageByPhase?.[stage - 1] ?? 10,
          damageType: col.counterDamageType || 'special-weapon',
          clip: col.counterClip || 'Special_Attack',
          reason: 'collected-reject',
        };
      }
    }
    return null;
  }

  return {
    roundStart,
    onAttackHit,
    damageBonus,
    incomingDamageModifier,
    recordIncomingDamage,
    checkCounterOnHit,
    onNegative,
    onBreak,
    roundEnd,
    afterMove,
  };
}
