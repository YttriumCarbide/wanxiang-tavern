import * as THREE from 'three';
import { apepPlague } from './apep-presentation.js';

const VERTEX = `
  varying vec2 fieldUv;
  void main() {
    fieldUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = `
  varying vec2 fieldUv;
  uniform float time;
  uniform float presence;
  uniform float pulse;
  uniform float age;
  uniform bool preview;

  float sdBox(vec2 p, vec2 b) {
    vec2 d = abs(p) - b;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
  }

  void main() {
    vec2 p = (fieldUv - 0.5) * 2.0;
    float outerBox = sdBox(p, vec2(0.985, 0.985));
    float a = atan(p.y, p.x);
    float r = length(p * vec2(1.0, 0.92));
    float creep = sin(a * 16.0 + time * 1.1) * 0.015 + sin(a * 31.0 - time * 1.7) * 0.009;
    float outerFade = 1.0 - smoothstep(-0.05, 0.025, outerBox + creep);
    if (outerFade <= 0.002) discard;

    float edgeWeight = smoothstep(-0.88, -0.02, outerBox);
    vec2 warp = p + 0.085 * vec2(sin(p.y * 5.2 + time * 0.85), cos(p.x * 4.8 - time * 0.72));
    float webA = pow(
      max(0.0, 1.0 - abs(sin(warp.x * 11.0 + cos(warp.y * 9.0 + time * 0.55) * 1.65))),
      8.0
    );
    float webB = pow(
      max(0.0, 1.0 - abs(sin(a * 14.0 + r * 8.5 - time * 0.95))),
      7.0
    ) * smoothstep(0.10, 0.92, r);
    float vein = clamp(webA * 0.8 + webB * 0.9, 0.0, 1.0);

    float rim = 1.0 - smoothstep(0.0, 0.045, abs(outerBox + creep + 0.032));
    float ripple = pow(max(0.0, sin(-outerBox * 26.0 - time * 2.4)), 4.0) * (0.28 + 0.72 * edgeWeight);
    float surgeBand = abs(outerBox + mix(0.95, 0.04, 1.0 - pulse));
    float surge = (1.0 - smoothstep(0.0, 0.14, surgeBand)) * pulse;

    float eyeCluster = abs(sin(p.x * 4.2 + 0.5) * sin(p.y * 3.6 - 0.3));
    float eyePulse = smoothstep(0.76, 0.95, eyeCluster * (0.65 + 0.35 * sin(time * 1.6 + a * 3.0)));
    float slit = smoothstep(0.22, 0.7, abs(sin(p.x * 22.0 + time * 0.8)));
    float eyeGlow = eyePulse * slit * (0.48 + 0.52 * edgeWeight);

    float sheen = clamp(rim * 0.82 + vein * 0.76 + ripple * 0.24 + eyeGlow * 0.95 + surge * 1.15, 0.0, 1.0);
    if (preview) sheen *= step(0.12, sin(a * 20.0 + time * 1.2));

    vec3 ink = mix(vec3(0.025, 0.005, 0.036), vec3(0.095, 0.014, 0.068), edgeWeight * 0.7 + ripple * 0.3);
    vec3 crimson = mix(
      vec3(0.46, 0.05, 0.22),
      vec3(0.96, 0.24, 0.36),
      clamp(pulse * 0.55 + vein * 0.45, 0.0, 1.0)
    );
    crimson = mix(crimson, vec3(1.0, 0.48, 0.28), eyeGlow * 0.75 + surge * 0.35);
    vec3 color = mix(ink, crimson, sheen);

    float ageBoost = min(age, 8.0) * 0.038;
    float baseFill = preview ? (0.24 + edgeWeight * 0.24) : (0.52 + edgeWeight * 0.4 + ageBoost);
    float alpha = presence * outerFade * clamp(baseFill + sheen * (preview ? 0.34 : 0.46), 0.0, 0.96);
    gl_FragColor = vec4(color, alpha);
  }
`;

function makeTentacleGeo(resources, points, baseRadius, tubularSegs = 14, radialSegs = 6) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const geo = new THREE.TubeGeometry(curve, tubularSegs, baseRadius, radialSegs, false);
  const pos = geo.attributes.position;
  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const center = curve.getPointAt(t);
    const taper = Math.max(0.12, 1 - t * 0.86);
    for (let j = 0; j <= radialSegs; j++) {
      const idx = i * (radialSegs + 1) + j;
      if (idx >= pos.count) continue;
      pos.setXYZ(
        idx,
        center.x + (pos.getX(idx) - center.x) * taper,
        center.y + (pos.getY(idx) - center.y) * taper,
        center.z + (pos.getZ(idx) - center.z) * taper,
      );
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return resources.track(geo);
}

/** Builds 3D full-board psychic corruption veil & writhing perimeter tentacles. */
export function createApepPlagueFloor(scene, resources, _slots, reduced) {
  const group = new THREE.Group();
  group.name = 'Apep_Plague_Floor';
  group.visible = false;

  const halfW = 6.22;
  const halfD = 5.22;
  const uniforms = {
    time: { value: 0 },
    presence: { value: 0 },
    pulse: { value: 0 },
    age: { value: 0 },
    preview: { value: false },
  };

  // Must remain group.children[0] so tests & sync inspect uniforms directly.
  const veilGeo = resources.track(new THREE.PlaneGeometry(halfW * 2.04, halfD * 2.04));
  const veilMat = resources.track(
    new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
    }),
  );
  const veil = new THREE.Mesh(veilGeo, veilMat);
  veil.name = 'Apep_Plague_Perimeter_Veil';
  veil.rotation.x = -Math.PI / 2;
  veil.position.set(0, 0.275, 0);
  veil.renderOrder = 2;
  group.add(veil);

  const obsidianMat = resources.track(
    new THREE.MeshStandardMaterial({
      color: '#160718',
      roughness: 0.38,
      metalness: 0.22,
      emissive: '#520b2d',
      emissiveIntensity: 0.58,
    }),
  );
  const veinMat = resources.track(
    new THREE.MeshStandardMaterial({
      color: '#340b20',
      roughness: 0.32,
      metalness: 0.16,
      emissive: '#8a1840',
      emissiveIntensity: 0.72,
    }),
  );
  const glowMat = resources.track(
    new THREE.MeshStandardMaterial({
      color: '#d93260',
      roughness: 0.22,
      metalness: 0.1,
      emissive: '#ff3a68',
      emissiveIntensity: 1.35,
    }),
  );

  // Perimeter curb ribs bounding the entire central stone battle board.
  const railHGeo = resources.track(new THREE.BoxGeometry(halfW * 2.02, 0.1, 0.18));
  const railVGeo = resources.track(new THREE.BoxGeometry(0.18, 0.1, halfD * 2.02));
  const borderSpecs = [
    ['Apep_Plague_Border_North', railHGeo, [0, 0.28, -halfD]],
    ['Apep_Plague_Border_South', railHGeo, [0, 0.28, halfD]],
    ['Apep_Plague_Border_West', railVGeo, [-halfW, 0.28, 0]],
    ['Apep_Plague_Border_East', railVGeo, [halfW, 0.28, 0]],
  ];
  for (const [name, geo, [x, y, z]] of borderSpecs) {
    const rail = new THREE.Mesh(geo, obsidianMat);
    rail.name = name;
    rail.position.set(x, y, z);
    group.add(rail);
  }

  // Four shared curved tentacle geometries + tracked abyssal eye/sucker nodes.
  const tentacleVariants = [
    makeTentacleGeo(
      resources,
      [
        [0, 0, 0],
        [0.12, 0.64, 0.24],
        [-0.18, 1.28, 0.58],
        [0.16, 1.78, 0.42],
        [0.32, 2.08, 0.05],
      ],
      0.23,
    ),
    makeTentacleGeo(
      resources,
      [
        [0, 0, 0],
        [-0.16, 0.52, 0.34],
        [0.2, 1.08, 0.72],
        [-0.12, 1.54, 0.96],
        [-0.34, 1.66, 0.72],
      ],
      0.21,
    ),
    makeTentacleGeo(
      resources,
      [
        [0, 0, 0],
        [0.14, 0.26, 0.46],
        [-0.22, 0.48, 1.05],
        [0.18, 0.58, 1.54],
        [0.34, 0.4, 1.86],
      ],
      0.19,
    ),
  ];
  const subTendrilGeo = makeTentacleGeo(
    resources,
    [
      [0, 0, 0],
      [0.15, 0.38, 0.2],
      [-0.08, 0.82, 0.44],
      [0.18, 1.16, 0.26],
    ],
    0.11,
    10,
    5,
  );
  const cornerTowerGeo = makeTentacleGeo(
    resources,
    [
      [0, 0, 0],
      [0.28, 0.92, 0.28],
      [-0.22, 1.85, 0.68],
      [0.3, 2.52, 0.46],
      [-0.08, 3.04, -0.12],
    ],
    0.27,
    16,
    6,
  );

  const eyeGeo = resources.track(new THREE.SphereGeometry(0.085, 8, 6));
  const suckerGeo = resources.track(new THREE.SphereGeometry(0.055, 6, 5));
  const sigilGeo = resources.track(new THREE.OctahedronGeometry(0.135, 0));

  const floaters = [];
  const tentacles = [];

  const tentacleAnchors = [
    // North rim (4)
    [-4.35, -halfD + 0.06, 0.25, 0],
    [-1.48, -halfD + 0.06, -0.2, 0],
    [1.48, -halfD + 0.06, 0.2, 0],
    [4.35, -halfD + 0.06, -0.25, 0],
    // South rim (4)
    [-4.35, halfD - 0.06, -0.25, Math.PI],
    [-1.48, halfD - 0.06, 0.2, Math.PI],
    [1.48, halfD - 0.06, -0.2, Math.PI],
    [4.35, halfD - 0.06, 0.25, Math.PI],
    // West rim (4)
    [-halfW + 0.06, -3.25, 0.3, Math.PI * 0.5],
    [-halfW + 0.06, -1.08, -0.18, Math.PI * 0.5],
    [-halfW + 0.06, 1.08, 0.18, Math.PI * 0.5],
    [-halfW + 0.06, 3.25, -0.3, Math.PI * 0.5],
    // East rim (4)
    [halfW - 0.06, -3.25, -0.3, -Math.PI * 0.5],
    [halfW - 0.06, -1.08, 0.18, -Math.PI * 0.5],
    [halfW - 0.06, 1.08, -0.18, -Math.PI * 0.5],
    [halfW - 0.06, 3.25, 0.3, -Math.PI * 0.5],
  ];

  tentacleAnchors.forEach(([x, z, yawOffset, faceInward], idx) => {
    const anchor = new THREE.Group();
    anchor.name = `Apep_Plague_Tentacle_${idx}`;
    anchor.position.set(x, 0.26, z);
    const baseRotY = faceInward + yawOffset;
    anchor.rotation.y = baseRotY;

    const mainMesh = new THREE.Mesh(tentacleVariants[idx % tentacleVariants.length], obsidianMat);
    anchor.add(mainMesh);

    const whip = new THREE.Mesh(subTendrilGeo, veinMat);
    whip.position.set(idx % 2 === 0 ? 0.18 : -0.18, 0.02, 0.06);
    whip.rotation.y = idx % 2 === 0 ? -0.55 : 0.55;
    whip.rotation.z = idx % 2 === 0 ? -0.18 : 0.18;
    anchor.add(whip);

    const suckerPts = [
      [0.06, 0.52, 0.22],
      [-0.08, 0.96, 0.44],
    ];
    for (const [sx, sy, sz] of suckerPts) {
      const sucker = new THREE.Mesh(suckerGeo, glowMat);
      sucker.position.set(sx, sy, sz);
      anchor.add(sucker);
    }

    const eye = new THREE.Mesh(idx % 3 === 0 ? sigilGeo : eyeGeo, glowMat);
    eye.name = `Apep_Plague_EyeSigil_${idx}`;
    const baseY = idx % 3 === 2 ? 0.78 : 1.05;
    eye.position.set(0, baseY, 0.22);
    anchor.add(eye);
    floaters.push({ mesh: eye, baseY, phase: idx * 0.72 });

    tentacles.push({
      mesh: anchor,
      baseRotY,
      phase: idx * 0.65,
      amp: 0.12 + (idx % 3) * 0.03,
    });
    group.add(anchor);
  });

  // Towering corner tentacle spires anchoring all 4 vertices of the central board.
  const corners = [
    [-halfW + 0.08, -halfD + 0.08, Math.PI * 0.25],
    [halfW - 0.08, -halfD + 0.08, -Math.PI * 0.25],
    [-halfW + 0.08, halfD - 0.08, Math.PI * 0.75],
    [halfW - 0.08, halfD - 0.08, -Math.PI * 0.75],
  ];
  corners.forEach(([cx, cz, inwardYaw], idx) => {
    const corner = new THREE.Group();
    corner.name = `Apep_Plague_Corner_${idx}`;
    corner.position.set(cx, 0.26, cz);
    corner.rotation.y = inwardYaw;

    corner.add(new THREE.Mesh(cornerTowerGeo, obsidianMat));

    const sideWhip = new THREE.Mesh(tentacleVariants[idx % 2], veinMat);
    sideWhip.rotation.y = 0.65;
    sideWhip.scale.setScalar(0.88);
    corner.add(sideWhip);

    const orb = new THREE.Mesh(sigilGeo, glowMat);
    orb.position.set(0.06, 1.85, 0.34);
    corner.add(orb);
    floaters.push({ mesh: orb, baseY: 1.85, phase: idx * 1.15 + 0.4 });

    tentacles.push({ mesh: corner, baseRotY: inwardYaw, phase: idx * 1.4, amp: 0.09 });
    group.add(corner);
  });

  scene.add(group);
  let field = null;
  let planned = false;
  let pulseStart = -Infinity;

  function sync(state, forecast, playing) {
    const current = apepPlague(state);
    const upcoming = playing ? null : apepPlague(forecast.final);
    field = current || upcoming;
    planned = !current && Boolean(upcoming);
    group.visible = Boolean(field) && !['victory', 'defeat'].includes(state.phase);
    if (!group.visible) pulseStart = -Infinity;
    update(performance.now());
  }

  function play(event, delay, speed) {
    const offset = event?.type === 'sinkingPlague' ? 0 : 40;
    pulseStart = performance.now() + (delay + offset) / Math.max(0.5, speed || 1);
  }

  function update(now) {
    if (!group.visible || !field) return false;
    const t = reduced ? 0 : now / 1000;
    const since = now - pulseStart;
    const pulse = reduced || since < 0 ? 0 : Math.max(0, 1 - since / 920);
    const maxAge = Math.max(0, ...(field.ages || [0]));
    uniforms.time.value = t;
    uniforms.age.value = maxAge;
    uniforms.preview.value = planned;
    uniforms.presence.value = planned ? 0.56 : 1;
    uniforms.pulse.value = pulse;

    glowMat.emissiveIntensity = planned
      ? 0.62
      : 1.15 + pulse * 1.65 + Math.min(0.75, maxAge * 0.09);
    obsidianMat.emissiveIntensity = planned ? 0.28 : 0.52 + pulse * 0.65;
    veinMat.emissiveIntensity = planned ? 0.35 : 0.68 + pulse * 0.72;

    for (const tentacle of tentacles) {
      if (reduced) {
        tentacle.mesh.rotation.set(0, tentacle.baseRotY, 0);
        tentacle.mesh.scale.setScalar(planned ? 0.78 : 1);
      } else {
        const wave = Math.sin(t * 1.85 + tentacle.phase);
        const coil = Math.cos(t * 1.35 + tentacle.phase * 1.4);
        const surgeBoost = 1 + pulse * 0.14;
        tentacle.mesh.rotation.x = wave * tentacle.amp;
        tentacle.mesh.rotation.z = coil * tentacle.amp * 0.85;
        tentacle.mesh.rotation.y = tentacle.baseRotY + wave * 0.09;
        const baseScale = planned ? 0.76 : 0.98 * surgeBoost;
        tentacle.mesh.scale.set(baseScale, baseScale + wave * 0.06, baseScale);
      }
    }

    for (const item of floaters) {
      item.mesh.position.y = item.baseY + (reduced ? 0 : Math.sin(t * 2.4 + item.phase) * 0.1);
      item.mesh.rotation.y = reduced ? item.phase : t * 1.55 + item.phase;
      item.mesh.scale.setScalar(planned ? 0.72 : 1.02 + pulse * 0.32);
    }
    return !reduced;
  }

  return { sync, play, update };
}
