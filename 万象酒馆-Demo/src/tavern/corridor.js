import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createEventScope } from '../shared/events.js';
import { createResourceScope } from '../shared/resources.js';

const DOORS = Object.freeze({
  roomA: Object.freeze({
    label: '客房 · 东厢',
    href: './guest-room.html?room=a',
    anchor: [-1.52, 1.42, 2.2],
  }),
  roomB: Object.freeze({
    label: '客房 · 西厢',
    href: './guest-room.html?room=b',
    anchor: [-1.52, 1.42, 0],
  }),
  master: Object.freeze({
    label: '主卧 · 主人房',
    href: './master-bedroom.html',
    anchor: [-1.52, 1.42, -2.2],
  }),
  tavern: Object.freeze({
    label: '酒馆 · 回到大厅',
    href: './tavern.html?return=corridor',
    anchor: [1.52, 1.42, 1.0],
  }),
});

export async function createCorridorView() {
  const canvas = document.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#161418');
  const camera = new THREE.PerspectiveCamera(78, innerWidth / innerHeight, 0.025, 38);
  camera.rotation.order = 'YXZ';
  const from = new URLSearchParams(location.search).get('from');
  const entryDoor = { a: 'roomA', b: 'roomB', master: 'master' }[from] || 'tavern';
  const entry = DOORS[entryDoor];
  // Leave enough space to turn back and click the door just used.
  camera.position.set(entryDoor === 'tavern' ? 0.85 : -0.85, 1.46, entry.anchor[2]);
  if (entryDoor === 'tavern') camera.lookAt(-1.52, 1.38, 0);
  else camera.lookAt(...DOORS.tavern.anchor);

  const hemisphere = new THREE.HemisphereLight('#ffe7c8', '#51445a', 1.15);
  const ambient = new THREE.AmbientLight('#d8c3ae', 0.55);
  const windowLight = new THREE.PointLight('#8fb6de', 8.4, 7.2, 2);
  windowLight.position.set(0, 1.8, -4.25);
  const lanterns = [2.75, 0.4, -2.0].map((z, index) => {
    const light = new THREE.PointLight('#ffc07a', index === 1 ? 18 : 14, 6.2, 2);
    light.position.set(0, 2.08, z);
    if (index === 1) {
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.bias = -0.001;
      light.shadow.normalBias = 0.015;
    }
    return light;
  });
  const sconces = [1.5, -0.85].map((z) => {
    const light = new THREE.PointLight('#ffd39a', 4.4, 3.4, 2);
    light.position.set(1.42, 1.62, z);
    return light;
  });
  scene.add(hemisphere, ambient, windowLight, ...lanterns, ...sconces);

  let yaw = camera.rotation.y,
    pitch = camera.rotation.x,
    model = null,
    disposed = false,
    leaving = false;
  const projected = new THREE.Vector3(),
    direction = new THREE.Vector3(),
    toward = new THREE.Vector3(),
    ray = new THREE.Raycaster();
  const landmarks = DOORS;
  const spotElements = {},
    spotStates = {};
  const resources = createResourceScope();
  const events = createEventScope();

  function apply() {
    camera.rotation.set(pitch, yaw, 0);
  }
  function updateWhere(text) {
    const label = document.getElementById('where');
    if (label) label.textContent = text;
  }
  function leaveToTavern() {
    if (leaving) return;
    leaving = true;
    document.body.classList.add('leaving');
    setTimeout(() => {
      location.href = './tavern.html?return=corridor';
    }, 380);
  }
  function enterDoor(id) {
    if (!DOORS[id] || leaving) return;
    leaving = true;
    document.body.classList.add('leaving');
    const target = DOORS[id].href;
    setTimeout(() => {
      location.href = target;
    }, 380);
  }
  function makeSpots() {
    for (const [id, door] of Object.entries(landmarks)) {
      const button = document.createElement('button');
      button.className = 'spot';
      button.dataset.door = id;
      button.innerHTML =
        '<span class="diamond" aria-hidden="true">◇</span><span>' +
        door.label +
        '</span><span aria-hidden="true">›</span>';
      button.disabled = true;
      button.tabIndex = -1;
      button.onclick = () => {
        enterDoor(id);
      };
      document.getElementById('spots').append(button);
      spotElements[id] = button;
      spotStates[id] = { visible: false, candidate: false, occluded: false };
    }
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    updateSpots();
  }
  let spotTimer = 0;
  function updateSpots(checkOcclusion = true) {
    if (!model) return;
    camera.updateMatrixWorld();
    camera.getWorldDirection(direction);
    const visibleSpots = [];
    for (const [id, door] of Object.entries(landmarks)) {
      const button = spotElements[id],
        state = spotStates[id];
      projected.fromArray(door.anchor);
      toward.copy(projected).sub(camera.position);
      const distance = toward.length();
      toward.normalize();
      projected.project(camera);
      const candidate =
        distance > 0.4 &&
        direction.dot(toward) > 0.2 &&
        projected.z > -1 &&
        projected.z < 1 &&
        Math.abs(projected.x) < 0.94 &&
        Math.abs(projected.y) < 0.9;
      if (candidate && (checkOcclusion || !state.candidate)) {
        ray.set(camera.position, toward);
        ray.far = Math.max(0.1, distance - 0.2);
        state.occluded = ray.intersectObject(model, true).length !== 0;
      }
      const visible = candidate && !state.occluded;
      state.visible = visible;
      state.candidate = candidate;
      button.classList.toggle('visible', visible);
      button.disabled = !visible;
      button.tabIndex = visible ? 0 : -1;
      button.setAttribute('aria-hidden', visible ? 'false' : 'true');
      if (visible)
        visibleSpots.push({
          button,
          x: (projected.x * 0.5 + 0.5) * innerWidth,
          y: (-projected.y * 0.5 + 0.5) * innerHeight,
          width: button.offsetWidth,
          height: button.offsetHeight,
        });
    }
    visibleSpots.sort((a, b) => a.y - b.y);
    const placed = [];
    for (const spot of visibleSpots) {
      for (const previous of placed) {
        const overlapsX = Math.abs(spot.x - previous.x) < (spot.width + previous.width) / 2 + 4;
        const overlapsY = Math.abs(spot.y - previous.y) < (spot.height + previous.height) / 2 + 5;
        if (overlapsX && overlapsY) spot.y = previous.y + previous.height / 2 + spot.height / 2 + 7;
      }
      spot.button.style.transform = `translate3d(${spot.x}px,${spot.y}px,0) translate(-50%,-50%)`;
      placed.push(spot);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    events.dispose();
    resources.object(scene);
    resources.dispose();
    renderer.dispose();
    window.corridorReady = false;
    window.corridorPreview = null;
  }

  events.on(window, 'pagehide', dispose, { once: true });
  events.on(document.getElementById('corridor-talk'), 'click', () => {
    if (!leaving) parent.postMessage({ type: 'tavern-talk', place: 'corridor' }, location.origin);
  });
  makeSpots();
  document.getElementById('leave-corridor').onclick = leaveToTavern;

  try {
    const gltf = await new GLTFLoader().loadAsync('./assets/corridor.glb');
    model = gltf.scene;
    resources.object(model);
    if (disposed) return { dispose };
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material?.emissive) continue;
        if (material.emissive.getHex() === 0) continue;
        material.emissiveIntensity = material.name === 'lanternGlow' ? 1.1 : 0.9;
      }
    });
    scene.add(model);
    document.getElementById('status').remove();
    const cameFrom = { a: '东厢客房', b: '西厢客房', master: '主卧' }[from];
    updateWhere(cameFrom ? `走廊 · 从${cameFrom}回到廊道` : '走廊 · 三扇房门');
    document.body.classList.add('ready');
    const hint = document.getElementById('room-hint');
    if (hint) setTimeout(() => hint.classList.add('quiet'), 4600);
    window.corridorReady = true;
    window.corridorPreview = {
      scene,
      camera,
      renderer,
      model,
      doors: DOORS,
      enterDoor,
      leaveToTavern,
      getState: () => ({
        leaving,
        entryDoor,
        position: camera.position.toArray(),
        facing: camera.getWorldDirection(new THREE.Vector3()).toArray(),
        visible: Object.entries(spotElements)
          .filter(([, button]) => !button.disabled)
          .map(([id]) => id),
      }),
    };
  } catch (error) {
    if (!disposed) {
      const status = document.getElementById('status');
      if (status) status.textContent = '走廊载入失败：' + error.message;
    }
    dispose();
    throw error;
  }

  let drag = null;
  events.on(canvas, 'pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId);
  });
  events.on(canvas, 'pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    yaw -= (event.clientX - drag.x) * 0.004;
    pitch = THREE.MathUtils.clamp(pitch - (event.clientY - drag.y) * 0.003, -1.25, 1.25);
    drag.x = event.clientX;
    drag.y = event.clientY;
    apply();
  });
  events.on(canvas, 'pointerup', () => (drag = null));
  events.on(canvas, 'pointercancel', () => (drag = null));
  events.on(
    canvas,
    'wheel',
    (event) => {
      event.preventDefault();
      camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * 0.025, 46, 92);
      camera.updateProjectionMatrix();
    },
    { passive: false },
  );
  events.on(window, 'keydown', (event) => {
    if (event.key === 'Escape') {
      leaveToTavern();
      return;
    }
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    if (event.key === 'ArrowLeft') yaw += 0.1;
    if (event.key === 'ArrowRight') yaw -= 0.1;
    if (event.key === 'ArrowUp') pitch = Math.min(1.25, pitch + 0.07);
    if (event.key === 'ArrowDown') pitch = Math.max(-1.25, pitch - 0.07);
    apply();
  });
  events.on(window, 'resize', resize);
  resize();
  const clock = new THREE.Clock();
  let elapsed = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    lanterns.forEach((light, index) => {
      light.intensity = (index === 1 ? 18 : 14) * (0.96 + Math.sin(elapsed * 8 + index) * 0.035);
    });
    windowLight.intensity = 8.2 + Math.sin(elapsed * 0.5) * 0.3;
    spotTimer += dt;
    const checkOcclusion = spotTimer > 0.12;
    updateSpots(checkOcclusion);
    if (checkOcclusion) spotTimer = 0;
    renderer.render(scene, camera);
  });

  requestAnimationFrame(() =>
    requestAnimationFrame(() => document.getElementById('scene-fade').classList.add('clear')),
  );
  return { dispose };
}

await createCorridorView();
