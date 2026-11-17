import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  DC_ATTRIBUTES,
  DC_ATTR_BUDGET,
  DC_ATTR_MAX,
  DC_ATTR_MIN,
  OFFICIAL_DC_ATTRS,
  attrMod,
  calibrateDisplayCheck,
  dcSuccessProbability,
  effectiveDcAttrs,
  evaluate2d6Check,
  isPassiveBypass,
  memberGemDcBonus,
  normalizeDcAttrs,
  rebalanceDcAttrs,
  validateGeneratedDcAttrs,
} from '../src/dc.js';
import { GEM_POOL, rollGemDrop } from '../src/content/gems.js';
import {
  EQUIPMENT_SLOT_ORDER,
  ascendEquipment,
  dismantleEquipment,
  equip,
  grantGem,
  hasLegacyCategorizedEquipment,
  normalizeEquipment,
  reforgeEquipment,
  restoreEquipment,
  temperEquipment,
} from '../src/equipment.js';
import { newLibrary, officialCharacter, restoreLibrary } from '../src/ai/library.js';
import { claimBattleRewards } from '../src/rewards.js';
import { DEFINITIONS } from '../src/data.js';
import { ATLAS_PLACES, ATLAS_ROUTES } from '../src/content/atlas-geography.js';
import { IMPERIAL_CROSSROADS, IMPERIAL_DUNGEONS } from '../src/content/imperial-network.js';
import { overlandPlan, ALL_OVERLAND_STOPS } from '../src/overland-travel.js';
import {
  buildSkirmishEncounterPlan,
  clearWorldSkirmish,
  isAtlasLegKnown,
  isOverlandRouteKnown,
  markOverlandRouteExplored,
  refreshWorldSkirmishes,
} from '../src/skirmishes.js';
import { explorationScene } from '../src/exploration/scenes.js';

function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

test('DC six attributes obey budget, bounds, 2D6 math and black-box reconciliation', () => {
  assert.equal(DC_ATTRIBUTES.length, 6);
  for (const attrs of Object.values(OFFICIAL_DC_ATTRS)) {
    const sum = DC_ATTRIBUTES.reduce((acc, a) => acc + attrs[a.key], 0);
    assert.equal(sum, DC_ATTR_BUDGET);
    for (const a of DC_ATTRIBUTES) {
      assert(attrs[a.key] >= DC_ATTR_MIN && attrs[a.key] <= DC_ATTR_MAX);
    }
  }
  const rebalanced = rebalanceDcAttrs({ str: 20, dex: 20, con: 20, int: 6, wis: 6, cha: 6 });
  assert.equal(
    DC_ATTRIBUTES.reduce((s, a) => s + rebalanced[a.key], 0),
    DC_ATTR_BUDGET,
  );
  assert.throws(
    () => validateGeneratedDcAttrs({ str: 18, dex: 18, con: 18, int: 18, wis: 18, cha: 18 }),
    /预算/,
  );
  assert.equal(attrMod(10), 0);
  assert.equal(attrMod(9), -1);
  assert.equal(attrMod(16), 3);

  assert.equal(evaluate2d6Check({ dice: [6, 6], mod: -5, dc: 18 }).outcome, 'crit');
  assert.equal(evaluate2d6Check({ dice: [1, 1], mod: 10, dc: 5 }).outcome, 'fumble');
  assert.equal(evaluate2d6Check({ dice: [4, 4], mod: 1, dc: 9 }).outcome, 'success');
  assert.equal(evaluate2d6Check({ dice: [3, 4], mod: 1, dc: 9 }).outcome, 'fail');

  assert.equal(dcSuccessProbability(0, 7), 58);
  assert.equal(isPassiveBypass({ totalMod: 4, dc: 6 }), true);
  assert.equal(isPassiveBypass({ totalMod: 4, dc: 12 }), false);

  const reconciled = calibrateDisplayCheck({
    dice: [5, 5],
    mod: 3,
    dc: 9,
    outcome: 'fail',
    seed: 'test-sync',
  });
  assert.equal(reconciled.outcome, 'fail');
  assert.equal(reconciled.success, false);
});

test('all official and legacy characters hydrate deterministic six attributes cleanly', () => {
  const lib = newLibrary();
  for (const member of lib.characters) {
    assert.ok(member.dcAttrs);
    const total = DC_ATTRIBUTES.reduce((sum, a) => sum + member.dcAttrs[a.key], 0);
    assert.equal(total, DC_ATTR_BUDGET);
  }
  for (const id of ['edith', 'pandora', 'luo-gongxu', 'libet', 'lumi']) {
    const ch = officialCharacter(id);
    assert.equal(
      DC_ATTRIBUTES.reduce((sum, a) => sum + ch.dcAttrs[a.key], 0),
      DC_ATTR_BUDGET,
    );
  }
  const legacy = {
    id: 'character-custom-old',
    archetype: 'morrow',
    combat: { weapon: 'staff', name: '古学者' },
  };
  const derivedA = normalizeDcAttrs(null, legacy);
  const derivedB = normalizeDcAttrs(null, legacy);
  assert.deepEqual(derivedA, derivedB);
  assert.equal(
    DC_ATTRIBUTES.reduce((sum, a) => sum + derivedA[a.key], 0),
    DC_ATTR_BUDGET,
  );
});

test('equipment enforces 4 typed slots, gem DC bonus pool, and legacy category migration', () => {
  assert.deepEqual([...EQUIPMENT_SLOT_ORDER], ['weapon', 'armor', 'pendant', 'gem']);
  const lib = newLibrary();
  lib.inventory.ether = 200;

  const sword = normalizeEquipment(
    { name: '试炼长剑', category: 'weapon', description: 'atk+1', stats: { attack: 1 }, rules: [] },
    { id: 'tpl-wep', value: 25, name: '铁块' },
  );
  const armor = normalizeEquipment(
    { name: '试炼轻甲', category: 'armor', description: 'hp+4', stats: { hp: 4 }, rules: [] },
    { id: 'tpl-arm', value: 25, name: '皮革' },
  );
  const legacyUntyped = normalizeEquipment(
    { name: '旧版怪石头', description: 'mp+2', stats: { mp: 2 }, rules: [] },
    { id: 'tpl-old', value: 10, name: '碎石' },
  );
  assert.equal(legacyUntyped.legacyCategorized, true);
  assert.ok(['weapon', 'armor', 'pendant'].includes(legacyUntyped.category));

  lib.equipment.catalog.push(sword, armor, legacyUntyped);
  assert.equal(hasLegacyCategorizedEquipment(lib), true);

  lib.equipment.owned.push(
    { id: 'own-w', templateId: 'tpl-wep' },
    { id: 'own-a', templateId: 'tpl-arm' },
  );
  const charId = lib.characters[0].id;
  assert.throws(() => equip(lib, charId, 1, 'own-w'), /护甲/);
  equip(lib, charId, 0, 'own-w');
  equip(lib, charId, 1, 'own-a');

  const gem = GEM_POOL.find((item) => item.id === 'gem-fate-crown');
  grantGem(lib, gem.id, 'own-gem-1');
  equip(lib, charId, 3, 'own-gem-1');
  assert.equal(memberGemDcBonus(lib, lib.characters[0], 'str'), 1);
  assert.equal(effectiveDcAttrs(lib, lib.characters[0]).mods.cha.gemBonus, 1);

  assert.throws(() => reforgeEquipment(lib, 'own-gem-1'), /宝石/);
  assert.throws(() => temperEquipment(lib, 'own-gem-1'), /宝石/);
  assert.throws(() => ascendEquipment(lib, 'own-gem-1'), /宝石/);

  equip(lib, charId, 3, '');
  const etherBefore = lib.inventory.ether;
  const refunded = dismantleEquipment(lib, 'own-gem-1');
  assert.ok(refunded > 0);
  assert.equal(lib.inventory.ether, etherBefore + refunded);

  assert.equal(restoreEquipment({ catalog: [sword], owned: [] }).catalog.length, 1);

  assert.equal(
    claimBattleRewards(lib, 'gem-test-claim', {
      summonContracts: 0,
      gems: [{ gemId: 'gem-valor-shard', instanceId: 'claim-gem-1' }],
    }),
    true,
  );
  assert.ok(lib.equipment.owned.some((item) => item.id === 'claim-gem-1'));
  assert.ok(rollGemDrop('always-win', 1) !== null);
  assert.equal(rollGemDrop('never-win', 0), null);
});

test('imperial map places all 5 dungeons inside 艾尔德兰帝国 and connects 7 crossroads cleanly', () => {
  const svg = fs.readFileSync(path.resolve('assets/exploration/fansheng-territories.svg'), 'utf8');
  const aelMatch = svg.match(/<path data-nation="ael"[^>]*d="([^"]+)"/);
  assert.ok(aelMatch);
  const polygon = [...aelMatch[1].matchAll(/(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
  ]);

  for (const node of [...IMPERIAL_DUNGEONS, ...IMPERIAL_CROSSROADS]) {
    const place = ATLAS_PLACES[node.id];
    assert.ok(place, `Missing ATLAS_PLACES entry for ${node.id}`);
    assert.equal(
      pointInPolygon(place.point[0], place.point[1], polygon),
      true,
      `${node.id} must sit inside 艾尔德兰帝国`,
    );
    const plan = overlandPlan('outskirts', node.id);
    assert.ok(plan.turns > 0 && plan.legs.length >= 1, `Should route to ${node.id}`);
    const scene = explorationScene(node.id);
    assert.equal(scene.illustration.aspect, 3);
  }
  assert.ok(ALL_OVERLAND_STOPS.some((s) => s.id === 'tide'));
  for (const [from, to] of ATLAS_ROUTES) {
    assert.ok(ATLAS_PLACES[from] && ATLAS_PLACES[to], `Broken route ${from} -> ${to}`);
  }
});

test('wild skirmishes generate 3 non-AI battles with ecological drops and known-route tracking', () => {
  const lib = newLibrary();
  const plan = overlandPlan('outskirts', 'ruins');
  assert.equal(isOverlandRouteKnown(lib, 'outskirts', 'ruins'), false);
  markOverlandRouteExplored(lib, plan);
  assert.equal(isOverlandRouteKnown(lib, 'outskirts', 'ruins'), true);
  assert.equal(isAtlasLegKnown(lib, 'outskirts', 'ruins'), true);
  markOverlandRouteExplored(lib, overlandPlan('outskirts', 'cross-meadow'));
  assert.equal(isAtlasLegKnown(lib, 'outskirts', 'cross-meadow'), true);

  const state = refreshWorldSkirmishes(lib, 'seed-1');
  const entries = Object.values(state.nodes);
  assert.ok(entries.length >= 4 && entries.length <= 5);
  for (const node of entries) {
    const encounterPlan = buildSkirmishEncounterPlan(node, 3);
    assert.equal(encounterPlan.encounters.length, 3);
    for (const wave of encounterPlan.encounters) {
      assert.ok(wave.enemies.length >= 1);
      for (const enemyId of wave.enemies) {
        assert.ok(DEFINITIONS[enemyId], `Valid enemy id ${enemyId}`);
        assert.ok(!['moonCrown', 'moonEye', 'moonRoot', 'ares', 'apepLamb'].includes(enemyId));
      }
    }
    assert.ok(encounterPlan.rewards.gold > 0);
    assert.ok(encounterPlan.rewards.ether > 0);
    assert.ok(Object.keys(encounterPlan.rewards.ingredients).length >= 1);
  }
  const firstId = entries[0].nodeId;
  clearWorldSkirmish(lib, firstId);
  assert.equal(lib.skirmishes.nodes[firstId], undefined);
  const restored = restoreLibrary(JSON.parse(JSON.stringify(lib)));
  assert.equal(isOverlandRouteKnown(restored, 'outskirts', 'ruins'), true);
});
