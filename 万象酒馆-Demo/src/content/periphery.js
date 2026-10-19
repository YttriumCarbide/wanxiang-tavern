/** Repeatable scenery data. The central board and camera are never part of this plan. */
const COLORS = Object.freeze({
  ruins: ['#46504c', '#69716a', '#78836a', '#997e52'],
  forest: ['#344d3c', '#567246', '#72915c', '#b2bf87'],
  frost: ['#355363', '#668c9a', '#9cc9d6', '#d5e8eb'],
  forge: ['#383a3b', '#69554a', '#94734e', '#eaa35d'],
  tide: ['#354d57', '#587b7c', '#a7b49c', '#7ed7cd'],
  dynasty: ['#544d3e', '#738158', '#a33d31', '#c4a462'],
  xianxia: ['#425d56', '#71947a', '#92b3a2', '#b6d2bd'],
  castle: ['#454b40', '#727b68', '#a09268', '#943f3b'],
  arcane: ['#40334f', '#6a527f', '#a88ebf', '#d1bd80'],
  metropolis: ['#35424d', '#617582', '#95a8ac', '#71cfd6'],
  nexus: ['#263d4d', '#4a697b', '#8caab6', '#72dbe2'],
  wasteland: ['#68543d', '#998052', '#ad7649', '#584e42'],
  relic: ['#8c754f', '#b89a64', '#d3b77c', '#796b48'],
});

export function planPeriphery(map, occupied = () => false) {
  const colors = COLORS[map] || COLORS.ruins;
  const boxes = [],
    patches = [];
  let seed = [...map].reduce((value, char) => value * 31 + char.charCodeAt(0), 719) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let skipped = 0;
  function tile(x, z) {
    const occupiedSamples = [
      [0, 0],
      [-0.55, -0.55],
      [0.55, 0.55],
      [-0.55, 0.55],
      [0.55, -0.55],
    ];
    if (occupiedSamples.some(([dx, dz]) => occupied(x + dx, z + dz))) {
      skipped++;
      return;
    }
    patches.push({ x, z });
    const variant = Math.floor(random() * 4);
    const color = (index) => colors[index];
    const box = (dx, y, dz, w, h, d, ink, glow = false, kind = 0) => {
      const px = x + dx,
        pz = z + dz;
      if (Math.abs(px) - w / 2 < 6.55 && Math.abs(pz) - d / 2 < 5.55) return;
      boxes.push({ x: px, y, z: pz, w, h, d, color: ink, glow, kind });
    };
    const rocks = (ink, height = 0.45) => {
      for (let n = 0; n < 7; n++)
        box(
          (random() - 0.5) * 1.2,
          0.06,
          (random() - 0.5) * 1.2,
          0.3 + random() * 0.45,
          0.12 + random() * height,
          0.3 + random() * 0.45,
          ink,
        );
    };
    const plant = (dx, dz, ink, height = 1.15) => {
      box(dx, 0.1, dz, 0.13, height, 0.13, color(0));
      for (let level = 0; level < 3; level++)
        box(
          dx + (level % 2 ? 0.12 : -0.08),
          0.48 + (level * height) / 3,
          dz,
          1.05 - level * 0.19,
          0.2,
          0.8 - level * 0.13,
          ink,
        );
    };
    const roof = (ink) => {
      for (let n = 0; n < 5; n++) box(0, 0.7 + n * 0.11, 0, 1.5, 0.13, 1.55 - n * 0.28, ink);
      box(0, 1.26, 0, 1.55, 0.08, 0.09, color(3));
    };
    box(0, 0.015, 0, 1.55, 0.08, 1.55, color(0));
    switch (map) {
      case 'forest':
      case 'xianxia':
        box(0, 0.09, 0, 1.48, 0.07, 1.48, color(1));
        if (map === 'xianxia' && variant === 0) {
          for (const dx of [-0.5, 0.5])
            for (const dz of [-0.5, 0.5]) box(dx, 0.1, dz, 0.09, 0.65, 0.09, color(2));
          roof('#355c58');
        } else {
          plant(-0.2, 0.18, color(2), map === 'forest' ? 1.3 : 0.9);
          plant(0.46, -0.35, color(1), 0.68);
          rocks(color(0), 0.2);
        }
        break;
      case 'dynasty':
        box(0, 0.1, 0, 1.4, 0.12, 1.4, color(1));
        if (variant < 2) {
          for (const dx of [-0.52, 0.52]) box(dx, 0.12, 0, 0.1, 0.65, 0.1, color(2));
          roof('#79603e');
          box(0, 0.25, 0.3, 0.32, 0.35, 0.32, color(2));
          box(0, 0.34, 0.48, 0.22, 0.17, 0.025, color(3), true);
        } else {
          plant(0, 0, variant === 2 ? '#6f8753' : '#c4929e', 0.85);
          rocks('#a6a28a', 0.2);
        }
        break;
      case 'metropolis':
        if (variant < 3) {
          const h = 0.8 + random() * 0.8;
          box(0, 0.1, 0, 1.38, h, 1.4, color(1));
          box(0, h + 0.1, 0, 1.5, 0.08, 1.5, color(2));
          box(-0.35, h + 0.2, -0.25, 0.42, 0.2, 0.5, color(0));
          for (let n = 0; n < 4; n++) {
            box(-0.48 + n * 0.32, 0.35, 0.72, 0.21, 0.32, 0.03, color(3), true);
            box(0, h + 0.15, -0.4 + n * 0.24, 0.55, 0.035, 0.08, color(0));
          }
        } else {
          box(0, 0.12, 0, 0.9, 0.4, 1.4, color(2));
          box(0, 0.52, -0.15, 0.75, 0.24, 0.75, '#294954');
          for (const dx of [-0.5, 0.5])
            for (const dz of [-0.5, 0.5]) box(dx, 0.14, dz, 0.16, 0.28, 0.26, '#252a2f');
        }
        break;
      case 'nexus':
      case 'forge':
        for (const dx of [-0.4, 0.4]) {
          box(dx, 0.1, 0, 0.6, 0.75 + variant * 0.12, 1.35, color(1));
          for (let n = 0; n < 5; n++)
            box(
              dx,
              0.9 + variant * 0.12,
              -0.45 + n * 0.22,
              0.5,
              0.035,
              0.06,
              color(3),
              n % 2 === 0,
            );
          box(dx - 0.32, 0.15, 0, 0.08, 0.07, 1.55, color(2));
        }
        if (map === 'forge') box(0, 0.1, 0, 0.16, 0.06, 1.5, color(3), true, 2);
        break;
      case 'arcane':
      case 'frost':
        rocks(color(1), 0.45);
        for (let n = 0; n < 5; n++) {
          const dx = (random() - 0.5) * 1.1,
            dz = (random() - 0.5) * 1.1;
          const h = 0.5 + random() * 0.8;
          box(dx, 0.1, dz, 0.27, h, 0.27, color(2));
          box(dx, h + 0.1, dz, 0.14, 0.15, 0.14, color(3), true);
        }
        if (map === 'arcane' && variant === 0)
          for (let n = 0; n < 4; n++)
            box(0.4, 0.1 + n * 0.1, 0.35, 0.6, 0.08, 0.45, n % 2 ? color(3) : color(1));
        break;
      case 'wasteland':
        box(0, 0.09, 0, 1.52, 0.12, 1.5, color(1));
        rocks(color(2), 0.45);
        if (variant < 2) {
          box(0.15, 0.35, -0.15, 1.05, 0.12, 1.15, color(0));
          box(-0.4, 0.1, 0.45, 0.35, 0.7, 0.35, color(3));
          for (let n = 0; n < 4; n++) box(-0.5 + n * 0.32, 0.53, -0.15, 0.05, 0.06, 1.1, color(2));
        }
        break;
      case 'castle':
      case 'relic':
      case 'ruins':
      case 'tide':
      default:
        rocks(color(1), 0.36);
        for (let row = 0; row < 3 + variant; row++)
          box(
            (row % 2) * 0.08,
            0.1 + row * 0.17,
            -0.45,
            1.4 - row * 0.1,
            0.16,
            0.42,
            row % 2 ? color(1) : color(2),
          );
        if (variant % 2 === 0) {
          box(0.42, 0.1, 0.35, 0.45, 0.7, 0.45, color(2));
          box(0.42, 0.8, 0.35, 0.6, 0.12, 0.6, color(3));
        } else if (map === 'castle') {
          box(0.3, 0.12, 0.35, 0.5, 0.45, 0.5, '#877044');
          box(0.3, 0.57, 0.35, 0.56, 0.04, 0.56, '#ac9564');
        }
        break;
    }
  }
  for (const side of [-1, 1]) {
    for (let col = 0; col < 10; col++)
      for (let row = -10; row <= 10; row++) tile(side * (7.5 + col * 1.75), row * 1.75);
    for (let row = 0; row < 7; row++)
      for (let col = -3; col <= 3; col++) tile(col * 1.75, side * (6.6 + row * 1.75));
  }
  return { boxes, patches, skipped, bounds: { x: 24.3, z: 18.6 } };
}
