/** A bounded framebuffer and frame rate for small touch devices. Rules never depend on this. */
export function renderQuality({ width, height, pixelRatio = 1, touch = false }) {
  const mobile = touch && Math.min(width, height) <= 768;
  const ratio = Math.min(
    pixelRatio,
    mobile ? 1.25 : 2,
    Math.sqrt((mobile ? 900000 : 8000000) / Math.max(1, width * height)),
  );
  return {
    mobile,
    pixelRatio: Math.max(0.5, ratio),
    fps: mobile ? 30 : 60,
    shadows: !mobile,
    antialias: !mobile,
  };
}

export function deviceRenderQuality() {
  return renderQuality({
    width: innerWidth,
    height: innerHeight,
    pixelRatio: devicePixelRatio,
    touch: matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0,
  });
}

export function createFrameBudget(fps) {
  let next = -Infinity;
  return {
    accepts(now) {
      const interval = 1000 / fps;
      if (now < next - 0.75) return false;
      next = Number.isFinite(next) && now - next < interval ? next + interval : now + interval;
      return true;
    },
  };
}
