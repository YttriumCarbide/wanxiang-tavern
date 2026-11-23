import * as THREE from 'three';
import { createEmblemRing, RING_DESIGNS } from '../emblem-rings.js';
import { createResourceScope } from '../shared/resources.js';
import { deviceRenderQuality } from '../shared/render-budget.js';
import { createRingAcquisitionVfx } from './ring-acquisition-vfx.js';

const FINAL_ROTATION = Object.freeze([0.65, 0.35, -0.16]);
const FINAL_SCALE = 1;
const START_SCALE = 0.24;
const START_Y = -0.42;
const START_YAW = Math.PI * 0.92;
const REVEAL_START = 1.8;
const REVEAL_END = 3.5;
const TARGET_HEIGHT = 0.42;

function smoothstep(t) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function easeOutCubic(t) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return 1 - Math.pow(1 - x, 3);
}

function buildStudio(scope) {
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#1b2230');
  const panels = [
    [[-3, 3, 2], [2.2, 5], '#fff2da'],
    [[3, 1, 2], [1, 4], '#adcfff'],
    [[0, 4, -1], [4, 2], '#ffffff'],
    [[0, -2, 3], [3, 1], '#776955'],
  ];
  for (const [position, size, color] of panels) {
    const geometry = scope.track(new THREE.PlaneGeometry(size[0], size[1]));
    const material = scope.track(new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    const light = new THREE.Mesh(geometry, material);
    light.position.fromArray(position);
    light.lookAt(0, 0, 0);
    studio.add(light);
  }
  return studio;
}

export function createRingAcquisitionStage(canvas, id) {
  if (!canvas) throw new Error('Ring acquisition stage requires a canvas');
  if (!RING_DESIGNS[id]) throw new Error('Unknown emblem ring: ' + id);

  const scope = createResourceScope();
  let renderer = null;
  let disposed = false;
  let pmrem = null;
  let ring = null;
  let effects = null;
  let scene = null;
  let camera = null;
  let ringHeight = 1;
  let ringWidth = 1;
  let baseDistance = 6.5;

  try {
    const quality = deviceRenderQuality();
    const desktop = !quality.mobile;
    const pixelRatio = Math.min(quality.pixelRatio, desktop ? 1.5 : quality.pixelRatio);

    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: quality.antialias,
      powerPreference: 'high-performance',
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setPixelRatio(pixelRatio);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40);
    camera.position.set(0, 0.5, baseDistance);
    camera.lookAt(0, -0.45, 0);

    const studio = buildStudio(scope);
    pmrem = new THREE.PMREMGenerator(renderer);
    const environment = scope.track(pmrem.fromScene(studio, 0.035));
    pmrem.dispose();
    pmrem = null;
    scene.environment = environment.texture;
    scene.environmentIntensity = 1.35;

    const hemi = new THREE.HemisphereLight('#d8e6ff', '#32261c', 2);
    scene.add(hemi);
    const key = new THREE.DirectionalLight('#fff2d6', 4);
    key.position.set(-3, 5, 5);
    scene.add(key);
    const rim = new THREE.DirectionalLight('#91bcff', 3);
    rim.position.set(3, 2, -3);
    scene.add(rim);

    ring = scope.object(createEmblemRing(id));
    ring.rotation.set(...FINAL_ROTATION);
    scene.add(ring);
    effects = createRingAcquisitionVfx(scene, scope, RING_DESIGNS[id].color, quality.mobile);

    const bounds = new THREE.Box3().setFromObject(ring);
    const size = new THREE.Vector3();
    bounds.getSize(size);
    ringHeight = Math.max(0.0001, size.y);
    ringWidth = Math.max(0.0001, size.x);

    resize();
  } catch (error) {
    if (pmrem) pmrem.dispose();
    scope.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
    }
    throw error;
  }

  function fitCamera(width, height) {
    const aspect = width / Math.max(1, height);
    camera.aspect = aspect;
    const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
    const visibleHeight = ringHeight / TARGET_HEIGHT;
    const distanceForHeight = visibleHeight / (2 * Math.tan(halfFov));
    const distanceForWidth = ringWidth / (TARGET_HEIGHT * aspect * 2 * Math.tan(halfFov));
    baseDistance = Math.max(distanceForHeight, distanceForWidth);
    camera.position.set(0, 0.5, baseDistance);
    camera.lookAt(0, -0.45, 0);
    camera.updateProjectionMatrix();
  }

  function resize() {
    if (disposed || !renderer || !camera) return;
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width));
    const height = Math.max(1, Math.round(rect.height));
    renderer.setPixelRatio(Math.min(deviceRenderQuality().pixelRatio, 1.5));
    renderer.setSize(width, height, false);
    fitCamera(width, height);
  }

  function applyTransform(elapsed, reduced) {
    ring.visible = reduced || elapsed >= REVEAL_START;
    if (reduced) {
      ring.scale.setScalar(FINAL_SCALE);
      ring.position.set(0, 0, 0);
      ring.rotation.set(...FINAL_ROTATION);
      return;
    }
    if (elapsed < REVEAL_START) {
      ring.scale.setScalar(START_SCALE);
      ring.position.set(0, START_Y, 0);
      ring.rotation.set(FINAL_ROTATION[0], START_YAW, FINAL_ROTATION[2]);
      return;
    }
    if (elapsed < REVEAL_END) {
      const t = (elapsed - REVEAL_START) / (REVEAL_END - REVEAL_START);
      const eased = smoothstep(t);
      const rise = easeOutCubic(t);
      const scale = THREE.MathUtils.lerp(START_SCALE, FINAL_SCALE, eased);
      const y = THREE.MathUtils.lerp(START_Y, 0, rise);
      const yaw = THREE.MathUtils.lerp(START_YAW, FINAL_ROTATION[1], eased);
      ring.scale.setScalar(scale);
      ring.position.set(0, y, 0);
      ring.rotation.set(FINAL_ROTATION[0], yaw, FINAL_ROTATION[2]);
      return;
    }
    const settle = elapsed - REVEAL_END;
    const float = Math.sin(settle * 0.9) * 0.012;
    const sway = Math.sin(settle * 0.55) * 0.05;
    ring.scale.setScalar(FINAL_SCALE);
    ring.position.set(0, float, 0);
    ring.rotation.set(
      FINAL_ROTATION[0] + Math.sin(settle * 0.4) * 0.02,
      FINAL_ROTATION[1] + sway,
      FINAL_ROTATION[2],
    );
  }

  function render(elapsed, reduced = false) {
    if (disposed || !renderer) return;
    const time = Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
    effects.update(time, reduced);
    applyTransform(time, reduced);
    renderer.render(scene, camera);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (pmrem) {
      pmrem.dispose();
      pmrem = null;
    }
    scope.dispose();
    if (renderer) {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer = null;
    }
    scene = null;
    camera = null;
    ring = null;
    effects = null;
  }

  return { render, resize, dispose };
}
