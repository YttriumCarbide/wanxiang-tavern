import * as THREE from 'three';

export function roadClearance(boundary, x, z) {
  let inside = false;
  let distance = Infinity;
  for (let index = 0, previous = boundary.length - 1; index < boundary.length; previous = index++) {
    const [ax, az] = boundary[previous];
    const [bx, bz] = boundary[index];
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    const dx = bx - ax;
    const dz = bz - az;
    const fraction = Math.max(
      0,
      Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)),
    );
    distance = Math.min(distance, Math.hypot(x - ax - fraction * dx, z - az - fraction * dz));
  }
  return inside ? distance : -distance;
}

/** Solid street union, with one world-space UV system right through both junctions. */
export async function createSpatialGround(scene, resources, loading, spec) {
  const shape = new THREE.Shape();
  spec.boundary.forEach(([x, z], index) => (index ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const geometry = resources.track(new THREE.ShapeGeometry(shape));
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let index = 0; index < position.count; index++)
    uv.setXY(index, position.getX(index) / spec.tileSize, -position.getZ(index) / spec.tileSize);
  const texture = resources.track(await loading.texture(spec.image));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.anisotropy = 4;
  const material = resources.track(
    new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      toneMapped: false,
      color: '#e8d4b7',
    }),
  );
  const ground = new THREE.Mesh(geometry, material);
  ground.name = 'Spatial_Street_Road';
  ground.userData.clearanceAt = (x, z) => roadClearance(spec.boundary, x, z);
  scene.add(ground);
  return ground;
}
