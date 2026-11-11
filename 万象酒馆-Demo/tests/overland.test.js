import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeOverlandStory,
  overlandPlan,
  overlandRunPlan,
  restoreOverlandRun,
} from '../src/overland-travel.js';
import { overlandRequest, overlandResponse } from '../src/ai/pipeline/overland-request.js';
import { combatRank, combatScale, scaleMoveEffects } from '../src/combat-scale.js';
import { grownCombat, restoreGrowth } from '../src/growth.js';
import { EDITH } from '../src/content/edith.js';
import { enemyGrowth } from '../src/enemy-growth.js';

test('bridge and city request exactly the traversed legs, including reverse paths', () => {
  const bridge = overlandPlan('outskirts', 'road-bridge');
  assert.deepEqual(
    bridge.stages.map((leg) => [leg.turns, leg.type]),
    [[3, 'battle']],
  );
  const reeds = overlandPlan('outskirts', 'road-reeds');
  assert.equal(reeds.turns, 6);
  assert.deepEqual(
    reeds.stages.map((leg) => leg.type),
    ['battle', 'event'],
  );
  const city = overlandPlan('outskirts', 'road-capital');
  assert.equal(city.turns, 10);
  assert.deepEqual(
    city.stages.map((leg) => leg.to.id),
    ['road-bridge', 'road-reeds', 'road-capital'],
  );
  assert.deepEqual(
    overlandPlan('road-capital', 'outskirts').stages.map((leg) => leg.turns),
    [4, 3, 3],
  );
  const input = { overland: { from: bridge.from, to: bridge.to } };
  const request = overlandRequest(
    input,
    { contextSize: 16000, maxTokens: 2048 },
    (s) => s.length / 3,
  );
  assert.match(request.messages[0].content, /恰好写 1 幕/);
  const mechanics = JSON.parse(request.messages.at(-1).content).stages;
  assert.deepEqual(mechanics[0].enemyIds, ['patrolHound']);
  assert.equal(mechanics[0].level, 3);
});

test('overland output can author prose and choices only, with validated save restoration', () => {
  const plan = overlandPlan('outskirts', 'road-reeds');
  const raw = {
    acts: plan.stages.map((leg) => ({
      id: leg.id,
      title: '路况',
      story: '【旁白】沿岸传来水声。',
      ...(leg.choices
        ? {
            choices: leg.choices.map(({ id, action }) => ({
              id,
              label: action,
              outcome: '通过。',
            })),
          }
        : {}),
    })),
  };
  const acts = overlandResponse(`<wanxiang_json>${JSON.stringify(raw)}</wanxiang_json>`, {
    overland: plan,
  });
  const run = { id: 'route', from: plan.from, to: plan.to, acts, index: 0, phase: 'battle' };
  assert.deepEqual(restoreOverlandRun(run), run);
  const prior = { ...run, to: 'road-bridge', acts: [acts[1], acts[0]], index: 1 };
  assert.deepEqual(restoreOverlandRun(prior), prior);
  assert.deepEqual(
    overlandRunPlan(prior).stages.map((leg) => leg.to.id),
    ['road-reeds', 'road-bridge'],
  );
  assert.throws(() => normalizeOverlandStory({ acts: acts.slice(0, 1) }, plan), /2 幕/);
  assert.throws(
    () => normalizeOverlandStory({ acts: [{ ...acts[0], enemyIds: ['ares'] }, acts[1]] }, plan),
    /只能/,
  );
});

test('same-rank growth uses shared scales, SP grows slower, and multi-hit gets one bonus', () => {
  const build = (level) =>
    grownCombat({ id: 'edith', combat: EDITH, growth: restoreGrowth({ level }, 'edith') });
  assert.equal(combatRank(20), '普通');
  assert.equal(combatRank(21), '精锐');
  assert.equal(build(99).mp, 80);
  assert.equal(build(21).hp, Math.round(EDITH.hp * combatScale(21)));
  const boss = enemyGrowth({ level: 21, seed: 123 }, 0, 'ares', true);
  assert.equal(boss.hpScale, combatScale(21));
  assert.equal(boss.damageScale, combatScale(21));
  const multi = [3, 3, 4].map((value) => ({ type: 'damage', value }));
  assert.equal(
    scaleMoveEffects(multi, 3.1, 5).reduce((sum, hit) => sum + hit.value, 0),
    36,
  );
});
