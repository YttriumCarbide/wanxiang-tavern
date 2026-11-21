import { front, rear, effectiveBuff } from './battle-state-readers.js';
import { decayStatuses, regenHealAmount } from './status-rules.js';
import { endOverloadEngageForUnit } from './emblem-mechanics.js';
import { sinkingPlagueFrontDamage } from './overlord-mechanics.js';

export function resolveBattleRoundEnd(
  work,
  {
    definitions,
    heroes,
    rearAtStart,
    movedToFront,
    trigger,
    mechanics,
    record,
    heal,
    lose,
    log,
    statusTrigger,
  },
) {
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
      log(`${definitions[u.id].name}中毒${value}`);
      statusTrigger({ id: u.id, type: 'poison', value });
    }
  record('poison', null, '回合末 · 中毒结算');
  if (work.sinkingPlague && work.units[work.sinkingPlague.source]?.hp > 0) {
    const targets = [];
    const baseAge = Math.max(0, ...(work.sinkingPlague.ages || [0]));
    const elapsed = baseAge + 1;
    const dmg = sinkingPlagueFrontDamage(work, 0, baseAge);
    const frontStreak = { ...(work.sinkingPlague.frontStreak || {}) };
    const sealed = { ...(work.sinkingPlague.sealed || {}) };
    for (const id of front(work)) {
      if (!id || !(work.units[id]?.hp > 0)) continue;
      lose(work.units[id], dmg, '沉疫');
      frontStreak[id] = (frontStreak[id] || 0) + 1;
      const newlySealed = frontStreak[id] >= 2 && !sealed[id];
      if (frontStreak[id] >= 2) sealed[id] = true;
      log(
        `${definitions[id].name}在前场承受沉疫${dmg}伤害（第${elapsed}回合，连续前场第${frontStreak[id]}回合）`,
      );
      if (newlySealed) {
        log(
          `${definitions[id].name}在前场连续两回合承受沉疫，陷入【沉疫封锁】：无法获得护盾、回复生命与法力（退回后场立刻解除）`,
        );
      }
      statusTrigger({
        id,
        type: 'sinkingPlague',
        value: dmg,
        frontStreak: frontStreak[id],
        sealed: Boolean(sealed[id]),
      });
      targets.push(id);
    }
    for (const id of rear(work)) {
      if (!id || !(work.units[id]?.hp > 0)) {
        if (id) {
          frontStreak[id] = 0;
          delete sealed[id];
        }
        continue;
      }
      frontStreak[id] = 0;
      delete sealed[id];
      lose(work.units[id], dmg, '沉疫 · 后场');
      log(`${definitions[id].name}在后场承受同等沉疫${dmg}伤害（后场免疫沉疫封锁）`);
      statusTrigger({
        id,
        type: 'sinkingPlague',
        value: dmg,
        rear: true,
      });
      targets.push(id);
    }
    work.sinkingPlague.ages = [elapsed, elapsed, elapsed];
    work.sinkingPlague.frontStreak = frontStreak;
    work.sinkingPlague.sealed = sealed;
    work.sinkingPlague.backfieldTurns = {};
    const hasSealed = Object.keys(sealed).length > 0;
    record('sinkingPlague', work.sinkingPlague.source, '回合末 · 沉疫', targets, null, null, {
      plagueIntensity: Math.min(1, elapsed * 0.14 + (hasSealed ? 0.25 : 0)),
      sealedTargets: Object.keys(sealed),
    });
  }
  const decay = decayStatuses(work.units);
  for (const change of decay)
    log(
      `${definitions[change.id].name}的${change.buff}从${change.before}层衰减至${change.after}层`,
    );
  if (decay.length) record('decay', null, '回合末 · 状态衰减', [], null, null, { decay });
  for (const unit of Object.values(work.units)) {
    if (unit.combined) {
      unit.combined--;
      if (!unit.combined) {
        unit.combineSkillUsed = false;
        if (endOverloadEngageForUnit(unit, { preserveSavedBonus: true })) {
          log(
            `${definitions[unit.id]?.name || unit.id} · 过载结合结束：上限恢复原值，当前生命保留`,
          );
        }
      }
    }
  }
  if (work.dragonVein && work.dragonVeinMeta) {
    const owner = work.units?.[work.dragonVeinMeta.owner];
    const ownerCombined = Boolean(owner && owner.hp > 0 && owner.combined > 0);
    if (!ownerCombined) {
      if (work.dragonVeinMeta.postEngagePending) {
        work.dragonVeinMeta.expiredAtNextRoundStart = true;
      } else {
        work.dragonVeinMeta.postEngagePending = true;
      }
    }
  }
  record('emblem', null, '回合末 · 结合时限');
}
