/** Rasterize upward static triangles once. Weather never collides with characters or battle data. */
export function createWeatherSurfaces(model, { extent = 13, cell = 0.4 } = {}) {
  const size = Math.ceil((extent * 2) / cell) + 1;
  const heights = new Float32Array(size * size).fill(-Infinity);
  const kinds = new Uint8Array(size * size);
  const collects = new Uint8Array(size * size);
  let triangles = 0;
  model.updateMatrixWorld(true);
  const point = (attribute, index, matrix) => {
    const x = attribute.getX(index),
      y = attribute.getY(index),
      z = attribute.getZ(index);
    return [
      matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
    ];
  };
  model.traverse((mesh) => {
    if (!mesh.isMesh || !mesh.visible) return;
    let ancestor = mesh;
    while (ancestor) {
      if (/Placeholder_|Cloud|Mist|Smoke|Moon|Portal_Void/i.test(ancestor.name)) return;
      ancestor = ancestor.parent;
    }
    const positions = mesh.geometry.attributes.position;
    if (!positions) return;
    const index = mesh.geometry.index;
    const count = index ? index.count : positions.count;
    const materialName = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .map((m) => m?.name || '')
      .join(' ');
    const name = mesh.name + ' ' + materialName;
    const kind = /Lava|Molten|Ember_Channel|Hot_Metal/i.test(name)
      ? 2
      : /Water|Pond|Canal/i.test(name)
        ? 1
        : 0;
    for (let offset = 0; offset < count; offset += 3) {
      const vertices = [0, 1, 2].map((n) =>
        point(positions, index ? index.getX(offset + n) : offset + n, mesh.matrixWorld.elements),
      );
      const [a, b, c] = vertices;
      const area = (b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2]);
      // Box/terrace roofs are horizontal; upright walls and underside faces cannot collect rain.
      if (
        area >= -0.000001 ||
        Math.max(...vertices.map((v) => v[1])) - Math.min(...vertices.map((v) => v[1])) > 0.18
      )
        continue;
      triangles++;
      const x0 = Math.max(0, Math.ceil((Math.min(...vertices.map((v) => v[0])) + extent) / cell));
      const x1 = Math.min(
        size - 1,
        Math.floor((Math.max(...vertices.map((v) => v[0])) + extent) / cell),
      );
      const z0 = Math.max(0, Math.ceil((Math.min(...vertices.map((v) => v[2])) + extent) / cell));
      const z1 = Math.min(
        size - 1,
        Math.floor((Math.max(...vertices.map((v) => v[2])) + extent) / cell),
      );
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const px = x * cell - extent,
            pz = z * cell - extent;
          const u = ((px - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (pz - a[2])) / area;
          const v = ((b[0] - a[0]) * (pz - a[2]) - (px - a[0]) * (b[2] - a[2])) / area;
          if (u < -0.001 || v < -0.001 || u + v > 1.001) continue;
          const y = a[1] + u * (b[1] - a[1]) + v * (c[1] - a[1]);
          const slot = z * size + x;
          if (y > heights[slot]) {
            heights[slot] = y;
            kinds[slot] = kind;
            collects[slot] = /Bedrock/i.test(name) ? 0 : 1;
          }
        }
    }
  });
  function sample(x, z) {
    if (Math.abs(x) > extent || Math.abs(z) > extent)
      return { y: -5, kind: 0, supported: false, collects: false };
    const ix = Math.max(0, Math.min(size - 1, Math.round((x + extent) / cell)));
    const iz = Math.max(0, Math.min(size - 1, Math.round((z + extent) / cell)));
    const index = iz * size + ix;
    const supported = Number.isFinite(heights[index]);
    return {
      y: supported ? heights[index] : -5,
      kind: kinds[index],
      supported,
      collects: Boolean(collects[index]),
    };
  }
  function addBoxes(boxes) {
    for (const box of boxes) {
      const x0 = Math.max(0, Math.ceil((box.x - box.w / 2 + extent) / cell));
      const x1 = Math.min(size - 1, Math.floor((box.x + box.w / 2 + extent) / cell));
      const z0 = Math.max(0, Math.ceil((box.z - box.d / 2 + extent) / cell));
      const z1 = Math.min(size - 1, Math.floor((box.z + box.d / 2 + extent) / cell));
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          const index = z * size + x;
          if (box.y + box.h <= heights[index]) continue;
          heights[index] = box.y + box.h;
          kinds[index] = box.kind || 0;
          collects[index] = 1;
        }
    }
  }
  return { sample, addBoxes, triangles, cells: heights.length };
}
