import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FROST_ENEMIES, FROST_BOSSES } from '../src/content/frost-adversaries.js';
import { renderVoxelEnemyPortrait } from './voxel-enemy-art.mjs';

/** Chunky industrial silhouettes use the same block material and card framing as existing enemies. */
export function frostEnemyBlocks(enemy) {
  const blocks = [];
  const index = [...FROST_ENEMIES, ...FROST_BOSSES].findIndex((entry) => entry.id === enemy.id);
  const steel = '#657f8b',
    dark = '#293d48',
    light = '#b8d4d8',
    crystal = '#9ee9f1';
  const shell = ['#a38156', '#637c8e', '#899b9d', '#82948c'][Math.max(0, index) % 4];
  const add = (group, x, y, z, w, d, h, color = shell) =>
    blocks.push({ group, x, y, z, w, d, h, color });
  const eye = (x, y, z = 0, width = 1.6) => {
    add('OpticHousing', x, y, z, 0.4, width + 0.45, 0.8, dark);
    add('OpticLens', x + 0.24, y + 0.2, z, 0.15, width, 0.32, '#e8c579');
  };
  const shard = (x, y, z, size = 1) => {
    add('CrystalBase', x, y, z, size, size, size * 1.2, '#5195ae');
    add(
      'CrystalTip',
      x + size * 0.15,
      y + size * 1.2,
      z,
      size * 0.55,
      size * 0.6,
      size * 0.65,
      crystal,
    );
  };
  const tracks = (width = 2.1) => {
    for (const side of [-1, 1]) {
      add('Tracks', 0, 0.1, side * width, 4.8, 1.1, 1.25, dark);
      for (let i = 0; i < 7; i++)
        add('TreadRibs', -2 + i * 0.65, 0.32, side * width, 0.32, 1.2, 0.86, steel);
    }
  };
  const legs = (count, spread = 2.2) => {
    for (let i = 0; i < count; i++)
      for (const side of [-1, 1]) {
        const x = (i - (count - 1) / 2) * 1.3;
        add('LegJoints', x, 1.4, side * spread, 0.7, 0.8, 1.15, steel);
        add('Legs', x + 0.3, 0.2, side * (spread + 0.4), 0.5, 0.6, 1.8, dark);
        add('Claws', x + 0.65, 0.06, side * (spread + 0.4), 1.2, 0.75, 0.3, light);
      }
  };
  if (/Worm|Borer|Larva|Mite|Matriarch/.test(enemy.id)) {
    const segments = enemy.boss ? 7 : enemy.id === 'clingLarva' ? 4 : 5;
    for (let i = 0; i < segments; i++) {
      const size = 2.1 - i * 0.13;
      add(
        'Carapace',
        2.3 - i * 0.9,
        1.1 + Math.sin(i * 0.6) * 0.3,
        0,
        1.1,
        size,
        size * 0.8,
        i % 2 ? steel : shell,
      );
      if (i % 2 === 0) shard(2.3 - i * 0.9, 2.8, 0, 0.6);
    }
    legs(3, 1.4);
    for (let i = 0; i < 5; i++)
      add(
        'DrillHead',
        3 + i * 0.38,
        1.5 + i * 0.09,
        0,
        0.45,
        2 - i * 0.33,
        1.5 - i * 0.24,
        i % 2 ? light : steel,
      );
    eye(2.85, 2.7, 0, 1.1);
    if (enemy.boss)
      for (const side of [-1, 1])
        add('SalvagedExcavators', -1, 3, side * 1.5, 3.1, 0.8, 1.8, shell);
  } else if (/Sprite|Wisp/.test(enemy.id)) {
    add('FloatingCore', 0, 2.8, 0, 2.4, 2.3, 2.5, dark);
    shard(0, 3.2, 0, 1.8);
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7;
      shard(Math.cos(angle) * 2.3, 2.6 + Math.sin(angle * 2) * 1.1, Math.sin(angle) * 2.3, 0.65);
    }
  } else if (/Cannon|Drone/.test(enemy.id)) {
    add('FloatingHull', 0, 2.6, 0, 3.6, 2.8, 1.7, steel);
    add('Thruster', -1.5, 2.8, 0, 0.7, 2.1, 1, dark);
    for (const side of [-1, 1]) {
      add('Stabilizers', -0.4, 3.2, side * 2.3, 2.7, 1.1, 0.4, shell);
      add('ThrusterGlow', -1.7, 2.5, side * 0.7, 0.3, 0.5, 0.8, crystal);
    }
    if (enemy.id === 'sentryDrone') eye(1.9, 2.9, 0, 1.8);
    else
      for (const side of [-1, 1]) {
        add('GunBarrel', 2, 3.1, side * 0.65, 3.2, 0.55, 0.55, dark);
        add('MuzzleRing', 3.5, 3.05, side * 0.65, 0.5, 0.8, 0.8, light);
      }
  } else if (enemy.id === 'railSpider' || enemy.id === 'scrapHound') {
    legs(enemy.id === 'railSpider' ? 4 : 2);
    add('Chassis', 0, 2, 0, 4.2, 3, 1.5, steel);
    add('Head', 2.15, 2.4, 0, 1.7, 1.9, 1.3);
    eye(3.03, 2.75, 0, 1.2);
    add('SpineRail', -0.4, 3.5, 0, 3.8, 0.6, 0.5, light);
    shard(-1.5, 3.7, 0, 0.9);
  } else if (enemy.id === 'rogueArm' || enemy.id === 'repairOverseer') {
    tracks(1.6);
    add('Turntable', 0, 1.3, 0, 3, 3, 1.2, steel);
    for (let i = 0; i < 4; i++) {
      add('Boom', -0.7 + i * 0.55, 2.2 + i * 1.1, 0, 1.25, 1.3, 1.3);
      add('Hydraulics', -1.4 + i * 0.55, 2.4 + i * 1.1, 0, 0.35, 1.6, 0.7, light);
    }
    const arms = enemy.boss ? [-1, 1] : [1];
    for (const side of arms) {
      add('CraneForearm', 2.4, 6, side * 1.4, 3.8, 1.1, 0.8, steel);
      for (const jaw of [-1, 1])
        add('Clamp', 4.2, 4.8, side * 1.4 + jaw * 0.55, 0.6, 0.45, 1.8, light);
    }
  } else if (enemy.id === 'ares') {
    for (const side of [-1, 1]) {
      add('Feet', 0.35, 0, side * 1.3, 2.3, 1.5, 0.7, dark);
      add('Legs', 0, 0.7, side * 1.3, 1.2, 1.3, 2.4, steel);
      add('KneeArmor', 0.65, 1.9, side * 1.3, 0.65, 1.5, 1.1, light);
      add('Shoulders', 0, 5.7, side * 2.1, 2.4, 1.5, 1.6, '#8f5252');
      add('Arms', 0.2, 3.5, side * 2.2, 1.1, 1.1, 2.4, steel);
      add('MissileRack', -1.4, 5.9, side * 1.5, 1.4, 1.2, 2.1, dark);
      for (let i = 0; i < 3; i++)
        add('Missiles', -0.62, 6.2 + i * 0.48, side * 1.5, 0.22, 0.65, 0.28, '#ddbf7d');
    }
    add('Torso', 0, 3, 0, 2.7, 2.9, 3.2, dark);
    add('Breastplate', 1.1, 4, 0, 0.65, 2.6, 1.8, '#a0635a');
    shard(1.5, 4.1, 0, 0.65);
    add('Head', 0.25, 6.3, 0, 1.4, 1.7, 1.3, steel);
    eye(1, 6.75);
    add('GreatSword', 1.9, 0.5, 2.65, 0.65, 1.1, 5.3, light);
    add('SwordEdge', 2.3, 0.5, 2.65, 0.22, 0.6, 5.3, crystal);
    add('SwordGuard', 1.9, 5.7, 2.65, 1.5, 2, 0.4, '#d1b476');
  } else {
    tracks(enemy.boss ? 2.5 : 1.9);
    add('Chassis', 0, 1.3, 0, 3.8, 3.5, 2, steel);
    add('UpperHull', -0.3, 3.3, 0, 2.7, 2.9, 1.8);
    eye(1.1, 4);
    const cargo = /Carrier|Crawler/.test(enemy.id);
    if (cargo) {
      add('CargoRack', -1.4, 4.5, 0, 3.2, 3.5, 0.4, dark);
      for (const side of [-1, 1]) shard(-1.4, 4.9, side, 1.1);
    } else {
      for (const side of [-1, 1]) {
        add('ToolArms', 1, 2.4, side * 2, 2.7, 0.8, 1.1, dark);
        add('ToolClamps', 2.5, 1.9, side * 2, 1, 1.2, enemy.boss ? 2.7 : 1.5, light);
      }
      if (/crystal|Devourer/.test(enemy.id))
        for (let i = 0; i < 3; i++) shard(-0.8, 5, (i - 1) * 0.9, 0.8);
      else add('Exhaust', -1.6, 4.2, -1.1, 0.6, 0.6, 1.6, dark);
      if (enemy.id === 'settlementLeader')
        for (let i = 0; i < 4; i++)
          add('Nameplates', 2.04, 2.8 + i * 0.34, 0, 0.16, 1.8, 0.25, '#d7be8e');
      if (enemy.id === 'lostWelder') add('WeldingTorch', 3.2, 2.3, 2, 0.8, 0.6, 0.6, crystal);
    }
  }
  return blocks;
}

export async function buildFrostEnemies() {
  const source = new URL('../../万象异境-体素模型/霜晶矿窟/', import.meta.url);
  await mkdir(source, { recursive: true });
  const enemies = [...FROST_ENEMIES, ...FROST_BOSSES];
  for (const enemy of enemies) {
    const blocks = frostEnemyBlocks(enemy);
    await writeFile(
      new URL(enemy.portrait + '.json', source),
      JSON.stringify(
        { id: enemy.id, name: enemy.name, model: enemy.model, portrait: enemy.portrait, blocks },
        null,
        2,
      ) + '\n',
    );
    await writeFile(
      new URL('../assets/portraits/' + enemy.portrait + '.svg', import.meta.url),
      renderVoxelEnemyPortrait(enemy, blocks),
    );
  }
  const result = spawnSync(
    fileURLToPath(new URL('../../建模工具/.venv/Scripts/python.exe', import.meta.url)),
    [fileURLToPath(new URL('../../建模工具/build_frost_enemies.py', import.meta.url))],
    { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
  );
  if (result.status !== 0)
    throw Error(result.error?.message || result.stderr || '矿窟敌人导出失败');
  console.log(result.stdout.trim());
  return enemies.length;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  console.log(`Built ${await buildFrostEnemies()} frost enemies`);
