import * as THREE from 'three';
import { createIllustratedPeople } from './illustrated-people.js';

export function illustratedImage(source, timeOfDay) {
  return (timeOfDay === 'night' && source.nightImage) || source.image;
}

/** One continuous painting owns the ground, landmarks, foreground and standing coordinates. */
export async function createIllustratedStreet(
  scene,
  resources,
  definition,
  loading,
  timeOfDay,
  enteredFrom,
) {
  const source = definition.illustration;
  const entry =
    source.arrivalPan && Object.hasOwn(source.points, enteredFrom)
      ? source.points[enteredFrom]
      : null;
  const arrivalSide =
    entry && !matchMedia('(prefers-reduced-motion: reduce)').matches
      ? Math.sign(entry[0] - 0.5)
      : 0;
  const textures = new Map();
  function texture(file) {
    if (!textures.has(file))
      textures.set(
        file,
        loading
          .texture(file)
          .then((map) => {
            map.colorSpace = THREE.SRGBColorSpace;
            return resources.track(map);
          })
          .catch((error) => {
            textures.delete(file);
            throw error;
          }),
      );
    return textures.get(file);
  }
  let image = illustratedImage(source, timeOfDay);
  let requestedImage = image;
  const map = await texture(image);
  const aspect = source.aspect ?? map.image.width / map.image.height;
  const root = new THREE.Group();
  root.name = 'Illustrated_Street_Views';
  scene.add(root);
  const material = resources.track(new THREE.MeshBasicMaterial({ map, toneMapped: false }));
  const background = new THREE.Mesh(resources.track(new THREE.PlaneGeometry(aspect, 1)), material);
  background.position.z = -4;
  background.name = 'Illustrated_Connected_Background';
  root.add(background);
  const characters = await createIllustratedPeople(scene, resources, definition, loading, aspect);
  for (const polygon of source.foreground) {
    const shape = new THREE.Shape();
    polygon.forEach(([x, y], index) => {
      const point = [(x - 0.5) * aspect, 0.5 - y];
      if (index) shape.lineTo(...point);
      else shape.moveTo(...point);
    });
    shape.closePath();
    const geometry = resources.track(new THREE.ShapeGeometry(shape));
    const positions = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let index = 0; index < uv.count; index++)
      uv.setXY(index, positions.getX(index) / aspect + 0.5, positions.getY(index) + 0.5);
    const foreground = new THREE.Mesh(geometry, material);
    foreground.position.z = 1;
    foreground.renderOrder = 3;
    foreground.name = 'Illustrated_Connected_Foreground';
    root.add(foreground);
  }
  let width = 1;
  let height = 0.9;
  let centerX = null;
  let centerY = null;
  let panX = 0;
  let panY = 0;
  let lastTime = 0;
  let moving = false;
  let arrivalPending = Boolean(arrivalSide);

  function limits() {
    const limitX = Math.max(0, (aspect - width) / 2 - 0.012);
    const limitY = Math.max(0, (1 - height) / 2 - 0.006);
    if (source.fullVerticalPan) return { limitX, bottom: -limitY, top: limitY, baseY: 0 };
    const feet = [...Object.values(source.spots), ...Object.values(source.people || {})].map(
      (spot) => spot.foot[1],
    );
    const lowestFoot = Math.max(0.76, ...feet);
    const safeTop = Math.max(-limitY, Math.min(limitY, 0.5 - lowestFoot + 0.44 * height));
    const travel = Math.min(height * 0.045, (safeTop + limitY) / 2);
    const baseY = THREE.MathUtils.clamp(
      0.5 - lowestFoot + 0.365 * height,
      -limitY + travel,
      safeTop - travel,
    );
    return { limitX, bottom: baseY - travel, top: baseY + travel, baseY };
  }
  function destination() {
    const { limitX, bottom, top, baseY } = limits();
    return {
      x: THREE.MathUtils.clamp(panX, -limitX, limitX),
      y: THREE.MathUtils.clamp(baseY + panY, bottom, top),
    };
  }
  function project(camera) {
    camera.left = centerX - width / 2;
    camera.right = centerX + width / 2;
    camera.top = centerY + height / 2;
    camera.bottom = centerY - height / 2;
    camera.updateProjectionMatrix();
  }
  function resize(camera, ratio) {
    if (source.fixed) {
      height = source.fitWidth ? aspect / ratio : Math.min(1, aspect / ratio);
      width = height * ratio;
      centerX = 0;
      centerY = Math.min(0, (height - 1) / 2);
      project(camera);
      return;
    }
    height = Math.min(source.viewHeight ?? 0.86, (source.viewWidth ?? 1.85) / ratio);
    width = height * ratio;
    const target = destination();
    const limitX = Math.max(0, (aspect - width) / 2 - 0.012);
    if (centerX === null) {
      centerX = target.x + arrivalSide * Math.min(limitX, aspect * 0.04);
      centerY = target.y;
    } else {
      const limitY = Math.max(0, (1 - height) / 2 - 0.006);
      centerX = THREE.MathUtils.clamp(centerX, -limitX, limitX);
      centerY = THREE.MathUtils.clamp(centerY, -limitY, limitY);
    }
    project(camera);
    moving = true;
  }
  return {
    root,
    illustrated: true,
    ground: null,
    cutouts: characters,
    characters,
    panorama: background,
    get moving() {
      return moving;
    },
    get image() {
      return image;
    },
    async setTime(value) {
      const file = illustratedImage(source, value);
      requestedImage = file;
      if (file === image) return false;
      const next = await texture(file);
      if (requestedImage !== file || image === file) return false;
      material.map = next;
      image = file;
      return true;
    },
    get framing() {
      return { x: centerX, y: centerY, width, height, panX, panY };
    },
    resize,
    startArrival() {
      if (!arrivalPending) return;
      arrivalPending = false;
      moving = true;
    },
    reset() {
      if (source.fixed) return;
      panX = panY = 0;
      moving = true;
    },
    drag(dx, dy) {
      if (source.fixed) return;
      const { limitX, bottom, top, baseY } = limits();
      panX = THREE.MathUtils.clamp(panX - dx * width, -limitX, limitX);
      panY = THREE.MathUtils.clamp(panY + dy * height, bottom - baseY, top - baseY);
      moving = true;
    },
    pointAnchor(id) {
      const point = source.points[id];
      return point ? [(point[0] - 0.5) * aspect, 0.5 - point[1], 0.1] : null;
    },
    picturePoint(x, y, camera) {
      const point = new THREE.Vector3(x * 2 - 1, 1 - y * 2, 0).unproject(camera);
      return [point.x / aspect + 0.5, 0.5 - point.y];
    },
    placement(spot) {
      const entry = source.spots[spot];
      return entry
        ? {
            position: [(entry.foot[0] - 0.5) * aspect, 0.5 - entry.foot[1], 0.2],
            scale: entry.height / 1.72,
          }
        : null;
    },
    acceptsHit(hit) {
      if (hit.object.userData.hitAlpha && hit.uv) {
        const x = THREE.MathUtils.clamp(Math.floor(hit.uv.x * 96), 0, 95);
        const y = THREE.MathUtils.clamp(Math.floor((1 - hit.uv.y) * 144), 0, 143);
        return hit.object.userData.hitAlpha[(y * 96 + x) * 4 + 3] > 32;
      }
      return hit.object.visible && hit.object.parent.visible;
    },
    update(camera, now = performance.now()) {
      if (source.fixed || arrivalPending) return false;
      const target = destination();
      const delta = lastTime ? Math.min(32, Math.max(1, now - lastTime)) : 16;
      lastTime = now;
      const factor = 1 - Math.exp(-delta * 0.013);
      centerX += (target.x - centerX) * factor;
      centerY += (target.y - centerY) * factor;
      moving = Math.abs(target.x - centerX) + Math.abs(target.y - centerY) > 0.00012;
      if (!moving) {
        centerX = target.x;
        centerY = target.y;
      }
      project(camera);
      return moving;
    },
  };
}
