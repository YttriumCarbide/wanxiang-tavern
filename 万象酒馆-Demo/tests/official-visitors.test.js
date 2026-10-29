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
} from '../src/engine.js';
import { newLibrary, officialCharacter, compileRoster, restoreLibrary } from '../src/ai/library.js';
import { officialSummonPool } from '../src/summoning.js';
import { upgradeFrostWorldbook } from '../src/ai/frost-worldbook.js';
import { applyCompanionModifiers, canSoulRevive } from '../src/companion-mechanics.js';
import { applyEncounterGrowth } from '../src/growth.js';
import { abilityFor } from '../src/catalog.js';
import { statusIcons } from '../src/ui.js';
import { combatCues } from '../src/audio/cues.js';
import { playbackBeats } from '../src/playback-timing.js';
import { OFFICIAL_VISITORS } from '../src/content/official-visitors.js';
import { normalizeCharacterSetting } from '../src/ai/character-setting.js';

function party(visitor, slot = 'aegis') {
  const defs = Object.fromEntries(
    HEROES.map((hero) => [hero.id, { ...structuredClone(hero), buffs: {}, skills: [] }]),
  );
  defs[slot] = { ...officialCharacter(visitor).combat, id: slot };
  return defs;
}
function battle(defs, move = { name: '试探', slot: 0, effects: [{ type: 'damage', value: 1 }] }) {
  return newBattle(['hound'], defs, {
    hound: {
      ...structuredClone(DEFINITIONS.hound),
      hp: 1000,
      speed: 1,
      buffs: {},
      tactic: { target: 'fixed' },
      intents: [move],
    },
  });
}
function planning(state) {
  state.phase = 'plan';
  state.round = 1;
  return state;
}

test('both visitors join official summon pool, survive save restoration and compile into occupied slots', () => {
  const library = newLibrary(),
    book = upgradeFrostWorldbook({ entries: {} });
  for (const name of ['luo-gongxu', 'silica-laps']) {
    const member = officialSummonPool(library, book).find(
      (entry) => entry.id === 'official-' + name,
    );
    assert(member);
    library.characters.push(member);
  }
  library.party[0] = 'official-luo-gongxu';
  library.party[1] = 'official-silica-laps';
  const restored = restoreLibrary(library),
    roster = compileRoster(restored);
  assert.equal(roster.aegis.name, '骆公绪');
  assert.equal(roster.lyria.name, '西莉卡·梵·拉普斯');
  assert.deepEqual([roster.aegis.hp, roster.aegis.mp, roster.aegis.attack], [60, 23, 9]);
  assert.match(roster.aegis.skills[0].text, /只能指向自己/);
  assert.deepEqual(
    roster.lyria.skills.map((skill) => skill.id),
    ['soul-banquet', 'soul-revive'],
  );
  assert(
    restored.characters
      .find((member) => member.id === 'official-silica-laps')
      .setting.worldbook.includes('绝处逢生'),
  );
  assert.equal(officialSummonPool(restored, book).length, 0);
});

test('Silica restores her own two active skills and removes mistaken static Pandora skills', () => {
  const library = newLibrary();
  const silica = officialCharacter('silica-laps');
  silica.combat.skills = [{ id: 'clock-bind', name: '停驻的刻度' }];
  library.characters.push(silica);
  const restored = restoreLibrary(library).characters.find((member) => member.id === silica.id);
  assert.deepEqual(
    restored.combat.skills.map((skill) => skill.id),
    ['soul-banquet', 'soul-revive'],
  );
  assert(!restored.combat.skills.some((skill) => skill.id === 'clock-bind'));
  assert.equal(
    normalizeCharacterSetting(OFFICIAL_VISITORS['silica-laps'].setting).skills.length,
    2,
  );
});

test('Junlue forces the next attack onto Luo and copies only the next positive gain', () => {
  const state = planning(
    battle(party('luo-gongxu'), {
      name: '加势攻击',
      slot: 1,
      selfBuff: { strength: 1, iron: 1 },
      effects: [{ type: 'damage', value: 5 }],
    }),
  );
  const result = preview(state, [makeAction(state, 'aegis', 'junlue', 'hound', 0)]);
  assert(result.valid, JSON.stringify(result.invalid));
  const hit = result.events.find((event) => event.type === 'enemy');
  assert.deepEqual(hit.targets, ['aegis']);
  assert.equal(hit.after.units.aegis.buffs.strength, 1);
  assert(!hit.after.units.aegis.buffs.iron);
  assert.equal(hit.after.units.lyria.hp, state.units.lyria.hp);
  const counter = result.events.find((event) => event.type === 'counter');
  assert(counter);
  assert.equal(counter.after.units.aegis.used, 1);
  assert(combatCues(counter, hit.after).some((cue) => cue.name === 'sword'));
  assert(playbackBeats(result).some((beat) => beat.events[0]?.type === 'counter'));
  assert.equal(result.final.duels.hound.attack, false);
  assert.equal(result.final.duels.hound.gain, false);
});

test('Junlue also copies an explicitly self-targeted enemy shield before any later buff', () => {
  const state = planning(
    battle(party('luo-gongxu'), {
      name: '护甲',
      slot: 1,
      effects: [
        { type: 'shield', value: 8, target: 'self' },
        { type: 'buff', buff: 'iron', value: 1, target: 'self' },
      ],
    }),
  );
  const result = preview(state, [makeAction(state, 'aegis', 'junlue', 'hound', 0)]);
  const event = result.events.find((item) => item.type === 'enemy');
  assert.equal(event.after.units.aegis.block, 8);
  assert(!event.after.units.aegis.buffs.iron);
  assert.equal(event.after.duels.hound.gain, false);
});

test('entry shield uses current attack, double applies to a counter, actual hp damage restores sp and stops at full', () => {
  const state = planning(battle(party('luo-gongxu', 'serin')));
  state.heroDefinitions.serin.attack = 9;
  Object.assign(state.units.serin, { entryReady: true, mp: 15, hp: 20 });
  const result = preview(state, [makeReposition(0, 3, 0)]);
  assert(result.valid);
  const entry = result.events.find((event) => event.type === 'entrySkill');
  assert.equal(entry.after.units.serin.block, 9);
  assert.equal(entry.after.units.serin.nextBasicDouble, true);
  assert.match(statusIcons(entry.after, 'serin'), /下次普通攻击伤害翻倍/);
  const counter = result.events.find((event) => event.type === 'counter');
  const before = result.events[result.events.indexOf(counter) - 1].after;
  assert.equal(before.units.hound.hp - counter.after.units.hound.hp, 18);
  assert.equal(result.final.units.serin.mp, 23);
  assert.equal(result.final.units.serin.hp, 38);
  assert.equal(result.final.units.serin.counterDisabled, true);
  assert.equal(result.final.units.serin.nextBasicDouble, false);
  const next = advance(result);
  const again = preview(next, []);
  assert(!again.events.some((event) => event.type === 'counter'));
  const nextBattle = newEncounter({ enemyIds: ['hound'] }, again.final, 1);
  assert.equal(nextBattle.units.serin.counterDisabled, false);
});

test('soul loan is deterministic, exploration-only, copies one skill and persists once across battle and growth', () => {
  const library = newLibrary();
  library.characters.push(officialCharacter('silica-laps'));
  library.party[0] = 'official-silica-laps';
  const defs = compileRoster(library),
    state = planning(battle(defs)),
    before = structuredClone(state);
  assert(!preview(state, []).final.soulLoans?.aegis);
  const action = makeAction(state, 'aegis', 'soul-banquet', 'lyria', 0);
  const result = preview(state, [action]);
  assert(result.valid, JSON.stringify(result.invalid));
  assert.deepEqual(preview(state, [action]), result);
  assert.deepEqual(state, before);
  const donor = result.final.soulLoans.aegis;
  assert(donor && donor !== 'aegis');
  assert.equal(result.final.heroDefinitions[donor].hp, Math.floor(defs[donor].hp * 0.5));
  assert.equal(
    result.final.heroDefinitions.aegis.hp,
    defs.aegis.hp + Math.floor(defs[donor].hp * 0.5),
  );
  assert.equal(result.final.heroDefinitions.aegis.skills.length, 3);
  assert.equal(result.final.heroDefinitions[donor].limit, defs[donor].limit);
  const carried = advance(result),
    next = newEncounter({ enemyIds: ['hound'] }, carried, 1);
  const trip = { carried: next, heroDefinitions: defs, partyIds: library.party };
  applyEncounterGrowth(trip, library.characters);
  assert.equal(trip.carried.heroDefinitions[donor].hp, result.final.heroDefinitions[donor].hp);
  const second = preview(trip.carried, []);
  assert.equal(second.final.soulLoans.aegis, donor);
  assert.equal(second.final.heroDefinitions[donor].hp, result.final.heroDefinitions[donor].hp);
  assert.equal(second.final.heroDefinitions.aegis.skills.length, 3);
  assert.equal(library.characters[0].combat.hp, HEROES[0].hp);
  assert(!newEncounter({ enemyIds: ['hound'] }, null, 0, defs).expeditionModifiers);
});

test('soul revival rejects spent/donor targets, pays 2 AP and 12 sp and restores at reduced caps with skill loss', () => {
  const defs = party('silica-laps');
  // The retired skill remains an engine compatibility fixture, not an official character skill.
  defs.aegis.skills.push({
    id: 'soul-revive',
    name: '旧档复活',
    mechanic: 'soul-revive',
    ap: 2,
    mp: 12,
    target: 'ally',
    effects: [{ type: 'heal', value: 1 }],
  });
  defs.lyria.skills = [
    {
      id: 'one',
      name: '一式',
      ap: 1,
      mp: 1,
      target: 'enemy',
      effects: [{ type: 'damage', value: 10 }],
    },
    {
      id: 'two',
      name: '二式',
      ap: 1,
      mp: 1,
      target: 'enemy',
      effects: [{ type: 'damage', value: 8 }],
    },
  ];
  const state = planning(battle(defs));
  state.soulLoans = { aegis: 'morrow' };
  state.units.lyria.hp = 0;
  assert(canSoulRevive(state, 'lyria'));
  const action = makeAction(state, 'aegis', 'soul-revive', 'lyria', 0);
  assert.equal(action.ap, 2);
  const result = preview(state, [action]);
  assert(result.valid, JSON.stringify(result.invalid));
  const cast = result.events.find((event) => event.skill === 'soul-revive');
  assert.equal(cast.after.units.aegis.mp, state.units.aegis.mp - 12);
  assert.equal(cast.after.units.lyria.maxHp, Math.floor(defs.lyria.hp * 0.8));
  assert.equal(cast.after.units.lyria.hp, cast.after.units.lyria.maxHp);
  assert.equal(cast.after.units.lyria.mp, cast.after.units.lyria.maxMp);
  assert.equal(cast.after.heroDefinitions.lyria.skills.length, 1);
  assert.equal(
    abilityFor(cast.after, 'lyria', cast.after.heroDefinitions.lyria.skills[0].id).effects[0].value,
    [8, 6][
      defs.lyria.skills.findIndex(
        (skill) => skill.id === cast.after.heroDefinitions.lyria.skills[0].id,
      )
    ],
  );
  cast.after.units.lyria.hp = 0;
  assert(!canSoulRevive(cast.after, 'lyria'));
  state.units.morrow.hp = 0;
  assert(!canSoulRevive(state, 'morrow'));
  assert(!preview(state, [makeAction(state, 'aegis', 'soul-revive', 'morrow', 0)]).valid);
  const modifier = {
    lostSkills: ['copied'],
    extraSkills: [{ id: 'copied', name: '已失去', effects: [] }],
  };
  assert(
    !applyCompanionModifiers(defs.lyria, modifier).skills.some((skill) => skill.id === 'copied'),
  );
});

test('ordered soul modifiers keep integer rounding stable when growth rebuilds an empowered reviver', () => {
  const combat = officialCharacter('silica-laps').combat;
  const gain = { add: { hp: 15, mp: 9, attack: 3, skillDamage: 4 } };
  const loss = { scale: 0.8 };
  const actual = applyCompanionModifiers(applyCompanionModifiers(combat, gain), loss);
  const rebuilt = applyCompanionModifiers(combat, { steps: [gain, loss] });
  assert.deepEqual(rebuilt, actual);
});
