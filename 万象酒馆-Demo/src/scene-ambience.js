import * as THREE from 'three';
import { BIOMES } from './content/biomes.js';

/** Decorative motion owns no battle state, damage, timers or extra animation loop. */
export function createSceneAmbience(scene, model, map, resources, reduced) {
  const theme = BIOMES[map] || BIOMES.ruins;
  const group = new THREE.Group();
  group.name = 'Living_Environment';
  scene.add(group);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const insectBody = new THREE.MeshStandardMaterial({
    color: map === 'frost' ? '#557e8a' : '#6c795c',
    roughness: 0.8,
  });
  const insectLeg = new THREE.MeshStandardMaterial({ color: '#283d40' });
  const eye = new THREE.MeshBasicMaterial({ color: theme.accent });
  const insects = [];
  function piece(parent, material, position, size) {
    const mesh = new THREE.Mesh(cube, material);
    mesh.position.set(...position);
    mesh.scale.set(...size);
    parent.add(mesh);
    return mesh;
  }
  const bugCount = ['ruins', 'forest', 'frost', 'forge', 'tide'].includes(map) ? 8 : 0;
  for (let i = 0; i < bugCount; i++) {
    const bug = new THREE.Group();
    bug.name = `Border_Beetle_${i}`;
    piece(bug, insectBody, [0, 0.065, 0], [0.15, 0.09, 0.21]);
    piece(bug, insectBody, [0, 0.045, 0.14], [0.1, 0.07, 0.09]);
    for (const x of [-0.035, 0.035]) piece(bug, eye, [x, 0.075, 0.183], [0.025, 0.018, 0.02]);
    const legs = [];
    for (const side of [-1, 1])
      for (const z of [-0.07, 0, 0.07])
        legs.push(piece(bug, insectLeg, [side * 0.11, 0.025, z], [0.11, 0.035, 0.03]));
    group.add(bug);
    insects.push({ bug, legs, side: i % 2 ? 1 : -1, phase: i * 1.37 });
  }
  const dust = new THREE.InstancedMesh(
    cube,
    new THREE.MeshBasicMaterial({
      color: theme.mote,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    }),
    84,
  );
  dust.name = 'Atmospheric_Voxel_Motes';
  dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dust.frustumCulled = false;
  group.add(dust);
  const dummy = new THREE.Object3D();
  const mechanisms = [];
  if (map === 'xianxia') {
    const geometry = new THREE.IcosahedronGeometry(1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: '#bad5d4',
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      roughness: 1,
    });
    for (let i = 0; i < 16; i++) {
      const cloud = new THREE.Mesh(geometry, material);
      cloud.name = 'Peripheral_Cloud_' + i;
      cloud.position.set(
        (i % 2 ? 1 : -1) * (8.8 + (i % 3) * 0.7),
        -1.15 - (i % 4) * 0.12,
        -7 + Math.floor(i / 2) * 1.9,
      );
      cloud.scale.set(2.3, 0.32, 1.4);
      group.add(cloud);
    }
  }
  model.traverse((node) => {
    if (node.name.startsWith('Motion_'))
      mechanisms.push({ node, home: node.position.clone(), phase: mechanisms.length * 0.79 });
  });
  const water = [];
  if (map === 'tide') {
    const geometry = new THREE.RingGeometry(0.85, 1, 40);
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: '#a2e2d5',
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(i % 2 ? 8.3 : -8.3, 0.045, -6 + Math.floor(i / 2) * 2.4);
      group.add(mesh);
      water.push(mesh);
    }
  }
  const sigils = [];
  const ring = new THREE.RingGeometry(0.75, 0.78, 36);
  for (let slot = 0; slot < 3; slot++) {
    const mesh = new THREE.Mesh(
      ring,
      new THREE.MeshBasicMaterial({
        color: '#b7ead9',
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    mesh.position.set([-3.014, 0, 3.014][slot], 0.285, 2.345);
    mesh.rotation.x = -Math.PI / 2;
    group.add(mesh);
    sigils.push(mesh);
  }
  let selectedSlot = -1;
  let disposed = false;
  function update(now) {
    if (disposed || document.hidden) return false;
    const time = reduced ? 0 : now * 0.001;
    for (let i = 0; i < dust.count; i++) {
      const side = i % 2 ? 1 : -1;
      const phase = i * 2.39996;
      const x = side * (6.65 + (i % 9) * 0.31) + Math.sin(time * 0.25 + phase) * 0.24;
      const fall = theme.mood === 'snow';
      const y = 0.22 + ((((i * 0.173 + time * (fall ? -0.24 : 0.13)) % 2.3) + 2.3) % 2.3);
      dummy.position.set(x, y, -7 + ((i * 0.73) % 14) + Math.sin(time * 0.2 + phase) * 0.2);
      const size = (theme.mood === 'ember' ? 0.025 : 0.018) + (i % 4) * 0.009;
      dummy.scale.set(size, theme.mood === 'snow' ? size * 0.5 : size, size);
      dummy.rotation.set(time * 0.15 + phase, 0, phase);
      dummy.updateMatrix();
      dust.setMatrixAt(i, dummy.matrix);
    }
    dust.instanceMatrix.needsUpdate = true;
    for (const { bug, legs, side, phase } of insects) {
      const t = time * 0.11 + phase;
      bug.position.set(side * (6.9 + Math.sin(t * 0.6) * 0.34), 0.12, Math.sin(t) * 6.7);
      bug.rotation.y =
        Math.cos(t) > 0 ? Math.sin(t * 0.6) * 0.12 : Math.PI + Math.sin(t * 0.6) * 0.12;
      legs.forEach((leg, index) => {
        leg.rotation.y = Math.sin(time * 16 + phase + index * 2) * 0.5;
      });
    }
    for (const { node, home, phase } of mechanisms) {
      if (node.name.startsWith('Motion_Minecart'))
        node.position.z = home.z + Math.sin(time * 0.2 + phase) * 1.7;
      else if (node.name.startsWith('Motion_Piston'))
        node.position.y = home.y + Math.pow((Math.sin(time * 1.8 + phase) + 1) * 0.5, 2) * 0.33;
      else node.rotation.y = time * (node.name.startsWith('Motion_Gear') ? 0.23 : 0.12) + phase;
    }
    water.forEach((mesh, index) => {
      const phase = (time * 0.23 + index * 0.19) % 1;
      mesh.scale.setScalar(0.1 + phase * 0.85);
      mesh.material.opacity = (1 - phase) * 0.14;
    });
    sigils.forEach((mesh, slot) => {
      mesh.material.opacity = slot === selectedSlot ? 0.27 + Math.sin(time * 2.4) * 0.08 : 0;
    });
    return !reduced;
  }
  resources.object(group);
  return {
    update,
    select(slot) {
      selectedSlot = slot;
    },
    stats: () => ({
      landmarks: model.children
        .filter((node) => !node.name.startsWith('Placeholder_'))
        .map((node) => node.name),
      map,
      insects: insects.length,
      motes: dust.count,
      mechanisms: mechanisms.map((item) => item.node.name),
      mechanismPoses: mechanisms.map(({ node }) => ({
        name: node.name,
        position: node.position.toArray(),
        rotation: node.rotation.y,
      })),
      ripples: water.length,
      reduced,
    }),
    dispose() {
      disposed = true;
      group.removeFromParent();
    },
  };
}
