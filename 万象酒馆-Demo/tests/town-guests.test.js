import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, DEFINITIONS, ability } from '../src/data.js';
import {
  newBattle,
  preview,
  advance,
  makeAction,
  makeSwap,
  makeReposition,
} from '../src/engine.js';
import { officialCharacter, newLibrary, compileRoster, restoreLibrary } from '../src/ai/library.js';
import { TOWN_GUESTS } from '../src/content/town-guests.js';
import { adjacentAllies } from '../src/town-guest-mechanics.js';
import { upgradeTownGuests } from '../src/ai/town-guests-upgrade.js';
import { officialSummonPool } from '../src/summoning.js';
import { townResidents } from '../src/town-residents.js';
import { statusIcons, icon } from '../src/ui.js';
import { normalizeEnemy } from '../src/worlds.js';
import { characterSheet } from '../src/app/character-sheet.js';
import { characterPresentation } from '../src/ai/character-presentation.js';

function battle(guests = {}, count = 1, move = null, speed = 1) {
  const heroes = Object.fromEntries(
    HEROES.map((hero) => [
      hero.id,
      {
        ...structuredClone(hero),
        hp: 100,
        mp: 100,
        buffs: {},
        skills: [],
      },
    ]),
  );
  for (const [slot, id] of Object.entries(guests))
    heroes[slot] = { ...officialCharacter(id).combat, id: slot };
  const enemies = Object.fromEntries(
    ['mossSlime', 'pebble', 'sprout'].slice(0, count).map((id) => [
      id,
      {
        ...structuredClone(DEFINITIONS[id]),
        hp: 100,
        speed,
        buffs: {},
        tactic: undefined,
        intents: [
          move || {
            name: '等待',
            slot: 0,
            effects: [{ type: 'shield', value: 0, target: 'self' }],
          },
        ],
      },
    ]),
  );
  const state = newBattle(Object.keys(enemies), heroes, enemies);
  state.phase = 'plan';
  state.round = 1;
  return state;
}
function resolve(state, actions = []) {
  const result = preview(state, actions);
  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  return result;
}
function cast(state, actor, skill, target = actor) {
  const result = resolve(state, [makeAction(state, actor, skill, target, 0)]);
  return {
    result,
    event: result.events.find((event) => event.type === 'hero' && event.actor === actor),
  };
}

test('three authored guests are excluded from summons, keep exact prose and restore when recruited', () => {
  const source = { entries: { 0: { uid: 0, content: '玩家自写条目', extensions: {} } } };
  const book = upgradeTownGuests(source);
  assert.deepEqual(upgradeTownGuests(book), book);
  assert.equal(source.entries[0].content, '玩家自写条目');
  const library = newLibrary();
  const pool = officialSummonPool(library, book);
  for (const key of Object.keys(TOWN_GUESTS)) {
    const entry = officialCharacter(key);
    assert(!pool.some((member) => member.id === entry.id), key);
    assert(entry.setting.worldbook.includes(TOWN_GUESTS[key].setting.history));
    assert(entry.setting.worldbook.includes(TOWN_GUESTS[key].setting.personality));
    library.characters.push(entry);
  }
  library.party.splice(0, 3, 'official-libet', 'official-lumi', 'official-yuto-nakashi');
  const roster = compileRoster(restoreLibrary(library));
  assert.deepEqual([roster.aegis.hp, roster.aegis.mp], [32, 34]);
  assert.deepEqual([roster.lyria.hp, roster.lyria.mp], [44, 24]);
  assert.deepEqual([roster.morrow.hp, roster.morrow.mp], [39, 34]);
  assert.equal(ability('morrow', 'attack', roster).target, 'allEnemies');
  const custom = structuredClone(book);
  delete custom.extensions.wanxiang.townGuestsRevision;
  const edited = Object.values(custom.entries).find(
    (entry) => entry.extensions?.wanxiang?.characterId === 'official-lumi',
  );
  edited.content = '保留玩家编辑的露弥';
  assert.equal(
    Object.values(upgradeTownGuests(custom).entries).find((entry) => entry.uid === edited.uid)
      .content,
    edited.content,
  );
});

test('Libet heals both immediate neighbors from the center, not herself, empty slots or rear row', () => {
  const state = battle({ lyria: 'libet' });
  for (const unit of Object.values(state.units)) if (unit.side === 'hero') unit.hp -= 15;
  const { event } = cast(state, 'lyria', 'angel-song');
  assert.deepEqual(event.targets, ['aegis', 'morrow']);
  assert.equal(event.after.units.aegis.hp, state.units.aegis.hp + 9);
  assert.equal(event.after.units.morrow.hp, state.units.morrow.hp + 9);
  assert.equal(event.after.units.lyria.hp, state.units.lyria.hp);
  assert.equal(event.after.units.serin.hp, state.units.serin.hp);
  assert.equal(event.after.units.lyria.mp, 28);
  state.formation[0] = null;
  assert.deepEqual(adjacentAllies(state, 'lyria'), ['morrow']);
  [state.formation[0], state.formation[1]] = [state.formation[1], state.formation[0]];
  assert.deepEqual(adjacentAllies(state, 'lyria'), []);
});

test('guardian wings shield and cleanse only self and adjacent same-row allies', () => {
  const state = battle({ lyria: 'libet' });
  for (const id of state.formation) state.units[id].buffs = { poison: 4, blind: 2, strength: 2 };
  const { event } = cast(state, 'lyria', 'guardian-wings');
  for (const id of ['aegis', 'lyria', 'morrow']) {
    assert.equal(event.after.units[id].block, 9);
    assert.deepEqual(event.after.units[id].buffs, { strength: 2 });
  }
  assert.equal(event.after.units.serin.block, 0);
  assert.equal(event.after.units.serin.buffs.poison, 4);
});

test('Libet entry heals the actual outgoing ally for both swap and cross-row reposition', () => {
  for (const mode of ['swap', 'reposition']) {
    const state = battle({ serin: 'libet' });
    state.units.serin.entryReady = true;
    state.units.lyria.hp = 20;
    const action = mode === 'swap' ? makeSwap('serin', 1, 0) : makeReposition(1, 3, 0);
    const event = resolve(state, [action]).events.find((event) => event.type === 'entrySkill');
    assert.equal(event.after.units.lyria.hp, 29);
    for (const id of state.formation) assert.equal(event.after.units[id].block, 5);
    assert.equal(event.after.units.serin.entryReady, false);
  }
});

test('flying halves attacks before shield and iron, halves dots, and decays once at round end', () => {
  const state = battle({}, 1, { name: '攻击', slot: 0, effects: [{ type: 'damage', value: 15 }] });
  state.units.aegis.buffs = { flying: 2, iron: 1, poison: 5, bleed: 5 };
  state.units.aegis.block = 4;
  const result = resolve(state);
  const enemy = result.events.find((event) => event.type === 'enemy');
  assert.equal(enemy.after.units.aegis.hp, 98);
  assert.equal(enemy.after.units.aegis.block, 0);
  assert.equal(result.final.units.aegis.hp, 96);
  assert.equal(result.final.units.aegis.buffs.flying, 1);
  assert.equal(state.units.aegis.hp, 100, 'preview never changes input');
});

test('Lumi wind strikes all enemies and grants flying only to herself', () => {
  const state = battle({ aegis: 'lumi' }, 3);
  const { event } = cast(state, 'aegis', 'wind-assault');
  for (const id of state.enemyIds) {
    assert.equal(event.after.units[id].hp, 91);
    assert.equal(event.after.units[id].buffs.flying, undefined);
  }
  assert.equal(event.after.units.aegis.buffs.flying, 1);
  assert.equal(event.after.units.aegis.mp, 14);
});

test('keen sight triggers before enemies at either timeline boundary, never in the middle or opening', () => {
  for (const [speed, expected] of [
    [1, 5],
    [2, 0],
    [4, 5],
  ]) {
    const state = battle({ aegis: 'lumi' }, 1, null, speed);
    const result = resolve(state);
    assert.equal(
      result.events.find((event) => event.type === 'enemy').after.units.aegis.block,
      expected,
    );
  }
  const opening = battle({ aegis: 'lumi' });
  opening.phase = 'opening';
  assert.equal(resolve(opening).final.units.aegis.block, 0);
});

test('blind locks one multi-target miss in preview; repeats and committed snapshots match', () => {
  const state = battle({}, 1, {
    name: '三连扫',
    slots: [0, 1, 2],
    effects: [{ type: 'damage', value: 9 }],
  });
  state.units.mossSlime.buffs.blind = 2;
  const result = resolve(state);
  assert.deepEqual(resolve(state), result);
  const event = result.events.find((event) => event.type === 'enemy');
  assert(event.blindTarget);
  const lost = state.formation
    .slice(0, 3)
    .map((id) => state.units[id].hp - event.after.units[id].hp);
  assert.deepEqual(
    [...lost].sort((a, b) => a - b),
    [0, 9, 9],
  );
  assert.equal(event.after.units[event.blindTarget].hp, state.units[event.blindTarget].hp);
  assert.equal(result.final.units.mossSlime.buffs.blind, 1);
  const committed = advance(result);
  assert.equal(committed.units[event.blindTarget].hp, result.final.units[event.blindTarget].hp);
  const single = battle({}, 1, { name: '单体', slot: 0, effects: [{ type: 'damage', value: 9 }] });
  single.units.mossSlime.buffs.blind = 1;
  const singleEvent = resolve(single).events.find((event) => event.type === 'enemy');
  assert.equal(singleEvent.blindTarget, null);
  assert.equal(singleEvent.after.units.aegis.hp, 91);
});

test('Lumi entry blinds exactly the opposite living enemy, with no fallback when the slot is empty', () => {
  for (const [count, slot, expected] of [
    [1, 1, 'mossSlime'],
    [1, 0, null],
    [3, 2, 'sprout'],
  ]) {
    const state = battle({ serin: 'lumi' }, count);
    state.units.serin.entryReady = true;
    const event = resolve(state, [makeSwap('serin', slot, 0)]).events.find(
      (event) => event.type === 'entrySkill',
    );
    assert.deepEqual(event.targets, expected ? [expected] : []);
    if (expected) assert.equal(event.after.units[expected].buffs.blind, 1);
  }
});

test('Yuto basic attack is AOE and counts only actual injured enemies, including a killing hit', () => {
  const state = battle({ aegis: 'yuto-nakashi' }, 3);
  state.units.mossSlime.block = 4;
  state.units.pebble.buffs.iron = 2;
  state.units.sprout.hp = 1;
  const { event } = cast(state, 'aegis', 'attack', 'sprout');
  assert.deepEqual(event.targets, state.enemyIds);
  assert.equal(event.after.units.aegis.mark, 1);
  assert.equal(event.after.units.mossSlime.hp, 100);
  assert.equal(event.after.units.pebble.hp, 100);
  assert.equal(event.after.units.sprout.hp, 0);
});

test('Yuto variation consumes one own mark, and amber song heals by pre-cast marks without consuming', () => {
  const state = battle({ aegis: 'yuto-nakashi' });
  state.units.aegis.mark = 7;
  const variation = cast(state, 'aegis', 'star-trace-variation', 'mossSlime').event.after;
  assert.equal(variation.units.aegis.mark, 6);
  assert.equal(variation.units.mossSlime.hp, 90);
  assert.equal(variation.units.mossSlime.buffs.weak, 3);
  assert.equal(variation.units.mossSlime.buffs.vulnerable, 1);
  for (const id of state.formation) state.units[id].hp -= 12;
  const song = cast(state, 'aegis', 'amber-song').event.after;
  for (const id of state.formation) {
    assert.equal(song.units[id].hp, state.units[id].hp + 7);
    assert.equal(song.units[id].buffs.strength, 2);
  }
  assert.equal(song.units.aegis.mark, 7);
});

test('Yuto entry counts surviving allies, shields front only and supports more than three marks', () => {
  const state = battle({ serin: 'yuto-nakashi' });
  state.units.serin.entryReady = true;
  state.units.rook.hp = 0;
  const entry = resolve(state, [makeSwap('serin', 1, 0)]).events.find(
    (event) => event.type === 'entrySkill',
  ).after;
  assert.equal(entry.units.serin.mark, 5);
  for (const id of entry.formation.slice(0, 3)) assert.equal(entry.units[id].block, 5);
  assert.equal(entry.units.lyria.block, 0);
  assert.match(statusIcons(entry, 'serin'), /悠扬 5层/);
});

test('new statuses and melody have distinct artwork; enemy creation rejects blind', () => {
  const art = ['flying', 'blind', 'melody'].map(icon);
  assert.equal(new Set(art).size, 3);
  for (const svg of art) assert.match(svg, /<path/);
  const enemy = {
    ...structuredClone(DEFINITIONS.mossSlime),
    id: 'enemy-blind-test',
    intents: [
      {
        name: '致盲',
        text: '施加致盲',
        slots: [0],
        effects: [{ type: 'buff', buff: 'blind', value: 1 }],
      },
    ],
  };
  assert.throws(() => normalizeEnemy(enemy), /不能施加致盲/);
});

test('town residents appear without recruitment, and details separate all skill motion including entry', () => {
  const library = newLibrary();
  const residents = townResidents(library, 'city-center');
  assert.equal(residents.length, 3);
  assert.equal(
    library.characters.some((member) => member.id === 'official-lumi'),
    false,
  );
  assert.equal(townResidents(library, 'tavern').length, 0);
  library.characters.push(officialCharacter('lumi'));
  assert.equal(townResidents(library, 'market').length, 2);
  for (const key of Object.keys(TOWN_GUESTS)) {
    const entry = officialCharacter(key);
    const model = characterPresentation(entry);
    assert.equal(model.entrySkill.name, TOWN_GUESTS[key].setting.entrySkill.name);
    assert(!model.skills[1].description.includes('入场技动作描写'));
    const sheet = characterSheet(entry);
    assert(sheet.includes('换入前场时自动触发'));
    assert(!sheet.includes('undefined AP'));
    if (key === 'yuto-nakashi') assert(sheet.includes('所有敌人'));
  }
});
