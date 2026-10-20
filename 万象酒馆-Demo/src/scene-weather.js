import * as THREE from 'three';
import { WEATHERS, chooseWeather } from './weather.js';
import { createWeatherSurfaces } from './weather-surfaces.js';

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Bounded, one-way environmental simulation. No battle state, gameplay effects or extra loop. */
export function createWeatherSystem(scene, model, resources, reduced = false, options = {}) {
  const random = options.random || Math.random;
  const definition =
    WEATHERS.find((weather) => weather.id === options.type) || chooseWeather(random);
  const rng = seeded(Math.floor(random() * 4294967295));
  const range = (a, b) => a + rng() * (b - a);
  const group = new THREE.Group();
  group.name = 'Weather_System';
  group.userData.weather = definition.id;
  scene.add(group);
  const surfaces = options.surfaces || createWeatherSurfaces(model);
  const dummy = new THREE.Object3D();
  const dropGeometry = resources.track(new THREE.IcosahedronGeometry(1, 0));
  const ringGeometry = resources.track(new THREE.TorusGeometry(1, 0.055, 3, 20));
  const patchGeometry = resources.track(new THREE.CylinderGeometry(1, 1, 1, 12));
  const isRain = ['rain', 'thunder'].includes(definition.id);
  const isSnow = definition.id === 'snow';
  const material = (Class, values) => resources.track(new Class(values));
  const mesh = (name, geometry, mat, count) => {
    const object = resources.track(new THREE.InstancedMesh(geometry, mat, count));
    object.name = name;
    object.frustumCulled = false;
    object.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(object);
    return object;
  };
  const place = (object, index, x, y, z, sx, sy, sz, rx = 0, rz = 0) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(rx, 0, rz);
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    object.setMatrixAt(index, dummy.matrix);
  };
  const weatherMaterial = material(THREE.MeshStandardMaterial, {
    color: isSnow ? '#f0f8ff' : '#b3dcf1',
    roughness: isSnow ? 0.75 : 0.08,
    metalness: isSnow ? 0 : 0.18,
    transparent: true,
    opacity: isSnow ? 0.85 : 0.62,
    depthWrite: false,
  });
  const precipitation =
    isRain || isSnow
      ? mesh(
          isRain ? 'Weather_Rain' : 'Weather_Snow',
          dropGeometry,
          weatherMaterial,
          definition.particles,
        )
      : null;
  const drops = Array.from({ length: precipitation ? definition.particles : 0 }, () => {
    const x = range(-12, 12),
      z = range(-10, 10);
    return {
      x,
      z,
      y: range(0.4, 17),
      floor: surfaces.sample(x, z).y,
      speed: isSnow ? range(0.65, 1.5) : range(13, 19),
      size: range(0.025, 0.055),
      phase: range(0, 6.28),
    };
  });
  const impactSlots = Array.from({ length: isRain ? 140 : 0 }, () => ({
    age: 2,
    x: 0,
    y: 0,
    z: 0,
    hot: false,
  }));
  const splashes = isRain
    ? mesh(
        'Weather_Impact_Ripples',
        ringGeometry,
        material(THREE.MeshBasicMaterial, {
          color: '#b8e5ef',
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        }),
        impactSlots.length,
      )
    : null;
  const spray = isRain
    ? mesh('Weather_Impact_Droplets', dropGeometry, weatherMaterial, impactSlots.length * 3)
    : null;
  const steam = isRain
    ? mesh(
        'Weather_Hot_Surface_Steam',
        dropGeometry,
        material(THREE.MeshBasicMaterial, {
          color: '#d8e4e4',
          transparent: true,
          opacity: 0.1,
          depthWrite: false,
        }),
        impactSlots.length,
      )
    : null;
  const patchMaterial = material(THREE.MeshStandardMaterial, {
    color: isSnow ? '#e6f0f5' : '#456773',
    roughness: isSnow ? 0.9 : 0.08,
    metalness: isSnow ? 0 : 0.42,
    transparent: !isSnow,
    opacity: isSnow ? 1 : 0.19,
    depthWrite: isSnow,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const patches =
    isRain || isSnow
      ? mesh(isSnow ? 'Weather_Snow_Deposits' : 'Weather_Puddles', patchGeometry, patchMaterial, 96)
      : null;
  let cluster = null;
  const deposits = Array.from({ length: patches ? 96 : 0 }, (_, index) => {
    if (index % 4 === 0) cluster = { x: range(-8.5, 8.5), z: range(-8, 7), size: range(0.4, 0.85) };
    const x = cluster.x + range(-0.25, 0.25),
      z = cluster.z + range(-0.25, 0.25),
      size = cluster.size * range(0.6, 1),
      stretch = range(0.55, 1.3),
      surface = surfaces.sample(x, z);
    const supported =
      surface.collects &&
      !(isSnow && Math.abs(x) < 6.7 && Math.abs(z) < 5.7) &&
      [
        [-size, 0],
        [size, 0],
        [0, -size * stretch],
        [0, size * stretch],
      ].every(([dx, dz]) => {
        const edge = surfaces.sample(x + dx, z + dz);
        return edge.supported && edge.collects && Math.abs(edge.y - surface.y) < 0.12;
      });
    return {
      x,
      z,
      y: surface.y,
      kind: surface.kind,
      size,
      stretch,
      supported,
    };
  });
  const wetMaterials = [];
  if (isRain)
    model.traverse((node) => {
      if (!node.isMesh) return;
      let ancestor = node;
      while (ancestor) {
        if (/Placeholder_|Cloud/i.test(ancestor.name)) return;
        ancestor = ancestor.parent;
      }
      for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!mat?.isMeshStandardMaterial || wetMaterials.some((entry) => entry.mat === mat))
          continue;
        wetMaterials.push({ mat, roughness: mat.roughness, color: mat.color.clone() });
      }
    });
  const mists = [];
  if (definition.id === 'mist') {
    const fogMaterial = material(THREE.MeshStandardMaterial, {
      color: '#acccd0',
      transparent: true,
      opacity: 0.055,
      depthWrite: false,
      roughness: 1,
    });
    const geometry = resources.track(new THREE.IcosahedronGeometry(1, 1));
    for (let index = 0; index < 18; index++) {
      const cloud = new THREE.Mesh(geometry, fogMaterial);
      cloud.name = 'Weather_Mist_' + index;
      const side = index % 2 ? 1 : -1;
      cloud.position.set(side * range(7.8, 11.8), range(-0.15, 0.3), range(-9, 7));
      cloud.scale.set(range(1.4, 3), range(0.18, 0.4), range(1, 2));
      cloud.userData.home = cloud.position.clone();
      group.add(cloud);
      mists.push(cloud);
    }
  }
  let lightning = null,
    lightningLight = null;
  if (definition.id === 'thunder') {
    lightning = new THREE.Group();
    lightning.name = 'Weather_Lightning_Bolt';
    const boltMaterial = material(THREE.MeshBasicMaterial, { color: '#e1eeff', toneMapped: false });
    const geometry = resources.track(new THREE.CylinderGeometry(0.035, 0.055, 1, 4));
    let previous = new THREE.Vector3(-3, 13, -11);
    for (let index = 0; index < 11; index++) {
      const next = previous.clone().add(new THREE.Vector3(range(-0.65, 0.65), -0.8, 0));
      const segment = new THREE.Mesh(geometry, boltMaterial);
      segment.position.copy(previous).add(next).multiplyScalar(0.5);
      const direction = next.clone().sub(previous);
      segment.scale.y = direction.length();
      segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
      lightning.add(segment);
      previous = next;
    }
    lightning.visible = false;
    group.add(lightning);
    lightningLight = new THREE.PointLight('#c8dfff', 0, 35, 1.5);
    lightningLight.name = 'Weather_Lightning_Flash';
    lightningLight.position.set(-3, 8, -7);
    group.add(lightningLight);
  }
  let last = null,
    elapsed = 0,
    impacts = 0,
    cursor = 0,
    flashes = 0;
  let flashAt = 2.5,
    flashAge = 2,
    disposed = false,
    wetness = 0;
  function hit(drop) {
    const surface = surfaces.sample(drop.x, drop.z);
    if (surface.supported && surface.collects) impacts++;
    if (isRain && surface.supported && surface.collects) {
      const slot = impactSlots[cursor++ % impactSlots.length];
      Object.assign(slot, {
        x: drop.x,
        y: surface.y + 0.025,
        z: drop.z,
        age: 0,
        hot: surface.kind === 2,
      });
    }
    drop.x = range(-12, 12);
    drop.z = range(-10, 10);
    drop.y = range(14, 18);
    drop.floor = surfaces.sample(drop.x, drop.z).y;
  }
  function draw(delta) {
    elapsed += delta;
    wetness = Math.min(1, (elapsed + 0.5) / 12);
    if (precipitation) {
      for (let index = 0; index < drops.length; index++) {
        const drop = drops[index];
        drop.y -= drop.speed * delta;
        if (drop.y <= drop.floor + 0.035) hit(drop);
        const sway = isSnow ? Math.sin(elapsed * 0.8 + drop.phase) * 0.18 : 0;
        place(
          precipitation,
          index,
          drop.x + sway,
          drop.y,
          drop.z,
          isSnow ? drop.size : 0.016,
          isSnow ? drop.size * 0.65 : 0.11 + drop.size * 2,
          isSnow ? drop.size : 0.016,
          isSnow ? elapsed * 0.4 : 0,
          isSnow ? drop.phase : -0.08,
        );
      }
      precipitation.instanceMatrix.needsUpdate = true;
    }
    if (splashes) {
      for (let index = 0; index < impactSlots.length; index++) {
        const slot = impactSlots[index];
        slot.age += delta;
        const active = slot.age < 0.7;
        const radius = active && !slot.hot ? 0.025 + slot.age * 0.42 : 0;
        place(splashes, index, slot.x, slot.y, slot.z, radius, radius, radius, -Math.PI / 2);
        const puff = active && slot.hot ? 0.08 + slot.age * 0.3 : 0;
        place(steam, index, slot.x, slot.y + slot.age * 0.6, slot.z, puff, puff * 1.6, puff);
        for (let n = 0; n < 3; n++) {
          const age = slot.age,
            angle = n * 2.094 + index;
          const live = active && !slot.hot && age < 0.36;
          place(
            spray,
            index * 3 + n,
            slot.x + Math.cos(angle) * age * 0.6,
            slot.y + Math.max(0, age * 1.5 - 4.5 * age * age),
            slot.z + Math.sin(angle) * age * 0.6,
            live ? 0.021 : 0,
            live ? 0.03 : 0,
            live ? 0.021 : 0,
          );
        }
      }
      for (const object of [splashes, spray, steam]) object.instanceMatrix.needsUpdate = true;
    }
    if (patches) {
      for (let index = 0; index < deposits.length; index++) {
        const patch = deposits[index];
        const amount =
          patch.supported && patch.kind === 0
            ? isSnow
              ? Math.min(1, impacts / 1600)
              : Math.sqrt(wetness)
            : 0;
        place(
          patches,
          index,
          patch.x,
          patch.y + (isSnow ? amount * 0.025 : 0.012),
          patch.z,
          patch.size * amount,
          isSnow ? 0.025 + amount * 0.03 : 0.012,
          patch.size * patch.stretch * amount,
        );
      }
      patches.instanceMatrix.needsUpdate = true;
    }
    wetMaterials.forEach(({ mat, roughness, color }) => {
      mat.roughness = Math.max(0.14, roughness * (1 - wetness * 0.62));
      mat.color.copy(color).multiplyScalar(1 - wetness * 0.13);
    });
    mists.forEach((cloud, index) => {
      cloud.position.x = cloud.userData.home.x + Math.sin(elapsed * 0.12 + index) * 0.45;
      cloud.position.z = cloud.userData.home.z + Math.cos(elapsed * 0.1 + index) * 0.25;
    });
    if (lightning) {
      flashAge += delta;
      if (elapsed >= flashAt) {
        flashAge = 0;
        flashAt = elapsed + range(4, 8);
        flashes++;
      }
      const strength = flashAge < 0.22 ? Math.sin((flashAge / 0.22) * Math.PI) : 0;
      lightning.visible = flashAge < 0.13;
      lightningLight.intensity = strength * 8;
    }
  }
  draw(0);
  resources.object(group);
  return {
    type: definition.id,
    label: definition.label,
    update(now) {
      if (disposed || document.hidden) return false;
      if (last === null) last = now;
      const delta = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      if (reduced) return false;
      draw(delta);
      return Boolean(precipitation || mists.length || lightning);
    },
    stats() {
      return {
        type: definition.id,
        label: definition.label,
        particles: definition.particles,
        renderedParticles: drops.length + mists.length,
        impacts,
        wetness,
        deposits: deposits.length,
        surfaceTriangles: surfaces.triangles,
        surfaceCells: surfaces.cells,
        flashes,
        reduced,
        group: group.name,
        layers: group.children.map((child) => child.name),
        mistAboveCombat: mists.some(
          (cloud) => Math.abs(cloud.position.x) < 6.5 && Math.abs(cloud.position.z) < 5.5,
        ),
        visibleSplashes: impactSlots.filter((slot) => slot.age < 0.7 && !slot.hot).length,
      };
    },
    dispose() {
      disposed = true;
      wetMaterials.forEach(({ mat, roughness, color }) => {
        mat.roughness = roughness;
        mat.color.copy(color);
      });
      group.removeFromParent();
    },
  };
}
