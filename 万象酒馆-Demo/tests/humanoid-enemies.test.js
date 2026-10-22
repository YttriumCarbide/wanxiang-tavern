import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { HUMANOID_ENEMY_TEMPLATES } from '../src/content/enemy-templates.js';
import { PORTRAIT_TEMPLATES } from '../src/content/portrait-templates.js';
import { worldReference, normalizeWorld, restoreWorlds } from '../src/worlds.js';
import { mapInput } from '../src/ai/pipeline/map-request.js';
import { worldFixture } from './fixtures/multiverse.js';
import { upgradeEnemyAppearanceRules } from '../src/ai/enemy-appearance-rules.js';
import {
  EXTRA_ENEMIES,
  RUINS_ADVERSARIES,
  EXTRA_BOSSES,
  RUINS_BOSSES,
} from '../src/content/new-adversaries.js';
import { enemyPortrait } from '../tools/build-enemy-portraits.mjs';

test('generated enemy appearances contain six voxel humans and no teammate art; both normal and boss enemies accept them', () => {
  const appearances = mapInput({ brief: '人形守卫与术师巡逻的古堡' }).reference.appearances;
  assert.equal(HUMANOID_ENEMY_TEMPLATES.length, 6);
  for (const template of HUMANOID_ENEMY_TEMPLATES)
    assert(appearances.some((entry) => entry.portrait === template.portrait));
  for (const template of PORTRAIT_TEMPLATES)
    assert(!appearances.some((entry) => entry.portrait === template.portrait));
  assert(
    !appearances.some((entry) =>
      /^(?:guardian|healer|swordswoman|ranger|chronomancer|warlock|edith\.png|pandora\.png|changjing-yuexi\.png)$/.test(
        entry.portrait,
      ),
    ),
  );
  const raw = worldFixture();
  raw.enemies = HUMANOID_ENEMY_TEMPLATES.map((template, index) => ({
    ...raw.enemies[0],
    id: `enemy-human-${index}`,
    name: template.name,
    portrait: template.portrait,
    boss: index === 5,
  }));
  const world = normalizeWorld(raw);
  assert.equal(Object.keys(world.enemyDefinitions).length, 6);
  assert(world.enemyDefinitions['enemy-human-5'].boss);
  assert.deepEqual(restoreWorlds([world]), [world]);
  raw.enemies[0].portrait = PORTRAIT_TEMPLATES[0].portrait;
  assert.throws(() => normalizeWorld(raw), /外貌/);
});

test('old illustrated enemy saves migrate to equivalent voxel templates without losing the world or enemy mechanics', () => {
  const raw = worldFixture();
  raw.enemies = PORTRAIT_TEMPLATES.map((template, index) => ({
    ...raw.enemies[0],
    id: `enemy-legacy-${index}`,
    portrait: HUMANOID_ENEMY_TEMPLATES[index].portrait,
    boss: index === 5,
  }));
  const world = normalizeWorld(raw);
  const saved = structuredClone(world);
  Object.values(saved.enemyDefinitions).forEach(
    (enemy, index) => (enemy.portrait = PORTRAIT_TEMPLATES[index].portrait),
  );
  const restored = restoreWorlds([saved]);
  assert.deepEqual(restored, [world]);
  assert(
    PORTRAIT_TEMPLATES.every(
      (template, index) =>
        saved.enemyDefinitions[`enemy-legacy-${index}`].portrait === template.portrait,
    ),
  );
  saved.enemyDefinitions['enemy-legacy-0'].portrait = 'changjing-yuexi.png';
  assert.equal(
    restoreWorlds([saved])[0].enemyDefinitions['enemy-legacy-0'].portrait,
    'enemy-humanoid-sword-female',
  );
});

test('humanoid source blocks, exported GLB meshes and card portraits describe the same six pedestal-free models', async () => {
  for (const template of HUMANOID_ENEMY_TEMPLATES) {
    const source = JSON.parse(
      await readFile(
        new URL(`../../万象异境-体素模型/人形敌人/${template.portrait}.json`, import.meta.url),
        'utf8',
      ),
    );
    const bytes = await readFile(new URL(`../assets/${template.model}`, import.meta.url));
    assert.equal(bytes.readUInt32LE(0), 0x46546c67);
    assert.equal(bytes.readUInt32LE(8), bytes.length);
    const size = bytes.readUInt32LE(12);
    const gltf = JSON.parse(bytes.toString('utf8', 20, 20 + size));
    assert.equal(gltf.extras.voxelBoxes, source.blocks.length);
    assert.equal(gltf.extras.displayPlinth, false);
    assert.equal(gltf.extras.templateId, template.id);
    assert(gltf.meshes.length > 8);
    const positions = gltf.meshes.map(
      (mesh) => gltf.accessors[mesh.primitives[0].attributes.POSITION],
    );
    assert.equal(
      positions.reduce((count, accessor) => count + accessor.count, 0),
      source.blocks.length * 24,
    );
    assert(
      positions.every(
        (accessor) => accessor.min.every(Number.isFinite) && accessor.max.every(Number.isFinite),
      ),
    );
    assert(
      source.blocks.every((block) => block.y >= 0 && !/base|plinth|pedestal/i.test(block.group)),
    );
    const svg = await readFile(
      new URL(`../assets/portraits/${template.portrait}.svg`, import.meta.url),
      'utf8',
    );
    assert.match(svg, /data-art-style="isometric-voxel-v3"/);
    assert.equal((svg.match(/<polygon/g) || []).length, source.blocks.length * 3);
    assert(!svg.includes('<image'));
    assert(worldReference().appearances.some((entry) => entry.portrait === template.portrait));
  }
});

test('sharing the portrait renderer keeps all existing creature artwork byte-for-byte unchanged', async () => {
  for (const enemy of [
    ...EXTRA_ENEMIES.filter((entry) => entry.id !== 'crystalBeetle'),
    ...RUINS_ADVERSARIES,
    ...EXTRA_BOSSES,
    ...RUINS_BOSSES,
  ]) {
    assert.equal(
      enemyPortrait(enemy),
      await readFile(new URL(`../assets/portraits/${enemy.portrait}.svg`, import.meta.url), 'utf8'),
    );
  }
});

test('appearance guidance replaces only obsolete allowances and preserves edited rules and switches', () => {
  const book = {
    entries: {
      3: {
        uid: 3,
        disable: true,
        order: 71,
        content:
          '自定义背景。所有外貌只能从提供的appearances选择，包括默认队友图标。Boss外貌可选任意已有怪物或角色图标，不必使用Boss图标。',
        extensions: { wanxiang: { generationRule: 'map-output' } },
      },
      4: { content: '私有剧情' },
    },
  };
  const result = upgradeEnemyAppearanceRules(book);
  assert.equal(result.entries[3].disable, true);
  assert.equal(result.entries[3].order, 71);
  assert(result.entries[3].content.includes('自定义背景。'));
  assert(!result.entries[3].content.includes('包括默认队友图标'));
  assert(result.entries[3].content.includes('【敌人专用外貌】'));
  assert.deepEqual(result.entries[4], book.entries[4]);
  assert.deepEqual(upgradeEnemyAppearanceRules(result), result);
});
