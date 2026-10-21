import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  EXTRA_ENEMIES,
  RUINS_ADVERSARIES,
  EXTRA_BOSSES,
  RUINS_BOSSES,
} from '../src/content/new-adversaries.js';

function shade(hex, factor) {
  return (
    '#' +
    hex
      .slice(1)
      .match(/../g)
      .map((value) =>
        Math.min(255, Math.round(parseInt(value, 16) * factor))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Reproducible orthographic block models, matching the existing crystal-beetle portrait. */
export function enemyPortrait(enemy) {
  const blocks = [];
  const base = enemy.color;
  const stone = '#788781',
    metal = '#b6a378',
    dark = '#29343d',
    light = '#dbf3e4';
  const add = (x, y, z, w, d, h, color = base) => blocks.push({ x, y, z, w, d, h, color });
  const eyes = (x, y, z, color = '#caf7ed') => {
    add(x, y, z - 0.65, 0.22, 0.35, 0.35, color);
    add(x, y, z + 0.65, 0.22, 0.35, 0.35, color);
  };
  function beetle(gold = false) {
    for (const x of [-2.3, 0, 2.3])
      for (const side of [-1, 1]) {
        add(x, 0.6, side * 2.8, 0.7, 2.2, 0.6, dark);
        add(x - 0.3, 0.1, side * 3.9, 1.2, 0.7, 0.5, stone);
      }
    add(0, 1.2, 0, 6.6, 4.2, 1.4, dark);
    for (let i = 0; i < 5; i++) {
      const width = [3.4, 4.7, 5.1, 4.7, 3.4][i];
      add((i - 2) * 1.15, 2.5, 0, 1.1, width, 1.2, gold ? metal : shade(base, i % 2 ? 0.8 : 1.12));
    }
    add(3.8, 1.5, 0, 1.8, 2.4, 1.4, gold ? '#b4a060' : stone);
    eyes(4.75, 2.2, 0, gold ? '#b7f7df' : light);
    add(4.7, 1.2, -0.7, 1.2, 0.4, 0.5, metal);
    add(4.7, 1.2, 0.7, 1.2, 0.4, 0.5, metal);
    for (const z of [-0.9, 0.9]) add(0, 3.7, z, 2.5, 0.65, 0.35, gold ? '#e6cf7a' : '#a4ba9b');
  }
  function beast(heads = 1, wings = false) {
    for (const x of [-2.2, 1.9])
      for (const z of [-1.2, 1.2]) {
        add(x, 0.4, z, 0.8, 0.8, 2.7, dark);
        add(x + 0.35, 0.1, z, 1.4, 1, 0.6, stone);
      }
    add(-0.3, 2.8, 0, 5.5, 2.7, 2.2);
    for (let i = 0; i < 3; i++) add(-3.3 - i * 0.65, 3.8 + i * 0.45, 0, 0.9, 0.65, 0.7, dark);
    for (let i = 0; i < heads; i++) {
      const z = (i - (heads - 1) / 2) * 2;
      add(2.3, 4.3, z, 2.2, 1.8, 2.2, stone);
      add(3.4, 4.4, z, 1.4, 1.4, 0.8, dark);
      add(2.2, 6.2, z - 0.6, 0.7, 0.6, 1.3, metal);
      add(2.2, 6.2, z + 0.6, 0.7, 0.6, 1.3, metal);
      eyes(3.45, 5.3, z, '#e5ae73');
    }
    if (wings)
      for (const side of [-1, 1])
        for (let i = 0; i < 5; i++)
          add(
            -1.2 + i * 0.35,
            5.1 + i * 0.3,
            side * (2.1 + i * 0.65),
            3.5 - i * 0.4,
            0.75,
            0.55,
            i % 2 ? stone : base,
          );
  }
  function person(robe = false, shield = false, tall = false) {
    const k = tall ? 1.15 : 1;
    for (const z of [-0.85, 0.85]) {
      add(0.3, 0.1, z, 1.8, 1.1, 0.65, dark);
      add(0, 0.8, z, 1.1, 1, 2.5 * k, metal);
    }
    add(0, 3.2, 0, 2.3, robe ? 3.4 : 2.4, 3 * k);
    if (robe)
      for (let i = 0; i < 3; i++)
        add(-0.35, 1 + i * 0.8, 0, 2.9 - i * 0.35, 4 - i * 0.4, 0.9, shade(base, 0.65 + i * 0.12));
    add(0, 6.3 * k, 0, 1.9, 1.9, 1.9, robe ? dark : stone);
    eyes(1, 7.25 * k, 0, light);
    for (const z of [-2.1, 2.1]) {
      add(0, 5.2 * k, z, 1.5, 1.4, 1, metal);
      add(0.2, 3.5 * k, z, 0.75, 0.85, 2, dark);
    }
    if (shield) {
      add(0.85, 2, 2.7, 0.5, 2.4, 3.9, stone);
      add(1.15, 3.2, 2.7, 0.2, 1.4, 1.2, base);
    }
    add(0.5, 1, -2.5, 0.45, 0.45, robe ? 8 : 4, metal);
    if (robe) add(0.5, 9.1, -2.5, 1.2, 1.2, 1.2, base);
    else add(0.5, 4.5, -2.5, 0.3, 0.35, 3.1, '#c4d3d7');
  }
  function ballista(x = 0, z = 0, scale = 1) {
    const part = (a, b, c, w, d, h, color) =>
      add(x + a * scale, b * scale, z + c * scale, w * scale, d * scale, h * scale, color);
    part(0, 0.4, 0, 4, 3, 1, dark);
    for (const side of [-1, 1]) part(-0.6, 0.2, side * 1.8, 1.7, 0.6, 1.6, metal);
    part(-0.7, 1.4, 0, 1, 1, 2.5, stone);
    part(1, 3.4, 0, 5.5, 1.2, 0.8, metal);
    part(2.5, 3.7, 0, 0.7, 6.4, 0.6, base);
    part(0.6, 4.2, 0, 5.2, 0.25, 0.2, '#e5d9b6');
  }
  function bird() {
    add(0, 3.2, 0, 3, 1.9, 2.7, dark);
    add(1.2, 5.6, 0, 1.7, 1.6, 1.7);
    add(2.5, 5.7, 0, 1.1, 0.8, 0.6, metal);
    eyes(2.1, 6.35, 0, '#f4df91');
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++)
        add(
          -0.3 - i * 0.45,
          4.5 + i * 0.4,
          side * (1.5 + i * 0.65),
          3.8 - i * 0.35,
          0.8,
          0.55,
          i % 2 ? stone : base,
        );
    for (const z of [-0.7, 0.7]) add(0.3, 0.3, z, 0.5, 0.5, 2.9, metal);
    for (let i = 0; i < 3; i++) add(-2.5 - i * 0.55, 3.6 - i * 0.2, 0, 1, 1.2, 0.5);
  }
  function ooze() {
    for (let x = -3; x <= 3; x++)
      for (let z = -2; z <= 2; z++) {
        const radius = (x * x) / 10 + (z * z) / 6;
        if (radius > 1.5) continue;
        add(
          x,
          0.3,
          z,
          1.1,
          1.1,
          1.2 + Math.max(0, 1.4 - radius) * 2.4,
          shade(base, 0.8 + ((x - z + 10) % 3) * 0.16),
        );
      }
    eyes(3.2, 2, 0, '#d6a1f6');
    for (let i = 0; i < 4; i++) add(i - 1.5, 4.6 + i * 0.6, -1, 0.5, 0.5, 0.6, light);
  }
  switch (enemy.id) {
    case 'stoneBeetle':
      beetle();
      break;
    case 'tombBeetle':
      beetle(true);
      break;
    case 'patrolHound':
      beast();
      break;
    case 'chasmBeast':
      beast(2, true);
      break;
    case 'corridorGuard':
      person(false, true);
      break;
    case 'tombWarden':
      person(false, true, true);
      add(0, 8.2, 0, 2.7, 0.55, 0.8, metal);
      break;
    case 'cultistSpecter':
      person(true);
      break;
    case 'cinderPriest':
      person(true, false, true);
      add(0, 9.2, 0, 2.8, 2.8, 0.7, metal);
      break;
    case 'shadowStalker':
      person();
      add(-0.5, 4, -1.6, 2.8, 0.4, 4.8, dark);
      break;
    case 'stoneBallista':
      ballista();
      break;
    case 'raptorStorm':
      bird();
      break;
    case 'blackOoze':
      ooze();
      break;
    case 'viperShadow':
      for (let i = 0; i < 15; i++) {
        const a = i * 0.44;
        add(
          Math.cos(a) * 3.1,
          i * 0.22 + 0.2,
          Math.sin(a) * 2.3,
          1.3,
          1.3,
          1.2,
          i % 2 ? dark : base,
        );
      }
      add(2.3, 3.4, 0, 1.2, 1.4, 3.3);
      add(2.7, 6.2, 0, 2.1, 2.2, 1.2);
      eyes(3.8, 6.7, 0, '#f5d181');
      break;
    case 'brassSeeker':
      add(0, 1, 0, 3.2, 3.2, 1.2, dark);
      add(0, 2.2, 0, 2.1, 2.1, 2.5, metal);
      for (const side of [-1, 1]) {
        add(side * 2, 0.2, 0, 0.9, 1.4, 2.1, stone);
        add(0, 0.2, side * 2, 1.4, 0.9, 2.1, stone);
      }
      add(0, 4.8, 0, 2.7, 2.7, 2.5);
      add(1.4, 5.6, 0, 0.25, 1.5, 0.7, '#a7ecdd');
      break;
    case 'ruinsMudGolem':
      person(false, false, true);
      for (const z of [-2.1, 2.1]) add(0.2, 2.2, z, 2, 1.9, 3.4, stone);
      add(0, 4.3, 0, 3, 3.4, 2.3, stone);
      break;
    case 'voidParasite':
      beetle();
      for (let i = 0; i < 4; i++) add(i - 1.5, 4.1 + i * 0.4, 0, 0.75, 0.75, 1.5, '#b09ed1');
      break;
    case 'ruinsGate':
      for (const z of [-2.5, 2.5]) {
        add(0, 0.2, z, 2.8, 1.6, 10, stone);
        add(0, 10.2, z, 3.2, 2.2, 0.9, metal);
      }
      add(0, 0.3, 0, 1.1, 3.6, 8.3, '#4c5d58');
      add(0, 10.2, 0, 2.8, 4.6, 1, stone);
      for (let y = 1; y < 8; y += 1.5) add(0.6, y, 0, 0.15, 0.5, 0.7, '#a6e9ed');
      ballista(0.5, -4.5, 0.5);
      ballista(0.5, 4.5, 0.5);
      add(0.8, 11.2, 0, 1.8, 2.3, 1.5, base);
      eyes(1.8, 11.8, 0);
      break;
    case 'brassColossus':
      person(false, false, true);
      add(0, 3.8, 0, 3.6, 3.5, 3.5, metal);
      add(0, 7.5, 0, 1.6, 3.5, 0.9, base);
      add(0, 8.4, 0, 1.5, 2.6, 0.9, metal);
      add(0, 9.3, 0, 1.3, 1.6, 0.9, base);
      add(0, 10.2, 0, 1.1, 0.6, 0.9, metal);
      add(1.9, 5.2, 0, 0.2, 1.4, 1.1, '#a7f6e6');
      break;
    case 'apepLamb':
      beast(1, true);
      add(-0.5, 3.8, 0, 3.6, 3.3, 3.8, dark);
      for (const side of [-1, 1])
        for (let i = 0; i < 4; i++)
          add(1.8 - i * 0.6, 6.1 + i * 0.6, side * (0.9 + i * 0.4), 0.8, 0.65, 0.8, '#ae87bd');
      add(1.4, 5.3, 0, 0.25, 0.8, 1.4, '#e7b8ef');
      break;
    case 'cinderImp':
      person();
      add(1.3, 4, 0, 0.3, 1.6, 1.3, '#efb36d');
      add(0, 8.4, 0, 0.8, 0.8, 1.4, '#f5c679');
      break;
    case 'tideJelly':
      for (let i = 0; i < 4; i++)
        add(0, 5 + i * 0.65, 0, 5.8 - i * 1.1, 5.8 - i * 1.1, 0.75, shade(base, 0.85 + i * 0.08));
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        add(Math.cos(a) * 1.8, 0.8, Math.sin(a) * 1.8, 0.45, 0.45, 4.2, '#79bab9');
      }
      add(0, 4.5, 0, 1.5, 1.5, 1.4, '#f4d38c');
      break;
    case 'bossTide':
      person(false, false, true);
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5;
        add(-1.5, 7 + Math.sin(a) * 3.4, Math.cos(a) * 3.4, 0.5, 0.7, 0.7, metal);
      }
      break;
    default:
      throw Error('No portrait model: ' + enemy.id);
  }
  const project = (x, y, z) => [128 + (x - z) * 9, 280 + (x + z) * 3.8 - y * 12];
  const vertices = blocks.flatMap(({ x, y, z, w, d, h }) =>
    [-1, 1].flatMap((sx) =>
      [-1, 1].flatMap((sz) =>
        [0, h].map((dy) => project(x + (sx * w) / 2, y + dy, z + (sz * d) / 2)),
      ),
    ),
  );
  const left = Math.min(...vertices.map(([x]) => x));
  const right = Math.max(...vertices.map(([x]) => x));
  const top = Math.min(...vertices.map(([, y]) => y));
  const bottom = Math.max(...vertices.map(([, y]) => y));
  // Fit the creature itself, so a wide beetle and a tall guardian both fill the card.
  const scale = Math.min(224 / (right - left), 252 / (bottom - top));
  const height = (bottom - top) * scale;
  const centerY = 202 + Math.max(0, 220 - height) * 0.12;
  const offsetX = 128 - ((left + right) * scale) / 2;
  const offsetY = centerY - ((top + bottom) * scale) / 2;
  const point = ([x, y]) => x.toFixed(1) + ',' + y.toFixed(1);
  const polygon = (points, color) =>
    `<polygon points="${points.map(point).join(' ')}" fill="${color}"/>`;
  const geometry = blocks
    .sort((a, b) => a.x + a.z - b.x - b.z || a.y - b.y)
    .flatMap((b) => {
      const x = b.x - b.w / 2,
        z = b.z - b.d / 2;
      const corners = [
        [x, b.y, z],
        [x + b.w, b.y, z],
        [x + b.w, b.y, z + b.d],
        [x, b.y, z + b.d],
      ];
      const bottom = corners.map((p) => project(...p));
      const top = corners.map(([x, y, z]) => project(x, y + b.h, z));
      return [
        polygon([bottom[1], bottom[2], top[2], top[1]], shade(b.color, 0.64)),
        polygon([bottom[2], bottom[3], top[3], top[2]], shade(b.color, 0.88)),
        polygon(top, shade(b.color, 1.15)),
      ];
    })
    .join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="900" viewBox="0 0 256 384" data-art-style="isometric-voxel-v3"><title>${enemy.name}</title>
<defs><radialGradient id="chamber" cx="50%" cy="54%" r="68%"><stop stop-color="${shade(base, 0.65)}"/><stop offset="1" stop-color="#142428"/></radialGradient></defs>
<path fill="url(#chamber)" d="M0 0h256v384H0z"/>
<ellipse cx="128" cy="${(centerY + height / 2 - 2).toFixed(1)}" rx="${Math.min(99, (right - left) * scale * 0.42).toFixed(1)}" ry="10" fill="#09171b" opacity=".5"/>
<g data-enemy-model="${enemy.id}" transform="translate(${offsetX.toFixed(3)} ${offsetY.toFixed(3)}) scale(${scale.toFixed(5)})">${geometry}</g>
</svg>\n`;
}

export async function buildEnemyPortraits() {
  const enemies = [
    ...EXTRA_ENEMIES.filter((enemy) => enemy.id !== 'crystalBeetle'),
    ...RUINS_ADVERSARIES,
    ...EXTRA_BOSSES,
    ...RUINS_BOSSES,
  ];
  for (const enemy of enemies)
    await writeFile(
      new URL(`../assets/portraits/${enemy.portrait}.svg`, import.meta.url),
      enemyPortrait(enemy),
    );
  return enemies.length;
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  console.log(`Rebuilt ${await buildEnemyPortraits()} isometric enemy portraits`);
