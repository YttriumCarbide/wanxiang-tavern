import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateGameData } from '../src/validation.js';
import { DEFINITIONS, encounterSpec } from '../src/data.js';
import { WORLD_PHENOMENA } from '../src/content/world-phenomena.js';
import { LADDER_ENEMIES, LADDER_BOSSES } from '../src/content/ladder-adversaries.js';
import { COMMON_ENEMIES, COMMON_BOSSES } from '../src/content/common-adversaries.js';
import { DROP_GROUPS } from '../src/content/enemy-drops.js';
import { ALL_MONSTER_LORE, monsterWorldbook } from '../src/content/monsters.js';
import { SKIRMISH_ECOLOGIES } from '../src/skirmishes.js';
import { shouldStandOnCard, overlordAssetUrls } from '../src/overlord-registry.js';
import { syncBuiltinWorldbook } from '../src/ai/worldbook.js';
import { buildEnemyArchiveEntries } from '../src/archive-enemies.js';

const ASSETS = fileURLToPath(new URL('../assets', import.meta.url));

async function inspectGlb(filename) {
  const bytes = await readFile(path.join(ASSETS, filename));
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, `${filename}: invalid GLB magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${filename}: expected glTF version 2`);
  const jsonLen = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + jsonLen).toString('utf8'));
  let triangles = 0;
  for (const mesh of doc.meshes || []) {
    for (const prim of mesh.primitives || []) {
      if (Number.isInteger(prim.indices)) {
        triangles += Math.floor((doc.accessors?.[prim.indices]?.count || 0) / 3);
      } else if (Number.isInteger(prim.attributes?.POSITION)) {
        triangles += Math.floor((doc.accessors?.[prim.attributes.POSITION]?.count || 0) / 3);
      }
    }
  }
  return { doc, triangles, meshes: (doc.meshes || []).length };
}

function isNonVoxelOverlordDoc(doc) {
  return (
    doc.extras?.nonVoxel === true ||
    Boolean(doc.nodes?.[0]?.extras?.nonVoxel) ||
    doc.nodes?.[0]?.extras?.modelType === 'Articulated procedural creature'
  );
}

test('validateGameData accepts all expanded monsters and overlord flags cleanly', () => {
  assert.doesNotThrow(() => validateGameData());
});

test('all 21 Jacob Ladder monsters, 18 common monsters, lore, drops and worldbook entries resolve', async () => {
  const phenomenon = WORLD_PHENOMENA.find((entry) => entry.id === 'jacobs-ladder-exploration');
  assert(phenomenon, 'Missing jacobs-ladder-exploration phenomenon');
  const parseNames = (prefix) => {
    const line = phenomenon.content
      .split('\n')
      .map((s) => s.trim())
      .find((s) => s.startsWith(prefix));
    assert(line, `Missing ${prefix} line in world-phenomena.js`);
    return line
      .slice(prefix.length)
      .replace(/。$/, '')
      .split('，')
      .map((s) => s.trim())
      .filter(Boolean);
  };
  const mobNames = parseNames('1.小怪：');
  const eliteNames = parseNames('2.精英：');
  const bossNames = parseNames('3.boss：');
  assert.equal(mobNames.length, 10);
  assert.equal(eliteNames.length, 6);
  assert.equal(bossNames.length, 5);

  const byName = new Map(Object.values(DEFINITIONS).map((def) => [def.name, def]));
  for (const name of mobNames) {
    const def = byName.get(name);
    assert(def, `Missing Jacob's Ladder mob ${name}`);
    assert(!def.elite && !def.boss && !def.overlord);
  }
  for (const name of eliteNames) {
    const def = byName.get(name);
    assert(def, `Missing Jacob's Ladder elite ${name}`);
    assert(def.elite && !def.boss);
  }
  for (const name of bossNames) {
    const def = byName.get(name);
    assert(def, `Missing Jacob's Ladder boss ${name}`);
    assert(def.boss);
  }
  assert.equal(DEFINITIONS.radiantWyvern.overlord, true);
  assert.equal(DEFINITIONS.radiantWyvern.standOnCard, true);

  const book = JSON.parse(await readFile(path.join(ASSETS, 'builtin-worldbook.json'), 'utf8'));
  const worldEntriesByMonster = new Map(
    Object.values(book.entries || {})
      .filter((e) => e.extensions?.wanxiang?.monsterId)
      .map((e) => [e.extensions.wanxiang.monsterId, e]),
  );
  const apepEntry = worldEntriesByMonster.get('apepLamb');
  assert(apepEntry);
  assert.deepEqual(apepEntry.key, ['apepLamb', '阿佩普的羔羊']);

  assert.equal(LADDER_ENEMIES.length, 16);
  assert.equal(LADDER_BOSSES.length, 5);
  assert.equal(COMMON_ENEMIES.length, 15);
  assert.equal(COMMON_BOSSES.length, 3);

  const ecologyPool = new Set(
    Object.values(SKIRMISH_ECOLOGIES).flatMap((eco) => [
      ...(eco.mobs || []),
      ...(eco.elites || []),
      ...(eco.bosses || []),
    ]),
  );
  for (const enemy of [...COMMON_ENEMIES, ...COMMON_BOSSES]) {
    assert(ecologyPool.has(enemy.id), `Missing ${enemy.id} in SKIRMISH_ECOLOGIES`);
  }

  const portraitDrops = new Set(Object.values(DROP_GROUPS).flat());
  for (const enemy of [...LADDER_ENEMIES, ...LADDER_BOSSES, ...COMMON_ENEMIES, ...COMMON_BOSSES]) {
    const def = DEFINITIONS[enemy.id];
    assert(def, `Missing DEFINITIONS entry for ${enemy.id}`);
    assert(portraitDrops.has(def.portrait), `Missing DROP_GROUPS for ${def.portrait}`);
    assert(ALL_MONSTER_LORE[def.id], `Missing ALL_MONSTER_LORE for ${def.id}`);
    assert(monsterWorldbook(def.id, def.name).length > 10);
    assert(worldEntriesByMonster.has(def.id), `Missing builtin-worldbook entry for ${def.id}`);
  }
});

test('Overlord formations, standOnCard flags, and non-voxel vs 3-tier voxel GLB progression hold strictly', async () => {
  for (const id of [
    'apepLamb',
    'moonCrown',
    'moonEye',
    'moonRoot',
    'ares',
    'radiantWyvern',
    'alchemicalPuppet',
  ]) {
    assert.equal(DEFINITIONS[id].overlord, true, `${id} must be overlord`);
    assert.equal(DEFINITIONS[id].standOnCard, true, `${id} must stand on card`);
  }
  for (const id of ['aresCannonLeft', 'aresCannonRight']) {
    assert.equal(DEFINITIONS[id].standOnCard, true, `${id} must stand on card`);
  }
  assert.equal(shouldStandOnCard(DEFINITIONS.apepLamb), true);
  assert.equal(shouldStandOnCard(DEFINITIONS.mossSlime), false);

  const urls = overlordAssetUrls(DEFINITIONS);
  assert.equal(urls.length, 5);
  for (const modelName of [
    'apep-lamb.glb',
    'radiant-wyvern.glb',
    'ares.glb',
    'moon-eye.glb',
    'alchemical-puppet.glb',
  ]) {
    assert(urls.includes(`./assets/${modelName}`), `Missing overlord URL ${modelName}`);
  }

  for (const bossId of [
    'moonEye',
    'radiantWyvern',
    'banditSyndicateKing',
    'goblinKingGorg',
    'erosionRiftTyrant',
  ]) {
    const spec = encounterSpec(4, bossId);
    assert(spec.enemyIds.includes(bossId), `encounterSpec failed to mount ${bossId}`);
  }

  const mobTris = [];
  const eliteTris = [];
  const bossTris = [];
  const overlordTris = [];

  for (const enemy of [...LADDER_ENEMIES, ...LADDER_BOSSES, ...COMMON_ENEMIES, ...COMMON_BOSSES]) {
    const svg = await readFile(path.join(ASSETS, 'portraits', `${enemy.portrait}.svg`), 'utf8');
    assert.match(svg, /width="600"\s+height="900"/, `${enemy.portrait}.svg portrait dimensions`);
    const info = await inspectGlb(enemy.model);
    if (enemy.overlord) {
      assert.equal(isNonVoxelOverlordDoc(info.doc), true, `${enemy.model}: expected nonVoxel=true`);
      assert.equal(info.doc.extras?.voxelBoxes ?? 0, 0, `${enemy.model}: expected voxelBoxes=0`);
      assert(info.meshes >= 6, `${enemy.model}: expected >= 6 meshes`);
      assert(info.triangles >= 3800, `${enemy.model}: expected >= 3800 triangles`);
      overlordTris.push(info.triangles);
    } else if (enemy.boss) {
      assert.equal(info.doc.extras?.nonVoxel, false);
      assert(info.doc.extras?.voxelBoxes >= 195 && info.doc.extras?.voxelBoxes <= 300);
      assert(info.meshes >= 4);
      bossTris.push(info.triangles);
    } else if (enemy.elite) {
      assert.equal(info.doc.extras?.nonVoxel, false);
      assert(info.doc.extras?.voxelBoxes >= 105 && info.doc.extras?.voxelBoxes <= 165);
      assert(info.meshes >= 4);
      eliteTris.push(info.triangles);
    } else {
      assert.equal(info.doc.extras?.nonVoxel, false);
      assert(info.doc.extras?.voxelBoxes >= 45 && info.doc.extras?.voxelBoxes <= 80);
      assert(info.meshes >= 4);
      mobTris.push(info.triangles);
    }
  }

  for (const modelName of [
    'apep-lamb.glb',
    'radiant-wyvern.glb',
    'ares.glb',
    'ares-cannon-left.glb',
    'ares-cannon-right.glb',
    'moon-crown.glb',
    'moon-eye.glb',
    'moon-root.glb',
  ]) {
    const portraitSlug = modelName.replace(/\.glb$/, '');
    const portraitSvg = await readFile(
      path.join(ASSETS, 'portraits', `${portraitSlug}.svg`),
      'utf8',
    );
    assert.match(portraitSvg, /width="600"\s+height="900"/, `${portraitSlug}.svg dimensions`);
    assert.match(
      portraitSvg,
      /data-art-style="sculpted-overlord-v1"/,
      `${portraitSlug}.svg must use the sculpted overlord artwork`,
    );
    const info = await inspectGlb(modelName);
    assert.equal(isNonVoxelOverlordDoc(info.doc), true, `${modelName}: expected nonVoxel=true`);
    assert.equal(info.doc.extras?.voxelBoxes ?? 0, 0, `${modelName}: expected voxelBoxes=0`);
    assert(info.meshes >= 6, `${modelName}: expected >= 6 meshes`);
    assert(info.triangles >= 4000, `${modelName}: expected >= 4000 triangles`);
    if (modelName !== 'radiant-wyvern.glb') overlordTris.push(info.triangles);
  }

  assert.equal(mobTris.length, 22);
  assert.equal(eliteTris.length, 9);
  assert.equal(bossTris.length, 7);
  assert.equal(overlordTris.length, 8);
  assert(Math.max(...mobTris) < Math.min(...eliteTris), 'Mobs must have fewer tris than elites');
  assert(
    Math.max(...eliteTris) < Math.min(...bossTris),
    'Elites must have fewer tris than standard bosses',
  );
  assert(
    Math.max(...bossTris) < Math.min(...overlordTris),
    'Standard bosses must have fewer tris than Overlords',
  );
});

test('syncBuiltinWorldbook resets legacy blue-light monster entries back to green-light keyword trigger once', async () => {
  const builtin = JSON.parse(await readFile(path.join(ASSETS, 'builtin-worldbook.json'), 'utf8'));
  const saved = syncBuiltinWorldbook({ entries: {} }, builtin);
  for (const entry of Object.values(saved.entries)) {
    if (entry.extensions?.wanxiang?.monsterId) {
      entry.constant = true;
      entry.selective = false;
      delete entry.extensions.wanxiang.monsterKeywordFixed;
    }
  }
  const repaired = syncBuiltinWorldbook(saved, builtin);
  for (const entry of Object.values(repaired.entries)) {
    if (entry.extensions?.wanxiang?.monsterId) {
      assert.equal(entry.constant, false, `${entry.comment} must reset to keyword green light`);
      assert.equal(entry.selective, true);
      assert.equal(entry.extensions.wanxiang.monsterKeywordFixed, 1);
    }
  }
  assert.deepEqual(syncBuiltinWorldbook(repaired, builtin), repaired);
});

test('buildEnemyArchiveEntries splits 4 enemy tiers and combines 3 Mother Tree parts into one Overlord', () => {
  const buckets = buildEnemyArchiveEntries(DEFINITIONS);
  assert(buckets.minion.length > 0);
  assert(buckets.elite.length > 0);
  assert(buckets.boss.length > 0);
  assert.deepEqual(
    buckets.overlord.map((item) => item.id),
    ['apepLamb', 'moonTree', 'ares', 'radiantWyvern', 'alchemicalPuppet'],
  );
  const moonTree = buckets.overlord.find((item) => item.id === 'moonTree');
  assert.equal(moonTree.name, '母树');
  assert.equal(moonTree.overlord, true);
  assert.equal(moonTree.isComposite, true);
  assert.deepEqual(
    moonTree.parts.map((part) => part.id),
    ['moonCrown', 'moonEye', 'moonRoot'],
  );
  assert.deepEqual(moonTree.models, ['moon-eye.glb', 'moon-eye.glb', 'moon-eye.glb']);
});
