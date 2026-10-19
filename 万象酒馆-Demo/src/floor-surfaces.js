/** Clip earlier paint below later paint on the same horizontal plane. No depth bias or camera hacks. */
export function partitionFloorSurfaces(surfaces) {
  const cells = new Map();
  const output = [];
  const epsilon = 0.000001;
  function keys(rectangle) {
    const result = [];
    const level = Math.round(rectangle.y * 100000);
    for (let x = Math.floor(rectangle.x0 * 4); x <= Math.floor(rectangle.x1 * 4); x++) {
      for (let z = Math.floor(rectangle.z0 * 4); z <= Math.floor(rectangle.z1 * 4); z++) {
        result.push(`${level}:${x}:${z}`);
      }
    }
    return result;
  }
  function subtract(rectangle, cover) {
    const x0 = Math.max(rectangle.x0, cover.x0);
    const x1 = Math.min(rectangle.x1, cover.x1);
    const z0 = Math.max(rectangle.z0, cover.z0);
    const z1 = Math.min(rectangle.z1, cover.z1);
    if (x1 - x0 <= epsilon || z1 - z0 <= epsilon) return [rectangle];
    return [
      { ...rectangle, x1: x0 },
      { ...rectangle, x0: x1 },
      { ...rectangle, x0, x1, z1: z0 },
      { ...rectangle, x0, x1, z0: z1 },
    ].filter((piece) => piece.x1 - piece.x0 > epsilon && piece.z1 - piece.z0 > epsilon);
  }
  for (const surface of [...surfaces].reverse()) {
    const buckets = keys(surface);
    const covers = new Set(buckets.flatMap((key) => cells.get(key) || []));
    let pieces = [surface];
    for (const cover of covers) {
      pieces = pieces.flatMap((piece) => subtract(piece, cover));
      if (!pieces.length) break;
    }
    output.push(...pieces);
    for (const key of buckets) {
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(surface);
    }
  }
  return output;
}
