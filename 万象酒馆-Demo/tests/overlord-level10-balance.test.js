import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runOverlordCalibration } from '../tools/battle-sim/overlords.mjs';

test('level 10 six-member standard cohorts calibrate both overlords', async () => {
  const reportDir = process.env.DEMO_TEST_REPORT_DIR || '.runtime/tests';
  const reportPath = path.join(reportDir, 'battle-sim', 'overlords-level10.json');

  const seeds = Number(process.env.OVERLORD_BALANCE_SEEDS || 24);
  const firstSeed = Number(process.env.OVERLORD_BALANCE_FIRST_SEED || 1);
  const keepTrace = Boolean(process.env.OVERLORD_BALANCE_TRACE);

  assert.ok(
    Number.isSafeInteger(seeds) && seeds >= 1 && seeds <= 128,
    'seeds must be a safe integer in 1..128',
  );
  assert.ok(
    Number.isSafeInteger(firstSeed) && firstSeed >= 1,
    'firstSeed must be a positive safe integer',
  );

  const report = runOverlordCalibration({
    seeds,
    firstSeed,
    keepTrace,
    maxRounds: 24,
    candidateLimit: 5,
  });

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2));

  for (const boss of report.bosses) {
    console.log(
      `${boss.id}: winRate=${boss.winRate} meanRounds=${boss.meanRounds} ` +
        `casualtyRate=${boss.casualtyRate} heroCasualtyFraction=${boss.meanHeroCasualtyFraction} ` +
        `seeds=${boss.samples.length}`,
    );
  }

  assert.equal(report.bosses.length, 2, 'report should contain two bosses');

  for (const boss of report.bosses) {
    for (const sample of boss.samples) {
      assert.equal(sample.party.length, 6, `${boss.id}: party should have six members`);
      for (const member of sample.party) {
        assert.equal(member.level, 10, `${boss.id}: party member should be level 10`);
      }
      assert.ok(sample.equipment.length > 0, `${boss.id}: equipment should be nonempty`);
      for (const item of sample.equipment) {
        assert.equal(item.level, 10, `${boss.id}: equipment item should be level 10`);
      }
      assert.equal(sample.bossLevel, 10, `${boss.id}: boss should be level 10`);
      assert.equal(sample.bossHp, 565, `${boss.id}: boss hp should be 565`);
      assert.equal(sample.before.partySize, 6, `${boss.id}: before.partySize should be 6`);
      assert.equal(sample.before.alive, 6, `${boss.id}: before.alive should be 6`);
      assert.deepEqual(sample.violations, [], `${boss.id}: sample violations should be empty`);
      assert.ok(
        !['invariant', 'stalled', 'round-limit'].includes(sample.outcome),
        `${boss.id}: outcome should not be invariant/stalled/round-limit, got ${sample.outcome}`,
      );
    }

    assert.ok(
      boss.winRate >= 0.8,
      `${boss.id}: winRate should be at least 0.8, got ${boss.winRate}`,
    );
    if (seeds >= 24) {
      assert.ok(
        boss.meanRounds >= 5 && boss.meanRounds <= 7,
        `${boss.id}: meanRounds should be 5..7, got ${boss.meanRounds}`,
      );
      assert.ok(
        boss.casualtyRate >= 0.1 && boss.casualtyRate <= 0.3,
        `${boss.id}: casualtyRate should be 0.1..0.3, got ${boss.casualtyRate}`,
      );
    }
  }
});

test('overlord calibration options validation', () => {
  assert.throws(
    () => runOverlordCalibration({ seeds: 0, firstSeed: 1, maxRounds: 24, candidateLimit: 5 }),
    RangeError,
  );
  assert.throws(
    () => runOverlordCalibration({ seeds: 1, firstSeed: 0, maxRounds: 24, candidateLimit: 5 }),
    RangeError,
  );
  assert.throws(
    () => runOverlordCalibration({ seeds: 1, firstSeed: 1, maxRounds: 0, candidateLimit: 5 }),
    RangeError,
  );
  assert.throws(
    () => runOverlordCalibration({ seeds: 1, firstSeed: 1, maxRounds: 24, candidateLimit: 0 }),
    RangeError,
  );
});
