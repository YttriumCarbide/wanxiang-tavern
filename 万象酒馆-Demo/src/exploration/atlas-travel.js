import {
  ALL_OVERLAND_STOPS,
  CAPITAL_ROAD_LEGS,
  CAPITAL_ROAD_STOPS,
  SILVER_ROAD_LEGS,
  overlandOrigin,
  overlandPlan,
} from '../overland-travel.js';
import { IMPERIAL_BRANCH_LEGS } from '../content/imperial-network.js';
import { ATLAS_PLACES, ATLAS_ROUTES, ATLAS_SILVER_ROAD } from '../content/atlas-geography.js';
import { edgeExploreKey } from '../skirmishes.js';

const STOP_LABELS = Object.freeze({
  outskirts: { city: true },
  'road-reeds': { above: true },
  'road-capital': { city: true },
  'eternal-road-orchard': { above: true },
  'eternal-road-checkpoint': { above: true },
  'eternal-city': { city: true, above: true },
  'cross-pines': { above: true },
  'cross-ridge': { above: true },
  'cross-orchard': { above: true },
  'cross-causeway': { above: true },
  ainoblin: { city: true },
  ruins: { dungeon: true },
  forest: { dungeon: true },
  frost: { dungeon: true },
  forge: { dungeon: true },
  tide: { dungeon: true },
});
const LEG_ANCHORS = Object.freeze({
  'bridge-patrol': { x: -15.5, y: -2.9, above: true },
  'meadow-crossing': { x: -0.6, y: -0.34, compactLeader: true },
  'capital-road': { x: 15.2, y: -0.04, above: true, compactLeader: true },
});

export function createAtlasTravel({ dialog, events, scene, onTravel }) {
  const layer = dialog.querySelector('.street-atlas-travel');
  const balance = layer.querySelector('.street-atlas-turns');
  const highlight = dialog.querySelector('use.street-atlas-route-preview');
  const capitalHighlights = [...dialog.querySelectorAll('[data-atlas-preview-leg]')];
  const clip = dialog.querySelector('#street-atlas-preview-clip rect');
  const origin = overlandOrigin(scene);
  let available = false;
  let hovered = null;
  let focused = null;
  let view = null;
  let outingState = null;
  let discoveries = [];
  let discoveryPins = [];
  let knownLegs = new Set();
  let unlockedDungeons = new Set();
  let skirmishes = {};
  const roads = dialog.querySelector('[data-atlas-roads]');
  const edgePaths = [...dialog.querySelectorAll('[data-atlas-edge]')];

  function preview() {
    const destination = hovered || focused;
    const plan =
      available && destination && view?.detail !== 'world'
        ? overlandPlan(
            origin,
            destination,
            discoveries.find(({ id }) => id === destination),
          )
        : null;
    const stages = plan?.legs || plan?.stages || [];
    const silverStages = stages.filter(({ id }) => Object.hasOwn(LEG_ANCHORS, id));
    highlight.classList.toggle('previewed', silverStages.length > 0);
    if (silverStages.length) {
      const a = ATLAS_PLACES[silverStages[0].from.id].point[0];
      const b = ATLAS_PLACES[silverStages.at(-1).to.id].point[0];
      clip.setAttribute('x', Math.min(a, b) - ATLAS_SILVER_ROAD.x);
      clip.setAttribute('width', Math.abs(a - b));
    }
    for (const path of capitalHighlights) {
      const [a, b] = path.dataset.atlasPreviewLeg.split(':');
      path.classList.toggle(
        'previewed',
        stages.some(
          ({ from, to }) => (from.id === a && to.id === b) || (from.id === b && to.id === a),
        ),
      );
    }
  }

  const DUNGEON_LEVEL_RANGES = Object.freeze({
    ruins: 'Lv.5-8',
    forest: 'Lv.12-16',
    frost: 'Lv.16-20',
    forge: 'Lv.22-26',
    tide: 'Lv.26-30',
  });

  const DUNGEON_ARCH_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20V11a7 7 0 0 1 14 0v9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 20v-7.5a3.5 3.5 0 0 1 7 0V20M3 20h18" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 10.5l1.6 3.5L12 16l-1.6-2Z" fill="currentColor"/></svg>';

  const SKIRMISH_TIER_SVG = Object.freeze({
    normal:
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5C6.4 2.5 3.6 5.2 3.6 8.5c0 2 .95 3.7 2.4 4.8V16c0 .85.7 1.5 1.55 1.5h4.9c.85 0 1.55-.65 1.55-1.5v-2.7c1.45-1.1 2.4-2.8 2.4-4.8 0-3.3-2.8-6-6.4-6zM7.6 10a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7zm4.8 0a1.35 1.35 0 1 1 0-2.7 1.35 1.35 0 0 1 0 2.7zM8.5 15.2v-1.7h1.1v1.7H8.5zm2 0v-1.7h1.1v1.7h-1.1z" fill="currentColor"/></svg>',
    elite:
      '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4.2 3.2 7.2 6.1C8.05 5.7 9 5.5 10 5.5s1.95.2 2.8.6l3-2.9.9 3.6c.45.85.7 1.8.7 2.8 0 1.9-.95 3.55-2.4 4.65V16.8c0 .8-.65 1.45-1.45 1.45H6.45c-.8 0-1.45-.65-1.45-1.45v-2.55C3.55 13.15 2.6 11.5 2.6 9.6c0-1 .25-1.95.7-2.8l.9-3.6zM7.6 11a1.35 1.35 0 1 0 0-2.7 1.35 1.35 0 0 0 0 2.7zm4.8 0a1.35 1.35 0 1 0 0-2.7 1.35 1.35 0 0 0 0 2.7zM8.4 16v-1.8h1.1V16H8.4zm2.1 0v-1.8h1.1V16h-1.1z" fill="currentColor"/></svg>',
    boss: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M2.2 3.5c1.1 2.4 2.6 3.7 4.4 4.1 1-.6 2.15-.9 3.4-.9s2.4.3 3.4.9c1.8-.4 3.3-1.7 4.4-4.1-.2 2.7-.9 4.7-2 5.9.2.6.3 1.2.3 1.8 0 1.8-.9 3.4-2.3 4.4V17.4c0 .8-.65 1.4-1.45 1.4H7.65c-.8 0-1.45-.6-1.45-1.4v-1.8c-1.4-1-2.3-2.6-2.3-4.4 0-.6.1-1.2.3-1.8-1.1-1.2-1.8-3.2-2-5.9zm5.4 8.2a1.35 1.35 0 1 0 0-2.7 1.35 1.35 0 0 0 0 2.7zm4.8 0a1.35 1.35 0 1 0 0-2.7 1.35 1.35 0 0 0 0 2.7zM10 13l-1 1.6h2L10 13zm-1.6 3.5V15h1.1v1.5H8.4zm2.1 0V15h1.1v1.5h-1.1z" fill="currentColor"/></svg>',
  });

  function dungeonLevelBadge(stop, place) {
    if (DUNGEON_LEVEL_RANGES[stop.id]) return DUNGEON_LEVEL_RANGES[stop.id];
    if (Number.isFinite(Number(place?.level))) return `Lv.${Number(place.level)}`;
    return '秘境';
  }

  function createPin(stop, place = ATLAS_PLACES[stop.id]) {
    const [x, y] = place.point;
    const labelStyle = STOP_LABELS[stop.id];
    const isDiscovery = Boolean(place?.linkId || stop?.linkId);
    const kind = labelStyle?.city
      ? 'city'
      : labelStyle?.dungeon || isDiscovery
        ? 'dungeon'
        : 'stop';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'street-atlas-pin';
    button.dataset.travelTo = stop.id;
    button.dataset.kind = kind;
    button.dataset.above = String(Boolean(labelStyle?.above));
    const mark = document.createElement('span');
    mark.className = 'street-atlas-pin-mark';
    mark.setAttribute('aria-hidden', 'true');
    if (kind === 'dungeon') mark.innerHTML = DUNGEON_ARCH_SVG;
    const skirmishTag = document.createElement('span');
    skirmishTag.className = 'street-atlas-skirmish-badge';
    skirmishTag.hidden = true;
    const label = document.createElement('span');
    label.className = 'street-atlas-pin-label';
    const name = document.createElement('strong');
    name.textContent = place.name;
    const detail = document.createElement('small');
    const availability = document.createElement('small');
    availability.className = 'street-atlas-pin-reason';
    availability.hidden = true;
    if (kind === 'dungeon') {
      const lvTag = document.createElement('em');
      lvTag.className = 'street-atlas-dungeon-lv';
      lvTag.textContent = dungeonLevelBadge(stop, place);
      button.append(lvTag);
    }
    label.append(name, detail, availability);
    button.append(mark, skirmishTag, label);
    layer.append(button);
    events.on(button, 'pointerenter', () => {
      if (!button.disabled) hovered = stop.id;
      preview();
    });
    events.on(button, 'pointerleave', () => {
      if (hovered === stop.id) hovered = null;
      preview();
    });
    events.on(button, 'focus', () => {
      if (button.disabled) return;
      focused = stop.id;
      preview();
    });
    events.on(button, 'blur', () => {
      if (focused === stop.id) focused = null;
      preview();
    });
    events.on(button, 'click', () => onTravel(stop.id));
    return {
      id: stop.id,
      anchor: { x, y },
      button,
      skirmishTag,
      detail,
      availability,
      linkId: stop.linkId,
    };
  }
  const pins = ALL_OVERLAND_STOPS.map((stop) => createPin(stop));

  function updateDiscoveries(entries) {
    if (
      !Array.isArray(entries) ||
      (entries.length === discoveries.length &&
        entries.every((entry, index) => entry.id === discoveries[index]?.id))
    )
      return;
    for (const { button, road } of discoveryPins) {
      button.remove();
      road.remove();
    }
    discoveries = entries.filter(
      ({ linkId, point }) => ATLAS_PLACES[linkId] && Array.isArray(point),
    );
    discoveryPins = discoveries.map((entry) => {
      const [x, y] = ATLAS_PLACES[entry.linkId].point;
      const [toX, toY] = entry.point;
      const road = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      road.classList.add('street-map-discovery-road');
      road.setAttribute(
        'd',
        `M${x} ${y} Q${x + (toX - x) * 0.28 + 3} ${y + (toY - y) * 0.65 - 2} ${toX} ${toY}`,
      );
      roads.append(road);
      return { ...createPin(entry, entry), road };
    });
    update(outingState);
  }

  const labels = SILVER_ROAD_LEGS.map((leg) => {
    const label = document.createElement('span');
    const anchor = LEG_ANCHORS[leg.id];
    label.className = 'street-atlas-leg';
    label.dataset.leg = leg.id;
    label.dataset.above = String(Boolean(anchor.above));
    if (anchor.compactLeader) label.dataset.compactLeader = 'true';
    const turns = document.createElement('span');
    turns.textContent = `${leg.turns} 回合`;
    const danger = document.createElement('small');
    danger.textContent = `危险 Lv.${leg.level}`;
    label.append(turns, danger);
    layer.append(label);
    return {
      anchor: { x: ATLAS_SILVER_ROAD.x + anchor.x, y: ATLAS_SILVER_ROAD.y + anchor.y },
      label,
    };
  });

  const roadLevelDefs = [
    ...CAPITAL_ROAD_LEGS.map((leg, idx) => ({
      from: CAPITAL_ROAD_STOPS[idx].id,
      to: CAPITAL_ROAD_STOPS[idx + 1].id,
      turns: leg.turns,
      level: leg.level,
    })),
    ...IMPERIAL_BRANCH_LEGS.map((leg) => ({
      from: leg.from,
      to: leg.to,
      turns: leg.turns,
      level: leg.level,
    })),
  ];

  const roadTags = roadLevelDefs
    .map(({ from, to, turns, level }) => {
      const route = ATLAS_ROUTES.find(
        ([a, b, bends]) => bends?.length && ((a === from && b === to) || (a === to && b === from)),
      );
      const fromPt = ATLAS_PLACES[from]?.point;
      const toPt = ATLAS_PLACES[to]?.point;
      if (!route || !fromPt || !toPt) return null;
      const dist = Math.hypot(toPt[0] - fromPt[0], toPt[1] - fromPt[1]);
      if (dist < 24) return null;
      const bends = route[2];
      const mid = bends[Math.floor(bends.length / 2)];
      const tag = document.createElement('span');
      tag.className = 'street-atlas-road-tag';
      tag.textContent = `${turns}回合 · Lv.${level}`;
      layer.append(tag);
      return { anchor: { x: mid[0], y: mid[1] }, label: tag };
    })
    .filter(Boolean);

  function project(element, anchor, shown) {
    const x = view.x + anchor.x * view.scale;
    const y = view.y + anchor.y * view.scale;
    element.hidden = !shown || x < 14 || y < 14 || x > view.width - 14 || y > view.height - 14;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  }

  function layout(next = view) {
    view = next;
    if (!view) return;
    const compact = view.detail === 'region' || view.scale * 13.5 < 70;
    layer.dataset.compact = String(compact);
    balance.hidden = view.detail === 'world';
    const pinSize = Math.min(44, Math.max(16, view.scale * 11 - 2));
    layer.style.setProperty('--atlas-pin-size', `${pinSize}px`);
    for (const { button, anchor } of [...pins, ...discoveryPins]) {
      project(button, anchor, view.detail !== 'world');
    }
    for (const { label, anchor } of labels)
      project(label, anchor, view.detail === 'local' && !compact);
    for (const { label, anchor } of roadTags) project(label, anchor, view.detail !== 'world');
    preview();
  }

  function update(outing) {
    outingState = outing;
    available = Boolean(outing && origin);
    layer.hidden = !available;
    dialog.dataset.travel = String(available);
    if (!available) {
      reset();
      return;
    }
    balance.textContent = outing.preview
      ? '准备出门'
      : outing.tutorialRuinsOnly
        ? '初探指引 · 点击星钟城旁的界隙遗迹'
        : `已外出 ${outing.turns || 0} 回合`;
    const tutorialOnly = Boolean(outing.tutorialRuinsOnly);
    for (const { id, button, detail, availability } of [...pins, ...discoveryPins]) {
      const current = id === origin;
      const isDungeon = button.dataset.kind === 'dungeon';
      const cost = current
        ? 0
        : overlandPlan(
            origin,
            id,
            discoveries.find((entry) => entry.id === id),
          ).turns;
      const tutorialBlocked = tutorialOnly && !current && id !== 'ruins';
      const reason = outing.locked ? '行程进行中' : tutorialBlocked ? '完成界隙遗迹初探后开放' : '';
      button.disabled = current || Boolean(reason);
      button.dataset.current = String(current);
      button.dataset.tutorialTarget = String(tutorialOnly && id === 'ruins' && !current);
      if (current) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
      detail.textContent = current
        ? '当前位置'
        : tutorialOnly && id === 'ruins'
          ? '新手指引 · 步行前往'
          : isDungeon
            ? unlockedDungeons.has(id)
              ? `${cost} 回合 · 已入界门`
              : `${cost} 回合 · 步行解锁`
            : `${cost} 回合`;
      availability.hidden = !reason;
      availability.textContent = reason;
      if (reason) button.setAttribute('aria-description', reason);
      else button.removeAttribute('aria-description');
      if (button.disabled && hovered === id) hovered = null;
      if (button.disabled && focused === id) focused = null;
    }
    layout();
  }

  function reset() {
    hovered = null;
    focused = null;
    preview();
  }

  function setHovered(id) {
    if (hovered === id) return;
    hovered = id;
    preview();
  }

  function isAvailable() {
    return available;
  }

  function updateWorldState({
    exploration,
    skirmishes: nextSkirmishes,
    unlockedDungeons: nextDungeons,
  } = {}) {
    knownLegs = new Set(Array.isArray(exploration?.legs) ? exploration.legs : []);
    if (Array.isArray(nextDungeons)) unlockedDungeons = new Set(nextDungeons);
    skirmishes =
      nextSkirmishes && typeof nextSkirmishes === 'object'
        ? nextSkirmishes.nodes || nextSkirmishes
        : {};
    for (const path of edgePaths) {
      const [a, b] = path.dataset.atlasEdge.split(':');
      const explored = knownLegs.has(edgeExploreKey(a, b));
      path.dataset.explored = explored ? 'true' : 'false';
    }
    for (const pin of pins) {
      const isDungeon = pin.button.dataset.kind === 'dungeon';
      if (isDungeon) pin.button.dataset.unlocked = String(unlockedDungeons.has(pin.id));
      const activeSkirmish = isDungeon ? null : skirmishes[pin.id];
      if (!pin.skirmishTag) continue;
      pin.skirmishTag.hidden = !activeSkirmish;
      pin.skirmishTag.innerHTML = activeSkirmish
        ? `<i class="fe-skirmish-crest" data-tier="${activeSkirmish.tier}" aria-hidden="true">${SKIRMISH_TIER_SVG[activeSkirmish.tier] || SKIRMISH_TIER_SVG.elite}</i><em class="fe-skirmish-lv">Lv.${activeSkirmish.level}</em>`
        : '';
      pin.button.dataset.skirmish = activeSkirmish ? activeSkirmish.tier : '';
    }
    if (outingState) update(outingState);
  }

  return {
    layout,
    update,
    reset,
    updateDiscoveries,
    updateWorldState,
    setHovered,
    isAvailable,
  };
}
