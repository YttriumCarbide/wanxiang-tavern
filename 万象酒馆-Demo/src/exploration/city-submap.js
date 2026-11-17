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

function normalizeSceneId(sceneId) {
  return sceneId === 'starlamp-street' ? 'street' : sceneId;
}

const PIN_ICONS = Object.freeze({
  guild: '⚜',
  dungeon: '⚔',
  tavern: '⚑',
  arena: '⚔',
  fort: '♜',
  temple: '✚',
  spire: '▲',
  gate: '⛩',
  port: '⚓',
});

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

  openBtn.hidden = false;

  function skirmishStop() {
    return skirmishes?.pending?.stop || skirmishes?.active?.stop || null;
  }

  function render() {
    kicker.textContent = data.subtitle;
    titleEl.textContent = data.title;
    const combatId = skirmishStop();
    const currentNode = data.nodes.find((n) => n.current);
    if (inspectEl) {
      inspectEl.textContent = currentNode
        ? `当前所在：${currentNode.name}（${currentNode.tag}）· 点击建筑徽记前往或进入公会`
        : '点击城内建筑徽记即可直接前往';
    }

    const pins = data.nodes
      .map((node) => {
        const hasCombat = combatId === node.id;
        const isGuild = node.action === 'guild';
        const isDungeon = node.action === 'dungeon';
        const glyph = node.current ? '✦' : PIN_ICONS[node.kind] || '◆';
        return `<button
          type="button"
          class="city-submap-pinbtn ${hasCombat ? 'has-skirmish' : ''} ${isGuild ? 'is-guild' : ''} ${isDungeon ? 'is-dungeon' : ''}"
          data-city-node="${node.id}"
          data-city-action="${node.action || 'move'}"
          ${isDungeon ? `data-city-dungeon="${node.dungeonId || node.id}"` : ''}
          data-city-desc="${node.name} · ${node.current ? '当前所在' : node.tag}"
          style="left:${((node.x / data.width) * 100).toFixed(2)}%;top:${((node.y / data.height) * 100).toFixed(2)}%"
          ${node.current ? 'aria-current="location"' : ''}
          ${locked || node.current ? 'disabled' : ''}
        >
          <span class="city-submap-seal" aria-hidden="true">${glyph}</span>
          <span class="city-submap-label">${node.name}</span>
          ${hasCombat ? '<span class="city-node-skirmish" aria-label="此处有游荡敌情">☠</span>' : ''}
        </button>`;
      })
      .join('');

    canvas.innerHTML = `${buildBlueprintSvg(data.blueprint)}
      <div class="city-submap-pins">${pins}</div>`;
  }

  function open() {
    if (dialog.open) return;
    render();
    dialog.showModal();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  events.on(openBtn, 'click', open);
  events.on(closeBtn, 'click', close);
  events.on(atlasBtn, 'click', () => {
    close();
    onOpenWorldMap?.();
  });
  events.on(dialog, 'pointerover', (event) => {
    const button = event.target.closest?.('[data-city-desc]');
    if (button && inspectEl) inspectEl.textContent = button.dataset.cityDesc;
  });
  events.on(dialog, 'click', (event) => {
    if (event.target === dialog) {
      close();
      return;
    }
    const button = event.target.closest('[data-city-node]');
    if (!button || button.disabled) return;
    const action = button.dataset.cityAction;
    const targetId = button.dataset.cityNode;
    close();
    if (action === 'guild') {
      onOpenGuild?.(data.region);
      return;
    }
    if (action === 'dungeon') {
      onOpenDungeon?.(button.dataset.cityDungeon || targetId);
      return;
    }
    if (targetId && targetId !== data.currentId) onNavigate?.(targetId);
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
