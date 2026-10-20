import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BIOMES } from './content/biomes.js';
import { createResourceScope } from './shared/resources.js';
import { createEventScope } from './shared/events.js';

/** One lazy renderer; cached dioramas and all late loads share its resource lifetime. */
export function createDestinationPreview(host) {
  const resources = createResourceScope();
  const events = createEventScope();
  const loader = new GLTFLoader();
  const models = new Map();
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-7, 7, 5, -5, 0.1, 80);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.setClearColor(0, 0);
  renderer.domElement.setAttribute('aria-label', '当前场景的三维体素微缩模型');
  renderer.domElement.setAttribute('role', 'img');
  host.prepend(renderer.domElement);
  camera.position.set(9, 8, 12);
  camera.lookAt(0, 1.1, 0);
  scene.add(new THREE.HemisphereLight(0xd9efff, 0x66674c, 2.7));
  const sun = new THREE.DirectionalLight(0xffe4bc, 3.4);
  sun.position.set(-4, 9, 6);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x79d7db, 2.2);
  rim.position.set(5, 3, -4);
  scene.add(rim);
  const geometry = resources.track(new THREE.BoxGeometry(0.035, 0.035, 0.035));
  const material = resources.track(new THREE.MeshBasicMaterial({ color: 0xcce8c2 }));
  const motes = new THREE.InstancedMesh(geometry, material, 28);
  const dummy = new THREE.Object3D();
  resources.track(motes);
  scene.add(motes);
  let disposed = false;
  let active = false;
  let ticket = 0;
  let raf = 0;
  let current = null;
  let outgoing = null;
  let transition = 0;
  let direction = 1;
  let frameTime = 0;

  function resize() {
    if (!active || !host.clientWidth || !host.clientHeight) return;
    const aspect = host.clientWidth / host.clientHeight;
    const halfHeight = Math.max(3.8, 5.5 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    resume();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  function tick(now) {
    raf = 0;
    if (disposed || !active || document.hidden) return;
    const elapsed = Math.min((now - frameTime) / 1000, 0.05);
    frameTime = now;
    transition = Math.min(1, transition + elapsed / (reduced.matches ? 0.001 : 0.56));
    const ease = 1 - (1 - transition) ** 4;
    if (current) {
      current.position.x = (1 - ease) * direction * 12;
      current.scale.setScalar(0.85 + ease * 0.15);
      current.rotation.y = reduced.matches ? -0.12 : -0.12 + Math.sin(now * 0.00015) * 0.1;
      current.position.y = reduced.matches ? 0 : Math.sin(now * 0.0007) * 0.035;
      const cart = current.getObjectByName('Minecart');
      if (cart) cart.position.z = reduced.matches ? 0 : Math.sin(now * 0.00065) * 0.65;
      const flame = current.getObjectByName('Flame');
      if (flame) flame.scale.y = reduced.matches ? 1 : 1 + Math.sin(now * 0.007) * 0.06;
    }
    if (outgoing) {
      outgoing.position.x = -direction * ease * 12;
      if (transition === 1) {
        scene.remove(outgoing);
        outgoing = null;
      }
    }
    for (let i = 0; i < motes.count; i++) {
      const time = reduced.matches ? 0 : now * 0.00014;
      dummy.position.set(
        Math.sin(i * 4.17 + time) * 3.8,
        0.6 + ((i * 0.171 + time * 0.6) % 3.5),
        Math.cos(i * 2.73 + time * 0.7) * 2.6,
      );
      dummy.updateMatrix();
      motes.setMatrixAt(i, dummy.matrix);
    }
    motes.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
    if (!reduced.matches || transition < 1) raf = requestAnimationFrame(tick);
  }
  function resume() {
    if (active && !disposed && !document.hidden && !raf) {
      frameTime = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }
  events.on(document, 'visibilitychange', resume);
  async function show(map, step = 1) {
    const request = ++ticket;
    active = true;
    renderer.domElement.hidden = false;
    host.dataset.loading = 'true';
    delete host.dataset.ready;
    resize();
    resume();
    if (!models.has(map)) {
      models.set(
        map,
        loader
          .loadAsync(`./assets/preview-${map}.glb`)
          .then(({ scene: model }) => resources.object(model)),
      );
    }
    try {
      const model = await models.get(map);
      if (disposed || !active || request !== ticket) return;
      if (outgoing) scene.remove(outgoing);
      outgoing = current === model ? null : current;
      current = model;
      direction = step || 1;
      transition = reduced.matches ? 1 : 0;
      scene.add(current);
      material.color.set(BIOMES[map].mote);
      rim.color.set(BIOMES[map].fill);
      host.dataset.ready = map;
      host.dataset.loading = 'false';
      host.dataset.error = 'false';
      resume();
    } catch {
      models.delete(map);
      if (disposed || request !== ticket) return;
      host.dataset.loading = 'false';
      host.dataset.error = 'true';
    }
  }
  function pause() {
    active = false;
    renderer.domElement.hidden = true;
    ticket++;
    cancelAnimationFrame(raf);
    raf = 0;
  }
  return {
    show,
    pause,
    dispose() {
      disposed = true;
      pause();
      observer.disconnect();
      events.dispose();
      resources.object(scene);
      resources.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
