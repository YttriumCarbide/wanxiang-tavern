import test from 'node:test';
import assert from 'node:assert/strict';
import { newCampaign, firstCompanion } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import { INGREDIENTS } from '../src/content/dining.js';
import { tavernPromotion } from '../src/daily.js';
import {
  advanceLiveService,
  autoFillLiveHubMenu,
  boostLiveStove,
  calcLiveDishPrice,
  clickLiveTable,
  closeLiveCookMiniGame,
  confirmLiveCookDc,
  confirmLiveEventCheck,
  inputLiveCookMiniGame,
  newLiveServiceShift,
  openLiveCookDc,
  openLiveCookMiniGame,
  pickLiveEventOption,
  pourLiveAle,
  rerollLiveCookDc,
  restoreLiveServiceShift,
  seatLiveGuest,
  SERVICE_CATALOG_MAP,
  settleLiveServiceShift,
  upgradeLiveFacility,
} from '../src/service-live.js';
import {
  buildSkirmishEncounterPlan,
  isOverlandRouteKnown,
  markOverlandRouteExplored,
  refreshWorldSkirmishes,
  settleSkirmishVictory,
} from '../src/skirmishes.js';
import { beginEncounter, carrySkirmishWave, newExpedition } from '../src/expedition.js';
import { DEFINITIONS } from '../src/data.js';
import { EMBLEM_ID } from '../src/emblems.js';
import { SERVICE_PATCHES } from '../src/service-gestures.js';

function testLibrary() {
  const lib = newCampaign(defaultProtagonist());
  firstCompanion(lib);
  lib.inventory.gold = 200;
  lib.dining.inventory['frost-oyster'] = 2;
  lib.dining.inventory.milk = 3;
  return lib;
}

test('Phase D.1: Gold-only tavern service facilities, scaled pricing, minigame/DC & settlement', () => {
  const lib = testLibrary();
  const goldBefore = lib.inventory.gold;
  const up = upgradeLiveFacility(lib, 'table');
  assert.equal(up.newLevel, 1);
  assert.equal(up.cost, 35);
  assert.equal(lib.inventory.gold, goldBefore - 35);

  const growth = lib.daily.serviceGrowth;
  const basicPrice = calcLiveDishPrice(SERVICE_CATALOG_MAP['herb-chicken'], {
    growth,
    day: 1,
  }).price;
  assert(
    basicPrice >= 8 && basicPrice <= 25,
    `expected scaled basic dish price, got ${basicPrice}`,
  );

  autoFillLiveHubMenu(lib);
  assert(growth.sigMenu.includes('frost-chowder'));

  const ids = lib.characters.map((c) => c.id);
  const staff = { front: ids[0], cook: ids[1], server: ids[2] || ids[0], clean: ids[3] || ids[1] };
  const shift = newLiveServiceShift({
    library: lib,
    staff,
    day: 1,
    growth,
    tutorial: false,
    seed: 42,
  });
  assert.equal(shift.mode, 'live');
  assert(shift.fateTokens >= 1 && shift.fateTokens <= 4);

  // Restore round-trip preserves active live shift safely.
  const restored = restoreLiveServiceShift(JSON.parse(JSON.stringify(shift)));
  assert.equal(restored.mode, 'live');

  // Seat guest, take order, and complete SVG gesture mini-game on cooking stove.
  advanceLiveService(restored, 0.25);
  advanceLiveService(restored, 0.25);
  assert(restored.queue.length >= 1);
  assert.equal(seatLiveGuest(restored, restored.queue[0].uid, 0), true);
  if (restored.tables[0].patron.vip) {
    restored.tables[0].patron = { ...restored.tables[0].patron, vip: false };
  }
  const ordered = clickLiveTable(restored, 0);
  assert.equal(ordered.action, 'order');

  const mg = openLiveCookMiniGame(restored, 0);
  assert(mg);
  if (SERVICE_PATCHES[mg.kind]?.length) {
    for (const pt of SERVICE_PATCHES[mg.kind]) {
      inputLiveCookMiniGame(restored, {
        type: 'start',
        from: pt,
        to: pt,
        start: pt,
        seconds: 0.05,
      });
      inputLiveCookMiniGame(restored, { type: 'move', from: pt, to: pt, start: pt, seconds: 0.05 });
    }
    inputLiveCookMiniGame(restored, {
      type: 'release',
      from: SERVICE_PATCHES[mg.kind][0],
      to: SERVICE_PATCHES[mg.kind][0],
      start: SERVICE_PATCHES[mg.kind][0],
      seconds: 0.05,
    });
  }
  if (restored.activeMiniGame) closeLiveCookMiniGame(restored);
  // Finish plate if gesture needed extra taps or signature dc_ready.
  if (restored.stoves[0].status === 'cooking') {
    boostLiveStove(restored, 0);
    boostLiveStove(restored, 0);
    boostLiveStove(restored, 0);
  }
  if (restored.stoves[0].status === 'dc_ready') {
    const dcModal = openLiveCookDc(restored, 0);
    assert(dcModal);
    if (dcModal.check.outcome === 'fail') rerollLiveCookDc(restored);
    confirmLiveCookDc(restored);
  }
  assert.equal(restored.plates.length, 1);

  // Serve & collect gold + keg ale tip.
  assert.equal(clickLiveTable(restored, 0).action, 'serve');
  for (let i = 0; i < 16; i++) advanceLiveService(restored, 0.2);
  assert.equal(restored.tables[0].state, 'pay');
  const paid = clickLiveTable(restored, 0);
  assert(paid.gold > 0);
  const ale = pourLiveAle(restored);
  assert(ale.gold > 0);

  // Force event check resolution inside live shift.
  restored.activeEvent = {
    def: {
      id: 'test',
      title: '测试事件',
      opts: [
        {
          label: 'A',
          attr: 'str',
          post: 'clean',
          dc: 5,
          winText: 'ok',
          loseText: 'no',
          reward: { gold: 15, randIng: true },
          penalty: {},
        },
      ],
    },
    pickedIndex: 0,
    mod: 1,
    roll: null,
  };
  pickLiveEventOption(restored, 0);
  const evSummary = confirmLiveEventCheck(restored);
  assert(evSummary);

  const goldBeforeSettle = lib.inventory.gold;
  const settled = settleLiveServiceShift(lib, restored);
  assert(settled.totalGold >= paid.gold + ale.gold);
  assert.equal(lib.inventory.gold, goldBeforeSettle + settled.totalGold);
  assert.equal(lib.daily.serviceGrowth.shifts, 1);
  // Existing workshop clockwork-heart + shifts promotion remains compatible.
  lib.daily.serviceGrowth.shifts = 2;
  lib.workshop = { items: { 'clockwork-heart': 10 } };
  assert.equal(tavernPromotion(lib.daily, lib.workshop).ready, true);
  // Idempotent double-settle does not double-credit gold.
  settleLiveServiceShift(lib, restored);
  assert.equal(lib.inventory.gold, goldBeforeSettle + settled.totalGold);
});

test('Phase D.2: Wild 3-wave skirmishes claim Gold, Ether, valid INGREDIENTS & mark routes known', () => {
  const lib = testLibrary();
  const state = refreshWorldSkirmishes(lib, 'seed-d2');
  const nodeIds = Object.keys(state.nodes);
  assert(nodeIds.length >= 3);

  const node = state.nodes[nodeIds[0]];
  const plan = buildSkirmishEncounterPlan(node);
  assert.equal(plan.encounters.length, 3);
  for (const id of Object.keys(plan.rewards.ingredients)) {
    assert(Object.hasOwn(INGREDIENTS, id), `Skirmish dropped invalid ingredient ${id}`);
  }

  const goldBefore = lib.inventory.gold;
  const etherBefore = lib.inventory.ether;
  const res = settleSkirmishVictory(lib, plan);
  assert.equal(res.claimed, true);
  assert.equal(lib.inventory.gold, goldBefore + plan.rewards.gold);
  assert.equal(lib.inventory.ether, etherBefore + plan.rewards.ether);
  for (const [id, cnt] of Object.entries(plan.rewards.ingredients)) {
    assert((lib.dining.inventory[id] || 0) >= cnt);
  }
  assert.equal(lib.skirmishes.nodes[plan.nodeId], undefined);
  // Idempotent guard
  assert.equal(settleSkirmishVictory(lib, plan).claimed, false);

  assert.equal(isOverlandRouteKnown(lib, 'outskirts', 'road-capital'), false);
  markOverlandRouteExplored(lib, { from: 'outskirts', to: 'road-capital', legs: [] });
  assert.equal(isOverlandRouteKnown(lib, 'outskirts', 'road-capital'), true);
});

test('Wild 3-wave skirmishes inherit hero HP, MP, emblemCharge, and formation across waves', () => {
  const lib = testLibrary();
  const state = refreshWorldSkirmishes(lib, 'seed-carry');
  const node = state.nodes[Object.keys(state.nodes)[0]];
  const plan = buildSkirmishEncounterPlan(node);
  const defs = structuredClone(DEFINITIONS);
  defs.aegis.emblemId = EMBLEM_ID;

  const expedition = newExpedition('bossGate', defs);
  expedition.overlandBattle = {
    skirmishRun: { nodeId: plan.nodeId, plan, waveIndex: 0 },
    spec: {
      name: `${plan.label} · 第 1/3 波`,
      map: 'forest',
      enemyIds: plan.encounters[0].enemies,
      level: plan.encounters[0].level,
    },
  };

  const wave1 = beginEncounter(expedition);
  wave1.units.aegis.hp = Math.max(1, wave1.units.aegis.hp - 12);
  wave1.units.aegis.mp = Math.max(0, wave1.units.aegis.mp - 3);
  wave1.units.aegis.emblemCharge = 4;
  wave1.units.aegis.block = 9;
  wave1.units.aegis.buffs.shield = 2;

  carrySkirmishWave(expedition, wave1);
  expedition.index = 1;
  expedition.overlandBattle.skirmishRun.waveIndex = 1;
  expedition.overlandBattle.spec = {
    name: `${plan.label} · 第 2/3 波`,
    map: 'forest',
    enemyIds: plan.encounters[1].enemies,
    level: plan.encounters[1].level,
  };

  const wave2 = beginEncounter(expedition);
  assert.equal(wave2.encounter, 1);
  assert.equal(wave2.units.aegis.hp, wave1.units.aegis.hp);
  assert.equal(wave2.units.aegis.mp, wave1.units.aegis.mp);
  assert.equal(wave2.units.aegis.emblemCharge, 4);
  assert.equal(wave2.units.aegis.buffs.shield || 0, 0);
});
