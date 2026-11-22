/** Collect owned WebGL resources once, including replaced materials and late loads. */
export function createResourceScope() {
  const resources = new Set();
  const tracked = new WeakSet();
  const bitmaps = new Set();
  const trackedBitmaps = new WeakSet();
  let disposed = false;
  function track(resource) {
    if (!resource?.dispose || tracked.has(resource)) return resource;
    tracked.add(resource);
    const image = resource.isTexture ? resource.image : null;
    if (disposed) resource.dispose();
    else resources.add(resource);
    // GLTF texture variants can share a decoded bitmap across several textures.
    if (
      typeof ImageBitmap === 'function' &&
      image instanceof ImageBitmap &&
      !trackedBitmaps.has(image)
    ) {
      trackedBitmaps.add(image);
      if (disposed) image.close();
      else bitmaps.add(image);
    }
    return resource;
  }
  function material(value) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (!item) continue;
      track(item);
      for (const property of Object.values(item)) if (property?.isTexture) track(property);
      for (const uniform of Object.values(item.uniforms || {}))
        if (uniform?.value?.isTexture) track(uniform.value);
    }
  }
  return {
    track,
    material,
    object(object) {
      object?.traverse((node) => {
        if (node.geometry) track(node.geometry);
        if (node.material) material(node.material);
        if (node.shadow) track(node.shadow);
      });
      return object;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const resource of resources) resource.dispose();
      resources.clear();
      for (const bitmap of bitmaps) bitmap.close();
      bitmaps.clear();
    },
  };
}
