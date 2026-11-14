import {
  CAPITAL_ROAD_STOPS,
  OVERLAND_STOPS,
  SILVER_ROAD_LEGS,
  overlandOrigin,
  overlandPlan,
} from '../overland-travel.js';
import { ATLAS_PLACES, ATLAS_SILVER_ROAD } from '../content/atlas-geography.js';

const STOP_LABELS = Object.freeze({
  outskirts: { city: true },
  'road-reeds': { above: true },
  'road-capital': { city: true },
  'eternal-road-orchard': { above: true },
  'eternal-road-checkpoint': { above: true },
  'eternal-city': { city: true, above: true },
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
  const roads = dialog.querySelector('[data-atlas-roads]');

  function preview() {
    const destination = hovered || focused;
    const stages =
      available && destination && view?.detail !== 'world'
        ? overlandPlan(
            origin,
            destination,
            discoveries.find(({ id }) => id === destination),
          ).stages
        : [];
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

  function createPin(stop, place = ATLAS_PLACES[stop.id]) {
    const [x, y] = place.point;
    const labelStyle = STOP_LABELS[stop.id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'street-atlas-pin';
    button.dataset.travelTo = stop.id;
    button.dataset.kind = labelStyle?.city ? 'city' : 'stop';
    button.dataset.above = String(Boolean(labelStyle?.above));
    const mark = document.createElement('span');
    mark.className = 'street-atlas-pin-mark';
    mark.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'street-atlas-pin-label';
    const name = document.createElement('strong');
    name.textContent = place.name;
    const detail = document.createElement('small');
    const availability = document.createElement('small');
    availability.className = 'street-atlas-pin-reason';
    availability.hidden = true;
    label.append(name, detail, availability);
    button.append(mark, label);
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
    return { id: stop.id, anchor: { x, y }, button, detail, availability, linkId: stop.linkId };
  }
  const pins = OVERLAND_STOPS.map((stop) => createPin(stop));

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
    const compact = view.detail === 'region' || view.capitalRoute || view.scale * 13.5 < 70;
    layer.dataset.compact = String(compact);
    balance.hidden = view.detail === 'world';
    const pinSize = Math.min(44, Math.max(16, view.scale * (view.capitalRoute ? 8 : 13.5) - 2));
    layer.style.setProperty('--atlas-pin-size', `${pinSize}px`);
    for (const { id, linkId, button, anchor } of [...pins, ...discoveryPins]) {
      const routePoint = linkId || id;
      const onCapitalRoad = CAPITAL_ROAD_STOPS.some((stop) => stop.id === routePoint);
      const onSelectedRoad = routePoint === 'outskirts' || onCapitalRoad === view.capitalRoute;
      project(button, anchor, onSelectedRoad && view.detail !== 'world');
    }
    for (const { label, anchor } of labels)
      project(label, anchor, !view.capitalRoute && view.detail === 'local' && !compact);
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
    balance.textContent = outing.preview ? '准备出门' : `已外出 ${outing.turns || 0} 回合`;
    for (const { id, button, detail, availability } of [...pins, ...discoveryPins]) {
      const current = id === origin;
      const cost = current
        ? 0
        : overlandPlan(
            origin,
            id,
            discoveries.find((entry) => entry.id === id),
          ).turns;
      const reason = outing.locked ? '行程进行中' : '';
      button.disabled = current || Boolean(reason);
      button.dataset.current = String(current);
      if (current) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
      detail.textContent = current ? '当前位置' : `${cost} 回合`;
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

  return { layout, update, reset, updateDiscoveries, setHovered, isAvailable };
}
