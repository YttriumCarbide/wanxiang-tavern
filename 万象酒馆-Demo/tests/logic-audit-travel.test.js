import test from 'node:test';
import assert from 'node:assert/strict';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { compileRoster, officialCharacter } from '../src/ai/library.js';
import { restoreAdventureResources } from '../src/adventure/restore-resources.js';
import { beginEncounter, completeEncounter, newExpedition } from '../src/expedition.js';
import { gainExperience, restoreGrowth } from '../src/growth.js';
import { claimBattleRewards } from '../src/rewards.js';

test('resource recovery repairs lost maxima without refilling valid spent resources', () => {
  const library = newCampaign(defaultProtagonist());
  const expedition = newExpedition('bossGate', compileRoster(library));
  expedition.partyIds = [...library.party];
  const state = beginEncounter(expedition);
  const unit = state.units.aegis;
  unit.hp = 0;
  unit.mp = Math.min(3, unit.maxMp);
  const expected = structuredClone(unit);
  expedition.carried = structuredClone(state);
  const snapshot = { state, journey: { expedition } };

  for (const saved of [state, expedition.carried]) {
    saved.units.aegis.maxHp = null;
    saved.units.aegis.maxMp = null;
  }

  const rosterBefore = structuredClone(library);
  restoreAdventureResources(snapshot, library);

  assert.deepEqual(state.units.aegis, expected);
  assert.deepEqual(expedition.carried.units.aegis, expected);
  assert.deepEqual(library, rosterBefore);
  const repaired = structuredClone(snapshot);
  restoreAdventureResources(snapshot, library);
  assert.deepEqual(snapshot, repaired);
});

test('battle reward claims remain idempotent after serialization and changed replay payloads', () => {
  const library = newCampaign(defaultProtagonist());
  const rewards = {
    summonContracts: 1,
    gold: 20,
    ether: 8,
    equipmentVouchers: 1,
    items: { 'health-potion': 1 },
  };
  const inventoryBefore = structuredClone(library.inventory);

  assert.equal(claimBattleRewards(library, 'audit:battle-0', rewards), true);
  assert.equal(library.inventory.gold, inventoryBefore.gold + 20);
  assert.equal(library.inventory.ether, inventoryBefore.ether + 8);
  assert.equal(library.inventory.summonContracts, inventoryBefore.summonContracts + 1);
  assert.equal(
    library.inventory.items['health-potion'],
    inventoryBefore.items['health-potion'] + 1,
  );

  const restored = JSON.parse(JSON.stringify(library));
  const beforeReplay = structuredClone(restored);
  assert.equal(
    claimBattleRewards(restored, 'audit:battle-0', {
      ...rewards,
      gold: 100,
      items: { 'health-potion': 5 },
    }),
    false,
  );
  assert.deepEqual(restored, beforeReplay);
});

test('encounter completion rejects an unfinished battle without advancing or recording rewards', () => {
  const expedition = newExpedition();
  const state = beginEncounter(expedition);
  const expeditionBefore = structuredClone(expedition);
  const stateBefore = structuredClone(state);

  assert.throws(() => completeEncounter(expedition, state), /Encounter has not been won/);
  assert.deepEqual(expedition, expeditionBefore);
  assert.deepEqual(state, stateBefore);
});

test('a future encounter victory cannot skip expedition nodes or claim rewards', () => {
  const expedition = newExpedition();
  const state = beginEncounter(expedition);
  state.encounter = expedition.index + 1;
  state.phase = 'victory';
  const beforeExpedition = structuredClone(expedition);
  const beforeState = structuredClone(state);

  assert.throws(() => completeEncounter(expedition, state), /does not match expedition/);
  assert.deepEqual(expedition, beforeExpedition);
  assert.deepEqual(state, beforeState);
});

test('recording the same victory twice leaves expedition progress and carried resources unchanged', () => {
  const expedition = newExpedition();
  const state = beginEncounter(expedition);
  state.phase = 'victory';

  const result = completeEncounter(expedition, state);
  assert.equal(result.complete, false);
  assert.equal(expedition.index, 1);
  assert.equal(expedition.records.length, 1);
  assert.equal(expedition.records[0].rewardId, result.rewardId);
  const expeditionBefore = structuredClone(expedition);
  const stateBefore = structuredClone(state);

  assert.throws(() => completeEncounter(expedition, state), /Encounter already recorded/);
  assert.deepEqual(expedition, expeditionBefore);
  assert.deepEqual(state, stateBefore);
});

test('direct experience grants with invalid amounts throw RangeError and leave growth untouched', async (t) => {
  for (const amount of [-1, -0.5, 0.5, 1.5, NaN, Infinity, -Infinity, '1', null, undefined]) {
    await t.test(String(amount), () => {
      const member = officialCharacter('edith');
      member.growth = restoreGrowth({ revision: 2, level: 1, xp: 7 }, member.id);
      const before = structuredClone(member);

      assert.throws(() => gainExperience(member, amount), RangeError);

      assert.deepEqual(member, before);
      assert.equal(Number.isSafeInteger(member.growth.xp), true);
      assert.equal(Number.isSafeInteger(member.growth.level), true);
    });
  }
});

test('direct experience grants with zero and small positive amounts update only growth', async (t) => {
  for (const amount of [0, 1]) {
    await t.test(String(amount), () => {
      const member = officialCharacter('edith');
      member.growth = restoreGrowth({ revision: 2, level: 1, xp: 7 }, member.id);
      const combatBefore = structuredClone(member.combat);
      const settingBefore = structuredClone(member.setting);

      const result = gainExperience(member, amount);

      assert.deepEqual(result.before, { level: 1, xp: 7 });
      assert.deepEqual(result.after, { level: 1, xp: 7 + amount });
      assert.equal(result.amount, amount);
      assert.equal(member.growth.level, 1);
      assert.equal(member.growth.xp, 7 + amount);
      assert.deepEqual(result.levels, []);
      assert.deepEqual(member.combat, combatBefore);
      assert.deepEqual(member.setting, settingBefore);
    });
  }
});
