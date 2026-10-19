import * as THREE from 'three';
import { planPeriphery } from './content/periphery.js';

/** Two instanced batches repeat themed scenery beyond the visible border. */
export function createScenePeriphery(model, map, resources, surfaces, authoredLayout = null) {
  if (authoredLayout?.mode === 'authored-large') return { ...authoredLayout, drawBatches: 0 };
  const plan = planPeriphery(map, (x, z) => surfaces.sample(x, z).y > 0.35);
  const group = new THREE.Group();
  group.name = 'Tiled_Outer_Environment';
  const geometry = resources.track(new THREE.BoxGeometry(1, 1, 1));
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  for (const glow of [false, true]) {
    const boxes = plan.boxes.filter((box) => box.glow === glow);
    if (!boxes.length) continue;
    const material = resources.track(
      glow
        ? new THREE.MeshBasicMaterial({ toneMapped: false })
        : new THREE.MeshStandardMaterial({ roughness: 0.87, metalness: 0.07 }),
    );
    const mesh = resources.track(new THREE.InstancedMesh(geometry, material, boxes.length));
    mesh.name = glow ? 'Extended_Scenery_Lights' : 'Extended_Scenery_Solids';
    mesh.castShadow = !glow;
    mesh.receiveShadow = !glow;
    boxes.forEach((box, index) => {
      dummy.position.set(box.x, box.y + box.h / 2, box.z);
      dummy.scale.set(box.w, box.h, box.d);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, color.set(box.color));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  model.add(group);
  resources.object(group);
  surfaces.addBoxes(plan.boxes);
  return {
    patches: plan.patches.length,
    boxes: plan.boxes.length,
    occupied: plan.skipped,
    bounds: plan.bounds,
    drawBatches: group.children.length,
  };
}
