import { createEventScope } from '../shared/events.js';
import { createResourceScope } from '../shared/resources.js';
import { escapeText } from '../ui.js';

const COMPOSITE_SLOTS = Object.freeze([
  { x: -2.35, z: 0.24, yaw: 0.24, height: 2.22, ringRadius: 1.05, focusDist: 4.5 },
  { x: 0, z: -0.18, yaw: 0, height: 2.52, ringRadius: 1.15, focusDist: 4.7 },
  { x: 2.35, z: 0.24, yaw: -0.24, height: 2.22, ringRadius: 1.05, focusDist: 4.5 },
]);

const ANIMATION_LABELS = Object.freeze({
  Idle: '待机',
  Normal_Attack: '普通攻击',
  Special_Attack: '特殊攻击',
  Special_Action: '特殊行动',
  Bomb_Toss: '投掷炸弹',
  Talon_Rend: '利爪撕裂',
});

function applyArchiveVisibility(object, anatomyIndex = null) {
  object.traverse((node) => {
    if (node.name && node.name.includes('Battle_Card')) {
      node.visible = false;
      return;
    }
    if (anatomyIndex !== null && anatomyIndex !== undefined) {
      if (node.userData?.anatomyIndex !== undefined) {
        node.visible = Number(node.userData.anatomyIndex) === Number(anatomyIndex);
      }
    } else if (node.userData?.anatomyIndex !== undefined) {
      node.visible = true;
    }
  });
}

function isBranchVisible(node, root) {
  for (let cur = node; cur; cur = cur.parent) {
    if (!cur.visible) return false;
    if (cur === root) break;
  }
  return true;
}

function measureVisibleBounds(THREE, object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const itemBox = new THREE.Box3();
  object.traverse((node) => {
    if (!node.isMesh || !node.geometry || !isBranchVisible(node, object)) return;
    node.geometry.computeBoundingBox();
    if (!node.geometry.boundingBox) return;
    itemBox.copy(node.geometry.boundingBox).applyMatrix4(node.matrixWorld);
    box.union(itemBox);
  });
  if (box.isEmpty()) box.setFromObject(object);
  return box;
}

function normalizeFigure(THREE, model, targetHeight, maxFootprint, anatomyIndex = null) {
  const wrapper = new THREE.Group();
  applyArchiveVisibility(model, anatomyIndex);
  const box = measureVisibleBounds(THREE, model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = Math.min(
    targetHeight / Math.max(0.01, size.y),
    maxFootprint / Math.max(0.01, size.x),
    maxFootprint / Math.max(0.01, size.z),
  );
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -box.min.y * scale + 0.02, -center.z * scale);
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
  });
  wrapper.add(model);
  return { wrapper, height: size.y * scale };
}

function buildPedestal(THREE, accentHex, composite) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(
    composite
      ? new THREE.CylinderGeometry(4.15, 4.5, 0.18, 48)
      : new THREE.CylinderGeometry(1.75, 1.98, 0.16, 42),
    new THREE.MeshStandardMaterial({ color: '#1b1d24', roughness: 0.68, metalness: 0.28 }),
  );
  base.position.y = -0.09;
  if (composite) base.scale.set(1.06, 1, 0.62);
  group.add(base);

  const ring = new THREE.Mesh(
    composite ? new THREE.RingGeometry(3.85, 3.96, 64) : new THREE.RingGeometry(1.5, 1.58, 56),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(accentHex || '#d8b26e'),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  if (composite) ring.scale.set(1.06, 0.62, 1);
  group.add(ring);
  return group;
}

/** Interactive 3D Overlord showcase mounted inside the Skyrim archive detail folio. */
export function createArchiveModelStage() {
  let activeCleanup = null;
  let mountSeq = 0;

  function unmount() {
    mountSeq++;
    activeCleanup?.();
    activeCleanup = null;
  }

  async function mount(container, item) {
    unmount();
    if (!container || !item?.models?.length) return;
    const token = ++mountSeq;
    const isComposite = item.models.length > 1;
    container.dataset.stageReady = 'loading';
    container.dataset.overlordId = item.id;
    container.dataset.models = item.models.join(',');
    container.dataset.loadedModels = '0';

    const partControls = isComposite
      ? `<nav class="archive-stage-parts" aria-label="部位视角"><button type="button" data-stage-focus="all" aria-pressed="true">同台全景</button>${item.parts
          .map(
            (part, idx) =>
              `<button type="button" data-stage-focus="${idx}" aria-pressed="false">${escapeText(part.name)}</button>`,
          )
          .join('')}</nav>`
      : '';

    container.innerHTML = `<canvas class="archive-overlord-canvas" aria-label="${escapeText(item.name)} 3D 建模"></canvas><div class="archive-stage-badge"><span>霸主建模</span>${isComposite ? '<em>三位一体同台</em>' : ''}</div>${partControls}<small class="archive-stage-hint">拖拽旋转 · 滚轮缩放</small>`;

    const canvas = container.querySelector('canvas');
    let THREE;
    let GLTFLoader;
    try {
      const [threeMod, loaderMod] = await Promise.all([
        import('three'),
        import('three/addons/loaders/GLTFLoader.js'),
      ]);
      THREE = threeMod;
      GLTFLoader = loaderMod.GLTFLoader;
    } catch {
      if (token === mountSeq) container.dataset.stageReady = 'fallback';
      return;
    }
    if (token !== mountSeq || !container.isConnected) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
    } catch {
      if (token === mountSeq) container.dataset.stageReady = 'fallback';
      return;
    }

    const resources = createResourceScope();
    const events = createEventScope();
    let disposed = false;
    let raf = 0;
    let observer = null;

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      events.dispose();
      resources.dispose();
      renderer.dispose();
    };
    activeCleanup = cleanup;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#101116');
    scene.add(new THREE.HemisphereLight('#efe5d0', '#252a38', 2.4));

    const key = new THREE.DirectionalLight('#ffe2b0', 2.9);
    key.position.set(4.5, 7.5, 5.5);
    scene.add(key);

    const rim = new THREE.DirectionalLight('#8ac4da', 1.7);
    rim.position.set(-5, 3.5, -4.5);
    scene.add(rim);

    const uniqueModels = [...new Set(item.models)];
    const sharedComposite =
      isComposite &&
      uniqueModels.length === 1 &&
      (item.parts || []).some((part) => part.anatomyIndex !== undefined);

    const turntable = new THREE.Group();
    scene.add(turntable);
    turntable.add(buildPedestal(THREE, item.color, isComposite && !sharedComposite));

    const loader = new GLTFLoader();
    let loadedGltfs;
    try {
      const filesToLoad = sharedComposite ? uniqueModels : item.models;
      loadedGltfs = await Promise.all(
        filesToLoad.map((file) => loader.loadAsync(`./assets/${file}`)),
      );
    } catch {
      cleanup();
      if (activeCleanup === cleanup) activeCleanup = null;
      if (token === mountSeq) container.dataset.stageReady = 'fallback';
      return;
    }

    if (token !== mountSeq || disposed || !container.isConnected) {
      for (const gltf of loadedGltfs) resources.object(gltf.scene);
      cleanup();
      if (activeCleanup === cleanup) activeCleanup = null;
      return;
    }

    const slotAnchors = [];
    const animatedFigures = [];
    const mixers = [];
    const availableClipNames = [];
    let sharedRootModel = null;

    const attachMixer = (modelScene, animations) => {
      if (!Array.isArray(animations) || !animations.length) return;
      const mixer = new THREE.AnimationMixer(modelScene);
      const clips = {};
      for (const clip of animations) {
        clips[clip.name] = mixer.clipAction(clip);
        if (!availableClipNames.includes(clip.name)) availableClipNames.push(clip.name);
      }
      const idleAction = clips.Idle || clips[animations[0].name];
      if (idleAction) {
        idleAction.setLoop(THREE.LoopRepeat, Infinity);
        idleAction.play();
      }
      const entry = {
        mixer,
        clips,
        idleAction,
        activeAction: idleAction,
      };
      mixer.addEventListener('finished', (event) => {
        if (!entry.idleAction || event.action === entry.idleAction) return;
        entry.idleAction.reset();
        entry.idleAction.setLoop(THREE.LoopRepeat, Infinity);
        entry.idleAction.play();
        event.action.crossFadeTo(entry.idleAction, 0.22, true);
        entry.activeAction = entry.idleAction;
        container
          .querySelectorAll('[data-stage-anim]')
          .forEach((btn) =>
            btn.setAttribute('aria-pressed', String(btn.dataset.stageAnim === 'Idle')),
          );
      });
      mixers.push(entry);
    };

    if (sharedComposite) {
      sharedRootModel = loadedGltfs[0].scene;
      const { wrapper, height } = normalizeFigure(THREE, sharedRootModel, 2.55, 2.35, null);
      turntable.add(wrapper);
      attachMixer(sharedRootModel, loadedGltfs[0].animations);
      for (const _part of item.parts || []) {
        slotAnchors.push({
          target: new THREE.Vector3(0, Math.max(0.95, height * 0.48), 0),
          distance: 5.2,
        });
      }
    } else if (isComposite) {
      loadedGltfs.forEach((gltf, idx) => {
        const modelScene = gltf.scene;
        const slot = COMPOSITE_SLOTS[idx] || COMPOSITE_SLOTS[1];
        const subRing = new THREE.Mesh(
          new THREE.RingGeometry(slot.ringRadius - 0.05, slot.ringRadius, 40),
          new THREE.MeshBasicMaterial({
            color: '#d8b26e',
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.48,
          }),
        );
        subRing.rotation.x = -Math.PI / 2;
        subRing.position.set(slot.x, 0.008, slot.z);
        turntable.add(subRing);

        const partAnatomy = item.parts?.[idx]?.anatomyIndex ?? null;
        const { wrapper, height } = normalizeFigure(
          THREE,
          modelScene,
          slot.height,
          2.05,
          partAnatomy,
        );
        wrapper.position.set(slot.x, 0, slot.z);
        wrapper.rotation.y = slot.yaw;
        turntable.add(wrapper);
        attachMixer(modelScene, gltf.animations);

        slotAnchors.push({
          target: new THREE.Vector3(slot.x, Math.max(0.85, height * 0.48), slot.z),
          distance: slot.focusDist,
        });
        if (!gltf.animations?.length && item.models[idx] === 'moon-eye.glb') {
          animatedFigures.push({ object: wrapper, amplitude: 0.045, phase: idx });
        }
      });
    } else {
      const gltf = loadedGltfs[0];
      const partAnatomy = item.parts?.[0]?.anatomyIndex ?? item.entry?.anatomyIndex ?? null;
      const { wrapper, height } = normalizeFigure(THREE, gltf.scene, 2.45, 2.15, partAnatomy);
      turntable.add(wrapper);
      attachMixer(gltf.scene, gltf.animations);
      slotAnchors.push({
        target: new THREE.Vector3(0, Math.max(0.95, height * 0.48), 0),
        distance: 5.4,
      });
      if (!gltf.animations?.length && item.models[0] === 'radiant-wyvern.glb') {
        animatedFigures.push({ object: wrapper, amplitude: 0.055, phase: 0 });
      }
    }

    const animClips = Object.keys(ANIMATION_LABELS).filter((name) =>
      availableClipNames.includes(name),
    );
    if (animClips.length) {
      const nav = document.createElement('nav');
      nav.className = 'archive-stage-anims';
      nav.setAttribute('aria-label', '动作预览');
      nav.innerHTML = animClips
        .map(
          (clip) =>
            `<button type="button" data-stage-anim="${escapeText(clip)}" aria-pressed="${String(clip === 'Idle')}">${escapeText(ANIMATION_LABELS[clip])}</button>`,
        )
        .join('');
      container.append(nav);
      events.on(nav, 'click', (event) => {
        const btn = event.target.closest('[data-stage-anim]');
        if (!btn) return;
        const clipName = btn.dataset.stageAnim;
        nav
          .querySelectorAll('button')
          .forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        for (const mEntry of mixers) {
          const action = mEntry.clips[clipName] || mEntry.idleAction;
          if (!action) continue;
          action.reset();
          if (clipName === 'Idle') {
            action.setLoop(THREE.LoopRepeat, Infinity);
          } else {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          action.play();
          if (mEntry.activeAction && mEntry.activeAction !== action) {
            mEntry.activeAction.crossFadeTo(action, 0.16, true);
          }
          mEntry.activeAction = action;
        }
        lastInteraction = performance.now();
        if (!raf) tick();
      });
    }

    resources.object(scene);

    const overviewTarget = new THREE.Vector3(0, isComposite && !sharedComposite ? 1.18 : 1.15, 0);
    const desiredTarget = overviewTarget.clone();
    const target = overviewTarget.clone();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    let azimuth = isComposite && !sharedComposite ? 0.18 : 0.48;
    let elevation = isComposite && !sharedComposite ? 1.24 : 1.16;
    let baseDistance = isComposite && !sharedComposite ? 7.9 : 5.4;
    let zoomFactor = 1;
    let pointer = null;
    let lastInteraction = 0;
    let lastTime = performance.now();

    function applyCamera() {
      const aspectFit =
        isComposite && !sharedComposite
          ? Math.max(1, 1.35 / Math.max(0.55, camera.aspect || 1.6))
          : 1;
      const dist = baseDistance * zoomFactor * aspectFit;
      camera.position.setFromSphericalCoords(dist, elevation, azimuth).add(target);
      camera.lookAt(target);
    }

    function resize() {
      if (disposed) return;
      const width = container.clientWidth || 560;
      const height = container.clientHeight || 300;
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      applyCamera();
      renderer.render(scene, camera);
    }

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize);
      observer.observe(container);
    }
    resize();

    events.on(canvas, 'pointerdown', (event) => {
      if (event.button !== 0) return;
      canvas.setPointerCapture(event.pointerId);
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
      lastInteraction = performance.now();
    });
    events.on(canvas, 'pointermove', (event) => {
      if (pointer?.id !== event.pointerId) return;
      azimuth -= (event.clientX - pointer.x) * 0.007;
      elevation = Math.max(0.35, Math.min(1.48, elevation - (event.clientY - pointer.y) * 0.006));
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      lastInteraction = performance.now();
      if (!raf) tick();
    });
    const releasePointer = () => {
      pointer = null;
      lastInteraction = performance.now();
    };
    events.on(canvas, 'pointerup', releasePointer);
    events.on(canvas, 'pointercancel', releasePointer);
    events.on(canvas, 'lostpointercapture', releasePointer);
    events.on(
      canvas,
      'wheel',
      (event) => {
        event.preventDefault();
        zoomFactor = Math.max(0.52, Math.min(1.8, zoomFactor * Math.exp(event.deltaY * 0.001)));
        lastInteraction = performance.now();
        if (!raf) tick();
      },
      { passive: false },
    );

    const focusNav = container.querySelector('.archive-stage-parts');
    if (focusNav) {
      events.on(focusNav, 'click', (event) => {
        const button = event.target.closest('[data-stage-focus]');
        if (!button) return;
        const focus = button.dataset.stageFocus;
        focusNav.querySelectorAll('button').forEach((btn) => {
          btn.setAttribute('aria-pressed', String(btn === button));
        });
        zoomFactor = 1;
        lastInteraction = performance.now();
        if (focus === 'all') {
          if (sharedRootModel) applyArchiveVisibility(sharedRootModel, null);
          desiredTarget.copy(overviewTarget);
          baseDistance = sharedComposite ? 5.4 : 7.9;
          azimuth = sharedComposite ? 0.48 : 0.18;
          elevation = sharedComposite ? 1.16 : 1.24;
        } else {
          const partIndex = Number(focus);
          if (sharedRootModel) {
            const partAnatomy = item.parts?.[partIndex]?.anatomyIndex ?? null;
            applyArchiveVisibility(sharedRootModel, partAnatomy);
          }
          const anchor = slotAnchors[partIndex];
          if (anchor) {
            desiredTarget.copy(anchor.target);
            baseDistance = anchor.distance;
            azimuth = 0.34;
            elevation = 1.18;
          }
        }
        if (!raf) tick();
      });
    }

    events.on(document, 'visibilitychange', () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else if (!raf) tick();
    });

    function tick(now = performance.now()) {
      raf = 0;
      if (disposed || document.hidden) return;
      const delta = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      target.lerp(desiredTarget, 0.18);
      if (!reduced && !pointer && now - lastInteraction > 2400) {
        azimuth += delta * (isComposite && !sharedComposite ? 0.16 : 0.28);
      }
      if (!reduced) {
        for (const mEntry of mixers) {
          mEntry.mixer.update(delta);
        }
        const sec = now * 0.001;
        for (const itemFloat of animatedFigures) {
          itemFloat.object.position.y = Math.sin(sec * 1.9 + itemFloat.phase) * itemFloat.amplitude;
        }
      }
      applyCamera();
      renderer.render(scene, camera);
      if (!reduced || pointer || target.distanceToSquared(desiredTarget) > 1e-4) {
        raf = requestAnimationFrame(tick);
      }
    }

    container.dataset.loadedModels = String(item.models.length);
    container.dataset.stageReady = 'ready';
    tick();
  }

  return {
    mount,
    unmount,
    dispose: unmount,
  };
}
