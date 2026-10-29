import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createEventScope } from '../shared/events.js';
import { createResourceScope } from '../shared/resources.js';
import { synchronizeSummonCrystals } from './animation.js';
import { deviceRenderQuality, createFrameBudget } from '../shared/render-budget.js';
import { createRingDisplay } from './ring-display.js';
import { createTavernVisitors } from './visitors.js';
import { TAVERN_VISITORS } from '../content/tavern-visitors.js';

export async function createTavernView() {
  const quality = deviceRenderQuality();
  const frameBudget = createFrameBudget(quality.fps);
  let renderedFrames = 0;
  const canvas = document.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: quality.antialias,
    preserveDrawingBuffer: !quality.mobile,
  });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.96;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#21191a');
  const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, 0.025, 60);
  camera.rotation.order = 'YXZ';
  scene.add(new THREE.HemisphereLight('#ffe9ca', '#716e87', 0.65));
  scene.add(new THREE.AmbientLight('#d3c0a8', 0.35));
  const places = {
    table: {
      name: '圆桌座位',
      button: '坐回圆桌',
      p: [0.2, 1.18, 2.6],
      focus: [1.14, 1.5, -4.5],
      anchor: [0.2, 0.95, 2.6],
    },
    bar: {
      name: '吧台座位',
      button: '坐到吧台',
      p: [-3.4, 1.4, -2.44],
      focus: [-3.4, 1.24, -3.96],
      anchor: [-3.4, 1.1, -2.44],
    },
    bar2: {
      name: '吧台另一席',
      button: '坐到吧台另一席',
      p: [-1.85, 1.4, -2.44],
      focus: [-1.85, 1.24, -3.96],
      anchor: [-1.85, 1.1, -2.44],
    },
    summon: {
      name: '召唤之门 · 迎接异界来客',
      button: '靠近召唤之门',
      p: [-3.08, 1.6, 1.24],
      focus: [-5.56, 1.48, 1.24],
      anchor: [-5.32, 1.25, 1.24],
    },
    gate: {
      name: '副本界门 · 出发讨伐',
      button: '靠近副本界门',
      p: [1.14, 1.6, -1.8],
      focus: [1.14, 1.36, -4.5],
      anchor: [1.14, 1.25, -4.25],
    },
    corridorDoor: {
      name: '走廊门 · 客房与主卧',
      button: '走向走廊门',
      p: [0, 1.42, 3.3],
      focus: [0, 1.3, 4.7],
      anchor: [0, 1.3, 4.5],
    },
    fate: {
      name: '命运桌 · 纹章戒指',
      button: '坐到命运桌',
      p: [4.12, 1.34, 0.7],
      focus: [4.12, 0.98, -0.45],
      anchor: [4.12, 1.1, -0.28],
    },
    table2: {
      name: '靠窗圆桌座位',
      button: '坐到靠窗圆桌',
      p: [3.84, 1.18, 3.88],
      focus: [3.84, 1.05, 1.8],
      anchor: [3.84, 0.95, 3.88],
    },
    supplies: {
      name: '补给角 · 售货机与以太凝聚器',
      button: '走向补给角',
      p: [-3.65, 1.5, 1.25],
      focus: [-3.75, 1.3, 4.45],
      anchor: [-3.75, 2.65, 3.85],
    },
    bookshelf: {
      name: '书架 · 藏书与旅途',
      button: '走向书架',
      p: [3.15, 1.45, -2.6],
      focus: [5.65, 1.25, -3.05],
      // Keep the approach marker above the fate desk and in front of the shelves.
      anchor: [5.2, 2.65, -2.7],
    },
  };
  let current = 'table',
    yaw = -0.13,
    pitch = 0.01,
    travel = null,
    model = null,
    mixer = null,
    loaded = false,
    leaving = false;
  camera.position.fromArray(places.table.p);
  function apply() {
    camera.rotation.set(pitch, yaw, 0);
  }
  function syncAngles() {
    yaw = camera.rotation.y;
    pitch = camera.rotation.x;
  }
  function updateWhere(text) {
    const el = document.getElementById('where');
    if (el) el.textContent = text;
  }
  function cancelTravel() {
    if (travel) {
      travel = null;
      current = '';
      syncAngles();
      updateWhere('环视酒馆');
    }
  }
  function look(y, p = 0) {
    travel = null;
    yaw = y;
    pitch = p;
    apply();
  }
  apply();
  const spotElements = {},
    spotStates = {};
  for (const [id, place] of Object.entries(places)) {
    const b = document.createElement('button');
    b.className = 'spot';
    b.dataset.place = id;
    b.innerHTML =
      '<span class="diamond" aria-hidden="true">◇</span><span>' +
      place.button +
      '</span><span aria-hidden="true">›</span>';
    b.disabled = true;
    b.tabIndex = -1;
    b.onclick = () => moveTo(id);
    document.getElementById('spots').append(b);
    spotElements[id] = b;
    spotStates[id] = { visible: false, occluded: false, candidate: false };
  }
  function moveTo(id) {
    if (!loaded || !places[id]) return;
    const end = new THREE.Vector3(...places[id].p),
      targetCamera = camera.clone();
    targetCamera.position.copy(end);
    targetCamera.lookAt(new THREE.Vector3(...places[id].focus));
    travel = {
      id,
      start: camera.position.clone(),
      end,
      q0: camera.quaternion.clone(),
      q1: targetCamera.quaternion.clone(),
      elapsed: 0,
      duration: Math.min(2.8, 1.15 + camera.position.distanceTo(end) * 0.13),
    };
    updateWhere('前往' + places[id].name.split(' · ')[0] + '…');
  }
  function placeNow(id) {
    current = id;
    travel = null;
    camera.position.fromArray(places[id].p);
    camera.lookAt(new THREE.Vector3(...places[id].focus));
    syncAngles();
    updateWhere(places[id].name);
  }
  function enterCorridor() {
    if (!loaded || leaving) return;
    leaving = true;
    document.body.classList.add('leaving');
    setTimeout(() => {
      location.href = './corridor.html';
    }, 380);
  }
  const query = new URLSearchParams(location.search);
  if (query.get('arrival') === '1') {
    camera.position.set(-4.35, 1.6, 1.24);
    camera.lookAt(2.5, 1.45, 1.24);
    syncAngles();
    current = '';
    updateWhere('召唤之门前 · 初到酒馆');
  } else if (query.get('return') === 'gate') {
    camera.position.set(1.14, 1.6, -3.7);
    camera.lookAt(4.12, 1.25, -0.28);
    syncAngles();
    current = '';
    updateWhere('副本之门前 · 回到酒馆');
  } else if (query.get('return') === 'corridor') {
    camera.position.set(0, 1.46, 3.34);
    camera.lookAt(0.2, 1.2, -1.2);
    syncAngles();
    current = 'corridorDoor';
    updateWhere('走廊门前 · 回到酒馆');
  }
  const pulseMaterials = [],
    animatedLights = [],
    fieldMaterials = [],
    sparks = [];
  function gateMaterial(kind, origin, span) {
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uTint: { value: new THREE.Color('#69cfad') },
        uMix: { value: 0 },
        uRipples: { value: 1 },
        uOrigin: { value: new THREE.Vector2(...origin) },
        uSpan: { value: new THREE.Vector2(...span) },
        uKind: { value: kind },
      },
      vertexShader: `varying vec3 vWorld;void main(){vec4 w=modelMatrix*vec4(position,1.0);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `uniform vec3 uTint;uniform float uMix;uniform float uRipples;uniform float uTime;uniform float uKind;uniform vec2 uOrigin;uniform vec2 uSpan;varying vec3 vWorld;
 float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
 void main(){vec2 face=uKind<.5?vWorld.xy:vec2(-vWorld.z,vWorld.y);vec2 uv=(face-uOrigin)/uSpan;vec2 cells=floor(uv*uSpan/.04);vec2 q=(cells+.5)*.04/uSpan;float t=uTime*uRipples;vec3 color;
 if(uKind<.5){vec2 d=(q-.5)*vec2(1.0,1.15);float r=length(d);float a=atan(d.y,d.x);float wave=sin(r*40.0-t*1.1+sin(a*3.0+t*.4)*.45);float shine=smoothstep(.25,.9,wave);
 color=mix(vec3(.075,.043,.12),vec3(.48,.27,.72),shine);color+=vec3(.14,.08,.2)*exp(-r*5.0);float mote=step(.989,hash(cells))*pow(max(0.0,sin(t*1.8+hash(cells)*12.0)),8.0);color+=mote*vec3(.7,.5,1.0);
 }else{float band=sin(q.y*24.0-t*1.5+sin(q.x*10.0+t*.3)*.8);color=mix(vec3(.035,.105,.12),vec3(.19,.53,.5),smoothstep(-.7,.85,band));
 float mote=step(.986,hash(cells))*pow(max(0.0,sin(t+hash(cells)*20.0)),6.0);color+=mote*vec3(.4,.8,.7);}
 if(uKind>.5){color=mix(color,uTint*(length(color)*1.4+.06),uMix);}
 gl_FragColor=vec4(color,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>}`,
    });
    fieldMaterials.push(material);
    return material;
  }
  function addSparks(x, y, z, w, h, color, kind) {
    const count = 22,
      m = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.035, 0.035, 0.035),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false }),
        count,
      );
    m.frustumCulled = false;
    scene.add(m);
    const seeds = Array.from({ length: count }, (_, i) => ({
      u: (Math.sin(i * 73.1) * 437.1) % 1,
      v: i / count,
      phase: i * 1.31,
    }));
    sparks.push({ m, x, y, z, w, h, kind, seeds });
  }

  let disposed = false;
  const resources = createResourceScope();
  const events = createEventScope();
  const shelfButtons = [];
  let ringDisplay = null;
  let visitors = null;
  let visitorConfig = null;
  events.on(window, 'message', (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== parent ||
      event.data?.type !== 'tavern-visitors'
    )
      return;
    visitorConfig = event.data;
    visitors?.configure(visitorConfig);
  });
  function dispose() {
    if (disposed) return;
    disposed = true;
    renderer.setAnimationLoop(null);
    ringDisplay?.dispose();
    visitors?.dispose();
    events.dispose();
    shelfButtons.forEach((shelf) => shelf.button.remove());
    mixer?.stopAllAction();
    if (model) mixer?.uncacheRoot(model);
    resources.object(scene);
    resources.dispose();
    renderer.dispose();
    window.modelReady = false;
    window.assetPreview = null;
  }
  events.on(window, 'pagehide', dispose, { once: true });
  try {
    const loader = new GLTFLoader();
    const [gltf, machines] = await Promise.all([
      loader.loadAsync('./assets/inn.glb'),
      loader.loadAsync('./assets/tavern-machines.glb'),
    ]);
    model = gltf.scene;
    resources.object(model);
    resources.object(machines.scene);
    if (disposed) return { dispose };
    // Older exported rooms still contain the removable barrel/crate group in this corner.
    const oldCorner = [];
    model.traverse((object) => {
      if (object.name.startsWith('12_Corner_Barrels_and_Crates')) oldCorner.push(object);
    });
    for (const object of oldCorner) object.removeFromParent();
    machines.scene.name = 'Tavern_Supply_Corner';
    machines.scene.position.set(-3.75, 0, 4.45);
    machines.scene.rotation.y = Math.PI;
    model.add(machines.scene);
    const dungeonShader = gateMaterial(0, [0.48, 0.24], [1.32, 2.12]),
      summonShader = gateMaterial(1, [-1.84, 0.2], [1.2, 2.2]);
    model.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        if (o.name.startsWith('20_Summoning_Field')) {
          o.material = Array.isArray(o.material)
            ? o.material.map(() => summonShader)
            : summonShader;
          o.castShadow = false;
        } else if (o.name.startsWith('21_Dungeon_Field')) {
          o.material = Array.isArray(o.material)
            ? o.material.map(() => dungeonShader)
            : dungeonShader;
          o.castShadow = false;
        } else if (
          o.name.startsWith('20_Summoning_Arrival_Gate') ||
          o.name.startsWith('21_Dungeon_Threshold')
        ) {
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          o.material = mats.map((m) => {
            if (m.name === 'cyan' || m.name === 'violet') {
              const c = m.clone();
              pulseMaterials.push({
                m: c,
                base: c.emissive.clone(),
                phase: o.name.startsWith('20') ? 1 : 0,
              });
              return c;
            }
            return m;
          });
          if (!Array.isArray(mats) || mats.length === 1) o.material = o.material[0];
        }
      }
      if (o.isLight) {
        o.decay = 2;
        o.castShadow = o.name.includes('Chandelier');
        if (o.castShadow) {
          o.shadow.mapSize.set(1024, 1024);
          o.shadow.bias = -0.0005;
          o.shadow.normalBias = 0.012;
          o.shadow.camera.near = 0.08;
        }
        animatedLights.push({ l: o, base: o.intensity, phase: Math.sin(o.position.x * 3) + 1 });
      }
    });
    scene.add(model);
    visitors = createTavernVisitors(scene, camera, model);
    if (query.get('visitors') === '1')
      visitorConfig = {
        enabled: true,
        characters: TAVERN_VISITORS.map(({ id }) => ({ key: id, id })),
      };
    if (visitorConfig) visitors.configure(visitorConfig);
    ringDisplay = createRingDisplay(renderer, scene, camera);
    mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach((a) => mixer.clipAction(synchronizeSummonCrystals(a)).play());
    addSparks(1.14, 0.24, -4.5, 1.32, 2.12, '#bb91ea', 0);
    addSparks(-5.44, 0.2, 1.24, 1.2, 2.2, '#7bdace', 1);
    document.getElementById('status').remove();
    loaded = true;
    window.modelReady = true;
    window.assetPreview = {
      scene,
      camera,
      renderer,
      model,
      places,
      moveTo,
      placeNow,
      look,
      enterCorridor,
      fieldMaterials,
      rings: () => ringDisplay.status(),
      visitors: () => visitors.status(),
      getState: () => ({
        rendering: {
          frames: renderedFrames,
          fps: quality.fps,
          pixelRatio: renderer.getPixelRatio(),
          shadows: renderer.shadowMap.enabled,
        },
        current,
        moving: !!travel,
        buttons: Object.entries(spotElements)
          .filter(([, b]) => !b.disabled)
          .map(([id]) => id),
        animations: gltf.animations.map((a) => a.name),
      }),
    };
  } catch (e) {
    if (!disposed) document.getElementById('status').textContent = '模型载入失败：' + e.message;
    dispose();
    throw e;
  }
  let drag = null;
  events.on(canvas, 'pointerdown', (e) => {
    if (ringDisplay?.status().active) return;
    cancelTravel();
    drag = {
      x: e.clientX,
      y: e.clientY,
      startX: e.clientX,
      startY: e.clientY,
      id: e.pointerId,
      moved: false,
    };
    canvas.setPointerCapture(e.pointerId);
  });
  events.on(canvas, 'pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 6) drag.moved = true;
    yaw -= (e.clientX - drag.x) * 0.004;
    pitch = THREE.MathUtils.clamp(pitch - (e.clientY - drag.y) * 0.003, -1.25, 1.25);
    drag.x = e.clientX;
    drag.y = e.clientY;
    apply();
  });
  events.on(canvas, 'pointerup', (event) => {
    const tap = drag && !drag.moved;
    drag = null;
    if (!tap || travel || ringDisplay?.status().active) return;
    const visitor = visitors?.pick(event.clientX, event.clientY);
    if (visitor)
      parent.postMessage(
        { type: 'tavern-talk', place: 'table', characterId: visitor.id },
        location.origin,
      );
  });
  events.on(canvas, 'pointercancel', () => (drag = null));
  events.on(
    canvas,
    'wheel',
    (e) => {
      e.preventDefault();
      camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.025, 48, 95);
      camera.updateProjectionMatrix();
    },
    { passive: false },
  );
  events.on(window, 'keydown', (e) => {
    if (ringDisplay?.status().active) return;
    if (e.key === 'Escape') {
      moveTo('table');
      return;
    }
    if (!e.key.startsWith('Arrow')) return;
    e.preventDefault();
    cancelTravel();
    if (e.key === 'ArrowLeft') yaw += 0.1;
    if (e.key === 'ArrowRight') yaw -= 0.1;
    if (e.key === 'ArrowUp') pitch = Math.min(1.25, pitch + 0.07);
    if (e.key === 'ArrowDown') pitch = Math.max(-1.25, pitch - 0.07);
    apply();
  });
  const emblem = document.createElement('button');
  emblem.id = 'emblem-open';
  emblem.textContent = '赏鉴纹章戒指';
  emblem.hidden = true;
  document.getElementById('talk-open').before(emblem);
  emblem.onclick = () => {
    if (!emblem.hidden && !travel) ringDisplay?.open();
  };
  events.on(window, 'message', (event) => {
    if (
      event.origin === location.origin &&
      event.source === parent &&
      event.data?.type === 'tavern-emblem-collection'
    )
      ringDisplay?.setCollection(event.data.collection);
  });
  const supplyButtons = {};
  for (const [id, label] of Object.entries({ shop: '虚空售货机', condenser: '以太凝聚器' })) {
    const button = document.createElement('button');
    button.id = `${id}-open`;
    button.className = 'supply-open';
    button.textContent = label;
    button.hidden = true;
    button.onclick = () => {
      if (!button.hidden && !travel)
        parent.postMessage(
          { type: id === 'shop' ? 'tavern-shop' : 'tavern-condenser' },
          location.origin,
        );
    };
    document.getElementById('talk-open').before(button);
    supplyButtons[id] = button;
  }
  const talk = document.getElementById('talk-open');
  shelfButtons.push(
    ...[
      { action: 'archives', label: '归档', height: 1.78 },
      { action: 'records', label: '记录', height: 1.24 },
      { action: 'memory', label: '总结', height: 0.7 },
    ].map((shelf) => {
      const button = document.createElement('button');
      button.id = 'bookshelf-' + shelf.action;
      button.className = 'talk-open bookshelf-shelf';
      button.textContent = shelf.label;
      button.dataset.shelfAction = shelf.action;
      button.hidden = true;
      events.on(button, 'click', () => {
        if (!button.hidden && !travel)
          parent.postMessage({ type: 'tavern-bookshelf', action: shelf.action }, location.origin);
      });
      talk.before(button);
      return { ...shelf, button };
    }),
  );
  talk.onclick = () => {
    if (!talk.hidden && !travel)
      parent.postMessage({ type: 'tavern-talk', place: current }, location.origin);
  };
  const enter = document.getElementById('enter');
  enter.onclick = () => {
    if (!enter.hidden && !enter.disabled)
      parent.postMessage({ type: 'enter-dungeon' }, location.origin);
  };
  const summon = document.getElementById('summon-open');
  summon.onclick = () => {
    if (!summon.hidden && !summon.disabled)
      parent.postMessage({ type: 'summon-character' }, location.origin);
  };
  const corridorDoor = document.getElementById('corridor-open');
  corridorDoor.onclick = () => {
    if (!corridorDoor.hidden && !corridorDoor.disabled) enterCorridor();
  };
  let summonSurge = 0;
  let summonMode = null;
  let choosingSummon = false;
  const summonTint = new THREE.Color('#69cfad');
  events.on(window, 'message', (e) => {
    if (e.origin === location.origin && e.source === parent && e.data?.type === 'gal-visibility')
      document.body.classList.toggle('gal-covered', e.data.visible === true);
    if (e.origin === location.origin && e.source === parent && e.data?.type === 'summon-mode') {
      summonMode = e.data.mode;
      choosingSummon = e.data.choosing === true;
      summonTint.set(
        { official: '#73e3b5', chaos: '#ba82ef', infinite: '#7ea9ff', npc: '#f3cc70' }[
          summonMode
        ] || '#69cfad',
      );
      summonSurge = 2.5;
    }
    if (e.origin === location.origin && e.data?.type === 'summon-surge') {
      summonSurge = 2.5;
    }
  });
  try {
    document.body.classList.toggle(
      'gal-covered',
      parent.document.body.classList.contains('gal-playing'),
    );
  } catch {
    /* Standalone cross-origin previews do not use the parent application's Gal stage. */
  }
  const projected = new THREE.Vector3(),
    direction = new THREE.Vector3(),
    toward = new THREE.Vector3(),
    ray = new THREE.Raycaster(),
    dummy = new THREE.Object3D();
  let spotTimer = 0,
    summonVisible = null;
  function updateSpots(checkOcclusion = true) {
    camera.updateMatrixWorld();
    for (const shelf of shelfButtons) {
      shelf.button.hidden = !loaded || !!travel || current !== 'bookshelf';
      if (!shelf.button.hidden) {
        projected.set(5.48, shelf.height, -3.08).project(camera);
        shelf.button.hidden =
          projected.z < -1 ||
          projected.z > 1 ||
          Math.abs(projected.x) > 1 ||
          Math.abs(projected.y) > 1;
        shelf.button.style.left = (projected.x * 0.5 + 0.5) * innerWidth + 'px';
        shelf.button.style.top = (-projected.y * 0.5 + 0.5) * innerHeight + 'px';
      }
    }
    emblem.hidden = !loaded || !!travel || current !== 'fate';
    for (const button of Object.values(supplyButtons))
      button.hidden = !loaded || !!travel || current !== 'supplies';
    talk.hidden = !loaded || !!travel || !['bar', 'bar2', 'table', 'table2'].includes(current);
    camera.getWorldDirection(direction);
    function updatePortal(button, id) {
      projected.fromArray(places[id].anchor);
      toward.copy(projected).sub(camera.position).normalize();
      const facing = direction.dot(toward) > 0.55;
      projected.project(camera);
      const visible =
        current === id &&
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
    updatePortal(enter, 'gate');
    updatePortal(summon, 'summon');
    if (choosingSummon) {
      summon.hidden = true;
      summon.disabled = true;
      summon.tabIndex = -1;
      summon.setAttribute('aria-hidden', 'true');
    }
    updatePortal(corridorDoor, 'corridorDoor');
    if (summonVisible !== !summon.hidden) {
      summonVisible = !summon.hidden;
      parent.postMessage(
        { type: 'tavern-portal-visibility', summon: summonVisible },
        location.origin,
      );
    }

    for (const [id, p] of Object.entries(places)) {
      const b = spotElements[id],
        state = spotStates[id];
      projected.fromArray(p.anchor);
      toward.copy(projected).sub(camera.position);
      const distance = toward.length();
      toward.normalize();
      projected.project(camera);
      const candidate =
        !travel &&
        id !== current &&
        distance > 0.45 &&
        direction.dot(toward) > (state.visible ? 0.9 : 0.93) &&
        projected.z < 1 &&
        projected.z > -1 &&
        Math.abs(projected.x) < 0.9 &&
        Math.abs(projected.y) < 0.85;
      if (candidate && model && (checkOcclusion || !state.candidate)) {
        ray.set(camera.position, toward);
        ray.far = Math.max(0.1, distance - 0.22);
        state.occluded = ray.intersectObject(model, true).length !== 0;
      }
      // Arrival navigation stays clickable above the table even if a chair intersects its anchor ray.
      const arrivalFate = query.get('return') === 'gate' && current === '' && id === 'fate';
      const visible = candidate && (!state.occluded || arrivalFate);
      state.visible = visible;
      state.candidate = candidate;
      b.classList.toggle('visible', visible);
      b.disabled = !visible;
      b.tabIndex = visible ? 0 : -1;
      b.setAttribute('aria-hidden', visible ? 'false' : 'true');
      b.style.translate = '';
      b.style.transform =
        'translate3d(' +
        (projected.x * 0.5 + 0.5) * innerWidth +
        'px,' +
        (-projected.y * 0.5 + 0.5) * innerHeight +
        'px,0) translate(-50%,-50%)';
    }
    const placed = [];
    const buttons = [enter, summon, corridorDoor, ...Object.values(spotElements)];
    for (const button of buttons) {
      button.style.translate = '';
      if (button.hidden || button.disabled) continue;
      const box = button.getBoundingClientRect();
      let top = box.top;
      for (const previous of placed) {
        if (
          box.left < previous.right + 12 &&
          box.right > previous.left - 12 &&
          top < previous.bottom + 12 &&
          top + box.height > previous.top - 12
        )
          top = previous.bottom + 12;
      }
      if (top + box.height > innerHeight - 100) top = Math.max(70, box.top - box.height - 18);
      button.style.translate = `0 ${top - box.top}px`;
      placed.push({ left: box.left, right: box.right, top, bottom: top + box.height });
    }
  }
  function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    updateSpots();
  }
  events.on(window, 'resize', resize);
  resize();
  const clock = new THREE.Clock();
  let elapsed = 0;
  let coveredFrame = false;
  events.on(window, 'resize', () => {
    coveredFrame = false;
  });
  renderer.setAnimationLoop((now) => {
    let covered = false;
    try {
      covered = !!parent.document.querySelector(
        'dialog[open], #generation-progress:not([hidden]),.gal-stage:not([hidden])',
      );
    } catch {
      /* Standalone cross-origin previews render independently. */
    }
    if (!covered) coveredFrame = false;
    if (document.hidden || (covered && coveredFrame)) {
      clock.getDelta();
      return;
    }
    if (!frameBudget.accepts(now)) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    if (ringDisplay?.render(dt)) {
      renderedFrames++;
      return;
    }
    elapsed += dt;
    for (const material of fieldMaterials)
      if (material.uniforms.uKind.value > 0.5) {
        material.uniforms.uTint.value.lerp(summonTint, Math.min(1, dt * 5));
        material.uniforms.uMix.value = THREE.MathUtils.damp(
          material.uniforms.uMix.value,
          summonMode ? 1 : 0,
          5,
          dt,
        );
        material.uniforms.uRipples.value = THREE.MathUtils.damp(
          material.uniforms.uRipples.value,
          summonMode === 'chaos' ? 2.5 : summonMode === 'infinite' ? 1.8 : 1,
          5,
          dt,
        );
      }
    if (travel) {
      travel.elapsed += dt;
      const a = Math.min(1, travel.elapsed / travel.duration),
        e = a * a * a * (a * (a * 6 - 15) + 10);
      camera.position.lerpVectors(travel.start, travel.end, e);
      camera.quaternion.slerpQuaternions(travel.q0, travel.q1, e);
      if (a === 1) {
        current = travel.id;
        travel = null;
        syncAngles();
        updateWhere(places[current].name);
      }
    }
    if (mixer) mixer.update(dt);
    visitors?.update();
    if (summonSurge > 0) summonSurge = Math.max(0, summonSurge - dt);
    const surgeBoost = summonSurge > 0 ? 1 + (summonSurge / 2.5) * 3 : 1;
    fieldMaterials.forEach((m) => (m.uniforms.uTime.value = elapsed * (summonSurge > 0 ? 2 : 1)));
    pulseMaterials.forEach(({ m, base, phase }) =>
      m.emissive
        .copy(base)
        .multiplyScalar((0.9 + 0.2 * Math.sin(elapsed * 1.4 + phase)) * surgeBoost),
    );
    animatedLights.forEach(
      ({ l, base, phase }) =>
        (l.intensity =
          base *
          (0.96 +
            0.04 * Math.sin(elapsed * 3.8 + phase) +
            0.018 * Math.sin(elapsed * 8.1 + phase))),
    );
    for (const s of sparks) {
      s.seeds.forEach((seed, i) => {
        const speed = (s.kind ? 0.08 : 0.04) * (summonSurge > 0 ? 3 : 1);
        const v = (seed.v + elapsed * speed) % 1;
        if (s.kind) {
          dummy.position.set(
            s.x + 0.03 * Math.sin(seed.phase + elapsed),
            s.y + v * s.h,
            s.z - (Math.abs(seed.u) - 0.5) * s.w,
          );
        } else {
          dummy.position.set(
            s.x + Math.sin(seed.phase + elapsed * 0.35) * s.w * 0.48,
            s.y + v * s.h,
            s.z + 0.03 * Math.sin(seed.phase + elapsed),
          );
        }
        dummy.scale.setScalar(0.55 + 0.35 * Math.sin(seed.phase + elapsed) ** 2);
        dummy.updateMatrix();
        s.m.setMatrixAt(i, dummy.matrix);
      });
      s.m.instanceMatrix.needsUpdate = true;
    }
    spotTimer += dt;
    const checkOcclusion = spotTimer > 0.12;
    updateSpots(checkOcclusion);
    if (checkOcclusion) spotTimer = 0;
    renderer.render(scene, camera);
    if (covered && loaded) coveredFrame = true;
    renderedFrames++;
  });

  return { dispose };
}

await createTavernView();
