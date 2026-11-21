import assert from 'node:assert/strict';
import test from 'node:test';
import { assignParty } from '../src/campaign.js';
import { WORKSHOP_CATALOG } from '../src/content/workshop-catalog.js';
import { HEROES } from '../src/data.js';
import { calibrateDisplayCheck, evaluate2d6Check, roll2d6 } from '../src/dc.js';
import { effectiveBuff, newBattle, preview } from '../src/engine.js';
import { summonSource } from '../src/summoning.js';
import { normalizeRules } from '../src/triggers.js';
import { firstActionSide } from '../src/turn-flow.js';
import { validateWorkshopCatalog } from '../src/workshop/catalog.js';
import { advanceWorkshop, restoreWorkshop, workshopParallel } from '../src/workshop/engine.js';

test('a continuous effect honors both its recipient and its own condition', () => {
  const owner = {
    ...HEROES[0],
    equipment: [
      {
        id: 'audit-aura',
        rules: normalizeRules([
          {
            mode: 'continuous',
            target: 'allAllies',
            effects: [
              {
                type: 'buff',
                buff: 'iron',
                target: 'self',
                when: { type: 'hasShield' },
                value: 2,
              },
            ],
          },
        ]),
      },
    ],
  };
  const state = newBattle(['sprout'], { [owner.id]: owner });
  assert.equal(effectiveBuff(state, owner.id, 'iron'), 0);
  state.units[owner.id].block = 1;
  assert.equal(effectiveBuff(state, owner.id, 'iron'), 2);
  assert.equal(effectiveBuff(state, HEROES[1].id, 'iron'), 0);
});

test('a battle-start heal cannot recursively enter a healed rule or take a turn', () => {
  const heal = { type: 'heal', value: 1 };
  const rules = normalizeRules(
    ['battleStart', 'healed'].map((event) => ({
      mode: 'event',
      event,
      limit: 50,
      target: 'self',
      effects: [heal],
    })),
  );
  const owner = { ...HEROES[0], equipment: [{ id: 'audit-heal', name: 'test', rules }] };
  const state = newBattle(['sprout'], { [owner.id]: owner });
  const unit = state.units[owner.id];
  unit.hp -= 5;
  const result = preview(state, []);
  assert.equal(result.final.units[owner.id].hp, unit.hp + 1);
  assert.deepEqual(Object.values(result.final.procUses), [1]);
  assert.equal(result.events[0].type, 'trigger');
  assert.equal(firstActionSide(result.events), 'player');
});

test('invalid dice and modifiers never leak a nonnumeric or impossible d6 result', () => {
  assert.throws(() => roll2d6(() => NaN), RangeError);
  assert.throws(() => roll2d6(() => 1), RangeError);
  for (const dice of [[99, 1], [NaN, 6], ['6', '6'], Array(2)]) {
    const check = evaluate2d6Check({ dice, mod: Infinity, bonus: NaN });
    assert.deepEqual(check.dice, [3, 4]);
    assert.equal(check.total, 7);
    assert.equal(check.outcome, 'fail');
  }
  const display = calibrateDisplayCheck({ dice: [99, 1], mod: NaN, outcome: 'success' });
  assert.equal(display.outcome, 'success');
  assert.ok(display.dice.every((value) => Number.isInteger(value) && value >= 1 && value <= 6));
});

test('summoning rejects an out-of-range draw and cannot expand formation to a seventh slot', () => {
  assert.throws(() => summonSource('chaos', 1));
  const library = { characters: [{ id: 'member' }], party: Array(6).fill(null) };
  assert.throws(() => assignParty(library, 6, 'member'));
  assert.deepEqual(library.party, Array(6).fill(null));
});

test('restoring a workshop during a clock rollback does not replay paid production time', () => {
  const catalog = validateWorkshopCatalog(WORKSHOP_CATALOG);
  const state = restoreWorkshop(
    { version: 1, at: 0, stations: { collector: { count: 1, active: 1 } } },
    catalog,
    0,
  );
  const paid = advanceWorkshop(state, catalog, 6000).state;
  assert.equal(paid.items.stardust, 2);
  const restored = restoreWorkshop(JSON.parse(JSON.stringify(paid)), catalog, 3000);
  assert.equal(restored.at, paid.at);
  const caughtUp = advanceWorkshop(restored, catalog, 6000);
  assert.equal(caughtUp.state.items.stardust, 2);
  assert.deepEqual(caughtUp.events, []);
});

test('the workshop catalog rejects fractional caps that permit an extra build then truncate it', () => {
  const draft = structuredClone(WORKSHOP_CATALOG);
  draft.stations.find(({ id }) => id === 'collector').max = 1.5;
  assert.throws(() => validateWorkshopCatalog(draft), /设施上限/);
});

test('a validated exponential production bonus saturates instead of shutting down its station', () => {
  const draft = structuredClone(WORKSHOP_CATALOG);
  const [tech] = draft.research;
  tech.costs = Array.from({ length: 100 }, () => ({}));
  tech.effects = [
    {
      type: 'station',
      id: 'collector',
      speed: { mode: 'none', growth: 0, levels: {} },
      parallel: { mode: 'pow', growth: 10000, levels: {} },
    },
  ];
  const catalog = validateWorkshopCatalog(draft);
  const state = restoreWorkshop(
    {
      version: 1,
      research: { [tech.id]: 100 },
      stations: { collector: { count: 1, active: 1 } },
    },
    catalog,
  );
  const station = catalog.stations.find(({ id }) => id === 'collector');
  assert.equal(workshopParallel(state, catalog, station, 'stardust'), 1e6);
  assert.equal(advanceWorkshop(state, catalog, 3000).state.items.stardust, 1e6);
});
