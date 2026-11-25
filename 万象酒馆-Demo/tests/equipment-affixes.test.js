import test from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary } from '../src/ai/library.js';
import {
  normalizeEquipment,
  buyEquipment,
  equip,
  equippedDefinitions,
  addEquipmentAffix,
  refreshEquipmentAffixes,
  smithEquipmentAffix,
  equipmentAffixCost,
  equipmentAffixProgress,
  equipmentInstanceView,
  reforgeEquipment,
  temperEquipment,
  ascendEquipment,
  blacksmithSaleGold,
  sellEquipmentToBlacksmith,
  dismantleEquipment,
  dismantleEther,
  restoreEquipment,
  grantGem,
} from '../src/equipment.js';
import { applyEquipment } from '../src/equipment-combat.js';
import { newBattle, preview } from '../src/engine.js';
import { HEROES } from '../src/data.js';
import { equipmentDescription } from '../src/skill-text.js';

function template(library, id, category = 'weapon', level = 1, price = 10) {
  const entry = normalizeEquipment(
    {
      name: id,
      description: '',
      category,
      stats: { hp: 1 },
      rules: [],
      level,
      quality: 'common',
    },
    { id, name: id, value: price, category, level, quality: 'common' },
  );
  library.equipment.catalog.push(entry);
  return entry;
}

function prepared() {
  const library = newLibrary();
  library.inventory.ether = 10000;
  template(library, 't-weapon', 'weapon');
  template(library, 't-armor', 'armor');
  template(library, 't-pendant', 'pendant');
  buyEquipment(library, 't-weapon', 'owned-w', { seed: 1 });
  buyEquipment(library, 't-armor', 'owned-a', { seed: 1 });
  buyEquipment(library, 't-pendant', 'owned-p', { seed: 1 });
  return library;
}

test('new equipment has no shared affix until ether is spent; all instances share the blueprint affix', () => {
  const library = prepared();
  buyEquipment(library, 't-weapon', 'w2', { seed: 1 });
  assert.deepEqual(library.equipment.affixesByTemplate, {});

  const cost = equipmentAffixCost(library.equipment.catalog[0]);
  const before = library.inventory.ether;
  addEquipmentAffix(library, 'owned-w', 'affix-guard', 5);
  assert.equal(library.inventory.ether, before - cost);
  assert.equal(library.equipment.affixesByTemplate['t-weapon'].id, 'affix-guard');

  equip(library, 'official-aegis', 0, 'owned-w');
  equip(library, 'official-lyria', 0, 'w2');
  const aegis = library.characters.find((member) => member.id === 'official-aegis');
  const lyria = library.characters.find((member) => member.id === 'official-lyria');
  const a = equippedDefinitions(library, aegis);
  const b = equippedDefinitions(library, lyria);
  assert.deepEqual(a[0].affixes, b[0].affixes);

  assert.deepEqual(Object.keys(library.equipment.affixesByTemplate), ['t-weapon']);
  assert.throws(() => addEquipmentAffix(library, 'owned-w', 'affix-guard', 5), /已有/);
});

test('affix thresholds aggregate quality points and each tier is compiled once', () => {
  const library = prepared();
  library.equipment.affixesByTemplate = {
    't-weapon': { id: 'affix-guard', quality: 'rare' },
    't-armor': { id: 'affix-guard', quality: 'rare' },
    't-pendant': { id: 'affix-focus', quality: 'common' },
  };
  equip(library, 'official-aegis', 0, 'owned-w');
  equip(library, 'official-aegis', 1, 'owned-a');
  equip(library, 'official-aegis', 2, 'owned-p');

  const aegis = library.characters.find((member) => member.id === 'official-aegis');
  const defs = equippedDefinitions(library, aegis);
  const progress = equipmentAffixProgress(defs);
  const guard = progress.find((family) => family.id === 'affix-guard');
  assert.equal(guard.points, 6);
  assert.ok(guard.thresholds.every((threshold) => threshold.unlocked));

  const battleStart = defs
    .flatMap((item) => item.rules || [])
    .filter((rule) => rule.event === 'battleStart');
  const damageTaken = defs
    .flatMap((item) => item.rules || [])
    .filter((rule) => rule.event === 'damageTaken');
  assert.equal(battleStart.length, 1);
  assert.equal(damageTaken.length, 1);

  const hero = HEROES[0];
  const rawOwnedHp = library.equipment.owned
    .filter((item) => ['owned-w', 'owned-a', 'owned-p'].includes(item.id))
    .reduce((sum, item) => sum + (item.stats?.hp || 0), 0);
  const applied = applyEquipment(hero, defs);
  assert.ok(applied.hp > hero.hp + rawOwnedHp);

  const combat = applyEquipment(hero, defs);
  const battle = newBattle(['sprout'], { aegis: combat });
  assert.equal(battle.units.aegis.block, 0);
  const result = preview(battle, []);
  assert.equal(result.final.units.aegis.block, 4);

  const snapshot = JSON.stringify(battle);
  library.equipment.affixesByTemplate['t-weapon'] = { id: 'affix-focus', quality: 'legendary' };
  const again = preview(battle, []);
  assert.deepEqual(again, result);
  assert.equal(JSON.stringify(battle), snapshot);
});

test('shared affixes and investment persist; invalid records are discarded', () => {
  const library = prepared();
  library.equipment.affixesByTemplate = {
    't-weapon': { id: 'affix-guard', quality: 'rare' },
    unknown: { id: 'affix-guard', quality: 'rare' },
    't-armor': { id: 'affix-guard', quality: 'bad-quality' },
  };
  const restored = restoreEquipment(JSON.parse(JSON.stringify(library.equipment)));
  assert.deepEqual(Object.keys(restored.affixesByTemplate), ['t-weapon']);

  library.equipment.owned[0].investedEther = 50;
  const restored2 = restoreEquipment(JSON.parse(JSON.stringify(library.equipment)));
  assert.equal(restored2.owned[0].investedEther, 50);
  assert.equal(restored2.affixesByTemplate['t-weapon'].id, 'affix-guard');

  const old = restoreEquipment({
    catalog: library.equipment.catalog,
    owned: library.equipment.owned,
  });
  assert.deepEqual(old.affixesByTemplate, {});
  const legacy = JSON.parse(JSON.stringify(library.equipment));
  delete legacy.owned[0].investedEther;
  legacy.owned[1].investedEther = 0;
  const migrated = restoreEquipment(legacy);
  assert.equal(migrated.owned[0].investedEther, library.equipment.catalog[0].price);
  assert.equal(migrated.owned[1].investedEther, 0, 'explicit free grants remain free');
});

test('affix refresh rejects missing affix or insufficient ether without mutation and includes gems', () => {
  const library = prepared();
  const before = JSON.stringify(library);
  assert.throws(() => refreshEquipmentAffixes(library, 'owned-w', 1), /尚无/);
  assert.equal(JSON.stringify(library), before);

  addEquipmentAffix(library, 'owned-w', 'affix-guard', 1);
  library.inventory.ether = 0;
  const before2 = JSON.stringify(library);
  assert.throws(() => refreshEquipmentAffixes(library, 'owned-w', 1), /以太不足/);
  assert.equal(JSON.stringify(library), before2);

  library.inventory.ether = 1000;
  grantGem(library, 'gem-valor-shard', 'owned-gem');
  addEquipmentAffix(library, 'owned-gem', 'affix-focus', 3);
  assert.equal(library.equipment.affixesByTemplate['gem-valor-shard'].id, 'affix-focus');
  const entry = refreshEquipmentAffixes(library, 'owned-w', 17);
  assert.ok(entry && entry.id);
  assert.deepEqual(library.equipment.affixesByTemplate['t-weapon'], entry);
});

test('blacksmith affixes a selected equipment instance with gold while sharing its blueprint effect', () => {
  const library = prepared();
  library.inventory.gold = 1000;
  buyEquipment(library, 't-weapon', 'owned-w-copy', { seed: 2 });
  const cost = equipmentAffixCost(library.equipment.catalog.find((item) => item.id === 't-weapon'));
  const ether = library.inventory.ether;

  smithEquipmentAffix(library, 'owned-w', { seed: 5 });
  assert.ok(library.equipment.affixesByTemplate['t-weapon']);
  assert.deepEqual(
    equipmentInstanceView(
      library.equipment.catalog.find((item) => item.id === 't-weapon'),
      library.equipment.owned.find((item) => item.id === 'owned-w-copy'),
      library.equipment.affixesByTemplate,
    ).affixes,
    [library.equipment.affixesByTemplate['t-weapon']],
  );
  assert.equal(library.inventory.gold, 1000 - cost);
  assert.equal(library.inventory.ether, ether, 'the forge currency is untouched');

  const previous = library.equipment.affixesByTemplate['t-weapon'];
  smithEquipmentAffix(library, 'owned-w-copy', { refresh: true, seed: 9 });
  assert.notDeepEqual(library.equipment.affixesByTemplate['t-weapon'], previous);
  assert.equal(library.inventory.gold, 1000 - cost * 2);
  assert.throws(() => smithEquipmentAffix(library, 'missing-gear'), /未持有/);
  library.inventory.gold = 0;
  const withoutGold = JSON.stringify(library);
  assert.throws(() => smithEquipmentAffix(library, 'owned-w', { refresh: true }), /金币不足/);
  assert.equal(JSON.stringify(library), withoutGold, 'an unaffordable refresh has no side effects');
});

test('dismantling cannot mint ether by repeating purchase and investment is partially recovered', () => {
  const library = newLibrary();
  library.inventory.ether = 1000;
  template(library, 'expensive-level', 'weapon', 99, 10);
  buyEquipment(library, 'expensive-level', 'x', { seed: 1 });
  const refund = dismantleEquipment(library, 'x');
  assert.equal(refund, 4);
  assert.equal(library.inventory.ether, 994);

  let previous = library.inventory.ether;
  for (let i = 0; i < 3; i += 1) {
    const id = `cycle-${i}`;
    buyEquipment(library, 'expensive-level', id, { seed: 1 });
    dismantleEquipment(library, id);
    assert.ok(library.inventory.ether < previous);
    previous = library.inventory.ether;
  }

  const pure = dismantleEther(
    library.equipment.catalog.find((item) => item.id === 'expensive-level'),
    { level: 99, quality: 'legendary', investedEther: 100 },
  );
  assert.equal(pure, 40, 'tracked investment includes purchase and upgrade payments');
});

test('failed materialization never consumes reforge, temper or ascend gold', () => {
  const library = prepared();
  library.inventory.gold = 1000;
  library.characters[0].growth = { ...library.characters[0].growth, level: 10 };

  const blueprint = library.equipment.catalog.find((item) => item.id === 't-weapon');
  blueprint.design = {
    statFocus: ['hp'],
    rules: [
      {
        mode: 'event',
        event: 'battleStart',
        target: 'self',
        conditions: [{ type: 'not-a-condition' }],
        effects: [{ type: 'shield', power: 'medium' }],
      },
    ],
  };
  const owned = library.equipment.owned.find((item) => item.id === 'owned-w');
  owned.quality = 'epic';
  blueprint.quality = 'epic';

  const operations = [
    () => reforgeEquipment(library, 'owned-w', 1),
    () => temperEquipment(library, 'owned-w', 2),
    () => ascendEquipment(library, 'owned-w', 1),
  ];
  for (const operation of operations) {
    const inventoryBefore = structuredClone(library.inventory);
    const ownedBefore = JSON.stringify(owned);
    assert.throws(operation, /条件/);
    assert.deepEqual(library.inventory, inventoryBefore);
    assert.equal(JSON.stringify(owned), ownedBefore);
  }
});

test('blacksmith sales settle once and preserve items when payment cannot fit', () => {
  const library = prepared();
  const weapon = library.equipment.catalog[0];
  const member = library.characters[0];
  const ether = library.inventory.ether;
  const price = blacksmithSaleGold(weapon);
  assert.equal(price, Math.floor(weapon.price * 0.6));
  equip(library, member.id, 0, 'owned-w');
  assert.throws(() => sellEquipmentToBlacksmith(library, 'owned-w'), /穿戴/);
  equip(library, member.id, 0, '');
  library.inventory.gold = 999999999 - price + 1;
  assert.throws(() => sellEquipmentToBlacksmith(library, 'owned-w'), /上限/);
  assert(library.equipment.owned.some((item) => item.id === 'owned-w'));
  library.inventory.gold--;
  assert.equal(sellEquipmentToBlacksmith(library, 'owned-w'), price);
  assert.equal(library.inventory.gold, 999999999);
  assert.equal(library.inventory.ether, ether);
  assert.throws(() => sellEquipmentToBlacksmith(library, 'owned-w'), /未持有/);
});

test('single-item views include shared affix stats and gem text without duplicating threshold passives', () => {
  const library = prepared();
  library.equipment.affixesByTemplate['t-weapon'] = { id: 'affix-guard', quality: 'rare' };
  const instance = library.equipment.owned.find((item) => item.id === 'owned-w');
  const raw = JSON.stringify(instance);
  const view = equipmentInstanceView(
    library.equipment.catalog[0],
    instance,
    library.equipment.affixesByTemplate,
  );
  assert.equal(view.stats.hp, instance.stats.hp + 6);
  assert.equal(view.rules.length, instance.rules.length);
  assert.equal(JSON.stringify(instance), raw);
  assert.equal(view.affixes[0].id, 'affix-guard');
  const description = equipmentDescription({
    dcBonus: { str: 1 },
    stats: { hp: 6 },
    rules: [
      {
        mode: 'event',
        event: 'battleStart',
        target: 'self',
        conditions: [],
        effects: [{ type: 'shield', value: 4 }],
        scope: 'battle',
        limit: 1,
      },
    ],
  });
  assert.match(description, /DC/);
  assert.match(description, /hp上限 \+6/);
  assert.match(description, /护盾/);
});
