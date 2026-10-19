import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BIOMES } from './content/biomes.js';
import { createBattleView } from './scene.js';
import { newBattle, preview, advance } from './engine.js';
import { createEventScope } from './shared/events.js';
import { createResourceScope } from './shared/resources.js';
import { WEATHERS } from './weather.js';

const CREATURES = [
  { id: 'crystal-beetle', name: '晶背甲虫', description: '结晶覆甲，六足缓行。矿轨旁的拾晶者。' },
  { id: 'cinder-imp', name: '灰炉小偶', description: '旧炉砖与废铁之间，还有一点没熄灭的火。' },
  { id: 'tide-jelly', name: '潮灯水母', description: '灯心沉在伞盖之中，触须跟着水声摆动。' },
  { id: 'boss-tide', name: '星潮司灯者', description: '星环记录潮汐，青铜长臂守住最后一盏灯。' },
];
const DESCRIPTIONS = {
  ruins: '断柱与旧刻痕之间，尘埃仍在缓缓落下。',
  forest: '层叠树冠、浅色菌灯，和贴着树根飞过的萤火。',
  frost: '矿灯照亮冰壁，载晶矿车沿着旧轨往返。',
  forge: '余烬沿熔沟流淌，旧锻锤依然记得工作的节拍。',
  tide: '水波触碰石阶，星环在潮灯上方安静转动。',
  dynasty: '朱墙金瓦、石狮与宫灯把旧宫庭围成一座安静的校场。',
  xianxia: '悬崖托住云上石坪，曲桥连着远处的浮岛与飞檐。',
  castle: '闸门、城垛与投石机守住校场，草垛和物资靠墙堆放。',
  arcane: '巨大的黄铜星仪立在庭院深处，星图地面与浮书映着紫光。',
  metropolis: '霓虹灯牌、湿柏油和停靠车辆拼出夜间街口。',
  nexus: '反应堆的青色脉冲扫过金属舱壁与服务器列阵。',
  wasteland: '断裂高架斜过废站上空，沙丘正吞没旧巴士与加油棚。',
  relic: '黄沙覆盖方碑与神殿台阶，古老浮雕仍在发亮。',
};

async function creatureView(stage, id) {
  const renderer = new THREE.WebGLRenderer({
    canvas: stage.querySelector('canvas'),
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const resources = createResourceScope();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1c303b');
  scene.add(new THREE.HemisphereLight('#e0eee4', '#283b51', 2.5));
  const key = new THREE.DirectionalLight('#ffe3b8', 2.8);
  key.position.set(4, 7, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight('#79d1de', 1.6);
  fill.position.set(-5, 3, -4);
  scene.add(fill);
  const model = (await new GLTFLoader().loadAsync(`./assets/${id}.glb`)).scene;
  scene.add(model);
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(2.25, 2.55, 0.18, 12),
    new THREE.MeshStandardMaterial({ color: '#294451', roughness: 0.75, metalness: 0.2 }),
  );
  plinth.position.y = -0.14;
  scene.add(plinth);
  const engraving = new THREE.Mesh(
    new THREE.RingGeometry(1.9, 1.92, 72),
    new THREE.MeshBasicMaterial({ color: '#b3c3a4' }),
  );
  engraving.rotation.x = -Math.PI / 2;
  engraving.position.y = -0.04;
  scene.add(engraving);
  resources.object(scene);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  const boss = id === 'boss-tide';
  camera.position.set(boss ? 6 : 4.1, boss ? 4.4 : 2.9, boss ? 7 : 4.7);
  const events = createEventScope();
  const canvas = stage.querySelector('canvas');
  const target = new THREE.Vector3(-0.6, boss ? 1.4 : 0.8, 0);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let azimuth = 0.72;
  let elevation = 1.12;
  let distance = boss ? 10 : 6.5;
  let pointer = null;
  let lastTime = performance.now();
  let lastInteraction = 0;
  let raf = 0;
  let disposed = false;
  events.on(canvas, 'pointerdown', (event) => {
    if (event.button !== 0) return;
    canvas.setPointerCapture(event.pointerId);
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    lastInteraction = performance.now();
  });
  events.on(canvas, 'pointermove', (event) => {
    if (pointer?.id !== event.pointerId) return;
    azimuth -= (event.clientX - pointer.x) * 0.006;
    elevation = Math.max(0.3, Math.min(1.5, elevation - (event.clientY - pointer.y) * 0.005));
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    lastInteraction = performance.now();
  });
  const release = () => {
    pointer = null;
    lastInteraction = performance.now();
  };
  events.on(canvas, 'pointerup', release);
  events.on(canvas, 'pointercancel', release);
  events.on(canvas, 'lostpointercapture', release);
  events.on(
    canvas,
    'wheel',
    (event) => {
      event.preventDefault();
      distance = Math.max(3, Math.min(13, distance * Math.exp(event.deltaY * 0.001)));
      lastInteraction = performance.now();
    },
    { passive: false },
  );
  const resize = () => {
    camera.aspect = stage.clientWidth / stage.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(stage.clientWidth, stage.clientHeight, false);
    renderer.render(scene, camera);
  };
  const observer = new ResizeObserver(resize);
  observer.observe(stage);
  resize();
  function tick(now = performance.now()) {
    raf = 0;
    if (disposed || document.hidden) return;
    const delta = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;
    if (!reduced && !pointer && now - lastInteraction > 2500) azimuth += delta * 0.04;
    camera.position.setFromSphericalCoords(distance, elevation, azimuth).add(target);
    camera.lookAt(target);
    renderer.render(scene, camera);
    if (!reduced || pointer) raf = requestAnimationFrame(tick);
  }
  events.on(canvas, 'pointermove', () => {
    if (!raf) tick();
  });
  events.on(canvas, 'wheel', () => {
    if (!raf) tick();
  });
  events.on(document, 'visibilitychange', () => {
    if (document.hidden) cancelAnimationFrame(raf);
    else tick();
  });
  tick();
  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      events.dispose();
      resources.dispose();
      renderer.dispose();
    },
    artStatus: () => ({ creature: id }),
  };
}

async function main() {
  const events = createEventScope();
  const stage = document.querySelector('#art-stage');
  const scenes = document.querySelector('#atlas-scenes');
  const creatures = document.querySelector('#atlas-creatures');
  const weatherPicker = document.querySelector('#atlas-weather');
  for (const entry of [{ id: 'auto', label: '随机天气' }, ...WEATHERS]) {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
    weatherPicker.append(option);
  }
  for (const [id, entry] of Object.entries(BIOMES)) {
    const button = document.createElement('button');
    button.dataset.scene = id;
    button.textContent = entry.name;
    scenes.append(button);
  }
  for (const entry of CREATURES) {
    const button = document.createElement('button');
    button.dataset.creature = entry.id;
    button.textContent = entry.name;
    creatures.append(button);
  }
  const statusTimers = new Set();
  let view = null;
  let token = 0;
  let state = null;
  let loading = false;
  let disposed = false;
  let currentScene = 'frost';
  let currentWeather = 'auto';
  async function select(id, creature = false) {
    if (!creature) currentScene = id;
    weatherPicker.disabled = creature;
    const current = ++token;
    statusTimers.forEach(clearTimeout);
    statusTimers.clear();
    loading = true;
    document.querySelector('#atlas-loading').hidden = false;
    view?.dispose();
    view = null;
    stage.querySelector('.unit-layer').replaceChildren();
    document
      .querySelectorAll('[data-scene],[data-creature]')
      .forEach((button) =>
        button.setAttribute(
          'aria-pressed',
          String((button.dataset.scene || button.dataset.creature) === id),
        ),
      );
    const item = creature ? CREATURES.find((entry) => entry.id === id) : BIOMES[id];
    document.querySelector('#atlas-title').textContent = item.name;
    document.querySelector('#atlas-kind').textContent = creature ? '造物 / STUDY' : '境域 / ATLAS';
    document.querySelector('#atlas-description').textContent = creature
      ? item.description
      : DESCRIPTIONS[id];
    document.querySelector('#atlas-attack').disabled = creature;
    document.querySelector('#atlas-status').disabled = creature;
    try {
      state = newBattle(
        id === 'forge'
          ? ['cinderImp']
          : id === 'tide'
            ? ['tideJelly', 'bossTide']
            : id === 'frost'
              ? ['crystalBeetle']
              : ['mossSlime', 'sprout'],
      );
      const next = creature
        ? await creatureView(stage, id)
        : await createBattleView(stage, () => {}, {
            map: id,
            enemyIds: state.enemyIds,
            weather: currentWeather,
          });
      if (disposed || current !== token) {
        next.dispose();
        return;
      }
      view = next;
      if (!creature) view.draw(state, preview(state, []), null, null);
      document.querySelector('#atlas-loading').hidden = true;
    } catch (error) {
      document.querySelector('#atlas-loading').textContent = '图册暂时无法翻开：' + error.message;
      throw error;
    } finally {
      if (current === token) loading = false;
    }
  }
  events.on(scenes, 'click', (event) => {
    const button = event.target.closest('[data-scene]');
    if (button && !loading) void select(button.dataset.scene);
  });
  events.on(weatherPicker, 'change', () => {
    currentWeather = weatherPicker.value;
    void select(currentScene);
  });
  events.on(creatures, 'click', (event) => {
    const button = event.target.closest('[data-creature]');
    if (button && !loading) void select(button.dataset.creature, true);
  });
  events.on(document.querySelector('#atlas-attack'), 'click', () => {
    if (!view?.playEvent) return;
    const before = advance(preview(state, []));
    const event = preview(before, []).events.find((entry) => entry.type === 'enemy');
    if (event) view.playEvent(event, before);
  });
  events.on(document.querySelector('#atlas-status'), 'click', () => {
    if (!view?.playEvent) return;
    const before = advance(preview(state, []));
    before.units.aegis.buffs.poison = 2;
    before.units.lyria.buffs.bleed = 2;
    before.units.morrow.buffs.regen = 2;
    before.units.morrow.hp -= 6;
    const result = preview(before, [
      {
        id: 'artbook-attack',
        kind: 'skill',
        actor: 'lyria',
        skill: 'attack',
        target: state.enemyIds[0],
        ap: 1,
        start: 0,
      },
    ]);
    let old = before;
    let delay = 0;
    for (const event of result.events) {
      if (event.statusTriggers?.length || event.type === 'regen') {
        const prior = old;
        const handle = setTimeout(() => {
          statusTimers.delete(handle);
          if (!disposed) view?.playEvent?.(event, prior);
        }, delay);
        statusTimers.add(handle);
        delay += 800;
      }
      old = event.after;
    }
  });
  function dispose() {
    disposed = true;
    token++;
    statusTimers.forEach(clearTimeout);
    statusTimers.clear();
    view?.dispose();
    events.dispose();
    delete window.artbook;
  }
  events.on(window, 'pagehide', dispose, { once: true });
  window.artbook = {
    select,
    async weather(type) {
      if (!['auto', ...WEATHERS.map((weather) => weather.id)].includes(type))
        throw Error('未知天气');
      currentWeather = type;
      weatherPicker.value = type;
      await select(currentScene);
    },
    status: () => ({
      loading,
      animating: Boolean(view?.isAnimating?.()),
      weather: view?.weatherStatus() || null,
      ...view?.artStatus(),
    }),
    dispose,
  };
  const initial = new URLSearchParams(location.search).get('scene');
  await select(BIOMES[initial] ? initial : 'frost');
}
void main();
