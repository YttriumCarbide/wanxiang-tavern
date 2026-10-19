import * as THREE from 'three';
import { partitionFloorSurfaces } from './floor-surfaces.js';

/** The authored floor paint contains overlapping box tops; rebuild their visible union once. */
export function stabilizeFloorGeometry(model, resources) {
  const surfaces = [];
  const floors = [];
  model.traverse((node) => {
    if (!node.isMesh || !/Floor|Halves|Ground|Tile|Mortar/i.test(node.name)) return;
    const geometry = node.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const color = geometry.getAttribute('color');
    if (!geometry.index || !normal || geometry.getAttribute('uv') || geometry.groups.length) return;
    const floor = { node, geometry, position, normal, color, tops: new Set(), pieces: [] };
    for (let offset = 0; offset + 5 < geometry.index.count; offset += 6) {
      const ids = Array.from({ length: 6 }, (_, i) => geometry.index.getX(offset + i));
      if (new Set(ids).size !== 4 || ids.some((id) => normal.getY(id) < 0.999)) continue;
      const xs = ids.map((id) => position.getX(id));
      const ys = ids.map((id) => position.getY(id));
      const zs = ids.map((id) => position.getZ(id));
      if (Math.max(...ys) - Math.min(...ys) > 0.000001) continue;
      floor.tops.add(offset);
      floor.tops.add(offset + 3);
      surfaces.push({
        x0: Math.min(...xs),
        x1: Math.max(...xs),
        z0: Math.min(...zs),
        z1: Math.max(...zs),
        y: ys[0],
        color: color ? [color.getX(ids[0]), color.getY(ids[0]), color.getZ(ids[0])] : null,
        floor,
      });
    }
    if (floor.tops.size) floors.push(floor);
  });
  const visible = partitionFloorSurfaces(surfaces);
  for (const surface of visible) surface.floor.pieces.push(surface);
  for (const floor of floors) {
    const positions = [],
      normals = [],
      colors = [];
    for (let offset = 0; offset < floor.geometry.index.count; offset += 3) {
      if (floor.tops.has(offset)) continue;
      for (let i = 0; i < 3; i++) {
        const id = floor.geometry.index.getX(offset + i);
        positions.push(floor.position.getX(id), floor.position.getY(id), floor.position.getZ(id));
        normals.push(floor.normal.getX(id), floor.normal.getY(id), floor.normal.getZ(id));
        if (floor.color)
          colors.push(floor.color.getX(id), floor.color.getY(id), floor.color.getZ(id));
      }
    }
    for (const piece of floor.pieces) {
      const { x0, x1, z0, z1, y, color } = piece;
      positions.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
      for (let i = 0; i < 6; i++) {
        normals.push(0, 1, 0);
        if (color) colors.push(...color);
      }
    }
    const geometry = resources.track(new THREE.BufferGeometry());
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    if (floor.color) geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    resources.track(floor.geometry);
    floor.node.geometry = geometry;
  }
  const area = (surface) => (surface.x1 - surface.x0) * (surface.z1 - surface.z0);
  return {
    originalTops: surfaces.length,
    visibleTops: visible.length,
    stabilizedMeshes: floors.length,
    hiddenCoplanarArea:
      surfaces.reduce((total, surface) => total + area(surface), 0) -
      visible.reduce((total, surface) => total + area(surface), 0),
  };
}
