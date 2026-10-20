import { ITEMS } from '../src/content/items.js';
import { abilityFor, definitionsFor, heroesFor } from '../src/catalog.js';
import { preview, getEnemies, makeAction, makeSwap, makeItem } from '../src/engine.js';
function score(result) {
  let n = 0;
  for (const u of Object.values(result.final.units)) {
    if (u.side === 'enemy') {
      n += (u.maxHp - u.hp) * 1.15 + (u.hp === 0 ? 100 : 0);
      // Value two rounds of persistent attrition instead of treating poison as one small hit.
      if (u.hp > 0) {
        const attrition = Math.max(
          0,
          (u.buffs.poison || 0) + (u.buffs.bleed || 0) - (u.buffs.regen || 0),
        );
        n += Math.min(u.hp, attrition * 2) * 1.15;
        if (u.buffs.weak) n += 2;
      }
    } else {
      n += u.hp * 0.9 - (u.hp === 0 ? 65 : 0);
      if (u.hp > 0) {
        n += Math.min(u.maxHp - u.hp, (u.buffs.regen || 0) * 2) * 0.9;
        n -= Math.min(u.hp, (u.buffs.poison || 0) * 2 + (u.buffs.bleed || 0));
      }
    }
  }
  return n;
}
export function buildPlan(s) {
  const DEFINITIONS = definitionsFor(s),
    HEROES = heroesFor(s);
  const ability = (id, skill) => abilityFor(s, id, skill);
  const plan = [];
  let r = preview(s, plan);
  if (
    s.phase === 'opening' &&
    ability('morrow', 'delay') &&
    s.formation.slice(0, 3).includes('morrow') &&
    s.units.morrow.mp >= 3
  ) {
    const fastest = getEnemies(s).sort((a, b) => b.speed - a.speed)[0];
    const a = makeAction(s, 'morrow', 'delay', fastest.id, 0);
    if (preview(s, [a]).valid) return [a];
  }
  for (let tries = 0; tries < 6; tries++) {
    const candidates = [];
    for (let start = 0; start < r.slots.length; start++) {
      if (r.slots[start] || plan.some((a) => start >= a.start && start < a.start + a.ap)) continue;
      const beforeAction = r.events.filter((event) => event.at < start).at(-1)?.after || s;
      for (let slot = 0; slot < 3; slot++) {
        for (const incoming of r.final.formation
          .slice(3)
          .filter((id) => r.final.units[id]?.hp > 0)) {
          if (
            r.final.units[r.final.formation[slot]]?.hp /
              r.final.units[r.final.formation[slot]]?.maxHp >
            0.5
          )
            continue;
          const a = makeSwap(incoming, slot, start),
            p = preview(s, [...plan, a]);
          if (p.valid) candidates.push({ a, p, score: score(p) });
        }
      }
      for (const item of Object.values(ITEMS).filter((item) => r.final.items[item.id] > 0)) {
        const ids = item.target === 'enemy' ? s.enemyIds : beforeAction.formation;
        for (const target of ids.filter((id) => beforeAction.units[id]?.hp > 0)) {
          const a = makeItem(item.id, target, start);
          const p = preview(s, [...plan, a]);
          if (p.valid) candidates.push({ a, p, score: score(p) - 1 });
        }
      }
      for (const actor of r.final.formation.slice(0, 3).filter(Boolean)) {
        if (!beforeAction.formation.slice(0, 3).includes(actor)) continue;
        const u = beforeAction.units[actor],
          d = DEFINITIONS[actor];
        if (u.hp === 0 || u.used >= d.limit) continue;
        for (const id of ['attack', ...d.skills.filter((a) => !a.passive).map((a) => a.id)]) {
          const skill = ability(actor, id);
          if (skill.mp > u.mp) continue;
          const targets =
            skill.target === 'enemy'
              ? getEnemies(s)
                  .filter((d) => beforeAction.units[d.id].hp > 0)
                  .map((d) => d.id)
              : skill.target === 'ally'
                ? HEROES.filter((d) => beforeAction.units[d.id].hp > 0).map((d) => d.id)
                : [actor];
          for (const target of targets) {
            const a = makeAction(s, actor, id, target, start),
              p = preview(s, [...plan, a]);
            if (p.valid) candidates.push({ a, p, score: score(p) - skill.mp * 1.7 });
          }
        }
      }
    }
    if (!candidates.length) break;
    candidates.sort((a, b) => b.score - a.score || a.a.ap - b.a.ap);
    const best = candidates[0];
    plan.push(best.a);
    r = best.p;
    if (r.outcome === 'victory') break;
  }
  return plan;
}
