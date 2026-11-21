import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { DEFINITIONS } from '../src/data.js';
import { newBattle, newEncounter } from '../src/engine.js';
import {
  SUPREME_EMBLEM_ID,
  DRAGON_EMBLEM_ID,
  BREAKER_EMBLEM_ID,
  OVERLOAD_EMBLEM_ID,
} from '../src/emblems.js';
import {
  grantMidBattleOverlordEmblem,
  grantVictoryOverlordEmblem,
  prepareBossEmblem,
  storyRingReward,
  OVERLORD_EMBLEM_UNLOCKS,
} from '../src/emblem-progression.js';
import { newCampaign } from '../src/campaign.js';
import { defaultProtagonist } from '../src/content/qingyuan.js';
import {
  newExploration,
  availableExplorations,
  completeExploration,
  explorationSpec,
  restoreExploration,
} from '../src/exploration.js';
import { validateGameData } from '../src/validation.js';
import { combatScale } from '../src/combat-scale.js';
import { leveledIntent } from '../src/enemy-growth.js';

const BOSS_EMBLEM_CASES = [
  { bossId: 'alchemicalPuppet', emblemId: BREAKER_EMBLEM_ID },
  { bossId: 'darkscaleWarlord', emblemId: DRAGON_EMBLEM_ID },
  { bossId: 'banditSyndicateKing', emblemId: SUPREME_EMBLEM_ID },
];

function makeLibrary() {
  return newCampaign(defaultProtagonist());
}

function makeExpedition(library) {
  return {
    partyIds: [...library.party],
    heroDefinitions: {},
    carried: { heroDefinitions: {} },
  };
}

test('OVERLORD_EMBLEM_UNLOCKS maps the three Overlord bosses to their emblems', () => {
  assert.equal(OVERLORD_EMBLEM_UNLOCKS.alchemicalPuppet, BREAKER_EMBLEM_ID);
  assert.equal(OVERLORD_EMBLEM_UNLOCKS.darkscaleWarlord, DRAGON_EMBLEM_ID);
  assert.equal(OVERLORD_EMBLEM_UNLOCKS.banditSyndicateKing, SUPREME_EMBLEM_ID);
});

for (const { bossId, emblemId } of BOSS_EMBLEM_CASES) {
  test(`mid-battle Overlord emblem for ${bossId} unlocks on round 2 and syncs rosters`, () => {
    const library = makeLibrary();
    const expedition = makeExpedition(library);

    const battle = newBattle([bossId]);
    battle.phase = 'plan';
    battle.round = 1;

    const roundOne = grantMidBattleOverlordEmblem(library, battle, expedition, () => 0);
    assert.equal(roundOne, null);
    assert.equal(library.emblems.includes(emblemId), false);

    battle.round = 2;
    const arrival = grantMidBattleOverlordEmblem(library, battle, expedition, () => 0);
    assert.ok(arrival);
    assert.equal(arrival.id, emblemId);
    assert.equal(arrival.midBattle, true);
    assert.ok(arrival.recipient);
    assert.ok(arrival.recipient.actor);

    const actor = arrival.recipient.actor;
    assert.equal(battle.units[actor].emblemCharge, 6);

    assert.equal(battle.heroDefinitions[actor].emblemId, emblemId);
    assert.equal(expedition.heroDefinitions[actor].emblemId, emblemId);
    assert.equal(expedition.carried.heroDefinitions[actor].emblemId, emblemId);

    const repeat = grantMidBattleOverlordEmblem(library, battle, expedition, () => 0);
    assert.equal(repeat, null);
  });

  test(`mid-battle Overlord emblem for ${bossId} triggers on bossStage 2 in round 1`, () => {
    const library = makeLibrary();
    const expedition = makeExpedition(library);

    const battle = newBattle([bossId]);
    battle.phase = 'plan';
    battle.round = 1;
    battle.units[bossId].bossStage = 2;

    const arrival = grantMidBattleOverlordEmblem(library, battle, expedition, () => 0);
    assert.ok(arrival);
    assert.equal(arrival.id, emblemId);
    assert.equal(arrival.midBattle, true);
  });

  test(`victory safety-net Overlord emblem for ${bossId} grants once`, () => {
    const library = makeLibrary();
    const expedition = makeExpedition(library);

    const battle = newBattle([bossId]);
    battle.phase = 'victory';
    battle.round = 1;

    const arrival = grantVictoryOverlordEmblem(library, battle, expedition, () => 0);
    assert.ok(arrival);
    assert.equal(arrival.id, emblemId);
    assert.equal(arrival.midBattle, false);

    const repeat = grantVictoryOverlordEmblem(library, battle, expedition, () => 0);
    assert.equal(repeat, null);
  });
}

test('storyRingReward returns null for ruins sequence 5', () => {
  assert.equal(storyRingReward({ map: 'ruins', sequence: 5 }), null);
});

test('ruins sequence 2 still yields Overload', () => {
  const library = makeLibrary();
  const expedition = makeExpedition(library);
  expedition.index = 4;
  expedition.exploration = { map: 'ruins', sequence: 2 };

  const granted = prepareBossEmblem(library, expedition, () => 0);
  assert.equal(granted, true);
  assert.equal(library.emblems.includes(SUPREME_EMBLEM_ID), false);
  assert.equal(library.emblems.includes(OVERLOAD_EMBLEM_ID), true);
});

test('prepareBossEmblem refuses ruins sequence 5 and never grants Dragon', () => {
  const library = makeLibrary();
  const expedition = makeExpedition(library);
  expedition.index = 4;
  expedition.exploration = { map: 'ruins', sequence: 5 };

  const granted = prepareBossEmblem(library, expedition, () => 0);
  assert.equal(granted, false);
  assert.equal(library.emblems.includes(DRAGON_EMBLEM_ID), false);
});

test('black market exploration advances through authored bosses and ends at level 10', () => {
  let routes = newExploration(731);
  const expected = [
    ['banditCutthroat', 7],
    ['banditAlchemist', 8],
    ['banditBruiser', 9],
    ['banditSyndicateKing', 10],
  ];

  for (let i = 0; i < expected.length; i++) {
    const [id, level] = expected[i];
    const route = routes['black-market'];
    const entry = availableExplorations(route).find((node) => !node.branch);
    const spec = explorationSpec(entry, 4);
    assert.equal(spec.level, level);
    assert.ok(spec.enemyIds.includes(id));

    if (i === expected.length - 1) {
      assert.deepEqual(spec.enemyIds, [id]);
      const unit = newEncounter(spec).units[id];
      assert.equal(unit.level, 10);
      assert.equal(unit.maxHp, 565);
    } else {
      completeExploration(routes, entry);
    }

    if (i === 1) {
      routes = restoreExploration(routes);
    }
  }

  const finalRoute = routes['black-market'];
  assert.ok(availableExplorations(finalRoute).some((node) => node.branch));
});

test('graystone quarry exploration advances through authored bosses to level 10', () => {
  const routes = newExploration(731);
  const expected = ['erosionHound', 'erosionJuggernaut', 'erosionRiftTyrant', 'darkscaleWarlord'];

  for (let i = 0; i < expected.length; i++) {
    const id = expected[i];
    const entry = availableExplorations(routes['graystone-quarry'])[0];
    const spec = explorationSpec(entry, 4);
    assert.ok(spec.enemyIds.includes(id));

    if (i === expected.length - 1) {
      assert.equal(spec.level, 10);
      assert.deepEqual(spec.enemyIds, [id]);
      const unit = newEncounter(spec).units.darkscaleWarlord;
      assert.equal(unit.level, 10);
      assert.equal(unit.maxHp, 565);
    } else {
      completeExploration(routes, entry);
    }
  }
});

test('riftDarkDust definition and scaled encounter stats', () => {
  const def = DEFINITIONS.riftDarkDust;
  assert.ok(def);
  assert.equal(def.hp, 32);
  assert.equal(def.speed, 5);
  assert.equal(def.intents[0].effects[0].value, 7);

  const scale = combatScale(10);
  assert.equal(Math.round(32 * scale), 58);

  const leveled = leveledIntent(def.intents[0], 0, scale);
  assert.equal(leveled.effects[0].value, 13);
});

test('riftDarkDust reuses existing asset files', async () => {
  const def = DEFINITIONS.riftDarkDust;
  const model = await readFile(new URL('../assets/' + def.model, import.meta.url));
  assert.ok(model.length > 0);
  const portrait = await readFile(
    new URL('../assets/portraits/' + def.portrait + '.svg', import.meta.url),
  );
  assert.ok(portrait.length > 0);
});

test('game data validates cleanly', () => {
  assert.deepEqual(validateGameData(), []);
});
