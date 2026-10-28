import test from 'node:test';
import assert from 'node:assert/strict';
import { HEROES, DEFINITIONS } from '../src/data.js';
import {
  newBattle,
  preview,
  advance,
  makeAction,
  makeReposition,
  makeSwap,
  newEncounter,
  campRest,
  effectiveBuff,
} from '../src/engine.js';
import {
  EMBLEMS,
  DRAGON_EMBLEM_ID,
  MASK_EMBLEM_ID,
  SUPREME_EMBLEM_ID,
  OVERLOAD_EMBLEM_ID,
  OVERLOAD_SKILL,
} from '../src/emblems.js';
import { prepareBossEmblem } from '../src/emblem-progression.js';
import { newLibrary, restoreLibrary, officialCharacter, compileRoster } from '../src/ai/library.js';
import { CHANGJING_YUEXI } from '../src/content/changjing-yuexi.js';
import { PANDORA } from '../src/content/pandora.js';
import { normalizeEquipment, equip } from '../src/equipment.js';
import { upgradeStatusEmblems } from '../src/ai/status-emblem-upgrade.js';

function battle(emblem, count = 1) {
  const heroes = Object.fromEntries(
    HEROES.map((hero) => [
      hero.id,
      {
        ...structuredClone(hero),
        hp: 100,
        mp: 100,
        attack: 10,
        limit: 3,
        buffs: {},
        skills: [],
      },
    ]),
  );
  if (emblem) heroes.aegis.emblemId = emblem;
  const enemies = Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const id = 'target-' + index;
      return [
        id,
        {
          ...structuredClone(DEFINITIONS.hound),
          id,
          hp: 1000,
          speed: 1,
          buffs: {},
          intents: [
            { name: '观察', slot: 0, effects: [{ type: 'shield', value: 0, target: 'self' }] },
          ],
        },
      ];
    }),
  );
  const state = newBattle(Object.keys(enemies), heroes, enemies);
  state.units.aegis.combined = 3;
  return state;
}
function resolve(state, plan = []) {
  const result = preview(state, plan);
  assert.equal(result.valid, true, JSON.stringify(result.invalid));
  return result;
}
function cast(state, skill, target = 'target-0') {
  return resolve(state, [makeAction(state, 'aegis', skill, target, 0)]);
}

test('statuses settle before one shared round-end decay; slow retains one and persistent powers do not decay', () => {
  const state = battle();
  const unit = state.units.aegis;
  Object.assign(unit.buffs, {
    weak: 2,
    vulnerable: 2,
    regen: 3,
    poison: 4,
    bleed: 5,
    slow: 3,
    strength: 2,
    iron: 2,
    guard: 2,
    haste: 1,
  });
  unit.hp = 50;
  assert.deepEqual(resolve(state).final.units.aegis.buffs, unit.buffs, 'Opening does not decay');
  state.phase = 'plan';
  state.round = 1;
  const result = resolve(state);
  assert.equal(result.final.units.aegis.hp, 49, '3 regen then 4 poison');
  assert.deepEqual(result.final.units.aegis.buffs, {
    weak: 1,
    vulnerable: 1,
    regen: 2,
    poison: 3,
    bleed: 4,
    slow: 2,
    strength: 2,
    iron: 2,
    guard: 2,
    haste: 1,
  });
  const after = advance(resolve(advance(result)));
  assert.equal(after.units.aegis.buffs.slow, 1);
  assert.equal(advance(resolve(after)).units.aegis.buffs.slow, 1);
  const dying = battle();
  dying.units.aegis.hp = 2;
  dying.units.aegis.buffs.bleed = 3;
  const stopped = cast(dying, 'attack');
  assert.equal(stopped.final.units.aegis.hp, 0);
  assert(!stopped.events.some((event) => event.type === 'hero'));
});

test('overload caps at one, survives rounds and combination expiry, consumes only the next ordinary skill', () => {
  const state = battle(OVERLOAD_EMBLEM_ID);
  state.heroDefinitions.aegis.skills = [
    {
      id: 'test-hit',
      name: '攻击',
      ap: 1,
      mp: 4,
      target: 'enemy',
      effects: [{ type: 'damage', value: 10 }],
    },
  ];
  state.units.aegis.combined = 1;
  let next = advance(cast(state, OVERLOAD_SKILL.id, 'aegis'));
  assert.equal(next.units.aegis.buffs.overload, 1);
  next = advance(resolve(next));
  assert.equal(next.units.aegis.combined, 0);
  assert.equal(next.units.aegis.buffs.overload, 1);
  const before = next.units.aegis.mp;
  const result = cast(next, 'test-hit');
  assert.equal(result.final.units.aegis.mp, before - 8);
  assert.equal(result.final.units.aegis.buffs.overload, undefined);
  assert.equal(result.events.find((event) => event.type === 'hero').repeatCount, 2);
});

test('legacy regeneration becomes a finite once-per-battle grant, and Pandora pays her entry damage rather than attacking', () => {
  const state = battle();
  state.heroDefinitions.aegis.skills = [
    {
      id: 'finite-regen',
      name: '再生',
      passive: true,
      location: '全战斗',
      buff: 'regen',
      value: 3,
    },
  ];
  state.units.aegis.hp = 50;
  let next = advance(resolve(state));
  assert.equal(next.units.aegis.buffs.regen, 3);
  assert.equal(next.units.aegis.hp, 50, 'Opening does not settle regeneration');
  next = advance(resolve(next));
  assert.equal(next.units.aegis.hp, 53);
  next = advance(resolve(next));
  next = advance(resolve(next));
  assert.equal(next.units.aegis.buffs.regen, undefined);
  assert.equal(advance(resolve(next)).units.aegis.hp, 56);
  const entry = battle(null, 3);
  entry.phase = 'plan';
  entry.round = 1;
  entry.heroDefinitions.serin = { ...structuredClone(PANDORA), id: 'serin' };
  entry.units.serin.entryReady = true;
  const result = resolve(entry, [makeSwap('serin', 1, 0)]);
  const event = result.events.find((item) => item.type === 'entrySkill');
  assert.equal(event.after.units.serin.hp, 95);
  assert.equal(event.after.units['target-1'].hp, entry.units['target-1'].hp);
  assert.equal(event.after.units['target-1'].buffs.bind, 1);
  assert(
    result.events.some(
      (item) => item.type === 'skip' && item.actor === 'target-1' && item.blockedBy === 'bind',
    ),
  );
  const capped = newBattle(['hound'], {
    aegis: { ...structuredClone(DEFINITIONS.aegis), buffs: { bind: 9, overload: 8 } },
  });
  assert.equal(capped.units.aegis.buffs.bind, 1);
  assert.equal(capped.units.aegis.buffs.overload, 1);
});

test('dragon curse counts actual hit enemies and dragon vein follows positions through swaps and expiry', () => {
  const state = battle(DRAGON_EMBLEM_ID, 3);
  const hit = cast(state, 'attack');
  assert.deepEqual(hit.final.units['target-0'].buffs, { weak: 1, vulnerable: 1, slow: 1 });
  state.heroDefinitions.aegis.skills = [
    {
      id: 'wide',
      name: '横扫',
      ap: 1,
      mp: 0,
      target: 'allEnemies',
      effects: [{ type: 'damage', value: 3 }],
    },
  ];
  assert.deepEqual(cast(state, 'wide').final.units['target-0'].buffs, {});
  let next = advance(cast(state, EMBLEMS[DRAGON_EMBLEM_ID].skill.id, 'aegis'));
  for (const unit of Object.values(next.units))
    if (unit.side === 'hero') {
      unit.hp = 50;
      unit.mp = 40;
    }
  const oldLeft = next.formation[0],
    newLeft = next.formation[3];
  const result = resolve(next, [makeReposition(0, 3, 0)]);
  assert.equal(result.final.units[newLeft].hp, 58);
  assert.equal(result.final.units[oldLeft].hp, 50);
  assert.equal(result.final.units[next.formation[2]].mp, 48);
  assert.equal(effectiveBuff(result.final, result.final.formation[1], 'iron'), 1);
  next = advance(result);
  next = advance(resolve(next));
  next = advance(resolve(next));
  assert(next.dragonVein, 'Dragon vein survives combination expiry');
  assert(
    !newEncounter({ enemyIds: ['hound'], hpScale: 1, map: 'ruins' }, campRest(next).state)
      .dragonVein,
  );
});

test('mask passive adds exact max-hp damage, charges only other allies, and resolves simultaneous deaths without reviving', () => {
  const state = battle(MASK_EMBLEM_ID);
  state.units.aegis.hp = 80;
  for (const unit of Object.values(state.units))
    if (unit.side === 'hero' && unit.id !== 'aegis') unit.hp = 80;
  const hit = cast(state, 'attack');
  assert.equal(hit.final.units['target-0'].hp, state.units['target-0'].hp - 30);
  assert.equal(hit.final.units.aegis.hp, 80);
  assert.equal(hit.final.units.lyria.hp, 70);
  state.units.lyria.hp = 5;
  state.units.morrow.hp = 5;
  state.units.aegis.mp = 0;
  const deaths = cast(state, 'attack');
  assert.equal(deaths.final.units.lyria.hp, 0);
  assert.equal(deaths.final.units.morrow.hp, 0);
  assert.equal(deaths.final.units.aegis.hp, 100);
  assert.equal(deaths.final.units.aegis.mp, 40);
  assert.equal(deaths.deaths.length, 2);
});

test('sacrifice fires once on an enemy death, heals surviving enemies and grants temporary stats and a deterministic skill', () => {
  const state = battle(MASK_EMBLEM_ID, 2);
  state.units['target-0'].hp = 5;
  state.units['target-1'].hp = 50;
  state.heroDefinitions.lyria.skills = [
    {
      id: 'donor',
      name: '捐赠技能',
      ap: 1,
      mp: 2,
      target: 'enemy',
      effects: [{ type: 'damage', value: 25 }],
    },
  ];
  let next = advance(cast(state, EMBLEMS[MASK_EMBLEM_ID].skill.id, 'lyria'));
  const result = cast(next, 'attack');
  assert.equal(result.final.units.lyria.hp, 0);
  assert.equal(result.final.units['target-0'].hp, 0);
  assert.equal(result.final.units['target-1'].hp, state.units['target-1'].maxHp);
  assert.equal(result.final.units.aegis.maxHp, 120);
  assert.equal(result.final.units.aegis.maxMp, 120);
  assert.equal(result.final.heroDefinitions.aegis.attack, 12);
  assert(
    result.final.heroDefinitions.aegis.skills.some((skill) => skill.id.startsWith('sacrifice-')),
  );
  assert.deepEqual(
    preview(next, [makeAction(next, 'aegis', 'attack', 'target-0', 0)]).final,
    result.final,
    'Preview is deterministic and does not mutate input',
  );
  const rested = campRest(result.final).state;
  assert.equal(rested.units.aegis.maxHp, 100);
  assert.equal(rested.heroDefinitions.aegis.attack, 10);
  assert(!rested.heroDefinitions.aegis.skills.length);
});

test('supreme reflection blocks new and existing negative effects; moon eye rejects Boss or fewer than three kinds', () => {
  const state = battle(SUPREME_EMBLEM_ID, 3);
  state.phase = 'plan';
  state.round = 1;
  state.units.aegis.hp = 60;
  state.units.aegis.buffs = { weak: 2, poison: 9, bleed: 9 };
  state.enemyDefinitions['target-0'].intents[0].effects = [
    { type: 'buff', buff: 'vulnerable', value: 2 },
    { type: 'buff', buff: 'slow', value: 2 },
  ];
  assert.equal(effectiveBuff(state, 'aegis', 'weak'), 0);
  const reflected = cast(state, 'attack');
  assert.equal(reflected.final.units.aegis.hp, 60);
  assert.equal(reflected.final.units.aegis.buffs.vulnerable, undefined);
  assert.equal(reflected.final.units['target-0'].buffs.vulnerable, 1);
  assert.equal(reflected.final.units['target-0'].buffs.slow, 1);
  const eye = battle(SUPREME_EMBLEM_ID, 3);
  eye.units['target-0'].hp = 30;
  eye.units['target-0'].buffs = { weak: 2, vulnerable: 2, slow: 1 };
  const result = cast(eye, EMBLEMS[SUPREME_EMBLEM_ID].skill.id);
  assert.equal(result.final.units['target-0'].hp, 0);
  assert.equal(result.final.units['target-1'].hp, eye.units['target-1'].hp - 30);
  eye.enemyDefinitions['target-0'].boss = true;
  assert(
    !preview(eye, [makeAction(eye, 'aegis', EMBLEMS[SUPREME_EMBLEM_ID].skill.id, 'target-0', 0)])
      .valid,
  );
  delete eye.enemyDefinitions['target-0'].boss;
  delete eye.units['target-0'].buffs.slow;
  assert(
    !preview(eye, [makeAction(eye, 'aegis', EMBLEMS[SUPREME_EMBLEM_ID].skill.id, 'target-0', 0)])
      .valid,
  );
});

test('authored skills, cap rules, all five equipped emblems and three equipment slots survive a real library restore', () => {
  assert.equal(CHANGJING_YUEXI.skills[1].mp, 7);
  assert.equal(PANDORA.entrySkill.selfDamage, 5);
  const state = battle();
  state.heroDefinitions.aegis = { ...structuredClone(CHANGJING_YUEXI), id: 'aegis', limit: 3 };
  const buffed = advance(cast(state, 'meteor-stance', 'aegis'));
  const attack = cast(buffed, 'attack');
  assert.equal(attack.events.find((event) => event.type === 'hero').repeatCount, 2);
  assert.equal(
    attack.final.units['target-0'].hp,
    buffed.units['target-0'].hp - 16,
    'Two attacks of 6 + 2 strength',
  );
  const library = newLibrary();
  library.emblems = Object.keys(EMBLEMS);
  for (const [index, id] of library.emblems.entries()) library.characters[index].emblemId = id;
  for (let slot = 0; slot < 3; slot++) {
    library.equipment.catalog.push(
      normalizeEquipment(
        { name: '测试装备' + slot, description: 'hp+1', stats: { hp: 1 }, rules: [] },
        { id: 'gear-' + slot, name: '残片', value: 10 },
      ),
    );
    library.equipment.owned.push({ id: 'owned-' + slot, templateId: 'gear-' + slot });
    equip(library, library.characters[0].id, slot, 'owned-' + slot);
  }
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.deepEqual(
    restored.characters.slice(0, 5).map((member) => member.emblemId),
    library.emblems,
  );
  assert.deepEqual(restored.characters[0].equipment, ['owned-0', 'owned-1', 'owned-2']);
  assert.equal(compileRoster(restored).aegis.level, 1);
  const pandora = officialCharacter('pandora');
  assert.equal(pandora.combat.skills[0].effects[1].value, 2);
});

test('four Boss rewards use exact authored nodes once and worldbook upgrade is idempotent', () => {
  const library = newLibrary();
  const scenarios = [
    ['ruins', 2, OVERLOAD_EMBLEM_ID],
    ['ruins', 5, DRAGON_EMBLEM_ID],
    ['forest', 1, SUPREME_EMBLEM_ID],
    ['forest', 3, MASK_EMBLEM_ID],
  ];
  for (const [map, sequence, id] of scenarios) {
    const expedition = { index: 4, exploration: { map, sequence } };
    assert(prepareBossEmblem(library, expedition));
    assert(library.emblems.includes(id));
    assert.equal(expedition.emblemArrival.id, id);
    assert(!prepareBossEmblem(library, expedition));
  }
  assert(
    !prepareBossEmblem(newLibrary(), { index: 3, exploration: { map: 'ruins', sequence: 2 } }),
  );
  const book = upgradeStatusEmblems({ entries: {} });
  assert.deepEqual(upgradeStatusEmblems(book), book);
  assert.match(Object.values(book.entries)[0].content, /正常回合末各减1层/);
});
