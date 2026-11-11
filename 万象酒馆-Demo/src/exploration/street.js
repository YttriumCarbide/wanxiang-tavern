import * as THREE from 'three';
import { createEventScope } from '../shared/events.js';
import { createResourceScope } from '../shared/resources.js';
import { deviceRenderQuality, createFrameBudget } from '../shared/render-budget.js';
import { explorationScene, explorationHref } from './scenes.js';
import { createStreetScene } from './street-scene.js';
import { createSceneLoading } from '../shared/scene-loading.js';
import { createIllustratedStreet, illustratedImage } from './illustrated-street.js';
import { createInvestigationPointer } from './investigation-pointer.js';
import { createSceneVisitors } from '../tavern/visitor-scene.js';
import { createWorldMap } from './world-map.js';

export async function createStreetView() {
  const query = new URLSearchParams(location.search);
  const definition = { ...explorationScene(query.get('scene')) };
  const illustrated = !!definition.illustration;
  const fixed = definition.illustration?.fixed === true;
  const enteredFrom = query.get('from');
  let timeOfDay = query.get('time') === 'night' ? 'night' : 'day';
  if (query.get('art-reference') === 'panorama') definition.panoramaBand = null;
  const viewDefaults = {
    fov: definition.fov ?? 65,
    yaw: definition.initialYaw ?? 0,
    pitch: definition.initialPitch ?? 0.04,
  };
  document.body.dataset.scene = definition.id;
  document.body.dataset.timeOfDay = timeOfDay;
  if (fixed) document.body.dataset.fixedView = 'true';
  document.title = '万象酒馆 · ' + definition.name;
  document.querySelector('.street-header h1').textContent = definition.title;
  const returnButton = document.getElementById('street-return');
  returnButton.setAttribute('aria-label', '返回' + definition.returnLabel);
  returnButton.lastChild.textContent = ' ' + definition.returnLabel;
  const loading = createSceneLoading(
    document.getElementById('street-status'),
    '正在前往' + definition.title,
  );
  const events = createEventScope();
  const mapDialog = document.getElementById('street-map');
  const worldMap = createWorldMap({
    dialog: mapDialog,
    events,
    scene: definition.id,
    onTravel(to) {
      mapDialog.close();
      parent.postMessage({ type: 'daily-overland-plan', to }, location.origin);
    },
  });
  function postMapState(open) {
    parent.postMessage({ type: 'street-map-state', open }, location.origin);
  }
  events.on(document.getElementById('street-map-open'), 'click', () => {
    worldMap.open();
    postMapState(true);
  });
  events.on(mapDialog, 'close', () => {
    if (!mapDialog.open) postMapState(false);
  });
  const resources = createResourceScope();
  const quality = deviceRenderQuality();
  const budget = createFrameBudget(quality.fps);
  const canvas = document.querySelector('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias });
  renderer.setPixelRatio(quality.pixelRatio);
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#9596b1');
  const camera = illustrated
    ? new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.01, 100)
    : new THREE.PerspectiveCamera(viewDefaults.fov, innerWidth / innerHeight, 0.08, 220);
  camera.rotation.order = 'YXZ';
  camera.position.set(...(illustrated ? [0, 0, 10] : definition.eye));
  canvas.setAttribute(
    'aria-label',
    definition.title +
      (fixed
        ? '，固定视角，点击出入口或人物'
        : illustrated
          ? '，在整幅街景中自由拖动，方向键微调，点击调查与交谈'
          : '全景，拖动或方向键环视，站位固定'),
  );
  if (illustrated) {
    document.body.dataset.illustrated = 'true';
  }
  if (parent !== window) document.documentElement.dataset.embedded = 'true';
  const inspector = document.getElementById('street-inspector');
  const buttons = new Map();
  const projected = new THREE.Vector3();
  const toward = new THREE.Vector3();
  const ray = new THREE.Raycaster();
  let yaw = viewDefaults.yaw,
    pitch = viewDefaults.pitch,
    drag = null,
    active = null,
    model = null;
  let disposed = false,
    leaving = false,
    frames = 0,
    needsRender = true;
  let exitTimer = null;
  let visitors = null;
  let chapterContext = null;
  let invitationLocked = false;
  let travelLocked = false;
  async function updateTime(value) {
    if (!['day', 'night'].includes(value) || value === timeOfDay) return;
    timeOfDay = value;
    document.body.dataset.timeOfDay = value;
    try {
      if ((await model?.setTime?.(value)) && !disposed) needsRender = true;
    } catch (error) {
      if (!disposed && error.name !== 'AbortError') console.warn('无法载入当前时段的街景', error);
    }
  }
  events.on(window, 'message', (event) => {
    if (
      event.origin === location.origin &&
      event.source === parent &&
      event.data?.type === 'daily-managed'
    ) {
      invitationLocked = event.data.invitation === true;
      travelLocked = event.data.outing?.locked === true || event.data.outing?.remaining === 0;
      worldMap.updateTravel(event.data.outing);
      void updateTime(event.data.timeOfDay);
    }
  });
  const presentNpcs = document.createElement('aside');
  presentNpcs.id = 'street-present-npcs';
  presentNpcs.innerHTML = '<small>在场 NPC</small><p></p>';
  presentNpcs.hidden = true;
  document.body.append(presentNpcs);
  const investigation = createInvestigationPointer({
    canvas,
    camera,
    events,
    model: () => model,
    context: () => chapterContext,
    scene: definition.id,
  });
  events.on(window, 'message', (event) => {
    if (
      event.origin !== location.origin ||
      event.source !== parent ||
      event.data?.type !== 'starbell-context'
    )
      return;
    chapterContext = event.data.enabled ? event.data : null;
    const npcs = Array.isArray(event.data.npcs) ? event.data.npcs : [];
    presentNpcs.querySelector('p').textContent = npcs.map((npc) => npc.name).join('、');
    presentNpcs.hidden = !npcs.length;
    investigation.hide();
  });

  function closeInspection() {
    inspector.hidden = true;
    active = null;
    for (const button of buttons.values()) button.setAttribute('aria-expanded', 'false');
  }
  function inspect(id) {
    const point = definition.points.find((entry) => entry.id === id);
    if (!point || disposed || leaving) return;
    active = id;
    document.getElementById('inspection-kind').textContent = point.kind;
    document.getElementById('inspection-name').textContent = point.name;
    document.getElementById('inspection-text').textContent =
      chapterContext && definition.id === 'city-center' && ['clock', 'guild'].includes(id)
        ? chapterContext.phase === 'day3'
          ? '警钟已经传到城里。沿星灯架引导的路，居民正前往石厅避难。'
          : '钟楼下正在筹备星灯祭。灯架和桌椅尚未摆齐，居民在为节日后的生活作着打算。'
        : point.text;
    const action = document.getElementById('inspection-return');
    action.hidden = !point.destination;
    action.textContent = point.actionLabel || point.name + ' →';
    inspector.hidden = false;
    inspector.scrollTop = 0;
    if (parent !== window)
      parent.postMessage(
        { type: 'starbell-observe', scene: definition.id, point: id },
        location.origin,
      );
    for (const [key, button] of buttons) button.setAttribute('aria-expanded', String(key === id));
  }
  function leave(destination = definition.returnDestination) {
    if (leaving || disposed) return;
    if (travelLocked) return;
    if (invitationLocked) {
      parent.postMessage({ type: 'daily-invitation-leave' }, location.origin);
      return;
    }
    const href = explorationHref(destination, timeOfDay, definition.id);
    leaving = true;
    document.body.classList.add('leaving');
    exitTimer = setTimeout(() => {
      location.href = href;
    }, 340);
  }
  for (const point of definition.points) {
    const button = document.createElement('button');
    button.className = 'street-point';
    button.dataset.hotspot = point.id;
    button.dataset.kind = point.kind;
    button.setAttribute('aria-expanded', 'false');
    const symbol = document.createElement('span');
    symbol.className = 'point-symbol';
    symbol.setAttribute('aria-hidden', 'true');
    symbol.textContent = '◇';
    button.setAttribute('aria-label', point.name);
    const label = document.createElement('span');
    label.className = 'point-label';
    label.textContent = point.name;
    button.append(symbol, label);
    button.hidden = true;
    events.on(button, 'click', () =>
      point.destination ? leave(point.destination) : inspect(point.id),
    );
    buttons.set(point.id, button);
    document.getElementById('street-points').append(button);
  }
  function updatePoints() {
    camera.updateMatrixWorld();
    const occupied = [];
    for (const point of definition.points) {
      const button = buttons.get(point.id);
      if (!point.destination) {
        button.hidden = true;
        continue;
      }
      const anchor = illustrated ? model?.pointAnchor(point.id) : point.anchor;
      if (!anchor) {
        button.hidden = true;
        continue;
      }
      projected.set(...anchor);
      toward.copy(projected).sub(camera.position);
      const distance = toward.length();
      projected.project(camera);
      let visible =
        !!model &&
        projected.z > -1 &&
        projected.z < 1 &&
        Math.abs(projected.x) < 0.86 &&
        Math.abs(projected.y) < (illustrated ? 0.86 : 0.7);
      if (visible) {
        if (illustrated) ray.setFromCamera(projected, camera);
        else ray.set(camera.position, toward.normalize());
        ray.far = Math.max(0.1, distance - 0.28);
        visible = !ray.intersectObject(model.root, true).some((hit) => model.acceptsHit(hit));
      }
      button.hidden = !visible;
      if (!visible) continue;
      const x = ((projected.x + 1) * innerWidth) / 2;
      let y = ((1 - projected.y) * innerHeight) / 2;
      const width = button.offsetWidth,
        height = button.offsetHeight;
      for (const previous of occupied)
        if (
          Math.abs(previous.x - x) < (previous.width + width) / 2 + 6 &&
          Math.abs(previous.y - y) < height + 7
        )
          y = previous.y + height + 8;
      if (y + height / 2 > innerHeight - 70) {
        button.hidden = true;
        continue;
      }
      button.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)`;
      occupied.push({ x, y, width });
    }
  }
  function apply() {
    investigation.hide();
    if (illustrated) {
      needsRender = true;
      updatePoints();
      return;
    }
    yaw = THREE.MathUtils.euclideanModulo(yaw + Math.PI, Math.PI * 2) - Math.PI;
    camera.rotation.set(pitch, yaw, 0);
    needsRender = true;
    updatePoints();
  }
  function resize() {
    investigation.hide();
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    if (illustrated) model?.resize(camera, camera.aspect);
    camera.updateProjectionMatrix();
    needsRender = true;
    updatePoints();
  }
  function adjustView(action) {
    if (!illustrated || fixed || !model || disposed || leaving) return;
    closeInspection();
    if (action === 'reset') model.reset();
    else model.drag(action === 'left' ? 0.1 : -0.1, 0);
    apply();
  }
  events.on(window, 'resize', resize);
  events.on(returnButton, 'click', () => leave());
  events.on(document.getElementById('inspection-return'), 'click', () => {
    const point = definition.points.find((entry) => entry.id === active);
    if (point?.destination) leave(point.destination);
  });
  events.on(document.getElementById('inspection-close'), 'click', closeInspection);
  events.on(canvas, 'pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    canvas.focus({ preventScroll: true });
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
  });
  events.on(canvas, 'pointermove', (event) => {
    if (!drag) {
      investigation.move(event.clientX, event.clientY);
      return;
    }
    if (event.pointerId !== drag.id) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 7) drag.moved = true;
    if (drag.moved) investigation.hide();
    if (fixed) return;
    if (illustrated) {
      model?.drag((event.clientX - drag.x) / innerWidth, (event.clientY - drag.y) / innerHeight);
      drag.x = event.clientX;
      drag.y = event.clientY;
      needsRender = true;
      return;
    }
    yaw -= (event.clientX - drag.x) * 0.0045;
    pitch = THREE.MathUtils.clamp(pitch - (event.clientY - drag.y) * 0.003, -0.55, 0.7);
    drag.x = event.clientX;
    drag.y = event.clientY;
    apply();
  });
  events.on(canvas, 'pointerup', (event) => {
    const tap = drag && drag.id === event.pointerId && !drag.moved;
    drag = null;
    if (tap) {
      if (investigation.tap(event.clientX, event.clientY)) return;
      const visitor = visitors?.pick(event.clientX, event.clientY);
      if (visitor) {
        parent.postMessage(
          {
            type: 'tavern-talk',
            place:
              definition.id === 'city-center'
                ? 'city-square'
                : definition.id === 'starlamp-street'
                  ? 'street'
                  : definition.id,
            characterId: visitor.id,
          },
          location.origin,
        );
        return;
      }
    }
    if (!tap || !model) return;
    ray.setFromCamera(
      new THREE.Vector2(
        (event.clientX / innerWidth) * 2 - 1,
        1 - (event.clientY / innerHeight) * 2,
      ),
      camera,
    );
    ray.far = camera.far;
    const hit = ray.intersectObjects(model.cutouts).find((entry) => model.acceptsHit(entry));
    if (hit) {
      inspect(hit.object.userData.point);
      return;
    }
    closeInspection();
  });
  events.on(canvas, 'pointercancel', () => {
    drag = null;
  });
  events.on(window, 'blur', () => {
    drag = null;
  });
  events.on(window, 'keydown', (event) => {
    if (mapDialog.open || event.target.closest('input, textarea, select')) return;
    if (event.key === 'Escape') {
      closeInspection();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (fixed) return;
    if (illustrated) {
      event.preventDefault();
      closeInspection();
      model?.drag(
        event.key === 'ArrowLeft' ? 0.1 : event.key === 'ArrowRight' ? -0.1 : 0,
        event.key === 'ArrowUp' ? 0.02 : event.key === 'ArrowDown' ? -0.02 : 0,
      );
      apply();
      return;
    }
    event.preventDefault();
    if (event.key === 'ArrowLeft') yaw += 0.12;
    if (event.key === 'ArrowRight') yaw -= 0.12;
    if (event.key === 'ArrowUp') pitch = Math.min(0.7, pitch + 0.07);
    if (event.key === 'ArrowDown') pitch = Math.max(-0.55, pitch - 0.07);
    apply();
  });
  function dispose() {
    if (disposed) return;
    disposed = true;
    loading.dispose();
    investigation.dispose();
    presentNpcs.remove();
    visitors?.dispose();
    clearTimeout(exitTimer);
    renderer.setAnimationLoop(null);
    events.dispose();
    resources.object(scene);
    resources.dispose();
    renderer.dispose();
    window.streetPreview = null;
    window.modelReady = false;
  }
  events.on(window, 'pagehide', dispose, { once: true });
  resize();
  apply();
  renderer.setAnimationLoop((now) => {
    let covered = document.hidden || mapDialog.open;
    try {
      covered ||= !!parent.document.querySelector('dialog[open], .gal-stage:not([hidden])');
    } catch {
      /* Standalone preview. */
    }
    if (covered || !needsRender || !budget.accepts(now)) return;
    const moving = !!model?.update(camera, now);
    visitors?.update();
    if (illustrated) updatePoints();
    renderer.render(scene, camera);
    frames++;
    needsRender = moving;
  });
  try {
    const files = [
      ...(illustrated
        ? [illustratedImage(definition.illustration, timeOfDay)]
        : definition.spatial
          ? Object.values(definition.spatial.art)
          : [definition.panorama, ...(definition.panoramaBand ? [definition.panoramaBand] : [])]),
      ...(!illustrated && definition.ground ? [definition.ground.image] : []),
      ...definition.cutouts
        .filter((spec) => !illustrated && spec.kind !== 'character' && spec.kind !== 'npc')
        .map((spec) => spec.image),
    ];
    await loading.prepare(files);
    model = illustrated
      ? await createIllustratedStreet(scene, resources, definition, loading, timeOfDay, enteredFrom)
      : await createStreetScene(scene, resources, quality, definition, loading);
    await model.setTime?.(timeOfDay);
    resize();
    if (definition.visitors !== false) {
      visitors = await createSceneVisitors({
        scene,
        camera,
        model: model.root,
        acceptsObstruction: (hit) => model.acceptsHit(hit),
        placement: illustrated ? model.placement : null,
        flat: illustrated,
        sceneId: definition.id,
        events,
        assets: loading.assets,
        onChange: () => {
          if (!disposed) needsRender = true;
        },
      });
    }
    if (disposed) {
      visitors?.dispose();
      return { dispose };
    }
    visitors?.update();
    model.update(camera, 0);
    needsRender = true;
    updatePoints();
    await loading.finish(renderer, scene, camera);
    if (disposed) return { dispose };
    model.startArrival?.();
    needsRender = true;
    window.modelReady = true;
    window.streetPreview = {
      scene,
      camera,
      renderer,
      model,
      visitors: () => visitors?.status() ?? { enabled: false, spots: 0, characters: [] },
      definition,
      inspect,
      resetView: () => adjustView('reset'),
      look(y, p = viewDefaults.pitch) {
        if (illustrated) {
          model.reset();
          model.drag(y * 0.35, p * 0.1);
          apply();
          return;
        }
        yaw = y;
        pitch = THREE.MathUtils.clamp(p, -0.55, 0.7);
        apply();
      },
      state: () => ({
        sceneId: definition.id,
        timeOfDay,
        image: model.image,
        position: camera.position.toArray(),
        yaw,
        pitch,
        active,
        frames,
        moving: illustrated ? model.moving : false,
        framing: illustrated ? model.framing : null,
        visible: [...buttons].filter(([, b]) => !b.hidden).map(([id]) => id),
        rendering: {
          fps: quality.fps,
          pixelRatio: renderer.getPixelRatio(),
          calls: renderer.info.render.calls,
        },
      }),
      dispose,
    };
    parent.postMessage({ type: 'scene-ready', scene: definition.id }, location.origin);
  } catch (error) {
    if (disposed || error.name === 'AbortError') return { dispose };
    if (!disposed) loading.fail(error);
    dispose();
  }
  return { dispose };
}

await createStreetView();
