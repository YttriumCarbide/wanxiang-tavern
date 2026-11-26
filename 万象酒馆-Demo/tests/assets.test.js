import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createAssetStore } from '../src/shared/asset-store.js';
import { GAL_NPC_PORTRAITS } from '../src/content/gal-npc-portraits.js';
import { OVERLAND_ROAD } from '../src/content/overland-road.js';
import { SILVER_CROWN_PLACES } from '../src/content/silver-crown-scenes.js';
import { ETERNAL_CITY_PLACES, ETERNAL_CITY_STOPS } from '../src/content/eternal-city-scenes.js';
import {
  TAVERN_VISITORS,
  standingSprite,
  SCENE_VISITOR_SPOTS,
} from '../src/content/tavern-visitors.js';

function readImageMeta(bytes) {
  if (bytes.subarray(1, 4).toString() === 'PNG') {
    return {
      format: 'PNG',
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
      hasAlpha: bytes[25] === 6,
    };
  }
  if (bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP') {
    const chunk = bytes.subarray(12, 16).toString();
    if (chunk === 'VP8X') {
      return {
        format: 'WEBP',
        width: 1 + bytes.readUIntLE(24, 3),
        height: 1 + bytes.readUIntLE(27, 3),
        hasAlpha: (bytes[20] & 0x10) !== 0,
      };
    }
    if (chunk === 'VP8L') {
      const bits = bytes.readUInt32LE(21);
      return {
        format: 'WEBP',
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        hasAlpha: ((bits >> 28) & 1) !== 0,
      };
    }
    if (chunk === 'VP8 ') {
      return {
        format: 'WEBP',
        width: bytes.readUInt16LE(26) & 0x3fff,
        height: bytes.readUInt16LE(28) & 0x3fff,
        hasAlpha: false,
      };
    }
  }
  throw new Error('Unsupported image format');
}

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
  let serveStale = false;
  let calls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('asset-catalog.json')) {
      const hash = createHash('sha256').update(body).digest('hex');
      return Response.json({ files: { 'assets/test.glb': { bytes: body.length, hash } } });
    }
    calls++;
    return new Response(serveStale ? body.toUpperCase() : body);
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
  serveStale = true;
  await assert.rejects(updated.read('./assets/test.glb'), /资源校验失败/u);
  serveStale = false;
  assert.equal(await (await updated.read('./assets/test.glb')).text(), body);
  assert.equal(calls, 4, 'invalid bytes were not written to the cache');
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
  assert.equal(npcArt.assets.length, 27);
  for (const entry of npcArt.assets) {
    const bytes = await readFile(new URL('../' + entry.file, import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(bytes.readUInt32BE(16), 1024);
    assert.equal(bytes.readUInt32BE(20), 1536);
    assert.equal(bytes[25], 6, `${entry.file} retains an RGBA alpha channel`);
  }
  assert.equal(Object.keys(GAL_NPC_PORTRAITS).length, 27);
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
    const meta = readImageMeta(bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(meta.width, entry.width);
    assert.equal(meta.height, entry.height);
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
    const meta = readImageMeta(bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(meta.width, entry.width);
    assert.equal(meta.height, entry.height);
    if (entry.transparent) assert.equal(meta.hasAlpha, true);
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
  assert.equal(manifest.assets.length, 5);
  assert(!Array.isArray(STREET_ILLUSTRATED));
  for (const view of [STREET_ILLUSTRATED]) {
    const entry = manifest.assets.find((entry) => './' + entry.file === view.image);
    assert(entry);
    const bytes = await readFile(new URL('../' + entry.file, import.meta.url));
    const meta = readImageMeta(bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256);
    assert.equal(meta.width, entry.width);
    assert.equal(meta.height, entry.height);
    assert(entry.width >= 1600 && entry.width / entry.height > 1.7);
    assert.equal(Object.keys(view.spots).length, 2);
  }
  for (const point of STARLAMP_STREET.points)
    assert(STREET_ILLUSTRATED.points[point.id], point.id + ' remains reachable');
});

test('four Starbell district scenes share the 16:9 city overview while keeping landmarks and spots', async () => {
  const { explorationScene } = await import('../src/exploration/scenes.js');
  const starbell = await readFile(
    new URL('../assets/exploration/city-backgrounds/starbell.webp', import.meta.url),
  );
  const starbellMeta = readImageMeta(starbell);
  assert.equal(starbellMeta.format, 'WEBP');
  assert(Math.abs(starbellMeta.width / starbellMeta.height - 16 / 9) < 0.01);
  for (const id of ['city-center', 'market', 'rampart', 'outskirts']) {
    const scene = explorationScene(id);
    assert.equal(scene.illustration.image, './assets/exploration/city-backgrounds/starbell.webp');
    assert(Math.abs(scene.illustration.aspect - 16 / 9) < 0.01);
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
    const bytes = await readFile(new URL('../' + file.replace(/^\.\//, ''), import.meta.url));
    const meta = readImageMeta(bytes);
    assert.equal(meta.format, 'WEBP');
    assert(meta.width >= 1600);
    return meta.width / meta.height;
  }
  const parents = new Set();
  for (const [id, place] of Object.entries(TOWN_SIDE_PLACES)) {
    const scene = explorationScene(id);
    const parent = explorationScene(place.parent);
    parents.add(parent.id);
    assert.equal(TOWN_SCENES[id], CHAT_PLACES[id].name);
    assert.equal(scene.returnDestination, 'tavern');
    assert.equal(scene.returnLabel, '返回酒馆');
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
  assert.equal(explorationScene('street').id, 'city-center');
  assert(Math.abs((await aspect(explorationScene('street').illustration.image)) - 16 / 9) < 0.01);
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
    assert.equal(SCENE_VISITOR_SPOTS[id], undefined);
    const bytes = await readFile(
      new URL('../' + scene.illustration.image.slice(2), import.meta.url),
    );
    const meta = readImageMeta(bytes);
    assert.equal(meta.format, 'WEBP');
    const { width, height } = meta;
    if (id === 'road-capital') {
      assert.equal(scene.returnDestination, 'tavern');
      assert.equal(scene.returnLabel, '返回酒馆');
      assert.equal(
        scene.illustration.image,
        './assets/exploration/city-backgrounds/silver-crown.webp',
      );
      assert(Math.abs(width / height - 16 / 9) < 0.01);
      continue;
    }
    assert.equal(scene.returnDestination, null);
    assert.deepEqual(scene.points, []);
    assert.equal(width, height * 3);
    assert(width >= 2100);
    if (id === 'road-bridge' || id === 'road-reeds') {
      const night = await readFile(
        new URL('../' + scene.illustration.nightImage.slice(2), import.meta.url),
      );
      const nightMeta = readImageMeta(night);
      assert.equal(nightMeta.width, width);
      assert.equal(nightMeta.height, height);
    }
  }
});

test('Silver Crown scenes share the single 16:9 city overview image', async () => {
  const { explorationScene } = await import('../src/exploration/scenes.js');
  const imageBytes = await readFile(
    new URL('../assets/exploration/city-backgrounds/silver-crown.webp', import.meta.url),
  );
  const meta = readImageMeta(imageBytes);
  assert.equal(meta.format, 'WEBP');
  assert(Math.abs(meta.width / meta.height - 16 / 9) < 0.01);
  for (const id of Object.keys(SILVER_CROWN_PLACES)) {
    const art = explorationScene(id).illustration;
    assert.equal(art.image, './assets/exploration/city-backgrounds/silver-crown.webp');
    assert(Math.abs(art.aspect - 16 / 9) < 0.01);
  }
});

test('Eternal City scenes share the 16:9 city overview while route stops keep 3:1 PNGs', async () => {
  const { explorationScene } = await import('../src/exploration/scenes.js');
  const cityBytes = await readFile(
    new URL('../assets/exploration/city-backgrounds/eternal-city.webp', import.meta.url),
  );
  const cityMeta = readImageMeta(cityBytes);
  assert.equal(cityMeta.format, 'WEBP');
  assert(Math.abs(cityMeta.width / cityMeta.height - 16 / 9) < 0.01);
  for (const id of Object.keys(ETERNAL_CITY_PLACES)) {
    const art = explorationScene(id).illustration;
    assert.equal(art.image, './assets/exploration/city-backgrounds/eternal-city.webp');
    assert(Math.abs(art.aspect - 16 / 9) < 0.01);
  }
  for (const id of Object.keys(ETERNAL_CITY_STOPS)) {
    const { image } = explorationScene(id).illustration;
    const bytes = await readFile(new URL('../' + image.slice(2), import.meta.url));
    const meta = readImageMeta(bytes);
    assert.equal(meta.format, 'WEBP', image);
    assert.equal(meta.width, meta.height * 3, image);
  }
});

test('the capital arena retains seven authored models with current cache identities', async () => {
  const manifest = JSON.parse(
    await readFile(
      new URL('../../万象异境-体素模型/首都内部竞技场/manifest.json', import.meta.url),
      'utf8',
    ),
  );
  const catalog = JSON.parse(
    await readFile(new URL('../assets/asset-catalog.json', import.meta.url), 'utf8'),
  );
  assert.equal(manifest.location, 'eternal-arena');
  assert.equal(manifest.assets.length, 7);
  for (const [tier, count] of [
    ['normal', 4],
    ['elite', 2],
    ['overlord', 1],
  ])
    assert.equal(manifest.assets.filter((asset) => asset.tier === tier).length, count);
  assert.equal(new Set(manifest.assets.map((asset) => asset.id)).size, 7);
  for (const asset of manifest.assets) {
    for (const file of [asset.model, asset.portrait]) {
      const bytes = await readFile(new URL('../assets/' + file, import.meta.url));
      assert.deepEqual(catalog.files['assets/' + file], {
        bytes: bytes.length,
        hash: createHash('sha256').update(bytes).digest('hex'),
      });
      if (file.endsWith('.glb')) {
        assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
        assert.equal(bytes.readUInt32LE(4), 2);
        assert.equal(bytes.readUInt32LE(8), bytes.length);
        const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
        assert.equal(gltf.extras.enemyId, asset.id);
        assert.equal(gltf.extras.tier, asset.tier);
      } else assert.match(bytes.toString('utf8'), /<svg\b/);
    }
  }
});
