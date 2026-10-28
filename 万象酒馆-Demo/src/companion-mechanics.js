import { finalSkillText } from './skill-text.js';

/** Expedition modifiers are snapshots, never written back to permanent character definitions. */
export function applyCompanionModifiers(combat, modifier) {
  const result = structuredClone(combat);
  if (!modifier) return result;
  if (modifier.steps)
    return modifier.steps.reduce((current, step) => applyCompanionModifiers(current, step), result);
  const scale = modifier.scale ?? 1;
  for (const key of ['hp', 'mp', 'attack'])
    result[key] = Math.max(
      key === 'hp' ? 1 : 0,
      Math.floor(result[key] * scale) + (modifier.add?.[key] || 0),
    );
  result.skills = result.skills.filter((skill) => !(modifier.lostSkills || []).includes(skill.id));
  for (const skill of result.skills)
    for (const effect of skill.effects || [])
      if (effect.type === 'damage')
        effect.value = Math.max(
          0,
          Math.floor(effect.value * scale) + (modifier.add?.skillDamage || 0),
        );
  for (const skill of modifier.extraSkills || [])
    if (
      !(modifier.lostSkills || []).includes(skill.id) &&
      !result.skills.some((existing) => existing.id === skill.id)
    )
      result.skills.push(structuredClone(skill));
  for (const skill of result.skills)
    if (!skill.passive) skill.text = finalSkillText(skill, result.mechanicMark?.name);
  return result;
}
export function canSoulRevive(state, target) {
  return (
    state.units[target]?.side === 'hero' &&
    state.units[target].hp === 0 &&
    !(state.soulSpent || []).includes(target) &&
    !Object.values(state.soulLoans || {}).includes(target)
  );
}
export function createCompanionMechanics(state, definitions, ports) {
  const has = (id, mechanic) =>
    definitions[id]?.skills?.some((skill) => skill.mechanic === mechanic);
  function choose(items) {
    if (!items.length) return null;
    state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
    return items[state.seed % items.length];
  }
  function update(id, modifier, scaleCurrent = false) {
    const unit = state.units[id],
      old = definitions[id];
    const combat = applyCompanionModifiers(old, modifier);
    state.heroDefinitions[id] = combat;
    definitions[id] = combat;
    const hp = combat.hp - old.hp,
      mp = combat.mp - old.mp;
    unit.maxHp += hp;
    unit.maxMp += mp;
    if (scaleCurrent) {
      if (unit.hp > 0)
        unit.hp = Math.max(1, Math.min(unit.maxHp, Math.ceil(unit.hp * (modifier.scale ?? 1))));
      unit.mp = Math.max(0, Math.min(unit.maxMp, Math.floor(unit.mp * (modifier.scale ?? 1))));
    } else {
      if (unit.hp > 0) unit.hp = Math.max(1, Math.min(unit.maxHp, unit.hp + Math.max(0, hp)));
      unit.mp = Math.max(0, Math.min(unit.maxMp, unit.mp + Math.max(0, mp)));
    }
    state.expeditionModifiers ||= {};
    const prior = state.expeditionModifiers[id] || {};
    state.expeditionModifiers[id] = {
      steps: [...(prior.steps || []), structuredClone(modifier)],
      scale: (prior.scale ?? 1) * (modifier.scale ?? 1),
      add: Object.fromEntries(
        ['hp', 'mp', 'attack', 'skillDamage'].map((key) => [
          key,
          Math.floor((prior.add?.[key] || 0) * (modifier.scale ?? 1)) + (modifier.add?.[key] || 0),
        ]),
      ),
      extraSkills: [...(prior.extraSkills || []), ...(modifier.extraSkills || [])],
      lostSkills: [...(prior.lostSkills || []), ...(modifier.lostSkills || [])],
    };
  }
  return {
    start() {
      state.soulLoans ||= {};
    },
    targetError(actor, skill, target) {
      if (
        skill.mechanic === 'soul-banquet' &&
        (actor === target ||
          state.soulLoans?.[actor] ||
          !state.formation.slice(0, 3).includes(target) ||
          state.units[target]?.hp <= 0 ||
          Object.values(state.soulLoans || {}).includes(target))
      )
        return '需要未被抽取的存活前场队友；每次探索只能抽取一次';
      if (skill.mechanic === 'soul-revive' && (!canSoulRevive(state, target) || actor === target))
        return '需要灵核完好的濒死队友；已抽取或已复活者不能再支付代价';
      return '';
    },
    cast(actor, skill, target) {
      if (skill.mechanic === 'soul-banquet') {
        state.soulLoans ||= {};
        state.soulLoans[actor] = target;
        const base = structuredClone(definitions[target]);
        const selected = choose(
          (base.skills || []).filter(
            (skill) => !skill.passive && !skill.mechanic?.startsWith('soul-'),
          ),
        );
        const damage = Math.max(
          0,
          ...(base.skills || []).flatMap((skill) =>
            (skill.effects || [])
              .filter((effect) => effect.type === 'damage')
              .map((effect) => effect.value),
          ),
        );
        update(target, { scale: 0.5 }, true);
        update(actor, {
          add: {
            hp: Math.floor(base.hp * 0.5),
            mp: Math.floor(base.mp * 0.5),
            attack: Math.floor(base.attack * 0.5),
            skillDamage: Math.floor(damage * 0.5),
          },
          extraSkills: selected
            ? [
                {
                  ...selected,
                  id: 'borrowed-' + target + '-' + selected.id,
                  borrowedFrom: base.name,
                },
              ]
            : [],
        });
        ports.log(
          definitions[actor].name +
            '抽取' +
            base.name +
            '的灵核投影：本次探索转移50%属性' +
            (selected ? '并借取主动技能「' + selected.name + '」' : '；目标没有可借取的主动技能'),
        );
      }
      if (skill.mechanic === 'junlue') {
        state.duels ||= {};
        state.duels[target] = { actor, attack: true, gain: true };
      }
      if (skill.mechanic === 'soul-revive') {
        const lost = choose(definitions[target].skills || []);
        update(target, { scale: 0.8, lostSkills: lost ? [lost.id] : [] }, true);
        const unit = state.units[target];
        unit.hp = unit.maxHp;
        unit.mp = unit.maxMp;
        unit.buffs = {};
        unit.block = 0;
        unit.used = 0;
        state.soulSpent ||= [];
        state.soulSpent.push(target);
        ports.log(
          `${definitions[target].name}被灵核重构，hp/sp回满，本次探索损失20%属性${lost ? '与技能「' + lost.name + '」' : ''}`,
        );
      }
    },
    forceTarget(enemy, fallback) {
      const actor = state.duels?.[enemy]?.actor;
      return state.duels?.[enemy]?.attack &&
        state.units[actor]?.hp > 0 &&
        state.formation.slice(0, 3).includes(actor)
        ? [actor]
        : fallback;
    },
    gain(id, effect) {
      const duel = state.duels?.[id];
      if (!duel?.gain || state.units[duel.actor]?.hp <= 0) return;
      duel.gain = false;
      ports.effect(duel.actor, effect);
      ports.log(`${definitions[duel.actor].name} · 均略：同步${definitions[id].name}的增益`);
    },
    afterEnemyAttack(enemy, targets) {
      if (state.duels?.[enemy]) state.duels[enemy].attack = false;
      for (const id of new Set(targets)) {
        const unit = state.units[id];
        if (
          unit?.hp <= 0 ||
          !has(id, 'luo-counter') ||
          unit.counterDisabled ||
          state.units[enemy].hp <= 0
        )
          continue;
        const damage = ports.basicAttack(id, enemy);
        unit.mp = Math.min(unit.maxMp, unit.mp + damage);
        if (unit.mp >= unit.maxMp) unit.counterDisabled = true;
        ports.log(
          `${definitions[id].name} · 毅明：回复${damage}sp${unit.counterDisabled ? '，sp已满，本场反击结束' : ''}`,
        );
        ports.record('counterRecovery', id, '毅明 · 回复sp', [id]);
      }
    },
  };
}
