/** Collect owned WebGL resources once, including replaced materials and late loads. */
export function createResourceScope() {
  const resources = new Set();
  let disposed = false;
  function track(resource) {
    if (!resource?.dispose || resources.has(resource)) return resource;
    resources.add(resource);
    if (disposed) resource.dispose();
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
    },
  };
}
