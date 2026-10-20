import { createRawResponse } from './raw-response.js';
import { BASE_WORLDS, worldRegion, routeKey } from '../worlds.js';
import { addWorldRoute } from '../exploration.js';
import { REGIONS } from '../content/regions.js';
import { explorationSpec, availableExplorations, explorationPreview } from '../exploration.js';
import { DEFINITIONS } from '../data.js';
import { portraitUrl } from '../catalog.js';
import { html } from '../shared/html.js';
import { escapeText } from '../ui.js';
import { createDestinationPreview } from '../destination-preview.js';
import { query as $ } from './dom.js';
import { learning } from '../campaign.js';
import { destinationMap, destinationTrail, destinationMark } from '../destination-map.js';

/** Environment browsing and a persistent, pannable tree of complete journeys. */
export function createDestinations(context) {
  const { session, events } = context;
  const maps = () =>
    learning(session.ai.library) || session.ai.library.campaign?.tutorial === 'depart-again'
      ? ['ruins']
      : [
          ...BASE_WORLDS,
          ...(session.ai.library.worlds || [])
            .filter((world) => !BASE_WORLDS.includes(world.id))
            .map((world) => world.id),
          'singularity',
        ];
  const nodesFor = (map) =>
    learning(session.ai.library)
      ? session.ai.library.exploration.ruins.frontier.slice(0, 1)
      : availableExplorations(session.ai.library.exploration[map] || { frontier: [] });
  const regionFor = (id) =>
    id === 'singularity'
      ? {
          name: '多元奇点',
          description: '前往尚未记录的世界。写下目的地与愿望，让奇点构筑一条新的道路。',
          sites: [],
        }
      : worldRegion(session.ai.library, id);
  const dialog = $('#destination-dialog');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let preview = null;
  let touch = null;
  let drag = null;
  let suppressClick = false;
  const rawResponse = createRawResponse(events, 'map-raw-response', '地图 API 原始回复');
  let stage = 'region';
  let stripPage = 0;
  let request = null;
  const strip = document.createElement('div');
  strip.className = 'destination-strip';
  $('#destination-regions').before(strip);
  const previous = document.createElement('button');
  const next = document.createElement('button');
  previous.textContent = '‹';
  next.textContent = '›';
  previous.setAttribute('aria-label', '上一页地图');
  next.setAttribute('aria-label', '下一页地图');
  strip.append(previous, $('#destination-regions'), next);
  const expand = document.createElement('button');
  expand.id = 'destination-expand';
  expand.textContent = '扩充世界观';
  $('#destination-back').before(expand);
  const form = document.createElement('dialog');
  form.id = 'world-construction';
  form.innerHTML =
    '<header><div><small>MULTIVERSE / SINGULARITY</small><h2>构筑前往的世界</h2></div><button data-world-close aria-label="关闭">×</button></header><div class="world-blackhole" aria-hidden="true"><i></i></div><textarea id="world-brief" maxlength="10000" rows="6" placeholder="希望前往怎样的世界？可以补充时代、建筑、势力、人物与希望经历的故事…" aria-label="世界构筑要求"></textarea><p id="world-status" role="status"></p><footer><button data-world-config>配置地图 API</button><button data-world-submit class="primary">构筑世界</button></footer>';
  document.body.append(form);
  const lore = document.createElement('dialog');
  lore.id = 'destination-lore';
  lore.innerHTML =
    '<header><h2></h2><button aria-label="关闭世界背景">×</button></header><article></article>';
  document.body.append(lore);
  const more = document.createElement('button');
  more.id = 'destination-description';
  more.textContent = '展开世界背景';
  $('#destination-summary').after(more);
  events.on(lore.querySelector('button'), 'click', () => lore.close());
  events.on(more, 'click', () => {
    const region = regionFor(session.journey.regionMap);
    lore.querySelector('h2').textContent = region.name;
    lore.querySelector('article').textContent = region.description;
    lore.showModal();
  });
  const hole = document.createElement('div');
  hole.className = 'singularity-art';
  hole.setAttribute('aria-hidden', 'true');
  hole.innerHTML =
    '<i class="singularity-stars"></i><i class="singularity-halo"></i><i class="singularity-disc"></i><i class="singularity-core"></i><span>MULTIVERSE</span>';
  $('#destination-preview').append(hole);
  let expanding = null;
  function openWorld(extension = false) {
    const id = session.journey.regionMap;
    const region = regionFor(id);
    expanding = extension
      ? session.ai.library.worlds?.find((world) => world.id === id) || {
          id,
          map: id,
          name: region.name,
          background: region.description + '\n' + region.atmosphere,
          landmarks: [...region.sites],
          enemyIds: [...region.enemies, region.boss],
          enemyDefinitions: {},
        }
      : null;
    form.querySelector('h2').textContent = extension ? '扩充世界观' : '构筑前往的世界';
    form.querySelector('#world-brief').value = extension
      ? '沿着已有故事增加新的重要地点、事件、伏笔和敌人，保留原有世界。'
      : '';
    form.querySelector('#world-status').textContent = '';
    form.showModal();
    form.querySelector('#world-brief').focus();
  }
  events.on(previous, 'click', () => {
    stripPage = Math.max(0, stripPage - 1);
    render();
  });
  events.on(next, 'click', () => {
    stripPage = Math.min(Math.ceil(maps().length / 5) - 1, stripPage + 1);
    render();
  });
  events.on(expand, 'click', () => openWorld(true));
  events.on(form.querySelector('[data-world-close]'), 'click', () => {
    request?.abort();
    form.close();
  });
  events.on(form, 'cancel', () => request?.abort());
  events.on(form.querySelector('[data-world-config]'), 'click', () => {
    form.close();
    dialog.close();
    void context.generation.open('', 'map');
  });
  events.on(form.querySelector('[data-world-submit]'), 'click', async () => {
    if (request || session.ai.busy) return;
    request = new AbortController();
    const original = session.ai.library;
    const button = form.querySelector('[data-world-submit]');
    const status = form.querySelector('#world-status');
    session.ai.busy = true;
    button.disabled = true;
    form.dataset.busy = 'true';
    status.textContent = '正在构筑世界…';
    try {
      const result = await context.apiClient.request(
        'generate/map',
        {
          brief: form.querySelector('#world-brief').value,
          existing: expanding,
          knownEnemies: Object.assign(
            {},
            ...(original.worlds || []).map((world) => world.enemyDefinitions),
          ),
        },
        { signal: request.signal },
      );
      if (session.runtime.disposed || original !== session.ai.library) return;
      const world = result.world;
      const others = (original.worlds || []).filter((entry) => entry.id !== expanding?.id);
      if (
        others.some(
          (entry) =>
            entry.id === world.id ||
            Object.keys(world.enemyDefinitions).some(
              (id) =>
                entry.enemyDefinitions[id] &&
                JSON.stringify(entry.enemyDefinitions[id]) !==
                  JSON.stringify(world.enemyDefinitions[id]),
            ),
        )
      )
        throw Error('世界或敌人ID与已有世界冲突，未覆盖资料');
      original.worlds = [...others, world];
      addWorldRoute(original.exploration, world);
      context.generation.save();
      context.audio.play('generation-ready');
      session.journey.regionMap = world.id;
      session.journey.selectedNode = structuredClone(recommended(world.id));
      stripPage = Math.floor(maps().indexOf(world.id) / 5);
      form.close();
      setStage('region');
      context.shell.toast(`世界已保存 · 输入约 ${result.request?.tokens?.inputEstimate || 0} TK`);
    } catch (failure) {
      status.textContent = failure.name === 'AbortError' ? '已取消，未保存世界。' : failure.message;
      rawResponse.show(failure);
    } finally {
      request = null;
      session.ai.busy = false;
      button.disabled = false;
      form.dataset.busy = 'false';
    }
  });
  function recommended(map) {
    const nodes = nodesFor(map);
    return (
      [...nodes]
        .sort(
          (a, b) => Number(!!b.continuation) - Number(!!a.continuation) || b.sequence - a.sequence,
        )
        .find((node) => node.continuation) || nodes[0]
    );
  }
  function animate(element, direction) {
    element.getAnimations().forEach((animation) => animation.cancel());
    if (reduced.matches) return;
    element.animate(
      [
        { opacity: 0, transform: `translateX(${direction * 28}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 420, easing: 'cubic-bezier(.16,1,.3,1)' },
    );
  }
  function renderSite() {
    const node = session.journey.selectedNode;
    if (!node) {
      $('#destination-sites').innerHTML =
        '<article class="destination-site"><h3>本图已完成</h3><p>六处副本均已通关。可以返回选择其他地图。</p></article>';
      $('#destination-start').disabled = true;
      $('#destination-start').textContent = '本图已完成';
      return;
    }
    const spec = explorationSpec(node);
    $('#destination-sites').innerHTML = html`<article
      class="destination-site"
      data-destination="${node.id}"
    >
      <div class="destination-site-top">
        <small>✓ 已选择 · 第 ${node.sequence + 1} 处 · 完整五场</small
        ><span>${node.continuation ? '承接伏笔' : '未探索'}</span>
      </div>
      <h3>${escapeText(spec.name)}</h3>
      <p>
        ${node.continuation ? escapeText(node.continuation) : '穿过界门，沿这条路开启一段新的旅程。'}
      </p>
      <div class="destination-enemies">
        ${spec.enemyIds.map((id) => html`<img src="${portraitUrl(spec.enemyDefinitions?.[id] || DEFINITIONS[id])}" alt="${escapeText((spec.enemyDefinitions?.[id] || DEFINITIONS[id]).name)}" title="${escapeText((spec.enemyDefinitions?.[id] || DEFINITIONS[id]).name)}" />`).join('')}<small
          >可能遭遇</small
        >
      </div>
    </article>`;
    $('#destination-start').disabled = !nodesFor(routeKey(node)).some(
      (item) => item.id === node.id,
    );
    $('#destination-start').textContent = `启程 · 第 ${node.sequence + 1} 处 →`;
    $('#destination-map')
      .querySelectorAll('[data-map-node]')
      .forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.mapNode === node.id));
      });
    $('#destination-map')
      .querySelectorAll('[data-route-sequence]')
      .forEach((path) => {
        path.classList.toggle(
          'selected-trail',
          Number(path.dataset.routeSequence) <= node.sequence,
        );
      });
  }
  function center() {
    const viewport = $('#destination-map');
    const selected =
      viewport.querySelector('[aria-pressed="true"]') || viewport.querySelector('[data-map-node]');
    if (!selected) return;
    viewport.scrollTo({
      left: selected.offsetLeft - viewport.clientWidth / 2 + selected.offsetWidth / 2,
      top: selected.offsetTop - viewport.clientHeight / 2 + selected.offsetHeight / 2,
    });
  }
  function renderMap() {
    const route = session.ai.library.exploration[session.journey.regionMap];
    const entries = explorationPreview(route, session.journey.regionMap);
    const available = new Set(nodesFor(session.journey.regionMap).map((entry) => entry.id));
    const cleared = new Set((route.cleared || []).map((entry) => entry.id));
    const { positions, width, height } = destinationMap(entries);
    const paths = entries
      .filter((entry) => positions.has(entry.parentId))
      .map((entry) => {
        const a = positions.get(entry.parentId);
        const b = positions.get(entry.id);
        return `<path class="destination-trail ${cleared.has(entry.id) ? 'charted' : 'discovered'}" data-route-sequence="${entry.sequence}" style="stroke-width:${1.35 + (entry.seed % 6) * 0.12}" d="${destinationTrail(a, b, entry.seed)}"/>`;
      })
      .join('');
    $('#destination-map').innerHTML = html`<div
      class="destination-map-canvas"
      style="width:${width}px;height:${height}px"
    >
      <svg width="${width}" height="${height}" aria-hidden="true">${paths}</svg>
      ${entries
        .map((entry) => {
          const point = positions.get(entry.id);
          const done = cleared.has(entry.id);
          return html`<button
            class="destination-node ${done ? 'cleared' : !available.has(entry.id) ? 'locked' : ''}"
            data-map-node="${entry.id}"
            style="left:${point.x - 70}px;top:${point.y - 30}px;--ink-angle:${(entry.seed % 17) - 8}deg;--label-angle:${(entry.seed % 9) - 4}deg"
            aria-pressed="${entry.id === session.journey.selectedNode?.id}"
            aria-label="${escapeText(explorationSpec(entry).name)} · ${done ? '已通关' : available.has(entry.id) ? '可探索' : '未解锁'}"
            title="${done ? '已经通关，选择后续地点继续深入' : available.has(entry.id) ? '点击选择此副本，再点击启程' : '按数字顺序通关前面的地点后解锁'}"
            ${done || !available.has(entry.id) ? 'disabled' : ''}
          >
            <span class="destination-selection-label" aria-hidden="true">当前选择</span>
            <span class="destination-node-mark"
              >${destinationMark(entry.seed, done)}<em>${entry.sequence + 1}</em></span
            ><strong
              >${escapeText(entry.sequence < 6 && !entry.world ? REGIONS[entry.map].sites[entry.sequence] : explorationSpec(entry).name)}</strong
            >
          </button>`;
        })
        .join('')}
    </div>`;
    center();
  }
  function render(direction = 0) {
    const map = session.journey.regionMap;
    const region = regionFor(map);
    const availableMaps = maps();
    const index = availableMaps.indexOf(map);
    const route = session.ai.library.exploration[map];
    dialog.dataset.region = map;
    $('#destination-region-name').textContent = region.name;
    $('#destination-region-confirm').textContent = `确认「${region.name}」 →`;
    $('#destination-region-count').textContent =
      `${String(index + 1).padStart(2, '0')} / ${String(availableMaps.length).padStart(2, '0')}`;
    for (const id of ['destination-region-prev', 'destination-region-next'])
      $('#' + id).disabled = availableMaps.length === 1;
    $('#destination-summary').textContent =
      region.description.length > 78 ? region.description.slice(0, 78) + '…' : region.description;
    more.hidden = region.description.length <= 78;
    $('#destination-effect').hidden = true;
    $('#destination-status').textContent =
      map === 'singularity'
        ? '由你选择下一个世界'
        : `已探索 ${route.completed} 处${route.completed >= 6 || region.id ? ' · 无限旅途' : ' / 6'}`;
    stripPage = Math.min(stripPage, Math.ceil(availableMaps.length / 5) - 1);
    previous.disabled = stripPage === 0;
    next.disabled = (stripPage + 1) * 5 >= availableMaps.length;
    expand.hidden = map === 'singularity' || !(route?.completed >= 6 || region.id);
    $('#destination-regions').innerHTML = availableMaps
      .slice(stripPage * 5, stripPage * 5 + 5)
      .map(
        (id) =>
          html`<button
            data-region="${id}"
            aria-label="${regionFor(id).name}"
            aria-pressed="${id === map}"
          >
            <span>${escapeText(regionFor(id).name)}</span>
          </button>`,
      )
      .join('');
    if (direction) animate($('#destination-region-copy'), direction);
    try {
      preview ||= createDestinationPreview($('#destination-preview'));
      $('#destination-preview').classList.toggle('singularity', map === 'singularity');
      $('#destination-preview').tabIndex = map === 'singularity' ? 0 : -1;
      $('#destination-preview').setAttribute('role', map === 'singularity' ? 'button' : 'group');
      $('#destination-preview').setAttribute(
        'aria-label',
        map === 'singularity' ? '多元奇点，点击构筑新世界' : '场景预览',
      );
      if (map === 'singularity') preview.pause();
      else void preview.show(region.map || map, direction);
    } catch {
      $('#destination-preview').dataset.error = 'true';
    }
  }
  function setStage(next) {
    stage = next;
    dialog.dataset.stage = next;
    const route = next === 'route';
    $('#destination-origin').hidden = !route;
    $('#destination-world-screen').hidden = route;
    $('#destination-route-screen').hidden = !route;
    $('#destination-region-confirm').hidden = route;
    $('#destination-start').hidden = !route;
    $('#destination-back').hidden = !route;
    $('#destination-step').textContent = route ? '02 / 沿地图探索' : '01 / 选择异境';
    $('#destination-title').textContent = route
      ? `${regionFor(session.journey.regionMap).name} · 探索地图`
      : '选择去往的地方';
    if (route) {
      preview?.pause();
      renderMap();
      renderSite();
      $('#destination-map').focus({ preventScroll: true });
    } else {
      render();
      $('#destination-region-confirm').focus({ preventScroll: true });
    }
  }
  function changeRegion(map, direction) {
    if (stage !== 'region') return;
    if (!maps().includes(map)) return;
    if (map === session.journey.regionMap) return;
    session.journey.regionMap = map;
    session.journey.selectedNode = structuredClone(recommended(map) || null);
    render(direction);
  }
  function pageRegion(direction) {
    const availableMaps = maps();
    const index = availableMaps.indexOf(session.journey.regionMap);
    changeRegion(
      availableMaps[(index + direction + availableMaps.length) % availableMaps.length],
      direction,
    );
  }
  function open() {
    if (session.runtime.mode !== 'inn' || session.ai.busy || dialog.open) return;
    if (session.runtime.needsStart) return context.onboarding.open();
    if (context.onboarding && !context.onboarding.allowPortal('script')) return;
    if (learning(session.ai.library) || !maps().includes(session.journey.regionMap))
      session.journey.regionMap = 'ruins';
    stripPage = Math.floor(maps().indexOf(session.journey.regionMap) / 5);
    session.journey.selectedNode = structuredClone(recommended(session.journey.regionMap) || null);
    if (learning(session.ai.library)) session.journey.selectedNode.tutorial = true;
    dialog.showModal();
    setStage('region');
  }
  events.on($('#destination-regions'), 'click', (event) => {
    const button = event.target.closest('[data-region]');
    if (!button) return;
    const map = button.dataset.region;
    changeRegion(map, maps().indexOf(map) > maps().indexOf(session.journey.regionMap) ? 1 : -1);
  });
  events.on($('#destination-region-prev'), 'click', () => pageRegion(-1));
  events.on($('#destination-region-next'), 'click', () => pageRegion(1));
  events.on($('#destination-region-confirm'), 'click', () =>
    session.journey.regionMap === 'singularity' ? openWorld() : setStage('route'),
  );
  events.on($('#destination-back'), 'click', () => setStage('region'));
  events.on($('#destination-origin'), 'click', () => {
    const viewport = $('#destination-map');
    const first = viewport.querySelector('[data-map-node]');
    if (first)
      viewport.scrollTo({
        left: Math.max(0, first.offsetLeft - 80),
        top: Math.max(0, first.offsetTop - viewport.clientHeight / 2),
      });
  });
  events.on($('#destination-center'), 'click', center);
  events.on(window, 'resize', () => {
    if (dialog.open && stage === 'route') center();
  });
  events.on($('#destination-map'), 'keydown', () => {
    suppressClick = false;
  });
  events.on($('#destination-map'), 'click', (event) => {
    if (suppressClick) return;
    const button = event.target.closest('[data-map-node]');
    const node = nodesFor(session.journey.regionMap).find(
      (entry) => entry.id === button?.dataset.mapNode,
    );
    if (!node) return;
    session.journey.selectedNode = structuredClone(node);
    if (learning(session.ai.library)) session.journey.selectedNode.tutorial = true;
    renderSite();
    center();
    if (!reduced.matches)
      button.animate([{ filter: 'brightness(1.5)' }, { filter: 'brightness(1)' }], {
        duration: 350,
      });
  });
  events.on($('#destination-map'), 'pointerdown', (event) => {
    if (event.button !== 0) return;
    suppressClick = false;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      left: event.currentTarget.scrollLeft,
      top: event.currentTarget.scrollTop,
    };
  });
  events.on($('#destination-map'), 'pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) {
      suppressClick = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add('dragging');
    }
    event.currentTarget.scrollLeft = drag.left - dx;
    event.currentTarget.scrollTop = drag.top - dy;
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    events.on($('#destination-map'), name, () => {
      drag = null;
      $('#destination-map').classList.remove('dragging');
    });
  }
  events.on(dialog, 'keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (stage !== 'region') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? 1 : -1;
    pageRegion(step);
  });
  events.on($('#destination-preview'), 'click', () => {
    if (session.journey.regionMap === 'singularity') openWorld();
  });
  events.on($('#destination-preview'), 'keydown', (event) => {
    if (session.journey.regionMap === 'singularity' && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      openWorld();
    }
  });
  events.on($('#destination-preview'), 'pointerdown', (event) => {
    if (event.pointerType === 'mouse') return;
    touch = { x: event.clientX, y: event.clientY, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
  });
  events.on($('#destination-preview'), 'pointerup', (event) => {
    if (!touch || touch.id !== event.pointerId) return;
    const dx = event.clientX - touch.x;
    const dy = event.clientY - touch.y;
    touch = null;
    drag = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) pageRegion(dx < 0 ? 1 : -1);
  });
  events.on($('#destination-preview'), 'pointercancel', () => {
    touch = null;
  });
  events.on(dialog, 'close', () => {
    touch = null;
    drag = null;
    suppressClick = false;
    preview?.pause();
    dialog
      .querySelectorAll('*')
      .forEach((element) => element.getAnimations().forEach((animation) => animation.cancel()));
  });
  events.on($('#destination-close'), 'click', () => dialog.close());
  events.on($('#destination-start'), 'click', () => {
    if (stage !== 'route' || !session.journey.selectedNode || session.ai.busy) return;
    dialog.close();
    void context.generation.portal('script');
  });
  return {
    open,
    dispose() {
      request?.abort();
      form.remove();
      lore.remove();
      rawResponse.dispose();
      preview?.dispose();
    },
  };
}
