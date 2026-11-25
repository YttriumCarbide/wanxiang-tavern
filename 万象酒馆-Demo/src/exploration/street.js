import * as THREE from 'three';
import { createEventScope } from '../shared/events.js';
import { createResourceScope } from '../shared/resources.js';
import { deviceRenderQuality, createFrameBudget } from '../shared/render-budget.js';
import { explorationScene, explorationHref } from './scenes.js';
import { createStreetScene } from './street-scene.js';
import { createSceneLoading } from '../shared/scene-loading.js';
import { createIllustratedStreet, illustratedImage } from './illustrated-street.js';
import { createSceneVisitors } from '../tavern/visitor-scene.js';
import { GUEST_RECRUITMENT } from '../recruitment.js';
import { createWorldMap } from './world-map.js';
import { createCityDirectory } from './city-directory.js';
import { cityForScene } from '../city-directory.js';
import { createSceneEnvironment } from '../app/scene-environment.js';
import { SILVER_CROWN_TAVERN } from '../content/silver-crown-scenes.js';

export async function createStreetView() {
  const query = new URLSearchParams(location.search);
  const atlasOnly = query.get('atlas-only') === '1';
  const definition = { ...explorationScene(query.get('scene')) };
  const illustrated = !!definition.illustration;
  const pureBackdrop = Boolean(definition.illustration?.pureBackdrop);
  const fixed = definition.illustration?.fixed === true;
  const enteredFrom = query.get('from');
  let timeOfDay = query.get('time') === 'night' ? 'night' : 'day';
  if (query.get('art-reference') === 'panorama') definition.panoramaBand = null;
  if (atlasOnly) {
    document.documentElement.dataset.atlasOnly = 'true';
    const statusEl = document.getElementById('street-status');
    if (statusEl) {
      statusEl.hidden = true;
      statusEl.remove();
    }
  }
  const viewDefaults = {
    fov: definition.fov ?? 65,
    yaw: definition.initialYaw ?? 0,
    pitch: definition.initialPitch ?? 0.04,
  };
  document.body.dataset.scene = definition.id;
  document.body.dataset.timeOfDay = timeOfDay;
  if (fixed && !illustrated) document.body.dataset.fixedView = 'true';
  document.title = '万象酒馆 · ' + definition.name;
  document.querySelector('.street-header h1').textContent = definition.title;
  const returnButton = document.getElementById('street-return');
  returnButton.hidden = !definition.returnDestination;
  if (definition.returnDestination) {
    const label = definition.returnLabel || '返回酒馆';
    returnButton.setAttribute('aria-label', label.startsWith('返回') ? label : '返回' + label);
    returnButton.textContent = label;
  }
  const events = createEventScope();
  const mapDialog = document.getElementById('street-map');
  const stepOut = document.getElementById('street-map-step-out');
  const companions = document.getElementById('street-map-companions');
  let mapChoice = '';
  const worldMap = createWorldMap({
    dialog: mapDialog,
    events,
    scene: definition.id,
    onTravel(to) {
      mapChoice = 'route';
      parent.postMessage({ type: 'daily-overland-plan', to }, location.origin);
    },
  });
  function postMapState(open) {
    parent.postMessage({ type: 'street-map-state', open, choice: mapChoice }, location.origin);
  }
  function openAtlas(preview = false, questTarget = null) {
    mapChoice = '';
    stepOut.hidden = preview !== true;
    companions.hidden = stepOut.hidden;
    worldMap.open(questTarget);
    postMapState(true);
  }
  events.on(document.getElementById('street-map-open'), 'click', openAtlas);
  events.on(window, 'message', (event) => {
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === 'daily-open-atlas') {
      openAtlas(event.data.preview === true, event.data.questTarget);
    } else if (event.data?.type === 'daily-close-atlas') {
      mapChoice = 'route';
      if (mapDialog.open) mapDialog.close();
    } else if (event.data?.type === 'daily-reset-atlas-walker') {
      worldMap.resetWalker?.();
    }
  });
  events.on(stepOut, 'click', () => {
    mapChoice = 'walk';
    mapDialog.close();
  });
  events.on(document.getElementById('street-map-workshop'), 'click', () => {
    parent.postMessage({ type: 'tavern-workshop' }, location.origin);
  });
  events.on(companions, 'click', () => {
    parent.postMessage({ type: 'daily-outing-companions' }, location.origin);
  });
  events.on(mapDialog, 'close', () => {
    if (!mapDialog.open) postMapState(false);
  });
  if (atlasOnly) {
    if (parent !== window) document.documentElement.dataset.embedded = 'true';
    events.on(window, 'message', (event) => {
      if (event.origin !== location.origin || event.source !== parent) return;
      if (event.data?.type !== 'daily-managed') return;
      worldMap.updateTravel(event.data.outing);
      worldMap.updateDiscoveries(event.data.discoveries);
      worldMap.updateWorldState({
        exploration: event.data.exploration,
        skirmishes: event.data.skirmishes,
        unlockedDungeons: event.data.unlockedDungeons,
      });
    });
    const disposeAtlasOnly = () => {
      worldMap.dispose();
      events.dispose();
    };
    events.on(window, 'pagehide', (event) => {
      if (!event.persisted) disposeAtlasOnly();
    });
    openAtlas(true);
    parent.postMessage({ type: 'atlas-only-ready', scene: definition.id }, location.origin);
    return { dispose: disposeAtlasOnly };
  }
  const loading = createSceneLoading(
    document.getElementById('street-status'),
    '正在前往' + definition.title,
  );
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
  if (pureBackdrop) {
    document.body.dataset.pureBackdrop = 'true';
    const pointsLayer = document.getElementById('street-points');
    if (pointsLayer) pointsLayer.hidden = true;
  }
  const ambienceLayer = document.getElementById('street-ambience');
  if (ambienceLayer && !atlasOnly) {
    const moteCount = pureBackdrop ? 16 : 9;
    ambienceLayer.replaceChildren(
      ...Array.from({ length: moteCount }, (_, index) => {
        const mote = document.createElement('span');
        mote.className = 'street-ambience-mote';
        const size = 4 + ((index * 5) % 8);
        mote.style.width = `${size}px`;
        mote.style.height = `${size}px`;
        mote.style.left = `${(index * 17 + 7) % 94}%`;
        mote.style.top = `${(index * 23 + 11) % 88}%`;
        mote.style.setProperty('--dur', `${10 + (index % 6) * 2.5}s`);
        mote.style.setProperty('--delay', `${-((index * 1.9) % 10)}s`);
        mote.style.setProperty('--dx', `${((index % 5) - 2) * 12}px`);
        mote.style.setProperty('--dy', `${-18 - (index % 4) * 9}px`);
        return mote;
      }),
    );
  }
  if (parent !== window) document.documentElement.dataset.embedded = 'true';
  const citySubmapId = cityForScene(definition.id);
  const environment = createSceneEnvironment(document.body);
  const citySubmap = createCityDirectory({
    events,
    definition,
    onNavigate: (targetId) => leave(targetId),
    onOpenWorldMap: () => openAtlas(false),
    onAction: (action) => {
      if (!leaving && !disposed && window.modelReady === true)
        parent.postMessage(
          { ...action, cityId: citySubmapId, scene: definition.id },
          location.origin,
        );
    },
  });
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
  let inspectionExit = null;
  let visitors = null;
  let invitationLocked = false;
  let travelLocked = false;
  const talkButton = document.getElementById('scene-talk');
  events.on(talkButton, 'click', () => {
    if (talkButton.hidden || leaving || disposed || invitationLocked || travelLocked) return;
    parent.postMessage({ type: 'daily-street-talk', scene: definition.id }, location.origin);
  });
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
    if (event.origin !== location.origin || event.source !== parent) return;
    if (event.data?.type === 'daily-open-city-directory') {
      if (
        !leaving &&
        !disposed &&
        window.modelReady === true &&
        !document.querySelector('dialog[open]')
      )
        citySubmap.open();
      return;
    }
    if (event.data?.type === 'daily-managed') {
      invitationLocked = event.data.invitation === true;
      travelLocked = event.data.outing?.locked === true;
      document.body.classList.toggle('street-daily-outing', Boolean(event.data.outing));
      talkButton.hidden = event.data.talkVisible !== true;
      worldMap.updateTravel(event.data.outing);
      worldMap.updateDiscoveries(event.data.discoveries);
      worldMap.updateWorldState({
        exploration: event.data.exploration,
        skirmishes: event.data.skirmishes,
        unlockedDungeons: event.data.unlockedDungeons,
      });
      citySubmap.update({
        discoveries: event.data.discoveries,
        skirmishes: event.data.skirmishes,
        locked: travelLocked || invitationLocked,
      });
      const lead = event.data.environment;
      environment.show(
        event.data.invitation === true && lead?.cityId === citySubmapId ? lead : null,
      );
      void updateTime(event.data.timeOfDay);
    }
  });
  const visitorActions = document.createElement('div');
  visitorActions.className = 'street-visitor-actions';
  visitorActions.hidden = true;
  visitorActions.innerHTML =
    '<button type="button" data-visitor-talk>交流</button><button type="button" data-visitor-recruit>招募</button>';
  document.body.append(visitorActions);
  let visitorId = null;
  function contactVisitor(id, type = 'tavern-talk') {
    parent.postMessage(
      {
        type,
        place:
          definition.id === 'city-center'
            ? 'city-square'
            : definition.id === 'starlamp-street'
              ? 'street'
              : definition.id,
        characterId: id,
      },
      location.origin,
    );
  }
  events.on(visitorActions, 'click', (event) => {
    if (!visitorId || !event.target.closest('button')) return;
    contactVisitor(
      visitorId,
      event.target.closest('[data-visitor-recruit]') ? 'tavern-recruit' : 'tavern-talk',
    );
    visitorActions.hidden = true;
  });

  function cancelInspectionExit() {
    const animation = inspectionExit;
    inspectionExit = null;
    inspector.removeAttribute('inert');
    inspector.style.removeProperty('--inspection-from-opacity');
    inspector.style.removeProperty('--inspection-from-transform');
    animation?.cancel();
  }
  function hideInspection() {
    inspector.hidden = true;
    cancelInspectionExit();
  }
  function clearInspectionSelection() {
    const opener = buttons.get(active);
    active = null;
    opener?.setAttribute('aria-expanded', 'false');
    return opener;
  }
  function closeInspection() {
    if (active === null) return;
    const opener = clearInspectionSelection();
    if (inspector.contains(document.activeElement))
      (opener && !opener.hidden ? opener : canvas).focus({ preventScroll: true });
    if (parent !== window)
      parent.postMessage({ type: 'street-inspector-state', open: false }, location.origin);
    if (
      matchMedia('(prefers-reduced-motion: reduce)').matches ||
      !('inert' in inspector) ||
      typeof inspector.getAnimations !== 'function'
    ) {
      hideInspection();
      return;
    }

    // Start from the painted frame, even if the entrance is still in progress.
    const { opacity, transform } = getComputedStyle(inspector);
    inspector.style.setProperty('--inspection-from-opacity', opacity);
    inspector.style.setProperty('--inspection-from-transform', transform);
    inspector.inert = true;
    const animation = inspector
      .getAnimations()
      .find((entry) => entry.animationName === 'inspection-out');
    if (!animation) {
      hideInspection();
      return;
    }
    inspectionExit = animation;
    const finish = () => {
      if (inspectionExit === animation) hideInspection();
    };
    void animation.finished.then(finish, finish);
  }
  function inspect(id) {
    const point = definition.points.find((entry) => entry.id === id);
    if (!point || disposed || leaving) return;
    if (inspectionExit) cancelInspectionExit();
    active = id;
    document.getElementById('inspection-kind').textContent = point.kind;
    document.getElementById('inspection-name').textContent = point.name;
    document.getElementById('inspection-text').textContent = point.text;
    const action = document.getElementById('inspection-return');
    action.hidden = !point.destination;
    action.textContent = point.actionLabel || point.name + ' →';
    inspector.hidden = false;
    inspector.scrollTop = 0;
    for (const [key, button] of buttons) button.setAttribute('aria-expanded', String(key === id));
    if (parent !== window)
      parent.postMessage({ type: 'street-inspector-state', open: true }, location.origin);
  }
  function leave(destination = definition.returnDestination) {
    if (!destination || leaving || disposed) return;
    if (travelLocked) return;
    if (invitationLocked) {
      parent.postMessage({ type: 'daily-invitation-leave' }, location.origin);
      return;
    }
    if (destination === 'tavern' && definition.id === SILVER_CROWN_TAVERN && parent !== window) {
      parent.postMessage({ type: 'silver-crown-tavern-enter' }, location.origin);
      return;
    }
    const href = explorationHref(destination, timeOfDay, definition.id);
    leaving = true;
    document.body.classList.add('leaving');
    if (parent !== window)
      parent.postMessage({ type: 'street-leaving', leaving: true }, location.origin);
    exitTimer = setTimeout(() => {
      location.href = href;
    }, 340);
  }
  if (!pureBackdrop) {
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
        point.destination && point.immediate ? leave(point.destination) : inspect(point.id),
      );
      buttons.set(point.id, button);
      document.getElementById('street-points').append(button);
    }
  }
  function updatePoints() {
    if (pureBackdrop) return;
    camera.updateMatrixWorld();
    const occupied = [];
    for (const point of definition.points) {
      const button = buttons.get(point.id);
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
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    if (illustrated) model?.resize(camera, camera.aspect);
    camera.updateProjectionMatrix();
    needsRender = true;
    updatePoints();
  }
  function adjustView(action) {
    if ((fixed && !illustrated) || !model || disposed || leaving) return;
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
    visitorActions.hidden = true;
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
  events.on(window, 'pointermove', (event) => {
    if (
      drag ||
      !illustrated ||
      leaving ||
      disposed ||
      event.pointerType === 'touch' ||
      mapDialog.open ||
      citySubmap?.isOpen() ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    model?.hover?.((event.clientX / innerWidth - 0.5) * 2, (event.clientY / innerHeight - 0.5) * 2);
    needsRender = true;
  });
  events.on(canvas, 'pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 7) drag.moved = true;
    if (fixed && !illustrated) return;
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
      const visitor = visitors?.pick(event.clientX, event.clientY);
      if (visitor) {
        if (!Object.hasOwn(GUEST_RECRUITMENT, visitor.id)) return contactVisitor(visitor.id);
        visitorId = visitor.id;
        visitorActions.style.left = `${Math.min(innerWidth - 146, Math.max(8, event.clientX - 64))}px`;
        visitorActions.style.top = `${Math.max(10, event.clientY - 52)}px`;
        visitorActions.hidden = false;
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
    if (mapDialog.open || citySubmap?.isOpen() || event.target.closest('input, textarea, select'))
      return;
    if (event.key === 'Escape') {
      closeInspection();
      return;
    }
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    if (fixed && !illustrated) return;
    if (illustrated) {
      event.preventDefault();
      closeInspection();
      model?.drag(
        event.key === 'ArrowLeft' ? 0.1 : event.key === 'ArrowRight' ? -0.1 : 0,
        event.key === 'ArrowUp' ? 0.06 : event.key === 'ArrowDown' ? -0.06 : 0,
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
    clearInspectionSelection();
    hideInspection();
    loading.dispose();
    visitors?.dispose();
    worldMap.dispose();
    citySubmap.close();
    environment.dispose();
    clearTimeout(exitTimer);
    renderer.setAnimationLoop(null);
    events.dispose();
    resources.object(scene);
    resources.dispose();
    renderer.dispose();
    window.streetPreview = null;
    window.modelReady = false;
  }
  events.on(window, 'pagehide', (event) => {
    if (!event.persisted) dispose();
  });
  resize();
  apply();
  renderer.setAnimationLoop((now) => {
    let covered = document.hidden || mapDialog.open || citySubmap?.isOpen();
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
      ...(pureBackdrop
        ? []
        : definition.cutouts
            .filter((spec) =>
              illustrated
                ? spec.kind === 'npc' && Boolean(definition.illustration.people?.[spec.id])
                : spec.kind !== 'character' && spec.kind !== 'npc',
            )
            .map((spec) => spec.image)),
    ];
    await loading.prepare(files);
    if (disposed) return { dispose };
    model = illustrated
      ? await createIllustratedStreet(scene, resources, definition, loading, timeOfDay, enteredFrom)
      : await createStreetScene(scene, resources, quality, definition, loading);
    if (disposed) return { dispose };
    await model.setTime?.(timeOfDay);
    if (disposed) return { dispose };
    resize();
    if (!pureBackdrop && definition.visitors !== false) {
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
    parent.postMessage(
      { type: 'scene-ready', scene: definition.id, title: definition.title },
      location.origin,
    );
  } catch (error) {
    if (disposed || error.name === 'AbortError') return { dispose };
    if (!disposed) loading.fail(error);
    dispose();
  }
  return { dispose };
}

await createStreetView();
