import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, DEFINITIONS } from '../src/data.js';
import {
  newBattle,
  newEncounter,
  preview,
  advance,
  makeReposition,
  campRest,
  intent,
} from '../src/engine.js';
import { newExpedition, beginEncounter } from '../src/expedition.js';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { newLibrary, compileRoster, restoreLibrary } from '../src/ai/library.js';
import { prepareBossEmblem } from '../src/emblem-progression.js';
import { OVERLOAD_EMBLEM_ID } from '../src/emblems.js';
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

test('overload reward fills its added hp/sp, stays full charge and survives repeated growth boundaries without losing or doubling bonuses', () => {
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
  assert(after.maxHp > before.maxHp && after.maxMp > before.maxMp);
  assert.equal(after.hp - before.hp, after.maxHp - before.maxHp);
  assert.equal(after.mp - before.mp, after.maxMp - before.maxMp);
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
        { name: '同名指环', description: 'hp+1', stats: { hp: 1 }, rules: [] },
        { id, name: '碎片', value: 10 },
      ),
    );
  buyEquipment(library, 'one', 'a');
  buyEquipment(library, 'two', 'b');
  buyEquipment(library, 'two', 'c');
  equip(library, library.characters[0].id, 0, 'a');
  assert.throws(() => equip(library, library.characters[0].id, 1, 'b'), /同名/);
  equip(library, library.characters[1].id, 0, 'b');
  library.characters[0].equipment[1] = 'c';
  assert.equal(equippedDefinitions(library, library.characters[0]).length, 1);
  const restored = restoreLibrary(library);
  assert.equal(restored.characters[0].equipment[1], null);
  assert.equal(restored.equipment.owned.length, 3);
});

test('lamb second turn applies position plague: 2/4 damage, swaps inherit it, empty/rear positions keep elapsed time, battle boundary clears it', () => {
  const heroes = Object.fromEntries(
    HEROES.map((hero) => [hero.id, { ...structuredClone(hero), hp: 100, buffs: {}, skills: [] }]),
  );
  const state = newBattle(['apepLamb'], heroes);
  state.phase = 'plan';
  state.round = 2;
  const rear = state.formation[3],
    front = state.formation[0];
  const before = structuredClone(state);
  const result = preview(state, [makeReposition(0, 3, 0)]);
  assert(result.valid, JSON.stringify(result.invalid));
  const hit = result.events.find((event) => event.type === 'enemy');
  assert.equal(hit.after.units[rear].hp, 85);
  assert.equal(result.final.units[rear].hp, 83);
  assert.equal(result.final.units[front].hp, 100);
  assert.deepEqual(result.final.sinkingPlague.ages, [1, 1, 1]);
  assert(statusIcons(result.final, rear).includes('data-buff="sinkingPlague"'));
  const next = advance(result);
  const swapped = preview(next, [makeReposition(0, 3, 0)]);
  const plague = swapped.events.find((event) => event.type === 'sinkingPlague');
  const preceding = swapped.events[swapped.events.indexOf(plague) - 1].after;
  assert.equal(preceding.units[front].hp - plague.after.units[front].hp, 4);
  assert.equal(preceding.units[rear].hp, plague.after.units[rear].hp);
  const empty = advance(swapped);
  empty.formation.splice(0, 3, null, null, null);
  assert.deepEqual(preview(empty, []).final.sinkingPlague.ages, [3, 3, 3]);
  assert(!campRest(result.final).state.sinkingPlague);
  assert(!newEncounter({ enemyIds: ['hound'] }, result.final).sinkingPlague);
  assert.deepEqual(state, before);
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
