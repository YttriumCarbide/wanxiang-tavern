import * as THREE from 'three';
import { createResourceScope } from './shared/resources.js';
import { debrisRandom, debrisShape } from './voxel-debris.js';

/** Emit only exposed voxel faces; each main piece has its own chiseled geometry. */
function debrisGeometry(shape, random, boss) {
  const occupied = new Set(shape.cells.map((cell) => cell.join(',')));
  const positions = [],
    normals = [],
    colors = [];
  const palette = (
    boss
      ? ['#554751', '#927c72', '#d3ba90', '#7a7881']
      : ['#344c4e', '#68837b', '#a6b9a0', '#566a75']
  ).map((color) => new THREE.Color(color));
  const faces = [
    [
      [1, 0, 0],
      [
        [1, 0, 1],
        [1, 0, 0],
        [1, 1, 0],
        [1, 1, 1],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [0, 0, 0],
        [0, 0, 1],
        [0, 1, 1],
        [0, 1, 0],
      ],
    ],
    [
      [0, 1, 0],
      [
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
        [0, 1, 0],
      ],
    ],
    [
      [0, -1, 0],
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 1],
        [0, 0, 1],
      ],
    ],
    [
      [0, 0, 1],
      [
        [0, 0, 1],
        [1, 0, 1],
        [1, 1, 1],
        [0, 1, 1],
      ],
    ],
    [
      [0, 0, -1],
      [
        [1, 0, 0],
        [0, 0, 0],
        [0, 1, 0],
        [1, 1, 0],
      ],
    ],
  ];
  for (const [x, y, z] of shape.cells) {
    const color = palette[Math.floor(random() * palette.length)];
    for (const [normal, corners] of faces) {
      if (occupied.has([x + normal[0], y + normal[1], z + normal[2]].join(','))) continue;
      for (const index of [0, 1, 2, 0, 2, 3]) {
        const corner = corners[index];
        positions.push(
          (x + corner[0] - shape.width / 2) * shape.unit,
          (y + corner[1]) * shape.unit,
          (z + corner[2] - shape.depth / 2) * shape.unit,
        );
        normals.push(...normal);
        colors.push(color.r, color.g, color.b);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

/** One effect family, with different topology and motion on every piece and every death. */
function createBloom(resources, boss, reduced) {
  const group = new THREE.Group();
  group.name = 'Death_VoxelDebris';
  const random = debrisRandom(Math.floor(Math.random() * 4294967296));
  const geometry = resources.track(new THREE.BoxGeometry(1, 1, 1));
  const shell = resources.track(
    new THREE.MeshStandardMaterial({
      color: '#ffffff',
      vertexColors: true,
      roughness: 0.8,
      metalness: 0.16,
      transparent: true,
    }),
  );
  const light = resources.track(
    new THREE.MeshBasicMaterial({
      color: boss ? '#ffe1a1' : '#a8ead8',
      transparent: true,
      toneMapped: false,
      depthWrite: false,
    }),
  );
  const haze = resources.track(
    new THREE.MeshBasicMaterial({
      color: boss ? '#c69ac9' : '#72c4b8',
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  const chunks = Array.from({ length: reduced ? 4 : boss ? 8 : 6 }, (_, index) => {
    const shape = debrisShape(index, random);
    const node = new THREE.Group();
    const mesh = new THREE.Mesh(resources.track(debrisGeometry(shape, random, boss)), shell);
    mesh.castShadow = true;
    node.add(mesh);
    // Sparse glowing cuts on a different exposed surface, not a copied crystal cap.
    const cell = shape.cells[Math.floor(random() * shape.cells.length)];
    const seam = new THREE.Mesh(geometry, light);
    seam.position.set(
      (cell[0] + 0.5 - shape.width / 2) * shape.unit,
      (cell[1] + 1.03) * shape.unit,
      (cell[2] + 0.5 - shape.depth / 2) * shape.unit,
    );
    seam.scale.set(shape.unit * (1 + random()), 0.009, shape.unit * 0.35);
    node.add(seam);
    group.add(node);
    const angle = index * 2.39996 + random() * 0.7;
    return {
      node,
      shape,
      index,
      x: (random() - 0.5) * 0.22,
      z: (random() - 0.5) * 0.3,
      dx: Math.cos(angle) * (0.42 + random() * 0.46),
      dz: Math.sin(angle) * (0.35 + random() * 0.45),
      size: 0.9 + random() * 0.2,
      lift: 0.18 + random() * 0.36,
      turn: (random() - 0.5) * 2.2,
      tilt: (random() - 0.5) * 0.9,
    };
  });
  const motes = chunks.map((chunk, index) => {
    const node = new THREE.Group();
    const spark = new THREE.Mesh(geometry, light);
    spark.scale.set(0.025, 0.045, 0.025);
    node.add(spark);
    const trail = new THREE.Mesh(geometry, haze);
    trail.scale.set(0.016, 0.15, 0.016);
    trail.position.y = -0.075;
    node.add(trail);
    group.add(node);
    return { node, chunk, index };
  });
  return { group, chunks, motes, materials: { shell, light, haze } };
}

/** Only confirmed alive → dead events start the finite shared voxel death effect. */
export function createCardDeaths({ scene, camera, stage, getSpeed, reduced }) {
  const active = new Map();
  const played = new Set();
  const home = camera.position.clone();
  let completed = 0;
  let disposed = false;
  let cinema = null;
  const smooth = (value) => {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  function restoreCamera() {
    camera.position.copy(home);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    stage.closest('#battle')?.classList.remove('boss-finisher');
    cinema = null;
  }
  function finish(effect) {
    scene.remove(effect.group);
    effect.overlay?.remove();
    effect.record.root.visible = false;
    effect.resources.dispose();
    active.delete(effect.record.id);
    if (cinema === effect) restoreCamera();
    completed++;
  }
  function play(record, definition, delay = 0) {
    if (disposed || !record || played.has(record.id)) return 0;
    played.add(record.id);
    if (definition.nonlethal) return 0;
    const boss = !!definition.boss;
    const resources = createResourceScope();
    const bloom = createBloom(resources, boss, reduced);
    bloom.group.position.copy(record.goal);
    bloom.group.scale.setScalar((record.restScale || 1) * (boss ? 1.25 : 1));
    scene.add(bloom.group);
    const duration = reduced ? 650 : boss ? 2700 : 1700;
    const effect = {
      ...bloom,
      record,
      resources,
      start: performance.now() + delay / getSpeed(),
      duration: duration / getSpeed(),
      boss,
      broken: false,
      overlay: null,
    };
    bloom.group.visible = false;
    if (boss && !reduced) {
      const overlay = document.createElement('div');
      overlay.className = 'boss-death-cinema';
      const label = document.createElement('strong');
      label.textContent = definition.name;
      const caption = document.createElement('small');
      caption.textContent = '界隙消散';
      overlay.append(label, caption);
      overlay.style.opacity = '0';
      stage.append(overlay);
      effect.overlay = overlay;
      cinema = effect;
    }
    active.set(record.id, effect);
    return delay + duration;
  }
  function updateBloom(effect, progress) {
    const expand = reduced ? 1 : 1 - (1 - Math.min(1, progress / 0.65)) ** 3;
    const fade = 1 - smooth((progress - 0.54) / 0.46);
    const emerge = reduced ? 1 : smooth(progress / 0.12);
    const { shell, light, haze } = effect.materials;
    shell.opacity = fade;
    light.opacity = fade * (0.75 + 0.25 * (1 - progress));
    haze.opacity = fade * Math.sin(Math.PI * Math.min(1, progress * 2.4)) * 0.16;
    for (const chunk of effect.chunks) {
      const { node, x, z, dx, dz, size, index, lift, turn, tilt } = chunk;
      const scatter = reduced ? 0.4 : smooth((progress - index * 0.018) / 0.55);
      node.position.set(
        x + dx * scatter,
        0.24 + (reduced ? 0 : Math.sin(Math.PI * expand) * lift),
        z + dz * scatter,
      );
      node.rotation.set(
        reduced ? 0 : Math.sin(Math.PI * expand) * tilt,
        turn + scatter * turn,
        reduced ? 0 : Math.sin(Math.PI * expand) * tilt * 0.5,
      );
      node.scale.setScalar(size * emerge * (1 - smooth((progress - 0.73) / 0.27) * 0.65));
    }
    for (const { node, chunk, index } of effect.motes) {
      node.visible = !reduced;
      node.position.set(
        chunk.x + chunk.dx * (0.3 + expand * 0.9),
        0.48 + progress * (0.5 + index * 0.055),
        chunk.z + chunk.dz * (0.3 + expand * 0.9),
      );
      node.scale.setScalar(emerge * (1 - progress));
    }
  }
  function update(now) {
    for (const effect of active.values()) {
      const t = (now - effect.start) / effect.duration;
      if (t < 0) continue;
      if (t >= 1) {
        finish(effect);
        continue;
      }
      const releaseAt = effect.boss && !reduced ? 0.28 : 0.1;
      const progress = THREE.MathUtils.clamp((t - releaseAt) / (1 - releaseAt), 0, 1);
      if (cinema === effect) {
        const focus = smooth(t / 0.2) * (1 - smooth((t - 0.7) / 0.3));
        camera.position.copy(home).addScaledVector(effect.record.goal, focus);
        camera.zoom = 1 + focus * 0.9;
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        effect.overlay.style.opacity = String(Math.min(1, t * 8) * (1 - smooth((t - 0.8) / 0.2)));
        stage.closest('#battle')?.classList.add('boss-finisher');
      }
      if (t < releaseAt) {
        effect.record.root.traverse((node) => {
          for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
            if (material?.emissive && material.userData.baseEmission)
              material.emissive
                .copy(material.userData.baseEmission)
                .addScalar((t / releaseAt) * (effect.boss ? 0.7 : 0.18));
          }
        });
        continue;
      }
      effect.broken = true;
      effect.group.visible = true;
      effect.record.root.visible = false;
      updateBloom(effect, progress);
    }
    return active.size > 0;
  }
  return {
    play,
    update,
    cinematicActive: () => !!cinema,
    releaseCinematic() {
      if (!cinema) return;
      cinema.overlay?.remove();
      cinema.overlay = null;
      restoreCamera();
    },
    has: (id) => played.has(id),
    holding: (id) => active.has(id) && !active.get(id).broken,
    stats: () => {
      const effects = [...active.values()];
      let texturedMeshes = 0;
      for (const effect of effects)
        effect.group.traverse((node) => {
          if (node.material?.map) texturedMeshes++;
        });
      return {
        active: active.size,
        completed,
        model: 'voxel-debris',
        distinctChunkShapes: new Set(
          effects.flatMap((effect) => effect.chunks.map((chunk) => chunk.shape.signature)),
        ).size,
        chunks: effects.reduce((sum, effect) => sum + effect.chunks.length, 0),
        texturedMeshes,
        boss: !!cinema,
        zoom: camera.zoom,
        lowestChunkBase: active.size
          ? Math.min(
              ...effects.flatMap((effect) =>
                effect.chunks.map(
                  (chunk) => effect.group.position.y + chunk.node.position.y * effect.group.scale.y,
                ),
              ),
            )
          : null,
      };
    },
    dispose() {
      disposed = true;
      for (const effect of [...active.values()]) finish(effect);
      restoreCamera();
    },
  };
}
