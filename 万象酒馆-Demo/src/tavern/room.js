import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createEventScope } from '../shared/events.js';
import { createResourceScope } from '../shared/resources.js';
import { roomChatPlace } from '../chat-places.js';

const QUERY = new URLSearchParams(location.search);
const REQUESTED_ROOM = document.body.dataset.room || QUERY.get('room');
const ROOM_KIND = ['a', 'b', 'master'].includes(REQUESTED_ROOM) ? REQUESTED_ROOM : 'a';
const ROOM_INFO = Object.freeze({
  a: {
    asset: './assets/guest-room-a.glb',
    title: '万象酒馆 · 客房·东厢',
    plaque: '客 房',
    small: '二层 · 东厢',
    enter: '客房 · 推门而入',
    free: '客房 · 自由环顾',
  },
  b: {
    asset: './assets/guest-room-b.glb',
    title: '万象酒馆 · 客房·西厢',
    plaque: '客 房',
    small: '二层 · 西厢',
    enter: '客房 · 推门而入',
    free: '客房 · 自由环顾',
  },
  master: {
    asset: './assets/master-bedroom.glb',
    title: '万象酒馆 · 主卧·主人房',
    plaque: '主 卧',
    small: '二层 · 主人房',
    enter: '主卧 · 推门而入',
    free: '主卧 · 自由环顾',
  },
});
const ROOM = ROOM_INFO[ROOM_KIND];

const GUEST_PLACES = Object.freeze({
  bed: Object.freeze({
    name: ROOM_KIND === 'master' ? '主床 · 坐到床沿' : '客床 · 坐到床沿',
    button: '坐到床上',
    p: [-1.9, 1.16, -2.0],
    focus: [-0.2, 1.05, 1.5],
    anchor: [-1.9, 0.95, -1.5],
  }),
  window: Object.freeze({
    name: '窗边 · 月色正好',
    button: '倚到窗边',
    p: [2.5, 1.3, 0.58],
    focus: [3.92, 1.54, 0.42],
    anchor: [3.86, 1.58, 0.42],
  }),
  desk: Object.freeze({
    name: '书桌 · 未写完的信',
    button: '坐到书桌前',
    p: [-2.85, 1.22, 0.96],
    focus: [-3.9, 1.02, 0.96],
    anchor: [-2.72, 1.0, 0.96],
  }),
  wardrobe: Object.freeze({
    name: '衣柜 · 旅途行装',
    button: '走到衣柜前',
    p: [2.35, 1.32, -0.78],
    focus: [2.35, 1.2, -2.5],
    anchor: [2.35, 1.3, -2.36],
  }),
  washstand: Object.freeze({
    name: '净手台 · 一盆清水',
    button: '走到净手台',
    p: [2.25, 1.32, -1.55],
    focus: [3.94, 1.25, -1.72],
    anchor: [3.32, 1.12, -1.7],
  }),
  stove: Object.freeze({
    name: '暖炉 · 炉火与铜壶',
    button: '坐到炉边',
    p: [1.72, 1.27, 1.54],
    focus: [3.08, 0.92, 2.3],
    anchor: [2.84, 0.96, 2.16],
  }),
  door: Object.freeze({
    name: '房门 · 回到走廊',
    button: '离开房间',
    exit: true,
    p: [0, 1.36, 1.86],
    focus: [0, 1.25, 3.08],
    anchor: [0, 1.42, 2.98],
  }),
});

const MASTER_PLACES = Object.freeze({
  bed: Object.freeze({
    name: '主床 · 双人床',
    button: '坐到主床上',
    p: [-1.7, 1.46, -2.75],
    focus: [1.9, 1.18, 0.8],
    anchor: [-1.7, 1.08, -2.18],
  }),
  window: Object.freeze({
    name: '窗榻 · 月色与长帘',
    button: '走到窗榻边',
    p: [4.35, 1.42, 0.6],
    focus: [5.62, 1.56, 0.6],
    anchor: [5.15, 1.55, 0.6],
  }),
  desk: Object.freeze({
    name: '书桌 · 主人的信笺',
    button: '坐到书桌前',
    p: [-4.48, 1.22, 2.5],
    focus: [-5.55, 1.02, 2.5],
    anchor: [-4.35, 1.02, 2.5],
  }),
  wardrobe: Object.freeze({
    name: '大衣柜 · 礼服与行装',
    button: '走到衣柜前',
    p: [4.5, 1.4, 3.35],
    focus: [5.58, 1.22, 3.35],
    anchor: [5.34, 1.32, 3.35],
  }),
  washstand: Object.freeze({
    name: '梳妆台 · 镜与香露',
    button: '走到梳妆台',
    p: [-4.35, 1.35, -3.55],
    focus: [-5.6, 1.28, -3.55],
    anchor: [-5.1, 1.18, -3.55],
  }),
  stove: Object.freeze({
    name: '壁炉 · 炉火与石砌',
    button: '走到壁炉边',
    p: [-4.0, 1.35, 0.2],
    focus: [-5.6, 1.0, 0.2],
    anchor: [-4.96, 0.98, 0.2],
  }),
  sitting: Object.freeze({
    name: '起居角 · 两把翼椅',
    button: '走到起居角',
    p: [3.1, 1.38, 0.75],
    focus: [3.75, 1.0, -2.9],
    anchor: [3.2, 1.04, -2.4],
  }),
  bookshelf: Object.freeze({
    name: '书架 · 旧书与铜像',
    button: '走到书架前',
    p: [-4.2, 1.32, -1.85],
    focus: [-5.6, 1.3, -1.85],
    anchor: [-5.18, 1.25, -1.85],
  }),
  door: Object.freeze({
    name: '房门 · 回到走廊',
    button: '离开房间',
    exit: true,
    p: [0, 1.45, 3.45],
    focus: [0, 1.38, 4.62],
    anchor: [0, 1.5, 4.48],
  }),
});

const PLACES = ROOM_KIND === 'master' ? MASTER_PLACES : GUEST_PLACES;

export async function createGuestRoomView() {
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
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1d1718');
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.025, 38);
  camera.rotation.order = 'YXZ';
  if (ROOM_KIND === 'master') {
    camera.position.set(0, 1.5, 3.45);
    camera.lookAt(-0.8, 1.2, -2.4);
  } else {
    camera.position.set(0, 1.36, 2.5);
    camera.lookAt(-0.1, 1.16, -1.8);
  }

  const hemisphere = new THREE.HemisphereLight('#ffe3c4', '#55465d', 1.25);
  const ambient = new THREE.AmbientLight('#d8c3ae', 0.8);
  const windowLight = new THREE.PointLight('#8fb6de', 8.3, 6.2, 2);
  const hearthLight = new THREE.PointLight('#ff9a4b', 19.6, 5.4, 2);
  const lanternLight = new THREE.PointLight('#ffc17b', 24.2, 7.6, 2);
  const deskLight = new THREE.PointLight('#ffd39a', 5.5, 3.4, 2);
  const washLight = new THREE.PointLight('#bad4de', 3.4, 2.6, 2);
  const doorLight = new THREE.PointLight('#ffb36d', 5.1, 3.2, 2);
  const sittingLight = new THREE.PointLight('#ffc987', 5.8, 4.4, 2);
  if (ROOM_KIND === 'master') {
    windowLight.position.set(5.15, 1.8, 0.5);
    windowLight.intensity = 9.2;
    windowLight.distance = 8;
    hearthLight.position.set(-4.75, 0.9, 0.2);
    hearthLight.intensity = 22;
    hearthLight.distance = 6.4;
    lanternLight.position.set(-0.52, 3.0, 0.08);
    lanternLight.intensity = 32;
    lanternLight.distance = 12;
    deskLight.position.set(-5.0, 1.15, 2.5);
    deskLight.intensity = 5.2;
    washLight.position.set(-5.0, 1.7, -3.5);
    washLight.distance = 3.4;
    doorLight.position.set(0, 1.35, 3.9);
    doorLight.intensity = 6.4;
    sittingLight.position.set(4.96, 2.3, -3.8);
  } else {
    windowLight.position.set(3.3, 1.7, 0.48);
    hearthLight.position.set(2.94, 0.66, 2.22);
    lanternLight.position.set(0, 1.98, 0.56);
    deskLight.position.set(-3.55, 1.12, 0.95);
    washLight.position.set(3.62, 1.72, -1.7);
    doorLight.position.set(0, 1.15, 2.76);
    sittingLight.intensity = 0;
  }
  lanternLight.castShadow = true;
  lanternLight.shadow.mapSize.set(1024, 1024);
  lanternLight.shadow.bias = -0.001;
  lanternLight.shadow.normalBias = 0.015;
  lanternLight.shadow.camera.near = 0.1;
  scene.add(
    hemisphere,
    ambient,
    windowLight,
    hearthLight,
    lanternLight,
    deskLight,
    washLight,
    doorLight,
    sittingLight,
  );

  let current = '',
    yaw = camera.rotation.y,
    pitch = camera.rotation.x,
    travel = null,
    model = null,
    loaded = false,
    disposed = false,
    leaving = false;
  const projected = new THREE.Vector3(),
    direction = new THREE.Vector3(),
    toward = new THREE.Vector3(),
    ray = new THREE.Raycaster();
  const spotElements = {},
    spotStates = {},
    flames = [];
  const resources = createResourceScope();
  const events = createEventScope();

  function updateWhere(text) {
    const label = document.getElementById('where');
    if (label) label.textContent = text;
  }
  function syncAngles() {
    yaw = camera.rotation.y;
    pitch = camera.rotation.x;
  }
  function apply() {
    camera.rotation.set(pitch, yaw, 0);
  }
  function cancelTravel() {
    if (travel) {
      travel = null;
      current = '';
      syncAngles();
      updateWhere(ROOM.free);
    }
  }
  function look(y, p = 0) {
    travel = null;
    yaw = y;
    pitch = p;
    apply();
  }
  function placeNow(id) {
    if (!PLACES[id]) return;
    current = id;
    travel = null;
    camera.position.fromArray(PLACES[id].p);
    camera.lookAt(new THREE.Vector3(...PLACES[id].focus));
    syncAngles();
    updateWhere(PLACES[id].name);
  }
  function moveTo(id) {
    if (!loaded || !PLACES[id]) return;
    const end = new THREE.Vector3(...PLACES[id].p),
      targetCamera = camera.clone();
    targetCamera.position.copy(end);
    targetCamera.lookAt(new THREE.Vector3(...PLACES[id].focus));
    travel = {
      id,
      start: camera.position.clone(),
      end,
      q0: camera.quaternion.clone(),
      q1: targetCamera.quaternion.clone(),
      elapsed: 0,
      duration: Math.min(2.2, 0.95 + camera.position.distanceTo(end) * 0.16),
    };
    updateWhere('前往' + PLACES[id].name.split(' · ')[0] + '…');
  }
  function enterCorridor() {
    if (leaving) return;
    leaving = true;
    document.body.classList.add('leaving');
    setTimeout(() => {
      location.href = './corridor.html?from=' + ROOM_KIND;
    }, 380);
  }
  function makeSpots() {
    for (const [id, place] of Object.entries(PLACES)) {
      if (place.exit) continue;
      const button = document.createElement('button');
      button.className = 'spot';
      button.dataset.place = id;
      button.innerHTML =
        '<span class="diamond" aria-hidden="true">◇</span><span>' +
        place.button +
        '</span><span aria-hidden="true">›</span>';
      button.disabled = true;
      button.tabIndex = -1;
      button.onclick = () => moveTo(id);
      document.getElementById('spots').append(button);
      spotElements[id] = button;
      spotStates[id] = { visible: false, occluded: false, candidate: false };
    }
  }
  function makeFlame(l, base) {
    flames.push({ light: l, base, phase: Math.random() * 10 });
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    updateSpots();
  }
  function updatePortal() {
    const button = document.getElementById('leave-room');
    projected.fromArray(PLACES.door.anchor);
    toward.copy(projected).sub(camera.position).normalize();
    const facing = direction.dot(toward) > 0.55;
    projected.project(camera);
    const visible =
      !travel &&
      facing &&
      projected.z > -1 &&
      projected.z < 1 &&
      Math.abs(projected.x) < 0.88 &&
      Math.abs(projected.y) < 0.82;
    button.hidden = !visible;
    button.disabled = !visible;
    button.tabIndex = visible ? 0 : -1;
    button.setAttribute('aria-hidden', String(!visible));
    if (visible)
      button.style.transform = `translate3d(${(projected.x * 0.5 + 0.5) * innerWidth}px,${(-projected.y * 0.5 + 0.5) * innerHeight}px,0) translate(-50%,-50%)`;
  }
  let spotTimer = 0;
  function updateSpots(checkOcclusion = true) {
    if (!model) return;
    camera.updateMatrixWorld();
    camera.getWorldDirection(direction);
    updatePortal();
    const visibleSpots = [];
    for (const [id, place] of Object.entries(PLACES)) {
      if (place.exit) continue;
      const button = spotElements[id],
        state = spotStates[id];
      projected.fromArray(place.anchor);
      toward.copy(projected).sub(camera.position);
      const distance = toward.length();
      toward.normalize();
      projected.project(camera);
      const candidate =
        !travel &&
        id !== current &&
        distance > 0.4 &&
        direction.dot(toward) > (state.visible ? 0.84 : 0.87) &&
        projected.z < 1 &&
        projected.z > -1 &&
        Math.abs(projected.x) < 0.9 &&
        Math.abs(projected.y) < 0.85;
      if (candidate && (checkOcclusion || !state.candidate)) {
        ray.set(camera.position, toward);
        ray.far = Math.max(0.1, distance - 0.18);
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
    window.guestRoomReady = false;
    window.guestRoomPreview = null;
  }

  events.on(window, 'pagehide', dispose, { once: true });
  events.on(document.getElementById('room-talk'), 'click', () => {
    if (leaving || travel) return;
    parent.postMessage(
      { type: 'tavern-talk', place: roomChatPlace(ROOM_KIND, current) },
      location.origin,
    );
  });
  parent.postMessage({ type: 'tavern-portal-visibility', summon: false }, location.origin);
  document.title = ROOM.title;
  const plaque = document.getElementById('room-plaque');
  if (plaque) {
    const title = plaque.querySelector('strong'),
      small = plaque.querySelector('small');
    if (title) title.textContent = ROOM.plaque;
    if (small) small.textContent = ROOM.small;
  }
  makeSpots();

  try {
    const gltf = await new GLTFLoader().loadAsync(ROOM.asset);
    model = gltf.scene;
    resources.object(model);
    if (disposed) return { dispose };
    model.traverse((object) => {
      if (!object.isMesh) return;
      object.castShadow = true;
      object.receiveShadow = true;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        if (!material || !material.emissive) continue;
        if (material.emissive.getHex() === 0) continue;
        if (object.name.includes('Fire') || object.name.includes('Flame'))
          material.emissiveIntensity = 1.2;
        else if (object.name.includes('Glow') || object.name.includes('Stars'))
          material.emissiveIntensity = 1.05;
        else material.emissiveIntensity = 0.8;
      }
    });
    scene.add(model);
    document.getElementById('status').remove();
    loaded = true;
    syncAngles();
    updateWhere(ROOM.enter);
    makeFlame(hearthLight, hearthLight.intensity);
    makeFlame(deskLight, deskLight.intensity);
    makeFlame(doorLight, doorLight.intensity);
    document.body.classList.add('ready');
    const hint = document.getElementById('room-hint');
    if (hint) setTimeout(() => hint.classList.add('quiet'), 4200);
    window.guestRoomReady = true;
    window.guestRoomPreview = {
      scene,
      camera,
      renderer,
      model,
      places: PLACES,
      moveTo,
      placeNow,
      look,
      enterCorridor,
      kind: ROOM_KIND,
      asset: ROOM.asset,
      getState: () => ({
        current,
        moving: !!travel,
        available: Object.entries(spotElements)
          .filter(([, button]) => !button.disabled)
          .map(([id]) => id),
      }),
    };
  } catch (error) {
    if (!disposed) {
      const status = document.getElementById('status');
      if (status) status.textContent = '客房载入失败：' + error.message;
    }
    dispose();
    throw error;
  }

  let drag = null;
  events.on(canvas, 'pointerdown', (event) => {
    cancelTravel();
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
      moveTo('door');
      return;
    }
    if (!event.key.startsWith('Arrow')) return;
    event.preventDefault();
    cancelTravel();
    if (event.key === 'ArrowLeft') yaw += 0.1;
    if (event.key === 'ArrowRight') yaw -= 0.1;
    if (event.key === 'ArrowUp') pitch = Math.min(1.25, pitch + 0.07);
    if (event.key === 'ArrowDown') pitch = Math.max(-1.25, pitch - 0.07);
    apply();
  });
  document.getElementById('leave-room').onclick = () => {
    if (!document.getElementById('leave-room').hidden) enterCorridor();
  };
  events.on(window, 'resize', resize);
  resize();
  const clock = new THREE.Clock();
  let elapsed = 0;
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.05);
    elapsed += dt;
    if (travel) {
      travel.elapsed += dt;
      const progress = Math.min(1, travel.elapsed / travel.duration),
        eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
      camera.position.lerpVectors(travel.start, travel.end, eased);
      camera.quaternion.slerpQuaternions(travel.q0, travel.q1, eased);
      if (progress === 1) {
        current = travel.id;
        travel = null;
        syncAngles();
        updateWhere(PLACES[current].name);
      }
    }
    for (const { light, base, phase } of flames) {
      const flicker =
        0.94 + 0.045 * Math.sin(elapsed * 7.3 + phase) + 0.025 * Math.sin(elapsed * 17.1 + phase);
      light.intensity = base * flicker;
    }
    windowLight.intensity = 8.2 + Math.sin(elapsed * 0.45) * 0.42;
    lanternLight.intensity = 23.8 + Math.sin(elapsed * 1.7) * 0.42;
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

await createGuestRoomView();
