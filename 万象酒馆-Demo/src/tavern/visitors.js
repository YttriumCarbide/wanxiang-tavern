import * as THREE from 'three';
import { TAVERN_VISITORS, TAVERN_VISITOR_SPOTS } from '../content/tavern-visitors.js';
import { createResourceScope } from '../shared/resources.js';
import { createEventScope } from '../shared/events.js';

/** Upright alpha-tested planes share the room depth buffer and face the camera around Y only. */
export function createTavernVisitors(scene, camera, model) {
  const resources = createResourceScope();
  const events = createEventScope();
  const group = new THREE.Group();
  group.name = 'Tavern_Standing_Visitors';
  scene.add(group);
  const actors = new Map();
  const loader = new THREE.TextureLoader();
  let enabled = false;
  let disposed = false;
  let revision = '';
  let offset = Math.floor(Math.random() * TAVERN_VISITOR_SPOTS.length);
  let collection = [];
  const refresh = document.createElement('button');
  refresh.id = 'visitor-refresh';
  refresh.textContent = '换个位置 ↻';
  refresh.title = '重新分布酒馆内的角色立绘';
  refresh.hidden = true;
  document.body.append(refresh);
  const ground = document.createElement('canvas');
  ground.width = ground.height = 64;
  const paint = ground.getContext('2d');
  const gradient = paint.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, '#000000c8');
  gradient.addColorStop(0.32, '#0000008a');
  gradient.addColorStop(1, '#00000000');
  paint.fillStyle = gradient;
  paint.fillRect(0, 0, 64, 64);
  const shadowMap = resources.track(new THREE.CanvasTexture(ground));

  function distribute() {
    let index = 0;
    for (const actor of actors.values()) {
      actor.root.visible = enabled && collection.some((entry) => entry.key === actor.id);
      if (!actor.root.visible) continue;
      const spot = TAVERN_VISITOR_SPOTS[(offset + index * 2) % TAVERN_VISITOR_SPOTS.length];
      actor.spot = spot.id;
      actor.root.position.fromArray(spot.position);
      index++;
    }
  }
  async function load(definition) {
    if (actors.has(definition.id)) return;
    const root = new THREE.Group();
    root.name = definition.name;
    root.visible = false;
    group.add(root);
    const actor = { id: definition.id, root, mesh: null, alpha: null, spot: null };
    actors.set(definition.id, actor);
    try {
      const texture = resources.track(
        await loader.loadAsync(`./assets/tavern-visitors/${definition.id}-full-v1.png`),
      );
      if (disposed) return;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      const { width, height } = texture.image;
      const imageHeight = (definition.height * height) / (definition.foot - definition.top);
      const geometry = resources.track(
        new THREE.PlaneGeometry((imageHeight * width) / height, imageHeight),
      );
      const material = resources.track(
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          alphaTest: 0.12,
          depthWrite: true,
          side: THREE.DoubleSide,
          color: '#e4d7c8',
        }),
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = imageHeight * (definition.foot / height - 0.5);
      mesh.userData.visitor = definition.id;
      mesh.renderOrder = 2;
      root.add(mesh);
      actor.mesh = mesh;
      const pixels = document.createElement('canvas');
      pixels.width = width;
      pixels.height = height;
      const context = pixels.getContext('2d', { willReadFrequently: true });
      context.drawImage(texture.image, 0, 0);
      actor.alpha = { width, height, data: context.getImageData(0, 0, width, height).data };
      for (const [width, depth, opacity, z] of [
        [1.05, 0.68, 0.58, -0.08],
        [0.55, 0.28, 0.8, 0],
      ]) {
        const shadow = new THREE.Mesh(
          resources.track(new THREE.PlaneGeometry(width, depth)),
          resources.track(
            new THREE.MeshBasicMaterial({
              map: shadowMap,
              transparent: true,
              opacity,
              depthWrite: false,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              polygonOffsetUnits: -1,
            }),
          ),
        );
        shadow.renderOrder = 1;
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.set(0, 0.025, z);
        root.add(shadow);
      }
      distribute();
    } catch {
      root.visible = false;
      actors.delete(definition.id);
    }
  }
  events.on(refresh, 'click', () => {
    offset = (offset + 1) % TAVERN_VISITOR_SPOTS.length;
    distribute();
  });
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  return {
    configure(value) {
      const signature = JSON.stringify(value);
      if (signature === revision || disposed) return;
      revision = signature;
      enabled = value?.enabled === true;
      collection = Array.isArray(value?.characters) ? value.characters : [];
      refresh.hidden = !enabled;
      group.visible = enabled;
      if (enabled)
        for (const definition of TAVERN_VISITORS)
          if (collection.some((entry) => entry.key === definition.id)) void load(definition);
      distribute();
    },
    update() {
      if (!enabled) return;
      for (const actor of actors.values()) {
        if (!actor.root.visible || !actor.mesh) continue;
        const dx = camera.position.x - actor.root.position.x;
        const dz = camera.position.z - actor.root.position.z;
        actor.mesh.rotation.y = Math.atan2(dx, dz);
      }
    },
    pick(x, y) {
      if (!enabled) return null;
      mouse.set((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2);
      ray.setFromCamera(mouse, camera);
      const meshes = [...actors.values()]
        .filter((actor) => actor.root.visible && actor.mesh)
        .map((actor) => actor.mesh);
      for (const hit of ray.intersectObjects(meshes, false)) {
        const actor = actors.get(hit.object.userData.visitor);
        const alpha = actor.alpha;
        const px = Math.max(0, Math.min(alpha.width - 1, Math.floor(hit.uv.x * alpha.width)));
        const py = Math.max(
          0,
          Math.min(alpha.height - 1, Math.floor((1 - hit.uv.y) * alpha.height)),
        );
        if (alpha.data[(py * alpha.width + px) * 4 + 3] < 32) continue;
        const obstruction = ray.intersectObject(model, true)[0];
        if (obstruction && obstruction.distance < hit.distance - 0.05) continue;
        return collection.find((entry) => entry.key === actor.id) || null;
      }
      return null;
    },
    status() {
      return {
        enabled,
        spots: TAVERN_VISITOR_SPOTS.length,
        characters: [...actors.values()]
          .filter((actor) => actor.root.visible)
          .map((actor) => ({
            key: actor.id,
            spot: actor.spot,
            position: actor.root.position.toArray(),
            loaded: Boolean(actor.mesh),
            yaw: actor.mesh?.rotation.y,
          })),
      };
    },
    dispose() {
      disposed = true;
      group.removeFromParent();
      events.dispose();
      refresh.remove();
      resources.dispose();
      actors.clear();
    },
  };
}
