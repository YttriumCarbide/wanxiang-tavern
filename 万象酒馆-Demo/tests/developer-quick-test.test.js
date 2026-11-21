import test from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary } from '../src/ai/library.js';
import { REGIONS } from '../src/content/regions.js';
import { DEFINITIONS } from '../src/data.js';
import { restoreGenerationOptions, quickTestOverlordsEnabled } from '../src/generation-options.js';
import { quickTestOverlordMaps, quickTestOverlordPreview } from '../src/developer-quick-test.js';
import { explorationPreview, quickTestOverlordFrontier } from '../src/exploration.js';
import { newExpedition, currentEncounterSpec } from '../src/expedition.js';

const REQUIRED_MAPS = ['mill', 'ruins', 'black-market', 'graystone-quarry'];

function isOverlordBoss(bossId) {
  return Boolean(bossId && DEFINITIONS[bossId]?.overlord === true);
}

function authoredCandidate(region) {
  if (!region) return null;
  const nodes = Array.isArray(region.nodes) ? region.nodes : [];
  if (nodes.length) {
    return nodes.find((node) => node.overlord === true || isOverlordBoss(node.boss)) || null;
  }
  const hooks = Array.isArray(region.taskHooks) ? region.taskHooks : [];
  return hooks.find((hook) => hook.overlord === true || isOverlordBoss(hook.boss)) || null;
}

function clone(value) {
  return structuredClone(value);
}

function referenceForHook(route, hook, hookIndex) {
  const reference = {
    ...route.frontier[0],
    sequence: hookIndex,
    site: hookIndex,
    taskHookId: hook.id,
    levelOffset: hook.levelOffset,
  };
  delete reference.level;
  return reference;
}

test('restoreGenerationOptions unifies quick test overlord flags', () => {
  const defaults = restoreGenerationOptions(undefined);
  assert.equal(defaults.quickTestOverlords, false);
  assert.equal(defaults.quickTest, false);
  assert.equal(defaults.quickTestApep, false);

  const legacyQuick = restoreGenerationOptions({ quickTest: true });
  assert.equal(legacyQuick.quickTestOverlords, true);
  assert.equal(legacyQuick.quickTest, true);
  assert.equal(legacyQuick.quickTestApep, true);

  const legacyApep = restoreGenerationOptions({ quickTestApep: true });
  assert.equal(legacyApep.quickTestOverlords, true);
  assert.equal(legacyApep.quickTest, true);
  assert.equal(legacyApep.quickTestApep, true);

  const explicitOff = restoreGenerationOptions({
    quickTestOverlords: false,
    quickTest: true,
    quickTestApep: true,
  });
  assert.equal(explicitOff.quickTestOverlords, false);
  assert.equal(explicitOff.quickTest, false);
  assert.equal(explicitOff.quickTestApep, false);

  const explicitOn = restoreGenerationOptions({ quickTestOverlords: true });
  assert.equal(explicitOn.quickTestOverlords, true);
  assert.equal(explicitOn.quickTest, true);
  assert.equal(explicitOn.quickTestApep, true);

  const devOff = restoreGenerationOptions({ developerMode: false, quickTest: true });
  assert.equal(quickTestOverlordsEnabled(devOff), false);

  const devOn = restoreGenerationOptions({ developerMode: true, quickTest: true });
  assert.equal(quickTestOverlordsEnabled(devOn), true);

  const raw = { developerMode: true, quickTest: true };
  const before = clone(raw);
  quickTestOverlordsEnabled(raw);
  assert.deepEqual(raw, before);
});

test('quickTestOverlordMaps derives candidates from authored region data', () => {
  const maps = quickTestOverlordMaps();
  for (const map of REQUIRED_MAPS) {
    assert.ok(maps.includes(map), `expected ${map} to be a quick test overlord map`);
  }

  for (const map of Object.keys(REGIONS)) {
    const region = REGIONS[map];
    const nodes = Array.isArray(region.nodes) ? region.nodes : [];
    const hooks = Array.isArray(region.taskHooks) ? region.taskHooks : [];
    const source = nodes.length ? nodes : hooks;
    const expected = source.some((entry) => entry.overlord === true || isOverlordBoss(entry.boss));
    assert.equal(maps.includes(map), expected, `eligibility mismatch for ${map}`);
  }
});

test('quickTestOverlordPreview swaps authored overlord into the root for every map', () => {
  for (const map of quickTestOverlordMaps()) {
    const region = REGIONS[map];
    const candidate = authoredCandidate(region);
    assert.ok(candidate, `expected candidate for ${map}`);

    const library = newLibrary();
    const route = library.exploration[map];
    assert.ok(route, `expected stored route for ${map}`);
    const before = clone(route);

    const normal = explorationPreview(route, map, {
      developerMode: true,
      quickTestOverlords: false,
    });
    const quick = explorationPreview(route, map, {
      developerMode: true,
      quickTestOverlords: true,
    });

    const quickBoss = quick[0];
    assert.equal(quickBoss.quickTestBoss, true, `${map} first entry should be quick boss`);
    assert.equal(quickBoss.overlord, true, `${map} quick boss should be overlord`);
    assert.equal(quickBoss.locked, false, `${map} quick boss should be unlocked`);
    assert.equal(quickBoss.label, '1', `${map} quick boss label should be 1`);
    assert.equal(quickBoss.parentId, null, `${map} quick boss parent should be null`);
    assert.equal(quickBoss.boss, candidate.boss, `${map} quick boss should use candidate boss`);

    const nodes = Array.isArray(region.nodes) ? region.nodes : [];
    const hooks = Array.isArray(region.taskHooks) ? region.taskHooks : [];
    let reference;
    if (nodes.length) {
      const normalEntry = normal.find((entry) => entry.nodeId === candidate.id);
      assert.ok(normalEntry, `${map} normal preview should contain candidate node`);
      reference = normalEntry;
    } else {
      const hookIndex = hooks.indexOf(candidate);
      assert.ok(hookIndex >= 0, `${map} candidate hook should be present`);
      reference = referenceForHook(route, candidate, hookIndex);
    }

    const expedition = newExpedition(quickBoss.boss, {}, quickBoss);
    assert.ok(expedition, `${map} newExpedition should accept quick boss`);
    assert.equal(expedition.index, 4, `${map} quick expedition should start at final battle`);
    const quickSpec = currentEncounterSpec(expedition, 4);
    const referenceSpec = currentEncounterSpec({ exploration: reference, index: 4 }, 4);
    assert.equal(
      quickSpec.level,
      referenceSpec.level,
      `${map} quick boss level should match reference`,
    );

    if (map === 'black-market' || map === 'graystone-quarry') {
      assert.equal(quickSpec.level, 10, `${map} quick boss level should be 10`);
    }

    const encounter = currentEncounterSpec(expedition, 4);
    assert.ok(
      encounter.enemyIds.includes(candidate.boss),
      `${map} final encounter should include candidate boss`,
    );

    const frontier = quickTestOverlordFrontier(route, map, {
      developerMode: true,
      quickTestOverlords: true,
    });
    assert.equal(frontier[0].id, quickBoss.id, `${map} frontier should lead with quick boss`);
    assert.ok(
      !frontier.some((entry) => entry.quickTestDisplaced),
      `${map} frontier should not include displaced root`,
    );

    assert.deepEqual(route, before, `${map} route should not be mutated`);

    const quickAgain = explorationPreview(route, map, {
      developerMode: true,
      quickTestOverlords: true,
    });
    assert.deepEqual(quickAgain, quick, `${map} quick preview should be deterministic`);

    const offAgain = explorationPreview(route, map, {
      developerMode: true,
      quickTestOverlords: false,
    });
    assert.deepEqual(offAgain, normal, `${map} off preview should equal normal`);

    const quickIds = new Set(quick.map((entry) => entry.id));
    for (const entry of quick) {
      if (entry.parentId !== null && entry.parentId !== undefined) {
        assert.ok(
          quickIds.has(entry.parentId),
          `${map} parentId ${entry.parentId} should resolve within quick preview`,
        );
      }
    }

    const normalById = new Map(normal.map((entry) => [entry.id, entry]));
    for (const entry of quick) {
      if (entry === quickBoss || entry.quickTestDisplaced) continue;
      const original = normalById.get(entry.id);
      if (!original) continue;
      assert.equal(entry.boss, original.boss, `${map} boss should be preserved`);
      assert.equal(entry.sequence, original.sequence, `${map} sequence should be preserved`);
      assert.equal(entry.nodeId, original.nodeId, `${map} nodeId should be preserved`);
    }
  }
});

test('quickTestOverlordPreview is a no-op when disabled or ineligible', () => {
  const entries = [
    { id: 'seed-a', map: 'mill', sequence: 0, seed: 1 },
    { id: 'seed-b', map: 'mill', sequence: 1, seed: 2 },
  ];

  assert.equal(
    quickTestOverlordPreview(entries, 'mill', { developerMode: false, quickTestOverlords: true }),
    entries,
  );
  assert.equal(
    quickTestOverlordPreview(entries, 'mill', {
      developerMode: true,
      quickTestOverlords: false,
      quickTest: true,
    }),
    entries,
  );
  assert.equal(
    quickTestOverlordPreview(entries, 'unknown-map', {
      developerMode: true,
      quickTestOverlords: true,
    }),
    entries,
  );

  const worldEntries = [{ id: 'world-a', map: 'mill', sequence: 0, seed: 1, world: { id: 'w1' } }];
  assert.equal(
    quickTestOverlordPreview(worldEntries, 'mill', {
      developerMode: true,
      quickTestOverlords: true,
    }),
    worldEntries,
  );

  const noNodes = [{ id: 'bare', map: 'mill', sequence: 0, seed: 1 }];
  assert.equal(
    quickTestOverlordPreview(noNodes, 'mill', {
      developerMode: true,
      quickTestOverlords: true,
    }),
    noNodes,
  );
});
