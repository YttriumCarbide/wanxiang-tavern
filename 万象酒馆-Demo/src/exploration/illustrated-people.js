import * as THREE from 'three';
import { standingFrame } from '../tavern/standing-frame.js';

/** Chapter NPCs keep their existing identities and original PNGs on authored pavement. */
export async function createIllustratedPeople(scene, resources, definition, loading, aspect) {
  const people = [];
  const definitions = definition.cutouts.filter((entry) => entry.kind === 'npc');
  if (!definitions.length) return people;
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const paint = shadowCanvas.getContext('2d');
  const gradient = paint.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, '#0000009a');
  gradient.addColorStop(1, '#00000000');
  paint.fillStyle = gradient;
  paint.fillRect(0, 0, 64, 64);
  const shadowMap = resources.track(new THREE.CanvasTexture(shadowCanvas));
  for (const data of definitions) {
    const position = definition.illustration.people?.[data.id];
    if (!position) continue;
    const map = resources.track(await loading.texture(data.image));
    map.colorSpace = THREE.SRGBColorSpace;
    const image = map.image;
    const hitCanvas = document.createElement('canvas');
    hitCanvas.width = 96;
    hitCanvas.height = 144;
    const context = hitCanvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, 96, 144);
    const alpha = context.getImageData(0, 0, 96, 144).data;
    const { top, foot } = standingFrame(alpha, 96, 144, image.height);
    const height = (position.height * image.height) / (foot - top);
    const group = new THREE.Group();
    group.name = 'Illustrated_Person_' + data.id;
    group.position.set((position.foot[0] - 0.5) * aspect, 0.5 - position.foot[1], 0.2);
    const material = resources.track(
      new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.12, toneMapped: false }),
    );
    const mesh = new THREE.Mesh(
      resources.track(new THREE.PlaneGeometry((height * image.width) / image.height, height)),
      material,
    );
    mesh.position.y = height * (foot / image.height - 0.5);
    mesh.renderOrder = 2;
    mesh.userData.point = data.id;
    mesh.userData.staticNpc = data.id;
    mesh.userData.hitAlpha = alpha;
    group.add(mesh);
    const shadow = new THREE.Mesh(
      resources.track(new THREE.PlaneGeometry(position.height * 0.6, position.height * 0.08)),
      resources.track(
        new THREE.MeshBasicMaterial({
          map: shadowMap,
          transparent: true,
          depthWrite: false,
          toneMapped: false,
        }),
      ),
    );
    shadow.position.set(0, -0.002, -0.02);
    shadow.renderOrder = 1;
    group.add(shadow);
    scene.add(group);
    people.push(mesh);
  }
  return people;
}
