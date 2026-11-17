import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createAssetStore } from './asset-store.js';
import {
  buildAstrolabeBackdropSvg,
  buildCornerBracketsHtml,
  buildDividerDiamondSvg,
} from './fantasy-ornaments.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export const WANXIANG_LOADING_LORE = Object.freeze([
  {
    category: '世界秘闻 · CODEX I',
    title: '万象酒馆 · 界门枢纽',
    latin: 'TABERNA OMNIUM PORTARUM',
    body: '万象酒馆矗立在泛生界星灯街深处，既是艾尔特拉旅人歇脚的港湾，亦是连通异境裂隙的观测枢。唯有掌灯契约者，方能以以太与召唤契约延请诸界英灵同行。',
  },
  {
    category: '地理风物 · CODEX II',
    title: '星钟与银冠 · 帝国双璧',
    latin: 'HOROLOGIUM ET CORONA ARGENTEA',
    body: '艾尔德兰帝国以星钟城与银冠城为南北双枢。星钟城的青铜长街终年回荡炼金锻声，而艾诺布林至黑曜关的古道之间，无数古迹正随潮汐波动悄然苏醒。',
  },
  {
    category: '奥秘传承 · CODEX III',
    title: '纹章士戒指 · 结合觉醒',
    latin: 'ANULUS EMBLEMATIS ET CONIUNCTIO',
    body: '击败异境首领可夺回沉眠的纹章士戒指。战斗中借行动与受击充能至六格，便可唤醒「结合」姿态，将历代英灵的奥秘化作破局之力。',
  },
  {
    category: '工坊锻造 · CODEX IV',
    title: '以太凝聚 · 四槽圣物',
    latin: 'AETHER ET QUATTUOR RELIQUIAE',
    body: '旅途中寻得的珍稀信物与以太，可在以太凝聚器中锻造为武器、护甲、挂坠与宝石四类装备。每位同行者各司其槽，合理搭配方能稳步应对更高阶路线。',
  },
  {
    category: '命运裁定 · CODEX V',
    title: '命运天平 · 2D6 检定',
    latin: 'LIBRA FATI ET SEX VIRTUTES',
    body: '异境探索中的抉择与突发变故皆由六维属性裁定：力量、敏捷、体质、智力、感知与魅力。投出两枚六面骰加上对应修正对抗目标难度，双六为大成功，双一则暗藏危机。',
  },
  {
    category: '战阵兵法 · CODEX VI',
    title: '前后换位 · 入场破防',
    latin: 'MUTATIO ACIEI ET FRACTURA',
    body: '六人战阵分为前场三人与后场三人。伙伴在后场待满一整个正式回合便会进入蓄势状态，随时拖拽换入前场即可无消耗触发「入场技」，打乱强敌阵脚。',
  },
]);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function motesMarkup(count = 16) {
  return Array.from({ length: count }, (_, i) => {
    const seed = (i * 73 + 19) % 100;
    const left = ((i * 37 + 11) % 96) + 2;
    const size = 2 + (seed % 4);
    const duration = 9 + (seed % 11);
    const delay = -((i * 1.7) % duration).toFixed(2);
    const sway = (i % 2 === 0 ? 1 : -1) * (16 + (seed % 34));
    const opacity = (0.35 + (seed % 5) * 0.11).toFixed(2);
    return `<span class="wl-mote" style="left:${left}%;width:${size}px;height:${size}px;--mote-sway:${sway}px;--mote-opacity:${opacity};animation-duration:${duration}s;animation-delay:${delay}s"></span>`;
  }).join('');
}

function dotsMarkup(activeIdx) {
  return WANXIANG_LOADING_LORE.map(
    (_, i) =>
      `<button type="button" class="wl-dot${i === activeIdx ? ' is-active' : ''}" data-wl-dot="${i}" aria-label="秘闻 ${i + 1}"></button>`,
  ).join('');
}

function applyLoreIndex(root, idx) {
  const safe =
    (((Number(idx) || 0) % WANXIANG_LOADING_LORE.length) + WANXIANG_LOADING_LORE.length) %
    WANXIANG_LOADING_LORE.length;
  const entry = WANXIANG_LOADING_LORE[safe];
  root.dataset.loreIdx = String(safe);
  const catEl = root.querySelector('[data-wl-category]');
  const romanEl = root.querySelector('[data-wl-roman]');
  const titleEl = root.querySelector('[data-wl-lore-title]');
  const latinEl = root.querySelector('[data-wl-lore-latin]');
  const bodyEl = root.querySelector('[data-wl-lore-body]');
  const codexEl = root.querySelector('.wl-codex');
  if (catEl) catEl.textContent = `✦  ${entry.category}`;
  if (romanEl) romanEl.textContent = ROMAN[safe] || String(safe + 1);
  if (titleEl) titleEl.textContent = entry.title;
  if (latinEl) latinEl.textContent = entry.latin;
  if (bodyEl) bodyEl.textContent = entry.body;
  if (codexEl) {
    codexEl.classList.remove('is-swapping');
    void codexEl.offsetWidth;
    codexEl.classList.add('is-swapping');
  }
  root.querySelectorAll('[data-wl-dot]').forEach((dot, i) => {
    dot.classList.toggle('is-active', i === safe);
  });
}

function worldLoadingChromeHtml(uid, initialIdx = 0) {
  const entry = WANXIANG_LOADING_LORE[initialIdx] || WANXIANG_LOADING_LORE[0];
  return `
    <div class="wl-bg" aria-hidden="true">
      <img src="./assets/exploration-parchment.png" alt="" class="wl-map-img" />
      <div class="wl-bg-vignette"></div>
    </div>
    <div class="wl-astro-watermark" aria-hidden="true">${buildAstrolabeBackdropSvg(`${uid}-bg`)}</div>
    <div class="wl-motes" aria-hidden="true">${motesMarkup(16)}</div>
    <div class="wl-topbar">
      <div class="wl-top-left">
        <span class="wl-beacon" aria-hidden="true"></span>
        <div>
          <p class="wl-kicker">NOW LOADING</p>
          <h2 class="wl-dest-title" data-wl-dest></h2>
        </div>
      </div>
      <div class="wl-top-right">
        <p class="wl-chronicle-en">FANSHENG CHRONICLES</p>
        <p class="wl-chronicle-cn">泛生界 · 艾尔特拉大陆 · 帝国历 1463 年</p>
      </div>
    </div>
    <div class="wl-center">
      <div class="wl-panel">
        ${buildCornerBracketsHtml('wl-corner')}
        <div class="wl-panel-head">
          <span class="wl-category" data-wl-category>✦  ${escapeHtml(entry.category)}</span>
          <div class="wl-dots">${dotsMarkup(initialIdx)}</div>
        </div>
        <div class="wl-codex">
          <div class="wl-medallion" aria-hidden="true">
            <div class="wl-medallion-ring">
              ${buildAstrolabeBackdropSvg(`${uid}-med`)}
              <span class="wl-roman" data-wl-roman>${ROMAN[initialIdx] || 'I'}</span>
            </div>
          </div>
          <div class="wl-lore-copy">
            <h3 class="wl-lore-title" data-wl-lore-title>${escapeHtml(entry.title)}</h3>
            <p class="wl-lore-latin" data-wl-lore-latin>${escapeHtml(entry.latin)}</p>
            <div class="wl-divider" aria-hidden="true">${buildDividerDiamondSvg()}</div>
            <p class="wl-lore-body" data-wl-lore-body>${escapeHtml(entry.body)}</p>
          </div>
        </div>
        <div class="wl-panel-foot">
          <button type="button" class="wl-next-lore" data-wl-next-lore>◈ 翻阅下则秘闻 (NEXT LORE)</button>
          <nav hidden><a href="">重试</a><a href="./tavern.html">返回酒馆</a></nav>
        </div>
      </div>
    </div>
  `;
}

/** Populate a WorldLoadingScene chrome shell (reused by #generation-progress). */
export function mountGenerationLoadingChrome(root) {
  if (!root || root.dataset.wlMounted === 'true') return;
  const host = root.querySelector('[data-wl-gen-host]');
  if (!host) return;
  root.dataset.wlMounted = 'true';
  const uid = 'gen-' + Math.random().toString(36).slice(2, 7);
  host.innerHTML =
    worldLoadingChromeHtml(uid, 0) +
    `<div class="wl-bottom wl-gen-bottom">
      <div class="wl-status-row">
        <span class="wl-flavor">WEAVING CHRONICLE THREADS</span>
        <div class="wl-spin-wrap">
          <div class="wl-mini-astro" aria-hidden="true">${buildAstrolabeBackdropSvg(`${uid}-mini`)}</div>
          <span class="wl-percent-tag">SYNTHESIS</span>
        </div>
      </div>
      <div class="wl-sword-track is-indeterminate" aria-hidden="true">
        <div class="wl-sword-fill"><span class="wl-sheen"></span></div>
      </div>
    </div>`;
  const titleSrc = root.querySelector('#generation-title');
  const destEl = host.querySelector('[data-wl-dest]');
  if (destEl && titleSrc) destEl.textContent = titleSrc.textContent || '正在编织本章故事';
  host.addEventListener('click', (event) => {
    const nextBtn = event.target.closest('[data-wl-next-lore]');
    if (nextBtn) {
      applyLoreIndex(root, (Number(root.dataset.loreIdx) || 0) + 1);
      return;
    }
    const dotBtn = event.target.closest('[data-wl-dot]');
    if (dotBtn) applyLoreIndex(root, Number(dotBtn.dataset.wlDot));
  });
}

/** Sync #generation-progress heading to the WorldLoadingScene topbar & advance codex card. */
export function syncGenerationLoadingChrome(root, titleText) {
  mountGenerationLoadingChrome(root);
  const destEl = root?.querySelector('[data-wl-dest]');
  if (destEl && titleText) destEl.textContent = titleText;
  if (root) applyLoreIndex(root, (Number(root.dataset.loreIdx) || 0) + 1);
}

/** Lightweight WorldLoadingScene overlay for non-WebGL transitions (e.g. world atlas iframe boot). */
export function createWorldLoadingOverlay(title = '正在展开世界地图') {
  const element = document.createElement('div');
  element.className = 'scene-loading world-loading-scene';
  element.hidden = true;
  element.setAttribute('role', 'status');
  const uid = 'wo-' + Math.random().toString(36).slice(2, 7);
  element.innerHTML =
    worldLoadingChromeHtml(uid, 0) +
    `<div class="wl-bottom">
      <div class="wl-status-row">
        <div class="wl-status-copy">
          <p class="scene-loading-phase">正在展开泛生界卷轴与据点标记…</p>
          <div class="scene-loading-details"><span>LOADING</span><small>请稍候</small></div>
        </div>
        <div class="wl-spin-wrap">
          <div class="wl-mini-astro" aria-hidden="true">${buildAstrolabeBackdropSvg(`${uid}-mini`)}</div>
          <div class="wl-percent-box">
            <small class="wl-percent-tag">WORLD ATLAS</small>
          </div>
        </div>
      </div>
      <div class="wl-sword-track is-indeterminate" aria-hidden="true">
        <div class="wl-sword-fill"><span class="wl-sheen"></span></div>
      </div>
    </div>`;
  const dest = element.querySelector('[data-wl-dest]');
  if (dest) dest.textContent = title;
  let rotateTimer = null;
  const onClick = (event) => {
    const nextBtn = event.target.closest('[data-wl-next-lore]');
    if (nextBtn) {
      applyLoreIndex(element, (Number(element.dataset.loreIdx) || 0) + 1);
      return;
    }
    const dotBtn = event.target.closest('[data-wl-dot]');
    if (dotBtn) applyLoreIndex(element, Number(dotBtn.dataset.wlDot));
  };
  element.addEventListener('click', onClick);
  return {
    element,
    show(nextTitle = title) {
      const titleEl = element.querySelector('[data-wl-dest]');
      if (titleEl) titleEl.textContent = nextTitle;
      if (!element.isConnected) document.body.append(element);
      element.classList.remove('complete');
      element.hidden = false;
      clearInterval(rotateTimer);
      rotateTimer = setInterval(() => {
        if (!element.hidden) applyLoreIndex(element, (Number(element.dataset.loreIdx) || 0) + 1);
      }, 4200);
    },
    hide() {
      clearInterval(rotateTimer);
      rotateTimer = null;
      element.hidden = true;
    },
    dispose() {
      clearInterval(rotateTimer);
      rotateTimer = null;
      element.removeEventListener('click', onClick);
      element.remove();
    },
  };
}

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
  const uid = 'sl-' + Math.random().toString(36).slice(2, 7);
  element.className = 'scene-loading world-loading-scene';
  element.setAttribute('role', 'status');
  element.innerHTML =
    worldLoadingChromeHtml(uid, 0) +
    `<div class="wl-bottom">
      <div class="wl-status-row">
        <div class="wl-status-copy">
          <p class="scene-loading-phase">正在读取资源目录…</p>
          <div class="scene-loading-details"><span>0%</span><small>准备中</small></div>
        </div>
        <div class="wl-spin-wrap">
          <div class="wl-mini-astro" aria-hidden="true">${buildAstrolabeBackdropSvg(`${uid}-mini`)}</div>
          <div class="wl-percent-box">
            <strong class="wl-percent" data-wl-percent>0<span>%</span></strong>
            <small class="wl-percent-tag" data-wl-tag>LOADING</small>
          </div>
        </div>
      </div>
      <div class="scene-loading-meter wl-sword-track" role="progressbar" aria-label="场景加载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <i class="wl-sword-fill"><span class="wl-sheen"></span></i>
        <span class="wl-sword-tip" data-wl-tip aria-hidden="true"></span>
      </div>
    </div>`;

  const dest = element.querySelector('[data-wl-dest]');
  if (dest) dest.textContent = title;
  if (onReturn)
    element.querySelector('nav a:last-child').onclick = (event) => {
      event.preventDefault();
      onReturn();
    };

  const onLoreClick = (event) => {
    const nextBtn = event.target.closest('[data-wl-next-lore]');
    if (nextBtn) {
      applyLoreIndex(element, (Number(element.dataset.loreIdx) || 0) + 1);
      return;
    }
    const dotBtn = event.target.closest('[data-wl-dot]');
    if (dotBtn) {
      applyLoreIndex(element, Number(dotBtn.dataset.wlDot));
    }
  };
  element.addEventListener('click', onLoreClick);
  const rotateTimer = setInterval(() => {
    if (!terminal && !element.hidden) {
      applyLoreIndex(element, (Number(element.dataset.loreIdx) || 0) + 1);
    }
  }, 4200);

  const phase = element.querySelector('.scene-loading-phase');
  const meter = element.querySelector('[role="progressbar"]');
  const pctEl = element.querySelector('[data-wl-percent]');
  const tagEl = element.querySelector('[data-wl-tag]');
  const tipEl = element.querySelector('[data-wl-tip]');

  function cleanup() {
    clearInterval(rotateTimer);
    element.removeEventListener('click', onLoreClick);
  }

  function progress(value, text) {
    highWater = Math.max(highWater, Math.min(100, Math.floor(value)));
    meter.setAttribute('aria-valuenow', String(highWater));
    meter.querySelector('i').style.width = highWater + '%';
    if (tipEl) tipEl.style.left = highWater + '%';
    element.querySelector('.scene-loading-details span').textContent = highWater + '%';
    if (pctEl) pctEl.innerHTML = `${highWater}<span>%</span>`;
    if (tagEl) tagEl.textContent = highWater >= 100 ? 'READY' : 'LOADING';
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
        } else {
          cleanup();
          element.remove();
        }
      }
    },
    fail(error) {
      terminal = true;
      clearInterval(rotateTimer);
      phase.textContent = '载入失败：' + error.message;
      if (tagEl) tagEl.textContent = 'ERROR';
      element.querySelector('nav').hidden = false;
      element.classList.add('failed');
    },
    dispose() {
      terminal = true;
      cleanup();
      if (!assetStore) assets.dispose();
    },
  };
}
