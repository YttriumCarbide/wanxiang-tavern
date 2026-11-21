import { STARBELL_SCENES } from '../content/starbell-scenes.js';
import { TOWN_SIDE_PLACES } from '../content/town-side-places.js';
import { SILVER_CROWN_PLACES } from '../content/silver-crown-scenes.js';
import { ETERNAL_CITY_PLACES } from '../content/eternal-city-scenes.js';
import {
  buildBlueprintSvg,
  CITY_BLUEPRINTS,
  CITY_MAP_HEIGHT,
  CITY_MAP_WIDTH,
} from '../content/city-blueprints.js';
import { OVERLAND_DUNGEON_ARCH_SVG, MAP_WALKER_SVG, animatePathWalk } from '../destination-map.js';

function normalizeSceneId(sceneId) {
  return sceneId === 'starlamp-street' ? 'street' : sceneId;
}

/** Identify whether a scene belongs to one of the three major city sub-maps. */
export function cityRegionForScene(sceneId) {
  const id = normalizeSceneId(sceneId);
  if (
    id === 'street' ||
    id === 'city-center' ||
    Object.hasOwn(STARBELL_SCENES, id) ||
    Object.hasOwn(TOWN_SIDE_PLACES, id)
  )
    return 'starbell';
  if (id === 'road-capital' || Object.hasOwn(SILVER_CROWN_PLACES, id)) return 'silver-crown';
  if (Object.hasOwn(ETERNAL_CITY_PLACES, id)) return 'eternal-city';
  return null;
}

/** Build hand-authored parchment SVG blueprint coordinates and landmark pins for a city sub-map. */
export function buildCitySubmapData(sceneId) {
  const region = cityRegionForScene(sceneId);
  if (!region) return null;
  const blueprint = CITY_BLUEPRINTS[region];
  if (!blueprint) return null;
  const currentId = normalizeSceneId(sceneId);
  const nodes = blueprint.nodes.map((node) => ({
    ...node,
    current: node.id === currentId,
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges = blueprint.edges
    .filter(([from, to]) => byId.has(from) && byId.has(to))
    .map(([from, to]) => ({
      from,
      to,
      a: byId.get(from),
      b: byId.get(to),
    }));
  return {
    region,
    title: blueprint.title,
    subtitle: blueprint.subtitle,
    width: CITY_MAP_WIDTH,
    height: CITY_MAP_HEIGHT,
    currentId,
    blueprint,
    nodes,
    edges,
  };
}

/** Controller for the interactive Major City Parchment Blueprint Sub-map in street.html. */
export function createCitySubmap({
  events,
  definition,
  onNavigate,
  onOpenWorldMap,
  onOpenGuild,
  onOpenDungeon,
}) {
  const openBtn = document.getElementById('street-submap-open');
  const dialog = document.getElementById('street-city-submap');
  const kicker = document.getElementById('street-city-submap-kicker');
  const titleEl = document.getElementById('street-city-submap-title');
  const canvas = document.getElementById('street-city-submap-canvas');
  const closeBtn = document.getElementById('street-city-submap-close');
  const atlasBtn = document.getElementById('street-city-submap-atlas');
  const inspectEl = document.getElementById('street-city-submap-inspect');

  const data = buildCitySubmapData(definition.id);
  if (!data || !openBtn || !dialog || !canvas) {
    if (openBtn) openBtn.hidden = true;
    return {
      supported: () => false,
      isOpen: () => false,
      open: () => {},
      close: () => {},
      update: () => {},
    };
  }

  let skirmishes = null;
  let locked = false;
  let panX = 0;
  let panY = 0;
  let drag = null;
  let suppressClick = false;
  let walking = false;
  let cancelWalk = null;
  let closeTimer = null;
  let panFrame = null;

  openBtn.hidden = false;

  function skirmishStop() {
    return skirmishes?.pending?.stop || skirmishes?.active?.stop || null;
  }

  function applyPan() {
    const stageEl = canvas.querySelector('.city-submap-stage');
    if (!stageEl) return;
    const canvasRect = canvas.getBoundingClientRect();
    const stageWidth = stageEl.offsetWidth || canvasRect.width;
    const stageHeight = stageEl.offsetHeight || canvasRect.height;
    const maxX = Math.max(0, (stageWidth - canvasRect.width) / 2);
    const maxY = Math.max(0, (stageHeight - canvasRect.height) / 2);
    panX = Math.max(-maxX, Math.min(maxX, panX));
    panY = Math.max(-maxY, Math.min(maxY, panY));
    stageEl.style.setProperty('--submap-pan-x', `${panX.toFixed(1)}px`);
    stageEl.style.setProperty('--submap-pan-y', `${panY.toFixed(1)}px`);
  }

  function render() {
    kicker.textContent = data.subtitle;
    titleEl.textContent = data.title;
    const combatId = skirmishStop();
    const currentNode = data.nodes.find((n) => n.current);
    if (inspectEl) {
      inspectEl.textContent = currentNode
        ? `当前所在：${currentNode.name}（${currentNode.tag}）· 拖动可微移地图，点击徽记前往或进入公会`
        : '拖动可微移地图，点击城内建筑徽记即可前往';
    }

    const pins = data.nodes
      .map((node) => {
        const hasCombat = combatId === node.id;
        const isGuild = node.action === 'guild';
        const isDungeon = node.action === 'dungeon';
        const kind = isDungeon ? 'dungeon' : isGuild ? 'guild' : 'stop';
        const mark = isDungeon
          ? `<span class="city-submap-seal" aria-hidden="true">${OVERLAND_DUNGEON_ARCH_SVG}</span><em class="city-dungeon-lv">Lv.${node.level || 6}</em>`
          : '<span class="city-submap-seal" aria-hidden="true"></span>';
        return `<button
          type="button"
          class="city-submap-pinbtn ${hasCombat ? 'has-skirmish' : ''} ${isGuild ? 'is-guild' : ''} ${isDungeon ? 'is-dungeon' : ''}"
          data-city-node="${node.id}"
          data-city-action="${node.action || 'move'}"
          data-kind="${kind}"
          ${isDungeon ? `data-city-dungeon="${node.dungeonId || node.id}"` : ''}
          data-city-desc="${node.name} · ${node.current ? '当前所在' : node.tag}"
          style="left:${((node.x / data.width) * 100).toFixed(2)}%;top:${((node.y / data.height) * 100).toFixed(2)}%"
          ${node.current ? 'aria-current="location"' : ''}
          ${locked || node.current ? 'disabled' : ''}
        >
          ${mark}
          <span class="city-submap-label">${node.name}</span>
          ${hasCombat ? '<span class="city-node-skirmish" aria-label="此处有游荡敌情">☠</span>' : ''}
        </button>`;
      })
      .join('');

    const walkerHtml = currentNode
      ? `<div class="city-submap-walker" aria-hidden="true" data-facing="right" style="left:${((currentNode.x / data.width) * 100).toFixed(2)}%;top:${((currentNode.y / data.height) * 100).toFixed(2)}%">${MAP_WALKER_SVG}</div>`
      : '';
    canvas.innerHTML = `<div class="city-submap-stage">${buildBlueprintSvg(data.blueprint)}
      <div class="city-submap-pins">${pins}</div>${walkerHtml}</div>`;
    applyPan();
  }

  function lanePath(fromId, toId) {
    const byId = new Map(data.nodes.map((node) => [node.id, node]));
    const adj = new Map(data.nodes.map((node) => [node.id, []]));
    for (const edge of data.edges) {
      adj.get(edge.from)?.push(edge.to);
      adj.get(edge.to)?.push(edge.from);
    }
    const queue = [[fromId]];
    const seen = new Set([fromId]);
    let found = null;
    while (queue.length) {
      const path = queue.shift();
      const tail = path.at(-1);
      if (tail === toId) {
        found = path;
        break;
      }
      for (const next of adj.get(tail) || []) {
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push([...path, next]);
      }
    }
    const ids = found || [fromId, toId];
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }

  function open() {
    if (dialog.open) return;
    resetInteraction();
    panX = 0;
    panY = 0;
    drag = null;
    suppressClick = false;
    render();
    dialog.showModal();
    panFrame = requestAnimationFrame(applyPan);
  }

  function resetInteraction() {
    walking = false;
    cancelWalk?.();
    cancelWalk = null;
    clearTimeout(closeTimer);
    cancelAnimationFrame(panFrame);
    drag = null;
    suppressClick = false;
    canvas.classList.remove('dragging');
  }

  function close() {
    resetInteraction();
    if (dialog.open) dialog.close();
  }

  events.on(openBtn, 'click', open);
  events.on(closeBtn, 'click', close);
  events.on(dialog, 'cancel', (event) => {
    event.preventDefault();
    close();
  });
  events.on(dialog, 'close', () => {
    if (!dialog.open) resetInteraction();
  });
  events.on(atlasBtn, 'click', () => {
    close();
    onOpenWorldMap?.();
  });
  events.on(window, 'resize', () => {
    if (dialog.open) applyPan();
  });
  events.on(canvas, 'pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    suppressClick = false;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX,
      panY,
    };
  });
  events.on(canvas, 'pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.hypot(dx, dy) > 6) {
      suppressClick = true;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add('dragging');
    }
    if (!suppressClick) return;
    panX = drag.panX + dx;
    panY = drag.panY + dy;
    applyPan();
  });
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    events.on(canvas, name, () => {
      drag = null;
      canvas.classList.remove('dragging');
    });
  }
  events.on(dialog, 'pointerover', (event) => {
    const button = event.target.closest?.('[data-city-desc]');
    if (button && inspectEl) inspectEl.textContent = button.dataset.cityDesc;
  });
  events.on(dialog, 'click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    if (event.target === dialog) {
      close();
      return;
    }
    const button = event.target.closest('[data-city-node]');
    if (!button || button.disabled || walking) return;
    const action = button.dataset.cityAction;
    const targetId = button.dataset.cityNode;
    const finishNode = () => {
      if (!dialog.open || locked) return;
      if (action === 'dungeon') {
        onOpenDungeon?.(button.dataset.cityDungeon || targetId);
        closeTimer = setTimeout(() => {
          if (dialog.open) close();
        }, 60);
        return;
      }
      close();
      if (action === 'guild') {
        onOpenGuild?.(data.region);
        return;
      }
      if (targetId && targetId !== data.currentId) onNavigate?.(targetId);
    };
    const walkerEl = canvas.querySelector('.city-submap-walker');
    const nodes = lanePath(data.currentId, targetId);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!walkerEl || nodes.length < 2 || reduced) {
      finishNode();
      return;
    }
    walking = true;
    walkerEl.classList.add('is-walking');
    cancelWalk = animatePathWalk({
      points: nodes.map((n) => [n.x, n.y]),
      reduced,
      durationPerUnit: 1.3,
      minMs: 220,
      maxMs: 360,
      onStep(pt, dx) {
        if (Math.abs(dx) > 0.05) walkerEl.dataset.facing = dx < 0 ? 'left' : 'right';
        walkerEl.style.left = `${((pt.x / data.width) * 100).toFixed(2)}%`;
        walkerEl.style.top = `${((pt.y / data.height) * 100).toFixed(2)}%`;
      },
      onDone() {
        cancelWalk = null;
        walking = false;
        walkerEl.classList.remove('is-walking');
        finishNode();
      },
    });
  });

  render();

  return {
    supported: () => true,
    isOpen: () => dialog.open,
    open,
    close,
    update(next = {}) {
      if (Object.hasOwn(next, 'skirmishes')) skirmishes = next.skirmishes;
      if (Object.hasOwn(next, 'locked')) locked = Boolean(next.locked);
      if (dialog.open) render();
    },
  };
}
