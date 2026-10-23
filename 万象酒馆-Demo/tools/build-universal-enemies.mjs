import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { UNIVERSAL_ENEMIES, UNIVERSAL_BOSSES } from '../src/content/universal-adversaries.js';
import { humanoidEnemyBlocks } from './build-humanoid-enemies.mjs';
import { shade, renderVoxelEnemyPortrait } from './voxel-enemy-art.mjs';

/** Original silhouettes using the same block projection/materials as the shipped enemies. */
export function universalEnemyBlocks(enemy) {
  const blocks = [];
  const base = enemy.color;
  const dark = '#303c42',
    metal = '#b6b5a0',
    light = '#c4eee2',
    stone = '#768983';
  const add = (group, x, y, z, w, d, h, color = base) =>
    blocks.push({ group, x, y, z, w, d, h, color });
  const eyes = (x, y, z, spread = 0.6) => {
    for (const side of [-1, 1]) add('Eyes', x, y, z + side * spread, 0.18, 0.32, 0.3, light);
  };
  const ridge = (x, y, z, width, count = 6) => {
    for (let i = 0; i < count; i++)
      add(
        'Ridge',
        x + i * 0.7,
        y + Math.sin((i / count) * Math.PI) * 0.5,
        z,
        0.4,
        width,
        0.65,
        i % 2 ? metal : stone,
      );
  };
  function legs(length, height, spread) {
    for (const x of [-length / 2, length / 2])
      for (const side of [-1, 1]) {
        add('Legs', x, 0.35, side * spread, 0.72, 0.8, height, dark);
        add('Joints', x + 0.1, height * 0.55, side * spread, 1, 1, 0.55, stone);
        add('Feet', x + 0.35, 0.05, side * spread, 1.5, 1, 0.45, base);
        for (let i = 0; i < 2; i++)
          add('Claws', x + 1.05, 0.06, side * spread + (i - 0.5) * 0.4, 0.5, 0.22, 0.3, metal);
      }
  }
  function beetle(shell = false) {
    for (let i = -1; i <= 1; i++)
      for (const side of [-1, 1]) {
        add('Legs', i * 2, 0.8, side * 2.6, 0.6, 2.8, 0.5, dark);
        add('Feet', i * 2 + 0.4, 0.15, side * 4, 1.2, 0.7, 0.55, stone);
      }
    add('Body', 0, 1.3, 0, 6.2, 4.4, 1.3, dark);
    for (let i = -2; i <= 2; i++)
      for (const side of [-1, 1])
        add(
          'Shell',
          i * 1.1,
          2.4 + (2 - Math.abs(i)) * 0.35,
          side * 1.08,
          1.05,
          2.05,
          1.3,
          shade(base, side < 0 ? 1.08 : 0.8),
        );
    add('Head', 3.8, 1.7, 0, 1.8, 2.4, 1.5, stone);
    eyes(4.74, 2.4, 0);
    for (const side of [-1, 1]) {
      add('Mandibles', 4.8, 1.4, side * 0.9, 1.4, 0.45, 0.55, metal);
      add('Feelers', 4.2, 3, side * 1.3, 0.3, 0.3, 1.4, dark);
      if (shell)
        for (let i = 0; i < 4; i++)
          add(
            'GatheredShells',
            -0.8 + i * 0.55,
            4 + i * 0.48,
            side * 0.7,
            2.8 - i * 0.4,
            2.1,
            0.55,
            i % 2 ? metal : stone,
          );
    }
    if (!shell) ridge(-1.5, 4.35, 0, 0.55, 5);
  }
  function coreRing(y, radius, tilt = 0, name = 'Rings') {
    for (let i = 0; i < 20; i++) {
      const angle = (i * Math.PI) / 10;
      add(
        name,
        Math.cos(angle) * radius,
        y + Math.sin(angle) * radius * tilt,
        Math.sin(angle) * radius,
        0.65,
        0.65,
        0.6,
        i % 5 === 0 ? light : metal,
      );
    }
  }
  if (['veilMender', 'dustHexer', 'trailArbalist', 'oathlessDuelist'].includes(enemy.id)) {
    const weapon =
      enemy.id === 'trailArbalist' ? 'bow' : enemy.id === 'oathlessDuelist' ? 'sword' : 'staff';
    blocks.push(
      ...humanoidEnemyBlocks({ weapon, gender: enemy.id === 'veilMender' ? 'female' : 'male' }),
    );
    for (const block of blocks) {
      if (['Cloak', 'Robe', 'Hood', 'Torso', 'Hair'].includes(block.group))
        block.color = shade(base, 0.75);
    }
    add('Mask', 1.11, 7.0, 0, 0.21, 1.45, 0.72, enemy.id === 'oathlessDuelist' ? metal : '#bdb5a1');
    if (enemy.id === 'veilMender') {
      add('MedicineSatchel', 0.2, 3.2, 2.15, 1.8, 1, 1.6, '#6b6954');
      for (let i = 0; i < 3; i++) {
        add('Vials', 0.25, 4.8, 1.75 + i * 0.36, 0.48, 0.28, 0.7, '#94bb9a');
        add('Corks', 0.25, 5.5, 1.75 + i * 0.36, 0.38, 0.22, 0.22, metal);
      }
    } else if (enemy.id === 'dustHexer') {
      for (let i = 0; i < 4; i++)
        add('PaperCharms', 1.22, 4 + i * 0.57, (i % 2 ? -1 : 1) * 0.68, 0.1, 0.43, 0.72, '#d3c7a4');
      coreRing(8.8, 2.1, 0.3, 'CharmHalo');
    } else if (enemy.id === 'trailArbalist') {
      for (let i = blocks.length - 1; i >= 0; i--)
        if (['BowLimbs', 'BowString'].includes(blocks[i].group)) blocks.splice(i, 1);
      add('CrossbowStock', 1, 4.1, -2.1, 4.2, 0.48, 0.5, '#6a624f');
      add('CrossbowLimbs', 2.2, 4.3, -2.1, 0.48, 3.6, 0.42, metal);
      add('CrossbowBolt', 1.8, 4.65, -2.1, 3.9, 0.16, 0.14, light);
    } else {
      for (const side of [-1, 1])
        add('ShoulderPlates', -0.1, 5.6, side * 1.85, 1.6, 1.1, 1.1, base);
    }
  } else if (enemy.id === 'greyProwler' || enemy.id === 'manyShellBeast') {
    const large = enemy.boss;
    legs(large ? 5 : 3.7, large ? 3.5 : 2.7, large ? 1.7 : 1.1);
    add('Body', -0.3, 2.8, 0, large ? 7.4 : 5.4, large ? 4 : 2.6, large ? 3.5 : 2.3);
    add('Neck', 2.3, 4.2, 0, 2.3, large ? 3 : 2, 2, stone);
    add('Head', 3.2, 5.1, 0, 2.6, large ? 3.2 : 2.2, 1.8);
    add('Muzzle', 4.7, 5, 0, 1.5, large ? 2.7 : 1.7, 0.85, dark);
    eyes(4.53, 6.12, 0, large ? 1.15 : 0.7);
    for (const side of [-1, 1]) {
      add('Ears', 2.7, 6.8, side * 0.9, 0.7, 0.65, 1.3, dark);
      add('Fangs', 4.9, 4.3, side * 0.65, 0.32, 0.3, 1, metal);
    }
    for (let i = 0; i < 5; i++)
      add('Tail', -3.6 - i * 0.55, 3.3 + i * 0.34, 0, 0.85, 0.8 - i * 0.08, 0.65, dark);
    ridge(-2.4, 5.35, 0, large ? 1.2 : 0.55);
    if (large)
      for (let i = 0; i < 5; i++) {
        add(
          'Carapace',
          -2.5 + i * 1.1,
          5.7 + Math.sin((i / 4) * Math.PI) * 0.65,
          0,
          1.45,
          4.8 - Math.abs(i - 2) * 0.5,
          0.95,
          i % 2 ? stone : metal,
        );
        for (const side of [-1, 1])
          add('ShellFlanks', -2.5 + i * 1.1, 4.2, side * 2, 1, 0.85, 1.7, stone);
      }
  } else if (enemy.id === 'facetSkitter' || enemy.id === 'shellGatherer') {
    beetle(enemy.id === 'shellGatherer');
  } else if (enemy.id === 'hollowSentry') {
    legs(0, 3, 1.1);
    add('Hips', 0, 3.1, 0, 2.1, 3.2, 1, dark);
    add('Chest', 0, 4, 0, 2.7, 3.2, 2.5, stone);
    add('CoreSocket', 1.42, 4.65, 0, 0.3, 1.65, 1.4, dark);
    add('Core', 1.6, 4.95, 0, 0.2, 0.8, 0.75, light);
    add('Head', 0.2, 6.8, 0, 2, 2, 1.6, base);
    eyes(1.23, 7.55, 0);
    for (const side of [-1, 1]) {
      add('Shoulders', 0, 5.7, side * 2.2, 2.1, 1.5, 1.1, metal);
      add('Arms', 0.5, 2.7, side * 2.2, 1.25, 1.3, 2.9, base);
      add('Gauntlets', 1, 2.5, side * 2.2, 2, 1.8, 1.6, stone);
      for (let i = 0; i < 3; i++)
        add('KnuckleBands', 1.95, 2.7 + i * 0.42, side * 2.2, 0.16, 1.25, 0.24, metal);
    }
  } else if (enemy.id === 'greyStinger') {
    for (let i = 0; i < 6; i++)
      add(
        'Abdomen',
        -2.5 + i * 0.7,
        3.7 + Math.sin(i * 0.6) * 0.3,
        0,
        0.82,
        2.7 - Math.abs(i - 2) * 0.3,
        1.9,
        i % 2 ? dark : base,
      );
    add('Head', 2.1, 4.3, 0, 1.8, 1.7, 1.8, dark);
    eyes(3.03, 5.2, 0);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++)
        add(
          'Wings',
          -0.3 - i * 0.32,
          5.5 + i * 0.17,
          side * (1.25 + i * 0.55),
          3.3 - i * 0.32,
          0.7,
          0.24,
          i % 2 ? '#a6b9ae' : '#c8cdc0',
        );
      for (let i = 0; i < 3; i++) add('Legs', -1 + i * 1.1, 1.9, side * 1.3, 0.25, 0.3, 2.4, dark);
    }
    add('Stinger', -3.6, 3.5, 0, 1.6, 0.35, 0.35, metal);
  } else if (enemy.id === 'riftMote') {
    for (let i = 0; i < 5; i++)
      add(
        'Core',
        0,
        3.8 + i * 0.5,
        0,
        3 - Math.abs(i - 2) * 0.7,
        3 - Math.abs(i - 2) * 0.7,
        0.55,
        i % 2 ? base : light,
      );
    for (let i = 0; i < 9; i++) {
      const a = (i * Math.PI * 2) / 9;
      add(
        'OrbitFragments',
        Math.cos(a) * 3.4,
        3.4 + Math.sin(a * 2) * 1.4,
        Math.sin(a) * 3.4,
        0.8,
        0.8,
        1.1,
        i % 2 ? stone : base,
      );
    }
    for (let i = 0; i < 5; i++)
      add(
        'TrailingShards',
        Math.sin(i) * 0.5,
        2.8 - i * 0.5,
        0,
        0.65 - i * 0.07,
        0.65 - i * 0.07,
        0.45,
        metal,
      );
    coreRing(5, 2.6, 0.45);
  } else if (enemy.id === 'unmooredJudge') {
    for (let i = 0; i < 5; i++)
      add(
        'FloatingMantle',
        0,
        1 + i * 0.8,
        0,
        2.9 - i * 0.2,
        4.4 - i * 0.35,
        0.85,
        i % 2 ? dark : base,
      );
    add('Torso', 0, 5, 0, 2.5, 3.2, 2.7, stone);
    add('Mask', 1.3, 7.7, 0, 0.5, 2.3, 2.4, metal);
    add('EyeSlit', 1.58, 8.85, 0, 0.1, 1.45, 0.25, light);
    for (const side of [-1, 1]) {
      add('BalanceArms', 0, 6.6, side * 3.2, 1.1, 3.7, 0.8, metal);
      add('BalanceChains', 0, 3.5, side * 4.5, 0.24, 0.24, 3.6, dark);
      add('BalancePans', 0, 3.3, side * 4.5, 2.3, 2.2, 0.4, base);
      for (let i = 0; i < 3; i++)
        add('JudgementStones', (i - 1) * 0.5, 3.7, side * 4.5, 0.45, 0.6, 0.7 + i * 0.2, light);
    }
    coreRing(8, 3.1, 0.9, 'CrownRing');
  } else if (enemy.id === 'returningCore') {
    for (let i = 0; i < 9; i++)
      add(
        'CrystalHeart',
        0,
        2.8 + i * 0.6,
        0,
        3.5 - Math.abs(i - 4) * 0.65,
        3.5 - Math.abs(i - 4) * 0.65,
        0.65,
        i % 2 ? light : base,
      );
    coreRing(3, 4.3, 0.25, 'LowerRing');
    coreRing(5.5, 4.8, 0.65, 'EquatorRing');
    coreRing(7.7, 3.5, 0.4, 'UpperRing');
    for (let i = 0; i < 6; i++) {
      const angle = (i * Math.PI) / 3;
      const x = Math.cos(angle) * 4.3,
        z = Math.sin(angle) * 4.3;
      add('RingLocks', x, 4.6 + (i % 2), z, 1.15, 1.15, 1.6, stone);
      add('RingLights', x + 0.12, 5.25 + (i % 2), z, 0.9, 0.9, 0.35, light);
    }
  } else throw Error('Unknown universal enemy: ' + enemy.id);
  return blocks;
}

export async function buildUniversalEnemies({ exportModels = true } = {}) {
  const source = new URL('../../万象异境-体素模型/通用敌人/', import.meta.url);
  await mkdir(source, { recursive: true });
  const enemies = [...UNIVERSAL_ENEMIES, ...UNIVERSAL_BOSSES];
  for (const enemy of enemies) {
    const blocks = universalEnemyBlocks(enemy);
    await writeFile(
      new URL(`${enemy.portrait}.json`, source),
      JSON.stringify(
        { id: enemy.id, name: enemy.name, model: enemy.model, portrait: enemy.portrait, blocks },
        null,
        2,
      ) + '\n',
    );
    await writeFile(
      new URL(`../assets/portraits/${enemy.portrait}.svg`, import.meta.url),
      renderVoxelEnemyPortrait(enemy, blocks),
    );
  }
  if (exportModels) {
    const python =
      process.env.PYTHON_EXECUTABLE ||
      fileURLToPath(new URL('../../建模工具/.venv/Scripts/python.exe', import.meta.url));
    const result = spawnSync(
      python,
      [fileURLToPath(new URL('../../建模工具/build_universal_enemies.py', import.meta.url))],
      { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
    );
    if (result.status !== 0)
      throw Error(result.error?.message || result.stderr || '通用敌人模型导出失败');
    console.log(result.stdout.trim());
  }
  return enemies.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  console.log(`Built ${await buildUniversalEnemies()} universal enemies`);
