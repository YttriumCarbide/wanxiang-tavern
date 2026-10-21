import { newLibrary } from '../src/ai/library.js';
import { buyItem } from '../src/content/items.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSSES, HEROES, encounterSpec } from '../src/data.js';
import { preview, advance, intent, newEncounter, campRest } from '../src/engine.js';
import { newExpedition, beginEncounter, completeEncounter, chooseRest } from '../src/expedition.js';
import { buildPlan } from './planner.js';

test('only rear entry skills become ready between battles; first arrival still requires charging', () => {
  const first = newEncounter(encounterSpec(0));
  assert(first.formation.filter(Boolean).every((id) => !first.units[id].entryReady));
  for (const id of first.formation.filter(Boolean)) first.units[id].entryReady = false;
  const rear = first.formation.slice(3).filter(Boolean);
  first.units[rear[0]].hp = 10;
  first.units[rear[0]].mp = 2;
  const next = newEncounter(encounterSpec(1), first, 1);
  assert(rear.every((id) => next.units[id].entryReady));
  assert(
    next.formation
      .slice(0, 3)
      .filter(Boolean)
      .every((id) => !next.units[id].entryReady),
  );
  assert.equal(next.units[rear[0]].hp, 10);
  assert.equal(next.units[rear[0]].mp, 2);
});
test('four normal encounters then a final boss; every original art theme remains reachable across routes', () => {
  for (const boss of BOSSES) {
    const specs = Array.from({ length: 5 }, (_, i) => encounterSpec(i, boss.id));
    assert.equal(specs.filter((s) => s.boss).length, 1);
    assert(specs[4].enemyIds.includes(boss.id));
    for (const map of ['ruins', 'frost', 'forge', 'tide'])
      assert(specs.some((spec) => spec.map === map));
  }
});
test('ordinary battle carry preserves dying companions and mana; explicit sleep restores life', () => {
  const s = newEncounter(encounterSpec(0));
  s.units.aegis.hp = 0;
  s.units.aegis.mp = 3;
  s.units.morrow.mp = 2;
  const r = campRest(s);
  assert.equal(r.state.units.aegis.hp, 0);
  assert.equal(campRest(s, 'sleep').state.units.aegis.hp, Math.floor(s.units.aegis.maxHp * 0.4));
  assert.equal(r.state.units.aegis.mp, 3);
  assert.equal(r.state.units.morrow.mp, 2);
  assert.equal(s.units.aegis.hp, 0);
});
test('resources and formation persist; round status and action counters reset', () => {
  const s = newEncounter(encounterSpec(0));
  s.units.lyria.mp = 4;
  s.units.lyria.buffs.bleed = 3;
  s.units.lyria.used = 2;
  s.formation.reverse();
  const next = newEncounter(encounterSpec(1), s, 1);
  assert.equal(next.units.lyria.mp, 4);
  assert.equal(next.units.lyria.used, 0);
  assert.deepEqual(next.units.lyria.buffs, {});
  assert.deepEqual(next.formation, s.formation);
  assert.equal(next.phase, 'opening');
});
test('both bosses change to different second-phase intents at half health', () => {
  for (const boss of BOSSES) {
    const s = newEncounter(encounterSpec(4, boss.id));
    s.phase = 'plan';
    s.round = 1;
    const before = intent(s, boss.id);
    s.units[boss.id].hp = Math.floor(boss.hp / 2);
    const after = intent(s, boss.id);
    assert(after.enraged);
    assert.notEqual(before.name, after.name);
  }
});
test('boss second phase remains after regeneration heals above the threshold', () => {
  const s = newEncounter(encounterSpec(4, 'bossBloom'));
  s.phase = 'plan';
  s.round = 1;
  s.units.bossBloom.hp = 40;
  const r = preview(s, []);
  assert(r.final.units.bossBloom.hp > 40);
  assert(r.final.units.bossBloom.enraged);
  assert(intent(r.final, 'bossBloom').enraged);
});
for (const boss of BOSSES)
  test(`full five-encounter expedition can defeat ${boss.name}`, () => {
    const trip = newExpedition(boss.id),
      records = [];
    const supplies = newLibrary();
    supplies.inventory.gold = 200;
    for (let count = 0; count < 4; count++) assert(buyItem(supplies, 'fine-health-potion').ok);
    assert(buyItem(supplies, 'calamity-scroll').ok);
    for (let room = 0; room < 5; room++) {
      let s = beginEncounter(trip);
      if (room === 0) s.items = structuredClone(supplies.inventory.items);
      for (let turn = 0; turn < 35 && !['victory', 'defeat'].includes(s.phase); turn++) {
        const plan = buildPlan(s),
          r = preview(s, plan);
        assert(r.valid, JSON.stringify(r.invalid));
        s = advance(r);
      }
      assert.equal(s.phase, 'victory', `${boss.id} room ${room + 1}: ${JSON.stringify(s.units)}`);
      const mana = HEROES.map((h) => s.units[h.id].mp);
      records.push(s.round);
      const result = completeEncounter(trip, s);
      if (trip.restPending) chooseRest(trip, 'sleep');
      if (!result.complete) {
        const next = beginEncounter(trip);
        assert.deepEqual(
          HEROES.map((h) => next.units[h.id].mp),
          mana,
        );
      }
    }
    assert.equal(trip.status, 'complete');
    assert.equal(trip.records.length, 5);
    console.log(boss.name, records);
  });
