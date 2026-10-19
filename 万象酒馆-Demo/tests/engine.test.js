import { buildPlan } from './planner.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newBattle as createBattle,
  preview,
  advance,
  enemyTimeline,
  makeAction,
  makeSwap,
  makeReposition,
} from '../src/engine.js';
import { HEROES, BUFFS, DEFINITIONS } from '../src/data.js';
// A deliberate advanced fixture keeps status/speed rule coverage independent of room balance.
const tacticalEnemies = ['hound', 'warden', 'hexer'];
const newBattle = () => createBattle(tacticalEnemies);

test('malformed commands become invalid previews instead of throwing or creating free actions', () => {
  const state = advance(preview(newBattle(), []));
  const skill = makeAction(state, 'morrow', 'attack', 'hound', 0);
  for (const action of [
    null,
    { ...skill, actor: 'missing-character' },
    { ...skill, skill: 'missing-skill' },
    { ...skill, ap: 0 },
    { ...makeSwap('serin', 0, 0), slot: 99 },
    { ...makeSwap('serin', 0, 0), ap: 0 },
    { ...skill, kind: 'unknown-command' },
  ]) {
    const result = preview(state, [action]);
    assert.equal(result.valid, false);
    assert(result.invalid.length > 0);
  }
});
const normal = () => advance(preview(newBattle(), []));
test('six different companions use valid statuses, four passive locations and action limits', () => {
  assert.equal(HEROES.length, 6);
  assert.equal(new Set(HEROES.map((h) => h.title)).size, 6);
  const buffs = new Set(
    HEROES.flatMap((h) =>
      h.skills.flatMap((s) => [s.buff, ...(s.effects || []).map((e) => e.buff)]),
    ),
  );
  for (const key of buffs) if (key) assert(Object.hasOwn(BUFFS, key), key);
  assert.deepEqual(
    new Set(HEROES.flatMap((h) => h.skills.filter((s) => s.passive).map((s) => s.location))),
    new Set(['前场', '后场', '全战斗', '战斗外']),
  );
  assert(HEROES.some((h) => h.limit === 2));
});
test('opening grants one player AP with no enemy action', () => {
  const s = newBattle(),
    r = preview(s, [makeAction(s, 'morrow', 'delay', 'hound', 0)]);
  assert.equal(r.slots.length, 1);
  assert(r.valid);
  assert.equal(r.final.units.hound.buffs.slow, 2);
  assert.equal(r.events.filter((e) => e.type === 'enemy').length, 0);
  assert.equal(advance(r).round, 1);
  assert.equal(advance(r).units.morrow.mp, 23);
});
test('speed one goes last and the forecast remains deterministic', () => {
  const s = normal();
  assert.equal(enemyTimeline(s).at(-1), 'hexer');
  assert.deepEqual(preview(s, []), preview(s, []));
});
test('a two AP skill needs two contiguous player slots', () => {
  const s = normal(),
    r = preview(s, [makeAction(s, 'lyria', 'blade-dance', 'hound', 0)]);
  assert(!r.valid);
  assert.match(r.invalid[0].message, /敌人/);
});
test('slow immediately moves an enemy; removing it keeps the two AP action in place and invalid', () => {
  const s = normal(),
    slow = makeAction(s, 'morrow', 'delay', 'hound', 0),
    blade = makeAction(s, 'lyria', 'blade-dance', 'warden', 1);
  const r = preview(s, [slow, blade]);
  assert(r.valid, JSON.stringify(r.invalid));
  assert.notEqual(r.slots[1], 'hound');
  const removed = preview(s, [blade]);
  assert(!removed.valid);
  assert.equal(blade.start, 1);
  assert(removed.invalid.some((i) => i.id === blade.id));
});

test('slow applied after an enemy action leaves this timeline fixed and affects the next round', () => {
  const state = normal();
  const slots = enemyTimeline(state);
  const enemyAt = slots.indexOf('warden');
  assert.equal(slots[enemyAt + 1], null);
  const action = makeAction(state, 'morrow', 'delay', 'warden', enemyAt + 1);
  const result = preview(state, [action]);
  assert(result.valid, JSON.stringify(result.invalid));
  assert.deepEqual(result.slots, slots);
  assert.equal(result.events.find((event) => event.actor === 'warden').at, enemyAt);
  assert.equal(result.final.units.warden.buffs.slow, 2);
  assert.equal(result.slows.warden, undefined);
  assert(enemyTimeline(advance(result)).indexOf('warden') > enemyAt);
});
test('front reposition occupies one AP and enemy attacks the new occupant', () => {
  const s = normal(),
    a = makeReposition(0, 1, 0),
    r = preview(s, [a]);
  assert.equal(a.ap, 1);
  assert(r.valid);
  assert.equal(r.events.find((e) => e.actor === 'hound').after.formation[0], 'lyria');
  assert.equal(
    r.events.find((e) => e.actor === 'hound').after.units.lyria.hp,
    s.units.lyria.hp - DEFINITIONS.hound.intents[0].effects[0].value,
  );
  assert.equal(r.events.find((e) => e.actor === 'hound').after.units.aegis.hp, 48);
});
test('reserve exchange costs one AP and cannot swap in a dying character', () => {
  const s = normal(),
    r = preview(s, [makeSwap('serin', 0, 0)]);
  assert(r.valid);
  assert.equal(r.final.formation[0], 'serin');
  s.units.serin.hp = 0;
  assert(!preview(s, [makeSwap('serin', 0, 0)]).valid);
});
test('action limit and mana each prevent confirmation', () => {
  const s = normal();
  assert(
    !preview(s, [
      makeAction(s, 'aegis', 'attack', 'warden', 0),
      makeAction(s, 'aegis', 'attack', 'warden', 2),
    ]).valid,
  );
  s.units.morrow.mp = 0;
  assert(!preview(s, [makeAction(s, 'morrow', 'delay', 'hound', 0)]).valid);
});
test('bleed kills immediately after action and cancels later actions without making plan illegal', () => {
  const s = normal();
  s.units.lyria.hp = 2;
  s.units.lyria.buffs.bleed = 2;
  const a = makeAction(s, 'lyria', 'attack', 'warden', 0),
    b = makeAction(s, 'lyria', 'attack', 'warden', 2),
    r = preview(s, [a, b]);
  assert(r.valid);
  assert.equal(r.deaths.find((d) => d.id === 'lyria').at, 0);
  assert(r.skipped.some((d) => d.id === b.id));
});
test('regeneration occurs before poison and dying units cannot regenerate', () => {
  const s = normal();
  s.units.serin.hp = 0;
  s.units.aegis.hp = 1;
  s.units.aegis.block = 100;
  s.units.aegis.buffs = { regen: 2, poison: 3 };
  const r = preview(s, []);
  assert.equal(r.final.units.aegis.hp, 0);
  assert.equal(r.deaths.find((d) => d.id === 'aegis').reason, '回合末中毒');
  s.units.aegis.hp = 0;
  assert.equal(preview(s, []).final.units.aegis.hp, 0);
});
test('retired ultimate skills cannot be scheduled or resolved', () => {
  const s = normal();
  assert.throws(() => makeAction(s, 'aegis', 'fortress', 'aegis', 0), /Unknown ability/);
  assert(HEROES.every((hero) => !hero.ultimate && !hero.quest));
  assert(Object.values(s.units).every((unit) => !Object.hasOwn(unit, 'awakening')));
});
test('mana does not recover between rounds; only a new expedition refills', () => {
  const s = normal(),
    r = preview(s, [makeAction(s, 'morrow', 'delay', 'hound', 0)]),
    next = advance(r);
  assert.equal(next.units.morrow.mp, 23);
  assert.equal(advance(preview(next, [])).units.morrow.mp, 23);
  assert.equal(newBattle().units.morrow.mp, 26);
});
test('winning and full party defeat end the single encounter', () => {
  const s = normal();
  for (const id of s.enemyIds) s.units[id].hp = 0;
  assert.equal(advance(preview(s, [])).phase, 'victory');
  const dead = normal();
  for (const h of HEROES) dead.units[h.id].hp = 0;
  assert.equal(advance(preview(dead, [])).phase, 'defeat');
});
test('a complete advanced encounter can be won with skills and valid queued actions', () => {
  let state = normal();
  for (let turn = 0; turn < 35 && !['victory', 'defeat'].includes(state.phase); turn++) {
    const result = preview(state, buildPlan(state));
    assert(result.valid, JSON.stringify(result.invalid));
    state = advance(result);
  }
  assert.equal(state.phase, 'victory');
});
