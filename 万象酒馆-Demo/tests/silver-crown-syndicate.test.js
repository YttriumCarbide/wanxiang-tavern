import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnemyArchiveEntries, filterEnemyArchiveBuckets } from '../src/archive-enemies.js';
import {
  SILVER_CROWN_SYNDICATE_ARCHIVE_DEFINITIONS,
  SILVER_CROWN_SYNDICATE_ARCHON,
  SILVER_CROWN_SYNDICATE_ENEMIES,
} from '../src/content/silver-crown-syndicate-adversaries.js';
import { DEFINITIONS, HEROES } from '../src/data.js';
import { advance, newBattle, preview } from '../src/engine.js';
import { validateGameData } from '../src/validation.js';

const forecastParty = Object.fromEntries(
  HEROES.map((hero) => [hero.id, { ...hero, hp: 100, buffs: {}, skills: [] }]),
);

test('Silver Crown entries belong to the archive while the six prepared enemies validate', () => {
  assert.deepEqual(validateGameData(), []);

  const archived = Object.keys(SILVER_CROWN_SYNDICATE_ARCHIVE_DEFINITIONS);
  assert.equal(archived.length, 7);
  assert(archived.every((id) => Object.hasOwn(DEFINITIONS, id)));
  const tiers = buildEnemyArchiveEntries(SILVER_CROWN_SYNDICATE_ARCHIVE_DEFINITIONS);
  assert.equal(tiers.minion.length, 4);
  assert.equal(tiers.elite.length, 2);
  assert.equal(tiers.boss.length, 0);
  assert.equal(tiers.overlord.length, 1);

  const archon = tiers.overlord[0];
  assert.equal(archon.id, SILVER_CROWN_SYNDICATE_ARCHON.id);
  assert.equal(archon.name, '秘藏馆主·白鸦');
  assert.equal(archon.subtitle, '乌羽秘会');
  assert.equal(archon.sources, '银冠城-白鸦展览馆');
  assert.deepEqual(archon.models, ['silver-crown-syndicate-archon.glb']);
  assert.equal(archon.entry.intents.length, 3);
  assert.equal(archon.entry.hp, 250);
  assert.equal(archon.entry.speed, 6);

  const unseen = filterEnemyArchiveBuckets(tiers);
  assert.equal(unseen.totalCount, 7);
  assert.equal(unseen.unlockedCount, 0);
  const seenMonsters = ['syndicateVelvetBlade', 'silverCrownSyndicateArchon'];
  const discovered = filterEnemyArchiveBuckets(tiers, { seenMonsters });
  assert.equal(discovered.unlockedCount, 2);
  assert.deepEqual(
    discovered.visibleBuckets.minion.map((entry) => entry.id),
    ['syndicateVelvetBlade'],
  );
  assert.deepEqual(
    discovered.visibleBuckets.overlord.map((entry) => entry.id),
    ['silverCrownSyndicateArchon'],
  );
  const full = filterEnemyArchiveBuckets(tiers, { seenMonsters, unlockAll: true });
  assert.equal(full.unlockedCount, 7);
  assert.deepEqual(seenMonsters, ['syndicateVelvetBlade', 'silverCrownSyndicateArchon']);
});

// Entries describe expected outcomes per targeted slot and per hit.
const expectedMoves = {
  syndicateVelvetBlade: [
    { slots: [1], hits: [8, 8], status: ['poison', 3] },
    { slots: [0, 2], hits: [10], status: ['bleed', 2] },
  ],
  syndicateRepeatingArbalest: [
    { slots: [1], hits: [5, 5, 5] },
    { slots: [0, 2], hits: [11], status: ['vulnerable', 1] },
  ],
  syndicateMintChemist: [
    { slots: [0, 1], hits: [11], status: ['vulnerable', 2] },
    { slots: [0, 1, 2], hits: [6], status: ['poison', 3] },
  ],
  syndicateVaultEnforcer: [
    { slots: [1], hits: [20], status: ['vulnerable', 2] },
    { slots: [1, 2], hits: [11], shield: 16 },
  ],
  syndicateBloodCroupier: [
    { slots: [0, 1, 2], hits: [12], status: ['bleed', 3] },
    { slots: [1], hits: [23], status: ['weak', 2] },
  ],
  syndicateGildedAutomaton: [
    { slots: [1], hits: [12, 12], status: ['vulnerable', 2] },
    { slots: [0, 2], hits: [14], shield: 20 },
  ],
};

for (const enemy of SILVER_CROWN_SYNDICATE_ENEMIES) {
  test(`Silver Crown combat resolves both ${enemy.id} intents at the authored targets`, () => {
    const plans = expectedMoves[enemy.id];
    assert.equal(enemy.intents.length, plans.length);
    for (const [moveIndex, { slots, hits, status, shield = 0 }] of plans.entries()) {
      const state = newBattle([enemy.id], forecastParty, { [enemy.id]: enemy });
      state.phase = 'plan';
      state.round = moveIndex + 1;
      const result = preview(state, []);
      assert(result.valid);

      const enemyEvents = result.events.filter(
        (entry) => entry.type === 'enemy' && entry.actor === enemy.id,
      );
      assert.equal(enemyEvents.length, 1);
      const [event] = enemyEvents;
      const targets = slots.map((slot) => state.formation[slot]);
      assert.equal(event.label, enemy.intents[moveIndex].name);
      assert.deepEqual(event.targets, targets);
      assert.equal(event.after.units[enemy.id].block, shield);
      assert.deepEqual(
        (event.statusApplications || []).map(({ actor, target, buff, value }) => [
          actor,
          target,
          buff,
          value,
        ]),
        status ? targets.map((target) => [enemy.id, target, ...status]) : [],
      );

      const settled = advance(result);
      const total = hits.reduce((sum, damage) => sum + damage, 0);
      for (const id of state.formation) {
        const target = targets.includes(id);
        const damage = target ? total : 0;
        const poison = target && status?.[0] === 'poison' ? status[1] : 0;
        const prefix = `${enemy.name} → ${forecastParty[id].name}：`;
        const damageLog = event.logs
          .filter((line) => line.startsWith(prefix))
          .map((line) => line.slice(prefix.length));
        assert.deepEqual(damageLog, target ? hits.map((value) => `${value}伤害`) : []);
        assert.equal(event.after.units[id].hp, state.units[id].hp - damage);
        assert.equal(event.after.units[id].block, 0);
        assert.equal(settled.units[id].hp, state.units[id].hp - damage - poison);
      }
    }
  });
}

test('the repeating arbalest resolves armor and shield absorption on each of its three hits', () => {
  const enemy = SILVER_CROWN_SYNDICATE_ENEMIES.find(
    (entry) => entry.id === 'syndicateRepeatingArbalest',
  );
  const state = newBattle([enemy.id], forecastParty, { [enemy.id]: enemy });
  state.phase = 'plan';
  state.round = 1;
  const target = state.formation[1];
  state.units[target].buffs.iron = 1;
  state.units[target].block = 6;

  const result = preview(state, []);
  assert(result.valid);
  const event = result.events.find((entry) => entry.type === 'enemy' && entry.actor === enemy.id);
  const prefix = `${enemy.name} → ${forecastParty[target].name}：`;
  assert.deepEqual(
    event.logs.filter((line) => line.startsWith(prefix)).map((line) => line.slice(prefix.length)),
    ['0伤害，护盾抵挡4', '2伤害，护盾抵挡2', '4伤害'],
  );
  assert.equal(event.after.units[target].hp, 94);
  assert.equal(event.after.units[target].block, 0);
  assert.equal(advance(result).units[target].hp, 94);
});
