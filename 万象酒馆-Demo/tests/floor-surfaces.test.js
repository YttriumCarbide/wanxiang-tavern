import test from 'node:test';
import assert from 'node:assert/strict';
import { partitionFloorSurfaces } from '../src/floor-surfaces.js';

test('coplanar floor paint is clipped into a disjoint visible union, with later colors on top', () => {
  const surfaces = [
    { x0: 0, x1: 4, z0: 0, z1: 4, y: 0.12, color: 'stone' },
    { x0: 1, x1: 3, z0: 0, z1: 4, y: 0.12, color: 'wear' },
    { x0: 0, x1: 4, z0: 1, z1: 3, y: 0.12, color: 'carving' },
    { x0: 0, x1: 4, z0: 1, z1: 3, y: 0.12, color: 'gold' },
  ];
  const before = structuredClone(surfaces);
  const result = partitionFloorSurfaces(surfaces);
  assert.deepEqual(surfaces, before);
  assert(!result.some((piece) => piece.color === 'carving'));
  assert.equal(
    result.reduce((total, piece) => total + (piece.x1 - piece.x0) * (piece.z1 - piece.z0), 0),
    16,
  );
  assert.equal(
    result
      .filter((piece) => piece.color === 'gold')
      .reduce((total, piece) => total + (piece.x1 - piece.x0) * (piece.z1 - piece.z0), 0),
    8,
  );
  for (let i = 0; i < result.length; i++) {
    for (const other of result.slice(i + 1)) {
      const piece = result[i];
      assert(
        Math.min(piece.x1, other.x1) <= Math.max(piece.x0, other.x0) ||
          Math.min(piece.z1, other.z1) <= Math.max(piece.z0, other.z0),
      );
    }
  }
});

test('separate stone relief heights and touching edges do not get flattened or cut away', () => {
  const surfaces = [
    { x0: -1, x1: 0, z0: -1, z1: 1, y: 0.12 },
    { x0: 0, x1: 1, z0: -1, z1: 1, y: 0.12 },
    { x0: -1, x1: 1, z0: -1, z1: 1, y: 0.135 },
  ];
  assert.equal(partitionFloorSurfaces(surfaces).length, 3);
});
