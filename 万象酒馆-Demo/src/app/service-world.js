import * as THREE from 'three';
import { TAVERN_HALL } from '../content/tavern-layout.js';
import { servicePosition, serviceSeat } from '../service-walk.js';
import { serviceGuest } from '../tavern-service.js';
import { attachTavernSupplies, TAVERN_MODEL_FILES } from '../tavern/hall-model.js';
import { createSceneLoading } from '../shared/scene-loading.js';
import { createResourceScope } from '../shared/resources.js';
import { createFrameBudget, deviceRenderQuality } from '../shared/render-budget.js';

const coats = [0x456f77, 0x963c3d, 0x799653, 0x746194, 0xc88e4d, 0x56798c, 0x9a5445];

function costumeFactory(resources) {
  const cube = resources.track(new THREE.BoxGeometry(1, 1, 1));
  const disk = resources.track(new THREE.CircleGeometry(1, 16));
  const palette = new Map();
  const shadow = resources.track(
    new THREE.MeshBasicMaterial({
      color: 0x2d171b,
      transparent: true,
      opacity: 0.23,
      depthWrite: false,
    }),
  );
  function shade(color) {
    if (!palette.has(color))
      palette.set(
        color,
        resources.track(new THREE.MeshStandardMaterial({ color, roughness: 0.9 })),
      );
    return palette.get(color);
  }
  return function costume(id) {
    const root = new THREE.Group();
    const person = new THREE.Group();
    root.add(person);
    function part(parent, color, size, position) {
      const mesh = new THREE.Mesh(cube, shade(color));
      mesh.scale.set(...size);
      mesh.position.set(...position);
      parent.add(mesh);
      return mesh;
    }
    const coat = coats[id % coats.length];
    const skin = [0xc78962, 0xe7b48a, 0xae7656, 0xf0bd94][id % 4];
    const hair = [0x322329, 0x533937, 0x6b4e3e, 0xe4d1aa][id % 4];
    const legs = [-0.09, 0.09].map((x) => part(person, 0x352833, [0.14, 0.36, 0.16], [x, 0.2, 0]));
    part(person, coat, [0.38, 0.42, 0.26], [0, 0.57, 0]);
    part(person, 0x3b2530, [0.39, 0.05, 0.28], [0, 0.41, 0]);
    part(person, 0xe2b170, [0.08, 0.06, 0.02], [0.05, 0.41, 0.151]);
    part(person, 0xe7c995, [0.24, 0.065, 0.27], [0, 0.765, 0.01]);
    part(person, skin, [0.27, 0.26, 0.245], [0, 0.925, 0.015]);
    part(person, hair, [0.29, 0.09, 0.27], [0, 1.06, -0.005]);
    part(person, hair, [0.29, 0.17, 0.075], [0, 0.96, -0.103]);
    if (id % 3 === 1) {
      part(person, coat, [0.34, 0.08, 0.32], [0, 1.13, 0]);
      part(person, 0xdfad59, [0.39, 0.035, 0.37], [0, 1.08, 0]);
    }
    const arms = [-0.24, 0.24].map((x) => {
      const arm = new THREE.Group();
      arm.position.set(x, 0.71, 0);
      person.add(arm);
      part(arm, coat, [0.12, 0.29, 0.14], [0, -0.115, 0]);
      part(arm, skin, [0.105, 0.075, 0.125], [0, -0.28, 0]);
      return arm;
    });
    const floorShadow = new THREE.Mesh(disk, shadow);
    floorShadow.rotation.x = -Math.PI / 2;
    floorShadow.scale.set(0.3, 0.23, 1);
    floorShadow.position.y = 0.055;
    root.add(floorShadow);
    return { root, person, legs, arms };
  };
}

function dressHall(model, resources) {
  const cut = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0.84);
  // Slice above the rising treads, removing the upper storey's walls and roof.
  const stairs = new THREE.Plane(new THREE.Vector3(0, -1, 0.64), 0.94).normalize();
  const threshold = new THREE.Plane(new THREE.Vector3(0, -1, 0), 2.91);
  model.traverse((node) => {
    if (node.name.startsWith('05_Ceiling')) node.visible = false;
    if (node.isLight) {
      node.castShadow = false;
      node.intensity *= 0.62;
    }
    if (!node.isMesh) return;
    node.receiveShadow = true;
    const name = node.name.match(/^\d\d_/) ? node.name : node.parent?.name || '';
    node.castShadow = /^(10|11|13|15|16|20|21|22|29)_/.test(name);
    if (!/^(03|04|06|24|25|27|28|29)_/.test(name)) return;
    const clip = (original) => {
      const material = original.clone();
      if (name.startsWith('29_')) {
        // Hide the upper plaster enclosure and door leaf while keeping the original oak edging.
        // The landing, full jambs and stair nosings remain visible in the cutaway.
        const enclosure = ['plaster', 'plaster2', 'oak', 'walnutDark'].includes(original.name);
        material.clippingPlanes = enclosure
          ? [threshold]
          : original.name === 'oakEdge'
            ? []
            : [stairs];
      } else material.clippingPlanes = [cut];
      material.clipShadows = true;
      resources.material(material);
      return material;
    };
    node.material = Array.isArray(node.material) ? node.material.map(clip) : clip(node.material);
  });
}

function companionPoint(guest, point, member) {
  if (!member) return point;
  const seat = serviceSeat(guest.seat);
  if (seat?.radius && !guest.walk) {
    const [x, z] = seat.at;
    return member === 1
      ? [x, z + seat.radius + 0.3]
      : [x + (seat.id === 'window' ? 1 : -1) * (seat.radius + 0.29), z];
  }
  return [point[0] + (member === 1 ? 0.33 : -0.32), point[1] + member * 0.36];
}

function softDot(resources, color = '#fff5d8') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const paint = canvas.getContext('2d');
  const glow = paint.createRadialGradient(32, 32, 0, 32, 32, 31);
  glow.addColorStop(0, color);
  glow.addColorStop(0.34, `${color}b8`);
  glow.addColorStop(1, '#0000');
  paint.fillStyle = glow;
  paint.fillRect(0, 0, 64, 64);
  return resources.track(new THREE.CanvasTexture(canvas));
}

/** Add the small human props that make a cutaway room read as a working tavern. */
function decorateServiceHall(scene, resources, quality) {
  const candleWax = resources.track(
    new THREE.MeshStandardMaterial({ color: 0xf0dfb8, roughness: 0.84 }),
  );
  const brass = resources.track(
    new THREE.MeshStandardMaterial({ color: 0xc89655, metalness: 0.42, roughness: 0.43 }),
  );
  const plate = resources.track(
    new THREE.MeshStandardMaterial({ color: 0xe7e1cf, roughness: 0.5, metalness: 0.06 }),
  );
  const cup = resources.track(
    new THREE.MeshStandardMaterial({ color: 0x5f958d, roughness: 0.44, metalness: 0.15 }),
  );
  const wood = resources.track(
    new THREE.MeshStandardMaterial({ color: 0x5b3a2b, roughness: 0.86 }),
  );
  const chalk = resources.track(
    new THREE.MeshStandardMaterial({ color: 0x263a30, roughness: 0.94 }),
  );
  const leaf = resources.track(new THREE.MeshStandardMaterial({ color: 0x668453, roughness: 0.9 }));
  const glow = softDot(resources, '#ffd98b');
  const flameGlow = softDot(resources, '#ffb35c');
  const smokeGlow = softDot(resources, '#d7d0c6');
  const candleBody = resources.track(new THREE.CylinderGeometry(0.022, 0.03, 0.16, 8));
  const candleDish = resources.track(new THREE.CylinderGeometry(0.058, 0.07, 0.012, 12));
  const dish = resources.track(new THREE.CylinderGeometry(0.14, 0.16, 0.018, 18));
  const tumbler = resources.track(new THREE.CylinderGeometry(0.046, 0.052, 0.085, 10));
  const bottle = resources.track(new THREE.CylinderGeometry(0.035, 0.052, 0.27, 9));
  const vase = resources.track(new THREE.CylinderGeometry(0.038, 0.055, 0.13, 8));
  const sprig = resources.track(new THREE.BoxGeometry(0.022, 0.16, 0.022));
  const board = resources.track(new THREE.BoxGeometry(0.72, 0.86, 0.055));
  const boardFace = resources.track(new THREE.BoxGeometry(0.6, 0.72, 0.012));
  const boardLeg = resources.track(new THREE.BoxGeometry(0.055, 0.62, 0.055));
  const rackPole = resources.track(new THREE.CylinderGeometry(0.025, 0.035, 1.52, 8));
  const flames = [];
  const steam = [];
  const lights = [];
  const dustGeometry = resources.track(new THREE.BufferGeometry());
  const positions = new Float32Array(96 * 3);
  for (let index = 0; index < 96; index++) {
    positions[index * 3] = -5.3 + ((index * 17) % 115) / 10;
    positions[index * 3 + 1] = 0.25 + ((index * 29) % 28) / 10;
    positions[index * 3 + 2] = -4.7 + ((index * 43) % 93) / 10;
  }
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(
    dustGeometry,
    resources.track(
      new THREE.PointsMaterial({
        color: 0xffdca1,
        size: 0.028,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    ),
  );
  scene.add(dust);

  function glowSprite(texture, color, scale, opacity) {
    const material = resources.track(
      new THREE.SpriteMaterial({
        map: texture,
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(scale[0], scale[1], 1);
    return sprite;
  }

  for (const table of TAVERN_HALL.tables) {
    const [x, z] = table.at;
    const candle = new THREE.Group();
    candle.position.set(x + 0.16, 0.8, z - 0.08);
    const base = new THREE.Mesh(candleDish, brass);
    candle.add(base);
    const wax = new THREE.Mesh(candleBody, candleWax);
    wax.position.y = 0.085;
    candle.add(wax);
    const flame = glowSprite(flameGlow, 0xffc36c, [0.13, 0.27], 0.9);
    flame.position.y = 0.23;
    candle.add(flame);
    scene.add(candle);
    flames.push({ sprite: flame, phase: table.at[0] * 1.7 });
    const flower = new THREE.Group();
    flower.position.set(x - 0.17, 0.8, z + 0.12);
    const pot = new THREE.Mesh(vase, cup);
    pot.position.y = 0.065;
    flower.add(pot);
    for (let index = 0; index < 3; index++) {
      const stem = new THREE.Mesh(sprig, leaf);
      stem.position.set((index - 1) * 0.026, 0.18, (index % 2) * 0.018);
      stem.rotation.z = (index - 1) * 0.22;
      flower.add(stem);
    }
    scene.add(flower);
    const candleLight = quality.fps > 24 ? 1.6 : 0.8;
    const light = new THREE.PointLight(0xffb86a, candleLight, 3.8, 2);
    light.position.set(x + 0.16, 1.15, z - 0.08);
    scene.add(light);
    lights.push({ light, base: candleLight });
    for (let index = 0; index < 3; index++) {
      const angle = (Math.PI * 2 * index) / 3 + 0.4;
      const setting = new THREE.Group();
      setting.position.set(
        x + Math.cos(angle) * table.radius * 0.66,
        0.81,
        z + Math.sin(angle) * table.radius * 0.66,
      );
      const saucer = new THREE.Mesh(dish, plate);
      setting.add(saucer);
      if (index !== 1) {
        const glass = new THREE.Mesh(tumbler, cup);
        glass.position.set(0.13, 0.055, 0.02);
        setting.add(glass);
      }
      scene.add(setting);
    }
  }

  const [barX, barZ] = TAVERN_HALL.bar;
  for (let index = 0; index < 6; index++) {
    const bottleMesh = new THREE.Mesh(bottle, index % 3 === 0 ? cup : brass);
    bottleMesh.scale.y = 0.78 + (index % 3) * 0.15;
    bottleMesh.position.set(barX + 0.36 + index * 0.46, 0.96, barZ + 0.24);
    scene.add(bottleMesh);
  }
  for (let index = 0; index < 4; index++) {
    const glass = new THREE.Mesh(tumbler, cup);
    glass.position.set(barX + 0.6 + index * 0.92, 0.93, barZ + 0.26);
    scene.add(glass);
  }

  const menuBoard = new THREE.Group();
  menuBoard.position.set(2.35, 0.95, 3.75);
  menuBoard.rotation.y = -0.28;
  const menuFrame = new THREE.Mesh(board, wood);
  menuBoard.add(menuFrame);
  const menuFace = new THREE.Mesh(boardFace, chalk);
  menuFace.position.z = 0.034;
  menuBoard.add(menuFace);
  for (const x of [-0.26, 0.26]) {
    const leg = new THREE.Mesh(boardLeg, wood);
    leg.position.set(x, -0.64, -0.06);
    leg.rotation.x = 0.08;
    menuBoard.add(leg);
  }
  scene.add(menuBoard);

  const coatRack = new THREE.Group();
  coatRack.position.set(3.45, 0.79, 4.02);
  const pole = new THREE.Mesh(rackPole, wood);
  coatRack.add(pole);
  for (const [x, z, tilt] of [
    [-0.18, 0, 0.62],
    [0.18, 0, -0.62],
    [0, 0.18, 0.2],
    [0, -0.18, -0.2],
  ]) {
    const peg = new THREE.Mesh(sprig, wood);
    peg.scale.y = 0.42;
    peg.position.set(x, 0.67, z);
    peg.rotation.z = tilt;
    coatRack.add(peg);
  }
  scene.add(coatRack);

  const hearth = [6.56, 0.52, -4.35];
  for (let index = 0; index < 3; index++) {
    const log = new THREE.Mesh(rackPole, wood);
    log.scale.set(0.9, 0.34, 0.9);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = index * 0.42;
    log.position.set(hearth[0] - 0.12 + index * 0.13, 0.12 + index * 0.035, hearth[2] + 0.04);
    scene.add(log);
  }
  for (let index = 0; index < 4; index++) {
    const fire = glowSprite(flameGlow, index % 2 ? 0xffc35e : 0xff783d, [0.55, 1.1], 0.75);
    fire.position.set(hearth[0] - 0.26 + index * 0.17, hearth[1] + 0.25, hearth[2] + 0.06);
    scene.add(fire);
    flames.push({ sprite: fire, phase: index * 1.7, hearth: true });
  }
  const fireIntensity = quality.fps > 24 ? 4.2 : 2.4;
  const fireLight = new THREE.PointLight(0xff8a43, fireIntensity, 8.5, 2);
  fireLight.position.set(hearth[0], 1.3, hearth[2] + 0.4);
  scene.add(fireLight);
  lights.push({ light: fireLight, base: fireIntensity });

  for (const [x, z] of [
    [-3.2, -1.1],
    [2.3, 0.35],
    [5.15, -2.2],
  ]) {
    const pendant = new THREE.Group();
    pendant.position.set(x, 2.62, z);
    const chain = new THREE.Mesh(
      resources.track(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 5)),
      brass,
    );
    chain.position.y = 0.35;
    pendant.add(chain);
    const shade = new THREE.Mesh(
      resources.track(new THREE.ConeGeometry(0.32, 0.24, 14, 1, true)),
      brass,
    );
    shade.rotation.x = Math.PI;
    pendant.add(shade);
    const bulb = glowSprite(glow, 0xffd89a, [0.38, 0.38], 0.72);
    bulb.position.y = -0.05;
    pendant.add(bulb);
    scene.add(pendant);
  }
  const roomIntensity = quality.fps > 24 ? 3.4 : 1.8;
  const roomLight = new THREE.PointLight(0xffcd94, roomIntensity, 14, 2);
  roomLight.position.set(0.4, 3.25, 0.2);
  scene.add(roomLight);
  lights.push({ light: roomLight, base: roomIntensity });

  for (const [x, z, delay] of [
    [5.25, -3.65, 0],
    [5.55, -3.35, 1.2],
    [4.98, -3.4, 2.1],
    [5.72, -3.78, 3.2],
  ]) {
    const puff = glowSprite(smokeGlow, 0xe5e2d7, [0.82, 0.7], 0.18);
    puff.position.set(x, 1.35, z);
    scene.add(puff);
    steam.push({ sprite: puff, baseY: 1.35, delay, x, z });
  }

  return function update(now, shift) {
    const time = now / 1000;
    const cooking = shift?.guests?.filter((guest) => guest.phase === 'cook').length || 0;
    for (const [index, flame] of flames.entries()) {
      const flicker = 0.88 + Math.sin(time * 9 + flame.phase) * 0.1 + Math.sin(time * 17) * 0.035;
      const hearthPulse = flame.hearth ? 1 + cooking * 0.16 : 1;
      flame.sprite.scale.y = (flame.hearth ? 1.1 : 0.27) * flicker * hearthPulse;
      flame.sprite.material.opacity = (flame.hearth ? 0.68 : 0.8) * flicker * hearthPulse;
      if (flame.hearth) flame.sprite.position.y = 0.78 + Math.sin(time * 5.4 + index) * 0.045;
    }
    for (const [index, entry] of lights.entries()) {
      const flicker = 1 + Math.sin(time * (3.2 + (index % 4) * 0.7) + index) * 0.035;
      entry.light.intensity = entry.base * flicker * (1 + cooking * 0.055);
    }
    for (const puff of steam) {
      const phase = (time * 0.17 + puff.delay) % 1;
      puff.sprite.position.y = puff.baseY + phase * 0.95;
      puff.sprite.position.x = puff.x + Math.sin(time * 0.6 + puff.delay) * 0.08;
      puff.sprite.material.opacity =
        0.2 * (1 - phase) * Math.min(1, phase * 5) * (1 + cooking * 0.18);
      puff.sprite.scale.set(0.55 + phase * 0.7, 0.5 + phase * 0.55, 1);
    }
    dust.rotation.y = time * 0.007;
    dust.position.y = Math.sin(time * 0.22) * 0.025;
  };
}

/** Render the real room as a roofless tabletop. The shift provides all movement and state. */
export function createServiceWorld(element) {
  const canvas = element.querySelector('canvas');
  const indicator = element.querySelector('[data-service-loading]');
  const resources = createResourceScope();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#20171d');
  const camera = new THREE.OrthographicCamera(-10, 10, 6, -6, 0.1, 100);
  camera.position.set(7.2, 22, 16);
  camera.lookAt(1.3, 0, -0.35);
  camera.updateMatrixWorld();
  const vector = new THREE.Vector3();
  const quality = deviceRenderQuality();
  const frames = createFrameBudget(Math.min(35, quality.fps));
  const parties = new Map();
  const buildGuest = costumeFactory(resources);
  const loading = createSceneLoading(indicator, '点亮酒馆大厅', { persistent: true });
  let animateDecor = null;
  let renderer;
  let disposed = false;
  let width = 0;
  let height = 0;

  function resize() {
    const w = element.clientWidth;
    const h = element.clientHeight;
    if (!w || !h || (w === width && h === height)) return false;
    width = w;
    height = h;
    if (h / w < 0.53) camera.position.set(5.4, 17, 22);
    else camera.position.set(7.2, 22, 16);
    camera.lookAt(1.3, 0, -0.35);
    camera.updateMatrixWorld();
    const [x, z, span, depth] = TAVERN_HALL.floor;
    const corners = [
      [x, 0, z],
      [x + span, 0, z],
      [x, 0, z + depth],
      [x + span, 0, z + depth],
      [8.75, 4, 4.8],
      [-5.4, 2.4, -4.9],
    ];
    const axes = corners.map((point) =>
      new THREE.Vector3(...point).applyMatrix4(camera.matrixWorldInverse),
    );
    const half = Math.max(
      Math.max(...axes.map(({ y }) => Math.abs(y))) + 0.35,
      ((Math.max(...axes.map(({ x }) => Math.abs(x))) + 0.38) * h) / w,
    );
    camera.top = half;
    camera.bottom = -half;
    camera.left = (-half * w) / h;
    camera.right = (half * w) / h;
    camera.updateProjectionMatrix();
    renderer?.setSize(w, h, false);
    return true;
  }

  function project([x, z], elevation = 0.08) {
    vector.set(x, elevation, z).project(camera);
    return [(vector.x * 0.5 + 0.5) * width, (0.5 - vector.y * 0.5) * height];
  }

  function moveParties(shift) {
    const ids = new Set();
    for (const guest of shift.guests) {
      if (guest.phase === 'clean' && !guest.walk) continue;
      ids.add(guest.id);
      if (!parties.has(guest.id)) {
        const profile = serviceGuest(shift, guest);
        const people = Array.from({ length: profile.size }, (_, index) =>
          buildGuest((profile.appearance ?? guest.id) + index * 5),
        );
        for (const actor of people) scene.add(actor.root);
        parties.set(guest.id, people);
      }
      const point = servicePosition(guest, shift.elapsed);
      const next = servicePosition(guest, shift.elapsed + 0.05);
      const moving = next[0] !== point[0] || next[1] !== point[1];
      const seated = Boolean(guest.seat && !guest.walk && guest.phase !== 'pay');
      const seat = seated ? serviceSeat(guest.seat) : null;
      for (const [i, actor] of parties.get(guest.id).entries()) {
        const [x, z] = companionPoint(guest, point, i);
        actor.root.position.set(x, 0.05, z);
        if (moving) actor.root.rotation.y = Math.atan2(next[0] - point[0], next[1] - point[1]);
        if (seat) actor.root.rotation.y = Math.atan2(seat.at[0] - x, seat.at[1] - z);
        const gait = moving ? Math.sin(shift.elapsed * 14 + i) * 0.33 : 0;
        actor.person.position.y = moving ? Math.abs(gait) * 0.18 : seated ? 0.14 : 0;
        actor.person.scale.y = seated ? 0.83 : 1;
        actor.legs.forEach((leg, index) => {
          leg.rotation.x = seated ? -0.95 : gait * (index ? -1 : 1);
        });
        actor.arms.forEach((arm, index) => {
          arm.rotation.x = gait * (index ? 1 : -1);
        });
      }
    }
    for (const [id, people] of parties) {
      if (ids.has(id)) continue;
      people.forEach(({ root }) => root.removeFromParent());
      parties.delete(id);
    }
  }

  const ready = (async () => {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, alpha: false });
      renderer.setPixelRatio(Math.min(1.5, quality.pixelRatio));
      renderer.localClippingEnabled = true;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.22;
      renderer.shadowMap.enabled = quality.shadows;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      scene.add(new THREE.HemisphereLight('#ffe6be', '#74688f', 2.1));
      const key = new THREE.DirectionalLight('#ffd59f', 2.15);
      key.position.set(-3, 13, 5);
      key.castShadow = quality.shadows;
      key.shadow.mapSize.set(1024, 1024);
      Object.assign(key.shadow.camera, { left: -11, right: 11, top: 10, bottom: -10, far: 28 });
      key.shadow.camera.updateProjectionMatrix();
      key.shadow.normalBias = 0.035;
      scene.add(key);
      const rim = new THREE.DirectionalLight('#a6b8ee', 0.75);
      rim.position.set(6, 6, -7);
      scene.add(rim);
      await loading.prepare(TAVERN_MODEL_FILES);
      const [hall, supplies] = await Promise.all(
        TAVERN_MODEL_FILES.map(async (file) => resources.object((await loading.gltf(file)).scene)),
      );
      if (disposed) return;
      attachTavernSupplies(hall, supplies);
      dressHall(hall, resources);
      scene.add(hall);
      animateDecor = decorateServiceHall(scene, resources, quality);
      resize();
      await loading.finish(renderer, scene, camera);
      if (disposed) return;
      renderer.shadowMap.autoUpdate = false;
      element.dataset.serviceScene = 'ready';
    } catch {
      if (disposed) return;
      element.dataset.serviceScene = 'fallback';
      canvas.hidden = true;
      indicator.hidden = true;
    }
  })();

  return {
    ready,
    resize,
    project,
    dimensions: () => [width, height],
    draw(shift, now) {
      if (element.dataset.serviceScene !== 'ready' || !frames.accepts(now)) return;
      moveParties(shift);
      animateDecor?.(now, shift);
      renderer.render(scene, camera);
    },
    dispose() {
      disposed = true;
      loading.dispose();
      resources.object(scene);
      resources.dispose();
      renderer?.dispose();
      renderer?.forceContextLoss();
    },
  };
}
