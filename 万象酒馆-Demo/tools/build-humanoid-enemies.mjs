import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { HUMANOID_ENEMY_TEMPLATES } from '../src/content/enemy-templates.js';
import { renderVoxelEnemyPortrait, shade } from './voxel-enemy-art.mjs';

/** Reusable human body, armor/robes, hair and three clearly different weapons. No plinth. */
export function humanoidEnemyBlocks(template) {
  const blocks = [];
  const female = template.gender === 'female';
  const { weapon } = template;
  const palette = {
    sword: {
      cloth: '#3f5770',
      edge: '#c4c8bd',
      hair: female ? '#b2a885' : '#655c50',
      armor: '#879b9d',
    },
    staff: {
      cloth: '#64577d',
      edge: '#baa77c',
      hair: female ? '#a9a8be' : '#6f707f',
      armor: '#494e67',
    },
    bow: {
      cloth: '#4c695b',
      edge: '#b5a57b',
      hair: female ? '#9c7759' : '#7a6b50',
      armor: '#7c6d54',
    },
  }[weapon];
  const skin = '#c1a38b',
    dark = '#303b42',
    metal = '#aebbb7',
    leather = '#594f43';
  const add = (group, x, y, z, w, d, h, color) => blocks.push({ group, x, y, z, w, d, h, color });
  const line = (group, start, end, size, color) => {
    const steps = Math.ceil(Math.hypot(...end.map((n, i) => n - start[i])) / (size * 0.65));
    for (let i = 0; i <= steps; i++) {
      const [x, y, z] = start.map((n, j) => n + ((end[j] - n) * i) / steps);
      add(group, x, y, z, size, size, size, color);
    }
  };
  const width = female ? 2.55 : 3;
  for (const side of [-1, 1]) {
    const z = side * (female ? 0.66 : 0.79);
    const y = side > 0 ? 0.22 : 0.08;
    add('Boots', 0.28, y, z, 1.42, 0.95, 0.55, dark);
    add('Boots', 0, y + 0.55, z, 0.92, 0.86, 1.35, leather);
    add(
      'Legs',
      -0.08,
      y + 1.9,
      z,
      0.85,
      0.82,
      1.7,
      weapon === 'sword' ? palette.armor : palette.cloth,
    );
    add('Kneeguards', 0.43, y + 1.65, z, 0.22, 0.77, 0.6, palette.edge);
    add('BootTrim', 0.2, y + 0.54, z, 1.22, 0.98, 0.15, palette.edge);
  }
  add('Torso', 0, 3.5, 0, 1.65, width - 0.35, 2.45, palette.cloth);
  add('Belt', 0, 3.6, 0, 1.86, width, 0.28, leather);
  add('Buckle', 1.01, 3.62, 0, 0.16, 0.45, 0.32, palette.edge);
  add('Collar', 0, 5.8, 0, 1.52, width - 0.5, 0.35, palette.edge);
  add('Neck', 0.02, 6.12, 0, 0.75, 0.84, 0.45, skin);
  add('Head', 0.04, 6.53, 0, 1.7, 1.83, 1.82, skin);
  add('Hair', -0.16, 8.12, 0, 1.94, 2.06, 0.42, palette.hair);
  add('Hair', -0.86, 6.7, 0, 0.45, 2.04, 1.65, palette.hair);
  for (const side of [-1, 1]) {
    add('Hair', -0.03, 7.79, side * 0.94, 1.65, 0.23, 0.48, palette.hair);
    add('Eyes', 0.93, 7.38, side * 0.46, 0.1, 0.27, 0.18, '#26383e');
    add('Brow', 0.94, 7.65, side * 0.46, 0.11, 0.36, 0.1, shade(palette.hair, 0.7));
    add('Ears', 0.08, 7.16, side * 0.99, 0.4, 0.2, 0.38, skin);
  }
  add('Face', 0.99, 7.02, 0, 0.18, 0.3, 0.26, skin);
  if (female) {
    // Put the side locks on the visible face planes, so gender variants remain distinct on cards.
    for (const side of [-1, 1]) {
      add('SideLocks', 0.15, 6.32, side * 1.04, 0.74, 0.28, 1.5, palette.hair);
      add('Fringe', 0.93, 7.91, side * 0.65, 0.18, 0.58, 0.35, palette.hair);
    }
    for (let i = 0; i < 6; i++)
      add(
        'Braid',
        -0.64 - i * 0.06,
        6.94 - i * 0.45,
        1.28,
        0.48,
        0.55,
        0.5,
        i % 2 ? shade(palette.hair, 0.84) : palette.hair,
      );
    add('HairTie', -0.95, 4.28, 1.28, 0.5, 0.58, 0.18, palette.edge);
  } else {
    for (let i = 0; i < 4; i++)
      add(
        'Hair',
        0.28,
        7.75 + i * 0.12,
        -0.75 + i * 0.43,
        1.45 - i * 0.12,
        0.46,
        0.35,
        palette.hair,
      );
  }
  for (const side of [-1, 1]) {
    const z = side * (width / 2 + 0.38);
    add('Shoulders', 0, 5.33, z, 1.46, 1.0, 0.8, palette.armor);
    add('Sleeves', 0.12, 4.2, z, 0.88, 0.78, 1.15, palette.cloth);
    add('Bracers', 0.38, 3.58, z, 0.86, 0.83, 0.68, leather);
    add('Hands', 0.48, 3.2, z, 0.67, 0.65, 0.48, skin);
  }
  if (weapon === 'sword') {
    add('Breastplate', 0.94, 4.1, 0, 0.28, width - 0.48, 1.63, palette.armor);
    add('BreastplateTrim', 1.1, 4.35, 0, 0.12, 0.24, 1.1, palette.edge);
    for (const side of [-1, 1]) {
      add('Pauldrons', 0.05, 5.78, side * (width / 2 + 0.35), 1.68, 1.22, 0.32, metal);
      for (let i = 0; i < 3; i++)
        add(
          'Tassets',
          0.18,
          2.8 + i * 0.28,
          side * 0.82,
          1.8 - i * 0.1,
          0.9,
          0.26,
          i % 2 ? palette.armor : metal,
        );
    }
    // Narrow helmet brow leaves the same face plane visible on both gender variants.
    add('Helmet', -0.15, 8.31, 0, 2.02, 2.1, 0.34, palette.armor);
    add('Helmet', 0.93, 7.92, 0, 0.24, 2.04, 0.2, metal);
    add('SwordGrip', 0.64, 2.91, -2.08, 0.35, 0.35, 1.35, leather);
    add('SwordGuard', 0.64, 4.02, -2.08, 0.5, 1.33, 0.2, palette.edge);
    add('SwordBlade', 0.64, 4.22, -2.08, 0.32, 0.6, 3.16, metal);
    add('SwordEdge', 0.82, 4.22, -2.08, 0.1, 0.27, 3.16, '#dae2d7');
    add('SwordTip', 0.64, 7.38, -2.08, 0.25, 0.31, 0.53, '#dae2d7');
    add('Shield', 0.9, 2.54, 2.24, 0.5, 2.0, 2.66, palette.armor);
    add('ShieldRim', 1.18, 2.64, 2.24, 0.12, 1.72, 2.38, palette.cloth);
    add('ShieldBoss', 1.32, 3.4, 2.24, 0.24, 0.52, 0.63, metal);
  } else if (weapon === 'staff') {
    for (let i = 0; i < 5; i++) {
      add(
        'Robe',
        -0.03,
        0.36 + i * 0.66,
        0,
        2.15 - i * 0.1,
        3.6 - i * 0.23,
        0.67,
        i % 2 ? palette.cloth : shade(palette.cloth, 0.84),
      );
      add('RobeSeam', 1.08 - i * 0.05, 0.37 + i * 0.66, 0, 0.12, 0.28, 0.65, palette.edge);
    }
    add('RobeHem', 0, 0.34, 0, 2.22, 3.63, 0.2, palette.edge);
    add('Mantle', -0.86, 4.2, 0, 0.5, 3.1, 1.7, palette.armor);
    add('Hood', -0.26, 8.43, 0, 2.23, 2.31, 0.45, palette.cloth);
    for (const side of [-1, 1])
      add('Hood', -0.15, 6.62, side * 1.06, 1.9, 0.32, 1.86, palette.cloth);
    add('StaffShaft', 0.72, 0.22, -2.1, 0.3, 0.3, 8.1, leather);
    for (const y of [1.2, 3.4, 7.9]) add('StaffRings', 0.72, y, -2.1, 0.5, 0.5, 0.24, palette.edge);
    for (const [i, size] of [0.55, 0.96, 0.96, 0.55].entries())
      add(
        'StaffCrystal',
        0.72,
        8.32 + i * 0.3,
        -2.1,
        size,
        size,
        0.3,
        i % 2 ? '#a0c9d1' : '#bfdcd6',
      );
    for (const side of [-1, 1])
      add('StaffProngs', 0.72, 8.1, -2.1 + side * 0.74, 0.25, 0.26, 0.9, palette.edge);
    add('Talisman', 1.02, 4.74, 0, 0.15, 0.51, 0.55, palette.edge);
  } else {
    for (let i = 0; i < 5; i++)
      add(
        'Cloak',
        -1.02,
        2.13 + i * 0.7,
        0,
        0.46,
        3.12 - i * 0.12,
        0.72,
        shade(palette.cloth, 0.8 + i * 0.035),
      );
    add('Hood', -0.17, 8.32, 0, 2.0, 2.15, 0.35, palette.cloth);
    add('Quiver', -1.23, 3.75, -0.76, 0.6, 0.87, 2.42, leather);
    for (let i = 0; i < 4; i++) {
      add('ArrowShafts', -1.23, 5.74, -1 + i * 0.16, 0.12, 0.12, 1.48, palette.edge);
      add('Fletching', -1.23, 6.81, -1 + i * 0.16, 0.17, 0.15, 0.5, '#c6c6ad');
    }
    // Stepped, asymmetric curve and fine string read as a bow in the established voxel style.
    for (let i = 0; i < 15; i++) {
      const y = 1.22 + i * 0.42;
      const bend = Math.sin((i / 14) * Math.PI) * 1.08;
      add('BowLimbs', 0.67 + bend, y, -2.16, 0.27, 0.3, 0.48, i % 3 ? palette.edge : leather);
    }
    line('BowString', [0.67, 1.23, -2.16], [0.67, 7.54, -2.16], 0.075, '#d1d0b6');
    add('BowGrip', 1.73, 3.52, -2.16, 0.29, 0.33, 1, leather);
    for (let i = 0; i < 3; i++)
      add('Bandolier', 0.92, 4.16 + i * 0.48, -0.64 + i * 0.42, 0.16, 0.44, 0.4, leather);
  }
  return blocks;
}

export async function buildHumanoidEnemies({ exportModels = true } = {}) {
  const source = new URL('../../万象异境-体素模型/人形敌人/', import.meta.url);
  await mkdir(source, { recursive: true });
  for (const template of HUMANOID_ENEMY_TEMPLATES) {
    const blocks = humanoidEnemyBlocks(template);
    await writeFile(
      new URL(`${template.portrait}.json`, source),
      JSON.stringify({ ...template, blocks }, null, 2) + '\n',
    );
    await writeFile(
      new URL(`../assets/portraits/${template.portrait}.svg`, import.meta.url),
      renderVoxelEnemyPortrait(template, blocks),
    );
  }
  if (exportModels) {
    const python =
      process.env.PYTHON_EXECUTABLE ||
      fileURLToPath(
        new URL(
          `../../建模工具/.venv/${process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python'}`,
          import.meta.url,
        ),
      );
    const result = spawnSync(
      python,
      [fileURLToPath(new URL('../../建模工具/build_humanoid_enemies.py', import.meta.url))],
      { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
    );
    if (result.status !== 0)
      throw Error(result.error?.message || result.stderr || '人形敌人模型导出失败');
    console.log(result.stdout.trim());
  }
  return HUMANOID_ENEMY_TEMPLATES.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  console.log(`Built ${await buildHumanoidEnemies()} humanoid enemy templates`);
