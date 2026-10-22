import { readGenerationResult } from '../src/ai/pipeline/generation-result.js';
import { archiveMilestone, relevantArchives } from '../src/archives.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { worldFixture } from './fixtures/multiverse.js';
import {
  normalizeWorld,
  restoreWorlds,
  validateEncounters,
  worldReference,
} from '../src/worlds.js';
import {
  addWorldRoute,
  newExploration,
  completeExploration,
  explorationPreview,
  explorationSpec,
  restoreExploration,
} from '../src/exploration.js';
import {
  newBattle,
  newEncounter,
  preview,
  advance,
  makeAction,
  makeEngage,
  makeSwap,
} from '../src/engine.js';
import { HEROES, DEFINITIONS } from '../src/data.js';
import { EMBLEM_ID, OVERLOAD_EMBLEM_ID, OVERLOAD_SKILL, COMBINE_SKILL } from '../src/emblems.js';
import { newLibrary, restoreLibrary, compileRoster } from '../src/ai/library.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { mergeFutureScript } from '../src/chat.js';
import { mapInput, mapResponse } from '../src/ai/pipeline/map-request.js';
import { combatCues } from '../src/audio/cues.js';
import { triggeredStatusVisuals } from '../src/status-effects.js';

const world = () => normalizeWorld(worldFixture());
function battle() {
  const w = world();
  return newBattle(
    w.enemyIds,
    { aegis: { ...structuredClone(DEFINITIONS.aegis), emblemId: EMBLEM_ID } },
    w.enemyDefinitions,
  );
}
test('world construction validates mechanics, excludes teammate appearances and only appends expansions', () => {
  const original = world();
  assert.equal(worldReference().styles.length, 13);
  assert(
    !worldReference().appearances.some((entry) => entry.portrait === DEFINITIONS.aegis.portrait),
  );
  const expansion = {
    ...worldFixture(),
    background: '后来，新的航路通往旧城的地下引水渠。'.repeat(10),
    enemies: [],
    enemyIds: [],
  };
  const extended = normalizeWorld(expansion, original);
  assert(extended.background.startsWith(original.background));
  assert.deepEqual(extended.enemyDefinitions, original.enemyDefinitions);
  assert.equal(extended.landmarks.length, 6);
  assert.throws(() => normalizeWorld({ ...worldFixture(), enemies: [] }), /Boss/);
  const bad = worldFixture();
  bad.enemies[0].portrait = 'https://bad.example/evil.svg';
  assert.throws(() => normalizeWorld(bad), /外貌/);
  assert.throws(() => normalizeWorld(worldFixture(), original), /重复/);
  assert.deepEqual(restoreWorlds([original]), [original]);
  const other = worldFixture();
  other.id = 'world-second';
  other.enemies = [{ ...other.enemies[2], id: 'enemy-second-boss' }];
  other.enemyIds = [original.enemyIds[0]];
  const reused = normalizeWorld(other, null, { knownEnemies: original.enemyDefinitions });
  assert.deepEqual(
    reused.enemyDefinitions[original.enemyIds[0]],
    original.enemyDefinitions[original.enemyIds[0]],
  );
  assert(!reused.enemyDefinitions[original.enemyIds[1]]);
  assert(mapInput({ brief: '夜航世界' }).reference.appearances.length > 0);
  assert.deepEqual(mapResponse(JSON.stringify(worldFixture()), {}), original);
});
test('custom worlds carry five narrative enemy selections into real battles and restore without changing progress', () => {
  const w = world();
  const routes = newExploration(1);
  addWorldRoute(routes, w, 1);
  const entry = routes[w.id].frontier[0];
  entry.encounters = validateEncounters(
    [0, 1, 0, 1, 2].map((index) => ({ enemyIds: [w.enemyIds[index]] })),
    entry,
  );
  for (let index = 0; index < 5; index++) {
    const spec = explorationSpec(entry, index);
    const state = newEncounter(spec);
    assert.deepEqual(state.enemyIds, entry.encounters[index].enemyIds);
    assert.equal(state.units[state.enemyIds[0]].maxHp, w.enemyDefinitions[state.enemyIds[0]].hp);
    assert(preview(state, []).valid);
    assert.deepEqual(spec.environment, {});
  }
  assert.throws(
    () => validateEncounters(Array(5).fill({ enemyIds: ['bossGate'] }), entry),
    /敌人池/,
  );
  assert.throws(
    () => validateEncounters(Array(5).fill({ enemyIds: [w.enemyIds[0]] }), entry),
    /Boss/,
  );
  delete entry.encounters;
  completeExploration(routes, entry);
  assert.equal(routes[w.id].frontier[0].sequence, 1);
  assert.deepEqual(restoreExploration(routes, 1, [w]), routes);
});
test('six completed authored sites migrate to a seventh frontier and no map bonus is applied', () => {
  const routes = newExploration(1);
  for (let i = 0; i < 6; i++) completeExploration(routes, routes.ruins.frontier[0]);
  assert.equal(routes.ruins.frontier[0].sequence, 6);
  routes.ruins.frontier = [];
  assert.equal(restoreExploration(routes).ruins.frontier[0].sequence, 6);
  const state = newEncounter({
    ...explorationSpec(routes.forest.frontier[0]),
    environment: { shield: 5, strength: 3, bonusMp: 4 },
  });
  assert.equal(state.units.aegis.block, 0);
  assert(!state.units.aegis.buffs.strength);
});
test('emblem charges once per active attack and two per normal rear round, never in opening', () => {
  const state = battle();
  const action = makeAction(state, 'aegis', 'attack', state.enemyIds[0], 0);
  const result = preview(state, [action]);
  assert(result.valid);
  assert.equal(result.final.units.aegis.emblemCharge, 1);
  const rear = battle();
  [rear.formation[0], rear.formation[3]] = [rear.formation[3], rear.formation[0]];
  assert.equal(preview(rear, []).final.units.aegis.emblemCharge, undefined);
  rear.phase = 'plan';
  rear.round = 1;
  assert.equal(preview(rear, []).final.units.aegis.emblemCharge, 2);
});
test('combining binds a marker with optional same-character action, echoes damage only to enemies, cancellation is pure', () => {
  const state = battle();
  state.units.aegis.emblemCharge = 6;
  const marker = makeEngage('aegis', 0);
  marker.followUp = { skill: 'attack', target: state.enemyIds[0] };
  const before = structuredClone(state);
  const result = preview(state, [marker]);
  assert(result.valid);
  assert(result.events.some((event) => event.type === 'engage'));
  const damages = state.enemyIds.map((id) => state.units[id].hp - result.final.units[id].hp);
  assert(damages.every((damage) => damage === damages[0] && damage > 0));
  for (const id of state.formation) assert.equal(result.final.units[id].hp, state.units[id].hp);
  assert.equal(result.final.units.aegis.combined, 3);
  assert.equal(result.final.units.aegis.emblemCharge, 0);
  assert.deepEqual(state, before);
  const defeated = battle();
  defeated.units[defeated.enemyIds[0]].hp = 0;
  assert(
    !preview(defeated, [makeAction(defeated, 'aegis', 'attack', defeated.enemyIds[0], 0)]).final
      .units.aegis.emblemCharge,
  );
  assert.equal(preview(state, []).final.units.aegis.combined, undefined);
  state.units.aegis.emblemCharge = 5;
  assert(!preview(state, [marker]).valid);
});
test('combined single target effects do not copy buffs and combine skill is once per three-round duration', () => {
  const state = battle();
  const target = state.enemyIds[0];
  state.heroDefinitions.aegis.skills[0] = {
    id: 'test',
    name: '星痕',
    ap: 1,
    mp: 0,
    target: 'enemy',
    effects: [
      { type: 'damage', value: 4 },
      { type: 'buff', buff: 'weak', value: 1 },
    ],
  };
  state.units.aegis.combined = 3;
  const result = preview(state, [makeAction(state, 'aegis', 'test', target, 0)]);
  assert(result.valid);
  assert.equal(result.final.units[target].buffs.weak, 1);
  assert(!result.final.units[state.enemyIds[1]].buffs.weak);
  const skill = makeAction(state, 'aegis', COMBINE_SKILL.id, target, 0);
  const applied = preview(state, [skill]);
  assert(applied.valid);
  assert(applied.final.units[target].buffs.balance);
  const next = advance(applied);
  assert(!preview(next, [makeAction(next, 'aegis', COMBINE_SKILL.id, target, 0)]).valid);
  next.units.aegis.combined = 1;
  const expired = advance(preview(next, []));
  assert.equal(expired.units.aegis.combined, 0);
  const encounter = newEncounter(
    explorationSpec(newExploration().ruins.frontier[0]),
    applied.final,
  );
  assert.equal(encounter.units.aegis.combined, 0);
});
test('balance sums multi-position damage, shares among three positions and keeps original debuff targets', () => {
  const state = battle();
  state.phase = 'plan';
  state.round = 1;
  for (const id of state.formation)
    state.heroDefinitions[id] = { ...structuredClone(DEFINITIONS[id]), skills: [] };
  const id = state.enemyIds[0];
  state.enemyIds = [id];
  state.enemyDefinitions[id].intents = [
    {
      name: '双击',
      slots: [0, 1],
      effects: [
        { type: 'damage', value: 9 },
        { type: 'buff', buff: 'weak', value: 1 },
      ],
    },
  ];
  state.units[id].buffs.balance = 1;
  const result = preview(state, []);
  assert(result.valid);
  for (const target of state.formation.slice(0, 3))
    assert.equal(state.units[target].hp - result.final.units[target].hp, 6);
  assert.equal(result.final.units[state.formation[0]].buffs.weak, 1);
  assert.equal(result.final.units[state.formation[1]].buffs.weak, 1);
  assert(!result.final.units[state.formation[2]].buffs.weak);
  state.formation[1] = null;
  const empty = preview(state, []);
  assert.equal(state.units[state.formation[0]].hp - empty.final.units[state.formation[0]].hp, 6);
});
test('owned emblem and dynamic world survive saves; future script rewrite locks encountered enemy plans', () => {
  const library = newLibrary();
  library.worlds = [world()];
  library.emblems = [EMBLEM_ID];
  library.characters[0].emblemId = EMBLEM_ID;
  addWorldRoute(library.exploration, library.worlds[0]);
  const saved = restoreLibrary(library);
  assert.equal(saved.characters[0].emblemId, EMBLEM_ID);
  assert.equal(compileRoster(saved).aegis.emblemId, EMBLEM_ID);
  assert.equal(saved.worlds.length, 1);
  const current = {
    schemaVersion: 4,
    story: Array(5).fill('旧'),
    npcs: [],
    items: [],
    encounters: Array(5).fill({ enemyIds: ['old'] }),
    nextHook: { setting: '' },
  };
  const replacement = {
    ...current,
    story: Array(5).fill('新'),
    encounters: Array(5).fill({ enemyIds: ['new'] }),
  };
  const merged = mergeFutureScript(current, replacement, 1);
  assert.equal(merged.encounters[1].enemyIds[0], 'old');
  assert.equal(merged.encounters[2].enemyIds[0], 'new');
});

test('narrative parser requires a valid dynamic enemy plan and archives keep worlds with shared art separate', () => {
  const w = world();
  const routes = newExploration();
  addWorldRoute(routes, w);
  const entry = routes[w.id].frontier[0];
  const document = {
    schemaVersion: 4,
    story: Array(5).fill('队伍在潮灯港找到新的航路。'),
    data: {
      title: '夜航',
      tags: [],
      npcs: [],
      items: [],
      nextHook: { setting: '' },
      encounters: [0, 1, 0, 1, 2].map((index) => ({ enemyIds: [w.enemyIds[index]] })),
    },
  };
  const input = { exploration: entry, party: [] };
  const parsed = readGenerationResult('script', JSON.stringify(document), input).entry;
  assert.equal(parsed.encounters[4].enemyIds[0], w.enemyIds[2]);
  delete document.data.encounters;
  assert.throws(() => readGenerationResult('script', JSON.stringify(document), input), /五场敌人/);
  const library = newLibrary();
  const record = { runId: 'test', map: 'metropolis' };
  const book = {
    ...parsed,
    party: [],
    exploration: entry,
    items: [{ name: '潮灯', description: '引路的小灯', value: 3, encounter: 0 }],
  };
  archiveMilestone(library, book, record, 0);
  assert.equal(relevantArchives(library, '', w.id).items.length, 1);
  assert.equal(relevantArchives(library, '', 'metropolis').items.length, 0);
});

test('repeated world expansion restores more than thirty enemies and long lore, and endless traces stay cleared', () => {
  let saved = world();
  for (let batch = 0; batch < 4; batch++) {
    const addition = worldFixture();
    addition.enemies = Array.from({ length: 12 }, (_, index) => ({
      ...addition.enemies[0],
      id: `enemy-added-${batch}-${index}`,
    }));
    addition.enemyIds = [];
    addition.background = '新的港口有新的航道与守卫。'.repeat(500);
    saved = normalizeWorld(addition, saved);
  }
  const restored = restoreWorlds([saved]);
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0], saved);
  const routes = newExploration();
  for (let index = 0; index < 11; index++) completeExploration(routes, routes.ruins.frontier[0]);
  const seen = explorationPreview(routes.ruins, 'ruins');
  assert(seen.some((entry) => entry.sequence === 10 && !entry.locked));
  assert.equal(seen.at(-1).sequence, 11);
  assert(seen.length <= 12);
});

test('Overload emblem Mizunatsuki Ran scales stats, doubles next skill cost and casts it twice with MP cost bonus', () => {
  const w = world();
  const heroDefs = {
    aegis: { ...structuredClone(DEFINITIONS.aegis), emblemId: OVERLOAD_EMBLEM_ID },
  };
  const b = newBattle(w.enemyIds, heroDefs, w.enemyDefinitions);
  const baseMp = DEFINITIONS.aegis.mp;
  const baseHp = DEFINITIONS.aegis.hp;
  const expectedMp = Math.round(baseMp * 1.5);
  const expectedHp = Math.round(baseHp + expectedMp * 0.25);
  assert.equal(b.units.aegis.maxMp, expectedMp);
  assert.equal(b.units.aegis.maxHp, expectedHp);
  assert.equal(OVERLOAD_SKILL.id, 'emblem-overload');
  b.units.aegis.combined = 3;
  const castOverload = makeAction(b, 'aegis', OVERLOAD_SKILL.id, 'aegis', 0);
  const overloadPreview = preview(b, [castOverload]);
  assert(overloadPreview.valid);
  assert.equal(overloadPreview.final.units.aegis.buffs.overload, 1);

  // Overload skill test
  b.units.aegis.buffs.overload = 1;
  const testSkill = {
    id: 'test-nuke',
    name: '灵能轰击',
    ap: 1,
    mp: 4,
    target: 'enemy',
    effects: [{ type: 'damage', value: 10 }],
  };
  b.heroDefinitions.aegis.skills = [testSkill];
  const targetId = b.enemyIds[0];
  const targetInitialHp = b.units[targetId].hp;
  const initialMp = b.units.aegis.mp;

  // mpCost = 4 * 2 = 8. bonus = Math.round(8 * 0.25) = 2.
  // Each cast does 10 + 2 = 12 damage. Two casts = 24 damage.
  const action = makeAction(b, 'aegis', 'test-nuke', targetId, 0);
  const result = preview(b, [action]);
  assert(result.valid);
  assert.equal(result.final.units.aegis.mp, initialMp - 8);
  assert.equal(result.final.units[targetId].hp, targetInitialHp - 24);
  assert(!result.final.units.aegis.buffs.overload);
});

test('rear character gains entryReady after staying in rear for a full round, and swap triggers entrySkill', () => {
  const w = world();
  const b = newBattle(w.enemyIds, {}, w.enemyDefinitions);
  b.phase = 'plan';
  b.round = 1;

  // In round 1, rear units start round in rear and remain in rear.
  const rearId = b.formation[3];
  assert.equal(b.units[rearId].entryReady, false, 'rear unit is not entryReady at round 1 start');
  const earlySwap = preview(b, [makeSwap(rearId, 0, 0)]);
  assert(earlySwap.valid);
  assert(
    !earlySwap.events.some((e) => e.type === 'entrySkill' && e.actor === rearId),
    'early swap in round 1 must not trigger entrySkill',
  );

  const round1Result = preview(b, []);
  assert(round1Result.valid);
  assert.equal(round1Result.final.units[rearId].entryReady, true);

  const advanced = advance(round1Result);
  assert.equal(advanced.units[rearId].entryReady, true);

  // Swap rearId into front position 0
  const swapAction = makeSwap(rearId, 0, 0);
  const swapResult = preview(advanced, [swapAction]);
  assert(swapResult.valid);
  assert.equal(swapResult.final.formation[0], rearId);
  assert.equal(swapResult.final.units[rearId].entryReady, false);
  const entryEvent = swapResult.events.find((e) => e.type === 'entrySkill' && e.actor === rearId);
  assert(entryEvent, 'swap with entryReady must produce entrySkill event');
  const cues = combatCues(entryEvent, advanced);
  assert(cues.length > 0, 'entrySkill must produce audio cues');
  assert(
    cues.some((c) => c.name === 'cast'),
    'entrySkill must produce cast cue',
  );

  // Verify triggeredStatusVisuals handles newly added statuses like vulnerable
  const simulatedEvent = {
    type: 'entrySkill',
    actor: 'character-changjing-yuexi',
    after: { units: { 'enemy-1': { buffs: { vulnerable: 1 } } } },
  };
  const signals = triggeredStatusVisuals(simulatedEvent, {
    units: { 'enemy-1': { buffs: {} } },
  });
  assert(signals.some((s) => s.id === 'enemy-1' && s.type === 'vulnerable'));
});

test('Qingyuan entrySkill triggers opposite strike and self shield, and old saves backfill entrySkill', () => {
  const p = defaultProtagonist();
  assert(p.combat.entrySkill, 'Qingyuan must have combat.entrySkill');
  assert.equal(p.combat.entrySkill.target, 'opposite');
  assert.equal(p.setting.entrySkill.name, '破阵·清影');

  // Test backfilling from old save with missing entrySkill
  const oldSavedQingyuan = {
    id: 'character-qingyuan',
    setting: { name: '青缘', title: '灵枢行剑者', worldbook: '旧世界书' },
    combat: { hp: 68, mp: 24, attack: 9 },
  };
  const restored = defaultProtagonist({ characters: [oldSavedQingyuan] });
  assert.equal(restored.combat.entrySkill?.name, '破阵·清影');
  assert.equal(restored.setting.entrySkill?.name, '破阵·清影');

  // Test restoreLibrary backfills Qingyuan without entrySkill
  const lib = restoreLibrary({
    version: 1,
    campaign: { version: 3, protagonistId: 'character-qingyuan' },
    characters: [
      {
        id: 'character-qingyuan',
        source: 'generated',
        archetype: 'aegis',
        setting: { name: '青缘', title: '灵枢行剑者', worldbook: '旧设定' },
        combat: {
          hp: 68,
          mp: 24,
          attack: 9,
          attackName: '清影破隙',
          limit: 2,
          weapon: 'sword',
          skills: [
            {
              id: 's1',
              name: '素气',
              text: '1',
              ap: 1,
              mp: 1,
              target: 'self',
              effects: [{ type: 'heal', value: 5 }],
            },
            {
              id: 's2',
              name: '疾风',
              text: '2',
              ap: 1,
              mp: 1,
              target: 'enemy',
              effects: [{ type: 'damage', value: 5 }],
            },
          ],
        },
      },
    ],
    party: ['character-qingyuan', null, null, null, null, null],
  });
  const qyMember = lib.characters.find((c) => c.setting?.name === '青缘');
  assert(qyMember.combat.entrySkill, 'restoreLibrary should backfill combat.entrySkill');
  assert.equal(qyMember.combat.entrySkill.target, 'opposite');
  assert.equal(qyMember.setting.entrySkill.name, '破阵·清影');

  // Test combat execution of Qingyuan entrySkill
  const w = world();
  const qingyuanCombat = {
    ...qyMember.combat,
    id: HEROES[3].id,
  };
  const heroDefs = {
    [HEROES[3].id]: qingyuanCombat,
  };
  const b = newBattle(w.enemyIds, heroDefs, w.enemyDefinitions);
  b.units[HEROES[3].id] = {
    ...b.units[HEROES[3].id],
    entryReady: true,
  };
  const targetEnemyId = w.enemyIds[0];
  const targetInitialHp = b.units[targetEnemyId].hp;
  // Swap into slot 0 where enemy is
  const swapAction = makeSwap(HEROES[3].id, 0, 0);
  const result = preview(b, [swapAction]);
  assert(result.valid);
  assert.equal(result.final.units[HEROES[3].id].block, 6); // 6 self shield
  assert.equal(result.final.units[targetEnemyId].hp, targetInitialHp - 8); // 8 opposite damage
  const entryEvent = result.events.find((e) => e.type === 'entrySkill' && e.actor === HEROES[3].id);
  assert(entryEvent);
  assert.equal(entryEvent.skill, 'entry-qingyuan');
});
