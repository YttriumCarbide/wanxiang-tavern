import test from 'node:test';
import assert from 'node:assert/strict';
import { newCampaign, firstCompanion } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { restoreLibrary, compileRoster } from '../src/ai/library.js';
import { newExpedition, beginEncounter, completeEncounter, chooseRest } from '../src/expedition.js';
import { claimBattleRewards } from '../src/rewards.js';

test('only confirmed expedition completion grants one contract and claims are idempotent', () => {
  const library = newCampaign(defaultProtagonist());
  const node = { ...library.exploration.ruins.frontier[0], tutorial: true };
  const trip = newExpedition('bossGate', compileRoster(library), node);
  for (let room = 0; room < 5; room++) {
    const state = beginEncounter(trip);
    assert.throws(() => completeEncounter(trip, state));
    state.phase = 'victory';
    const result = completeEncounter(trip, state);
    if (trip.restPending) chooseRest(trip, 'sleep');
    assert.equal(result.rewards.summonContracts, room === 4 ? 1 : 0);
    assert(claimBattleRewards(library, result.rewardId, result.rewards));
    assert.equal(claimBattleRewards(library, result.rewardId, result.rewards), false);
    assert.equal(library.inventory.summonContracts, room === 4 ? 1 : 0);
    assert.equal(library.inventory.gold, room < 4 ? (room + 1) * 20 : 180);
  }
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.deepEqual(restored.inventory, library.inventory);
  assert.deepEqual(restored.rewardClaims, library.rewardClaims);
});

test('the contracted first recruit is Changjing Yuexi, consumes once and survives dialogue reload', () => {
  const library = newCampaign(defaultProtagonist());
  assert.equal(firstCompanion(library), null);
  library.campaign.completed = true;
  assert.throws(() => firstCompanion(library), /召唤契约/);
  assert.equal(library.characters.length, 2);
  library.inventory.summonContracts = 1;
  const fan = firstCompanion(library);
  assert.equal(fan.setting.name, '长景月汐');
  assert(library.party.includes(fan.id));
  assert.equal(library.inventory.summonContracts, 0);
  assert.equal(library.campaign.tutorial, 'recruit-dialogue');
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.equal(firstCompanion(restored), null);
  assert.equal(restored.characters.filter((entry) => entry.id === fan.id).length, 1);
  assert(restored.party.includes(fan.id));
  assert.equal(restored.campaign.tutorial, 'recruit-dialogue');
  assert.equal(restored.inventory.summonContracts, 0);
});

test('old completed tutorial saves can continue recruitment without repeatedly issuing contracts', () => {
  const old = newCampaign(defaultProtagonist());
  old.campaign.version = 1;
  old.campaign.completed = true;
  old.campaign.tutorial = 'complete';
  delete old.inventory;
  const restored = restoreLibrary(old);
  assert.equal(restored.inventory.summonContracts, 1);
  assert.equal(restored.campaign.tutorial, 'summon-return');
  firstCompanion(restored);
  const again = restoreLibrary(restored);
  assert.equal(again.inventory.summonContracts, 0);
  assert.equal(again.characters.length, 3);
});
