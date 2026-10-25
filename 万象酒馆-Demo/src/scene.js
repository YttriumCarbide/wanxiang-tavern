import { createEmblemAura } from './emblem-aura.js';
import { emblemRing } from './emblems.js';
import { BIOMES } from './content/biomes.js';
import { createSceneAmbience } from './scene-ambience.js';
import { createWeatherSystem } from './scene-weather.js';
import { createWeatherSurfaces } from './weather-surfaces.js';
import { createScenePeriphery } from './scene-periphery.js';
import { html } from './shared/html.js';
import { createEventScope } from './shared/events.js';
import { createResourceScope } from './shared/resources.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HEROES, DEFINITIONS, encounterSpec, enemySlots } from './data.js';
import { createEffects } from './effects.js';
import { resourceBars, statusIcons, escapeText } from './ui.js';
import { portraitFrame } from './portrait-frame.js';
import { portraitUrl } from './catalog.js';
import { createCardDeaths } from './card-death.js';
import { stabilizeFloorGeometry } from './floor-geometry.js';
import { enemyIntentBadge } from './enemy-intent.js';
import { deviceRenderQuality, createFrameBudget } from './shared/render-budget.js';

export async function createBattleView(stage, onUnitClick, options = {}) {
  const theme = BIOMES[options.map] || BIOMES.ruins;
  stage.dataset.biome = options.map || 'ruins';
  stage.style.setProperty('--scene-accent', theme.accent);
  const definitions = { ...DEFINITIONS, ...options.enemyDefinitions, ...options.heroDefinitions };
  const canvas = stage.querySelector('canvas'),
    layer = stage.querySelector('.unit-layer'),
    effects = stage.querySelector('.battle-effects');
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: deviceRenderQuality().antialias,
    preserveDrawingBuffer: !deviceRenderQuality().mobile,
  });
  const quality = deviceRenderQuality();
  const frameBudget = createFrameBudget(quality.fps);
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.shadowMap.enabled = quality.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const resources = createResourceScope(),
    events = createEventScope();
  const fail = (error) => {
    events.dispose();
    resources.object(scene);
    resources.dispose();
    renderer.dispose();
    throw error;
  };
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(theme.sky);
  scene.add(
    new THREE.HemisphereLight('#c3d8de', '#364653', 1.25),
    new THREE.AmbientLight('#aab9c9', 0.2),
  );
  const sun = new THREE.DirectionalLight(theme.light, 1.7);
  sun.position.set(-5, 12, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -12,
    right: 12,
    top: 11,
    bottom: -11,
    near: 0.1,
    far: 32,
  });
  sun.shadow.bias = -0.00015;
  sun.shadow.normalBias = 0.025;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(theme.fill, 0.7);
  rim.position.set(3, 6, -7);
  scene.add(rim);
  const camera = new THREE.OrthographicCamera(-8.5, 8.5, 5.85, -5.85, 0.1, 60);
  camera.position.set(0, 18, 10);
  camera.lookAt(0, 0, 0);
  const gltf = await new GLTFLoader().loadAsync(`./assets/${theme.asset}.glb`).catch(fail),
    model = resources.object(gltf.scene),
    roots = {};
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
      const own = (m) => {
        const artwork = o.name.endsWith('_Artwork');
        const c = artwork
          ? new THREE.MeshBasicMaterial({ color: '#ffffff', side: m.side, toneMapped: false })
          : m.clone();
        if (artwork) o.receiveShadow = false;
        c.userData.baseColor = c.color.clone();
        c.userData.baseEmission = c.emissive?.clone() || new THREE.Color(0);
        resources.material(c);
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
    }
    if (/^Placeholder_(Friendly|Enemy)_\d+$/.test(o.name)) roots[o.name] = o;
    if (o.isLight) o.intensity *= 0.75;
  });
  scene.add(model);
  const floorStatus = stabilizeFloorGeometry(model, resources);
  const weatherSurfaces = createWeatherSurfaces(model);
  const outerEnvironment = createScenePeriphery(
    model,
    options.map || 'ruins',
    resources,
    weatherSurfaces,
    gltf.userData?.peripheryLayout,
  );
  const textures = Object.fromEntries(
    await Promise.all(
      Object.values(definitions).map(
        (d) =>
          new Promise((resolve, reject) =>
            new THREE.TextureLoader().load(
              portraitUrl(d),
              (t) => {
                resources.track(t);
                const framed = resources.track(
                  new THREE.CanvasTexture(portraitFrame(t.image, d.color)),
                );
                framed.colorSpace = THREE.SRGBColorSpace;
                framed.flipY = false;
                framed.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
                resolve([d.id, framed]);
              },
              undefined,
              (err) => {
                if (d.customPortrait) {
                  new THREE.TextureLoader().load(
                    portraitUrl({ ...d, customPortrait: null }),
                    (t) => {
                      resources.track(t);
                      const framed = resources.track(
                        new THREE.CanvasTexture(portraitFrame(t.image, d.color)),
                      );
                      framed.colorSpace = THREE.SRGBColorSpace;
                      framed.flipY = false;
                      framed.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
                      resolve([d.id, framed]);
                    },
                    undefined,
                    reject,
                  );
                } else {
                  reject(err);
                }
              },
            ),
          ),
      ),
    ).catch(fail),
  );
  const records = [],
    friendRecords = [],
    enemyRecords = [],
    enemies = enemySlots(options.enemyIds || encounterSpec(0).enemyIds);
  const emptySlots = Array.from({ length: 3 }, (_, slot) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'empty-slot';
    el.dataset.emptySlot = slot;
    el.setAttribute('aria-label', `前场${slot + 1}空基座，拖入角色换位`);
    el.hidden = true;
    layer.append(el);
    return el;
  });
  for (const side of ['Friendly', 'Enemy'])
    for (let i = 0; i < 3; i++) {
      const root = roots[`Placeholder_${side}_${String(i + 1).padStart(2, '0')}`],
        x = [-2.56, 0, 2.56][i] * 1.3,
        z = (side === 'Friendly' ? 1.96 : -1.96) * 1.5;
      root.traverse((o) => {
        if (o.isMesh) o.geometry.translate(-x, 0, -z);
      });
      const home = new THREE.Vector3(
        [-3.014, 0, 3.014][i],
        0.12,
        side === 'Friendly' ? 2.345 : -2.345,
      );
      root.position.copy(home);
      if (side === 'Enemy' && !enemies[i]) {
        root.visible = false;
        continue;
      }
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'unit-hit';
      layer.append(el);
      const r = {
        root,
        el,
        side,
        slot: i,
        id: side === 'Friendly' ? (options.formation || HEROES.map((h) => h.id))[i] : enemies[i],
        goal: home.clone(),
        motion: null,
        attack: null,
      };
      records.push(r);
      (side === 'Friendly' ? friendRecords : enemyRecords).push(r);
    }
  let assignments = new Map(friendRecords.map((r) => [r.id, r])),
    width = 0,
    height = 0,
    disposed = false,
    raf = 0,
    animationSpeed = 1,
    first = true;
  let instantNextDraw = false;
  let intentData = null;
  let renderedIntent = '';
  const intentLayer = stage.querySelector('#intent-layer');
  let activeDrag = null;
  let lastDragRelease = null;
  const releasedPositions = new Map(),
    dragMaterials = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const emblemAura = createEmblemAura(scene, resources, reduced);
  const deaths = createCardDeaths({
    scene,
    camera,
    stage,
    getSpeed: () => animationSpeed,
    reduced,
  });
  const ambience = createSceneAmbience(scene, model, options.map || 'ruins', resources, reduced);
  const weather = createWeatherSystem(scene, model, resources, reduced, {
    type: options.weather,
    surfaces: weatherSurfaces,
  });
  stage.dataset.weather = weather.type;
  const project = (x, y, z) => new THREE.Vector3(x, y, z).project(camera);
  function beginMotion(r, goal, from = null, delay = 0) {
    if (from) r.root.position.copy(from);
    r.motion = {
      from: r.root.position.clone(),
      to: goal.clone(),
      start: performance.now() + delay,
      duration: reduced ? 1 : 560 / animationSpeed,
    };
    r.goal.copy(goal);
    schedule();
  }
  function screenToWorld(rect) {
    const bounds = stage.getBoundingClientRect(),
      mouse = new THREE.Vector2(
        ((rect.left + rect.width / 2 - bounds.left) / width) * 2 - 1,
        1 - ((rect.top + rect.height / 2 - bounds.top) / height) * 2,
      );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(mouse, camera);
    return ray.ray.intersectPlane(
      new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.32),
      new THREE.Vector3(),
    );
  }
  function draw(s, forecast, selected, enemySelected, playing = false, origins = new Map()) {
    if (disposed) return;
    if (!playing && s.phase === 'plan') deaths.releaseCinematic();
    if (playing) clearHints();
    const formation = playing ? s.formation : forecast.final.formation,
      frontIds = new Set(formation.slice(0, 3).filter(Boolean)),
      available = friendRecords.filter((r) => !r.id || !frontIds.has(r.id)),
      next = new Map();
    emptySlots.forEach((el, slot) => {
      el.hidden = playing || !!formation[slot];
    });
    for (let slot = 0; slot < 3; slot++) {
      const id = formation[slot];
      if (!id) continue;
      const r =
        assignments.get(id) || available.shift() || friendRecords.find((rec) => !next.has(rec.id));
      if (!r) continue;
      const goal = new THREE.Vector3([-3.014, 0, 3.014][slot], 0.12, 2.345),
        incoming = r.id !== id;
      let from = releasedPositions.get(id) || null;
      releasedPositions.delete(id);
      if (incoming && !from && origins.has(id)) {
        from = screenToWorld(origins.get(id));
        if (from) {
          from.y = 0.15;
        }
      }
      if (first) from = new THREE.Vector3(goal.x, 0.25, goal.z + 1.6);
      if (instantNextDraw) {
        r.root.position.copy(goal);
        r.goal.copy(goal);
        r.root.rotation.set(0, 0, 0);
        r.motion = null;
        r.attack = null;
      } else if (incoming || first || r.goal.distanceTo(goal) > 0.001)
        beginMotion(r, goal, from, first ? slot * 65 : 0);
      r.id = id;
      r.slot = slot;
      next.set(id, r);
    }
    assignments = next;
    for (const record of friendRecords) {
      if (!next.has(record.id)) {
        record.id = null;
        record.root.visible = false;
        record.el.hidden = true;
        delete record.el.dataset.unit;
        delete record.el.dataset.dragunit;
        delete record.el.dataset.side;
        record.el.replaceChildren();
        record.motion = null;
      }
    }
    if (first)
      enemyRecords.forEach((r, i) =>
        beginMotion(r, r.goal, new THREE.Vector3(r.goal.x, 0.2, r.goal.z - 1.2), i * 70),
      );
    first = false;
    for (const r of records) {
      if (!r.id) continue;
      const { id, side, slot, root, el } = r,
        u = s.units[id],
        f = forecast.final.units[id],
        d = definitions[id];
      const combined =
        side === 'Friendly' && u.hp > 0 && !!(u.combined || (!playing && f.combined));
      const canAwaken =
        side === 'Friendly' &&
        u.hp > 0 &&
        selected === id &&
        !!d.emblemId &&
        (playing ? u : f).emblemCharge === 6 &&
        !combined;
      r.emblemActive = combined;
      r.emblemSelected = combined && selected === id;
      el.classList.toggle('combined-unit', combined);
      el.classList.toggle('combined-selected', r.emblemSelected);
      el.classList.toggle('can-awaken', canAwaken);
      r.restScale = d.boss ? 1.08 : 1;
      if (side === 'Friendly') {
        root.visible = true;
        el.hidden = false;
      }
      if (side === 'Enemy') {
        root.visible = u.hp > 0 || (r.previousHp > 0 && !deaths.has(id)) || deaths.holding(id);
        r.previousHp = u.hp;
        el.hidden = u.hp === 0;
      }
      root.scale.setScalar(r.restScale);
      root.traverse((o) => {
        if (o.isMesh) {
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          ms.forEach((m) =>
            m.color
              .copy(m.userData.baseColor)
              .multiplyScalar(u.hp === 0 && side === 'Friendly' ? 0.3 : 1),
          );
          if (o.name.endsWith('_Artwork') && o.material.map !== textures[id]) {
            o.material.map = textures[id];
            o.material.needsUpdate = true;
          }
        }
      });
      el.classList.toggle('selected', (side === 'Friendly' ? selected : enemySelected) === id);
      el.classList.toggle('fallen', u.hp === 0);
      el.classList.toggle('forecast-dead', f.hp === 0 && u.hp > 0);
      el.style.setProperty('--unit', d.color);
      el.dataset.unit = id;
      el.dataset.side = side;
      el.dataset.slot = slot;
      if (side === 'Friendly') el.dataset.dragunit = id;
      el.disabled = playing;
      el.setAttribute(
        'aria-label',
        `${d.name}，${side === 'Friendly' ? '我方' : '敌方'}${['左', '中', '右'][slot]}位，生命${u.hp}，预计${f.hp}`,
      );
      const markupString = html`<svg
          class="selection-frame"
          viewBox="0 0 100 140"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <rect
            x="1"
            y="1"
            width="98"
            height="138"
            rx="2"
            vector-effect="non-scaling-stroke"
          /></svg
        ><span class="card-buffs"
          >${statusIcons(s, id, forecast.final, playing ? [] : forecast.events)}</span
        ><span class="attack-drop-mark" aria-hidden="true"
          ><svg viewBox="0 0 40 40">
            <g fill="#f0e3ba" stroke="#213632" stroke-width="1">
              <g transform="translate(20 20) rotate(-43)">
                <path d="M-2-16 0-19 2-16 2 7-2 7z" />
                <path d="M-6 5h12v3H2v9h-4V8h-4z" />
              </g>
              <g transform="translate(20 20) rotate(43)">
                <path d="M-2-16 0-19 2-16 2 7-2 7z" />
                <path d="M-6 5h12v3H2v9h-4V8h-4z" />
              </g>
            </g></svg></span
        >${
          canAwaken
            ? html`<span class="awaken-drop-mark" aria-hidden="true"
                ><svg viewBox="0 0 48 48">
                  <g fill="#d8f8ff" stroke="#123d54" stroke-width="1.2">
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      fill="#14394ce6"
                      stroke="#68ddff"
                      stroke-width="2.5"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r="15"
                      fill="none"
                      stroke="#a4f0ff"
                      stroke-width="1.2"
                      stroke-dasharray="3 3"
                    />
                    <g transform="translate(24 24)">
                      <path d="M0-11L3-3L11 0L3 3L0 11L-3 3L-11 0L-3-3Z" fill="#bdf7ff" />
                      <circle cx="0" cy="0" r="2.5" fill="#ffffff" />
                    </g>
                  </g></svg
              ></span>`
            : ''
        }${side === 'Enemy' ? html`<small class="enemy-level">Lv.${u.level || 1}</small>` : ''}<span
          class="unit-info"
          ><span class="unit-name">${d.name}${u.hp === 0 ? ' ×' : ''}</span></span
        ><span class="unit-resources">${resourceBars(u, f)}</span
        >${emblemRing(d, u, selected === id, playing ? u : f)}`;
      if (el.innerHTML !== markupString) el.innerHTML = markupString;
      el.onclick = () => onUnitClick(id, side, slot);
    }
    ambience.select(friendRecords.find((r) => r.id === selected)?.slot ?? -1);
    instantNextDraw = false;
    positions();
    renderer.render(scene, camera);
    schedule();
  }
  function clearHints() {
    intentData = null;
    renderedIntent = '';
    intentLayer?.replaceChildren();
    records.forEach((r) => r.el.classList.remove('drop-target', 'drop-incoming'));
  }
  function renderIntent() {
    if (!intentLayer) return;
    if (!intentData) {
      if (renderedIntent) intentLayer.replaceChildren();
      renderedIntent = '';
      return;
    }
    const markupString = intentData.map(intentMarkup).join('');
    if (renderedIntent !== markupString) {
      intentLayer.innerHTML = markupString;
      renderedIntent = markupString;
    }
  }
  function intentMarkup(data) {
    const r = enemyRecords.find((r) => r.id === data.id);
    if (!r) return '';
    const xy = (x, y, z) => {
        const p = project(x, y, z);
        return { x: (p.x * 0.5 + 0.5) * width, y: (-p.y * 0.5 + 0.5) * height };
      },
      origin = xy(r.root.position.x, r.root.position.y + 0.4, r.root.position.z + 1.14),
      head = xy(r.root.position.x, r.root.position.y + 0.38, r.root.position.z - 1.28);
    const badge = html`<section
      class="enemy-intent-summary"
      data-enemy-intent="${data.id}"
      style="left:${head.x}px;top:${head.y - 8}px;--intent-width:${Math.max(86, Math.min(178, r.el.offsetWidth + 16))}px"
      aria-label="${escapeText(data.name)}的行动预演"
    >
      ${enemyIntentBadge(data)}
    </section>`;
    let markupString;
    if (data.cancelled) {
      markupString = badge;
    } else {
      let paths = '';
      for (const t of data.targets) {
        const target = xy([-3.014, 0, 3.014][t.slot], 0.5, 2.345 - 1.2),
          bend = origin.x + (target.x - origin.x) * 0.5 + (target.x === origin.x ? 30 : 0),
          midY = (origin.y + target.y) / 2;
        paths += html`<path
          class="intent-path"
          data-intent-enemy="${data.id}"
          data-intent-slot="${t.slot}"
          data-target="${t.id}"
          d="M ${origin.x.toFixed(1)} ${origin.y.toFixed(1)} Q ${bend.toFixed(1)} ${midY.toFixed(1)} ${target.x.toFixed(1)} ${target.y.toFixed(1)}"
          marker-end="url(#intent-arrow-tip-${data.id})"
        />`;
      }
      markupString = html`<svg
          class="intent-arrows"
          viewBox="0 0 ${width} ${height}"
          aria-label="${escapeText(data.move)}"
        >
          <defs>
            <marker
              id="intent-arrow-tip-${data.id}"
              markerWidth="7"
              markerHeight="7"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0 0L6 3L0 6z" fill="#ffe2a1" />
            </marker>
          </defs>
          ${paths}</svg
        >${badge}`;
    }
    return markupString;
  }
  function positions() {
    emptySlots.forEach((el, slot) => {
      const a = project([-3.014, 0, 3.014][slot] - 0.86, 0.38, 2.345 - 1.28);
      const b = project([-3.014, 0, 3.014][slot] + 0.86, 0.38, 2.345 + 1.28);
      Object.assign(el.style, {
        left: `${(a.x * 0.5 + 0.5) * width}px`,
        top: `${(-a.y * 0.5 + 0.5) * height}px`,
        width: `${(b.x - a.x) * 0.5 * width}px`,
        height: `${(a.y - b.y) * 0.5 * height}px`,
      });
    });
    for (const r of records) {
      if (!activeDrag) r.el.classList.remove('drop-target', 'drop-incoming');
      const p = activeDrag?.record === r ? r.goal : r.root.position,
        a = project(p.x - 0.86, p.y + 0.38, p.z - 1.28),
        b = project(p.x + 0.86, p.y + 0.38, p.z + 1.28);
      Object.assign(r.el.style, {
        left: `${(a.x * 0.5 + 0.5) * width}px`,
        top: `${(-a.y * 0.5 + 0.5) * height}px`,
        width: `${(b.x - a.x) * 0.5 * width}px`,
        height: `${(a.y - b.y) * 0.5 * height}px`,
      });
      const base = project(p.x, 0.02, p.z + 1.54);
      r.el.style.setProperty('--field-resource-top', `${(a.y - base.y) * 0.5 * height + 2}px`);
    }
    renderIntent();
  }
  function tick(now) {
    raf = 0;
    if (disposed) return;
    if (document.hidden) return;
    if (document.querySelector('dialog[open]') && !deaths.cinematicActive()) return;
    if (!frameBudget.accepts(now)) {
      schedule();
      return;
    }
    let moving = ambience.update(now);
    moving = emblemAura.update(records, now) || moving;
    moving = weather.update(now) || moving;
    for (const r of records) {
      if (activeDrag?.record === r) continue;
      if (r.motion) {
        const m = r.motion,
          t = Math.max(0, Math.min(1, (now - m.start) / m.duration)),
          ease = t * t * t * (t * (t * 6 - 15) + 10);
        r.root.position.lerpVectors(m.from, m.to, ease);
        r.root.position.y += Math.sin(t * Math.PI) * 0.42;
        r.root.rotation.y = Math.sin(t * Math.PI) * 0.045;
        if (t === 1) {
          r.root.position.copy(m.to);
          r.root.rotation.y = 0;
          r.motion = null;
        } else moving = true;
      } else r.root.position.copy(r.goal);
      if (r.attack) {
        const a = r.attack,
          t = Math.min(1, (now - a.start) / a.duration);
        r.root.position.z += Math.sin(Math.max(0, (t - 0.22) / 0.78) * Math.PI) * a.distance;
        r.root.position.y += Math.sin(t * Math.PI) * (a.lift || 0.13);
        r.root.rotation.x = Math.sin(t * Math.PI) * (a.tilt || 0);
        if (t === 1) {
          r.attack = null;
          r.root.rotation.x = 0;
        } else moving = true;
      }
      if (r.hit) {
        const h = r.hit,
          t = Math.max(0, Math.min(1, (now - h.start) / h.duration));
        r.root.traverse((o) => {
          if (o.isMesh)
            (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
              m.emissive
                ?.copy(m.userData.baseEmission)
                .add(new THREE.Color(0.38, 0.22, 0.12).multiplyScalar(Math.sin(t * Math.PI))),
            );
        });
        r.root.position.x += Math.sin(t * Math.PI * 5) * (1 - t) * 0.055;
        r.root.rotation.z = Math.sin(t * Math.PI * 4) * (1 - t) * 0.025;
        if (t === 1) {
          r.hit = null;
          r.root.rotation.z = 0;
        } else moving = true;
      }
    }
    if (activeDrag) {
      const d = activeDrag;
      d.root.position.lerp(d.target, reduced ? 1 : 0.42);
      d.root.rotation.x += (0.14 - d.root.rotation.x) * 0.3;
      moving = true;
    }
    moving = deaths.update(now) || moving;
    positions();
    renderer.render(scene, camera);
    if (moving) schedule();
  }
  function schedule() {
    if (!disposed && !raf) raf = requestAnimationFrame(tick);
  }
  function resize() {
    if (disposed) return;
    width = stage.clientWidth;
    height = stage.clientHeight;
    const aspect = width / height,
      h = Math.max(5.85, 6.7 / aspect);
    Object.assign(camera, { left: -h * aspect, right: h * aspect, top: h, bottom: -h });
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    renderer.setSize(width, height, false);
    renderer.setPixelRatio(deviceRenderQuality().pixelRatio);
    positions();
    renderer.render(scene, camera);
    schedule();
  }
  function center(id) {
    const el =
      layer.querySelector(`[data-unit="${id}"]`) || document.querySelector(`[data-rear="${id}"]`);
    if (!el) return null;
    const a = el.getBoundingClientRect(),
      b = stage.getBoundingClientRect();
    return {
      x: a.left + a.width / 2 - b.left,
      y: a.top + a.height / 2 - b.top,
      width: a.width,
      height: a.height,
    };
  }
  const fx = createEffects(effects, center, () => animationSpeed);
  function playEvent(e, before) {
    if (disposed) return;
    const duration = fx.play(e, before, records);
    const deathDelay = ['hero', 'enemy'].includes(e.type) ? duration * 0.7 : 0;
    for (const r of enemyRecords) {
      if (before.units[r.id]?.hp > 0 && e.after.units[r.id]?.hp === 0) {
        deaths.play(r, definitions[r.id], deathDelay);
      }
    }
    schedule();
    return duration;
  }
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();
  events.on(document, 'visibilitychange', schedule);
  const modalObserver = new MutationObserver(schedule);
  modalObserver.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ['open'],
  });
  events.on(canvas, 'wheel', (e) => e.preventDefault(), { passive: false });
  const dragRay = new THREE.Raycaster(),
    dragPointer = new THREE.Vector2(),
    dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.8),
    dragPoint = new THREE.Vector3();
  function pointerWorld(x, y, lift = 0.8) {
    const rect = stage.getBoundingClientRect();
    dragPointer.set(((x - rect.left) / width) * 2 - 1, 1 - ((y - rect.top) / height) * 2);
    dragRay.setFromCamera(dragPointer, camera);
    dragPlane.constant = -lift;
    return dragRay.ray.intersectPlane(dragPlane, dragPoint);
  }
  function startDrag(id, x, y, rect) {
    if (activeDrag || disposed) return false;
    const record = assignments.get(id),
      root = record ? record.root : friendRecords[0].root.clone(true);
    if (!record) {
      root.visible = true;
      root.traverse((o) => {
        if (o.isMesh) {
          const own = (m) => {
            const c = m.clone();
            c.userData.baseColor =
              m.userData?.baseColor?.clone() || m.color?.clone() || new THREE.Color(0xffffff);
            c.userData.baseEmission =
              m.userData?.baseEmission?.clone() || m.emissive?.clone() || new THREE.Color(0);
            return c;
          };
          o.material = Array.isArray(o.material) ? o.material.map(own) : own(o.material);
          const ms = Array.isArray(o.material) ? o.material : [o.material];
          dragMaterials.push(...ms);
          ms.forEach((m) => {
            if (m.userData?.baseColor) m.color.copy(m.userData.baseColor);
          });
          if (o.name.endsWith('_Artwork') && textures[id]) {
            o.material.map = textures[id];
            o.material.needsUpdate = true;
          }
        }
      });
      const start = screenToWorld(rect);
      root.position.copy(start);
      root.scale.setScalar(1);
      root.rotation.set(0, 0, 0);
      scene.add(root);
    } else {
      record.motion = null;
      record.el.classList.add('is-drag-source');
    }
    const initial = pointerWorld(x, y),
      offset = root.position.clone().sub(initial);
    offset.y = 0;
    activeDrag = { id, root, record, target: root.position.clone(), offset };
    schedule();
    return true;
  }
  function moveDrag(x, y) {
    if (!activeDrag) return;
    const p = pointerWorld(x, y);
    if (p) activeDrag.target.copy(p).add(activeDrag.offset);
    schedule();
  }
  function endDrag() {
    if (!activeDrag) return;
    const d = activeDrag;
    activeDrag = null;
    releasedPositions.set(d.id, d.root.position.clone());
    lastDragRelease = { id: d.id, position: d.root.position.toArray() };
    if (d.record) {
      d.record.el.classList.remove('is-drag-source');
      d.root.rotation.x = 0;
      beginMotion(d.record, d.record.goal);
    } else {
      scene.remove(d.root);
    }
    schedule();
  }
  function cancelReleasedDrag(id) {
    releasedPositions.delete(id);
  }
  return {
    draw,
    camera,
    renderer,
    model,
    resize,
    playEvent,
    artStatus: () => ({ ...ambience.stats(), outerEnvironment }),
    emblemStatus: emblemAura.status,
    weatherStatus: weather.stats,
    deathStatus: deaths.stats,
    floorStatus: () => ({ ...floorStatus }),
    clearHints,
    snapFormationOnNextDraw() {
      instantNextDraw = true;
      releasedPositions.clear();
      records.forEach((r) => {
        r.motion = null;
        r.attack = null;
        r.root.position.copy(r.goal);
        r.root.rotation.set(0, 0, 0);
      });
    },
    showIntent(data) {
      intentData = data;
      renderIntent();
    },
    startDrag,
    moveDrag,
    endDrag,
    cancelReleasedDrag,
    releaseStatus: () => (lastDragRelease ? structuredClone(lastDragRelease) : null),
    motionStatus() {
      return friendRecords
        .filter((record) => record.id)
        .map((record) => ({
          id: record.id,
          visible: record.root.visible,
          position: record.root.position.toArray(),
          from: record.motion?.from.toArray() || null,
          to: record.goal.toArray(),
        }));
    },
    dragState() {
      return activeDrag
        ? {
            id: activeDrag.id,
            source: activeDrag.record ? 'front' : 'hand',
            visible: activeDrag.root.visible,
            position: activeDrag.root.position.toArray(),
            goal: activeDrag.record?.goal.toArray(),
            meshes: (() => {
              let n = 0;
              activeDrag.root.traverse((o) => {
                if (o.isMesh) n++;
              });
              return n;
            })(),
          }
        : null;
    },
    setSpeed(n) {
      animationSpeed = n;
    },
    isAnimating() {
      return !!activeDrag || records.some((r) => r.motion || r.attack);
    },
    dispose() {
      endDrag();
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      modalObserver.disconnect();
      events.dispose();
      deaths.dispose();
      dragMaterials.forEach((m) => resources.material(m));
      resources.object(scene);
      resources.dispose();
      ambience.dispose();
      weather.dispose();
      fx.dispose();
      renderer.dispose();
      layer.replaceChildren();
      effects.replaceChildren();
      intentLayer?.replaceChildren();
    },
  };
}
