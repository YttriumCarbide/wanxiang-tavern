import { enemyEffectSide } from './enemy-targets.js';
import {
  canCombine,
  COMBINE_SKILL,
  OVERLOAD_SKILL,
  EMBLEMS,
  OVERLOAD_EMBLEM_ID,
} from './emblems.js';
import { ITEMS, restoreBag } from './content/items.js';
import { definition, definitionsFor, heroesFor, abilityFor } from './catalog.js';
import { validateAction } from './validation.js';
import { HEROES, DEFINITIONS, encounterSpec, enemySlots } from './data.js';
import { auraValue, rulesFor, conditionsMet, triggerTargets, POSITIVE_BUFFS } from './triggers.js';
export const clone = (x) => structuredClone(x);
export function newBattle(
  enemyIds = encounterSpec(0).enemyIds,
  heroDefinitions = {},
  enemyDefinitions = {},
) {
  const heroes = HEROES.map((hero) => heroDefinitions[hero.id] || hero).filter(
    (hero) => !hero.inactive,
  );
  return {
    heroDefinitions: clone(heroDefinitions),
    enemyDefinitions: clone(enemyDefinitions),
    phase: 'opening',
    round: 0,
    enemyIds: [...enemyIds],
    formation: HEROES.map((h) => (heroes.some((hero) => hero.id === h.id) ? h.id : null)),
    units: Object.fromEntries(
      [...heroes, ...enemyIds.map((id) => enemyDefinitions[id] || DEFINITIONS[id])].map((d) => {
        let mp =
          d.mp +
          (d.skills || []).reduce((n, s) => n + (s.location === '战斗外' ? s.bonusMp || 0 : 0), 0);
        let hp = d.hp;
        if (d.emblemId === OVERLOAD_EMBLEM_ID && !d._overloadApplied) {
          mp = Math.round(mp * 1.5);
          hp = Math.round(hp + mp * 0.25);
        }
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
            buffs: { ...d.buffs },
            entryReady: false,
            used: 0,
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
  const value =
    (s.units[id]?.buffs[key] || 0) +
    (s.units[id]?.hp > 0 ? auraValue(s, heroesFor(s), id, key) : 0);
  return key === 'haste' ? Math.min(2, value) : value;
}
export function intent(s, id) {
  const def = definition(s, id),
    enraged =
      def.boss && (s.units[id].enraged || s.units[id].hp <= s.units[id].maxHp * def.phaseThreshold);
  const list = enraged ? def.enragedIntents : def.intents;
  const move = list[(Math.max(1, s.round) - 1) % list.length];
  return {
    ...move,
    ...(s.enemyIntentSlots?.[id] !== undefined ? { slot: s.enemyIntentSlots[id] } : {}),
    enraged: !!enraged,
  };
}
export function enemyTimeline(s, extraSlow = {}) {
  if (s.phase === 'opening') return [null];
  const enemies = livingEnemies(s),
    length = 3 + enemies.length,
    slots = Array(length).fill(null);
  const ranked = enemies
    .map((e, i) => ({
      id: e.id,
      speed: Math.max(1, e.speed - (s.units[e.id].buffs.slow || 0) - (extraSlow[e.id] || 0)),
      tie: (i * 17 + s.seed + s.round * 11) % 31,
    }))
    .sort((a, b) => b.speed - a.speed || a.tie - b.tie);
  for (const e of ranked) {
    let at = Math.max(0, Math.min(length - 1, length - e.speed));
    while (at < length && slots[at]) at++;
    if (at === length) {
      at = length - 1;
      while (slots[at]) at--;
    }
    slots[at] = e.id;
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
    usedSlots = new Map();
  for (const u of Object.values(work.units))
    if (definitions[u.id]?.boss && u.hp <= u.maxHp * (definitions[u.id].phaseThreshold || 0.5))
      u.enraged = true;
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
    currentStatusTriggers = [];
  work.procUses ||= {};
  function trigger(event, owner = null, detail = {}) {
    for (const hero of heroes) {
      if (owner && hero.id !== owner) continue;
      for (const rule of rulesFor(hero)) {
        const key = hero.id + ':' + rule.key;
        if (
          rule.mode !== 'event' ||
          rule.event !== event ||
          !conditionsMet(work, hero.id, rule.conditions) ||
          (work.procUses[key] || 0) >= rule.limit
        )
          continue;
        const targets = triggerTargets(work, hero.id, rule.target, detail);
        if (!targets.length) continue;
        work.procUses[key] = (work.procUses[key] || 0) + 1;
        currentLogs.push(`${hero.name} · ${rule.name}`);
        effects(hero.id, targets, rule.effects, true);
      }
    }
  }
  function death(u, reason) {
    if (u.hp === 0 && !deaths.some((d) => d.id === u.id)) {
      deaths.push({ id: u.id, at, reason });
      currentLogs.push(`${definitions[u.id]?.name || u.id}濒死，后续行动失效`);
    }
  }
  function lose(u, n, reason) {
    if (u.hp <= 0) return;
    u.hp = Math.max(0, u.hp - n);
    if (definitions[u.id]?.boss && u.hp <= u.maxHp * (definitions[u.id].phaseThreshold || 0.5))
      u.enraged = true;
    death(u, reason);
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
  function effects(
    actor,
    targets,
    list = [],
    generated = false,
    echo = false,
    split = false,
    bonus = 0,
  ) {
    for (const eff of list || []) {
      if (eff.type === 'selfHeal') {
        heal(actor, eff.value + bonus, generated);
        continue;
      }
      if (eff.type === 'selfMana') {
        const unit = work.units[actor];
        if (unit.hp <= 0) continue;
        const gained = Math.min(eff.value, unit.maxMp - unit.mp);
        unit.mp += gained;
        if (gained) currentLogs.push(`${definitions[actor].name}回复${gained}法力`);
        if (gained && !generated) trigger('manaRestored', actor, { targets: [actor] });
        continue;
      }
      if ((eff.type === 'shield' && eff.target === 'self') || eff.type === 'selfShield') {
        const unit = work.units[actor];
        if (unit && unit.hp > 0) {
          const n = eff.value + effectiveBuff(work, actor, 'guard');
          unit.block += n;
          currentLogs.push(`${definitions[actor].name}获得${n}护盾`);
        }
        continue;
      }
      const affected =
        eff.type === 'damage' && echo
          ? [...new Set([...targets, ...work.enemyIds])]
          : eff.type === 'damage' && split
            ? front(work).filter(Boolean)
            : targets;
      for (const id of affected) {
        const u = work.units[id];
        if (!u || u.hp <= 0) continue;
        if (eff.type === 'damage') {
          let n = eff.value + bonus + (actor ? effectiveBuff(work, actor, 'strength') : 0);
          if (work.units[actor]?.side === 'enemy')
            n = Math.max(1, Math.round(n * (work.enemyDamageScale || 1)));
          if (actor && effectiveBuff(work, actor, 'weak')) n = Math.floor(n * 0.75);
          if (split) {
            const total = n * split;
            const position = front(work).indexOf(id);
            n = Math.floor(total / 3) + (position < total % 3 ? 1 : 0);
          }
          if (effectiveBuff(work, id, 'vulnerable')) n = Math.floor(n * 1.5);
          n = Math.max(0, n - effectiveBuff(work, id, 'iron'));
          const absorbed = Math.min(u.block, n);
          u.block -= absorbed;
          const damage = n - absorbed;
          lose(u, damage, '攻击');
          const killed = u.hp === 0;
          currentLogs.push(
            `${definitions[actor]?.name || '道具'} → ${definitions[id].name}：${damage}伤害${absorbed ? `，护盾抵挡${absorbed}` : ''}`,
          );
          if (damage && !generated) {
            trigger('damageTaken', id, { attacker: actor, targets: [actor] });
            if (actor) trigger('damageDealt', actor, { targets: [id] });
          }
          if (killed && actor && !generated) trigger('kill', actor, { targets: [id] });
        }
        if (eff.type === 'shield') {
          const n = eff.value + effectiveBuff(work, id, 'guard');
          u.block += n;
          currentLogs.push(`${definitions[id].name}获得${n}护盾`);
        }
        if (eff.type === 'heal') heal(id, eff.value + bonus, generated);
        if (eff.type === 'mana') {
          const gained = Math.min(eff.value, u.maxMp - u.mp);
          u.mp += gained;
          currentLogs.push(`${definitions[id].name}回复${gained}法力`);
          if (gained && !generated) trigger('manaRestored', id, { targets: [id] });
        }
        if (eff.type === 'cleanse') for (const buff of eff.buffs) delete u.buffs[buff];
        if (eff.type === 'buff') {
          u.buffs[eff.buff] = (u.buffs[eff.buff] || 0) + eff.value;
          if (eff.buff === 'haste') u.buffs.haste = Math.min(2, u.buffs.haste);
          // A later status persists, but cannot move an attack that has already happened.
          if (eff.buff === 'slow' && u.side === 'enemy' && slots.indexOf(id) > at)
            slows[id] = (slows[id] || 0) + eff.value;
          if (!generated) {
            trigger('gainBuff', id, { targets: [id] });
            trigger(POSITIVE_BUFFS.includes(eff.buff) ? 'gainPositive' : 'gainNegative', id, {
              targets: [id],
            });
          }
        }
      }
    }
  }
  function bleed(id) {
    const u = work.units[id];
    if (u?.hp > 0 && u.buffs.bleed) {
      lose(u, u.buffs.bleed, '行动前流血');
      currentLogs.push(`${definitions[id].name}行动前流血${u.buffs.bleed}`);
      currentStatusTriggers.push({ id, type: 'bleed', value: u.buffs.bleed });
      record('status', id, '行动前 · 流血');
      return u.hp === 0;
    }
    return false;
  }
  function triggerEntrySkill(id, actionId, slot) {
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
    } else if (es.target === 'opposite' || es.target === 'enemy') {
      const eSlots = enemySlots(work.enemyIds);
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
    effects(id, esTargets, effectsList, false);
    currentLogs.push(`${inDef.name}入场触发【${es.name}】`);
    record('entrySkill', id, es.name, esTargets, actionId, es.id);
  }
  function record(type, actor, label, targetIds = [], actionId = null, skill = null) {
    events.push({
      type,
      at,
      actor,
      label,
      targets: targetIds,
      actionId,
      skill,
      logs: [...currentLogs],
      statusTriggers: [...currentStatusTriggers],
      after: clone(work),
    });
    currentLogs = [];
    currentStatusTriggers = [];
  }
  const beforeTriggers = JSON.stringify(work);
  if (s.phase === 'opening') trigger('battleStart');
  else trigger('roundStart');
  if (JSON.stringify(work) !== beforeTriggers) record('trigger', null, '装备与被动 · 开始');
  for (at = 0; at < slots.length; at++) {
    let a = valid.find((a) => a.start === at);
    const enemy = slots[at];
    if (enemy) {
      const u = work.units[enemy];
      if (u.hp <= 0) {
        record('skip', enemy, '敌人已濒死');
        continue;
      }
      if (u.buffs.bind) {
        currentLogs.push(`${definitions[enemy].name}受到禁锢，本回合行动取消`);
        currentStatusTriggers.push({ id: enemy, type: 'bind', value: 1 });
        record('skip', enemy, '禁锢 · 行动取消');
        continue;
      }
      bleed(enemy);
      if (u.hp <= 0) {
        record('skip', enemy, '流血致死 · 行动取消');
        continue;
      }
      const move = intent(work, enemy),
        targets = (move.slots || [move.slot]).map((slot) => work.formation[slot]).filter(Boolean);
      if (move.selfShield) effects(enemy, [enemy], [{ type: 'shield', value: move.selfShield }]);
      if (move.selfHeal) heal(enemy, move.selfHeal);
      if (move.selfBuff)
        effects(
          enemy,
          [enemy],
          Object.entries(move.selfBuff).map(([buff, value]) => ({ type: 'buff', buff, value })),
        );
      for (const effect of move.effects) {
        const effectTarget = enemyEffectSide(effect);
        if (effect.type === 'buff' && effect.buff === 'slow' && effectTarget === 'opponents')
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
                : targets;
        effects(
          enemy,
          ownTargets,
          [effect],
          false,
          false,
          effectTarget === 'opponents' && u.buffs.balance
            ? (move.slots || [move.slot]).length
            : false,
        );
      }
      record(
        'enemy',
        enemy,
        (move.enraged ? '【第二阶段】' : '') + move.name,
        u.buffs.balance ? [...new Set([...targets, ...front(work).filter(Boolean)])] : targets,
      );
    } else if (a) {
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
              if (destination < 3) triggerEntrySkill(id, a.id, destination);
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
        triggerEntrySkill(a.incoming, a.id, a.slot);
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
        !!u.buffs.overload &&
        a.skill !== 'attack' &&
        a.skill !== COMBINE_SKILL.id &&
        a.skill !== OVERLOAD_SKILL.id;
      const mpCost = skill.mp * (isOverloaded ? 2 : 1);
      const hpCost = (skill.hp || 0) * (isOverloaded ? 2 : 1);
      let error = '';
      if (
        [COMBINE_SKILL.id, OVERLOAD_SKILL.id].includes(a.skill) &&
        (!u.combined || u.combineSkillUsed)
      )
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
      if (
        targets.some(
          (id) =>
            !work.units[id] ||
            (skill.target === 'enemy' && work.units[id].side !== 'enemy') ||
            (skill.target === 'ally' && work.units[id].side !== 'hero'),
        )
      )
        error = '技能目标无效';
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
      if (attack) trigger('beforeAttack', a.actor, { targets });
      if (u.hp > 0) {
        const echo =
          !!u.combined &&
          attack &&
          skill.target === 'enemy' &&
          (!def.emblemId || def.emblemId === 'tan-hongyu');
        const bonus =
          def.emblemId === OVERLOAD_EMBLEM_ID && a.skill !== 'attack'
            ? Math.round(mpCost * 0.25)
            : 0;
        effects(a.actor, targets, skill.effects, false, echo, false, bonus);
        if (isOverloaded && u.hp > 0) {
          currentLogs.push(`${definitions[a.actor].name}超限负荷：技能额外生效一次`);
          effects(a.actor, targets, skill.effects, false, echo, false, bonus);
        }
        if ([COMBINE_SKILL.id, OVERLOAD_SKILL.id].includes(a.skill)) u.combineSkillUsed = true;
        if (attackedEnemy && def.emblemId && !u.combined)
          u.emblemCharge = Math.min(6, (u.emblemCharge || 0) + 1);
      }
      if (a.skill !== 'attack') trigger('skillCast', a.actor, { targets });
      if (attack) trigger('afterAttack', a.actor, { targets });
      record('hero', a.actor, skill.name, targets, a.id, a.skill);
    } else if (!usedSlots.has(at)) record('wait', null, '保留行动');
  }
  if (s.phase !== 'opening') {
    at = slots.length;
    trigger('roundEnd');
    for (const hero of heroes) {
      const unit = work.units[hero.id];
      if (!unit || unit.hp <= 0) continue;
      if (rearAtStart.has(hero.id) && !movedToFront.has(hero.id) && rear(work).includes(hero.id)) {
        unit.entryReady = true;
      }
      if (!hero.emblemId) continue;
      if (unit.combined) {
        unit.combined--;
        if (!unit.combined) unit.combineSkillUsed = false;
      } else if (rear(work).includes(hero.id))
        unit.emblemCharge = Math.min(6, (unit.emblemCharge || 0) + 2);
    }
    record('emblem', null, '纹章 · 充能与结合时限');
    for (const u of Object.values(work.units))
      if (u.hp > 0 && effectiveBuff(work, u.id, 'regen'))
        heal(u.id, effectiveBuff(work, u.id, 'regen'));
    record('regen', null, '回合末 · 再生先结算');
    for (const u of Object.values(work.units))
      if (u.hp > 0 && u.buffs.poison) {
        lose(u, u.buffs.poison, '回合末中毒');
        currentLogs.push(`${definitions[u.id].name}中毒${u.buffs.poison}`);
        currentStatusTriggers.push({ id: u.id, type: 'poison', value: u.buffs.poison });
      }
    record('poison', null, '回合末 · 中毒结算');
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
  if (result.outcome) {
    s.phase = result.outcome;
    return s;
  }
  const opening = s.phase === 'opening';
  s.phase = 'plan';
  s.round = opening ? 1 : s.round + 1;
  for (const u of Object.values(s.units)) {
    u.used = 0;
    if (!opening) u.block = 0;
  }
  return s;
}
export function newEncounter(spec, prior = null, index = 0, heroDefinitions = {}) {
  const s = newBattle(
    spec.enemyIds,
    prior?.heroDefinitions || heroDefinitions,
    spec.enemyDefinitions || prior?.enemyDefinitions || {},
  );
  s.formation = prior ? [...prior.formation] : s.formation;
  s.procUses = clone(prior?.procUses || {});
  s.enemyIds = [...spec.enemyIds];
  s.items = restoreBag(prior?.items);
  s.encounter = index;
  s.map = spec.map;
  s.enemyDamageScale = spec.enemyDamageScale || 1;
  s.seed += index * 17;
  const units = {};
  for (const h of heroesFor(s)) {
    units[h.id] = prior
      ? {
          ...clone(prior.units[h.id]),
          buffs: {},
          block: 0,
          used: 0,
          combined: 0,
          combineSkillUsed: false,
          entryReady: false,
        }
      : s.units[h.id];
    if (spec.environment?.bonusMp) units[h.id].maxMp = s.units[h.id].maxMp;
  }
  for (const id of spec.enemyIds) {
    const d = definition(s, id),
      hp = Math.max(1, Math.round(d.hp * (d.boss ? spec.bossHpScale || 1 : spec.hpScale)));
    units[id] = {
      id,
      side: 'enemy',
      hp,
      maxHp: hp,
      mp: 0,
      maxMp: 0,
      block: 0,
      buffs: { ...d.buffs },

      used: 0,
    };
  }
  s.units = units;
  for (const [id, buffs] of Object.entries(spec.initialEnemyBuffs || {})) {
    if (units[id]?.side === 'enemy') Object.assign(units[id].buffs, buffs);
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
  const changes = [];
  for (const hero of heroesFor(s)) {
    const unit = rested.units[hero.id];
    const before = { hp: unit.hp, mp: unit.mp };
    if (recovery === 'sleep')
      unit.hp = Math.min(unit.maxHp, unit.hp + Math.floor(unit.maxHp * 0.4));
    if (recovery === 'meal') unit.mp = unit.maxMp;
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
