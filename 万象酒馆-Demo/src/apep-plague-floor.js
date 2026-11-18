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
  uniform float seed;
  uniform bool preview;
  void main() {
    vec2 p = (fieldUv - 0.5) * 2.0;
    float a = atan(p.y, p.x);
    float shore = length(p) + sin(a * 5.0 + seed) * 0.040 + sin(a * 9.0 - time * 0.7) * 0.025;
    float inner = 1.0 - smoothstep(0.81, 0.96, shore);
    float rim = 1.0 - smoothstep(0.006, 0.035, abs(shore - 0.88));
    float seam = sin(a * 16.0 + sin(shore * 18.0 + seed) * 0.8 - time * 0.2);
    float vein = smoothstep(0.96, 1.0, seam) * smoothstep(0.53, 0.78, shore) * inner;
    float tide = 1.0 - smoothstep(0.012, 0.075, abs(shore - (0.25 + (1.0 - pulse) * 0.62)));
    float sheen = max(rim, vein * 0.52 + tide * pulse * 0.9) * inner;
    if (preview) sheen *= step(0.32, sin(a * 21.0 + seed));
    vec3 ink = vec3(0.085, 0.024, 0.072);
    vec3 ember = mix(vec3(0.76, 0.16, 0.34), vec3(1.0, 0.72, 0.58), pulse * 0.78);
    float fill = preview ? 0.15 : min(0.78, 0.48 + min(age, 7.0) * 0.044);
    gl_FragColor = vec4(mix(ink, ember, sheen),
      presence * inner * (fill + sheen * (preview ? 0.64 : 0.68)));
  }
`;

/** Marks the three physical slots, including empty slots, from the simulated floor state. */
export function createApepPlagueFloor(scene, resources, slots, reduced) {
  const group = new THREE.Group();
  group.name = 'Apep_Plague_Floor';
  group.visible = false;
  const geometry = resources.track(new THREE.PlaneGeometry(3.54, 4.26));
  const uniforms = slots.map((position, slot) => {
    const material = resources.track(
      new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          presence: { value: 0 },
          pulse: { value: 0 },
          age: { value: 0 },
          seed: { value: slot * 3.13 },
          preview: { value: false },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
      }),
    );
    const pool = new THREE.Mesh(geometry, material);
    pool.name = `Apep_Plague_Slot_${slot}`;
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(position.x, 0.295, position.z);
    pool.renderOrder = 2;
    group.add(pool);
    return material.uniforms;
  });
  scene.add(group);
  let field = null;
  let planned = false;
  let starts = [];

  function sync(state, forecast, playing) {
    const current = apepPlague(state);
    const upcoming = playing ? null : apepPlague(forecast.final);
    field = current || upcoming;
    planned = !current && Boolean(upcoming);
    group.visible = Boolean(field) && !['victory', 'defeat'].includes(state.phase);
    if (!group.visible) starts = [];
    update(performance.now());
  }

  function play(event, delay, speed) {
    const interval = event.type === 'sinkingPlague' ? 0 : 65;
    const now = performance.now() + delay / speed;
    starts = uniforms.map((_, index) => now + (interval * index) / speed);
  }

  function update(now) {
    if (!group.visible) return false;
    uniforms.forEach((item, slot) => {
      const since = now - (starts[slot] ?? -Infinity);
      item.time.value = reduced ? 0 : now / 1000;
      item.age.value = field.ages[slot] || 0;
      item.preview.value = planned;
      item.presence.value = since < 0 && item.age.value === 0 ? 0.2 : 1;
      item.pulse.value = reduced || since < 0 ? 0 : Math.max(0, 1 - since / 870);
    });
    return !reduced;
  }

  return { sync, play, update };
}
