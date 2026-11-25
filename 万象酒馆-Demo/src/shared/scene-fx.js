const MOOD_PALETTES = Object.freeze({
  warm: '246, 206, 130',
  candle: '246, 206, 130',
  dusk: '168, 214, 250',
  star: '216, 234, 255',
  alley: '158, 188, 198',
});

/** Ambient dust motes, Tyndall beams and drift FX for city backdrops and the Gal stage. */
export function createParticleFx(canvas, { count = 26, subtle = false } = {}) {
  if (!canvas || typeof canvas.getContext !== 'function') {
    return {
      setMood() {},
      setActive() {},
      dispose() {},
    };
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return {
      setMood() {},
      setActive() {},
      dispose() {},
    };
  }
  const reduceMotion = () =>
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mood = 'warm';
  let active = false;
  let disposed = false;
  let rafId = 0;

  const particles = Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 1.2 + Math.random() * (subtle ? 1.8 : 3.2),
    vx: (Math.random() - 0.5) * 0.0003,
    vy: -0.00018 - Math.random() * 0.00035,
    phase: Math.random() * Math.PI * 2,
    alpha: 0.25 + Math.random() * 0.55,
  }));

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    const targetW = Math.max(1, Math.floor(width * dpr));
    const targetH = Math.max(1, Math.floor(height * dpr));
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  }

  function drawAtmosphericLayer(ts, width, height) {
    if (subtle) return;
    if (mood === 'candle') {
      ctx.save();
      for (let index = 0; index < 3; index++) {
        const bx = width * (0.14 + index * 0.16);
        const grad = ctx.createLinearGradient(bx, 0, bx + width * 0.26, height * 0.88);
        grad.addColorStop(0, 'rgba(246, 200, 120, 0.09)');
        grad.addColorStop(1, 'rgba(246, 200, 120, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(bx, 0);
        ctx.lineTo(bx + width * 0.08, 0);
        ctx.lineTo(bx + width * 0.34, height);
        ctx.lineTo(bx + width * 0.14, height);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    if (mood === 'dusk') {
      ctx.save();
      ctx.strokeStyle = 'rgba(130, 188, 236, 0.12)';
      ctx.lineWidth = 1.5;
      for (let index = 0; index < 4; index++) {
        const sy = height * (0.56 + index * 0.06);
        const sx = ((ts * 0.02 + index * 180) % (width + 200)) - 140;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 110, sy);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }
    if (mood === 'alley') {
      const fog = ctx.createLinearGradient(0, height * 0.55, 0, height);
      fog.addColorStop(0, 'rgba(92, 132, 146, 0)');
      fog.addColorStop(1, 'rgba(24, 38, 46, 0.36)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, height * 0.55, width, height * 0.45);
    }
  }

  function frame(ts) {
    rafId = 0;
    if (disposed || !active || reduceMotion()) return;
    resize();
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    drawAtmosphericLayer(ts, width, height);
    const palette = MOOD_PALETTES[mood] || MOOD_PALETTES.warm;
    for (const particle of particles) {
      const dirY =
        mood === 'star'
          ? Math.abs(particle.vy) * 0.9
          : mood === 'alley'
            ? particle.vy * 0.4
            : particle.vy;
      const dirX = mood === 'dusk' ? 0.00028 : mood === 'alley' ? 0.00035 : particle.vx;
      particle.x = (particle.x + dirX + 1) % 1;
      particle.y = (particle.y + dirY + 1) % 1;
      const pulse = 0.55 + 0.45 * Math.sin(ts * 0.0018 + particle.phase);
      const alpha = particle.alpha * pulse * (subtle ? 0.45 : 0.85);
      const px = particle.x * width;
      const py = particle.y * height;
      const radius = particle.r * (subtle ? 1.4 : 2.6);
      const radial = ctx.createRadialGradient(px, py, 0, px, py, radius * 2.2);
      radial.addColorStop(0, `rgba(${palette}, ${alpha.toFixed(3)})`);
      radial.addColorStop(1, `rgba(${palette}, 0)`);
      ctx.fillStyle = radial;
      ctx.beginPath();
      ctx.arc(px, py, radius * 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    rafId = requestAnimationFrame(frame);
  }

  function syncLoop() {
    if (disposed || !active || reduceMotion()) {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      if (!active) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (!rafId) rafId = requestAnimationFrame(frame);
  }

  return {
    setMood(next) {
      mood = next || 'warm';
    },
    setActive(flag) {
      const next = Boolean(flag);
      if (next === active) return;
      active = next;
      syncLoop();
    },
    dispose() {
      disposed = true;
      active = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
  };
}
