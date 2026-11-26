import test from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';
import { cityForScene } from '../src/city-directory.js';
import { completeExploration } from '../src/exploration.js';
import {
  availableInvitationCities,
  invitationCityVenues,
  validateCityInvitationPlan,
} from '../src/invitation-location.js';

function completeCityDungeonNode(library, dungeonId, nodeId) {
  const route = library.exploration[dungeonId];
  const node = route?.frontier.find((entry) =>
    Number.isInteger(nodeId) ? entry.sequence === nodeId : entry.nodeId === nodeId,
  );
  assert.ok(node, `${dungeonId} exposes ${nodeId} as a playable frontier`);
  completeExploration(library.exploration, node);
  assert.ok(
    route.cleared.some(({ id }) => id === node.id),
    `${dungeonId} records the clear`,
  );
}

function starbellScenes(library) {
  return Object.fromEntries(
    invitationCityVenues(library, 'starbell').map(({ id, name }) => [id, name]),
  );
}

function scene(sceneId, title) {
  return {
    title,
    scene: sceneId,
    intro: `【环境】${title}的约见环境。【环境结束】\n【旁白】核心规则回归。`,
  };
}

test('each city keeps its own streets and facilities available for local invitations', () => {
  const library = newLibrary();
  library.daily.unlocks.silverCrownTavern = true;
  const streets = [
    ['starbell', 'city-center'],
    ['silver-crown', 'crown-arcade'],
    ['eternal', 'eternal-city'],
  ];
  for (const [city, street] of streets) {
    assert.deepEqual(availableInvitationCities(library, street), [city]);
    const venues = invitationCityVenues(library, city);
    assert.equal(venues.find(({ id }) => id === street)?.category, 'places');
    for (const [otherCity, otherStreet] of streets) {
      if (otherCity !== city) {
        assert(!venues.some(({ id }) => id === otherStreet), `${otherStreet} is outside ${city}`);
      }
    }
    for (const facility of ['blacksmith', 'market', 'guild']) {
      const venueId = `${city}-${facility}`;
      const venue = venues.find(({ id }) => id === venueId);
      assert.ok(venue, `${venueId} is selectable`);
      assert.equal(venue.category, 'facilities');
      assert.equal(cityForScene(venue.streetScene), city);
    }
  }
});

test('city dungeon invitation venues keep their clear requirements after reload', () => {
  const library = newLibrary();
  const blackMarket = 'black-market';
  const exhibition = 'silver-shield-exhibition';
  const plan = {
    stages: [
      scene('starbell-blacksmith', '铁匠铺'),
      scene('city-center', '星钟广场'),
      scene(blackMarket, '暗巷黑市'),
    ],
    finale: scene('starbell-market', '市场'),
  };
  const validate = (allowedScenes) =>
    validateCityInvitationPlan(plan, { startScene: 'starbell-blacksmith', allowedScenes });

  assert.equal(Object.hasOwn(starbellScenes(library), blackMarket), false);
  assert.equal(
    invitationCityVenues(library, 'silver-crown').some(({ id }) => id === exhibition),
    false,
  );

  for (const nodeId of ['black-market-1-gate', 'black-market-2-stalls', 'black-market-3-vault']) {
    completeCityDungeonNode(library, blackMarket, nodeId);
  }
  const locked = restoreLibrary(JSON.parse(JSON.stringify(library)));
  const lockedScenes = starbellScenes(locked);
  assert.equal(Object.hasOwn(lockedScenes, blackMarket), false, 'ordinary rooms do not unlock it');
  assert.throws(() => validate(lockedScenes), /约见地点不在本次可用的城区名单中/);

  completeCityDungeonNode(locked, blackMarket, 'black-market-4-auction');
  const unlocked = restoreLibrary(JSON.parse(JSON.stringify(locked)));
  const validated = validate(starbellScenes(unlocked));
  assert.deepEqual(
    validated.stages.map(({ scene: id }) => id),
    ['starbell-blacksmith', 'city-center', blackMarket],
  );
  assert.equal(validated.finale.scene, 'starbell-market');
  assert.throws(
    () =>
      validateCityInvitationPlan(
        { ...plan, finale: scene('crown-arcade', '银工连廊') },
        { startScene: 'starbell-blacksmith', allowedScenes: starbellScenes(unlocked) },
      ),
    /约见地点不在本次可用的城区名单中/,
  );
});
