import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { restoreInventory, claimBattleRewards } from '../src/rewards.js';
import {
  refreshWorldSkirmishes,
  buildSkirmishEncounterPlan,
  settleSkirmishVictory,
} from '../src/skirmishes.js';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import {
  protagonistLevel,
  rollVoucherEquipmentSpec,
  EQUIPMENT_CRAFT_CATEGORIES,
  EQUIPMENT_QUALITIES,
} from '../src/equipment.js';
import { compileEquipmentDesign } from '../src/equipment-generation.js';
import {
  OVERLORD_TUTORIALS,
  detectOverlordTutorialTrigger,
  normalizeTutorialBossId,
} from '../src/content/overlord-tutorials.js';

test('restoreInventory clamps equipmentVouchers to 0..999999', () => {
  assert.equal(restoreInventory({ equipmentVouchers: -5 }).equipmentVouchers, 0);
  assert.equal(restoreInventory({ equipmentVouchers: 0 }).equipmentVouchers, 0);
  assert.equal(restoreInventory({ equipmentVouchers: 42 }).equipmentVouchers, 42);
  assert.equal(restoreInventory({ equipmentVouchers: 999999 }).equipmentVouchers, 999999);
  assert.equal(restoreInventory({ equipmentVouchers: 1000000 }).equipmentVouchers, 999999);
  assert.equal(restoreInventory({ equipmentVouchers: 12345678 }).equipmentVouchers, 999999);
  assert.equal(restoreInventory({}).equipmentVouchers, 0);
});

test('claimBattleRewards credits equipmentVouchers once idempotently', () => {
  const library = newLibrary();
  const before = library.inventory.equipmentVouchers || 0;
  const rewards = { summonContracts: 0, gold: 10, ether: 0, equipmentVouchers: 3 };

  assert.equal(claimBattleRewards(library, 'voucher-claim-1', rewards), true);
  const afterFirst = library.inventory.equipmentVouchers;
  assert.equal(afterFirst, before + 3);

  assert.equal(claimBattleRewards(library, 'voucher-claim-1', rewards), false);
  assert.equal(library.inventory.equipmentVouchers, afterFirst);
});

test('buildSkirmishEncounterPlan emits ether 0 and equipmentVouchers 1..3', () => {
  const lib = newLibrary();
  const nodes = Object.values(refreshWorldSkirmishes(lib, 'voucher-seed').nodes);
  assert.ok(nodes.length >= 1);
  for (let i = 0; i < 20; i += 1) {
    const node = { ...nodes[i % nodes.length], id: `sk-${i}` };
    const plan = buildSkirmishEncounterPlan(node, 5);
    assert.equal(plan.rewards.ether, 0);
    assert.ok(plan.rewards.equipmentVouchers >= 1);
    assert.ok(plan.rewards.equipmentVouchers <= 3);
  }
});

test('settleSkirmishVictory adds equipmentVouchers to library inventory and not ether', () => {
  const library = newLibrary();
  const node = Object.values(refreshWorldSkirmishes(library, 'settle-seed').nodes)[0];
  const beforeVouchers = library.inventory.equipmentVouchers || 0;
  const beforeEther = library.inventory.ether || 0;

  const plan = buildSkirmishEncounterPlan(node, 5);
  const outcome = settleSkirmishVictory(library, plan);
  assert.equal(outcome.claimed, true);
  assert.equal(
    library.inventory.equipmentVouchers,
    beforeVouchers + plan.rewards.equipmentVouchers,
  );
  assert.equal(library.inventory.ether, beforeEther);
});

test('protagonistLevel and rollVoucherEquipmentSpec produce bounded Gaussian levels', () => {
  const heroLevel = 15;
  const library = newLibrary();
  library.characters[0].growth = { ...(library.characters[0].growth || {}), level: heroLevel };
  assert.equal(protagonistLevel(library), heroLevel);

  const samples = 80;
  let withinTwo = 0;
  for (let i = 0; i < samples; i += 1) {
    const spec = rollVoucherEquipmentSpec(library, { seed: `voucher-${i}` });
    assert.ok(spec.bounds.minLevel <= spec.level);
    assert.ok(spec.level <= spec.bounds.maxLevel);
    if (Math.abs(spec.level - heroLevel) <= 2) {
      withinTwo += 1;
    }
    assert.ok(Object.hasOwn(EQUIPMENT_QUALITIES, spec.quality));
    assert.ok(EQUIPMENT_CRAFT_CATEGORIES.includes(spec.category));
    assert.notEqual(spec.category, 'gem');
    assert.equal(spec.voucherForged, true);
  }
  assert.ok(withinTwo >= 30, `expected gaussian peak around hero level, got ${withinTwo}`);
});

test('compileEquipmentDesign rejects placeholder names for voucher-forged designs', () => {
  const library = newLibrary();
  const baseSpec = rollVoucherEquipmentSpec(library, { seed: 'ph-test' });

  for (const name of ['', '   ', '未命名长枪', '待命名胚胎']) {
    assert.throws(
      () =>
        compileEquipmentDesign(
          {
            id: baseSpec.id,
            name,
            description: '锻造胚胎',
            design: { statFocus: ['attack'], rules: [] },
          },
          baseSpec,
        ),
      /正式名称/,
    );
  }
});

test('compileEquipmentDesign accepts formal name and keeps source category', () => {
  const library = newLibrary();
  const baseSpec = rollVoucherEquipmentSpec(library, { seed: 'formal-test' });

  const compiled = compileEquipmentDesign(
    {
      id: baseSpec.id,
      name: '星铁长枪',
      category: 'gem',
      description: '锻于星海炉心的凛冽长兵。',
      design: { statFocus: ['hp'], rules: [] },
    },
    baseSpec,
  );
  assert.equal(compiled.name, '星铁长枪');
  assert.equal(compiled.category, baseSpec.category);
  assert.notEqual(compiled.category, 'gem');
  assert.equal(compiled.sourceName, '装备兑换券凝聚');
});

test('all 7 overlord tutorials provide the fields rendered by the battle dialog', async () => {
  const bossIds = [
    'apepLamb',
    'moonEye',
    'ares',
    'radiantWyvern',
    'alchemicalPuppet',
    'darkscaleWarlord',
    'banditSyndicateKing',
  ];

  for (const bossId of bossIds) {
    const tutorial = OVERLORD_TUTORIALS[bossId];
    assert.ok(tutorial, `missing tutorial for ${bossId}`);
    assert.equal(tutorial.id, bossId);
    for (const field of ['bossName', 'rankLabel', 'headline', 'intro', 'keyTakeaway'])
      assert.equal(typeof tutorial[field], 'string', `${bossId}: missing ${field}`);
    for (const field of ['bossName', 'rankLabel', 'headline', 'intro', 'keyTakeaway'])
      assert.ok(tutorial[field].trim().length > 0, `${bossId}: empty ${field}`);
    assert.match(tutorial.portrait, /^\.\/assets\/portraits\/[\w-]+\.svg$/);
    const portrait = await readFile(
      new URL('../' + tutorial.portrait.slice(2), import.meta.url),
      'utf8',
    );
    assert.match(portrait, /<svg\b/);
    assert.match(tutorial.diagramSvg, /<svg\b/);
    assert.ok(Array.isArray(tutorial.mechanics));
    assert.ok(tutorial.mechanics.length >= 1);
    for (const mechanic of tutorial.mechanics) {
      for (const field of ['tag', 'title', 'summary', 'counter'])
        assert.equal(typeof mechanic[field], 'string', `${bossId}: mechanic missing ${field}`);
      for (const field of ['tag', 'title', 'summary', 'counter'])
        assert.ok(mechanic[field].trim().length > 0, `${bossId}: empty mechanic ${field}`);
    }
  }
});

test('normalizeTutorialBossId maps moonCrown and moonRoot to moonEye', () => {
  assert.equal(normalizeTutorialBossId('moonCrown'), 'moonEye');
  assert.equal(normalizeTutorialBossId('moonRoot'), 'moonEye');
  assert.equal(normalizeTutorialBossId('moonEye'), 'moonEye');
});

test('detectOverlordTutorialTrigger returns boss id on boss act or sinkingPlague', () => {
  const bossAct = detectOverlordTutorialTrigger(
    { events: [{ type: 'enemy', actor: 'ares' }] },
    { phase: 'plan', enemyIds: ['ares'] },
  );
  assert.equal(bossAct, 'ares');

  const moonPartAct = detectOverlordTutorialTrigger(
    { events: [{ type: 'enemy', actor: 'moonRoot' }] },
    { phase: 'plan', enemyIds: ['moonCrown', 'moonEye', 'moonRoot'] },
  );
  assert.equal(moonPartAct, 'moonEye');

  const plague = detectOverlordTutorialTrigger(
    { events: [{ type: 'sinkingPlague', actor: 'apepLamb' }] },
    { phase: 'plan', enemyIds: ['apepLamb'], sinkingPlague: { source: 'apepLamb' } },
  );
  assert.equal(plague, 'apepLamb');
});

test('detectOverlordTutorialTrigger returns null on victory, defeat, or no trigger', () => {
  assert.equal(
    detectOverlordTutorialTrigger(
      { events: [{ type: 'enemy', actor: 'ares' }] },
      { phase: 'victory', enemyIds: ['ares'] },
    ),
    null,
  );
  assert.equal(
    detectOverlordTutorialTrigger(
      { events: [{ type: 'enemy', actor: 'ares' }] },
      { phase: 'defeat', enemyIds: ['ares'] },
    ),
    null,
  );
  assert.equal(
    detectOverlordTutorialTrigger({ events: [] }, { phase: 'plan', enemyIds: ['ares'] }),
    null,
  );
  assert.equal(detectOverlordTutorialTrigger(null, null), null);
});

test('restoreLibrary persists seenOverlordTutorials arrays cleanly', () => {
  const library = newLibrary();
  library.seenOverlordTutorials = ['ares', 'moonEye'];

  const restored = restoreLibrary(library);
  assert.deepEqual(restored.seenOverlordTutorials, ['ares', 'moonEye']);

  const empty = restoreLibrary({});
  assert.ok(Array.isArray(empty.seenOverlordTutorials));
  assert.deepEqual(empty.seenOverlordTutorials, []);
});
