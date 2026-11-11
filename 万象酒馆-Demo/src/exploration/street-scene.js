import * as THREE from 'three';
import { TAVERN_VISITORS } from '../content/tavern-visitors.js';
import { createExplorationGround } from './ground.js';
import { createExplorationBackground } from './background.js';
import { createSpatialStreet } from './spatial-street.js';

/** One continuous painted surround and one physical floor share the camera origin. */
export async function createStreetScene(scene, resources, quality, definition, loading) {
  async function texture(file, transparent = false) {
    const map = resources.track(await loading.texture(file));
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = quality.mobile ? 2 : 4;
    const material = resources.track(
      new THREE.MeshBasicMaterial({
        map,
        transparent,
        alphaTest: transparent ? 0.1 : 0,
        side: THREE.DoubleSide,
        toneMapped: false,
        forceSinglePass: true,
      }),
    );
    return { map, material };
  }
  const spatial = definition.spatial
    ? await createSpatialStreet(scene, resources, quality, definition, loading)
    : null;
  let panorama = spatial?.panorama;
  let ground = spatial?.ground;
  let root = spatial?.root;
  if (!spatial) {
    const backdrop = await texture(definition.panorama);
    const band = definition.panoramaBand ? await texture(definition.panoramaBand) : null;
    const backgroundMaterial = createExplorationBackground(
      resources,
      definition,
      backdrop.map,
      band?.map,
    );
    panorama = new THREE.Mesh(
      resources.track(new THREE.SphereGeometry(40, 32, 16)),
      backgroundMaterial,
    );
    const uv = panorama.geometry.attributes.uv;
    for (let index = 0; index < uv.count; index++) uv.setX(index, 1 - uv.getX(index));
    panorama.position.set(...definition.eye);
    panorama.rotation.y = Math.PI / 2;
    panorama.name = 'Painted_Street_Panorama';
    scene.add(panorama);
    ground = await createExplorationGround(scene, resources, loading, definition);
    root = new THREE.Group();
    root.name = 'Street_Foreground_Cutouts';
    scene.add(root);
  }
  const characters = [];
  const cutouts = [...(spatial?.interactiveWalls || [])];
  const billboards = [];
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 64;
  const context = shadowCanvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, '#292030b0');
  gradient.addColorStop(0.4, '#29203060');
  gradient.addColorStop(1, '#29203000');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  const shadowTexture = resources.track(new THREE.CanvasTexture(shadowCanvas));
  const shadowMaterial = resources.track(
    new THREE.MeshBasicMaterial({
      map: shadowTexture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  function shadow(x, z, width, depth) {
    const mesh = new THREE.Mesh(
      resources.track(new THREE.PlaneGeometry(width, depth)),
      shadowMaterial,
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.015, z);
    mesh.name = 'Painted_Contact_Shadow';
    scene.add(mesh);
  }
  async function cutout(spec) {
    const surface = await texture(spec.image, true);
    const image = surface.map.image;
    const visibleHeight = spec.height;
    const pixelFoot = spec.foot || image.height;
    const pixelTop = spec.top || 0;
    const height = (visibleHeight * image.height) / (pixelFoot - pixelTop);
    const mesh = new THREE.Mesh(
      resources.track(new THREE.PlaneGeometry((height * image.width) / image.height, height)),
      surface.material,
    );
    mesh.position.set(
      spec.position[0],
      height * (pixelFoot / image.height - 0.5),
      spec.position[1],
    );
    mesh.name = 'Street_Cutout_' + spec.id;
    mesh.userData.point = spec.id;
    // A tiny alpha lookup is only for pointer hit testing; rendering uses the original PNG.
    const hitCanvas = document.createElement('canvas');
    hitCanvas.width = 64;
    hitCanvas.height = 96;
    const hitContext = hitCanvas.getContext('2d');
    hitContext.drawImage(image, 0, 0, 64, 96);
    mesh.userData.hitAlpha = hitContext.getImageData(0, 0, 64, 96).data;
    cutouts.push(mesh);
    billboards.push(mesh);
    shadow(spec.position[0], spec.position[1], spec.height * 0.75, spec.height * 0.26);
    return mesh;
  }
  for (const spec of definition.cutouts) {
    if (spec.kind === 'character') continue;
    const portrait =
      spec.kind === 'character'
        ? TAVERN_VISITORS.find((entry) => entry.id === spec.portrait)
        : null;
    const mesh = await cutout({
      ...portrait,
      ...spec,
      image: portrait ? `./assets/tavern-visitors/${portrait.id}-full-v1.png` : spec.image,
    });
    if (portrait || spec.kind === 'npc') {
      characters.push(mesh);
      scene.add(mesh);
    } else root.add(mesh);
  }
  resources.object(scene);
  return {
    root,
    panorama,
    ground,
    characters,
    cutouts,
    spatial,
    acceptsHit(hit) {
      if (!hit?.uv) return false;
      const facade = hit.object.userData.facadeAlpha;
      if (facade) {
        const x = Math.min(127, Math.max(0, Math.floor(hit.uv.x * 128)));
        const y = Math.min(127, Math.max(0, Math.floor((1 - hit.uv.y) * 128)));
        return facade[(y * 128 + x) * 4 + 3] > 114;
      }
      if (!hit.object.userData.hitAlpha) return true;
      const x = Math.min(63, Math.max(0, Math.floor(hit.uv.x * 64)));
      const y = Math.min(95, Math.max(0, Math.floor((1 - hit.uv.y) * 96)));
      return hit.object.userData.hitAlpha[(y * 64 + x) * 4 + 3] > 40;
    },
    update(camera) {
      for (const mesh of billboards)
        mesh.rotation.y = Math.atan2(
          camera.position.x - mesh.position.x,
          camera.position.z - mesh.position.z,
        );
    },
  };
}
