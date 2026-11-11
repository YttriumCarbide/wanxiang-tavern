import * as THREE from 'three';

/** A small continuous walkable floor; architecture remains in the painted shell. */
export async function createExplorationGround(scene, resources, loading, definition) {
  const spec = definition.ground;
  if (!spec) return null;
  const texture = resources.track(await loading.texture(spec.image));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.anisotropy = 4;
  const positions = [],
    coordinates = [],
    fades = [],
    indices = [];
  const count = 64;
  const tile = spec.tileSize ?? 3.6;
  function radius(angle) {
    const index = (angle / (Math.PI * 2)) * spec.radii.length;
    const start = Math.floor(index) % spec.radii.length;
    return THREE.MathUtils.lerp(
      spec.radii[start],
      spec.radii[(start + 1) % spec.radii.length],
      index - Math.floor(index),
    );
  }
  for (const [ring, opacity] of [
    [0, 1],
    [0.72, 1],
    [1, 0],
  ]) {
    for (let index = 0; index <= count; index++) {
      const angle = (index / count) * Math.PI * 2;
      const distance = radius(angle) * ring;
      const x = Math.sin(angle) * distance;
      const z = -Math.cos(angle) * distance;
      positions.push(x, 0, z);
      coordinates.push(x / tile, -z / tile);
      fades.push(opacity);
    }
  }
  for (let ring = 0; ring < 2; ring++) {
    for (let index = 0; index < count; index++) {
      const a = ring * (count + 1) + index;
      const b = a + count + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geometry = resources.track(new THREE.BufferGeometry());
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(coordinates, 2));
  geometry.setAttribute('fade', new THREE.Float32BufferAttribute(fades, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const material = resources.track(
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
      uniforms: {
        uMap: { value: texture },
        uTint: { value: new THREE.Color(spec.tint || '#ffffff') },
      },
      vertexShader: `
        attribute float fade;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vUv = uv;
          vFade = fade;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uMap;
        uniform vec3 uTint;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vec3 color = texture2D(uMap, vUv).rgb * uTint;
          gl_FragColor = vec4(color, smoothstep(0.0, 1.0, vFade));
          #include <colorspace_fragment>
        }
      `,
    }),
  );
  const ground = new THREE.Mesh(geometry, material);
  ground.name = 'Exploration_Walkable_Ground';
  ground.renderOrder = -1;
  ground.userData.radiusAt = (x, z) => {
    const angle = THREE.MathUtils.euclideanModulo(Math.atan2(x, -z), Math.PI * 2);
    return radius(angle);
  };
  scene.add(ground);
  return ground;
}
