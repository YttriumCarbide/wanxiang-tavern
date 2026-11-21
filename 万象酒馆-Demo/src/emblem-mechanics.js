import {
  DRAGON_EMBLEM_ID,
  MASK_EMBLEM_ID,
  OVERLOAD_EMBLEM_ID,
  SUPREME_EMBLEM_ID,
} from './emblems.js';
import { NEGATIVE_STATUSES } from './status-rules.js';
import { finalSkillText } from './skill-text.js';

export function positionBuff(state, id, key) {
  return state.dragonVein &&
    state.formation[1] === id &&
    ['iron', 'strength', 'haste'].includes(key)
    ? 3
    : 0;
}

export function negativeImmune(state, id) {
  return (
    state.units[id]?.side === 'hero' &&
    Object.values(state.units).some(
      (unit) =>
        unit.side === 'hero' &&
        unit.hp > 0 &&
        unit.combined > 0 &&
        state.heroDefinitions?.[unit.id]?.emblemId === SUPREME_EMBLEM_ID,
    )
  );
}

export function emblemTargetError(state, _definition, actor, skill, target) {
  if (skill.mechanic === 'sacrifice' && actor === target) return '欺之牺需要选择另一名存活队友';
  if (skill.mechanic === 'moonEye') {
    const unit = state.units[target];
    if (!unit || unit.hp <= 0 || NEGATIVE_STATUSES.filter((key) => unit.buffs[key] > 0).length < 3)
      return '月之瞳需要至少有3种负面状态的存活敌人';
  }
  return null;
}

/** Restores battle-temporary Overload Engage limits without deducting accumulated HP. */
export function endOverloadEngageForUnit(unit, { preserveSavedBonus = false } = {}) {
  const engage = unit?.overloadEngage;
  if (!engage) return false;
  if (preserveSavedBonus && unit.buffs?.overload > 0) {
    unit.overloadSavedBonus = (engage.gainedMaxMp || 0) + (engage.gainedMaxHp || 0);
  }
  unit.maxHp = engage.baseMaxHp;
  unit.maxMp = engage.baseMaxMp;
  unit.mp = Math.min(unit.mp, unit.maxMp);
  delete unit.overloadEngage;
  return true;
}

/** Clears only battle-owned fields; permanent character definitions never receive absorption. */
export function clearBattleMechanics(state) {
  for (const [id, saved] of Object.entries(state.absorptionBases || {})) {
    state.heroDefinitions[id] = structuredClone(saved.definition);
    const unit = state.units[id];
    if (unit) {
      unit.maxHp = saved.maxHp;
      unit.maxMp = saved.maxMp;
      unit.hp = Math.min(unit.hp, unit.maxHp);
      unit.mp = Math.min(unit.mp, unit.maxMp);
    }
  }
  for (const unit of Object.values(state.units || {})) {
    endOverloadEngageForUnit(unit);
    delete unit.overloadSavedBonus;
  }
  delete state.absorptionBases;
  delete state.dragonVein;
  delete state.dragonVeinMeta;
  delete state.kamuiTriggeredRound;
  delete state.sinkingPlague;
  delete state.sacrifices;
}

/** All effects execute inside the sole battle simulation, including preview and death chains. */
export function createEmblemMechanics(state, definitions, ports) {
  const allies = () => Object.values(state.units).filter((unit) => unit.side === 'hero');
  const active = (id, emblem) =>
    state.units[id]?.hp > 0 && state.units[id].combined > 0 && definitions[id]?.emblemId === emblem;
  const deaths = [];
  let resolving = false,
    deferring = false;
  function absorb(owner, victim) {
    const unit = state.units[owner],
      donor = state.units[victim];
    if (!unit || unit.hp <= 0 || !donor) return;
    state.absorptionBases ||= {};
    state.absorptionBases[owner] ||= {
      definition: structuredClone(definitions[owner]),
      maxHp: unit.maxHp,
      maxMp: unit.maxMp,
    };
    const def = structuredClone(definitions[owner]);
    const source = definitions[victim];
    const hp = Math.floor(donor.maxHp * 0.2),
      mp = Math.floor(donor.maxMp * 0.2);
    def.hp += hp;
    def.mp += mp;
    def.attack += Math.floor(source.attack * 0.2);
    const skills = (source.skills || []).filter((skill) => !skill.passive);
    const damage = Math.floor(
      Math.max(
        0,
        ...skills.flatMap((skill) =>
          skill.effects.filter((effect) => effect.type === 'damage').map((effect) => effect.value),
        ),
      ) * 0.2,
    );
    for (const skill of def.skills || [])
      for (const effect of skill.effects || [])
        if (effect.type === 'damage') effect.value += damage;
    if (skills.length) {
      state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
      const copy = structuredClone(skills[state.seed % skills.length]);
      copy.id = 'sacrifice-' + victim + '-' + copy.id;
      if (!def.skills.some((skill) => skill.id === copy.id)) def.skills.push(copy);
    }
    for (const skill of def.skills)
      if (!skill.passive) skill.text = finalSkillText(skill, def.mechanicMark?.name);
    state.heroDefinitions[owner] = def;
    definitions[owner] = def;
    unit.maxHp += hp;
    unit.maxMp += mp;
    unit.hp = Math.min(unit.maxHp, unit.hp + hp);
    unit.mp = Math.min(unit.maxMp, unit.mp + mp);
    ports.log(`${def.name}吸收了${source.name}的力量与一个技能`);
  }
  function onDeath(id) {
    deaths.push(id);
    flushDeaths();
  }
  function flushDeaths() {
    if (resolving || deferring) return;
    resolving = true;
    while (deaths.length) {
      const dead = deaths.shift();
      if (state.units[dead]?.side === 'enemy') {
        const marks = Object.entries(state.sacrifices || {});
        for (const [victim, owner] of marks) {
          delete state.sacrifices[victim];
          if (!state.units[victim]?.hp || !state.units[owner]?.hp) continue;
          delete state.units[victim].buffs.sacrifice;
          ports.lose(state.units[victim], state.units[victim].hp, '欺之牺 · 献祭');
          for (const enemy of state.enemyIds) {
            if (state.units[enemy].hp > 0) ports.heal(enemy, state.units[enemy].maxHp, true);
          }
          absorb(owner, victim);
        }
      }
      for (const bearer of allies().filter((unit) => active(unit.id, MASK_EMBLEM_ID))) {
        ports.log(`${definitions[bearer.id].name} · 城之祭：死亡回响`);
        for (const unit of allies().filter((unit) => unit.hp > 0)) {
          ports.heal(unit.id, Math.floor(unit.maxHp * 0.2), true);
          unit.mp = Math.min(unit.maxMp, unit.mp + Math.floor(unit.maxMp * 0.2));
        }
      }
    }
    resolving = false;
  }
  return {
    onDeath,
    reflect(actor, target, buff, value) {
      if (
        state.units[actor]?.side !== 'enemy' ||
        state.units[target]?.side !== 'hero' ||
        !NEGATIVE_STATUSES.includes(buff)
      )
        return false;
      const protector = allies().find((unit) => active(unit.id, SUPREME_EMBLEM_ID));
      if (!protector) return false;
      ports.log(`${definitions[actor].name}施加的负面状态被万法归寂返还`);
      ports.buff(protector.id, actor, buff, value, true, '万法归寂返还');
      return true;
    },
    damage(actor, target, damage) {
      if (!damage || state.units[target]?.side !== 'enemy') return;
      if (active(actor, OVERLOAD_EMBLEM_ID)) {
        const owner = state.units[actor];
        owner.overloadEngage ||= {
          baseMaxHp: owner.maxHp,
          baseMaxMp: owner.maxMp,
          gainedMaxMp: 0,
          gainedMaxHp: 0,
        };
        owner.maxHp += damage;
        owner.overloadEngage.gainedMaxHp += damage;
        ports.log(`${definitions[actor].name} · 灵能血装：最大生命+${damage}`);
        ports.heal(actor, damage, true);
      }
      if (!active(actor, MASK_EMBLEM_ID)) return;
      const owner = state.units[actor];
      ports.log(`${definitions[actor].name} · 城之祭`);
      deferring = true;
      ports.damage(actor, target, Math.floor(owner.maxHp * 0.2));
      for (const unit of allies().filter((unit) => unit.hp > 0 && unit.id !== actor))
        ports.lose(unit, Math.floor(unit.maxHp * 0.1), '城之祭 · 代价');
      deferring = false;
      flushDeaths();
    },
    attack(actor, hitIds) {
      if (!active(actor, DRAGON_EMBLEM_ID) || !hitIds.size) return;
      const roundKey = state.round || 0;
      state.kamuiTriggeredRound ||= {};
      if (state.kamuiTriggeredRound[actor] === roundKey) return;
      state.kamuiTriggeredRound[actor] = roundKey;
      for (const target of hitIds) {
        if (!(state.units[target]?.hp > 0)) continue;
        for (const key of ['vulnerable', 'weak', 'slow']) ports.buff(actor, target, key, 1, true);
      }
    },
    cast(actor, skill, target) {
      if (skill.mechanic === 'dragonVein') {
        state.dragonVein = true;
        state.dragonVeinMeta = {
          owner: actor,
          postEngagePending: false,
          expiredAtNextRoundStart: false,
        };
        ports.log('龙脉刻入左、中、右三个前场位置（持续至结合结束后的下下回合开始）');
      } else if (skill.mechanic === 'sacrifice') {
        state.sacrifices ||= {};
        state.sacrifices[target] = actor;
        ports.buff(actor, target, 'sacrifice', 1, true);
      } else if (skill.mechanic === 'moonEye') {
        const enemyUnit = state.units[target];
        const hp = enemyUnit.hp;
        if (definitions[target]?.boss) {
          const halfHp = Math.max(1, Math.floor(hp / 2));
          ports.lose(enemyUnit, halfHp, '月之瞳');
          ports.log(
            `${definitions[actor].name} · 月之瞳：凝视首领${definitions[target].name}，削去当前生命值一半（${halfHp}伤害）`,
          );
        } else {
          ports.lose(enemyUnit, hp, '月之瞳');
          for (const enemy of state.enemyIds)
            if (enemy !== target && state.units[enemy].hp > 0) ports.damage(actor, enemy, hp);
        }
      } else if (skill.mechanic === 'shatterShell') {
        const enemy = state.units[target];
        if (!enemy || enemy.hp <= 0) return;
        const stripped = Math.max(0, enemy.block || 0);
        if (stripped > 0) {
          enemy.block = 0;
          for (const ally of allies()) if (ally.hp > 0) ports.heal(ally.id, stripped, true);
          ports.log(
            `${definitions[actor].name} · 裂壳共鸣：移除${definitions[target].name}全部${stripped}点护盾，我方全部存活角色回复${stripped}生命`,
          );
        } else {
          ports.log(`${definitions[actor].name} · 裂壳共鸣：${definitions[target].name}当前无护盾`);
        }
        if (!enemy.broken && enemy.breakWindow?.active && enemy.breakWindow.current > 1) {
          const before = enemy.breakWindow.current;
          enemy.breakWindow.current = 1;
          enemy.toughness = 1;
          ports.log(`${definitions[target].name}剩余韧性被削减至1层（原${before}层）`);
        }
      }
    },
    roundEnd() {
      if (!state.dragonVein) return;
      const left = state.units[state.formation[0]],
        right = state.units[state.formation[2]];
      if (left?.hp > 0) ports.heal(left.id, Math.max(1, Math.round(left.maxHp * 0.25)), true);
      if (right?.hp > 0) {
        const gain = Math.max(1, Math.round(right.maxMp * 0.25));
        if (ports.restoreMana) ports.restoreMana(right.id, gain, true);
        else right.mp = Math.min(right.maxMp, right.mp + gain);
      }
      ports.log('龙脉 · 左位回复25%最大hp，右位回复25%最大sp');
    },
  };
}
