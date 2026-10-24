import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FOREST_ENEMIES, FOREST_BOSSES } from '../src/content/forest-adversaries.js';
import { humanoidEnemyBlocks } from './build-humanoid-enemies.mjs';
import { universalEnemyBlocks } from './build-universal-enemies.mjs';
import { renderVoxelEnemyPortrait, shade } from './voxel-enemy-art.mjs';

/** Body geometry doubles as portrait geometry; no display plinth or separate illustration. */
export function forestEnemyBlocks(enemy) {
  const blocks = [];
  const base = enemy.color,
    bark = '#565b45',
    dark = '#293c3c',
    glow = '#a5e8e5';
  const add = (group, x, y, z, w, d, h, color = base) =>
    blocks.push({ group, x, y, z, w, d, h, color });
  const branch = (group, start, end, size, color = base) => {
    const count = Math.ceil(Math.hypot(...end.map((n, i) => n - start[i])) / (size * 0.7));
    for (let i = 0; i <= count; i++) {
      const [x, y, z] = start.map((n, j) => n + ((end[j] - n) * i) / count);
      add(group, x, y, z, size, size, size, color);
    }
  };
  const eyes = (x, y, spread = 0.7) => {
    for (const side of [-1, 1]) {
      add('EyeSockets', x, y, side * spread, 0.22, 0.65, 0.6, dark);
      add('MoonEyes', x + 0.15, y + 0.12, side * spread, 0.15, 0.27, 0.3, glow);
    }
  };
  const roots = (height = 3, spread = 4) => {
    for (let i = 0; i < 7; i++) {
      const a = (i * Math.PI * 2) / 7;
      const end = [Math.cos(a) * spread, 0.15, Math.sin(a) * spread];
      branch('RootLimbs', [0, height, 0], end, 0.64, bark);
      branch('RootTips', end, [end[0] * 1.2, 0.1, end[2] * 1.2], 0.35, base);
    }
  };
  if (enemy.shape === 'bee') {
    blocks.push(...universalEnemyBlocks({ ...enemy, id: 'greyStinger' }));
    if (enemy.id === 'moonWorker') {
      add('CarriedShard', 2.8, 2, 0, 1.4, 1.2, 1.3, glow);
      add('ShardFacet', 3.05, 3.3, 0, 0.8, 0.8, 0.65, '#7aabc5');
    } else if (enemy.id === 'hiveGuard') {
      for (let i = 0; i < 4; i++)
        add(
          'WaxShield',
          2.95,
          1.7 + i * 0.8,
          1.25,
          0.5,
          2.7 - Math.abs(i - 1.5) * 0.5,
          0.84,
          '#cbbd82',
        );
      for (const side of [-1, 1]) add('WaxArmor', 0.7, 4.7, side * 1.4, 2.8, 0.6, 1.2, '#b8a46a');
    } else {
      for (let i = 0; i < 5; i++)
        add('QueenCrown', 2.1, 6.1 + Math.abs(i - 2) * 0.15, (i - 2) * 0.5, 0.5, 0.38, 1.1, glow);
      for (let i = 0; i < 4; i++)
        add(
          'RoyalAbdomen',
          -3.1 - i * 0.48,
          3.4 + i * 0.28,
          0,
          0.8,
          2.6 - i * 0.3,
          1.8,
          i % 2 ? bark : base,
        );
      for (const side of [-1, 1])
        branch('RoyalFeelers', [2.3, 6, side * 0.8], [3.3, 8.3, side * 1.8], 0.3, '#dcd1a0');
    }
  } else if (enemy.shape === 'lizard' || enemy.shape === 'cultist') {
    const weapon =
      enemy.id === 'scaleArcher' ? 'bow' : enemy.shape === 'cultist' ? 'staff' : 'sword';
    const human = humanoidEnemyBlocks({ weapon, gender: 'male' });
    const remove = ['Hair', 'Eyes', 'Brow', 'Ears', 'Face'];
    for (const block of human) {
      if (remove.includes(block.group)) continue;
      if (['Head', 'Neck', 'Hands', 'Torso', 'Robe', 'Cloak'].includes(block.group))
        block.color = shade(base, 0.85);
      blocks.push(block);
    }
    if (enemy.shape === 'lizard') {
      add('Snout', 1, 6.75, 0, 1.6, 1.65, 0.9, base);
      add('Jaw', 1.15, 6.58, 0, 1.7, 1.6, 0.22, '#a4ae89');
      eyes(1.08, 7.55, 0.8);
      for (let i = 0; i < 6; i++) {
        add('ScaleCrest', -0.15 - i * 0.12, 8.3 - i * 0.37, 0, 0.5, 0.3, 0.65, i % 2 ? glow : bark);
        add(
          'Tail',
          -1.2 - i * 0.6,
          3.6 - i * 0.46,
          0,
          0.85,
          1.2 - i * 0.12,
          0.75,
          shade(base, 0.8),
        );
      }
      if (enemy.id === 'scaleShield' || enemy.boss) {
        for (let i = 0; i < 5; i++)
          add(
            'CityShield',
            1.2,
            1.5 + i * 0.8,
            2.1,
            0.5,
            2.4 - Math.abs(i - 2) * 0.3,
            0.85,
            '#657f78',
          );
        add('ShieldMoon', 1.49, 3.1, 2.1, 0.14, 1.1, 0.55, glow);
      }
      if (enemy.boss) {
        for (const side of [-1, 1])
          add('CaptainPauldrons', 0, 5.65, side * 1.9, 1.9, 1.25, 1.2, '#bfbd8c');
        branch('Standard', [-0.6, 4, -2.3], [-0.6, 10.6, -2.3], 0.25, bark);
        add('CityStandard', -0.6, 8.6, -3, 0.2, 1.8, 1.7, base);
      }
    } else {
      add('WoodMask', 1, 6.65, 0, 0.55, 2, 1.9, bark);
      eyes(1.32, 7.6, 0.48);
      for (const side of [-1, 1]) {
        branch('Antler', [0, 8, side * 0.7], [-0.1, 10, side * 1.7], 0.35, bark);
        branch('AntlerFork', [-0.1, 9, side * 1.3], [0.7, 9.5, side * 2.2], 0.3, bark);
      }
      for (let i = 0; i < 4; i++)
        add('MouthStitches', 1.32, 6.9, (i - 1.5) * 0.3, 0.15, 0.1, 0.6, '#b0bba0');
      add('Bell', 1.2, 3.8, -2.3, 1.2, 1.2, 0.85, '#c2a66e');
      if (enemy.boss)
        for (let i = 0; i < 8; i++) {
          const a = (i * Math.PI) / 4;
          branch('LivingMantle', [0, 5, 0], [Math.cos(a) * 3.3, 1, Math.sin(a) * 3.3], 0.5, base);
        }
    }
  } else if (enemy.shape === 'vine') {
    roots(2, 2.7);
    for (let i = 0; i < 17; i++) {
      const a = i * 0.6;
      add(
        'CoiledStem',
        Math.cos(a) * 1.2,
        1 + i * 0.4,
        Math.sin(a) * 1.2,
        1.05,
        1.05,
        0.6,
        i % 4 === 0 ? glow : base,
      );
    }
    for (const side of [-1, 1]) {
      branch('SnaringArms', [0, 5, 0], [2.5, 6.5, side * 3], 0.55, base);
      branch('HookTips', [2.5, 6.5, side * 3], [3.4, 5.2, side * 2.5], 0.35, bark);
      for (let i = 0; i < 3; i++)
        add('Leaves', 0, 4 + i, side * 1.3, 1.4, 1.3, 0.28, shade(base, 1.2));
    }
    if (enemy.id === 'livingVine') {
      add('SnaredBasket', 1.8, 1, -1.7, 1.5, 1.6, 1.5, '#a08b60');
      for (let i = 0; i < 3; i++)
        add('BasketWeave', 2.58, 1.2 + i * 0.4, -1.7, 0.1, 1.65, 0.13, '#d1bc89');
    }
  } else if (enemy.shape === 'moth') {
    add('Body', 0, 2.1, 0, 3, 1.4, 1.4, dark);
    add('Head', 2, 3, 0, 1.5, 1.5, 1.4, base);
    eyes(2.8, 3.6, 0.5);
    for (const side of [-1, 1]) {
      for (let i = 0; i < 7; i++) {
        add(
          'MoonWings',
          -0.3 + i * 0.2,
          3.5 + i * 0.25,
          side * (1.2 + i * 0.48),
          3.4 - Math.abs(i - 3) * 0.48,
          0.65,
          0.38,
          i % 3 === 0 ? glow : base,
        );
        add(
          'LowerWings',
          -1.5 + i * 0.13,
          2.5 + i * 0.13,
          side * (1 + i * 0.38),
          2.4 - i * 0.22,
          0.55,
          0.28,
          shade(base, 0.7),
        );
      }
      branch('Feelers', [2, 4, side * 0.4], [2.8, 5.5, side * 1.2], 0.2, glow);
      branch('Legs', [1, 2.4, side * 0.4], [1.5, 0.8, side * 1.8], 0.2, bark);
    }
  } else if (enemy.shape === 'worm') {
    for (let i = 0; i < 8; i++) {
      const radius = 1.7 - Math.abs(i - 3.5) * 0.2;
      add(
        'Segments',
        -2.6 + i * 0.8,
        0.25 + Math.sin(i * 0.45) * 0.5,
        0,
        0.9,
        radius * 2,
        radius,
        i % 2 ? shade(base, 0.8) : base,
      );
      for (const side of [-1, 1])
        add('Feet', -2.6 + i * 0.8, 0.06, side * radius, 0.5, 0.5, 0.35, bark);
    }
    eyes(3.5, 1.1, 0.7);
    if (enemy.id === 'honeyLarva') {
      for (let i = 0; i < 5; i++)
        add(
          'HoneySac',
          -0.7,
          1.5 + i * 0.5,
          0,
          3 - Math.abs(i - 2) * 0.6,
          2.4 - Math.abs(i - 2) * 0.4,
          0.55,
          '#c9ce92',
        );
      add('MoonSediment', -0.5, 2.9, 1.02, 1.2, 0.2, 0.65, glow);
    } else add('Sucker', 3.55, 0.3, 0, 0.6, 1.4, 0.8, dark);
  } else if (enemy.shape === 'mushroom') {
    roots(1.7, 2.1);
    add('Stem', 0, 0.7, 0, 1.7, 1.8, 3.8, '#a2b2a1');
    for (let i = 0; i < 5; i++)
      add(
        'SporeCap',
        0,
        4 + i * 0.5,
        0,
        6 - Math.abs(i - 1) * 0.9,
        5.5 - Math.abs(i - 1) * 0.8,
        0.6,
        i % 2 ? shade(base, 0.8) : base,
      );
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++)
        add('LuminousPores', 1.5, 4.6, side * (0.6 + i * 0.5), 0.35, 0.35, 0.6, glow);
      add('HangingSporeSacs', 0, 2.5, side * 1.9, 1.1, 1.1, 1.5, glow);
    }
  } else if (enemy.shape === 'mud') {
    for (let i = 0; i < 7; i++)
      add(
        'MudBody',
        0,
        0.1 + i * 0.7,
        0,
        5 - Math.abs(i - 2) * 0.65,
        4.5 - Math.abs(i - 2) * 0.55,
        0.85,
        i % 2 ? shade(base, 0.8) : base,
      );
    for (const side of [-1, 1]) {
      branch('MudArms', [0, 3, side * 1.5], [2, 1, side * 3], 1, base);
      add('MudFists', 2, 0.25, side * 3.2, 2.1, 1.9, 1.5, bark);
    }
    add('ExposedCore', 2.15, 2.1, 0, 0.4, 1.5, 1.8, glow);
    eyes(1.75, 4, 0.8);
    if (enemy.boss)
      for (let i = 0; i < 5; i++)
        add(
          'CrownStones',
          -0.5,
          4.3 + i * 0.4,
          (i - 2) * 0.7,
          1,
          1,
          1.8 - Math.abs(i - 2) * 0.3,
          '#7d9490',
        );
  } else if (enemy.shape === 'frog') {
    add('Body', 0, 1.4, 0, 5.5, 4.8, 2.9, base);
    add('Belly', 1.7, 1, 0, 2.1, 4.2, 2.2, '#b3b88b');
    add('Mouth', 2.85, 2, 0, 0.3, 3.3, 0.25, dark);
    for (const side of [-1, 1]) {
      add('HindLeg', -1.7, 0.6, side * 2.7, 3.3, 2, 2.3, shade(base, 0.75));
      add('ForeLeg', 2, 0.25, side * 2.15, 1.2, 1.1, 2.3, base);
      add('FrogFeet', 2.5, 0.05, side * 2.5, 2, 1.7, 0.4, bark);
      add('RaisedEyes', 1.7, 4, side * 1.6, 1.5, 1.5, 1.3, base);
      add('Iris', 2.48, 4.45, side * 1.6, 0.15, 0.7, 0.65, '#dbc67c');
      add('Pupils', 2.58, 4.55, side * 1.6, 0.1, 0.22, 0.4, dark);
      for (let i = 0; i < 4; i++)
        add('Moss', -1.6 + i * 0.8, 4.3, side * 0.9, 1, 1.1, 0.4, shade(base, 0.7));
      branch('BeeStings', [-1, 4.4, side], [0, 5.5, side * 1.2], 0.18, glow);
    }
  } else if (['tree', 'root', 'crown', 'eye'].includes(enemy.shape)) {
    roots(enemy.shape === 'crown' ? 4 : 2.5, enemy.boss ? 4.5 : 3.5);
    for (let i = 0; i < 8; i++)
      add(
        'Trunk',
        Math.sin(i * 0.6) * 0.35,
        0.5 + i * 0.7,
        0,
        2.4 - Math.abs(i - 3) * 0.15,
        2.5,
        0.8,
        i % 2 ? bark : base,
      );
    for (const side of [-1, 1]) {
      branch('BranchArms', [0, 4, side], [1, 6, side * 3.1], 0.7, bark);
      branch('BranchFingers', [1, 6, side * 3.1], [2, 7, side * 3.8], 0.4, base);
      branch('MoonConduits', [0.9, 1, side * 0.6], [1, 5, side * 0.7], 0.24, glow);
    }
    if (enemy.shape === 'eye') {
      for (let i = 0; i < 18; i++) {
        const a = (i * Math.PI) / 9;
        add(
          'IrisRing',
          1.4,
          4.6 + Math.cos(a) * 2.4,
          Math.sin(a) * 2.4,
          0.8,
          0.7,
          0.7,
          i % 3 === 0 ? glow : '#afb9a8',
        );
      }
      add('EyeSocket', 1.5, 3.1, 0, 0.7, 3.2, 3.2, dark);
      add('BlueIris', 1.95, 3.7, 0, 0.4, 2, 2, glow);
      add('VerticalPupil', 2.2, 3.85, 0, 0.2, 0.4, 1.7, '#3c6580');
      for (const side of [-1, 1]) add('MissilePods', 0, 5.6, side * 2.4, 1.8, 1, 1.5, '#87978f');
    } else if (enemy.shape === 'crown') {
      for (let i = 0; i < 9; i++) {
        const a = (i * Math.PI * 2) / 9;
        add(
          'Canopy',
          Math.cos(a) * 2.4,
          6 + (i % 3) * 0.6,
          Math.sin(a) * 2.4,
          2.4,
          2.3,
          1,
          shade(base, 0.85 + (i % 3) * 0.12),
        );
        if (i % 3 === 0) {
          add('CulturePods', Math.cos(a) * 2.4, 3.8, Math.sin(a) * 2.4, 1.2, 1.2, 2.5, '#8cbaae');
          add('PodLight', Math.cos(a) * 2.4 + 0.6, 4.4, Math.sin(a) * 2.4, 0.2, 0.65, 1.1, glow);
        }
      }
    } else if (enemy.shape === 'root') {
      for (let i = 0; i < 5; i++)
        branch(
          'BraidedRoots',
          [-1 + i * 0.5, 0.3, 0],
          [Math.sin(i) * 1.3, 5.7, (i - 2) * 0.65],
          0.75,
          base,
        );
      for (const side of [-1, 1])
        add('RootCouplings', 0.8, 2.4, side * 1.3, 1.5, 0.8, 1.2, '#a6b3a4');
      if (enemy.id === 'rootHauler') {
        add('CarriedSoil', -1.3, 4, 0, 3, 2.7, 1.4, '#766549');
        for (let i = 0; i < 4; i++) add('Shoots', -1 + i * 0.5, 5.4, 0, 0.3, 0.5, 0.75, base);
      }
    } else {
      eyes(1.25, 4.6, 0.65);
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++)
          add(
            'TwistedLeaves',
            -0.5,
            5.9 + i * 0.4,
            side * (0.8 + i * 0.4),
            2.1 - i * 0.2,
            1.4,
            0.4,
            shade(base, 1.15),
          );
    }
  } else throw Error('Unknown forest silhouette: ' + enemy.shape);
  return blocks;
}

export async function buildForestEnemies() {
  const source = new URL('../../万象异境-体素模型/月痕古林/', import.meta.url);
  await mkdir(source, { recursive: true });
  const enemies = [...FOREST_ENEMIES, ...FOREST_BOSSES];
  for (const enemy of enemies) {
    const blocks = forestEnemyBlocks(enemy);
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
    [fileURLToPath(new URL('../../建模工具/build_forest_enemies.py', import.meta.url))],
    { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
  );
  if (result.status !== 0)
    throw Error(result.error?.message || result.stderr || '古林敌人导出失败');
  console.log(result.stdout.trim());
  return enemies.length;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  console.log(`Built ${await buildForestEnemies()} forest enemies`);
