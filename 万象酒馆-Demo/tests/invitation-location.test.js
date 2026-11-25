import test from 'node:test';
import assert from 'node:assert/strict';
import { newLibrary } from '../src/ai/library.js';
import { invitationCityVenues } from '../src/invitation-location.js';
import { invitationCandidates } from '../src/app/daily-invitation.js';
import { DEFINITIONS } from '../src/data.js';

const BOSS = 'bossTide';
const OVERLORD = 'banditSyndicateKing';

function world(id, enemyIds) {
  return {
    id,
    name: id,
    map: 'mill',
    enemyIds,
    enemyDefinitions: Object.fromEntries(enemyIds.map((id) => [id, DEFINITIONS[id]])),
  };
}

function encounters(finalIds) {
  return Array.from({ length: 5 }, (_, i) => ({
    enemyIds: i === 4 ? finalIds : [BOSS],
  }));
}

function clearedNode(sequence, snapshot, finalIds) {
  return {
    sequence,
    world: snapshot,
    recollection: { encounters: encounters(finalIds) },
  };
}

function setup(id, snapshot, cleared) {
  const lib = newLibrary();
  lib.atlasDiscoveries = [{ id, name: id, linkId: 'city-center' }];
  lib.worlds = [snapshot];
  lib.exploration[id] = { cleared };
  return lib;
}

test('non-Starbell appointments do not add Starbell residents to their roster', () => {
  const lib = newLibrary();
  const starbell = invitationCandidates(lib, 'starbell');
  const silverCrown = invitationCandidates(lib, 'silver-crown');
  assert(
    starbell.some(({ source }) => source === 'town'),
    'Starbell retains local residents',
  );
  assert(
    silverCrown.every(({ source }) => source !== 'town'),
    'a different city offers the roster, not unrequested Starbell town residents',
  );
});

function venueIds(lib) {
  return invitationCityVenues(lib, 'starbell')
    .filter(({ category }) => category === 'dungeons')
    .map(({ id }) => id);
}

test('invitation venues keep ordinary places, facilities and cleared local dungeons distinct', () => {
  const localId = 'local-no-overlord-world';
  const remoteId = 'remote-no-overlord-world';
  const local = world(localId, [BOSS]);
  const remote = world(remoteId, [BOSS]);
  const lib = newLibrary();
  lib.atlasDiscoveries = [
    { id: localId, name: '本城遗址', linkId: 'city-center' },
    { id: remoteId, name: '外城遗址', linkId: 'crown-gateward' },
  ];
  lib.worlds = [local, remote];
  lib.exploration[localId] = { cleared: [{ sequence: 0 }] };
  lib.exploration[remoteId] = { cleared: [{ sequence: 0 }] };

  const venues = invitationCityVenues(lib, 'starbell');
  const ids = venues.map(({ id }) => id);
  assert.deepEqual([...new Set(venues.map(({ category }) => category))].sort(), [
    'dungeons',
    'facilities',
    'places',
  ]);
  assert(venues.some(({ id, category }) => id === 'city-center' && category === 'places'));
  assert(
    venues.some(({ id, category }) => id === 'starbell-blacksmith' && category === 'facilities'),
  );
  assert(venues.some(({ id, category }) => id === localId && category === 'dungeons'));
  assert(!ids.includes(remoteId), 'cleared discoveries from another city are still excluded');
  assert(invitationCityVenues(lib, 'silver-crown').some(({ id }) => id === remoteId));
  assert.equal(new Set(ids).size, ids.length, 'each category keeps a distinct stable venue ID');
});

test('no-overlord world unlocks after its first cleared stage', () => {
  const id = 'no-overlord-world';
  const snapshot = world(id, [BOSS]);
  assert.deepEqual(venueIds(setup(id, snapshot, [])), []);

  const firstStage = setup(id, snapshot, [{ sequence: 0, world: snapshot }]);
  assert.deepEqual(venueIds(firstStage), [id]);
});

test('overlord world stays locked until a cleared finale includes the overlord', () => {
  const id = 'overlord-world';
  const snapshot = world(id, [BOSS, OVERLORD]);

  const bossOnlyFinale = setup(id, snapshot, [
    {
      sequence: 0,
      world: snapshot,
      recollection: {
        encounters: [
          { enemyIds: [OVERLORD] },
          { enemyIds: [BOSS] },
          { enemyIds: [BOSS] },
          { enemyIds: [BOSS] },
          { enemyIds: [BOSS] },
        ],
      },
    },
  ]);
  assert.deepEqual(venueIds(bossOnlyFinale), []);

  bossOnlyFinale.exploration[id].cleared.push(clearedNode(1, snapshot, [OVERLORD]));
  assert.deepEqual(venueIds(bossOnlyFinale), [id]);
});

test('legacy sequence-0 clear without encounters stays locked, later valid record unlocks', () => {
  const id = 'legacy-world';
  const snapshot = world(id, [BOSS, OVERLORD]);

  const legacy = setup(id, snapshot, [{ sequence: 0, world: snapshot }]);
  assert.deepEqual(venueIds(legacy), []);

  legacy.exploration[id].cleared.push(clearedNode(1, snapshot, [OVERLORD]));
  assert.deepEqual(venueIds(legacy), [id]);
});

test('expanding a world with an overlord does not count an earlier ordinary finale', () => {
  const id = 'expanded-world';
  const former = world(id, [BOSS]);
  const expanded = world(id, [BOSS, OVERLORD]);
  const lib = setup(id, expanded, [clearedNode(0, former, [BOSS])]);
  assert.deepEqual(venueIds(lib), []);

  lib.exploration[id].cleared.push(clearedNode(1, expanded, [OVERLORD]));
  assert.deepEqual(venueIds(lib), [id]);
});
