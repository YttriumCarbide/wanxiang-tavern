import assert from 'node:assert/strict';
import test from 'node:test';
import { nodeRowsCsv } from '../tools/battle-sim/csv.mjs';
import { summarizeNode } from '../tools/battle-sim/statistics.mjs';
import { simulateCampaign } from '../tools/battle-sim/campaign.mjs';
import { runStressMatrixSerial } from '../tools/battle-sim/stress.mjs';
import { runCampaignMatrix } from '../tools/battle-sim/matrix.mjs';
import { runParallelMatrix } from '../tools/battle-sim/parallel.mjs';
import { officialCharacter } from '../src/ai/library-roster.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { HEROES } from '../src/data.js';

function assertDirectDamageSkillForActor(action) {
  const combatants = [
    defaultProtagonist().combat,
    ...['edith', 'aegis', 'pandora', 'morrow', 'vesper'].map((id) => officialCharacter(id).combat),
  ];
  const actorIndex = HEROES.findIndex((candidate) => candidate.id === action.actor);
  const combatant = combatants[actorIndex];
  const skill =
    action.skill === 'attack'
      ? combatant?.attack && { effects: [{ type: 'damage' }] }
      : combatant?.skills?.find((candidate) => candidate.id === action.skill);

  assert(
    skill?.effects?.some((effect) => effect.type === 'damage'),
    `${action.actor} must use one of their available direct-damage skills`,
  );
}

test('node statistics retain the sample denominators, including a zero-round outcome', () => {
  const before = { hp: 60, maxHp: 60, mp: 20, maxMp: 20, alive: 2, supplies: 1 };
  const after = { hp: 12, maxHp: 60, mp: 2, maxMp: 20, alive: 1, supplies: 0 };
  const result = summarizeNode([
    { outcome: 'invariant', rounds: 0 },
    { outcome: 'defeat', rounds: 5, before, after },
    { outcome: 'victory', rounds: 1, enteredBoss: true, bossActed: false },
  ]);
  assert.deepEqual(result.outcomes, { defeat: 1, invariant: 1, victory: 1 });
  assert.deepEqual(result.roundsHistogram, { 0: 1, 1: 1, 5: 1 });
  assert.equal(result.winRate, 1 / 3);
  assert(result.winInterval95[0] < result.winRate && result.winInterval95[1] > result.winRate);
  assert.equal(result.p90Rounds, 5);
  assert.equal(result.casualtyRate, 1);
  assert.equal(result.exhaustedRate, 1);
  assert.equal(result.denominators.casualtyRate, 1);
  assert.equal(result.oneRoundBossWins, 1);
  assert.equal(result.bossWinsWithoutAction, 1);
  assert.equal(result.denominators.bossWinsWithoutMechanic, 0);
  assert.equal(summarizeNode([]).winRate, null);
});

test('node CSV preserves quoted data, nested round distributions, and unavailable statistics', () => {
  const csv = nodeRowsCsv([{ map: 'quoted,"map"', roundsHistogram: { 1: 2 }, winRate: null }]);
  assert.match(csv, /^mode,profile,map,/);
  assert.match(csv, /"quoted,""map"""/);
  assert.match(csv, /"\{""1"":2\}"/);
  assert.equal(csv.split('\r\n').length, 3);
});

test('high-loadout emblem scouting never elevates a supply item above an available attack', () => {
  const run = simulateCampaign({
    profile: 'high',
    seed: 20,
    mode: 'cohort',
    maps: ['moss-hollow'],
    sites: 1,
    maxRounds: 8,
    keepTrace: true,
  });
  const firstBattle = run.expeditions[0].nodes[0];
  assert.equal(firstBattle.outcome, 'victory');
  assert(firstBattle.battle.trace.length > 0);
  assert(firstBattle.start.supplies > 0);
  const selectedAction = firstBattle.battle.trace[0].plan[0];
  assert.equal(selectedAction.kind, 'skill');
  assertDirectDamageSkillForActor(selectedAction);
  assert.equal(firstBattle.battle.violations.length, 0);
});

test('high-loadout ruins opener keeps the available emblem attack ahead of supplies', () => {
  const run = simulateCampaign({
    profile: 'high',
    seed: 20,
    mode: 'cohort',
    maps: ['ruins'],
    sites: 1,
    maxRounds: 8,
    keepTrace: true,
  });
  const firstBattle = run.expeditions[0].nodes[0];
  assert(firstBattle.start.supplies > 0);
  const selectedAction = firstBattle.battle.trace[0].plan[0];
  assert.equal(selectedAction.kind, 'skill');
  assertDirectDamageSkillForActor(selectedAction);
  assert.equal(firstBattle.battle.violations.length, 0);
});

test('stress regression preserves the abyss defeat and zero-damage observations without invariants', () => {
  const defeat = runStressMatrixSerial({
    rosters: ['vanguard'],
    emblems: ['tan-hongyu'],
    affixes: ['none'],
    enemies: ['abyssDevourerPython'],
    maxRounds: 4,
  }).results[0];
  assert.equal(defeat.caseId, 'vanguard/tan-hongyu/none/abyssDevourerPython');
  assert.equal(defeat.seed, 905689679);
  assert.equal(defeat.outcome, 'defeat');
  assert.equal(defeat.coverage.bosses.abyssDevourerPython.actions, 6);
  assert.equal(defeat.violations.length, 0);

  const stalled = runStressMatrixSerial({
    rosters: ['arcanist'],
    emblems: ['tan-hongyu'],
    affixes: ['none'],
    enemies: ['abyssDevourerPython'],
    maxRounds: 4,
  }).results[0];
  assert.equal(stalled.seed, 2222172916);
  assert.equal(stalled.outcome, 'round-limit');
  assert.equal(stalled.coverage.zeroDamageRounds, 3);
  assert.equal(stalled.violations.length, 0);
});

test('novice mill sequence four regression records the deterministic boss dead-end', () => {
  const run = simulateCampaign({
    profile: 'novice',
    seed: 1,
    mode: 'cohort',
    maps: ['mill'],
    sites: 5,
    maxRounds: 32,
  });
  const expedition = run.expeditions.at(-1);
  const boss = expedition.nodes.at(-1);
  assert.equal(expedition.sequence, 4);
  assert.equal(expedition.outcome, 'defeat');
  assert.equal(boss.type, 'boss');
  assert.equal(boss.outcome, 'defeat');
  assert.equal(boss.battle.violations.length, 0);
});

test('a standard full party survives the attic overlord while facing all three phases', () => {
  const { expeditions } = simulateCampaign({
    profile: 'standard',
    seed: 6,
    mode: 'cohort',
    maps: ['mill'],
    sites: 5,
    maxRounds: 32,
  });
  const boss = expeditions.at(-1).nodes.at(-1);
  assert.equal(boss.boss, 'alchemicalPuppet');
  assert.equal(boss.start.alive, 6);
  assert.equal(boss.outcome, 'victory');
  assert.equal(boss.end.alive, 6);
  const mechanic = boss.battle.coverage.bosses[boss.boss];
  assert.deepEqual(mechanic.phases, [2, 3]);
  assert(mechanic.charges > 0);
  assert.equal(boss.battle.violations.length, 0);
});

test('simulateCampaign rejects invalid heroLevel overrides', () => {
  for (const heroLevel of [0, 100, 1.5, '25', null]) {
    assert.throws(
      () =>
        simulateCampaign({
          profile: 'standard',
          seed: 1,
          mode: 'cohort',
          maps: ['ruins'],
          sites: 1,
          heroLevel,
        }),
      /heroLevel/,
    );
  }
});

test('simulateCampaign rejects invalid sequences', () => {
  for (const sequences of [[], 'x', [-1], [1.5], ['1'], null]) {
    assert.throws(
      () =>
        simulateCampaign({
          profile: 'standard',
          seed: 1,
          mode: 'cohort',
          maps: ['ruins'],
          sites: 1,
          sequences,
        }),
      /sequences/,
    );
  }
});

test('career mode rejects cohort-only options', () => {
  assert.throws(
    () =>
      simulateCampaign({
        profile: 'standard',
        seed: 1,
        mode: 'career',
        maps: ['mill'],
        sites: 1,
        heroLevel: 25,
      }),
    /cohort/,
  );
  assert.throws(
    () =>
      simulateCampaign({
        profile: 'standard',
        seed: 1,
        mode: 'career',
        maps: ['mill'],
        sites: 1,
        sequences: [5],
      }),
    /cohort/,
  );
});

test('fixed-seed standard cohort ruins heroLevel 25 sequence 5 is deterministic', () => {
  const run = simulateCampaign({
    profile: 'standard',
    seed: 1,
    mode: 'cohort',
    maps: ['ruins'],
    sites: 1,
    maxRounds: 1,
    heroLevel: 25,
    sequences: [5],
  });
  assert.equal(run.expeditions.length, 1);
  const expedition = run.expeditions[0];
  assert.equal(expedition.sequence, 5);
  assert.equal(expedition.party.filter(Boolean).length, 6);
  for (const member of expedition.party.filter(Boolean)) assert.equal(member.level, 25);
  assert(expedition.entry.heroLevels.length > 0);
  for (const level of expedition.entry.heroLevels) assert.equal(level, 25);
  assert(expedition.equipment.length > 0);
  for (const item of expedition.equipment) assert.equal(item.level, 25);
  for (const node of expedition.nodes.filter((entry) => entry.battle)) {
    assert.deepEqual(node.levels, []);
  }
});

test('parallel matrix matches serial matrix for a fixed cohort configuration', async () => {
  const options = {
    profiles: ['standard'],
    modes: ['cohort'],
    firstSeed: 1,
    seeds: 1,
    maps: ['ruins'],
    sites: 1,
    maxRounds: 1,
    heroLevel: 25,
    sequences: [5],
  };
  const serial = runCampaignMatrix(options);
  const parallel = await runParallelMatrix(options, 2);
  assert.deepEqual(parallel, serial);
  const expedition = serial.expeditions[0];
  assert.equal(expedition.sequence, 5);
  assert.equal(expedition.fixture.party.filter(Boolean).length, 6);
  for (const member of expedition.fixture.party.filter(Boolean)) assert.equal(member.level, 25);
  assert(expedition.fixture.equipment.length > 0);
  for (const item of expedition.fixture.equipment) assert.equal(item.level, 25);
});
