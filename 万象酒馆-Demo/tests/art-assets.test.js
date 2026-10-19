import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BIOMES } from '../src/content/biomes.js';
import { ENEMIES, BOSSES } from '../src/data.js';
import { newBattle, preview, advance, makeAction } from '../src/engine.js';
import { triggeredStatusVisuals } from '../src/status-effects.js';
import { generationInput } from '../server/prompts.mjs';
import { newLibrary } from '../src/ai/library.js';
import { settingOnly } from '../src/ai/contracts.js';

test('three authored arenas retain six full-size cards, moving machinery and valid packed geometry', async () => {
  for (const id of ['frost', 'forge', 'tide']) {
    const file = await readFile(new URL(`../assets/${id}.glb`, import.meta.url));
    assert.equal(file.readUInt32LE(0), 0x46546c67);
    assert.equal(file.readUInt32LE(8), file.length);
    const length = file.readUInt32LE(12);
    const gltf = JSON.parse(file.subarray(20, 20 + length).toString());
    assert(gltf.extras.voxelBoxes >= 1800);
    assert.equal(
      gltf.nodes.filter((node) => /^Placeholder_(Friendly|Enemy)_\d+$/.test(node.name)).length,
      6,
    );
    const names = gltf.nodes.map((node) => node.name);
    assert(names.includes('Six_Grounded_Foundations'));
    if (id === 'frost')
      assert.equal(names.filter((name) => name.startsWith('Motion_Minecart')).length, 4);
    if (id === 'forge') assert(names.some((name) => name.startsWith('Motion_Piston')));
    if (id === 'tide') assert(names.some((name) => name.startsWith('Motion_Orbit')));
    for (const view of gltf.bufferViews)
      assert((view.byteOffset || 0) + view.byteLength <= gltf.buffers[0].byteLength);
    for (const mesh of gltf.meshes)
      for (const primitive of mesh.primitives) {
        assert(gltf.materials[primitive.material]);
        for (const index of Object.values(primitive.attributes)) assert(gltf.accessors[index]);
      }
    assert.equal(BIOMES[id].asset, id);
  }
});

test('eight additional theme arenas keep six card roots, packed geometry and preview dioramas', async () => {
  const originalFile = await readFile(new URL('../assets/battle.glb', import.meta.url));
  const originalLength = originalFile.readUInt32LE(12);
  const original = JSON.parse(originalFile.subarray(20, 20 + originalLength).toString());
  const floorNames = original.scenes[original.scene || 0].nodes
    .map((index) => original.nodes[index].name)
    .filter((name) =>
      /^(01_Continuous_Stone_Floor|24_Continuous_Outer_Floor_|24_Outer_Floor_Mortar|Decorated_Halves_With_Six_Grounded_Stone_Bases)/.test(
        name,
      ),
    );
  assert(floorNames.length >= 5);
  function accessorBytes(file, document, jsonLength, index) {
    const accessor = document.accessors[index];
    const view = document.bufferViews[accessor.bufferView];
    const start = 28 + jsonLength + (view.byteOffset || 0);
    return file.subarray(start, start + view.byteLength);
  }
  const landmarks = {
    dynasty: 'Landscape_Palace_Gallery_Roof',
    xianxia: 'Landscape_Immortal_Pavilion_Roof',
    castle: 'Landscape_Fortress_Masonry',
    arcane: 'Landscape_Observatory_Astrolabe',
    metropolis: 'Landscape_City_Block',
    nexus: 'Landscape_Reactor_Containment_Rings',
    wasteland: 'Landscape_Collapsed_Overpass',
    relic: 'Landscape_Stepped_Pyramid',
  };
  for (const [id, landmark] of Object.entries(landmarks)) {
    const file = await readFile(new URL(`../assets/${id}.glb`, import.meta.url));
    assert.equal(file.readUInt32LE(0), 0x46546c67);
    assert.equal(file.readUInt32LE(8), file.length);
    const length = file.readUInt32LE(12);
    const gltf = JSON.parse(file.subarray(20, 20 + length).toString());
    assert(Number.isInteger(gltf.extras.voxelBoxes) && gltf.extras.voxelBoxes > 0);
    assert.equal(
      gltf.nodes.filter((node) => /^Placeholder_(Friendly|Enemy)_\d+$/.test(node.name)).length,
      6,
    );
    assert(
      gltf.nodes.some((node) => node.name === landmark),
      `${id} must retain its own landmark`,
    );
    assert.equal(gltf.extras.peripheryLayout.mode, 'authored-large');
    assert(gltf.extras.peripheryLayout.uniqueSpan[0] >= 7.9);
    assert(gltf.extras.peripheryLayout.uniqueSpan[1] >= 19.1);
    assert(gltf.extras.peripheryLayout.zones.length >= 5);
    assert(gltf.nodes.some((node) => node.scale?.[0] === -1));
    assert.equal(BIOMES[id].view, undefined, 'All maps use the original battle camera');
    for (const name of floorNames) {
      const sourceNode = original.nodes.find((node) => node.name === name);
      const node = gltf.nodes.find((node) => node.name === name);
      assert(node, `${id} must reuse the original ${name}`);
      const sourcePrimitive = original.meshes[sourceNode.mesh].primitives[0];
      const primitive = gltf.meshes[node.mesh].primitives[0];
      for (const [attribute, sourceIndex] of Object.entries(sourcePrimitive.attributes))
        assert.deepEqual(
          accessorBytes(file, gltf, length, primitive.attributes[attribute]),
          accessorBytes(originalFile, original, originalLength, sourceIndex),
          `${id}: original floor ${attribute} must remain byte-for-byte identical`,
        );
      assert.deepEqual(
        accessorBytes(file, gltf, length, primitive.indices),
        accessorBytes(originalFile, original, originalLength, sourcePrimitive.indices),
      );
    }
    for (const view of gltf.bufferViews)
      assert((view.byteOffset || 0) + view.byteLength <= gltf.buffers[0].byteLength);
    for (const mesh of gltf.meshes)
      for (const primitive of mesh.primitives) {
        assert(gltf.materials[primitive.material]);
        assert(gltf.accessors[primitive.attributes.POSITION].count > 0);
        for (const index of Object.values(primitive.attributes)) assert(gltf.accessors[index]);
      }
    for (const node of gltf.nodes.filter((node) =>
      Object.hasOwn(gltf.extras.components, node.name),
    )) {
      const primitive = gltf.meshes[node.mesh].primitives[0];
      const vertices = accessorBytes(file, gltf, length, primitive.attributes.POSITION);
      for (let start = 0; start < vertices.length; start += 24 * 12) {
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (let vertex = 0; vertex < 24; vertex++)
          for (let axis = 0; axis < 3; axis++) {
            const value = vertices.readFloatLE(start + vertex * 12 + axis * 4);
            min[axis] = Math.min(min[axis], value);
            max[axis] = Math.max(max[axis], value);
          }
        assert(
          max[1] <= 0.041 ||
            max[0] <= -6.449 ||
            min[0] >= 6.449 ||
            max[2] <= -5.449 ||
            min[2] >= 5.449,
          `${id}: ${node.name} cannot intrude into the original central board`,
        );
      }
    }
    assert.equal(BIOMES[id].asset, id);
    const preview = await readFile(new URL(`../assets/preview-${id}.glb`, import.meta.url));
    assert.equal(preview.readUInt32LE(0), 0x46546c67);
    assert.equal(preview.readUInt32LE(8), preview.length);
  }
});

test('new enemies have original voxel studies, portraits, lore-ready IDs and a usable third boss route', async () => {
  for (const id of ['crystalBeetle', 'cinderImp', 'tideJelly', 'bossTide']) {
    const enemy = [...ENEMIES, ...BOSSES].find((entry) => entry.id === id);
    assert(enemy);
    const portrait = await readFile(
      new URL(`../assets/portraits/${enemy.portrait}.svg`, import.meta.url),
      'utf8',
    );
    assert.match(portrait, /width="600" height="900"/);
    assert((portrait.match(/<polygon/g) || []).length >= 60);
    const model = await readFile(new URL(`../assets/${enemy.portrait}.glb`, import.meta.url));
    assert.equal(model.readUInt32LE(0), 0x46546c67);
  }
  const context = generationInput('script', {
    brief: '沿矿轨与潮灯探索',
    boss: 'bossTide',
    party: newLibrary().characters.map(settingOnly),
  });
  assert.equal(context.encounters[4].map, 'tide');
  assert(context.encounters[4].enemies.some((enemy) => enemy.id === 'bossTide'));
});

test('bleeding, poison and regeneration visuals are driven by actual ordered resolution events', () => {
  const state = advance(preview(newBattle(['pebble']), []));
  state.units.lyria.buffs.bleed = 2;
  state.units.aegis.buffs.poison = 3;
  state.units.morrow.buffs.regen = 2;
  state.units.morrow.hp -= 4;
  const result = preview(state, [makeAction(state, 'lyria', 'attack', 'pebble', 0)]);
  assert(result.valid);
  let before = state;
  const seen = [];
  for (const event of result.events) {
    seen.push(...triggeredStatusVisuals(event, before));
    before = event.after;
  }
  assert.equal(seen.filter((item) => item.id === 'lyria' && item.type === 'bleed').length, 1);
  assert.equal(seen.filter((item) => item.id === 'aegis' && item.type === 'poison').length, 1);
  assert(seen.some((item) => item.id === 'morrow' && item.type === 'regen'));
  assert(
    seen.findIndex((item) => item.type === 'regen') <
      seen.findIndex((item) => item.type === 'poison'),
  );
  assert.equal(state.units.lyria.hp, 36, 'presentation annotations must not mutate the input');
});
