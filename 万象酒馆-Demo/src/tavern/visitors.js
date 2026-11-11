import * as THREE from 'three';
import { TAVERN_VISITORS, TAVERN_VISITOR_SPOTS } from '../content/tavern-visitors.js';
import { createResourceScope } from '../shared/resources.js';
import { createEventScope } from '../shared/events.js';
import { createAssetStore } from '../shared/asset-store.js';
import { standingSprite } from '../content/tavern-visitors.js';
import { standingFrame } from './standing-frame.js';

/** Upright alpha-tested planes share the room depth buffer and face the camera around Y only. */
export function createTavernVisitors(scene, camera, model, options = {}) {
  if (parent !== window) document.documentElement.dataset.embedded = 'true';
  const resources = createResourceScope();
  const events = createEventScope();
  const group = new THREE.Group();
  group.name = 'Tavern_Standing_Visitors';
  scene.add(group);
  const actors = new Map();
  const assets = options.assets || createAssetStore();
  const spots = options.spots || TAVERN_VISITOR_SPOTS;
  const maxVisible = Math.min(options.maxVisible || 3, spots.length);
  const shuffled = [...spots];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const tasks = new Map();
  let enabled = false;
  let disposed = false;
  let revision = '';
  let offset = Math.floor(Math.random() * Math.max(1, spots.length));
  let rotation = Math.floor(Math.random() * TAVERN_VISITORS.length);
  let collection = [];
  const refresh = document.createElement('button');
  refresh.id = 'visitor-refresh';
  refresh.textContent = '换个位置 ↻';
  refresh.title = '重新分布当前场景中的角色';
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

  function visibleDefinitions() {
    const available = collection.flatMap((entry) => {
      const official = TAVERN_VISITORS.find((definition) => definition.id === entry.key);
      if (entry.image)
        return [
          {
            ...(official || {
              id: entry.key,
              name: entry.name || '来客',
              height: 1.72,
              top: 0,
              foot: 1536,
            }),
            image: entry.image,
            custom: true,
          },
        ];
      return official ? [official] : [];
    });
    return [...available.slice(rotation), ...available.slice(0, rotation)].slice(0, maxVisible);
  }
  function distribute() {
    const selected = visibleDefinitions();
    for (const actor of actors.values()) {
      const index = selected.findIndex((definition) => definition.id === actor.id);
      actor.root.visible = enabled && index >= 0 && !!actor.mesh;
      if (!actor.root.visible) continue;
      const spot = shuffled[(offset + index) % shuffled.length];
      actor.spot = spot.id;
      actor.root.position.fromArray(spot.position);
    }
    options.onChange?.();
  }
  async function ensureVisible() {
    if (enabled)
      await Promise.all(
        visibleDefinitions().map((definition) => {
          if (!tasks.has(definition.id)) tasks.set(definition.id, populate(definition));
          return tasks.get(definition.id);
        }),
      );
    distribute();
  }
  async function populate(definition) {
    const root = new THREE.Group();
    root.name = definition.name;
    root.visible = false;
    group.add(root);
    const actor = { id: definition.id, root, mesh: null, alpha: null, spot: null };
    actors.set(definition.id, actor);
    try {
      const texture = resources.track(
        new THREE.Texture(await assets.image(standingSprite(definition))),
      );
      texture.needsUpdate = true;
      if (disposed) return;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 2;
      const { width, height } = texture.image;
      const heightScale = options.heightScale ?? 1;
      const pixels = document.createElement('canvas');
      pixels.width = 96;
      pixels.height = 144;
      const context = pixels.getContext('2d', { willReadFrequently: true });
      context.drawImage(texture.image, 0, 0, pixels.width, pixels.height);
      actor.alpha = {
        width: pixels.width,
        height: pixels.height,
        data: context.getImageData(0, 0, pixels.width, pixels.height).data,
      };
      const { top, foot } = definition.custom
        ? standingFrame(actor.alpha.data, actor.alpha.width, actor.alpha.height, height)
        : definition;
      const imageHeight = (definition.height * heightScale * height) / (foot - top);
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
          forceSinglePass: !!options.flat,
          color: options.flat ? '#fff4e8' : '#e4d7c8',
        }),
      );
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.y = imageHeight * (foot / height - 0.5);
      mesh.userData.visitor = definition.id;
      mesh.renderOrder = 2;
      root.add(mesh);
      actor.mesh = mesh;
      for (const [width, depth, opacity, z] of [
        [1.05, 0.68, 0.58, -0.08],
        [0.55, 0.28, 0.8, 0],
      ]) {
        const shadow = new THREE.Mesh(
          resources.track(
            new THREE.PlaneGeometry(
              width * heightScale,
              depth * heightScale * (options.flat ? 0.16 : 1),
            ),
          ),
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
        shadow.rotation.x = options.flat ? 0 : -Math.PI / 2;
        shadow.position.set(0, options.flat ? -0.008 : 0.025, options.flat ? -0.02 : z);
        root.add(shadow);
      }
      distribute();
    } catch {
      root.visible = false;
      actors.delete(definition.id);
    }
  }
  events.on(refresh, 'click', () => {
    if (!spots.length) return;
    offset = (offset + 1) % spots.length;
    const count = collection.length;
    if (count > maxVisible) rotation = (rotation + 1) % count;
    distribute();
    void ensureVisible();
  });
  events.on(window, 'message', (event) => {
    if (
      parent !== window &&
      event.source === parent &&
      event.origin === location.origin &&
      event.data?.type === 'tavern-visitors-refresh' &&
      enabled
    )
      refresh.click();
  });
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  return {
    async configure(value) {
      const signature = JSON.stringify(value);
      if (disposed) return;
      if (signature === revision) return ensureVisible();
      revision = signature;
      for (const actor of actors.values()) actor.root.removeFromParent();
      actors.clear();
      tasks.clear();
      enabled = value?.enabled === true;
      collection = (Array.isArray(value?.characters) ? value.characters : []).filter(
        (entry) => !/(?:^|\/)assets\/gal-npc-cast\//u.test(entry.image || ''),
      );
      rotation %= collection.length || 1;
      refresh.hidden = !enabled || !maxVisible || !collection.length;
      if (parent !== window)
        parent.postMessage(
          { type: 'tavern-visitors-availability', available: !refresh.hidden },
          location.origin,
        );
      group.visible = enabled;
      await ensureVisible();
    },
    update() {
      if (!enabled) return;
      for (const actor of actors.values()) {
        if (!actor.root.visible || !actor.mesh) continue;
        if (options.placement) {
          const placement = options.placement(actor.spot);
          actor.root.visible = !!placement;
          if (placement) {
            actor.root.position.fromArray(placement.position);
            actor.root.scale.setScalar(placement.scale);
            actor.mesh.rotation.y = 0;
          }
          continue;
        }
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
        const obstruction =
          model &&
          ray
            .intersectObject(model, true)
            .find((hit) => !options.acceptsObstruction || options.acceptsObstruction(hit));
        if (obstruction && obstruction.distance < hit.distance - 0.05) continue;
        return collection.find((entry) => entry.key === actor.id) || null;
      }
      return null;
    },
    status() {
      return {
        enabled,
        spots: spots.length,
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
    meshes() {
      return [...actors.values()]
        .filter((actor) => actor.root.visible && actor.mesh)
        .map((actor) => actor.mesh);
    },
    dispose() {
      disposed = true;
      group.removeFromParent();
      events.dispose();
      refresh.remove();
      resources.dispose();
      actors.clear();
      if (!options.assets) assets.dispose();
    },
  };
}
