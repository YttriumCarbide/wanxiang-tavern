import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createAssetStore } from '../src/shared/asset-store.js';
import { GAL_NPC_PORTRAITS } from '../src/content/gal-npc-portraits.js';
import { OVERLAND_ROAD } from '../src/content/overland-road.js';
import { SILVER_CROWN_GATE, SILVER_CROWN_PLACES } from '../src/content/silver-crown-scenes.js';
import { ETERNAL_CITY_PLACES, ETERNAL_CITY_STOPS } from '../src/content/eternal-city-scenes.js';
import {
  TAVERN_VISITORS,
  standingSprite,
  SCENE_VISITOR_SPOTS,
} from '../src/content/tavern-visitors.js';

test('content-addressed asset cache deduplicates reads, measures bytes and invalidates changed files', async (t) => {
  const previous = { fetch: globalThis.fetch, caches: globalThis.caches };
  t.after(() => Object.assign(globalThis, previous));
  const storage = new Map();
  const disk = {
    async match(key) {
      return storage.get(String(key))?.clone();
    },
    async put(key, response) {
      storage.set(String(key), response.clone());
    },
    async delete(key) {
      return storage.delete(String(key));
    },
  };
  globalThis.caches = {
    async open() {
      return disk;
    },
  };
  let body = 'first-original-bytes';
  let calls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('asset-catalog.json'))
      return Response.json({ files: { 'assets/test.glb': { bytes: body.length, hash: body } } });
    calls++;
    return new Response(body);
  };
  const create = () => createAssetStore({ base: new URL('https://test.invalid/game/') });
  const store = create();
  const progress = [];
  const originals = await Promise.all([
    store.read('./assets/test.glb', (state) => progress.push(state)),
    store.read('./assets/test.glb'),
  ]);
  assert.equal(calls, 1);
  assert.equal(await originals[0].text(), body);
  assert.equal(await originals[1].text(), body);
  assert.equal(progress.at(-1).loaded, body.length);
  assert.equal(progress.at(-1).total, body.length);
  store.dispose();
  const cached = create();
  assert.equal(await (await cached.read('./assets/test.glb')).text(), body);
  assert.equal(calls, 1);
  cached.dispose();
  body = 'second-original-bytes';
  const updated = create();
  assert.equal(await (await updated.read('./assets/test.glb')).text(), body);
  assert.equal(calls, 2);
  await updated.evict('./assets/test.glb');
  await updated.read('./assets/test.glb');
  assert.equal(calls, 3);
  updated.dispose();
  globalThis.caches = {
    async open() {
      throw Error('private browser');
    },
  };
  const fallback = create();
  assert.equal(await (await fallback.read('./assets/test.glb')).text(), body);
  fallback.dispose();
});

test('eight characters share full-body originals with Gal, and every scene has independent spawn points', async () => {
  assert.equal(TAVERN_VISITORS.length, 8);
  const manifest = JSON.parse(
    await readFile(new URL('../assets/character-art.json', import.meta.url), 'utf8'),
  );
  for (const item of manifest.assets) {
    const bytes = await readFile(new URL('../' + item.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), item.sha256);
    assert.equal(bytes.readUInt32BE(16), 1024);
    assert.equal(bytes.readUInt32BE(20), 1536);
  }
  for (const definition of TAVERN_VISITORS)
    assert(
      (await readFile(new URL('../' + standingSprite(definition).slice(2), import.meta.url)))
        .length > 1000,
    );
  const { STARBELL_SCENES } = await import('../src/content/starbell-scenes.js');
  const { TOWN_SIDE_PLACES } = await import('../src/content/town-side-places.js');
  assert.equal(Object.keys(SCENE_VISITOR_SPOTS).length, 10 + Object.keys(TOWN_SIDE_PLACES).length);
  for (const [scene, points] of Object.entries(SCENE_VISITOR_SPOTS)) {
    const fixed =
      STARBELL_SCENES[scene]?.cutouts.filter((point) => point.kind === 'npc').length || 0;
    assert(
      points.length + fixed >= 1 &&
        points.length + fixed <= 3 &&
        new Set(points.map((point) => point.id)).size === points.length,
    );
  }
  for (const scene of ['room-a', 'room-b', 'room-master'])
    assert.equal(SCENE_VISITOR_SPOTS[scene].length, 1);
  const npcArt = JSON.parse(
    await readFile(new URL('../assets/gal-npc-cast/manifest.json', import.meta.url), 'utf8'),
  );
  assert.equal(npcArt.assets.length, 10);
  for (const entry of npcArt.assets) {
    const bytes = await readFile(new URL('../' + entry.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(bytes.readUInt32BE(16), 1024);
    assert.equal(bytes.readUInt32BE(20), 1536);
    assert.equal(bytes[25], 6, `${entry.file} retains an RGBA alpha channel`);
  }
  assert.equal(Object.keys(GAL_NPC_PORTRAITS).length, 10);
});

test('continuous surrounds and road textures retain their native source pixels', async () => {
  const manifest = JSON.parse(
    await readFile(new URL('../assets/exploration/native-sources.json', import.meta.url), 'utf8'),
  );
  const { explorationScene } = await import('../src/exploration/scenes.js');
  for (const id of ['street', 'city-center', 'market', 'rampart', 'outskirts']) {
    const scene = explorationScene(id);
    assert(manifest.assets.some((entry) => './' + entry.file === scene.panoramaBand));
    assert(scene.ground && scene.eye[1] === 1.65);
  }
  for (const entry of manifest.assets) {
    const bytes = await readFile(new URL('../' + entry.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(bytes.readUInt32BE(16), entry.width);
    assert.equal(bytes.readUInt32BE(20), entry.height);
    if (entry.id) assert(entry.width >= 2000 && entry.width / entry.height === 3);
  }
});

test('the spatial street keeps every generated painting at its native dimensions and hash', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../assets/exploration/street-spatial/manifest.json', import.meta.url),
      'utf8',
    ),
  );
  const { STREET_SPATIAL } = await import('../src/content/street-spatial.js');
  assert.equal(manifest.assets.length, 8);
  const files = [STREET_SPATIAL.road.image, ...Object.values(STREET_SPATIAL.art)];
  for (const file of files) assert(manifest.assets.some((entry) => './' + entry.file === file));
  for (const entry of manifest.assets) {
    const bytes = await readFile(new URL('../' + entry.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(bytes.readUInt32BE(16), entry.width);
    assert.equal(bytes.readUInt32BE(20), entry.height);
    if (entry.transparent) assert.equal(bytes[25], 6);
  }
});

test('the fixed street views retain native paintings and keep all interaction points available', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../assets/exploration/street-illustrated/manifest.json', import.meta.url),
      'utf8',
    ),
  );
  const { STREET_ILLUSTRATED } = await import('../src/content/street-illustrated.js');
  const { STARLAMP_STREET } = await import('../src/content/starlamp-street.js');
  assert.equal(manifest.assets.length, 8);
  assert(!Array.isArray(STREET_ILLUSTRATED));
  for (const view of [STREET_ILLUSTRATED]) {
    const entry = manifest.assets.find((entry) => './' + entry.file === view.image);
    assert(entry);
    const bytes = await readFile(new URL('../' + entry.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(bytes.readUInt32BE(16), entry.width);
    assert.equal(bytes.readUInt32BE(20), entry.height);
    assert(entry.width >= 1600 && entry.width / entry.height > 1.7);
    assert.equal(Object.keys(view.spots).length, 2);
  }
  for (const point of STARLAMP_STREET.points)
    assert(STREET_ILLUSTRATED.points[point.id], point.id + ' remains reachable');
});

test('four repainted scenes keep original native art, chapter landmarks and all standing identities', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../assets/exploration/free-scenes-hd-v2/manifest.json', import.meta.url),
      'utf8',
    ),
  );
  const { explorationScene } = await import('../src/exploration/scenes.js');
  assert.equal(manifest.assets.length, 4);
  for (const entry of manifest.assets) {
    const bytes = await readFile(new URL('../' + entry.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(bytes.readUInt32BE(16), entry.width);
    assert.equal(bytes.readUInt32BE(20), entry.height);
    assert(entry.width >= 3700 && entry.height >= 1254 && entry.width / entry.height > 2.9);
    const scene = explorationScene(entry.id);
    assert.equal(scene.illustration.image, './' + entry.file);
    for (const point of scene.points)
      assert(scene.illustration.points[point.id], point.id + ' remains reachable');
    const people = scene.cutouts.filter((person) => person.kind === 'npc');
    for (const person of people) assert(scene.illustration.people[person.id]);
    for (const spot of SCENE_VISITOR_SPOTS[scene.id]) assert(scene.illustration.spots[spot.id]);
    assert.equal(people.length + Object.keys(scene.illustration.spots).length, 2);
  }
});

test('town night and side paintings have matching proportions and wired exits', async () => {
  const { explorationScene, explorationHref } = await import('../src/exploration/scenes.js');
  const { TOWN_SIDE_PLACES } = await import('../src/content/town-side-places.js');
  const { TOWN_SCENES } = await import('../src/daily.js');
  const { CHAT_PLACES } = await import('../src/chat-places.js');
  async function aspect(file) {
    const png = await readFile(new URL('../' + file.replace(/^\.\//, ''), import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert(png.readUInt32BE(16) >= 1600);
    return png.readUInt32BE(16) / png.readUInt32BE(20);
  }
  const parents = new Set();
  for (const [id, place] of Object.entries(TOWN_SIDE_PLACES)) {
    const scene = explorationScene(id);
    const parent = explorationScene(place.parent);
    parents.add(parent.id);
    assert.equal(TOWN_SCENES[id], CHAT_PLACES[id].name);
    assert.equal(scene.returnDestination, parent.id);
    assert(parent.points.some((point) => point.destination === id));
    assert.deepEqual(parent.illustration.points[id], place.entrance);
    assert(scene.illustration.fixed && SCENE_VISITOR_SPOTS[id].length === 1);
    assert(explorationHref(id, 'night').endsWith(`scene=${id}&time=night`));
    assert(Math.abs((await aspect(scene.illustration.image)) - 16 / 9) < 0.01);
    if (place.openAir)
      assert(Math.abs((await aspect(scene.illustration.nightImage)) - 16 / 9) < 0.01);
    else assert.equal(scene.illustration.nightImage, undefined);
  }
  assert.equal(parents.size, 4);
  parents.add('street');
  for (const id of parents)
    assert(Math.abs((await aspect(explorationScene(id).illustration.nightImage)) - 3) < 0.02);
});

test('overland backgrounds retain their original files while travel uses the atlas', async () => {
  const { explorationScene } = await import('../src/exploration/scenes.js');
  const { OUTING_SCENES } = await import('../src/daily.js');
  assert.equal(OVERLAND_ROAD.length, 10);
  assert(
    !explorationScene('outskirts').points.some((point) => point.destination === 'road-meadow'),
  );
  for (const { id, name } of OVERLAND_ROAD) {
    const scene = explorationScene(id);
    assert.equal(OUTING_SCENES[id], name);
    assert.equal(scene.returnDestination, null);
    assert.deepEqual(
      scene.points.map((point) => point.destination),
      id === 'road-capital' ? [SILVER_CROWN_GATE] : [],
    );
    assert.equal(SCENE_VISITOR_SPOTS[id], undefined);
    const png = await readFile(new URL('../' + scene.illustration.image.slice(2), import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert.equal(width, height * 3);
    assert(width >= 2100);
    if (id === 'road-bridge' || id === 'road-reeds') {
      const night = await readFile(
        new URL('../' + scene.illustration.nightImage.slice(2), import.meta.url),
      );
      assert.deepEqual(night.subarray(16, 24), png.subarray(16, 24));
    }
  }
});

test('Silver Crown outdoor night scenes use the exact dimensions of their day backgrounds', async () => {
  const { explorationScene } = await import('../src/exploration/scenes.js');
  for (const [id, place] of Object.entries(SILVER_CROWN_PLACES)) {
    const art = explorationScene(id).illustration;
    const day = await readFile(new URL('../' + art.image.slice(2), import.meta.url));
    const aspect = day.readUInt32BE(16) / day.readUInt32BE(20);
    assert(Math.abs(aspect - (place.wide ? 3 : 16 / 9)) < 0.01);
    if (place.night) {
      const night = await readFile(new URL('../' + art.nightImage.slice(2), import.meta.url));
      assert.deepEqual(night.subarray(16, 24), day.subarray(16, 24));
    }
  }
});

test('all capital and route backgrounds are native continuous 3:1 PNGs', async () => {
  const { explorationScene } = await import('../src/exploration/scenes.js');
  for (const id of [...Object.keys(ETERNAL_CITY_PLACES), ...Object.keys(ETERNAL_CITY_STOPS)]) {
    const { image } = explorationScene(id).illustration;
    const png = await readFile(new URL('../' + image.slice(2), import.meta.url));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', image);
    assert.equal(png.readUInt32BE(16), png.readUInt32BE(20) * 3, image);
  }
});
