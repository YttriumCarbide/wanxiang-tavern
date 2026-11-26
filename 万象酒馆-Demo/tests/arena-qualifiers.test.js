import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Matrix4, Quaternion, Vector3 } from '../vendor/build/three.module.js';
import { ARENA_QUALIFIER_ARCHIVE_DEFINITIONS } from '../src/content/arena-qualifier-adversaries.js';
import { ARENA_ARCHIVE_DEFINITIONS } from '../src/content/arena-adversaries.js';
import { DEFINITIONS } from '../src/data.js';
import { buildEnemyArchiveEntries, filterEnemyArchiveBuckets } from '../src/archive-enemies.js';

const rosterUrl = new URL('../src/content/arena-qualifier-roster.json', import.meta.url);
const sourceUrl = new URL('../../万象异境-体素模型/首都内部竞技场/海选赛/', import.meta.url);
const tierCounts = { minion: 10, elite: 10, boss: 6, overlord: 1 };
const blockBudgets = { minion: [22, 58], elite: [60, 110], boss: [112, 210] };
const clipNames = [
  'Idle',
  'Charge_Up',
  'Normal_Attack',
  'Special_Attack',
  'Special_Action',
  'Talon_Rend',
  'Break_Stagger',
];

async function readJson(url) {
  return JSON.parse(await readFile(url, 'utf8'));
}

function readGlb(bytes) {
  assert(bytes.length >= 28, 'complete GLB header');
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(bytes.readUInt32LE(4), 2);
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  const jsonLength = bytes.readUInt32LE(12);
  assert.equal(bytes.readUInt32LE(16), 0x4e4f534a);
  assert(jsonLength > 0 && jsonLength % 4 === 0);
  const binaryHeader = 20 + jsonLength;
  assert(binaryHeader + 8 <= bytes.length);
  assert.equal(bytes.readUInt32LE(binaryHeader + 4), 0x004e4942);
  assert.equal(binaryHeader + 8 + bytes.readUInt32LE(binaryHeader), bytes.length);
  const doc = JSON.parse(bytes.subarray(20, binaryHeader));
  const binary = bytes.subarray(binaryHeader + 8);
  assert.equal(doc.asset.version, '2.0');
  assert.equal(doc.buffers.length, 1);
  assert.equal(doc.buffers[0].uri, undefined);
  assert(binary.length >= doc.buffers[0].byteLength);
  const widths = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const components = {
    5121: ['getUint8', 1],
    5123: ['getUint16', 2],
    5125: ['getUint32', 4],
    5126: ['getFloat32', 4],
  };
  const binaryView = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  function accessor(index) {
    const entry = doc.accessors[index];
    assert(entry && Number.isInteger(entry.count) && entry.count > 0, 'valid accessor');
    const view = doc.bufferViews[entry.bufferView];
    assert(view && view.buffer === 0, 'embedded accessor buffer');
    const component = components[entry.componentType];
    const width = widths[entry.type];
    assert(component && width, 'supported accessor format');
    const [read, componentSize] = component;
    const offset = (view.byteOffset || 0) + (entry.byteOffset || 0);
    const stride = view.byteStride || width * componentSize;
    assert(stride >= width * componentSize && offset >= 0);
    assert((view.byteOffset || 0) + view.byteLength <= doc.buffers[0].byteLength);
    assert(
      (entry.byteOffset || 0) + (entry.count - 1) * stride + width * componentSize <=
        view.byteLength,
    );
    return Array.from({ length: entry.count }, (_, row) =>
      Array.from({ length: width }, (_, column) => {
        const value = binaryView[read](offset + row * stride + column * componentSize, true);
        assert(Number.isFinite(value), 'finite accessor values');
        return value;
      }),
    );
  }
  let triangles = 0;
  for (const mesh of doc.meshes) {
    for (const primitive of mesh.primitives) {
      assert.equal(primitive.mode ?? 4, 4);
      const positions = accessor(primitive.attributes.POSITION);
      const indices = accessor(primitive.indices).flat();
      assert([5121, 5123, 5125].includes(doc.accessors[primitive.indices].componentType));
      assert.equal(indices.length % 3, 0);
      assert(indices.every((index) => index >= 0 && index < positions.length));
      triangles += indices.length / 3;
    }
  }
  assert.equal(doc.extras.triangles, triangles);
  const minimum = new Vector3(Infinity, Infinity, Infinity);
  const maximum = new Vector3(-Infinity, -Infinity, -Infinity);
  const seen = new Set();
  function visit(index, parent, hidden) {
    assert(!seen.has(index), 'acyclic mesh hierarchy');
    seen.add(index);
    const node = doc.nodes[index];
    assert(node, 'valid hierarchy node');
    const scale = node.scale || [1, 1, 1];
    const invisible = hidden || Math.max(...scale.map(Math.abs)) < 0.01;
    const local = node.matrix
      ? new Matrix4().fromArray(node.matrix)
      : new Matrix4().compose(
          new Vector3(...(node.translation || [0, 0, 0])),
          new Quaternion(...(node.rotation || [0, 0, 0, 1])),
          new Vector3(...scale),
        );
    const world = new Matrix4().multiplyMatrices(parent, local);
    if (!invisible && node.mesh !== undefined) {
      assert(doc.meshes[node.mesh], 'valid hierarchy mesh');
      for (const primitive of doc.meshes[node.mesh].primitives) {
        for (const coordinates of accessor(primitive.attributes.POSITION)) {
          const point = new Vector3(...coordinates).applyMatrix4(world);
          minimum.min(point);
          maximum.max(point);
        }
      }
    }
    for (const child of node.children || []) visit(child, world, invisible);
  }
  for (const index of doc.scenes[doc.scene || 0].nodes) visit(index, new Matrix4(), false);
  const size = maximum.clone().sub(minimum).toArray();
  assert(
    size.every((value) => Number.isFinite(value) && value > 0),
    'visible world bounds',
  );
  assert(Math.abs(minimum.y) < 0.001, 'exported geometry stands on y=0');
  assert(Math.abs(minimum.x + maximum.x) < 0.001, 'exported geometry is centered on X');
  assert(Math.abs(minimum.z + maximum.z) < 0.001, 'exported geometry is centered on Z');
  return { doc, triangles, accessor, size };
}

function blockShape(blocks, archetype) {
  assert(Array.isArray(blocks) && blocks.length > 0);
  const minimum = [Infinity, Infinity, Infinity];
  const maximum = [-Infinity, -Infinity, -Infinity];
  for (const block of blocks) {
    assert(['x', 'y', 'z', 'w', 'h', 'd'].every((key) => Number.isFinite(block[key])));
    assert(block.w > 0 && block.h > 0 && block.d > 0, 'positive block dimensions');
    assert(typeof block.group === 'string' && block.group.length > 0);
    const lo = [block.x - block.w / 2, block.y, block.z - block.d / 2];
    const hi = [block.x + block.w / 2, block.y + block.h, block.z + block.d / 2];
    for (let axis = 0; axis < 3; axis++) {
      minimum[axis] = Math.min(minimum[axis], lo[axis]);
      maximum[axis] = Math.max(maximum[axis], hi[axis]);
    }
  }
  const size = maximum.map((value, axis) => value - minimum[axis]);
  assert(Math.abs(minimum[1]) < 0.001, 'source geometry stands on y=0');
  assert(Math.abs(minimum[0] + maximum[0]) < 0.001, 'source geometry is centered on X');
  assert(Math.abs(minimum[2] + maximum[2]) < 0.001, 'source geometry is centered on Z');
  const minHeight = archetype === 'beast' ? 0.8 : 1.3;
  assert(size[0] >= 0.3 && size[1] >= minHeight && size[2] >= 0.2, 'visible model dimensions');
  // Discard color and semantic names; normalize scale and order to catch recolored clones.
  const shape = blocks
    .map((block) =>
      [
        (block.x - minimum[0]) / size[0],
        (block.y - minimum[1]) / size[1],
        (block.z - minimum[2]) / size[2],
        block.w / size[0],
        block.h / size[1],
        block.d / size[2],
      ].map((value) => Math.round(value * 10000)),
    )
    .map((coordinates) => coordinates.join(','))
    .sort()
    .join(';');
  return { signature: createHash('sha256').update(shape).digest('hex'), size };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

test('arena qualifier identities stay in their archive with 10/10/6/1 categories', async () => {
  const roster = await readJson(rosterUrl);
  assert.equal(roster.length, 27);
  for (const field of ['id', 'name', 'slug']) {
    assert.equal(new Set(roster.map((entry) => entry[field])).size, 27, `unique ${field}`);
    assert(roster.every((entry) => typeof entry[field] === 'string' && entry[field].length > 0));
  }
  assert.deepEqual(
    Object.keys(ARENA_QUALIFIER_ARCHIVE_DEFINITIONS).sort(),
    roster.map((entry) => entry.id).sort(),
  );
  const buckets = buildEnemyArchiveEntries(ARENA_QUALIFIER_ARCHIVE_DEFINITIONS);
  for (const [tier, count] of Object.entries(tierCounts)) {
    const ids = roster
      .filter((entry) => entry.tier === tier)
      .map((entry) => entry.id)
      .sort();
    assert.equal(ids.length, count, `${tier} roster count`);
    assert.deepEqual(buckets[tier].map((entry) => entry.id).sort(), ids);
  }
  for (const entry of roster) {
    assert(Object.hasOwn(DEFINITIONS, entry.id), `${entry.id} must be registered in DEFINITIONS`);
    assert(
      !Object.hasOwn(ARENA_ARCHIVE_DEFINITIONS, entry.id),
      `${entry.id} must not replace the main arena cast`,
    );
    const definition = ARENA_QUALIFIER_ARCHIVE_DEFINITIONS[entry.id];
    assert.equal(definition.name, entry.name);
    assert.equal(definition.model, `${entry.slug}.glb`);
    assert.equal(definition.portrait, entry.slug);
    assert.equal(definition.displayPlinth, false);
  }
  assert.equal(filterEnemyArchiveBuckets(buckets).unlockedCount, 0);
  const seenMonsters = Object.keys(tierCounts).map(
    (tier) => roster.find((entry) => entry.tier === tier).id,
  );
  const originalSeen = [...seenMonsters];
  const discovered = filterEnemyArchiveBuckets(buckets, { seenMonsters });
  assert.equal(discovered.unlockedCount, 4);
  for (const tier of Object.keys(tierCounts))
    assert.equal(discovered.visibleBuckets[tier].length, 1);
  assert.equal(
    filterEnemyArchiveBuckets(buckets, { seenMonsters, unlockAll: true }).unlockedCount,
    27,
  );
  assert.deepEqual(seenMonsters, originalSeen, 'developer unlock does not rewrite discoveries');
  assert.equal(filterEnemyArchiveBuckets(buckets, { seenMonsters }).unlockedCount, 4);
});

test('qualifier block geometry increases by tier and does not reuse recolored shapes', async () => {
  const roster = await readJson(rosterUrl);
  const shapes = new Set();
  const complexity = { minion: [], elite: [], boss: [] };
  for (const entry of roster.filter((unit) => unit.tier !== 'overlord')) {
    const source = await readJson(new URL(`${entry.slug}.json`, sourceUrl));
    assert.equal(source.id, entry.id);
    const { signature } = blockShape(source.blocks, entry.archetype);
    assert(
      !shapes.has(signature),
      `${entry.id} duplicates another model after removing colors and scale`,
    );
    shapes.add(signature);
    const [minimum, maximum] = blockBudgets[entry.tier];
    assert(
      source.blocks.length >= minimum && source.blocks.length <= maximum,
      `${entry.id}: expected ${minimum}..${maximum} actual blocks, got ${source.blocks.length}`,
    );
    complexity[entry.tier].push(source.blocks.length);
  }
  assert.equal(shapes.size, 26);
  assert(median(complexity.minion) < median(complexity.elite));
  assert(median(complexity.elite) < median(complexity.boss));
});

test('all qualifier exports retain actual geometry and current source/cache identities', async () => {
  const roster = await readJson(rosterUrl);
  const catalog = await readJson(new URL('../assets/asset-catalog.json', import.meta.url));
  for (const entry of roster) {
    const modelFile = `${entry.slug}.glb`;
    const portraitFile = `portraits/${entry.slug}.svg`;
    const bytes = await readFile(new URL(`../assets/${modelFile}`, import.meta.url));
    const { doc, triangles, size } = readGlb(bytes);
    assert.equal(doc.extras.enemyId, entry.id);
    assert.equal(doc.extras.tier, entry.tier);
    assert.equal(doc.extras.displayPlinth, false);
    const source =
      entry.tier === 'overlord'
        ? new URL(`../../万象异境-体素模型/霸主非体素模型/${modelFile}`, import.meta.url)
        : new URL(modelFile, sourceUrl);
    assert.deepEqual(await readFile(source), bytes, `${entry.id}: retained source GLB`);
    if (entry.tier !== 'overlord') {
      const blocks = (await readJson(new URL(`${entry.slug}.json`, sourceUrl))).blocks;
      assert.equal(doc.extras.nonVoxel, false);
      assert.equal(doc.extras.blockCount, blocks.length);
      assert.equal(triangles, blocks.length * 12);
      const sourceSize = blockShape(blocks, entry.archetype).size;
      assert(size.every((dimension, axis) => Math.abs(dimension - sourceSize[axis]) < 0.001));
    }
    for (const [file, contents] of [
      [modelFile, bytes],
      [portraitFile, await readFile(new URL(`../assets/${portraitFile}`, import.meta.url))],
    ]) {
      assert.deepEqual(
        catalog.files[`assets/${file}`],
        {
          bytes: contents.length,
          hash: createHash('sha256').update(contents).digest('hex'),
        },
        `${entry.id}: asset catalog ${file}`,
      );
      if (file.endsWith('.svg')) {
        assert.match(contents.toString('utf8'), /<svg\b/);
        assert(contents.toString('utf8').includes(`data-enemy-model="${entry.id}"`));
      }
    }
  }
});

test('the modest qualifier overlord retains an articulated low-detail seven-action rig', async () => {
  const entry = (await readJson(rosterUrl)).find((unit) => unit.tier === 'overlord');
  assert(entry);
  const bytes = await readFile(new URL(`../assets/${entry.slug}.glb`, import.meta.url));
  const { doc, triangles, accessor, size } = readGlb(bytes);
  assert.equal(doc.extras.nonVoxel, true);
  assert.equal(doc.extras.standOnCard, true);
  assert(triangles >= 3000 && triangles <= 9000, `modest overlord triangle budget: ${triangles}`);
  assert(doc.nodes.filter((node) => node.mesh === undefined && node.children?.length).length >= 20);
  assert(Object.keys(doc.extras.components).length > 0, 'retained mesh component metadata');
  assert.equal(
    Object.values(doc.extras.components).reduce((sum, count) => sum + count, 0),
    triangles,
  );
  assert.equal(doc.animations.length, 7);
  assert.deepEqual(doc.animations.map((clip) => clip.name).sort(), [...clipNames].sort());
  assert(size[1] >= 2.0, 'overlord has a visible standing height of at least two units');
  for (const clip of doc.animations) {
    assert(clip.channels.length > 0, `${clip.name}: authored animation tracks`);
    for (const channel of clip.channels) {
      assert(doc.nodes[channel.target.node], `${clip.name}: valid target node`);
      const sampler = clip.samplers[channel.sampler];
      const times = accessor(sampler.input).flat();
      const values = accessor(sampler.output);
      assert.equal(sampler.interpolation ?? 'LINEAR', 'LINEAR');
      assert(times.length >= 2 && times[0] === 0 && times.at(-1) > 0);
      assert(times.every((time, index) => index === 0 || time > times[index - 1]));
      assert.equal(values.length, times.length);
      const first = values[0],
        last = values.at(-1);
      const signs = channel.target.path === 'rotation' ? [1, -1] : [1];
      assert(
        signs.some((sign) =>
          first.every((value, index) => Math.abs(value - last[index] * sign) < 0.0001),
        ),
        `${clip.name}: return to the start pose`,
      );
      if (channel.target.path === 'rotation')
        assert(values.every((value) => Math.abs(Math.hypot(...value) - 1) < 0.0002));
    }
  }
});
