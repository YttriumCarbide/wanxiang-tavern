import * as THREE from 'three';

const TAU = Math.PI * 2;
const GOLD = '#f4db9b';

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(a, b, x) {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

function easeOutCubic(t) {
  const u = 1 - clamp01(t);
  return 1 - u * u * u;
}

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('ring-acquisition-vfx: 2d context unavailable');
  return { canvas, ctx };
}

function createSigilTexture(resources, size) {
  const { canvas, ctx } = makeCanvas(size);
  const c = size / 2;
  const s = size / 1024;
  ctx.clearRect(0, 0, size, size);
  ctx.translate(c, c);
  ctx.strokeStyle = GOLD;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(244,219,155,0.55)';
  ctx.shadowBlur = 4 * s;

  const rings = [
    { r: 470, w: 2.6 },
    { r: 430, w: 1.6 },
    { r: 300, w: 2.2 },
    { r: 250, w: 1.5 },
    { r: 150, w: 1.8 },
  ];
  for (const ring of rings) {
    ctx.lineWidth = ring.w * s;
    ctx.beginPath();
    ctx.arc(0, 0, ring.r * s, 0, TAU);
    ctx.stroke();
  }

  // broken arc segments
  ctx.lineWidth = 2.4 * s;
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * TAU + 0.12;
    const a1 = a0 + TAU / 6 - 0.42;
    ctx.beginPath();
    ctx.arc(0, 0, 360 * s, a0, a1);
    ctx.stroke();
  }
  ctx.lineWidth = 1.6 * s;
  for (let i = 0; i < 12; i++) {
    const a0 = (i / 12) * TAU + 0.05;
    const a1 = a0 + TAU / 12 - 0.2;
    ctx.beginPath();
    ctx.arc(0, 0, 200 * s, a0, a1);
    ctx.stroke();
  }

  // 24 tick marks
  ctx.lineWidth = 1.8 * s;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * TAU;
    const r0 = 405 * s;
    const r1 = 445 * s;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    ctx.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    ctx.stroke();
  }

  // two interleaved triangles (hexagram)
  ctx.lineWidth = 2.0 * s;
  for (let tri = 0; tri < 2; tri++) {
    const base = (tri * Math.PI) / 3;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const a = base + (k / 3) * TAU - Math.PI / 2;
      const x = Math.cos(a) * 300 * s;
      const y = Math.sin(a) * 300 * s;
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // inner connecting thin lines
  ctx.lineWidth = 1.5 * s;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 150 * s, Math.sin(a) * 150 * s);
    ctx.lineTo(Math.cos(a) * 250 * s, Math.sin(a) * 250 * s);
    ctx.stroke();
  }

  // 6 diamond star positions
  ctx.lineWidth = 2.0 * s;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU - Math.PI / 2;
    const cx = Math.cos(a) * 300 * s;
    const cy = Math.sin(a) * 300 * s;
    const d = 26 * s;
    ctx.beginPath();
    ctx.moveTo(cx, cy - d);
    ctx.lineTo(cx + d, cy);
    ctx.lineTo(cx, cy + d);
    ctx.lineTo(cx - d, cy);
    ctx.closePath();
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 1;
  texture.needsUpdate = true;
  resources.track(texture);
  return texture;
}

function createGlowTexture(resources, size) {
  const { canvas, ctx } = makeCanvas(size);
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,244,214,0.95)');
  grad.addColorStop(0.45, 'rgba(244,219,155,0.45)');
  grad.addColorStop(0.75, 'rgba(244,219,155,0.12)');
  grad.addColorStop(1, 'rgba(244,219,155,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  resources.track(texture);
  return texture;
}

function createStarTexture(resources, size) {
  const { canvas, ctx } = makeCanvas(size);
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 0, c, c, c);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.2, 'rgba(255,246,220,0.9)');
  grad.addColorStop(0.5, 'rgba(244,219,155,0.25)');
  grad.addColorStop(1, 'rgba(244,219,155,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(255,250,235,0.9)';
  ctx.lineCap = 'round';
  const arm = c * 0.92;
  const w = Math.max(1, size / 128);
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(c - arm, c);
  ctx.lineTo(c + arm, c);
  ctx.moveTo(c, c - arm);
  ctx.lineTo(c, c + arm);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,250,235,0.45)';
  ctx.lineWidth = w * 0.7;
  const d = arm * 0.55;
  ctx.beginPath();
  ctx.moveTo(c - d, c - d);
  ctx.lineTo(c + d, c + d);
  ctx.moveTo(c + d, c - d);
  ctx.lineTo(c - d, c + d);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  resources.track(texture);
  return texture;
}

function createRaysGeometry(resources, accentColor) {
  const count = 12;
  const positions = new Float32Array(count * 3 * 3);
  const colors = new Float32Array(count * 3 * 3);
  const inner = new THREE.Color(0xfff6e0);
  const outer = new THREE.Color(accentColor).multiplyScalar(0.35);
  const halfWidth = 0.045;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * TAU + (i % 3) * 0.07 - 0.05;
    const len = 3 + ((i * 7) % 5) * 0.4;
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const px = -sa * halfWidth;
    const py = ca * halfWidth;
    const base = i * 9;
    positions[base] = px;
    positions[base + 1] = py;
    positions[base + 2] = 0;
    positions[base + 3] = -px;
    positions[base + 4] = -py;
    positions[base + 5] = 0;
    positions[base + 6] = ca * len;
    positions[base + 7] = sa * len;
    positions[base + 8] = 0;
    for (let k = 0; k < 3; k++) {
      const col = k === 2 ? outer : inner;
      colors[base + k * 3] = col.r;
      colors[base + k * 3 + 1] = col.g;
      colors[base + k * 3 + 2] = col.b;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  resources.track(geometry);
  return geometry;
}

function createParticleSystem(resources, count, pixelRatio) {
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const opacities = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const seeds = new Float32Array(count * 4);
  const gold = new THREE.Color(0xfff2cf);
  const accent = new THREE.Color(0xf4db9b);
  for (let i = 0; i < count; i++) {
    const r1 = Math.random();
    const r2 = Math.random();
    const r3 = Math.random();
    const r4 = Math.random();
    seeds[i * 4] = r1;
    seeds[i * 4 + 1] = r2;
    seeds[i * 4 + 2] = r3;
    seeds[i * 4 + 3] = r4;
    const spark = r4 > 0.86;
    sizes[i] = spark ? 8 : 1.5 + r3 * 3.5;
    opacities[i] = 0;
    const mix = r2;
    const col = gold.clone().lerp(accent, mix * 0.6);
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aOpacity', new THREE.BufferAttribute(opacities, 1));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  resources.track(geometry);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
      uTime: { value: 0 },
    },
    vertexShader: `
      attribute float aSize;
      attribute float aOpacity;
      attribute vec4 aSeed;
      varying float vOpacity;
      varying vec3 vColor;
      varying float vSpark;
      uniform float uPixelRatio;
      void main() {
        vOpacity = aOpacity;
        vColor = color;
        vSpark = step(7.0, aSize);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * uPixelRatio * (300.0 / max(0.001, -mv.z));
      }
    `,
    fragmentShader: `
      varying float vOpacity;
      varying vec3 vColor;
      varying float vSpark;
      void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        if (d > 0.5) discard;
        float core = smoothstep(0.5, 0.0, d);
        float glow = pow(core, 2.2);
        float cross = 0.0;
        if (vSpark > 0.5) {
          float ax = smoothstep(0.06, 0.0, abs(uv.x)) * smoothstep(0.5, 0.0, abs(uv.y));
          float ay = smoothstep(0.06, 0.0, abs(uv.y)) * smoothstep(0.5, 0.0, abs(uv.x));
          cross = (ax + ay) * 0.9;
        }
        float a = (glow + cross) * vOpacity;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vColor * (0.8 + glow * 0.6), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
  });
  resources.material(material);
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, geometry, material, seeds, count };
}

function createRibbon(resources, accentColor, phase) {
  const segments = 100;
  const positions = new Float32Array(segments * 3);
  const colors = new Float32Array(segments * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  resources.track(geometry);
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  resources.material(material);
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  return { line, geometry, material, positions, colors, segments, phase, accentColor };
}

export function createRingAcquisitionVfx(scene, resources, accent, mobile = false) {
  const accentColor = new THREE.Color(accent || '#f4db9b');
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const group = new THREE.Group();
  group.position.set(0, 0, 0);
  scene.add(group);

  const sigilSize = mobile ? 512 : 1024;
  const sigilTexture = createSigilTexture(resources, sigilSize);
  const glowTexture = createGlowTexture(resources, 256);
  const starTexture = createStarTexture(resources, 128);

  // Sigil layers
  const sigilMatA = new THREE.MeshBasicMaterial({
    map: sigilTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    opacity: 0,
    color: 0xffffff,
  });
  resources.material(sigilMatA);
  const sigilA = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 5.8), sigilMatA);
  resources.track(sigilA.geometry);
  sigilA.position.set(0, 0, -1.2);
  group.add(sigilA);

  const sigilMatB = new THREE.MeshBasicMaterial({
    map: sigilTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    opacity: 0,
    color: accentColor.clone(),
  });
  resources.material(sigilMatB);
  const sigilB = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), sigilMatB);
  resources.track(sigilB.geometry);
  sigilB.position.set(0, 0, -1.25);
  group.add(sigilB);

  // Core glow sprite
  const coreMat = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    opacity: 0,
    color: 0xfff6e0,
  });
  resources.material(coreMat);
  const core = new THREE.Sprite(coreMat);
  core.position.set(0, 0, -0.9);
  core.scale.setScalar(0.3);
  group.add(core);

  // Backlight sprite
  const backMat = new THREE.SpriteMaterial({
    map: glowTexture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    opacity: 0,
    color: accentColor.clone(),
  });
  resources.material(backMat);
  const back = new THREE.Sprite(backMat);
  back.position.set(0, 0, -1.5);
  back.scale.setScalar(6);
  group.add(back);

  // Rays
  const raysGeo = createRaysGeometry(resources, accentColor);
  const raysMat = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    opacity: 0,
    side: THREE.DoubleSide,
  });
  resources.material(raysMat);
  const rays = new THREE.Mesh(raysGeo, raysMat);
  rays.position.set(0, 0, -1.1);
  group.add(rays);

  // Shock rings
  const shockRings = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.RingGeometry(0.96, 1, 160);
    resources.track(geo);
    const mat = new THREE.MeshBasicMaterial({
      color: i === 0 ? 0xfff6e0 : accentColor.clone(),
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    resources.material(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 0, -1.3 - i * 0.05);
    mesh.scale.setScalar(0.2);
    mesh.visible = false;
    group.add(mesh);
    shockRings.push({ mesh, mat, start: 1.8 + i * 0.14 });
  }

  // Particles
  const particleCount = mobile ? 240 : 480;
  const particles = createParticleSystem(resources, particleCount, pixelRatio);
  particles.points.position.set(0, 0, -1.0);
  group.add(particles.points);

  // Ribbons
  const ribbonA = createRibbon(resources, accentColor, 0);
  const ribbonB = createRibbon(resources, accentColor, Math.PI);
  ribbonA.line.position.set(0, 0, -0.85);
  ribbonB.line.position.set(0, 0, -0.85);
  group.add(ribbonA.line);
  group.add(ribbonB.line);

  // Star sprites
  const stars = [];
  for (let i = 0; i < 6; i++) {
    const mat = new THREE.SpriteMaterial({
      map: starTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      opacity: 0,
      color: 0xfff2cf,
    });
    resources.material(mat);
    const sprite = new THREE.Sprite(mat);
    const a = (i / 6) * TAU - Math.PI / 2;
    sprite.position.set(Math.cos(a) * 2.7, Math.sin(a) * 2.7, -0.7);
    sprite.scale.setScalar(0.55);
    group.add(sprite);
    stars.push({ sprite, mat, index: i });
  }

  const tmpColor = new THREE.Color();
  const tmpColor2 = new THREE.Color();

  function updateParticles(time, reduced) {
    const { geometry, seeds, count } = particles;
    const posAttr = geometry.getAttribute('position');
    const opAttr = geometry.getAttribute('aOpacity');
    const pos = posAttr.array;
    const op = opAttr.array;
    const burstT = 1.8;
    const settleT = 3.5;

    for (let i = 0; i < count; i++) {
      const s0 = seeds[i * 4];
      const s1 = seeds[i * 4 + 1];
      const s2 = seeds[i * 4 + 2];
      const s3 = seeds[i * 4 + 3];
      const idx = i * 3;
      let x;
      let y;
      let z;
      let alpha;

      if (reduced) {
        const ang = s0 * TAU + time * 0.15;
        const rad = 2.0 + s1 * 2.8;
        x = Math.cos(ang) * rad;
        y = Math.sin(ang) * rad * 0.7;
        z = -1.0 + (s2 - 0.5) * 0.6;
        alpha = 0.35 + s3 * 0.35;
      } else if (time < 0.9) {
        const t = clamp01(time / 0.9);
        const ang = s0 * TAU + t * 1.6 + s1 * 0.8;
        const rad = (4.5 - t * 3.2) * (0.6 + s1 * 0.6);
        x = Math.cos(ang) * rad;
        y = Math.sin(ang) * rad * 0.75;
        z = -1.0 + (s2 - 0.5) * 0.8;
        alpha = smoothstep(0, 0.65, time) * (0.4 + s3 * 0.4);
      } else if (time < burstT) {
        const t = (time - 0.9) / 0.9;
        const strand = i % 5;
        const strandOffset = (strand / 5) * TAU;
        const ang = s0 * TAU + t * (5.0 + strand * 0.6) + strandOffset;
        const rad = (4.5 - t * 4.4) * (0.5 + s1 * 0.5);
        x = Math.cos(ang) * rad;
        y = Math.sin(ang) * rad * 0.7;
        z = -1.0 + (s2 - 0.5) * 0.6;
        alpha = 0.5 + t * 0.5;
      } else {
        const dt = time - burstT;
        const dirTheta = s0 * TAU;
        const dirPhi = (s1 - 0.5) * Math.PI * 0.9;
        const speed = 2.5 + s2 * 3.5;
        const dist = (speed * (1 - Math.exp(-dt * 1.6))) / 1.6;
        const planar = s3 > 0.5;
        const cosPhi = Math.cos(dirPhi);
        x = Math.cos(dirTheta) * cosPhi * dist;
        y = Math.sin(dirTheta) * cosPhi * dist * (planar ? 0.85 : 1);
        z = -1.0 + (planar ? (s2 - 0.5) * 0.4 : Math.sin(dirPhi) * dist * 0.6);
        const settle = smoothstep(burstT, settleT, time);
        const drift = 0.15 * Math.sin(time * 0.6 + s0 * TAU);
        x += drift * Math.cos(s1 * TAU);
        y += drift * Math.sin(s1 * TAU);
        const peak = 1.0;
        const settled = 0.3 + s3 * 0.4;
        alpha = peak + (settled - peak) * settle;
        if (dt < 0.15) alpha = Math.min(1, alpha + (0.15 - dt) * 2);
      }

      pos[idx] = x;
      pos[idx + 1] = y;
      pos[idx + 2] = z;
      op[i] = alpha;
    }
    posAttr.needsUpdate = true;
    opAttr.needsUpdate = true;
    particles.material.uniforms.uTime.value = time;
  }

  function updateRibbon(ribbon, time, reduced) {
    const { positions, colors, segments, phase } = ribbon;
    const burstT = 1.8;
    let alpha;
    let radiusScale;
    if (reduced) {
      alpha = 0.5;
      radiusScale = 1;
    } else if (time < burstT) {
      const t = clamp01(time / burstT);
      alpha = 0.15 + t * 0.35;
      radiusScale = 1.4 - t * 0.4;
    } else {
      alpha = 0.5;
      radiusScale = 1;
    }
    const rot = reduced ? time * 0.1 : time * 0.6;
    const baseColor = tmpColor.copy(ribbon.accentColor);
    for (let i = 0; i < segments; i++) {
      const u = i / (segments - 1);
      const ang = u * TAU + rot + phase;
      const rx = 2.2 * radiusScale;
      const ry = 0.7 * radiusScale;
      const x = Math.cos(ang) * rx;
      const y = Math.sin(ang) * ry;
      const z = Math.sin(ang * 2 + phase) * 0.25;
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      const tail = Math.pow(u, 1.6);
      const bright = tail * alpha;
      tmpColor2.copy(baseColor).multiplyScalar(bright);
      colors[i * 3] = tmpColor2.r;
      colors[i * 3 + 1] = tmpColor2.g;
      colors[i * 3 + 2] = tmpColor2.b;
    }
    ribbon.geometry.getAttribute('position').needsUpdate = true;
    ribbon.geometry.getAttribute('color').needsUpdate = true;
  }

  function update(time, reduced = false) {
    const t = Math.max(0, time);

    // Sigil
    if (reduced) {
      sigilMatA.opacity = 0.55;
      sigilMatB.opacity = 0.3;
      sigilA.rotation.z = t * 0.05;
      sigilB.rotation.z = -t * 0.08;
    } else {
      const sigilIn = smoothstep(0, 0.9, t);
      const sigilOut = 1 - smoothstep(3.5, 4.4, t) * 0.55;
      sigilMatA.opacity = sigilIn * sigilOut * 0.85;
      sigilMatB.opacity = sigilIn * sigilOut * 0.35;
      sigilA.rotation.z = t * 0.12;
      sigilB.rotation.z = -t * 0.18;
    }

    // Core glow
    if (reduced) {
      coreMat.opacity = 0.35;
      core.scale.setScalar(1.0);
    } else if (t < 1.8) {
      const charge = smoothstep(0, 1.8, t);
      core.scale.setScalar(0.3 + charge * 1.3);
      coreMat.opacity = 0.2 + charge * 0.6;
    } else {
      const dt = t - 1.8;
      if (dt < 0.5) {
        const k = 1 - dt / 0.5;
        core.scale.setScalar(3.8 * k + 0.5 * (1 - k));
        coreMat.opacity = 0.9 * k + 0.25 * (1 - k);
      } else {
        core.scale.setScalar(0.5);
        coreMat.opacity = 0.25;
      }
    }

    // Backlight
    if (reduced) {
      backMat.opacity = 0.2;
      back.scale.setScalar(7);
    } else {
      const charge = smoothstep(0, 1.8, t);
      back.scale.setScalar(6 + charge * 2);
      backMat.opacity = 0.1 + charge * 0.15;
    }

    // Rays
    if (reduced) {
      raysMat.opacity = 0.05;
      rays.rotation.z = t * 0.05;
    } else if (t < 1.8) {
      raysMat.opacity = 0;
      rays.rotation.z = t * 0.1;
    } else {
      const dt = t - 1.8;
      if (dt < 0.12) {
        raysMat.opacity = 0.65 * (dt / 0.12);
      } else {
        raysMat.opacity = Math.max(0.03, 0.65 - (dt - 0.12) * 0.9);
      }
      rays.rotation.z = t * 0.08;
    }

    // Shock rings
    for (const ring of shockRings) {
      if (reduced) {
        ring.mesh.visible = false;
        continue;
      }
      const dt = t - ring.start;
      if (dt < 0 || dt > 0.9) {
        ring.mesh.visible = false;
        continue;
      }
      ring.mesh.visible = true;
      const p = dt / 0.9;
      const scale = 0.2 + easeOutCubic(p) * 5.3;
      ring.mesh.scale.setScalar(scale);
      ring.mat.opacity = (1 - p) * 0.7;
    }

    // Particles
    updateParticles(t, reduced);

    // Ribbons
    updateRibbon(ribbonA, t, reduced);
    updateRibbon(ribbonB, t, reduced);

    // Stars
    for (const star of stars) {
      const startT = 3.4 + star.index * 0.12;
      if (reduced) {
        star.mat.opacity = 0.7;
        star.sprite.scale.setScalar(0.55);
      } else if (t < startT) {
        star.mat.opacity = 0;
      } else {
        const dt = t - startT;
        const k = smoothstep(0, 0.4, dt);
        star.mat.opacity = k * 0.85;
        const pulse = 0.55 + Math.sin(t * 1.5 + star.index) * 0.05;
        star.sprite.scale.setScalar(pulse);
      }
    }
  }

  return { update };
}
