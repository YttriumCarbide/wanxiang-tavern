import * as THREE from 'three';

function createPrimitives(resources) {
  return {
    box: resources.track(new THREE.BoxGeometry(1, 1, 1)),
    cyl: resources.track(new THREE.CylinderGeometry(0.5, 0.5, 1, 10)),
    oct: resources.track(new THREE.OctahedronGeometry(0.5, 0)),
    cone: resources.track(new THREE.ConeGeometry(0.5, 1, 8)),
    ring: resources.track(new THREE.TorusGeometry(0.5, 0.11, 8, 20)),
  };
}

function stdMat(resources, colorHex, { roughness = 0.62, metalness = 0.28 } = {}) {
  return resources.track(
    new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness,
      metalness,
    }),
  );
}

function addPart(parent, geo, mat, [x, y, z], [sx, sy, sz], [rx = 0, ry = 0, rz = 0] = []) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeChunk(node, archetype, index, cfg) {
  return {
    node,
    shape: { signature: `${archetype}:${index}` },
    index,
    x: cfg.x || 0,
    z: cfg.z || 0,
    restY: Math.max(0.14, cfg.restY ?? 0.16),
    peakY: cfg.peakY ?? 0.42,
    dx: cfg.dx ?? 0,
    dz: cfg.dz ?? 0,
    startRotY: cfg.startRotY ?? 0,
    rotX: cfg.rotX ?? 0,
    rotY: cfg.rotY ?? 0,
    rotZ: cfg.rotZ ?? 0,
  };
}

function inferBossStyle(def) {
  const key = `${def?.id || ''} ${def?.portrait || ''} ${def?.attackStyle || ''}`.toLowerCase();
  if (/gate|golem|colossus|crusher|warden/.test(key)) return 'construct';
  if (/tide|bloom|elemental|specter|watcher/.test(key)) return 'astral';
  if (/vole|gulon|python|spider|crab|storm|matriarch|wolf/.test(key)) return 'beast';
  return 'warlord';
}

function buildAlchemicalPuppetCorpse(resources, prim, lightMat) {
  const group = new THREE.Group();
  group.name = 'Overlord_Corpse_AlchemicalPuppet';
  const porcelain = stdMat(resources, '#efe5d2', { roughness: 0.48, metalness: 0.08 });
  const darkHollow = stdMat(resources, '#211824', { roughness: 0.9, metalness: 0.05 });
  const brass = stdMat(resources, '#cda044', { roughness: 0.36, metalness: 0.8 });
  const copper = stdMat(resources, '#a86538', { roughness: 0.44, metalness: 0.65 });
  const rustIron = stdMat(resources, '#5c3c34', { roughness: 0.72, metalness: 0.58 });
  const darkWood = stdMat(resources, '#6d4b31', { roughness: 0.85, metalness: 0.06 });
  const coreViolet = stdMat(resources, '#67439c', { roughness: 0.35, metalness: 0.25 });

  const c0 = new THREE.Group();
  addPart(c0, prim.box, porcelain, [0, 0.06, 0], [0.22, 0.1, 0.28], [0.1, 0.2, -0.18]);
  addPart(c0, prim.box, darkHollow, [-0.02, 0.1, -0.02], [0.06, 0.04, 0.08], [0, 0.2, 0]);
  addPart(c0, prim.box, brass, [0.08, 0.07, 0.01], [0.03, 0.11, 0.27], [0.08, 0.18, 0]);

  const c1 = new THREE.Group();
  addPart(c1, prim.box, porcelain, [0, 0.05, 0], [0.2, 0.09, 0.25], [-0.08, -0.25, 0.16]);
  addPart(c1, prim.box, darkHollow, [0.02, 0.09, -0.01], [0.06, 0.04, 0.07], [0, 0, 0]);
  addPart(c1, prim.cyl, brass, [-0.07, 0.09, 0.05], [0.06, 0.04, 0.06], [0.3, 0, 0]);

  const c2 = new THREE.Group();
  addPart(c2, prim.box, darkWood, [0, 0.06, -0.1], [0.42, 0.07, 0.08], [0, 0.12, 0]);
  for (const offset of [-0.14, 0, 0.14]) {
    addPart(
      c2,
      prim.ring,
      brass,
      [offset, 0.11, 0],
      [0.16, 0.24, 0.12],
      [0, Math.PI / 2 + 0.15, 0.2],
    );
  }
  addPart(c2, prim.box, darkWood, [0, 0.05, 0.12], [0.36, 0.05, 0.07], [0, -0.08, 0]);
  addPart(c2, prim.cyl, rustIron, [-0.24, 0.1, 0], [0.1, 0.07, 0.1], [0.2, 0, Math.PI / 2]);
  addPart(c2, prim.cyl, rustIron, [0.24, 0.1, 0], [0.1, 0.07, 0.1], [-0.2, 0, Math.PI / 2]);

  const c3 = new THREE.Group();
  addPart(c3, prim.oct, lightMat, [0, 0.11, 0], [0.24, 0.22, 0.24], [0.4, 0.6, 0.2]);
  addPart(c3, prim.ring, coreViolet, [0, 0.1, 0], [0.32, 0.32, 0.22], [Math.PI / 2.2, 0.3, 0]);
  addPart(c3, prim.box, brass, [-0.12, 0.04, 0.08], [0.09, 0.04, 0.12], [0, 0.5, 0]);

  const c4 = new THREE.Group();
  addPart(c4, prim.box, rustIron, [-0.1, 0.07, 0], [0.44, 0.11, 0.12], [0, 0.22, 0.08]);
  addPart(c4, prim.box, rustIron, [0.18, 0.07, -0.07], [0.24, 0.09, 0.06], [0, -0.42, 0]);
  addPart(c4, prim.box, rustIron, [0.18, 0.07, 0.08], [0.24, 0.09, 0.06], [0, 0.38, 0]);

  const c5 = new THREE.Group();
  addPart(c5, prim.box, darkWood, [0, 0.06, 0], [0.64, 0.09, 0.1], [0.04, -0.35, -0.06]);
  addPart(c5, prim.box, rustIron, [0.26, 0.09, -0.08], [0.18, 0.14, 0.18], [0, -0.35, 0.1]);

  const c6 = new THREE.Group();
  addPart(c6, prim.ring, copper, [0, 0.05, 0], [0.26, 0.26, 0.14], [Math.PI / 2, 0.12, 0]);
  addPart(c6, prim.cyl, brass, [0.06, 0.06, -0.04], [0.16, 0.05, 0.16], [0, 0.4, 0]);
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 4;
    addPart(c6, prim.box, brass, [0.06, 0.06, -0.04], [0.21, 0.04, 0.04], [0, ang, 0]);
  }

  const c7 = new THREE.Group();
  addPart(c7, prim.cyl, brass, [0, 0.06, 0], [0.28, 0.04, 0.28], [0.25, 0, -0.18]);
  addPart(c7, prim.oct, lightMat, [0, 0.09, 0], [0.09, 0.09, 0.09], [0, 0.3, 0]);

  const c8 = new THREE.Group();
  addPart(c8, prim.cyl, brass, [0, 0.04, 0], [0.24, 0.04, 0.24], [0, 0.2, 0]);
  addPart(c8, prim.box, porcelain, [0, 0.065, 0], [0.16, 0.02, 0.16], [0, 0.2, 0]);
  addPart(c8, prim.box, darkHollow, [0.02, 0.08, 0], [0.09, 0.018, 0.025], [0, 0.8, 0]);

  const specs = [
    [
      c0,
      { x: -0.08, z: 0.18, dx: -0.2, dz: 0.28, restY: 0.16, peakY: 0.56, rotY: 0.7, rotZ: 0.35 },
    ],
    [c1, { x: 0.08, z: 0.2, dx: 0.18, dz: 0.3, restY: 0.16, peakY: 0.58, rotY: -0.9, rotZ: -0.4 }],
    [c2, { x: 0, z: 0, dx: 0.02, dz: -0.06, restY: 0.18, peakY: 0.38, rotY: 0.28, rotX: 0.1 }],
    [c3, { x: 0, z: 0.02, dx: -0.04, dz: 0.1, restY: 0.22, peakY: 0.62, rotY: 1.4, rotZ: 0.22 }],
    [
      c4,
      { x: 0.2, z: -0.05, dx: 0.56, dz: -0.18, restY: 0.16, peakY: 0.45, rotY: 0.85, rotX: -0.12 },
    ],
    [
      c5,
      {
        x: -0.2,
        z: -0.05,
        dx: -0.58,
        dz: -0.14,
        restY: 0.16,
        peakY: 0.48,
        rotY: -0.75,
        rotZ: 0.15,
      },
    ],
    [c6, { x: -0.12, z: 0.1, dx: -0.36, dz: 0.44, restY: 0.16, peakY: 0.54, rotY: 2.1, rotX: 0.2 }],
    [
      c7,
      { x: 0.12, z: 0.08, dx: 0.42, dz: 0.36, restY: 0.16, peakY: 0.52, rotY: -1.8, rotZ: -0.2 },
    ],
    [c8, { x: 0.02, z: 0.22, dx: 0.14, dz: 0.56, restY: 0.15, peakY: 0.64, rotY: 1.1, rotX: 0.14 }],
  ];
  return {
    group,
    chunks: specs.map(([node, cfg], i) => {
      group.add(node);
      return makeChunk(node, 'alchemical-puppet', i, cfg);
    }),
    archetype: 'alchemical-puppet',
    caption: '发条停摆 · 炉心熄灭',
  };
}

function buildApepLambCorpse(resources, prim, lightMat) {
  const group = new THREE.Group();
  group.name = 'Overlord_Corpse_ApepLamb';
  const bone = stdMat(resources, '#e8dec6', { roughness: 0.72, metalness: 0.06 });
  const obsidian = stdMat(resources, '#1f1827', { roughness: 0.58, metalness: 0.22 });
  const gold = stdMat(resources, '#ae786b', { roughness: 0.44, metalness: 0.72 });
  const crimson = stdMat(resources, '#7a1c2f', { roughness: 0.78, metalness: 0.1 });

  const c0 = new THREE.Group();
  addPart(c0, prim.box, bone, [0, 0.09, 0], [0.24, 0.16, 0.34], [0.18, 0, 0]);
  addPart(c0, prim.box, bone, [0, 0.06, 0.18], [0.15, 0.11, 0.18], [0.28, 0, 0]);
  addPart(c0, prim.box, gold, [0, 0.17, 0.02], [0.12, 0.03, 0.16], [0.1, 0.78, 0]);

  const c1 = new THREE.Group();
  addPart(c1, prim.ring, obsidian, [0, 0.09, 0], [0.26, 0.26, 0.28], [Math.PI / 2, 0.3, 0]);
  addPart(c1, prim.cyl, gold, [-0.08, 0.11, 0.06], [0.09, 0.09, 0.09], [0.3, 0, 0.4]);

  const c2 = new THREE.Group();
  addPart(c2, prim.ring, obsidian, [0, 0.09, 0], [0.24, 0.24, 0.26], [Math.PI / 2, -0.35, 0]);
  addPart(c2, prim.cyl, gold, [0.08, 0.1, -0.04], [0.08, 0.1, 0.08], [0, 0.2, -0.5]);

  const c3 = new THREE.Group();
  addPart(c3, prim.box, obsidian, [0, 0.07, 0], [0.52, 0.12, 0.4], [0, 0.12, 0]);
  addPart(c3, prim.box, bone, [-0.16, 0.14, 0], [0.07, 0.12, 0.32], [0, 0, -0.25]);
  addPart(c3, prim.box, bone, [0.16, 0.14, 0], [0.07, 0.12, 0.32], [0, 0, 0.25]);

  const c4 = new THREE.Group();
  addPart(c4, prim.ring, gold, [-0.1, 0.06, 0], [0.18, 0.12, 0.12], [Math.PI / 2, 0, 0.3]);
  addPart(c4, prim.ring, gold, [0.1, 0.06, 0.04], [0.18, 0.12, 0.12], [Math.PI / 2.2, 0, -0.2]);

  const c5 = new THREE.Group();
  addPart(c5, prim.cyl, gold, [0, 0.07, 0], [0.18, 0.09, 0.18], [0.2, 0, 0]);
  addPart(c5, prim.ring, gold, [0.14, 0.05, 0], [0.16, 0.1, 0.1], [Math.PI / 2, 0, 0.4]);

  const c6 = new THREE.Group();
  addPart(c6, prim.box, crimson, [0, 0.05, 0], [0.48, 0.06, 0.16], [0, 0.42, 0]);
  addPart(c6, prim.box, gold, [0.06, 0.08, 0.02], [0.14, 0.03, 0.18], [0, -0.2, 0]);

  const c7 = new THREE.Group();
  addPart(c7, prim.cyl, gold, [0, 0.07, 0], [0.26, 0.11, 0.26], [0.2, 0, -0.15]);
  addPart(c7, prim.oct, lightMat, [0, 0.13, 0], [0.18, 0.16, 0.18], [0.3, 0.5, 0]);

  const c8 = new THREE.Group();
  addPart(c8, prim.cyl, obsidian, [0, 0.04, 0], [0.34, 0.05, 0.34], [0, 0.3, 0]);
  addPart(c8, prim.box, lightMat, [0, 0.07, 0], [0.24, 0.02, 0.04], [0, 0.4, 0]);
  addPart(c8, prim.box, lightMat, [0, 0.07, 0], [0.04, 0.02, 0.24], [0, 0.4, 0]);

  const specs = [
    [c0, { x: 0, z: 0.12, dx: 0.04, dz: 0.32, restY: 0.16, peakY: 0.56, rotY: 0.35, rotX: 0.2 }],
    [
      c1,
      { x: -0.15, z: 0.12, dx: -0.44, dz: 0.22, restY: 0.16, peakY: 0.62, rotY: -1.1, rotZ: 0.3 },
    ],
    [c2, { x: 0.15, z: 0.12, dx: 0.46, dz: 0.2, restY: 0.16, peakY: 0.6, rotY: 1.2, rotZ: -0.3 }],
    [c3, { x: 0, z: -0.02, dx: 0, dz: -0.12, restY: 0.18, peakY: 0.36, rotY: 0.2, rotX: 0.1 }],
    [c4, { x: -0.18, z: 0, dx: -0.52, dz: -0.18, restY: 0.15, peakY: 0.48, rotY: 1.6 }],
    [c5, { x: 0.18, z: 0, dx: 0.5, dz: -0.14, restY: 0.15, peakY: 0.46, rotY: -1.5 }],
    [c6, { x: -0.06, z: 0.18, dx: -0.28, dz: 0.52, restY: 0.15, peakY: 0.42, rotY: 0.9 }],
    [c7, { x: 0, z: 0, dx: 0.08, dz: 0.06, restY: 0.18, peakY: 0.58, rotY: 1.7 }],
    [c8, { x: 0.08, z: 0.2, dx: 0.28, dz: 0.48, restY: 0.15, peakY: 0.44, rotY: 0.8 }],
  ];
  return {
    group,
    chunks: specs.map(([node, cfg], i) => {
      group.add(node);
      return makeChunk(node, 'apep-lamb', i, cfg);
    }),
    archetype: 'apep-lamb',
    caption: '咒印崩解 · 祭血归尘',
  };
}

function buildMoonTreeCorpse(resources, prim, lightMat, part) {
  const variant = part === 'crown' ? 'moon-crown' : part === 'root' ? 'moon-root' : 'moon-eye';
  const caption =
    variant === 'moon-crown'
      ? '树冠凋零 · 月疫散尽'
      : variant === 'moon-root'
        ? '根脉断绝 · 灵流枯竭'
        : '魔眼碎裂 · 母树沉寂';
  const group = new THREE.Group();
  group.name = `Overlord_Corpse_${variant}`;
  const bark = stdMat(resources, '#737f7b', { roughness: 0.86, metalness: 0.08 });
  const silverBark = stdMat(resources, '#a7bab7', { roughness: 0.7, metalness: 0.15 });
  const brass = stdMat(resources, '#bfa05a', { roughness: 0.4, metalness: 0.72 });
  const violetBloom = stdMat(resources, '#785a8f', { roughness: 0.5, metalness: 0.15 });

  const chunks = [];
  for (let i = 0; i < 9; i++) {
    const node = new THREE.Group();
    if (i === 0) {
      addPart(node, prim.cyl, bark, [0, 0.09, 0], [0.46, 0.16, 0.38], [0.1, 0.2, 0.05]);
      addPart(node, prim.box, silverBark, [0, 0.15, 0], [0.36, 0.07, 0.24], [0, -0.3, 0]);
    } else if (i === 1) {
      if (variant === 'moon-eye') {
        addPart(node, prim.ring, brass, [0, 0.08, 0], [0.34, 0.34, 0.2], [Math.PI / 2.2, 0.2, 0]);
        addPart(node, prim.oct, lightMat, [0, 0.1, 0], [0.22, 0.18, 0.22], [0.2, 0.6, 0]);
      } else if (variant === 'moon-crown') {
        addPart(node, prim.cone, violetBloom, [0, 0.11, 0], [0.3, 0.22, 0.3], [0.2, 0, -0.15]);
        addPart(node, prim.oct, lightMat, [0, 0.12, 0.08], [0.16, 0.16, 0.16], [0, 0, 0]);
      } else {
        addPart(node, prim.box, bark, [0, 0.08, 0], [0.56, 0.12, 0.14], [0.05, 0.4, 0.1]);
        addPart(node, prim.ring, brass, [0, 0.1, 0], [0.22, 0.22, 0.18], [0, 0.4, 0]);
      }
    } else if (i < 5) {
      const mat = i % 2 ? silverBark : bark;
      addPart(node, prim.box, mat, [0, 0.07, 0], [0.44, 0.1, 0.13], [0.08, i * 0.6, 0.12]);
      addPart(node, prim.box, brass, [0.1, 0.11, 0], [0.12, 0.05, 0.16], [0, 0.4, 0]);
    } else {
      const mat = i === 5 || i === 8 ? lightMat : variant === 'moon-crown' ? violetBloom : brass;
      addPart(node, prim.oct, mat, [0, 0.07, 0], [0.2, 0.12, 0.18], [0.3, i, 0.2]);
    }
    const ang = i * 2.3999 + 0.3;
    const rad = i < 2 ? 0.1 : 0.35 + (i % 4) * 0.12;
    group.add(node);
    chunks.push(
      makeChunk(node, variant, i, {
        dx: Math.cos(ang) * rad,
        dz: Math.sin(ang) * rad,
        restY: i < 2 ? 0.17 : 0.15,
        peakY: 0.42 + (i % 3) * 0.1,
        rotY: (i % 2 ? 1 : -1) * (0.6 + i * 0.25),
      }),
    );
  }
  return { group, chunks, archetype: variant, caption };
}

function buildAresCorpse(resources, prim, lightMat) {
  const group = new THREE.Group();
  group.name = 'Overlord_Corpse_Ares';
  const armor = stdMat(resources, '#2f3846', { roughness: 0.42, metalness: 0.82 });
  const chrome = stdMat(resources, '#9fb0bf', { roughness: 0.28, metalness: 0.9 });
  const gold = stdMat(resources, '#d5a349', { roughness: 0.35, metalness: 0.85 });
  const cinder = stdMat(resources, '#1a1d24', { roughness: 0.85, metalness: 0.4 });

  const c0 = new THREE.Group();
  addPart(c0, prim.box, armor, [0, 0.1, 0], [0.5, 0.18, 0.42], [0.06, 0.15, 0]);
  addPart(c0, prim.box, gold, [0, 0.19, 0.1], [0.36, 0.04, 0.12], [0.06, 0.15, 0]);

  const c1 = new THREE.Group();
  addPart(c1, prim.ring, chrome, [0, 0.09, 0], [0.32, 0.32, 0.24], [Math.PI / 2.3, 0.2, 0]);
  addPart(c1, prim.oct, lightMat, [0, 0.11, 0], [0.22, 0.18, 0.22], [0.3, 0.5, 0]);

  const c2 = new THREE.Group();
  addPart(c2, prim.box, armor, [0, 0.09, 0], [0.24, 0.16, 0.28], [0.12, -0.3, 0.15]);
  addPart(c2, prim.box, lightMat, [0, 0.1, 0.13], [0.18, 0.04, 0.04], [0.12, -0.3, 0.15]);

  const c3 = new THREE.Group();
  addPart(c3, prim.box, chrome, [0, 0.05, 0], [0.68, 0.05, 0.14], [0, -0.42, 0.06]);
  addPart(c3, prim.box, gold, [-0.26, 0.06, 0.09], [0.12, 0.09, 0.24], [0, -0.42, 0]);

  const c4 = new THREE.Group();
  addPart(c4, prim.box, armor, [0, 0.06, 0], [0.5, 0.08, 0.13], [0.08, 0.52, 0]);
  for (let i = -2; i <= 2; i++) {
    addPart(c4, prim.cone, chrome, [i * 0.09, 0.06, 0.08], [0.05, 0.08, 0.05], [Math.PI / 2, 0, 0]);
  }

  const c5 = new THREE.Group();
  addPart(c5, prim.box, armor, [0, 0.09, 0], [0.26, 0.14, 0.24], [0.15, 0.35, -0.2]);
  addPart(c5, prim.cyl, cinder, [-0.06, 0.14, 0.09], [0.07, 0.08, 0.07], [Math.PI / 3, 0, 0]);
  addPart(c5, prim.cyl, cinder, [0.06, 0.14, 0.09], [0.07, 0.08, 0.07], [Math.PI / 3, 0, 0]);

  const c6 = new THREE.Group();
  addPart(c6, prim.box, armor, [0, 0.08, 0], [0.26, 0.13, 0.22], [-0.1, -0.45, 0.18]);
  addPart(c6, prim.box, gold, [0, 0.14, -0.06], [0.24, 0.04, 0.08], [0, -0.45, 0.18]);

  const c7 = new THREE.Group();
  addPart(c7, prim.box, armor, [0, 0.06, 0], [0.28, 0.09, 0.2], [0.1, 0.7, -0.15]);
  addPart(c7, prim.box, gold, [0, 0.11, 0], [0.22, 0.03, 0.05], [0, 0.7, 0]);

  const c8 = new THREE.Group();
  addPart(c8, prim.cyl, cinder, [-0.07, 0.07, 0], [0.12, 0.14, 0.12], [Math.PI / 2.2, 0.2, 0]);
  addPart(c8, prim.cyl, cinder, [0.07, 0.07, 0], [0.12, 0.14, 0.12], [Math.PI / 2.2, -0.2, 0]);

  const specs = [
    [c0, { x: 0, z: -0.02, dx: 0, dz: -0.08, restY: 0.18, peakY: 0.38, rotY: 0.25 }],
    [c1, { x: 0, z: 0.04, dx: 0.04, dz: 0.14, restY: 0.2, peakY: 0.56, rotY: 1.3 }],
    [c2, { x: -0.04, z: 0.18, dx: -0.18, dz: 0.34, restY: 0.16, peakY: 0.58, rotY: -0.7 }],
    [c3, { x: 0.18, z: 0.04, dx: 0.55, dz: 0.12, restY: 0.16, peakY: 0.48, rotY: 0.9 }],
    [c4, { x: -0.18, z: 0.04, dx: -0.54, dz: 0.1, restY: 0.16, peakY: 0.48, rotY: -0.95 }],
    [c5, { x: -0.16, z: -0.14, dx: -0.48, dz: -0.32, restY: 0.16, peakY: 0.54, rotY: 1.1 }],
    [c6, { x: 0.16, z: -0.14, dx: 0.5, dz: -0.3, restY: 0.16, peakY: 0.52, rotY: -1.1 }],
    [c7, { x: -0.1, z: 0.2, dx: -0.3, dz: 0.48, restY: 0.15, peakY: 0.45, rotY: 1.4 }],
    [c8, { x: 0.1, z: 0.2, dx: 0.32, dz: 0.46, restY: 0.15, peakY: 0.45, rotY: -1.3 }],
  ];
  return {
    group,
    chunks: specs.map(([node, cfg], i) => {
      group.add(node);
      return makeChunk(node, 'ares-mecha', i, cfg);
    }),
    archetype: 'ares-mecha',
    caption: '炉心停机 · 肃清终止',
  };
}

function buildRadiantWyvernCorpse(resources, prim, lightMat) {
  const group = new THREE.Group();
  group.name = 'Overlord_Corpse_RadiantWyvern';
  const ivory = stdMat(resources, '#efe6cf', { roughness: 0.5, metalness: 0.14 });
  const gold = stdMat(resources, '#dfba62', { roughness: 0.32, metalness: 0.8 });
  const starCyan = stdMat(resources, '#5ea8be', { roughness: 0.3, metalness: 0.35 });

  const c0 = new THREE.Group();
  addPart(c0, prim.cone, ivory, [0, 0.09, 0.05], [0.22, 0.34, 0.22], [Math.PI / 2.2, 0, 0]);
  addPart(c0, prim.cone, gold, [-0.11, 0.14, -0.14], [0.08, 0.28, 0.08], [-Math.PI / 2.6, 0.3, 0]);
  addPart(c0, prim.cone, gold, [0.11, 0.14, -0.14], [0.08, 0.28, 0.08], [-Math.PI / 2.6, -0.3, 0]);

  const c1 = new THREE.Group();
  addPart(c1, prim.cyl, ivory, [0, 0.08, 0], [0.09, 0.44, 0.09], [Math.PI / 2, 0.1, 0]);
  addPart(c1, prim.box, gold, [0, 0.13, 0], [0.06, 0.05, 0.4], [0.06, 0.1, 0]);
  for (const offset of [-0.14, -0.03, 0.08, 0.19]) {
    addPart(c1, prim.cyl, ivory, [-0.12, 0.1, offset], [0.035, 0.22, 0.035], [0.2, 0, 1.1]);
    addPart(c1, prim.cyl, ivory, [0.12, 0.1, offset], [0.035, 0.22, 0.035], [0.2, 0, -1.1]);
  }

  const c2 = new THREE.Group();
  addPart(c2, prim.oct, lightMat, [0, 0.12, 0], [0.26, 0.24, 0.26], [0.4, 0.6, 0]);
  addPart(c2, prim.oct, starCyan, [0.1, 0.08, 0.08], [0.15, 0.14, 0.15], [0.2, 0.2, 0]);

  const c3 = new THREE.Group();
  addPart(c3, prim.cyl, gold, [-0.12, 0.08, -0.02], [0.05, 0.44, 0.05], [0.1, 0.35, Math.PI / 2.2]);
  addPart(
    c3,
    prim.cyl,
    ivory,
    [0.14, 0.07, 0.06],
    [0.04, 0.34, 0.04],
    [-0.1, -0.25, Math.PI / 1.9],
  );
  for (const [fx, fz, rot] of [
    [-0.16, 0.09, 0.4],
    [-0.02, 0.12, 0.25],
    [0.12, 0.14, 0.1],
  ]) {
    addPart(c3, prim.cone, starCyan, [fx, 0.05, fz], [0.11, 0.28, 0.03], [Math.PI / 2, rot, 0]);
  }

  const c4 = new THREE.Group();
  addPart(
    c4,
    prim.cyl,
    gold,
    [0.12, 0.08, -0.02],
    [0.05, 0.44, 0.05],
    [0.1, -0.35, -Math.PI / 2.2],
  );
  addPart(
    c4,
    prim.cyl,
    ivory,
    [-0.14, 0.07, 0.06],
    [0.04, 0.34, 0.04],
    [-0.1, 0.25, -Math.PI / 1.9],
  );
  for (const [fx, fz, rot] of [
    [0.16, 0.09, -0.4],
    [0.02, 0.12, -0.25],
    [-0.12, 0.14, -0.1],
  ]) {
    addPart(c4, prim.cone, starCyan, [fx, 0.05, fz], [0.11, 0.28, 0.03], [Math.PI / 2, rot, 0]);
  }

  const c5 = new THREE.Group();
  addPart(c5, prim.cyl, ivory, [0, 0.06, 0], [0.14, 0.36, 0.14], [Math.PI / 2, 0.4, 0]);
  addPart(c5, prim.box, gold, [0, 0.11, 0], [0.05, 0.05, 0.32], [0, 0.4, 0]);

  const c6 = new THREE.Group();
  addPart(c6, prim.cone, gold, [0, 0.07, 0], [0.22, 0.32, 0.08], [Math.PI / 2, -0.4, 0]);

  const c7 = new THREE.Group();
  for (const offset of [-0.07, 0, 0.07]) {
    addPart(c7, prim.cone, ivory, [offset, 0.07, 0.06], [0.05, 0.2, 0.05], [Math.PI / 2.2, 0, 0]);
  }
  addPart(c7, prim.box, gold, [0, 0.06, -0.06], [0.18, 0.07, 0.12], [0, 0, 0]);

  const c8 = new THREE.Group();
  addPart(c8, prim.box, starCyan, [-0.06, 0.04, 0], [0.16, 0.03, 0.16], [0, 0.78, 0]);
  addPart(c8, prim.box, gold, [0.08, 0.05, 0.04], [0.14, 0.03, 0.14], [0, 0.4, 0]);

  const specs = [
    [c0, { x: 0, z: 0.16, dx: 0.06, dz: 0.36, restY: 0.16, peakY: 0.58, rotY: 0.45 }],
    [c1, { x: 0, z: -0.02, dx: 0, dz: -0.1, restY: 0.18, peakY: 0.4, rotY: -0.2 }],
    [c2, { x: 0, z: 0.04, dx: -0.05, dz: 0.14, restY: 0.2, peakY: 0.62, rotY: 1.5 }],
    [c3, { x: -0.2, z: 0, dx: -0.58, dz: -0.06, restY: 0.15, peakY: 0.5, rotY: 0.6 }],
    [c4, { x: 0.2, z: 0, dx: 0.58, dz: -0.04, restY: 0.15, peakY: 0.5, rotY: -0.6 }],
    [c5, { x: -0.12, z: -0.16, dx: -0.34, dz: -0.44, restY: 0.15, peakY: 0.46, rotY: 1.1 }],
    [c6, { x: 0.12, z: -0.18, dx: 0.38, dz: -0.48, restY: 0.15, peakY: 0.48, rotY: -1.0 }],
    [c7, { x: -0.12, z: 0.18, dx: -0.34, dz: 0.46, restY: 0.15, peakY: 0.52, rotY: 0.8 }],
    [c8, { x: 0.12, z: 0.18, dx: 0.36, dz: 0.44, restY: 0.15, peakY: 0.46, rotY: -0.9 }],
  ];
  return {
    group,
    chunks: specs.map(([node, cfg], i) => {
      group.add(node);
      return makeChunk(node, 'radiant-wyvern', i, cfg);
    }),
    archetype: 'radiant-wyvern',
    caption: '星翼折落 · 辉光敛散',
  };
}

export function buildOverlordCorpse(resources, def, reduced) {
  const prim = createPrimitives(resources);
  const lightColor =
    def?.id === 'alchemicalPuppet'
      ? '#6bf5a9'
      : def?.id === 'apepLamb'
        ? '#f76f80'
        : def?.id === 'radiantWyvern'
          ? '#a8eeff'
          : def?.id === 'ares' || def?.id?.startsWith('ares')
            ? '#7ef5ff'
            : '#9ce6ff';
  const light = resources.track(
    new THREE.MeshBasicMaterial({
      color: lightColor,
      transparent: true,
      opacity: 1,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  const haze = resources.track(
    new THREE.MeshBasicMaterial({
      color: def?.color || '#d8b4fe',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );

  let built;
  if (def?.id === 'alchemicalPuppet') {
    built = buildAlchemicalPuppetCorpse(resources, prim, light);
  } else if (def?.id === 'apepLamb') {
    built = buildApepLambCorpse(resources, prim, light);
  } else if (def?.tactic?.mode === 'moon-tree' || /moon/i.test(def?.id || '')) {
    built = buildMoonTreeCorpse(resources, prim, light, def?.tactic?.part);
  } else if (def?.id === 'ares' || def?.id?.startsWith('ares')) {
    built = buildAresCorpse(resources, prim, light);
  } else {
    built = buildRadiantWyvernCorpse(resources, prim, light);
  }

  if (reduced) {
    for (const chunk of built.chunks.slice(4)) chunk.node.visible = false;
    built.chunks = built.chunks.slice(0, 4);
  }

  return {
    ...built,
    motes: [],
    materials: { shell: { opacity: 1 }, light, haze },
    leaveRemains: true,
  };
}

export function buildBossCorpse(resources, def, reduced) {
  const prim = createPrimitives(resources);
  const style = inferBossStyle(def);
  const accentColor = new THREE.Color(def?.color || '#8c7a6b');
  const darkColor = accentColor.clone().multiplyScalar(0.35);
  const trimColor = new THREE.Color('#cfb378');

  const primaryMat = stdMat(resources, darkColor, { roughness: 0.72, metalness: 0.34 });
  const accentMat = stdMat(resources, accentColor, { roughness: 0.56, metalness: 0.42 });
  const trimMat = stdMat(resources, trimColor, { roughness: 0.38, metalness: 0.75 });
  const light = resources.track(
    new THREE.MeshBasicMaterial({
      color: accentColor.clone().lerp(new THREE.Color('#ffffff'), 0.45),
      transparent: true,
      opacity: 1,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  const haze = resources.track(
    new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );

  const group = new THREE.Group();
  group.name = `Boss_Corpse_${def?.id || style}`;

  const c0 = new THREE.Group();
  if (style === 'beast') {
    addPart(c0, prim.cyl, primaryMat, [0, 0.09, 0], [0.14, 0.44, 0.12], [Math.PI / 2, 0.1, 0]);
    for (const off of [-0.14, 0, 0.14]) {
      addPart(c0, prim.cyl, accentMat, [-0.14, 0.1, off], [0.04, 0.24, 0.04], [0, 0, 1.1]);
      addPart(c0, prim.cyl, accentMat, [0.14, 0.1, off], [0.04, 0.24, 0.04], [0, 0, -1.1]);
    }
  } else {
    addPart(
      c0,
      prim.cyl,
      primaryMat,
      [-0.14, 0.11, -0.04],
      [0.14, 0.36, 0.14],
      [Math.PI / 2.2, 0.28, 0],
    );
    addPart(
      c0,
      prim.cyl,
      primaryMat,
      [0.14, 0.11, 0.04],
      [0.14, 0.36, 0.14],
      [-Math.PI / 2.2, -0.2, 0],
    );
    addPart(c0, prim.ring, trimMat, [0, 0.12, 0], [0.42, 0.42, 0.14], [Math.PI / 2.4, 0.2, 0]);
    addPart(c0, prim.oct, light, [0, 0.16, 0], [0.14, 0.18, 0.14], [0.3, 0.6, 0]);
  }

  const c1 = new THREE.Group();
  if (style === 'beast') {
    addPart(c1, prim.cone, accentMat, [0, 0.09, 0.04], [0.22, 0.3, 0.2], [Math.PI / 2.2, 0.2, 0]);
    addPart(c1, prim.cone, trimMat, [-0.1, 0.16, -0.05], [0.07, 0.22, 0.07], [-0.4, 0, 0.35]);
    addPart(c1, prim.cone, trimMat, [0.1, 0.16, -0.05], [0.07, 0.22, 0.07], [-0.4, 0, -0.35]);
  } else if (style === 'astral') {
    addPart(c1, prim.ring, trimMat, [0, 0.09, 0], [0.3, 0.3, 0.22], [Math.PI / 2.2, 0.3, 0]);
    addPart(c1, prim.cone, accentMat, [0, 0.12, 0], [0.16, 0.24, 0.16], [0.4, 0, 0]);
  } else {
    addPart(c1, prim.cyl, trimMat, [0, 0.1, 0], [0.24, 0.18, 0.24], [0.25, -0.2, 0.12]);
    addPart(c1, prim.cone, primaryMat, [-0.11, 0.17, 0], [0.08, 0.18, 0.08], [0, 0, 0.45]);
    addPart(c1, prim.cone, primaryMat, [0.11, 0.17, 0], [0.08, 0.18, 0.08], [0, 0, -0.45]);
  }

  const c2 = new THREE.Group();
  addPart(c2, prim.oct, light, [0, 0.11, 0], [0.26, 0.24, 0.26], [0.3, 0.5, 0.2]);
  addPart(c2, prim.ring, trimMat, [0, 0.09, 0], [0.3, 0.3, 0.18], [Math.PI / 2, 0, 0]);

  const c3 = new THREE.Group();
  addPart(c3, prim.box, accentMat, [0, 0.08, 0], [0.28, 0.13, 0.24], [0, 0.4, -0.15]);
  addPart(c3, prim.box, trimMat, [0.04, 0.13, 0], [0.22, 0.04, 0.08], [0, 0.4, 0]);

  const c4 = new THREE.Group();
  addPart(c4, prim.box, accentMat, [0, 0.08, 0], [0.28, 0.13, 0.24], [0, -0.38, 0.15]);
  addPart(c4, prim.box, trimMat, [-0.04, 0.13, 0], [0.22, 0.04, 0.08], [0, -0.38, 0]);

  const c5 = new THREE.Group();
  addPart(c5, prim.box, primaryMat, [0, 0.06, 0], [0.56, 0.08, 0.14], [0.05, -0.5, 0.08]);
  addPart(c5, prim.box, trimMat, [0.22, 0.08, 0], [0.16, 0.11, 0.18], [0, -0.5, 0]);

  const c6 = new THREE.Group();
  addPart(c6, prim.box, trimMat, [0, 0.06, 0], [0.5, 0.07, 0.12], [-0.04, 0.55, -0.08]);

  const c7 = new THREE.Group();
  addPart(c7, prim.cyl, primaryMat, [0, 0.05, 0], [0.3, 0.07, 0.3], [0, 0.2, 0]);
  addPart(c7, prim.box, accentMat, [0, 0.09, 0], [0.22, 0.03, 0.07], [0, 0.78, 0]);

  const c8 = new THREE.Group();
  addPart(c8, prim.box, primaryMat, [0, 0.05, 0], [0.26, 0.07, 0.22], [0.1, 1.1, 0]);
  addPart(c8, prim.box, trimMat, [0, 0.08, 0], [0.16, 0.03, 0.16], [0, 0.4, 0]);

  let chunks = [
    [c0, { x: 0, z: 0, dx: 0, dz: -0.06, restY: 0.18, peakY: 0.42, rotY: 0.24 }],
    [c1, { x: 0, z: 0.14, dx: 0.06, dz: 0.34, restY: 0.17, peakY: 0.58, rotY: 0.7 }],
    [c2, { x: 0, z: 0.02, dx: -0.05, dz: 0.14, restY: 0.2, peakY: 0.6, rotY: 1.5 }],
    [c3, { x: -0.18, z: -0.06, dx: -0.52, dz: -0.16, restY: 0.16, peakY: 0.48, rotY: -0.8 }],
    [c4, { x: 0.18, z: -0.06, dx: 0.52, dz: -0.14, restY: 0.16, peakY: 0.48, rotY: 0.8 }],
    [c5, { x: 0.16, z: 0.08, dx: 0.54, dz: 0.22, restY: 0.15, peakY: 0.5, rotY: 1.1 }],
    [c6, { x: -0.16, z: 0.08, dx: -0.54, dz: 0.2, restY: 0.15, peakY: 0.5, rotY: -1.1 }],
    [c7, { x: -0.1, z: 0.2, dx: -0.3, dz: 0.48, restY: 0.15, peakY: 0.44, rotY: 1.3 }],
    [c8, { x: 0.1, z: 0.2, dx: 0.3, dz: 0.46, restY: 0.15, peakY: 0.44, rotY: -1.2 }],
  ].map(([node, cfg], i) => {
    group.add(node);
    return makeChunk(node, `boss-${style}`, i, cfg);
  });

  if (reduced) {
    for (const chunk of chunks.slice(4)) chunk.node.visible = false;
    chunks = chunks.slice(0, 4);
  }

  return {
    group,
    chunks,
    motes: [],
    materials: { shell: { opacity: 1 }, light, haze },
    archetype: `boss-${style}`,
    caption: '强敌陨落',
    leaveRemains: true,
  };
}
