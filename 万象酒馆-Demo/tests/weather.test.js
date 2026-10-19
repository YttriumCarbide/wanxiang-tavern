import test from 'node:test';
import assert from 'node:assert/strict';
import { WEATHERS, chooseWeather } from '../src/weather.js';
import * as THREE from '../vendor/build/three.module.js';
import { createWeatherSurfaces } from '../src/weather-surfaces.js';
import { CHAT_PLACES, roomChatPlace } from '../src/chat-places.js';

test('weather deck is map-independent, weighted and exposes all weather kinds', () => {
  assert.deepEqual(
    WEATHERS.map((weather) => weather.id),
    ['clear', 'rain', 'snow', 'thunder', 'mist'],
  );
  for (const weather of WEATHERS) {
    assert(weather.weight > 0);
    assert(weather.label.length > 0);
    assert(Number.isInteger(weather.particles));
  }
  assert.equal(chooseWeather(() => 0).id, 'clear');
  assert.equal(chooseWeather(() => 0.999999).id, 'mist');
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(chooseWeather(() => i / 1000).id);
  assert.deepEqual([...seen].sort(), ['clear', 'mist', 'rain', 'snow', 'thunder']);
});

test('weather samples actual roofs, water and hot surfaces but never character cards', () => {
  const model = new THREE.Group();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(24, 0.2, 20));
  floor.position.y = 0;
  model.add(floor);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3, 0.2, 3));
  roof.position.set(3, 2, 0);
  model.add(roof);
  const card = new THREE.Group();
  card.name = 'Placeholder_Friendly_01';
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
  body.position.y = 2;
  card.add(body);
  model.add(card);
  for (const [name, x] of [
    ['Lotus_Pond_Water', -4],
    ['Lava_Channel', -8],
  ]) {
    const patch = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 2));
    patch.name = name;
    patch.position.set(x, 0.2, 0);
    model.add(patch);
  }
  const surfaces = createWeatherSurfaces(model);
  assert(
    Math.abs(surfaces.sample(0, 0).y - 0.1) < 0.01,
    'A card cannot form a roof or collect snow',
  );
  assert(Math.abs(surfaces.sample(3, 0).y - 2.1) < 0.01, 'Drops stop at the actual elevated roof');
  assert.equal(surfaces.sample(-4, 0).kind, 1);
  assert.equal(surfaces.sample(-8, 0).kind, 2);
  assert.equal(
    surfaces.sample(12.8, 12.8).supported,
    false,
    'Empty air cannot collect water or snow',
  );
  assert.equal(surfaces.sample(30, 0).supported, false);
  assert.equal(surfaces.sample(3, 0).collects, true);
  assert(surfaces.cells < 5000);
  surfaces.addBoxes([{ x: 7, y: 0.1, z: 3, w: 2, h: 1.5, d: 2 }]);
  assert(
    Math.abs(surfaces.sample(7, 3).y - 1.6) < 0.01,
    'Rain lands on repeated scenery rather than passing through it',
  );
  assert(
    Math.abs(surfaces.sample(0, 0).y - 0.1) < 0.01,
    'Adding outer scenery does not alter the battle floor',
  );
  model.traverse((object) => {
    object.geometry?.dispose();
    object.material?.dispose();
  });
});

test('all guest and master-room positions have distinct, validated chat environments', () => {
  for (const room of ['a', 'b', 'master'])
    for (const spot of [
      'entry',
      'bed',
      'window',
      'desk',
      'wardrobe',
      'washstand',
      'stove',
      'door',
    ]) {
      const id = roomChatPlace(room, spot);
      assert(CHAT_PLACES[id]?.environment.includes('万象酒馆内部'));
      assert(CHAT_PLACES[id].actions.length >= 2);
    }
  assert(CHAT_PLACES[roomChatPlace('master', 'sitting')].environment.includes('翼背椅'));
  assert(CHAT_PLACES[roomChatPlace('master', 'washstand')].environment.includes('梳妆镜'));
  assert(CHAT_PLACES[roomChatPlace('master', 'bookshelf')].environment.includes('书卷'));
  assert.notEqual(roomChatPlace('a', 'bed'), roomChatPlace('b', 'bed'));
  assert.equal(roomChatPlace('unknown', 'bed'), null);
  assert.equal(roomChatPlace('a', 'unknown'), 'room-a-entry');
});
