const SERVICE_PALETTES = Object.freeze({
  temper: Object.freeze({
    core: '#fffce8',
    mid: '#ffd26b',
    outer: '#ff7426',
    ember: '#a6260b',
    steam: '188, 232, 255',
    ring: '255, 214, 128',
  }),
  reforge: Object.freeze({
    core: '#fffdf0',
    mid: '#ffb444',
    outer: '#ff521b',
    ember: '#8f1907',
    steam: '255, 168, 108',
    ring: '255, 146, 62',
  }),
  ascend: Object.freeze({
    core: '#fff9ff',
    mid: '#ffe18c',
    outer: '#c87eff',
    ember: '#6e2fd6',
    steam: '218, 184, 255',
    ring: '226, 174, 255',
  }),
  affix: Object.freeze({
    core: '#effffc',
    mid: '#7cf5e2',
    outer: '#f5be58',
    ember: '#2e88c2',
    steam: '132, 240, 224',
    ring: '116, 238, 222',
  }),
  reroll: Object.freeze({
    core: '#effffc',
    mid: '#7cf5e2',
    outer: '#f5be58',
    ember: '#2e88c2',
    steam: '132, 240, 224',
    ring: '116, 238, 222',
  }),
});

function sparkColor(palette, ratio) {
  if (ratio < 0.24) return palette.core;
  if (ratio < 0.54) return palette.mid;
  if (ratio < 0.82) return palette.outer;
  return palette.ember;
}

/**
 * Tactile Canvas2D forging choreography for the blacksmith anvil stage:
 * ambient hearth embers, pre-hit vortex/rune build-up, dual-strike ballistic
 * sparks with anvil floor bounce, quench steam puffs, shockwaves, and light pillars.
 */
export function createBlacksmithFx(stage) {
  const doc = stage.ownerDocument;
  const win = doc.defaultView;
  let canvas = stage.querySelector('.blacksmith-fx-canvas');
  if (!canvas) {
    canvas = doc.createElement('canvas');
    canvas.className = 'blacksmith-fx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    stage.appendChild(canvas);
  }
  const ctx = canvas.getContext('2d');
  const reduceMotion = win?.matchMedia?.('(prefers-reduced-motion: reduce)');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let active = false;
  let disposed = false;
  let rafId = 0;
  let lastTs = 0;
  let ambientCooldown = 0;
  let sequence = null;

  const sparks = [];
  const convergeMotes = [];
  const rings = [];
  const smokes = [];
  const embers = [];

  function reduced() {
    return Boolean(reduceMotion?.matches);
  }

  function ensureSize() {
    if (disposed || !ctx) return false;
    const w = Math.max(1, stage.clientWidth || 0);
    const h = Math.max(1, stage.clientHeight || 0);
    const nextDpr = Math.min(win?.devicePixelRatio || 1, 2);
    if (w !== width || h !== height || nextDpr !== dpr) {
      width = w;
      height = h;
      dpr = nextDpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    return width > 1 && height > 1;
  }

  function anchorMetrics() {
    const cx = width * 0.5;
    const cy = height * 0.56;
    const floorY = height * 0.88;
    return { cx, cy, floorY };
  }

  function spawnAmbientEmber() {
    if (!width || !height || embers.length >= 16) return;
    embers.push({
      x: width * (0.24 + Math.random() * 0.52),
      y: height * (0.88 + Math.random() * 0.1),
      vx: (Math.random() - 0.5) * 14,
      vy: -(18 + Math.random() * 24),
      size: 1.1 + Math.random() * 1.6,
      life: 0,
      maxLife: 1.4 + Math.random() * 1.3,
      phase: Math.random() * Math.PI * 2,
    });
  }

  function spawnSparkBurst(serviceId, count, speedScale = 1) {
    const { cx, cy } = anchorMetrics();
    const palette = SERVICE_PALETTES[serviceId] || SERVICE_PALETTES.temper;
    for (let i = 0; i < count; i += 1) {
      const sideBias = Math.random();
      const angle =
        sideBias < 0.78
          ? -Math.PI * (0.06 + Math.random() * 0.88)
          : (Math.random() < 0.5 ? 0 : Math.PI) + (Math.random() - 0.5) * 0.45;
      const speed = (130 + Math.random() * 255) * speedScale;
      sparks.push({
        x: cx + (Math.random() - 0.5) * 16,
        y: cy + (Math.random() - 0.5) * 8,
        px: cx,
        py: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 45 * speedScale,
        width: 1.2 + Math.random() * 1.7,
        life: 0,
        maxLife: 0.36 + Math.random() * 0.44,
        palette,
        bounces: 0,
      });
    }
  }

  function spawnConverge(serviceId, count) {
    const { cx, cy } = anchorMetrics();
    const palette = SERVICE_PALETTES[serviceId] || SERVICE_PALETTES.reforge;
    const radiusBase = Math.max(46, Math.min(width, height) * 0.52);
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.35;
      const radius = radiusBase * (0.72 + Math.random() * 0.45);
      convergeMotes.push({
        angle,
        radius,
        startRadius: radius,
        spin: (serviceId === 'reforge' ? 3.8 : 2.9) * (i % 2 === 0 ? 1 : 0.82),
        life: 0,
        maxLife: 0.29 + Math.random() * 0.1,
        cx,
        cy,
        size: 1.8 + Math.random() * 1.8,
        palette,
      });
    }
  }

  function spawnRing(serviceId, maxRadius, strokeWidth) {
    const { cx, cy } = anchorMetrics();
    const palette = SERVICE_PALETTES[serviceId] || SERVICE_PALETTES.temper;
    rings.push({
      x: cx,
      y: cy,
      radius: 10,
      maxRadius,
      width: strokeWidth,
      life: 0,
      maxLife: 0.52,
      rgb: palette.ring,
    });
  }

  function spawnSteam(serviceId, count) {
    const { cx, cy } = anchorMetrics();
    const palette = SERVICE_PALETTES[serviceId] || SERVICE_PALETTES.temper;
    for (let i = 0; i < count; i += 1) {
      smokes.push({
        x: cx + (Math.random() - 0.5) * 44,
        y: cy + 4 + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 26,
        vy: -(28 + Math.random() * 34),
        radius: 10 + Math.random() * 12,
        grow: 24 + Math.random() * 18,
        life: 0,
        maxLife: 0.65 + Math.random() * 0.4,
        rgb: palette.steam,
        alpha: serviceId === 'temper' ? 0.34 : 0.24,
      });
    }
  }

  function drawRuneRing(progress, palette) {
    const { cx, cy } = anchorMetrics();
    const fade = progress < 0.2 ? progress / 0.2 : progress > 0.78 ? (1 - progress) / 0.22 : 1;
    if (fade <= 0) return;
    const radius = Math.min(width, height) * 0.33 * (0.84 + 0.24 * Math.sin(progress * Math.PI));
    const spin = progress * Math.PI * 1.4;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(cx, cy);
    ctx.rotate(spin);
    ctx.strokeStyle = `rgba(${palette.ring}, ${0.82 * fade})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.setLineDash([6, 5]);
    ctx.arc(0, 0, radius * 0.74, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Rotating inscribed hexagon/star sigil
    for (let pass = 0; pass < 2; pass += 1) {
      ctx.save();
      ctx.rotate((pass * Math.PI) / 3);
      ctx.strokeStyle = `rgba(255, 224, 148, ${0.64 * fade})`;
      ctx.lineWidth = 1.15;
      ctx.beginPath();
      for (let i = 0; i <= 3; i += 1) {
        const a = (i * Math.PI * 2) / 3;
        const px = Math.cos(a) * radius * 0.88;
        const py = Math.sin(a) * radius * 0.88;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawAscendPillar(progress) {
    const { cx } = anchorMetrics();
    const fade = progress < 0.18 ? progress / 0.18 : Math.max(0, 1 - (progress - 0.18) / 0.82);
    if (fade <= 0) return;
    const beamHalfW = 24 + 18 * Math.sin(progress * Math.PI);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const grad = ctx.createLinearGradient(cx - beamHalfW, 0, cx + beamHalfW, 0);
    grad.addColorStop(0, 'rgba(182, 120, 255, 0)');
    grad.addColorStop(0.32, `rgba(214, 152, 255, ${0.28 * fade})`);
    grad.addColorStop(0.5, `rgba(255, 240, 186, ${0.62 * fade})`);
    grad.addColorStop(0.68, `rgba(214, 152, 255, ${0.28 * fade})`);
    grad.addColorStop(1, 'rgba(182, 120, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - beamHalfW, 0, beamHalfW * 2, height * 0.92);
    ctx.restore();
  }

  function advanceSequence(dt) {
    if (!sequence) return;
    sequence.elapsed += dt;
    const t = sequence.elapsed;
    const id = sequence.serviceId;
    if (!sequence.hit1 && t >= 0.24) {
      sequence.hit1 = true;
      spawnSparkBurst(id, 46, 0.92);
      spawnRing(id, Math.min(width, height) * 0.56, 2.4);
    }
    if (!sequence.hit2 && t >= 0.6) {
      sequence.hit2 = true;
      spawnSparkBurst(id, 62, 1.15);
      spawnRing(id, Math.min(width, height) * 0.8, 3.2);
      spawnSteam(id, id === 'temper' ? 11 : 7);
    }
    if (t >= sequence.duration) {
      sequence = null;
    }
  }

  function step(ts) {
    rafId = 0;
    if (disposed || !ctx || reduced()) return;
    if (!lastTs) lastTs = ts;
    const dt = Math.min(0.05, Math.max(0.001, (ts - lastTs) / 1000));
    lastTs = ts;
    if (!ensureSize()) return;

    if (active) {
      ambientCooldown -= dt;
      if (ambientCooldown <= 0) {
        spawnAmbientEmber();
        ambientCooldown = 0.14 + Math.random() * 0.16;
      }
    }

    advanceSequence(dt);

    ctx.clearRect(0, 0, width, height);
    const { floorY } = anchorMetrics();

    // Update & render ambient hearth embers
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = embers.length - 1; i >= 0; i -= 1) {
      const e = embers[i];
      e.life += dt;
      if (e.life >= e.maxLife) {
        embers.splice(i, 1);
        continue;
      }
      e.x += (e.vx + Math.sin(e.life * 4 + e.phase) * 9) * dt;
      e.y += e.vy * dt;
      const ratio = e.life / e.maxLife;
      const alpha = Math.sin(ratio * Math.PI) * 0.72;
      ctx.fillStyle = `rgba(255, ${Math.round(145 + 75 * (1 - ratio))}, 58, ${alpha})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Soft smoke / quench steam wisps
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      const s = smokes[i];
      s.life += dt;
      if (s.life >= s.maxLife) {
        smokes.splice(i, 1);
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= Math.pow(0.45, dt);
      const ratio = s.life / s.maxLife;
      const r = s.radius + s.grow * ratio;
      const alpha = s.alpha * Math.sin(ratio * Math.PI);
      const g = ctx.createRadialGradient(s.x, s.y, r * 0.1, s.x, s.y, r);
      g.addColorStop(0, `rgba(${s.rgb}, ${alpha})`);
      g.addColorStop(1, `rgba(${s.rgb}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Sequence overlays (ascension beam or arcane runes)
    if (sequence) {
      const palette = SERVICE_PALETTES[sequence.serviceId] || SERVICE_PALETTES.temper;
      const progress = Math.min(1, sequence.elapsed / sequence.duration);
      if (sequence.serviceId === 'ascend' && sequence.elapsed >= 0.42) {
        drawAscendPillar((sequence.elapsed - 0.42) / (sequence.duration - 0.42));
      } else if (sequence.serviceId === 'affix' || sequence.serviceId === 'reroll') {
        drawRuneRing(progress, palette);
      }
    }

    // Inward melt/rune convergence motes
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = convergeMotes.length - 1; i >= 0; i -= 1) {
      const m = convergeMotes[i];
      m.life += dt;
      if (m.life >= m.maxLife) {
        convergeMotes.splice(i, 1);
        continue;
      }
      const p = m.life / m.maxLife;
      const r = m.startRadius * (1 - p * p);
      m.angle += m.spin * dt;
      const mx = m.cx + Math.cos(m.angle) * r;
      const my = m.cy + Math.sin(m.angle) * r * 0.72;
      ctx.fillStyle = m.palette.mid;
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.92;
      ctx.beginPath();
      ctx.arc(mx, my, m.size * (1 - p * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Expanding shockwave rings
    for (let i = rings.length - 1; i >= 0; i -= 1) {
      const ring = rings[i];
      ring.life += dt;
      if (ring.life >= ring.maxLife) {
        rings.splice(i, 1);
        continue;
      }
      const p = ring.life / ring.maxLife;
      const ease = 1 - Math.pow(1 - p, 3);
      const radius = ring.radius + (ring.maxRadius - ring.radius) * ease;
      const alpha = (1 - p) * 0.86;
      ctx.strokeStyle = `rgba(${ring.rgb}, ${alpha})`;
      ctx.lineWidth = Math.max(0.6, ring.width * (1 - p * 0.78));
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, radius, radius * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Ballistic sparks with velocity streaks and anvil-floor rebound
    ctx.lineCap = 'round';
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const sp = sparks[i];
      sp.life += dt;
      if (sp.life >= sp.maxLife) {
        sparks.splice(i, 1);
        continue;
      }
      sp.px = sp.x;
      sp.py = sp.y;
      sp.vy += 680 * dt;
      sp.vx *= Math.pow(0.32, dt);
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      if (sp.y >= floorY && sp.vy > 0 && sp.bounces < 2) {
        sp.y = floorY;
        sp.vy = -sp.vy * (0.36 + Math.random() * 0.16);
        sp.vx *= 0.8;
        sp.bounces += 1;
      }
      const ratio = sp.life / sp.maxLife;
      ctx.strokeStyle = sparkColor(sp.palette, ratio);
      ctx.globalAlpha = Math.max(0, 1 - ratio * 0.9);
      ctx.lineWidth = sp.width * (1 - ratio * 0.55);
      ctx.beginPath();
      ctx.moveTo(sp.px, sp.py);
      ctx.lineTo(sp.x, sp.y);
      ctx.stroke();
    }
    ctx.restore();

    if (
      active ||
      sequence ||
      sparks.length ||
      convergeMotes.length ||
      rings.length ||
      smokes.length ||
      embers.length
    ) {
      rafId = win.requestAnimationFrame(step);
    } else {
      lastTs = 0;
    }
  }

  function startLoop() {
    if (disposed || !ctx || reduced() || rafId) return;
    lastTs = 0;
    rafId = win.requestAnimationFrame(step);
  }

  function clear() {
    sequence = null;
    sparks.length = 0;
    convergeMotes.length = 0;
    rings.length = 0;
    smokes.length = 0;
    if (ctx && width && height) ctx.clearRect(0, 0, width, height);
  }

  function setActive(open) {
    active = Boolean(open);
    if (active) {
      ensureSize();
      startLoop();
    } else {
      clear();
      embers.length = 0;
      if (rafId) {
        win.cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }
  }

  function trigger(serviceId) {
    if (disposed || reduced()) return;
    ensureSize();
    sparks.length = 0;
    convergeMotes.length = 0;
    rings.length = 0;
    smokes.length = 0;
    sequence = {
      serviceId,
      elapsed: 0,
      duration: 1.55,
      hit1: false,
      hit2: false,
    };
    if (serviceId === 'reforge' || serviceId === 'affix' || serviceId === 'reroll') {
      spawnConverge(serviceId, 28);
    } else {
      spawnSparkBurst(serviceId, 16, 0.58);
    }
    startLoop();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    active = false;
    clear();
    embers.length = 0;
    if (rafId) {
      win.cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }

  return { trigger, setActive, clear, dispose };
}
