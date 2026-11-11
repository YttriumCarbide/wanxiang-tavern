import * as THREE from 'three';
import { createSpatialGround } from './spatial-ground.js';
import { createExplorationBackground } from './background.js';

/** Find transparent canvas margins for UV fitting; source PNG pixels remain unchanged. */
function imageFrame(image) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0, 128, 128);
  const pixels = context.getImageData(0, 0, 128, 128).data;
  let left = 128,
    right = 0,
    top = 128,
    bottom = 0;
  for (let row = 0; row < 128; row++) {
    for (let column = 0; column < 128; column++) {
      if (pixels[(row * 128 + column) * 4 + 3] < 96) continue;
      left = Math.min(left, column);
      right = Math.max(right, column + 1);
      top = Math.min(top, row);
      bottom = Math.max(bottom, row + 1);
    }
  }
  return { crop: [left / 128, 1 - bottom / 128, right / 128, 1 - top / 128], alpha: pixels };
}

export async function createSpatialStreet(scene, resources, quality, definition, loading) {
  const spec = definition.spatial;
  const art = Object.fromEntries(
    await Promise.all(
      Object.entries(spec.art).map(async ([key, file]) => {
        const map = resources.track(await loading.texture(file));
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = quality.mobile ? 2 : 4;
        return [key, { map, ...imageFrame(map.image) }];
      }),
    ),
  );
  const root = new THREE.Group();
  root.name = 'Spatial_Street_Facades';
  scene.add(root);
  const interactiveWalls = [];
  const walls = [];
  function painting(data, surface, distant = false) {
    const [left, bottom, right, top] = surface.crop;
    const crop = data.crop || [0, 0, 1, 1];
    // Wall sprites include eaves and uneven ivy; overlap their ends behind the
    // neighbouring wall so those transparent margins cannot open sky slits.
    const width = data.width + (!distant && data.id !== 'gateway' ? 0.8 : 0);
    const geometry = resources.track(new THREE.PlaneGeometry(width, data.height));
    const uv = geometry.attributes.uv;
    for (let index = 0; index < uv.count; index++) {
      const x = THREE.MathUtils.lerp(crop[0], crop[2], uv.getX(index));
      const y = THREE.MathUtils.lerp(crop[1], crop[3], uv.getY(index));
      uv.setXY(index, THREE.MathUtils.lerp(left, right, x), THREE.MathUtils.lerp(bottom, top, y));
    }
    const light = distant
      ? '#eee0ca'
      : new THREE.Color().setScalar(
          0.88 + 0.1 * Math.max(0, -Math.sin(data.yaw) * 0.6 - Math.cos(data.yaw) * 0.4),
        );
    const material = resources.track(
      distant
        ? new THREE.ShaderMaterial({
            uniforms: { uMap: { value: surface.map } },
            side: THREE.DoubleSide,
            transparent: true,
            depthWrite: false,
            toneMapped: false,
            vertexShader: `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
            fragmentShader: `
            uniform sampler2D uMap;
            varying vec2 vUv;
            void main() {
              vec4 color = texture2D(uMap, vUv);
              color.a *= 1.0 - smoothstep(0.70, 0.94, vUv.y);
              gl_FragColor = color;
              #include <colorspace_fragment>
            }
          `,
          })
        : new THREE.MeshBasicMaterial({
            map: surface.map,
            alphaTest: 0.45,
            side: THREE.DoubleSide,
            color: light,
            toneMapped: false,
          }),
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'Spatial_Facade_' + data.id;
    // A tiny overlap below the paving hides antialiased cutout margins at the foot.
    mesh.position.set(data.center[0], data.height / 2 - (distant ? 0 : 0.04), data.center[1]);
    mesh.rotation.y = data.yaw;
    mesh.userData.point = data.point;
    mesh.userData.facade = data.id;
    mesh.userData.facadeAlpha = surface.alpha;
    root.add(mesh);
    if (data.point) interactiveWalls.push(mesh);
    if (!distant) walls.push(mesh);
    return mesh;
  }
  for (const facade of spec.facades) painting(facade, art[facade.art]);
  for (const view of spec.distantViews) painting(view, art.street, true);
  const material = createExplorationBackground(
    resources,
    definition,
    art.distance.map,
    art.distance.map,
  );
  const panorama = new THREE.Mesh(resources.track(new THREE.SphereGeometry(70, 32, 16)), material);
  panorama.position.set(...definition.eye);
  panorama.name = 'Painted_Street_Panorama';
  scene.add(panorama);
  const ground = await createSpatialGround(scene, resources, loading, spec.road);
  return { root, ground, panorama, walls, interactiveWalls };
}
