import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAssetStore } from './asset-store.js';

/** Transfer progress is measured; decode/parse and the first GPU frame remain explicit phases. */
export function createSceneLoading(
  element,
  title,
  { assetStore = null, persistent = false, onReturn = null } = {},
) {
  const assets = assetStore || createAssetStore();
  const jobs = new Map();
  let terminal = false;
  let highWater = 0;
  element.className = 'scene-loading';
  element.setAttribute('role', 'status');
  element.innerHTML =
    '<div class="scene-loading-card"><span class="scene-loading-mark" aria-hidden="true">✧</span><small>万象酒馆</small><h2></h2><p class="scene-loading-phase">正在读取资源目录…</p><div class="scene-loading-meter" role="progressbar" aria-label="场景加载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><div class="scene-loading-details"><span>0%</span><small>准备中</small></div><nav hidden><a href="">重试</a><a href="./tavern.html">返回酒馆</a></nav></div>';
  element.querySelector('h2').textContent = title;
  if (onReturn)
    element.querySelector('nav a:last-child').onclick = (event) => {
      event.preventDefault();
      onReturn();
    };
  const phase = element.querySelector('.scene-loading-phase');
  const meter = element.querySelector('[role="progressbar"]');
  function progress(value, text) {
    highWater = Math.max(highWater, Math.min(100, Math.floor(value)));
    meter.setAttribute('aria-valuenow', String(highWater));
    meter.querySelector('i').style.width = highWater + '%';
    element.querySelector('.scene-loading-details span').textContent = highWater + '%';
    if (text) phase.textContent = text;
  }
  function update(file, state) {
    if (terminal) return;
    jobs.set(file, state);
    const values = [...jobs.values()];
    const total = values.reduce((sum, item) => sum + (item.total || 1), 0);
    const loaded = values.reduce((sum, item) => sum + Math.min(item.loaded, item.total || 1), 0);
    progress((loaded / total) * 88, '正在读取场景资源…');
    const done = values.filter((item) => item.total && item.loaded >= item.total).length;
    element.querySelector('.scene-loading-details small').textContent =
      `${done}/${values.length} 项${values.some((item) => item.cached) ? ' · 已复用本机缓存' : ''}`;
  }
  async function prepare(files) {
    const catalog = await assets.manifest();
    for (const file of new Set(files)) {
      const path = new URL(file, new URL('../../', import.meta.url)).pathname;
      const relative = path.slice(new URL('../../', import.meta.url).pathname.length);
      jobs.set(file, { loaded: 0, total: catalog.files[relative]?.bytes || 1 });
    }
    progress(0, '正在读取场景资源…');
  }
  return {
    assets,
    prepare,
    async gltf(file) {
      const blob = await assets.read(file, (state) => update(file, state));
      progress(highWater, '正在解析模型…');
      try {
        return await new GLTFLoader().parseAsync(
          await blob.arrayBuffer(),
          new URL('.', new URL(file, new URL('../../', import.meta.url))).href,
        );
      } catch (error) {
        await assets.evict(file);
        throw error;
      }
    },
    async texture(file) {
      const image = await assets.image(file, (state) => update(file, state));
      const texture = new THREE.Texture(image);
      texture.needsUpdate = true;
      return texture;
    },
    async finish(renderer, scene, camera) {
      progress(94, '正在准备画面…');
      if (!persistent) {
        renderer.setSize(innerWidth, innerHeight, false);
        camera.aspect = innerWidth / innerHeight;
        camera.updateProjectionMatrix();
      }
      if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
      else renderer.compile(scene, camera);
      renderer.render(scene, camera);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (terminal) return;
      progress(100, '准备完成');
      element.classList.add('complete');
      await new Promise((resolve) => setTimeout(resolve, 180));
      if (!terminal) {
        if (persistent) {
          element.hidden = true;
          element.classList.remove('complete');
        } else element.remove();
      }
    },
    fail(error) {
      terminal = true;
      phase.textContent = '载入失败：' + error.message;
      element.querySelector('nav').hidden = false;
      element.classList.add('failed');
    },
    dispose() {
      terminal = true;
      if (!assetStore) assets.dispose();
    },
  };
}
