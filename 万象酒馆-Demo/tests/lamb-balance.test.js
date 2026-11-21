import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { simulateCampaign } from '../tools/battle-sim/campaign.mjs';
import { summarizeNode } from '../tools/battle-sim/statistics.mjs';

test('level 25 lamb cohorts retain all phases without a forced dead end', async () => {
  const seeds = Number(process.env.LAMB_BALANCE_SEEDS || 2);
  const firstSeed = Number(process.env.LAMB_BALANCE_FIRST_SEED || 1);
  assert.ok(Number.isSafeInteger(firstSeed) && firstSeed >= 1 && firstSeed + seeds <= 0x100000000);
  const profiles = (process.env.LAMB_BALANCE_PROFILES || 'standard,high').split(',');
  assert.ok(profiles.length && profiles.every((profile) => ['standard', 'high'].includes(profile)));
  assert.ok(
    Number.isSafeInteger(seeds) && seeds >= 1 && seeds <= 128,
    'LAMB_BALANCE_SEEDS must be a safe integer in 1..128',
  );

  const report = {
    schemaVersion: 1,
    scenario: {
      map: 'ruins',
      sequence: 5,
      heroLevel: 25,
      bossLevel: 25,
      firstSeed,
      seeds,
      maxRounds: 32,
      strategy: 'unchanged fixed simulation policies',
      auditedSeeds: firstSeed === 1 ? [1] : [],
    },
    profiles: [],
  };

  for (const profile of new Set(profiles)) {
    const samples = [];

    for (let seed = firstSeed; seed < firstSeed + seeds; seed += 1) {
      const run = simulateCampaign({
        profile,
        seed,
        mode: 'cohort',
        maps: ['ruins'],
        sites: 1,
        sequences: [5],
        heroLevel: 25,
        maxRounds: 32,
        keepTrace: seed === 1,
      });

      assert.equal(run.expeditions.length, 1, 'expected exactly one expedition');
      const expedition = run.expeditions[0];
      assert.ok(
        Array.isArray(expedition.party) && expedition.party.length === 6,
        'party must have six members',
      );
      for (const member of expedition.party) {
        assert.equal(member.level, 25, 'party member level must be 25');
      }
      assert.equal(expedition.entry.level, 25, 'entry level must be 25');
      assert.equal(expedition.entry.boss, 'apepLamb', 'entry boss must be apepLamb');
      assert.ok(
        Array.isArray(expedition.equipment) && expedition.equipment.length > 0,
        'equipment must be non-empty',
      );
      for (const item of expedition.equipment) {
        assert.equal(item.level, 25, 'equipment level must be 25');
      }

      let totalLevels = 0;
      for (const node of expedition.nodes) {
        if (node.battle) {
          assert.deepEqual(node.battle.violations, [], 'battle node violations must be empty');
          totalLevels += node.levels.length;
        }
      }
      assert.equal(totalLevels, 0, 'fixed level run must not gain levels across battles');

      const node = expedition.nodes[expedition.nodes.length - 1];
      assert.equal(node.type, 'boss', 'last node must be boss');
      assert.equal(node.boss, 'apepLamb', 'last node boss must be apepLamb');

      const boss = node.battle.coverage.bosses.apepLamb;
      assert.ok(boss.actions > 0, 'boss must act');
      assert.ok(boss.charges > 0, 'boss must charge');
      if (expedition.outcome === 'victory') {
        assert.ok(boss.phases.includes(2), 'victory must reach phase 2');
        assert.ok(boss.phases.includes(3), 'victory must reach phase 3');
        assert.ok(node.rounds > 1, 'victory must take more than one round');
      }

      const bossEnemy = node.enemies.find((enemy) => enemy.id === 'apepLamb');
      samples.push({
        seed,
        outcome: expedition.outcome,
        rounds: node.rounds,
        before: {
          ...node.start,
          alive: node.start.partySize - node.start.down,
        },
        after: {
          ...node.end,
          alive: node.end.partySize - node.end.down,
        },
        enteredBoss: true,
        bossActed: boss.actions > 0,
        bossMechanicSeen: boss.mechanics > 0 || boss.charges > 0 || boss.phases.length > 0,
        phases: boss.phases,
        charges: boss.charges,
        releases: boss.releases,
        damage: node.battle.coverage.damageToHeroesByEvent,
        bossHp: bossEnemy.hp,
      });
      if ((seed - firstSeed + 1) % 8 === 0)
        console.log(`Lamb calibration ${profile}: ${seed - firstSeed + 1}/${seeds}`);
    }

    const summary = summarizeNode(samples);
    if (profile === 'standard')
      assert.ok(summary.successes > 0, 'standard profile must have at least one success');
    if (profile === 'standard' && firstSeed === 1)
      assert.equal(samples[0].outcome, 'victory', 'first sample must be a deterministic victory');
    for (const sample of samples) {
      assert.notEqual(sample.outcome, 'invariant', 'invariant outcome not allowed');
      assert.notEqual(sample.outcome, 'stalled', 'stalled outcome not allowed');
      assert.notEqual(sample.outcome, 'timeout', 'timeout outcome not allowed');
    }
    const oneRoundWins = samples.filter(
      (sample) => sample.outcome === 'victory' && sample.rounds === 1,
    ).length;
    assert.equal(oneRoundWins, 0, 'no one-round victories allowed');

    const damageKeys = [...new Set(samples.flatMap((sample) => Object.keys(sample.damage)))].sort();
    const meanDamageByEvent = Object.fromEntries(
      damageKeys.map((key) => [
        key,
        samples.reduce((sum, sample) => sum + (sample.damage[key] || 0), 0) / seeds,
      ]),
    );

    report.profiles.push({
      profile,
      ...summary,
      meanDamageByEvent,
      phaseThreeSamples: samples.filter((sample) => sample.phases.includes(3)).length,
      chargeSamples: samples.filter((sample) => sample.charges > 0).length,
      oneRoundWins,
      samples,
    });
  }

  const reportPath = path.resolve(
    process.env.DEMO_TEST_REPORT_DIR || '.runtime/tests',
    'battle-sim',
    'lamb-level25.json',
  );
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
});
