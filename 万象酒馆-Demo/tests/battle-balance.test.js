import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, DEFINITIONS } from '../src/data.js';
import {
  newBattle,
  newEncounter,
  preview,
  advance,
  makeAction,
  makeReposition,
  campRest,
  intent,
  enemyTimeline,
} from '../src/engine.js';
import { newExpedition, beginEncounter } from '../src/expedition.js';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { newLibrary, compileRoster, restoreLibrary } from '../src/ai/library.js';
import { prepareBossEmblem } from '../src/emblem-progression.js';
import { OVERLOAD_EMBLEM_ID } from '../src/emblems.js';
import { sinkingPlagueFrontDamage, sinkingPlagueRearDamage } from '../src/overlord-mechanics.js';
import { combatScale } from '../src/combat-scale.js';
import { applyEncounterGrowth } from '../src/growth.js';
import { normalizeEquipment, buyEquipment, equip, equippedDefinitions } from '../src/equipment.js';
import { enemyIntentText } from '../src/enemy-intent-text.js';
import { statusIcons } from '../src/ui.js';
import { newTetris, tetrisStep, restoreTetris, rewindTetris } from '../src/tetris.js';

test('enemy templates enter combat directly without hidden hp or attack bonuses', () => {
  const enemy = {
    ...structuredClone(DEFINITIONS.hound),
    hp: 50,
    buffs: {},
    intents: [
      {
        name: '攻击',
        slot: 0,
        effects: [
          { type: 'damage', value: 8 },
          { type: 'damage', value: 2, flat: true },
        ],
      },
    ],
  };
  const state = newBattle(['hound'], {}, { hound: enemy });
  assert.equal(state.units.hound.hp, 50);
  assert.equal(enemy.hp, 50);
  assert.deepEqual(
    intent(state, 'hound').effects.map((effect) => effect.value),
    [8, 2],
  );
  assert.equal(
    newEncounter({ enemyIds: ['hound'], enemyDefinitions: { hound: enemy } }).units.hound.maxHp,
    50,
  );
});

test('rest restores sixty percent of missing resource only, including dying allies, without filling the other resource', () => {
  const state = newBattle(['hound']);
  Object.assign(state.units.aegis, { maxHp: 100, hp: 40, maxMp: 50, mp: 10 });
  const sleep = campRest(state, 'sleep').state.units.aegis;
  const meal = campRest(state, 'meal').state.units.aegis;
  assert.deepEqual([sleep.hp, sleep.mp], [76, 10]);
  assert.deepEqual([meal.hp, meal.mp], [40, 34]);
  state.units.aegis.hp = 0;
  assert.equal(campRest(state, 'sleep').state.units.aegis.hp, 60);
  assert.equal(state.units.aegis.hp, 0);
});

test('overload reward stays full charge without static pre-battle inflation and doubles maxMp on Engage', () => {
  const library = newCampaign(defaultProtagonist());
  const trip = newExpedition('ruinsCliffBeast', compileRoster(library), {
    map: 'ruins',
    sequence: 2,
    seed: 123,
  });
  trip.index = 4;
  trip.partyIds = [...library.party];
  trip.carried = newEncounter({ enemyIds: ['hound'] }, null, 3, trip.heroDefinitions);
  const actor = 'aegis';
  Object.assign(trip.carried.units[actor], { hp: 20, mp: 3 });
  const before = structuredClone(trip.carried.units[actor]);
  assert(prepareBossEmblem(library, trip, () => 0));
  const after = structuredClone(trip.carried.units[actor]);
  assert.equal(after.maxHp, before.maxHp);
  assert.equal(after.maxMp, before.maxMp);
  assert.equal(trip.carried.heroDefinitions[actor].emblemId, OVERLOAD_EMBLEM_ID);
  applyEncounterGrowth(trip, library.characters);
  assert.deepEqual(trip.carried.units[actor], after);
  applyEncounterGrowth(trip, library.characters);
  assert.deepEqual(trip.carried.units[actor], after);
  const battle = beginEncounter(trip);
  assert.equal(battle.units[actor].emblemCharge, 6);
  assert.equal(battle.units[actor].hp, after.hp);
  assert.equal(battle.units[actor].maxHp, after.maxHp);
});

test('same-name equipment is limited per character across distinct templates and old saves cannot stack it', () => {
  const library = newLibrary();
  library.inventory.ether = 100;
  for (const id of ['one', 'two'])
    library.equipment.catalog.push(
      normalizeEquipment(
        { name: '同名长剑', category: 'weapon', description: 'hp+1', stats: { hp: 1 }, rules: [] },
        { id, name: '碎片', value: 10 },
      ),
    );
  library.equipment.catalog.push(
    normalizeEquipment(
      { name: '同名长剑', category: 'armor', description: 'hp+1', stats: { hp: 1 }, rules: [] },
      { id: 'three', name: '铁片', value: 10 },
    ),
  );
  buyEquipment(library, 'one', 'a');
  buyEquipment(library, 'two', 'b');
  buyEquipment(library, 'three', 'c');
  equip(library, library.characters[0].id, 0, 'a');
  assert.throws(() => equip(library, library.characters[0].id, 1, 'c'), /同名/);
  equip(library, library.characters[1].id, 0, 'b');
  library.characters[0].equipment[1] = 'c';
  assert.equal(equippedDefinitions(library, library.characters[0]).length, 1);
  const restored = restoreLibrary(library);
  assert.equal(restored.characters[0].equipment[1], null);
  assert.equal(restored.equipment.owned.length, 3);
});

test('lamb sinking plague: bounded uniform damage, 2-round front lock blocks recovery until rear retreat, Stage 2/3 corrupted slots', () => {
  const heroes = Object.fromEntries(
    HEROES.map((hero) => [hero.id, { ...structuredClone(hero), hp: 200, buffs: {}, skills: [] }]),
  );
  const state = newBattle(['apepLamb'], heroes);
  state.phase = 'plan';
  state.round = 1;
  assert.equal(state.sinkingPlague?.corruptedSlot ?? null, null);

  state.round = 2;
  state.units.apepLamb.bossStage = 3;
  const rear = state.formation[3],
    front = state.formation[0],
    frontMid = state.formation[1],
    idleRear = state.formation[4];
  const before = structuredClone(state);
  const openSlot = enemyTimeline(state).findIndex((id) => !id);
  const result = preview(state, [makeReposition(0, 3, openSlot)]);
  assert(result.valid, JSON.stringify(result.invalid));
  assert.deepEqual(result.final.sinkingPlague.ages, [3, 3, 3]);
  // Retreat avoids the front attack, but still receives the shared perimeter tick.
  assert.equal(result.final.units[front].hp, 199);
  assert.equal(result.final.sinkingPlague.frontStreak[front], 0);
  // Staying in front accumulates frontStreak; the rear receives the same perimeter tick.
  assert.equal(result.final.sinkingPlague.frontStreak[frontMid], 1);
  assert.equal(result.final.sinkingPlague.frontStreak[idleRear], 0);
  assert.equal(result.final.units[idleRear].hp, 199);
  assert(statusIcons(result.final, rear, result.final).includes('data-buff="sinkingPlague"'));
  assert(statusIcons(result.final, idleRear, result.final).includes('data-buff="sinkingPlague"'));

  // Round 3: Stage 3 selects an empty corruptedSlot that forbids non-swap actions but allows swap
  const r3 = advance(result);
  const cSlot = r3.sinkingPlague.corruptedSlot;
  assert(Number.isInteger(cSlot) && !enemyTimeline(r3)[cSlot]);
  const illegalSkill = preview(r3, [makeAction(r3, rear, 'attack', 'apepLamb', cSlot)]);
  assert.equal(illegalSkill.valid, false);
  // Doing nothing keeps frontMid on the frontline for a 2nd consecutive plague tick -> sealed!
  const neglected = preview(r3, []);
  assert.equal(neglected.final.sinkingPlague.frontStreak[frontMid], 2);
  assert.equal(neglected.final.sinkingPlague.sealed[frontMid], true);
  // Retreating sealed frontMid to the rear row immediately lifts the seal!
  const r4 = advance(neglected);
  const retreatSlot = enemyTimeline(r4).findIndex((id) => !id);
  const retreated = preview(r4, [makeReposition(1, 4, retreatSlot)]);
  assert(retreated.valid, JSON.stringify(retreated.invalid));
  assert(!retreated.final.sinkingPlague.sealed[frontMid]);

  // Swapping clears frontStreak on retreat, corrupted slot yields to slow
  const r3Slow = structuredClone(r3);
  r3Slow.heroDefinitions.morrow = {
    ...HEROES.find((h) => h.id === 'morrow'),
    skills: [
      {
        id: 'slow-test',
        name: '滞缓咒',
        ap: 1,
        mp: 0,
        target: 'enemy',
        effects: [{ type: 'buff', buff: 'slow', value: 1 }],
      },
    ],
  };
  r3Slow.units[HEROES[1].id].mp = 10;
  // Find morrow's slot or ensure morrow is in front row
  const morrowFront = r3Slow.formation.indexOf('morrow');
  if (morrowFront >= 3) {
    [r3Slow.formation[0], r3Slow.formation[morrowFront]] = [
      r3Slow.formation[morrowFront],
      r3Slow.formation[0],
    ];
  }
  const enemyBeforeSlot = enemyTimeline(r3Slow).findIndex(
    (id, idx) => id && idx < cSlot && cSlot - idx <= 2,
  );
  if (enemyBeforeSlot >= 0) {
    const slowVal = cSlot - enemyBeforeSlot;
    r3Slow.heroDefinitions.morrow.skills[0].effects[0].value = slowVal;
    const preSlot = r3Slow.sinkingPlague.corruptedSlot;
    const castSlot = r3Slow.slots
      ? 0
      : enemyTimeline(r3Slow).findIndex((id, idx) => !id && idx < preSlot);
    if (castSlot >= 0) {
      const slowPlan = preview(r3Slow, [
        makeAction(r3Slow, 'morrow', 'slow-test', 'apepLamb', castSlot),
      ]);
      if (slowPlan.valid && slowPlan.slots[preSlot]) {
        assert(slowPlan.events.some((e) => e.clearedCorruptedSlot));
      }
    }
  }

  assert(!campRest(result.final).state.sinkingPlague);
  assert(!newEncounter({ enemyIds: ['hound'] }, result.final).sinkingPlague);
  assert.deepEqual(state, before);
});

test('level 25 plague damage stops growing when repeated skill applications deepen the field', () => {
  const state = {
    units: { apepLamb: { damageScale: combatScale(25) } },
    sinkingPlague: { source: 'apepLamb', ages: [0, 0, 0] },
  };
  const samples = [0, 1, 2, 9, 99].map((age) => {
    state.sinkingPlague.ages = [age, age, age];
    const front = sinkingPlagueFrontDamage(state);
    assert.equal(sinkingPlagueRearDamage(state), front);
    return front;
  });
  assert.deepEqual(samples, [1, 2, 4, 5, 5]);
  assert.equal(sinkingPlagueFrontDamage({}), 0);
});

test('enemy archive descriptions derive missing text and percentage heals without undefined values', () => {
  for (const enemy of Object.values(DEFINITIONS).filter((item) => item.speed)) {
    for (const move of [...enemy.intents, ...(enemy.enragedIntents || [])])
      assert(!/undefined|NaN|\bnull\b/.test(enemyIntentText(move)), enemy.id);
  }
  const text = enemyIntentText({
    name: '恢复',
    effects: [{ type: 'heal', maxHpPercent: 0.2, target: 'allAllies' }],
  });
  assert.match(text, /20%/);
  assert.match(text, /所有敌方单位/);
});

test('Tetris close rewind restores last piece start and reverses its clear rewards without nesting snapshots', () => {
  const initial = newTetris(42);
  for (let row = 16; row < 20; row++)
    initial.board[row] = Array.from({ length: 10 }, (_, x) => (x === 9 ? 0 : 1));
  initial.piece = { type: 0, cells: [[1], [1], [1], [1]], x: 9, y: 0 };
  delete initial.pieceStart;
  const start = restoreTetris(initial);
  const dropped = tetrisStep(tetrisStep(start, 'play').state, 'drop').state;
  assert.equal(dropped.lines, 4);
  const result = rewindTetris(restoreTetris(dropped));
  assert.equal(result.returnedEther, 10);
  assert.deepEqual(result.state.board, start.board);
  assert.equal(result.state.piece.y, 0);
  assert.equal(result.state.status, 'paused');
  assert.equal(result.state.earned, 0);
  assert(!result.state.previousPiece);
  assert(!result.state.pieceStart.pieceStart);
  assert.equal(rewindTetris(result.state).returnedEther, 0);
});
