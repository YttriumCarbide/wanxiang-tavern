import { definition } from './catalog.js';
import { overlordTargetStage, overlordPhaseProfile, pickBombTarget } from './overlord-mechanics.js';
import { shouldEnrage, aresDecision } from './ares.js';
import { leveledIntent } from './enemy-growth.js';
import { tacticalDecision } from './enemy-tactics.js';
import { livingEnemies } from './battle-state-readers.js';
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
  const chargeSpec = authored.chargeMechanic;
  if (s.phase !== 'opening' && chargeSpec && regIndex === 0) {
    const unit = s.units[id];
    const bossStage = Array.isArray(authored.overlordPhases)
      ? Math.max(unit?.bossStage || 1, overlordTargetStage(unit, authored))
      : 1;
    if (unit?.chargingMove) {
      const release =
        chargeSpec.releaseMovesByPhase?.[bossStage - 1] || chargeSpec.releaseMovesByPhase?.[0];
      if (release) {
        return scaleIntent({
          ...release,
          enraged: bossStage >= 2,
          isChargedRelease: true,
        });
      }
    }
    const cadence = Math.max(2, Number(chargeSpec.cadenceRounds) || 3);
    const chargeBaseline =
      unit?.lastChargeRound ??
      (Number.isInteger(chargeSpec.firstChargeRound)
        ? chargeSpec.firstChargeRound - cadence
        : -cadence);
    if (
      chargeSpec.chargeMove &&
      unit?.lastChargeRound !== s.round &&
      s.round - chargeBaseline >= cadence
    ) {
      const chargeMove = chargeSpec.chargeMove;
      return {
        ...chargeMove,
        slots: chargeMove.slots || [chargeMove.slot ?? 1],
        effects: chargeMove.effects || [],
        enraged: bossStage >= 2,
        isCharge: true,
      };
    }
  }
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
    entries = enemies.map((e, i) => {
      const unit = s.units[e.id];
      const stage =
        unit?.bossStage || (Array.isArray(e.overlordPhases) ? overlordTargetStage(unit, e) : 1);
      const chargingStage3 = Boolean(e.overlord && unit?.chargingMove && stage >= 3);
      const baseSpeed = chargingStage3 ? Math.max(1, e.speed - 1) : e.speed;
      return {
        def: e,
        id: e.id,
        count: enemyActionsCount(s, e.id),
        fixedFirst: Boolean(e.fixedFirstSlot),
        speed:
          e.tactic?.mode === 'ares' && aresDecision(s, e.id, e).priority
            ? 999
            : Math.max(1, baseSpeed - (unit.buffs.slow || 0) - (extraSlow[e.id] || 0)),
        tie:
          e.tactic?.mode === 'moon-tree'
            ? { crown: 2, eye: 1, root: 0 }[e.tactic.part]
            : (i * 17 + s.seed + s.round * 11) % 31,
      };
    }),
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
