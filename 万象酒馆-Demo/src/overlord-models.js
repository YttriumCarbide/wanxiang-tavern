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

function updateSealRingStage(seal, baseColorHex, stage = 1) {
  if (!seal) return;
  const s = Math.max(1, Math.min(3, Number(stage) || 1));
  const palette =
    s >= 3
      ? ['#ff3d6e', '#ffe47a']
      : s === 2
        ? ['#ff9442', '#6bf5a9']
        : [baseColorHex || '#e7cf7a', '#ffffff'];
  const meshes = seal.children || [];
  if (meshes[0]?.material) meshes[0].material.color.set(palette[0]);
  if (meshes[1]?.material) {
    meshes[1].material.color.set(palette[1]);
    if (s === 1 && baseColorHex) {
      meshes[1].material.color.lerp(new THREE.Color('#ffffff'), 0.45);
    }
  }
  seal.scale.setScalar(s >= 3 ? 1.24 : s === 2 ? 1.12 : 1);
}

const OVERLORD_CLIP_PACE = 1.28;

function resolveClipName(entry, move = {}) {
  if (!entry) return null;
  const explicitClip = typeof move.clip === 'string' && entry.clips[move.clip] ? move.clip : null;
  const candidates = explicitClip
    ? [explicitClip]
    : !move.hasDamage
      ? ['Special_Action', 'Normal_Attack', 'Idle']
      : move.enraged || (move.actionIndex || 0) > 0 || (move.targets?.length || 0) > 1
        ? ['Special_Attack', 'Talon_Rend', 'Normal_Attack', 'Idle']
        : ['Normal_Attack', 'Special_Attack', 'Idle'];
  return candidates.find((name) => Boolean(entry.clips[name])) || null;
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

function prepareFigureVisibility(figure, def) {
  const hasAnatomyIndex = def && def.anatomyIndex !== undefined && def.anatomyIndex !== null;
  figure.traverse((node) => {
    if (node.name && node.name.includes('Battle_Card')) {
      node.visible = false;
      return;
    }
    if (hasAnatomyIndex && node.userData?.anatomyIndex !== undefined) {
      node.visible = Number(node.userData.anatomyIndex) === Number(def.anatomyIndex);
    }
  });
}

function isBranchVisible(node, root) {
  for (let cur = node; cur; cur = cur.parent) {
    if (!cur.visible) return false;
    if (cur === root) break;
  }
  return true;
}

function measureVisibleBounds(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const itemBox = new THREE.Box3();
  object.traverse((node) => {
    if (!node.isMesh || !node.geometry || !isBranchVisible(node, object)) return;
    node.geometry.computeBoundingBox();
    if (!node.geometry.boundingBox) return;
    itemBox.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
    box.union(itemBox);
  });
  if (box.isEmpty()) box.setFromObject(object);
  return box;
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
        const hasProceduralNode = Boolean(
          gltf.scene?.children?.some(
            (child) =>
              child.userData?.nonVoxel ||
              child.userData?.modelType === 'Articulated procedural creature',
          ),
        );
        templates.set(def.model, {
          scene: gltf.scene,
          animations: Array.isArray(gltf.animations) ? gltf.animations : [],
          triangles: gltf.userData?.triangles || countSceneTriangles(gltf.scene),
          nonVoxel: Boolean(gltf.userData?.nonVoxel || hasProceduralNode),
        });
      } catch {
        // Fallback gracefully if a non-active asset is absent in an isolated partial test fixture.
      }
    }),
  );

  const mounted = new Map();
  let lastNow = 0;

  function unmount(record) {
    const prev = mounted.get(record);
    if (!prev) return;
    if (prev.mixer && prev.onFinished) {
      prev.mixer.removeEventListener('finished', prev.onFinished);
    }
    prev.mixer?.stopAllAction();
    record.root.remove(prev.mount);
    setCardArtworkTint(record.root, '#ffffff');
    mounted.delete(record);
    record.overlordMount = null;
  }

  function sync(enemyRecords, state = null) {
    for (const record of enemyRecords) {
      const def = record.id ? definitions[record.id] : null;
      const tpl = def && shouldStandOnCard(def) ? templates.get(def.model) : null;
      if (!tpl) {
        unmount(record);
        continue;
      }
      const unitStage =
        state?.units?.[record.id]?.bossStage || (state?.units?.[record.id]?.enraged ? 2 : 1);
      const current = mounted.get(record);
      if (current?.id === record.id) {
        if (current.stage !== unitStage) {
          current.stage = unitStage;
          updateSealRingStage(current.seal, current.colorHex, unitStage);
        }
        continue;
      }
      unmount(record);

      const mount = new THREE.Group();
      mount.name = `Overlord_Mount_${record.id}`;
      // Battle card top surface sits at local y = 0.32 inside Placeholder_Enemy_XX.
      mount.position.set(0, 0.326, 0);

      const figure = tpl.scene.clone(true);
      figure.name = `Overlord_Figure_${record.id}`;
      prepareFigureVisibility(figure, def);
      const bounds = measureVisibleBounds(figure);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());

      const targetHeight = def.overlord ? 3.9 : 2.25;
      const maxFootprintX = def.overlord ? 4.5 : 2.3;
      const maxFootprintZ = def.overlord ? 3.4 : 2.0;
      const scale = Math.min(
        targetHeight / Math.max(0.01, size.y),
        maxFootprintX / Math.max(0.01, size.x),
        maxFootprintZ / Math.max(0.01, size.z),
      );
      const baseY = -bounds.min.y * scale + 0.008;
      figure.scale.setScalar(scale);
      const baseX = -center.x * scale;
      const baseZ = -center.z * scale;
      figure.position.set(baseX, baseY, baseZ);

      const seal = createSealRing(def.color);
      mount.add(seal, figure);
      trackMountMaterials(mount, resources);

      const mixer = tpl.animations.length ? new THREE.AnimationMixer(figure) : null;
      const clips = {};
      if (mixer) {
        for (const clip of tpl.animations) {
          clips[clip.name] = mixer.clipAction(clip);
        }
      }
      const idleAction = clips.Idle || (tpl.animations[0] ? clips[tpl.animations[0].name] : null);
      if (idleAction) {
        idleAction.setLoop(THREE.LoopRepeat, Infinity);
        idleAction.play();
      }

      record.root.add(mount);
      setCardArtworkTint(record.root, '#36444b');

      const entry = {
        id: record.id,
        model: def.model,
        colorHex: def.color,
        stage: unitStage,
        overlord: Boolean(def.overlord),
        standOnCard: true,
        triangles: tpl.triangles,
        nonVoxel: tpl.nonVoxel,
        height: Number((size.y * scale).toFixed(3)),
        baseScale: scale,
        baseX,
        baseY,
        baseZ,
        mount,
        figure,
        seal,
        mixer,
        clips,
        idleAction,
        activeAction: idleAction,
        playingClip: idleAction ? idleAction.getClip().name : null,
        onFinished: null,
        lunge: null,
        floating: record.id.includes('Cannon') || record.id === 'radiantWyvern',
      };
      updateSealRingStage(seal, def.color, unitStage);
      if (mixer && idleAction) {
        entry.onFinished = (event) => {
          if (event.action === idleAction) return;
          idleAction.reset();
          idleAction.setLoop(THREE.LoopRepeat, Infinity);
          idleAction.play();
          event.action.crossFadeTo(idleAction, 0.16, true);
          entry.activeAction = idleAction;
          entry.playingClip = idleAction.getClip().name;
        };
        mixer.addEventListener('finished', entry.onFinished);
      }
      mounted.set(record, entry);
      record.overlordMount = entry;
    }
  }

  function actionDurationMs(id, move = {}) {
    const entry = [...mounted.values()].find((item) => item.id === id);
    if (!entry?.mixer) return 0;
    const clipName = resolveClipName(entry, move);
    const action = clipName ? entry.clips[clipName] : entry.idleAction;
    if (!action) return 0;
    const sec = action.getClip()?.duration || 2.2;
    return Math.max(900, Math.round((sec / OVERLORD_CLIP_PACE) * 1000));
  }

  function playAction(id, move = {}) {
    const entry = [...mounted.values()].find((item) => item.id === id);
    if (!entry?.mixer) return 0;
    const clipName = resolveClipName(entry, move);
    const action = clipName ? entry.clips[clipName] : entry.idleAction;
    if (!action) return 0;
    if (move.lunge && !reduced) {
      const parentScale = Math.max(0.5, Number(move.lunge.parentScale) || 1);
      entry.lunge = {
        start: performance.now(),
        duration: Math.max(400, Number(move.lunge.durationMs) || 1800),
        dx: (Number(move.lunge.dx) || 0) / parentScale,
        dz: (Number(move.lunge.dz) || 0) / parentScale,
        aoe: Boolean(move.lunge.aoe),
      };
    }
    if (action === entry.idleAction) {
      action.reset();
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      entry.activeAction = action;
      entry.playingClip = action.getClip().name;
      return Math.round((action.getClip().duration || 1.6) * 1000);
    }
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = Math.max(0.35, (Number(move.speed) || 1) * OVERLORD_CLIP_PACE);
    action.play();
    if (entry.activeAction && entry.activeAction !== action) {
      entry.activeAction.crossFadeTo(action, 0.09, true);
    }
    entry.activeAction = action;
    entry.playingClip = action.getClip().name;
    return Math.max(
      900,
      Math.round(((action.getClip()?.duration || 2.2) / OVERLORD_CLIP_PACE) * 1000),
    );
  }

  function update(now) {
    if (!mounted.size) {
      lastNow = now;
      return false;
    }
    const dt = lastNow ? Math.min(0.05, Math.max(0.001, (now - lastNow) / 1000)) : 1 / 60;
    lastNow = now;
    if (reduced) return false;
    const t = now * 0.001;
    let index = 0;
    let hasAnimation = false;
    for (const [record, entry] of mounted.entries()) {
      if (!record.root.visible) continue;
      if (entry.mixer) {
        entry.mixer.update(dt);
        hasAnimation = true;
      }
      const hover =
        !entry.mixer && entry.floating ? 0.055 + Math.sin(t * 2.1 + index * 1.15) * 0.032 : 0;
      const breathe = entry.mixer ? 1 : 1 + Math.sin(t * 1.8 + index * 1.15) * 0.014;
      entry.figure.scale.set(entry.baseScale, entry.baseScale * breathe, entry.baseScale);
      let lungeX = 0;
      let lungeY = 0;
      let lungeZ = 0;
      if (entry.lunge) {
        const L = entry.lunge;
        const u = Math.min(1, (now - L.start) / L.duration);
        hasAnimation = true;
        if (u >= 1) {
          entry.lunge = null;
        } else {
          let travel;
          let lift;
          if (u < 0.13) {
            const p = u / 0.13;
            travel = -0.12 * Math.sin(p * Math.PI * 0.5);
            lift = 0.06 * p;
          } else if (u < 0.29) {
            const p = (u - 0.13) / 0.16;
            const accel = p * p * p;
            travel = -0.12 * (1 - accel) + accel;
            lift = Math.sin(p * Math.PI) * (L.aoe ? 1.18 : 0.46) + (1 - p) * 0.06;
          } else if (u < 0.48) {
            travel = 1;
            lift = 0;
          } else {
            const p = (u - 0.48) / 0.52;
            travel = Math.pow(1 - p, 2.3);
            lift = Math.sin(p * Math.PI) * 0.38;
          }
          lungeX = L.dx * travel;
          lungeY = lift;
          lungeZ = L.dz * travel;
        }
      }
      if (entry.overlord && entry.stage >= 2) {
        const vibe = entry.stage >= 3 ? 0.025 : 0;
        const pulse =
          (0.5 + 0.5 * Math.sin(t * (entry.stage >= 3 ? 7 : 4))) * (entry.stage >= 3 ? 0.34 : 0.16);
        lungeX += vibe ? Math.sin(t * 37) * vibe : 0;
        entry.figure.traverse((node) => {
          if (!node.isMesh || node.name.includes('Battle_Card')) return;
          for (const mat of Array.isArray(node.material) ? node.material : [node.material]) {
            if (mat?.emissive && mat.userData?.baseEmission) {
              mat.emissive
                .copy(mat.userData.baseEmission)
                .add(new THREE.Color(entry.stage >= 3 ? 0xff4568 : 0xe89c3c).multiplyScalar(pulse));
            }
          }
        });
      }
      entry.figure.position.set(
        entry.baseX + lungeX,
        entry.baseY + hover + lungeY,
        entry.baseZ + lungeZ,
      );
      if (!entry.mixer) {
        entry.figure.rotation.y = Math.sin(t * 0.9 + index * 1.15) * 0.06;
      }
      const sealRate = entry.stage >= 3 ? 4.0 : entry.stage === 2 ? 2.4 : 1.0;
      entry.seal.rotation.y = t * 0.45 * sealRate * (index % 2 ? -1 : 1);
      index++;
    }
    return hasAnimation;
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
          animations: Object.keys(entry.clips || {}),
          playingClip: entry.playingClip,
          visible: record.root.visible,
          cardY: Number(record.root.position.y.toFixed(3)),
          mountLocalY: Number(entry.mount.position.y.toFixed(3)),
          worldY: Number(tmp.y.toFixed(3)),
        };
      }),
    };
  }

  return { sync, actionDurationMs, playAction, update, status };
}
