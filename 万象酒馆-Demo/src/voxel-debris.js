/** Cosmetic seeded geometry; these values never enter the battle simulation. */
export function debrisRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

/** Chisel different solids: a slab, corner, rib, wedge, fork and broken arch. */
export function debrisShape(index, random) {
  const width = 4 + Math.floor(random() * 3);
  const depth = 3 + Math.floor(random() * 3);
  const height = 3 + Math.floor(random() * 3);
  const cells = [];
  const kind = index % 6;
  for (let x = 0; x < width; x++)
    for (let y = 0; y < height; y++)
      for (let z = 0; z < depth; z++) {
        const shapes = [
          y < 2 && x + z < width + depth - 2,
          (x < 2 || z < 2) && y < height - (x + z > width ? 1 : 0),
          z < 2 && (x < 2 || y < 2 || (x === width - 1 && y < height - 1)),
          y <= (x / width) * height && z < depth - (x % 2),
          y < 2 || (x < 2 && z < 2) || (x >= width - 2 && z >= depth - 2 && y < height - 1),
          z < 2 && (x < 2 || x >= width - 2 || y >= height - 2),
        ];
        if (!shapes[kind]) continue;
        // Missing corners chip the silhouette; the broad connected core stays intact.
        const edge = (x === 0 || x === width - 1) && (z === 0 || z === depth - 1);
        if (edge && y > 0 && random() < 0.65) continue;
        cells.push([x, y, z]);
      }
  const mirror = random() < 0.5;
  const voxels = cells.map(([x, y, z]) => [mirror ? width - 1 - x : x, y, z]);
  return {
    cells: voxels,
    width,
    depth,
    height,
    unit: 0.075 + random() * 0.025,
    signature: voxels
      .map((cell) => cell.join(','))
      .sort()
      .join(';'),
  };
}
