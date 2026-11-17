import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { shouldStandOnCard, overlordAssetUrls } from './overlord-registry.js';

export { shouldStandOnCard, overlordAssetUrls };

function countSceneTriangles(object) {
  const total = { count: 0 };
  object.traverse((node) => {
    if (!node.isMesh || !node.geometry) return;
    if (node.geometry.index) {
      total.count += Math.floor(node.geometry.index.count / 3);
    } else if (node.geometry.attributes?.position) {
      total.count += Math.floor(node.geometry.attributes.position.count / 3);
    }
  });
  return total.count;
}

function trackMountMaterials(object, resources) {
  object.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    const cloneMat = (mat) => {
      const m = mat.clone();
      m.userData.baseColor = m.color ? m.color.clone() : new THREE.Color('#ffffff');
      m.userData.baseEmission = m.emissive ? m.emissive.clone() : new THREE.Color(0);
      return m;
    };
    node.material = Array.isArray(node.material)
      ? node.material.map(cloneMat)
      : cloneMat(node.material);
  });
  resources.object(object);
}

function createSealRing(colorHex) {
  const ringGroup = new THREE.Group();
  ringGroup.name = 'Overlord_Card_Seal';
  const color = new THREE.Color(colorHex || '#e7cf7a');
  const outer = new THREE.Mesh(
    new THREE.RingGeometry(0.48, 0.56, 48),
    new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
      toneMapped: false,
    }),
  );
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = 0.004;
  const inner = new THREE.Mesh(
    new THREE.RingGeometry(0.32, 0.35, 36),
    new THREE.MeshBasicMaterial({
      color: color.clone().lerp(new THREE.Color('#ffffff'), 0.45),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.58,
      toneMapped: false,
    }),
  );
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.006;
  ringGroup.add(outer, inner);
  return ringGroup;
}

function setCardArtworkTint(root, tintHex) {
  const targetColor = new THREE.Color(tintHex);
  root.traverse((node) => {
    if (!node.isMesh || !node.name.endsWith('_Artwork')) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    for (const mat of mats) {
      if (mat?.userData?.baseColor) {
        mat.userData.baseColor.copy(targetColor);
      }
    }
  });
}

/** Preload and mount 3D sculpted Overlords onto their enemy battle cards. */
export async function createOverlordModels({
  definitions,
  activeDefinitions,
  loading,
  resources,
  reduced,
}) {
  const templates = new Map();
  const uniqueDefs = [];
  const seenModels = new Set();
  for (const def of Object.values(activeDefinitions || definitions || {})) {
    if (!shouldStandOnCard(def) || seenModels.has(def.model)) continue;
    seenModels.add(def.model);
    uniqueDefs.push(def);
  }

  await Promise.all(
    uniqueDefs.map(async (def) => {
      const url = `./assets/${def.model}`;
      try {
        const gltf = loading ? await loading.gltf(url) : await new GLTFLoader().loadAsync(url);
        templates.set(def.model, {
          scene: gltf.scene,
          triangles: gltf.userData?.triangles || countSceneTriangles(gltf.scene),
          nonVoxel: Boolean(gltf.userData?.nonVoxel),
        });
      } catch {
        // Fallback gracefully if a non-active asset is absent in an isolated partial test fixture.
      }
    }),
  );

  const mounted = new Map();

  function unmount(record) {
    const prev = mounted.get(record);
    if (!prev) return;
    record.root.remove(prev.mount);
    setCardArtworkTint(record.root, '#ffffff');
    mounted.delete(record);
    record.overlordMount = null;
  }

  function sync(enemyRecords) {
    for (const record of enemyRecords) {
      const def = record.id ? definitions[record.id] : null;
      const tpl = def && shouldStandOnCard(def) ? templates.get(def.model) : null;
      if (!tpl) {
        unmount(record);
        continue;
      }
      const current = mounted.get(record);
      if (current?.id === record.id) continue;
      unmount(record);

      const mount = new THREE.Group();
      mount.name = `Overlord_Mount_${record.id}`;
      // Battle card top surface sits at local y = 0.32 inside Placeholder_Enemy_XX.
      mount.position.set(0, 0.326, 0);

      const figure = tpl.scene.clone(true);
      figure.name = `Overlord_Figure_${record.id}`;
      const bounds = new THREE.Box3().setFromObject(figure);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());

      const targetHeight = def.overlord ? 1.94 : 1.24;
      const maxFootprintX = def.overlord ? 2.12 : 1.22;
      const maxFootprintZ = def.overlord ? 1.85 : 1.22;
      const scale = Math.min(
        targetHeight / Math.max(0.01, size.y),
        maxFootprintX / Math.max(0.01, size.x),
        maxFootprintZ / Math.max(0.01, size.z),
      );
      const baseY = -bounds.min.y * scale + 0.008;
      figure.scale.setScalar(scale);
      figure.position.set(-center.x * scale, baseY, -center.z * scale);

      const seal = createSealRing(def.color);
      mount.add(seal, figure);
      trackMountMaterials(mount, resources);

      record.root.add(mount);
      setCardArtworkTint(record.root, '#36444b');

      const entry = {
        id: record.id,
        model: def.model,
        overlord: Boolean(def.overlord),
        standOnCard: true,
        triangles: tpl.triangles,
        nonVoxel: tpl.nonVoxel,
        height: Number((size.y * scale).toFixed(3)),
        baseScale: scale,
        baseY,
        mount,
        figure,
        seal,
        floating: record.id.includes('Cannon') || record.id === 'radiantWyvern',
      };
      mounted.set(record, entry);
      record.overlordMount = entry;
    }
  }

  function update(now) {
    if (reduced || !mounted.size) return false;
    const t = now * 0.001;
    let index = 0;
    for (const [record, entry] of mounted.entries()) {
      if (!record.root.visible) continue;
      const phase = index * 1.15;
      const hover = entry.floating ? 0.055 + Math.sin(t * 2.1 + phase) * 0.032 : 0;
      const breathe = 1 + Math.sin(t * 1.8 + phase) * 0.014;
      entry.figure.scale.set(entry.baseScale, entry.baseScale * breathe, entry.baseScale);
      entry.figure.position.y = entry.baseY + hover;
      entry.figure.rotation.y = Math.sin(t * 0.9 + phase) * 0.06;
      entry.seal.rotation.y = t * 0.45 * (index % 2 ? -1 : 1);
      index++;
    }
    return false;
  }

  function status() {
    const tmp = new THREE.Vector3();
    return {
      loadedModels: [...templates.keys()],
      mounted: [...mounted.entries()].map(([record, entry]) => {
        record.root.updateMatrixWorld(true);
        entry.figure.getWorldPosition(tmp);
        return {
          id: entry.id,
          model: entry.model,
          overlord: entry.overlord,
          standOnCard: entry.standOnCard,
          nonVoxel: entry.nonVoxel,
          triangles: entry.triangles,
          height: entry.height,
          visible: record.root.visible,
          cardY: Number(record.root.position.y.toFixed(3)),
          mountLocalY: Number(entry.mount.position.y.toFixed(3)),
          worldY: Number(tmp.y.toFixed(3)),
        };
      }),
    };
  }

  return { sync, update, status };
}
