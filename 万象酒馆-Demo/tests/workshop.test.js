import test from 'node:test';
import assert from 'node:assert/strict';
import { WORKSHOP_CATALOG as reference } from '../src/content/workshop-catalog.js';
import {
  validateWorkshopCatalog,
  workshopReferences,
  loadWorkshopCatalog,
} from '../src/workshop/catalog.js';
import {
  restoreWorkshop,
  workshopAction,
  advanceWorkshop,
  workshopVisible,
  workshopBuildCost,
  workshopRate,
  workshopParallel,
  modifyWorkshop,
} from '../src/workshop/engine.js';
import { restoreLibrary, newLibrary } from '../src/ai/library.js';
import { resourceFields } from '../tools/import-workshop-reference.mjs';

const catalog = validateWorkshopCatalog(reference);
const start = () => restoreWorkshop(null, catalog, 0);
function act(state, action) {
  const result = workshopAction(state, catalog, action);
  assert.equal(result.error, undefined, JSON.stringify(action) + ': ' + result.error);
  return result.state;
}
function funded() {
  return restoreWorkshop(
    {
      version: 1,
      at: 0,
      items: Object.fromEntries(catalog.items.map((i) => [i.id, 100000])),
      coins: 100000,
      research: {},
      stations: {},
    },
    catalog,
    0,
  );
}
test('full registered graph is renamed and starts with only three basic resources', () => {
  assert.deepEqual(
    [catalog.items.length, catalog.stations.length, catalog.research.length, catalog.core.length],
    [43, 25, 26, 5],
  );
  assert.equal(/洞府|灵石|修仙|emoji|\.png|\.tres/.test(JSON.stringify(catalog)), false);
  const state = start();
  assert.deepEqual(
    catalog.items.filter((i) => workshopVisible(state, catalog, 'item', i)).map((i) => i.id),
    ['stardust', 'spring-water', 'barley'],
  );
  assert.deepEqual(state.stations, {});
  assert.equal(state.coins, 0);
  assert.equal(
    catalog.research.some((t) => workshopVisible(state, catalog, 'research', t)),
    false,
  );
});
test('manual work survives reload, pays only once and never automatically repeats', () => {
  let state = act(start(), { type: 'craft', id: 'stardust' });
  const before = structuredClone(state);
  assert.match(workshopAction(state, catalog, { type: 'craft', id: 'stardust' }).error, /正在/);
  assert.deepEqual(state, before);
  state = advanceWorkshop(state, catalog, 1500).state;
  assert.equal(state.items.stardust || 0, 0);
  state = restoreWorkshop(JSON.parse(JSON.stringify(state)), catalog, 1500);
  const result = advanceWorkshop(state, catalog, 3000);
  assert.deepEqual(result.events, [{ type: 'produce', id: 'stardust', amount: 1 }]);
  assert.equal(advanceWorkshop(result.state, catalog, 30000).state.items.stardust, 1);
  state = funded();
  const recipe = catalog.items.find((i) => i.id === 'fitting'),
    previous = structuredClone(state.items);
  state = act(state, { type: 'craft', id: 'fitting' });
  for (const [id, n] of Object.entries(recipe.inputs))
    assert.equal(state.items[id], previous[id] - n);
  const paid = structuredClone(state.items);
  state = advanceWorkshop(state, catalog, 5000).state;
  for (const id of Object.keys(recipe.inputs)) assert.equal(state.items[id], paid[id]);
  assert.equal(state.items.fitting, 100001);
  const poor = restoreWorkshop({ ...state, items: {}, manual: {} }, catalog, 5000);
  const failed = workshopAction(poor, catalog, { type: 'craft', id: 'fitting' });
  assert.match(failed.error, /不足/);
  assert.equal(failed.state, poor);
});
test('gathering and delivery bootstrap first collector without main game currency', () => {
  let state = start();
  for (let n = 1; n <= 8; n++) {
    state = act(state, { type: 'craft', id: 'stardust' });
    state = advanceWorkshop(state, catalog, n * 3000).state;
  }
  state = act(state, { type: 'sell', id: 'stardust', amount: 3 });
  state = act(state, { type: 'build', id: 'collector' });
  assert.equal(state.coins, 0);
  assert.equal(state.items.stardust, 0);
  assert.equal(state.stations.collector.active, 1);
  state = advanceWorkshop(state, catalog, 27000).state;
  assert.equal(state.items.stardust, 1);
  assert.equal('inventory' in state, false);
});
test('active zero pauses, retains progress and restores without free production', () => {
  let state = act(funded(), { type: 'build', id: 'collector' });
  state = advanceWorkshop(state, catalog, 1500).state;
  state = act(state, { type: 'active', id: 'collector', amount: 0 });
  const amount = state.items.stardust;
  state = advanceWorkshop(state, catalog, 9000).state;
  assert.equal(state.items.stardust, amount);
  assert.equal(state.stations.collector.jobs.stardust, 1.5);
  state = restoreWorkshop(state, catalog, 9000);
  state = act(state, { type: 'active', id: 'collector', amount: 100 });
  assert.equal(state.stations.collector.active, 1);
  assert.equal(advanceWorkshop(state, catalog, 10500).state.items.stardust, amount + 1);
});
test('automatic lanes pay at completion and settle only affordable units', () => {
  const source = funded();
  source.research['tech-12'] = 1;
  let state = act(source, { type: 'build', id: 'refinery' });
  state = act(state, { type: 'build', id: 'refinery' });
  for (const item of catalog.items) state.items[item.id] = 0;
  const lane = catalog.items.find((i) => i.id === 'hearth-brick');
  for (const [id, n] of Object.entries(lane.inputs)) state.items[id] = n;
  const before = structuredClone(state.items);
  state = advanceWorkshop(state, catalog, 34999).state;
  assert.deepEqual(state.items, before);
  state = advanceWorkshop(state, catalog, 35000).state;
  assert.equal(state.items['hearth-brick'], 1);
  assert.equal(state.items['filter-crystal'], 0);
  for (const id of Object.keys(lane.inputs)) assert.equal(state.items[id], 0);
  assert.equal(state.stations.refinery.jobs['hearth-brick'], 0);
  assert.equal(advanceWorkshop(state, catalog, 70000).state.items['hearth-brick'], 1);
});
test('frame partitioning and offline simulation produce identical inventories', () => {
  let state = funded();
  for (const id of ['collector', 'well', 'barley-bed', 'malthouse', 'fitting-bench'])
    state = act(state, { type: 'build', id });
  const offline = advanceWorkshop(state, catalog, 600000).state;
  for (let at = 137; at < 600000; at += 137) state = advanceWorkshop(state, catalog, at).state;
  state = advanceWorkshop(state, catalog, 600000).state;
  assert.deepEqual(state.items, offline.items);
  for (const id of Object.keys(state.stations))
    for (const item of Object.keys(state.stations[id].jobs))
      assert(Math.abs(state.stations[id].jobs[item] - offline.stations[id].jobs[item]) < 1e-6);
});
test('offline cap, same timestamp and rollback cannot duplicate production', () => {
  let state = act(funded(), { type: 'build', id: 'collector' });
  const initial = state.items.stardust;
  state = advanceWorkshop(state, catalog, 24 * 3600000).state;
  assert.equal(state.items.stardust - initial, 9600);
  assert.equal(advanceWorkshop(state, catalog, state.at).events.length, 0);
  assert.equal(advanceWorkshop(state, catalog, 0).events.length, 0);
});
test('large offline work is chunked without losing any remaining production time', () => {
  const custom = structuredClone(catalog);
  custom.items[0].seconds = 0.5;
  let state = restoreWorkshop(
    { version: 1, at: 0, stations: { collector: { count: 1, active: 1, jobs: {} } } },
    custom,
    0,
  );
  const now = 86400000;
  let result = advanceWorkshop(state, custom, now);
  assert(result.pendingSeconds > 0);
  for (let pass = 0; pass < 5 && result.pendingSeconds > 0; pass++)
    result = advanceWorkshop(result.state, custom, now);
  state = result.state;
  assert.equal(result.pendingSeconds, 0);
  assert.equal(state.at, now);
  assert.equal(state.items.stardust, 57600);
});
test('construction price growth, count cap, research prerequisites and cumulative bonuses', () => {
  const station = catalog.stations[0];
  let state = funded();
  state.stations[station.id] = { count: 1, active: 1, jobs: {} };
  assert.equal(workshopBuildCost(state, station).coins, 4);
  state.stations[station.id].count = 20;
  assert.equal(
    workshopBuildCost(state, station).coins,
    Math.ceil(station.price * (1 + 19 * 0.2) * 1.2),
  );
  state.stations[station.id].count = 100;
  assert.match(workshopAction(state, catalog, { type: 'build', id: station.id }).error, /上限/);
  state = funded();
  assert.match(workshopAction(state, catalog, { type: 'research', id: 'tech-05' }).error, /设施/);
  state = act(state, { type: 'build', id: 'fitting-bench' });
  state = act(state, { type: 'research', id: 'tech-05' });
  assert.equal(workshopRate(state, catalog, 'brewing-notes'), 1.2);
  assert.equal(
    workshopVisible(
      state,
      catalog,
      'station',
      catalog.stations.find((s) => s.id === 'brewing-desk'),
    ),
    true,
  );
  state = act(state, { type: 'core' });
  assert.equal(workshopRate(state, catalog, 'brewing-notes'), 1.32);
  assert.equal(workshopRate(state, catalog, 'brewing-notes', 'brewing-desk'), 1.3);
  state.research['tech-07'] = 3;
  state.stations['heart-bench'] = { count: 2, active: 2, jobs: {} };
  assert.equal(
    workshopParallel(
      state,
      catalog,
      catalog.stations.find((s) => s.id === 'heart-bench'),
      'clockwork-heart',
    ),
    8,
  );
});
test('all 43 materials, 25 facilities and 26 technologies are reachable from the basics', () => {
  let state = start();
  state.coins = 1e10;
  for (let pass = 0; pass < 60; pass++) {
    for (const item of catalog.items)
      if (
        workshopVisible(state, catalog, 'item', item) &&
        Object.keys(item.inputs).every((id) => state.known.includes(id))
      ) {
        state.items[item.id] = 1e8;
        if (!state.known.includes(item.id)) state.known.push(item.id);
      }
    state = modifyWorkshop(state, catalog, {}, 0);
    for (const station of catalog.stations)
      if (!state.stations[station.id]?.count) {
        const result = workshopAction(state, catalog, { type: 'build', id: station.id });
        if (!result.error) state = result.state;
      }
    for (const tech of catalog.research) {
      const result = workshopAction(state, catalog, { type: 'research', id: tech.id });
      if (!result.error) state = result.state;
    }
  }
  assert.equal(state.known.length, 43);
  assert.equal(Object.values(state.stations).filter((s) => s.count > 0).length, 25);
  for (const tech of catalog.research)
    assert.equal(state.research[tech.id], tech.costs.length, tech.name);
  for (let level = 0; level < 5; level++) state = act(state, { type: 'core' });
  assert.equal(state.core, 5);
});
test('discovery persists after spending but does not bypass research locks', () => {
  let state = funded();
  state.items = {};
  assert.equal(
    workshopVisible(
      state,
      catalog,
      'item',
      catalog.items.find((i) => i.id === 'fitting'),
    ),
    true,
  );
  assert.equal(
    workshopVisible(
      state,
      catalog,
      'item',
      catalog.items.find((i) => i.id === 'loose-spark'),
    ),
    false,
  );
  state = modifyWorkshop(state, catalog, { research: { 'tech-09': 1 } }, 0);
  assert.equal(
    workshopVisible(
      state,
      catalog,
      'item',
      catalog.items.find((i) => i.id === 'loose-spark'),
    ),
    true,
  );
});
test('corrupt state and custom material IDs survive library restore without leaking into combat', () => {
  const custom = structuredClone(catalog);
  custom.items.push({ ...structuredClone(custom.items[0]), id: 'custom-test', name: '自制物资' });
  const state = restoreWorkshop(
    {
      version: 1,
      at: 1e90,
      coins: Infinity,
      core: 999,
      known: {},
      discovered: {},
      items: { stardust: -10, 'custom-test': 7 },
      stations: { collector: { count: 10000, active: 10000, jobs: { stardust: NaN } } },
    },
    custom,
    5000,
  );
  assert.equal(state.at, 5000);
  assert.equal(state.items.stardust, 0);
  assert.equal(state.coins, 0);
  assert.equal(state.stations.collector.count, 100);
  const library = newLibrary();
  library.workshop = state;
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.equal(restoreWorkshop(restored.workshop, custom, 5000).items['custom-test'], 7);
  assert.equal(restoreWorkshop(restored.workshop, catalog, 5000).items['custom-test'], undefined);
});
test('invalid authoring data cannot replace the active catalog', () => {
  const mutations = [
    (c) => c.items.push(structuredClone(c.items[0])),
    (c) => (c.items[0].inputs = { missing: 1 }),
    (c) => (c.items[0].inputs = { stardust: 1 }),
    (c) => (c.items[0].seconds = 0),
    (c) => (c.stations[0].price = NaN),
    (c) => (c.research[0].effects[0].id = 'missing'),
    (c) => (c.research[0].requires = { 'tech-01': 1 }),
    (c) => (c.research[0].requires = { 'tech-02': 99 }),
    (c) => (c.research[0].unlocks = [{ type: 'item', id: 'stardust', level: 99 }]),
    (c) => (c.core[0].materials = { missing: 1 }),
  ];
  for (const mutate of mutations) {
    const c = structuredClone(catalog);
    mutate(c);
    assert.throws(() => validateWorkshopCatalog(c), /工坊配置/);
  }
  assert(workshopReferences(catalog, 'items', 'stardust').length > 0);
  assert.equal(loadWorkshopCatalog({ getItem: () => '{broken' }).items.length, 43);
});
test('reference reader recovers the first complete dictionary from duplicate source fragments', () => {
  const fields = resourceFields(
    '[resource]\nvisibility_research = {"tech":1}\n "tech": 1\n}\ninputs = {}\nduration_seconds = 3.0\n',
  );
  assert.deepEqual(fields.visibility_research, { tech: 1 });
  assert.deepEqual(fields.inputs, {});
});
