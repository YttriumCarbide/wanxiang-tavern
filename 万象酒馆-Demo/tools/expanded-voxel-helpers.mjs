import { shade } from './voxel-enemy-art.mjs';

/** Shared procedural voxel anatomy primitives for 3 progressive tiers. */
export function createVoxelBuilder(enemy) {
  const blocks = [];
  const base = enemy.color || '#7c959b';
  const dark = shade(base, 0.45);
  const mid = shade(base, 0.78);
  const light = shade(base, 1.18);
  const bright = shade(base, 1.38);

  const add = (group, x, y, z, w, d, h, color = base) => {
    blocks.push({
      group,
      x: +x.toFixed(3),
      y: Math.max(0.02, +y.toFixed(3)),
      z: +z.toFixed(3),
      w: Math.max(0.06, +w.toFixed(3)),
      d: Math.max(0.06, +d.toFixed(3)),
      h: Math.max(0.06, +h.toFixed(3)),
      color,
    });
  };

  const pair = (group, x, y, z, w, d, h, color = base) => {
    add(group, x, y, z, w, d, h, color);
    add(group, x, y, -z, w, d, h, shade(color, 0.92));
  };

  const line = (group, a, b, size, color = base, stepsOverride = 0) => {
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const steps = stepsOverride || Math.max(2, Math.ceil(dist / (size * 0.72)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      add(
        group,
        a[0] + (b[0] - a[0]) * t,
        a[1] + (b[1] - a[1]) * t,
        a[2] + (b[2] - a[2]) * t,
        size,
        size,
        size,
        i % 2 ? shade(color, 0.9) : color,
      );
    }
  };

  const eyes = (x, y, zSpread, size = 0.22, color = '#d8fff4') => {
    pair('Eyes', x, y, zSpread, 0.14, size, size, color);
  };

  const limbPair = (group, x, yTop, zSpread, height, thick, footColor = dark, legColor = mid) => {
    for (const side of [-1, 1]) {
      const z = side * zSpread;
      add(group, x, Math.max(0.32, yTop * 0.45), z, thick, thick, height * 0.52, legColor);
      add(
        group,
        x + 0.08,
        0.28,
        z,
        thick * 0.92,
        thick * 0.92,
        height * 0.45,
        shade(legColor, 0.85),
      );
      add(group, x + thick * 0.28, 0.04, z, thick * 1.45, thick * 1.05, 0.34, footColor);
    }
  };

  const wingPair = (
    group,
    rootX,
    rootY,
    rootZ,
    span,
    chord,
    featherColor,
    frameColor,
    layers = 4,
  ) => {
    for (const side of [-1, 1]) {
      for (let i = 0; i < layers; i++) {
        const t = (i + 1) / layers;
        const z = side * (rootZ + t * span);
        const y = rootY + Math.sin(t * Math.PI * 0.72) * span * 0.48;
        const x = rootX - t * chord * 0.45;
        add(group, x + 0.15, y + 0.18, z, 0.22, span / layers + 0.14, 0.24, frameColor);
        add(
          group,
          x - chord * 0.15,
          y - 0.18,
          z,
          chord * (1.05 - t * 0.35),
          span / layers + 0.08,
          0.14,
          i % 2 ? featherColor : shade(featherColor, 0.86),
        );
      }
    }
  };

  const hornPair = (group, x, y, zSpread, segments, dx, dy, dz, size, color = '#d8cbb0') => {
    for (const side of [-1, 1]) {
      for (let i = 0; i < segments; i++) {
        const t = i / Math.max(1, segments - 1);
        const s = size * (1 - t * 0.55);
        add(
          group,
          x + dx * i,
          y + dy * i + t * t * 0.25,
          side * (zSpread + dz * i),
          s,
          s,
          s * 1.15,
          i === segments - 1 ? '#f0e7d0' : shade(color, 1 - t * 0.18),
        );
      }
    }
  };

  const tailSweep = (
    group,
    startX,
    startY,
    segments,
    stepX,
    stepY,
    swayZ,
    size,
    color,
    crestColor,
  ) => {
    for (let i = 0; i < segments; i++) {
      const t = i / Math.max(1, segments - 1);
      const s = size * (1 - t * 0.62);
      const x = startX + i * stepX;
      const y = Math.max(0.08, startY + i * stepY + Math.sin(t * Math.PI) * 0.35);
      const z = Math.sin(t * Math.PI * 1.6) * swayZ;
      add(
        group,
        x,
        y,
        z,
        Math.abs(stepX) * 1.25 + s * 0.5,
        s,
        s,
        i % 2 ? shade(color, 0.88) : color,
      );
      if (crestColor && i % 2 === 0 && i < segments - 1) {
        add(group, x, y + s * 0.55, z, s * 0.45, 0.14, s * 0.48, crestColor);
      }
    }
  };

  const spineRidge = (group, startX, startY, stepX, count, hScale, color) => {
    for (let i = 0; i < count; i++) {
      const arch = Math.sin(((i + 0.5) / count) * Math.PI);
      add(
        group,
        startX + i * stepX,
        startY + arch * 0.32,
        0,
        Math.abs(stepX) * 0.62 + 0.14,
        0.2,
        0.25 + arch * hScale,
        i % 2 ? shade(color, 0.85) : color,
      );
    }
  };

  const orbitingShards = (group, cx, cy, cz, radius, count, size, color, tilt = 0.22) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      add(
        group,
        cx + Math.cos(a) * radius * 0.72,
        cy + Math.sin(a * 2) * tilt,
        cz + Math.sin(a) * radius,
        size,
        size * 0.85,
        size * 1.45,
        i % 2 ? shade(color, 1.15) : color,
      );
    }
  };

  /** Reusable detailed upright bipedal torso/armor/head chassis. */
  function addBipedFrame({
    cloth,
    armor,
    skin,
    trim,
    headColor = skin,
    eyeColor = '#ffe4a8',
    scale = 1,
    hunch = 0,
    hooded = false,
    fine = false,
  }) {
    const s = scale;
    limbPair('Boots', -0.05 * s, 1.55 * s, 0.62 * s, 1.55 * s, 0.58 * s, dark, cloth);
    add('Torso', hunch * 0.15, 1.55 * s, 0, 1.35 * s, 1.9 * s, 1.8 * s, cloth);
    add('Armor', 0.12 * s + hunch * 0.15, 2.0 * s, 0, 1.25 * s, 1.78 * s, 1.1 * s, armor);
    add('Armor', 0.58 * s + hunch * 0.15, 1.68 * s, 0, 0.28 * s, 1.92 * s, 0.28 * s, dark);
    add('Trim', 0.76 * s + hunch * 0.15, 1.72 * s, 0, 0.14 * s, 0.42 * s, 0.24 * s, trim);
    pair('Shoulders', hunch * 0.18, 3.05 * s, 1.18 * s, 1.05 * s, 0.92 * s, 0.62 * s, armor);
    pair('Arms', 0.18 * s + hunch * 0.2, 2.05 * s, 1.22 * s, 0.54 * s, 0.52 * s, 1.02 * s, cloth);
    pair('Hands', 0.45 * s + hunch * 0.25, 1.85 * s, 1.22 * s, 0.44 * s, 0.44 * s, 0.38 * s, skin);
    add('Head', 0.14 * s + hunch * 0.45, 3.35 * s, 0, 1.22 * s, 1.3 * s, 1.18 * s, headColor);
    eyes(0.76 * s + hunch * 0.45, 3.88 * s, 0.32 * s, 0.2 * s, eyeColor);
    if (hooded) {
      add('Hood', -0.02 * s + hunch * 0.45, 4.35 * s, 0, 1.46 * s, 1.52 * s, 0.48 * s, cloth);
      add(
        'Hood',
        -0.52 * s + hunch * 0.4,
        3.38 * s,
        0,
        0.46 * s,
        1.48 * s,
        1.28 * s,
        shade(cloth, 0.82),
      );
      pair(
        'Hood',
        0.08 * s + hunch * 0.45,
        3.65 * s,
        0.68 * s,
        1.18 * s,
        0.24 * s,
        0.95 * s,
        shade(cloth, 0.88),
      );
    } else {
      add('Crest', -0.1 * s + hunch * 0.45, 4.38 * s, 0, 1.38 * s, 1.42 * s, 0.34 * s, trim);
    }
    if (fine) {
      pair('Armor', 0.62 * s, 2.55 * s, 0.5 * s, 0.24 * s, 0.56 * s, 0.72 * s, shade(armor, 1.15));
      pair('Shoulders', 0.05 * s, 3.55 * s, 1.3 * s, 1.18 * s, 1.02 * s, 0.26 * s, trim);
      pair('Boots', 0.32 * s, 1.05 * s, 0.62 * s, 0.22 * s, 0.52 * s, 0.36 * s, trim);
    }
  }

  return {
    blocks,
    base,
    dark,
    mid,
    light,
    bright,
    add,
    pair,
    line,
    eyes,
    limbPair,
    wingPair,
    hornPair,
    tailSweep,
    spineRidge,
    orbitingShards,
    addBipedFrame,
  };
}

/** Add meaningful tier-matched micro detail (studs/scales/shards/plates) so each tier hits its exact fidelity band cleanly. */
export function finalizeVoxelComplexity(builder, enemy, minBoxes, maxBoxes) {
  const { blocks, add, pair, dark, light } = builder;
  const xs = blocks.map((b) => b.x);
  const ys = blocks.map((b) => b.y + b.h * 0.5);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...blocks.map((b) => b.y + b.h));
  const midY = ys.reduce((a, b) => a + b, 0) / Math.max(1, ys.length);
  const stepColor = enemy.boss ? '#ead79b' : enemy.elite ? light : dark;
  let k = 0;
  while (blocks.length < minBoxes && k < 240) {
    const t = (k % 12) / 12;
    const x = minX + (maxX - minX) * (0.14 + t * 0.72);
    const y = Math.min(maxY - 0.15, Math.max(0.28, midY + Math.sin(k * 1.3) * (maxY * 0.25)));
    const z = (k % 2 === 0 ? 1 : -1) * (0.28 + (k % 6) * 0.14);
    const s = enemy.boss ? 0.16 : enemy.elite ? 0.18 : 0.2;
    if (k % 3 === 0 && blocks.length + 2 <= maxBoxes) {
      pair('Scales', x, y, Math.abs(z), s * 1.15, s, s * 1.1, k % 2 ? stepColor : builder.base);
    } else {
      add('Trim', x, y, 0, s * 1.2, s * 0.9, s * 0.9, shade(builder.base, k % 2 ? 1.14 : 0.88));
    }
    k++;
  }
  return blocks;
}
