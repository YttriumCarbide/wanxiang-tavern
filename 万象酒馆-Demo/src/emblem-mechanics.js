import { DRAGON_EMBLEM_ID, MASK_EMBLEM_ID, SUPREME_EMBLEM_ID } from './emblems.js';
import { NEGATIVE_STATUSES } from './status-rules.js';
import { finalSkillText } from './skill-text.js';

export function positionBuff(state, id, key) {
  return state.dragonVein &&
    state.formation[1] === id &&
    ['iron', 'strength', 'haste'].includes(key)
    ? 1
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

export function emblemTargetError(state, definition, actor, skill, target) {
  if (skill.mechanic === 'sacrifice' && actor === target) return '欺之牺需要选择另一名存活队友';
  if (skill.mechanic === 'moonEye') {
    const unit = state.units[target];
    if (definition?.boss) return '月之瞳不能指定Boss';
    if (!unit || unit.hp <= 0 || NEGATIVE_STATUSES.filter((key) => unit.buffs[key] > 0).length < 3)
      return '月之瞳需要至少有3种负面状态的存活敌人';
  }
  return null;
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
  delete state.absorptionBases;
  delete state.dragonVein;
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
      if (!allies().some((unit) => active(unit.id, SUPREME_EMBLEM_ID))) return false;
      ports.log(`${definitions[actor].name}施加的负面状态被万法归寂返还`);
      ports.buff(actor, actor, buff, value, true);
      return true;
    },
    damage(actor, target, damage) {
      if (!damage || state.units[target]?.side !== 'enemy' || !active(actor, MASK_EMBLEM_ID))
        return;
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
      if (!active(actor, DRAGON_EMBLEM_ID) || hitIds.size !== 1) return;
      const [target] = hitIds;
      for (const key of ['vulnerable', 'weak', 'slow']) ports.buff(actor, target, key, 1, true);
    },
    cast(actor, skill, target) {
      if (skill.mechanic === 'dragonVein') {
        state.dragonVein = true;
        ports.log('龙脉刻入左、中、右三个前场位置，本场战斗保留');
      } else if (skill.mechanic === 'sacrifice') {
        state.sacrifices ||= {};
        state.sacrifices[target] = actor;
        ports.buff(actor, target, 'sacrifice', 1, true);
      } else if (skill.mechanic === 'moonEye') {
        const hp = state.units[target].hp;
        ports.lose(state.units[target], hp, '月之瞳');
        for (const enemy of state.enemyIds)
          if (enemy !== target && state.units[enemy].hp > 0) ports.damage(actor, enemy, hp);
      }
    },
    roundEnd() {
      if (!state.dragonVein) return;
      const left = state.units[state.formation[0]],
        right = state.units[state.formation[2]];
      if (left?.hp > 0) ports.heal(left.id, 8, true);
      if (right?.hp > 0) right.mp = Math.min(right.maxMp, right.mp + 8);
      ports.log('龙脉 · 左位回复8hp，右位回复8sp');
    },
  };
}
