import * as THREE from 'three';
import { EMBLEMS } from '../emblems.js';
import { createEmblemRing, RING_DESIGNS } from '../emblem-rings.js';
import { createResourceScope } from '../shared/resources.js';
import { createEventScope } from '../shared/events.js';
import { resourceText } from '../resource-text.js';

/** One renderer, a cached view of the real room, and at most two jewellery models in transition. */
export function createRingDisplay(renderer, room, roomCamera) {
  const resources = createResourceScope();
  const events = createEventScope();
  const ids = Object.keys(RING_DESIGNS);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 30);
  const backdrop = resources.track(new THREE.WebGLRenderTarget(1, 1));
  scene.background = backdrop.texture;
  scene.backgroundIntensity = 0.38;
  const studio = new THREE.Scene();
  studio.background = new THREE.Color('#232c3c');
  for (const [p, size, color] of [
    [[-3, 3, 2], [2.2, 5], '#fff2da'],
    [[3, 1, 2], [1, 4], '#adcfff'],
    [[0, 4, -1], [4, 2], '#ffffff'],
    [[0, -2, 3], [3, 1], '#776955'],
  ]) {
    const light = new THREE.Mesh(
      new THREE.PlaneGeometry(...size),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }),
    );
    light.position.fromArray(p);
    light.lookAt(0, 0, 0);
    studio.add(light);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = resources.track(pmrem.fromScene(studio, 0.035));
  resources.object(studio);
  pmrem.dispose();
  scene.environment = environment.texture;
  scene.environmentIntensity = 1.35;
  scene.add(new THREE.HemisphereLight('#d8e6ff', '#32261c', 2));
  const key = new THREE.DirectionalLight('#fff2d6', 4);
  key.position.set(-3, 5, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#91bcff', 3);
  rim.position.set(3, 2, -3);
  scene.add(rim);
  const display = new THREE.Group();
  scene.add(display);
  const models = new Map();
  const geometry = new Map();
  function model(id) {
    if (!models.has(id)) {
      const ring = resources.object(createEmblemRing(id));
      let triangles = 0,
        bore = Infinity,
        crown = 0;
      ring.traverse((node) => {
        if (!node.geometry) return;
        const positions = node.geometry.attributes.position;
        triangles += (node.geometry.index?.count || positions.count) / 3;
        for (let i = 0; i < positions.count; i++) {
          const x = positions.getX(i),
            y = positions.getY(i);
          if (!Number.isFinite(x + y + positions.getZ(i))) throw Error('Invalid jewellery vertex');
          bore = Math.min(bore, Math.hypot(x, y));
          crown = Math.max(crown, y);
        }
      });
      geometry.set(id, { id, meshes: ring.children.length, triangles, bore, crown });
      models.set(id, ring);
    }
    return models.get(id);
  }
  const panel = document.createElement('section');
  panel.className = 'ring-gallery';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-label', '命运桌 · 纹章戒指');
  panel.innerHTML =
    '<header><span>纹章藏品</span><button type="button" data-ring-close aria-label="关闭戒指陈列">×</button></header>' +
    '<div class="ring-gallery-caption"><h1></h1><span class="ring-gallery-owner"></span></div>' +
    '<div class="ring-gallery-viewport" data-ring-viewport aria-label="拖动旋转戒指，滚轮缩放"></div>' +
    '<aside class="ring-gallery-effects" aria-label="纹章效果" aria-live="polite"><section><h2>结合被动</h2><p data-ring-passive></p></section><section><h2 data-ring-skill-name></h2><small data-ring-skill-cost></small><p data-ring-skill-effect></p></section></aside>' +
    '<div class="ring-gallery-tools"><button type="button" data-ring-zoom="-1" aria-label="缩小戒指">−</button><button type="button" data-ring-turn aria-pressed="true">暂停旋转</button><button type="button" data-ring-zoom="1" aria-label="放大戒指">＋</button><button type="button" data-ring-equip>整备</button></div>' +
    '<nav aria-label="选择纹章戒指"></nav>';
  document.body.append(panel);
  const nav = panel.querySelector('nav');
  for (const id of ids) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.ringId = id;
    button.textContent = EMBLEMS[id].emblem.name;
    button.style.setProperty('--ring-accent', RING_DESIGNS[id].color);
    nav.append(button);
  }
  let active = false,
    selected = ids[0],
    collection = {},
    auto = true;
  let yaw = -0.35,
    pitch = 0.62,
    zoom = 1,
    drag = null,
    previousFocus = null;
  let transition = null,
    backdropDirty = true,
    backdropCaptured = false;
  const drawingSize = new THREE.Vector2();
  function opacity(ring, value, fading) {
    ring.traverse((node) => {
      if (!node.material) return;
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
        if (material.transparent !== fading) {
          material.transparent = fading;
          material.needsUpdate = true;
        }
        material.opacity = value;
        material.depthWrite = !fading;
      }
    });
  }
  function reset(ring) {
    ring.position.set(0, 0, 0);
    ring.rotation.set(0, 0, 0);
    ring.scale.setScalar(1);
    opacity(ring, 1, false);
  }
  function finishTransition() {
    if (!transition) return;
    const incoming = transition.incoming;
    for (const ring of [...display.children]) {
      reset(ring);
      if (ring !== incoming) ring.removeFromParent();
    }
    transition = null;
  }
  function caption() {
    panel.style.setProperty('--ring-accent', RING_DESIGNS[selected].color);
    panel.querySelector('h1').textContent = EMBLEMS[selected].emblem.name;
    const { emblem, skill } = EMBLEMS[selected];
    panel.querySelector('[data-ring-passive]').textContent = resourceText(emblem.text);
    panel.querySelector('[data-ring-skill-name]').textContent = skill.name;
    panel.querySelector('[data-ring-skill-cost]').textContent =
      `${skill.ap} AP${skill.mp ? ` · ${skill.mp} sp` : ''}${skill.hp ? ` · ${skill.hp} hp` : ''}`;
    panel.querySelector('[data-ring-skill-effect]').textContent = resourceText(skill.text);
    panel.querySelector('.ring-gallery-owner').textContent = collection[selected]?.owned
      ? '已契约 · ' + (collection[selected].wearer || '尚未佩戴')
      : '未契约';
    for (const button of nav.children)
      button.setAttribute('aria-pressed', String(button.dataset.ringId === selected));
  }
  function select(id, instant = false) {
    if (!RING_DESIGNS[id] || (id === selected && display.children.length && !instant)) return;
    const outgoing = transition?.incoming || display.children[0];
    const direction = ids.indexOf(id) >= ids.indexOf(selected) ? 1 : -1;
    const incoming = model(id);
    for (const ring of [...display.children]) {
      if (ring !== outgoing) {
        reset(ring);
        ring.removeFromParent();
      }
    }
    selected = id;
    yaw = -0.35;
    pitch = 0.62;
    zoom = 1;
    reset(incoming);
    display.add(incoming);
    caption();
    if (!outgoing || outgoing === incoming || instant || reduced) {
      transition = { incoming };
      finishTransition();
      return;
    }
    const startingOpacity = outgoing.children[0]?.material.opacity ?? 1;
    transition = {
      outgoing,
      incoming,
      direction,
      elapsed: 0,
      startX: outgoing.position.x,
      startScale: outgoing.scale.x,
      startingOpacity,
    };
    incoming.position.x = direction * 0.8;
    incoming.rotation.y = direction * -0.28;
    incoming.scale.setScalar(0.88);
    opacity(outgoing, startingOpacity, true);
    opacity(incoming, 0, true);
    panel.dataset.switching = 'true';
  }
  function close() {
    if (!active) return;
    active = false;
    finishTransition();
    delete panel.dataset.switching;
    panel.hidden = true;
    document.body.classList.remove('ring-viewing');
    parent.postMessage({ type: 'tavern-emblem-visibility', open: false }, location.origin);
    drag = null;
    previousFocus?.focus();
  }
  events.on(panel, 'click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.ringId) select(button.dataset.ringId);
    if (button.hasAttribute('data-ring-close')) close();
    if (button.hasAttribute('data-ring-turn')) {
      auto = !auto;
      button.textContent = auto ? '暂停旋转' : '自动旋转';
      button.setAttribute('aria-pressed', String(auto));
    }
    if (button.dataset.ringZoom)
      zoom = THREE.MathUtils.clamp(zoom + Number(button.dataset.ringZoom) * 0.12, 0.7, 1.45);
    if (button.hasAttribute('data-ring-equip')) {
      close();
      parent.postMessage({ type: 'tavern-emblem-equip' }, location.origin);
    }
  });
  const viewport = panel.querySelector('[data-ring-viewport]');
  let viewportBounds = null;
  events.on(window, 'resize', () => {
    viewportBounds = null;
  });
  events.on(viewport, 'pointerdown', (event) => {
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    viewport.setPointerCapture(event.pointerId);
  });
  events.on(viewport, 'pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    yaw += (event.clientX - drag.x) * 0.009;
    pitch = THREE.MathUtils.clamp(pitch + (event.clientY - drag.y) * 0.009, -1, 1);
    drag.x = event.clientX;
    drag.y = event.clientY;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'])
    events.on(viewport, name, () => {
      drag = null;
    });
  events.on(
    viewport,
    'wheel',
    (event) => {
      event.preventDefault();
      zoom = THREE.MathUtils.clamp(zoom - event.deltaY * 0.001, 0.7, 1.45);
    },
    { passive: false },
  );
  events.on(panel, 'keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
    if (event.key === 'Tab') {
      const buttons = [...panel.querySelectorAll('button')];
      const next =
        buttons[
          (buttons.indexOf(document.activeElement) + (event.shiftKey ? buttons.length - 1 : 1)) %
            buttons.length
        ];
      event.preventDefault();
      next.focus();
    }
  });
  return {
    open() {
      previousFocus = document.activeElement;
      active = true;
      backdropDirty = true;
      panel.hidden = false;
      viewportBounds = null;
      document.body.classList.add('ring-viewing');
      parent.postMessage({ type: 'tavern-emblem-visibility', open: true }, location.origin);
      select(selected, true);
      panel.querySelector('[data-ring-close]').focus();
      parent.postMessage({ type: 'tavern-emblem' }, location.origin);
    },
    setCollection(value) {
      collection = value || {};
      if (active) caption();
    },
    render(dt) {
      if (!active) return false;
      renderer.getDrawingBufferSize(drawingSize);
      if (backdropDirty || backdrop.width !== drawingSize.x || backdrop.height !== drawingSize.y) {
        backdrop.setSize(drawingSize.x, drawingSize.y);
        const target = renderer.getRenderTarget();
        renderer.setRenderTarget(backdrop);
        renderer.render(room, roomCamera);
        renderer.setRenderTarget(target);
        backdropDirty = false;
        backdropCaptured = true;
      }
      if (transition) {
        transition.elapsed += dt;
        const t = Math.min(1, transition.elapsed / 0.62);
        const ease = t * t * (3 - 2 * t);
        transition.outgoing.position.x = THREE.MathUtils.lerp(
          transition.startX,
          -transition.direction * 0.7,
          ease,
        );
        transition.outgoing.scale.setScalar(
          THREE.MathUtils.lerp(transition.startScale, 0.88, ease),
        );
        transition.outgoing.rotation.y = transition.direction * ease * 0.26;
        opacity(transition.outgoing, transition.startingOpacity * (1 - ease), true);
        transition.incoming.position.x = transition.direction * 0.8 * (1 - ease);
        transition.incoming.rotation.y = transition.direction * -0.28 * (1 - ease);
        transition.incoming.scale.setScalar(0.88 + ease * 0.12);
        opacity(transition.incoming, ease, true);
        if (t === 1) {
          finishTransition();
          delete panel.dataset.switching;
        }
      }
      if (auto && !drag && !reduced && !transition) yaw += dt * 0.2;
      display.rotation.set(pitch, yaw, 0);
      display.scale.setScalar(zoom);
      camera.aspect = innerWidth / innerHeight;
      viewportBounds ||= viewport.getBoundingClientRect();
      camera.setViewOffset(
        innerWidth,
        innerHeight,
        innerWidth / 2 - viewportBounds.left - viewportBounds.width / 2,
        innerHeight / 2 - viewportBounds.top - viewportBounds.height / 2,
        innerWidth,
        innerHeight,
      );
      camera.position.set(0, 0.52, innerHeight <= 540 || camera.aspect < 1 ? 6.6 : 5.7);
      camera.lookAt(0, 0.16, 0);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      return true;
    },
    status: () => ({
      active,
      selected,
      models: models.size,
      tabletop: 0,
      yaw,
      pitch,
      zoom,
      auto,
      transitioning: !!transition,
      background: backdropCaptured,
      geometry: [...geometry.values()],
    }),
    dispose() {
      close();
      events.dispose();
      panel.remove();
      resources.object(scene);
      resources.dispose();
      models.clear();
    },
  };
}
