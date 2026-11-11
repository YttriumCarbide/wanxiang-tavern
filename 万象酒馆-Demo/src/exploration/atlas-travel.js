import { OVERLAND_LEGS, OVERLAND_STOPS, overlandOrigin, overlandPlan } from '../overland-travel.js';

// Coordinates in the silver road illustration, relative to its origin on the atlas.
const STOP_ANCHORS = Object.freeze({
  outskirts: { x: -22.6, y: -0.5, city: '星钟城' },
  'road-bridge': { x: -7.48, y: 0.17 },
  'road-reeds': { x: 6.15, y: 2.74, above: true },
  'road-capital': { x: 24, y: 0, city: '银冠城' },
});
const LEG_ANCHORS = Object.freeze({
  'bridge-patrol': { x: -15.5, y: -2.9, above: true },
  'meadow-crossing': { x: -0.6, y: -0.34, compactLeader: true },
  'capital-road': { x: 15.2, y: -0.04, above: true, compactLeader: true },
});

export function createAtlasTravel({ dialog, events, center, scene, onTravel }) {
  const layer = dialog.querySelector('.street-atlas-travel');
  const balance = layer.querySelector('.street-atlas-turns');
  const highlight = dialog.querySelector('.street-atlas-route-preview');
  const clip = dialog.querySelector('#street-atlas-preview-clip rect');
  const origin = overlandOrigin(scene);
  let available = false;
  let hovered = null;
  let focused = null;
  let view = null;

  function preview() {
    const destination = hovered || focused;
    const visible = available && destination && view?.detail !== 'world';
    highlight.classList.toggle('previewed', Boolean(visible));
    if (!visible) return;
    const start = STOP_ANCHORS[origin].x;
    const end = STOP_ANCHORS[destination].x;
    clip.setAttribute('x', Math.min(start, end));
    clip.setAttribute('width', Math.abs(end - start));
  }

  const pins = OVERLAND_STOPS.map((stop) => {
    const anchor = STOP_ANCHORS[stop.id];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'street-atlas-pin';
    button.dataset.travelTo = stop.id;
    button.dataset.kind = anchor.city ? 'city' : 'stop';
    button.dataset.above = String(Boolean(anchor.above));
    const mark = document.createElement('span');
    mark.className = 'street-atlas-pin-mark';
    mark.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.className = 'street-atlas-pin-label';
    const name = document.createElement('strong');
    name.textContent = anchor.city || stop.name;
    const detail = document.createElement('small');
    label.append(name, detail);
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
      focused = stop.id;
      preview();
    });
    events.on(button, 'blur', () => {
      if (focused === stop.id) focused = null;
      preview();
    });
    events.on(button, 'click', () => onTravel(stop.id));
    return { id: stop.id, anchor, button, detail };
  });

  const labels = OVERLAND_LEGS.map((leg) => {
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
    return { anchor, label };
  });

  function project(element, anchor, shown) {
    const x = view.x + (center.x + anchor.x) * view.scale;
    const y = view.y + (center.y + anchor.y) * view.scale;
    element.hidden = !shown || x < 14 || y < 14 || x > view.width - 14 || y > view.height - 14;
    element.style.left = `${x}px`;
    element.style.top = `${y}px`;
  }

  function layout(next = view) {
    view = next;
    if (!view) return;
    for (const { button, anchor } of pins)
      project(button, anchor, view.detail === 'local' || (anchor.city && view.detail === 'region'));
    for (const { label, anchor } of labels) project(label, anchor, view.detail === 'local');
    preview();
  }

  function update(outing) {
    available = Boolean(outing && origin);
    layer.hidden = !available;
    dialog.dataset.travel = String(available);
    if (!available) {
      reset();
      return;
    }
    balance.textContent = `剩余 ${outing.remaining} 回合`;
    for (const { id, button, detail } of pins) {
      const current = id === origin;
      const cost = current ? 0 : overlandPlan(origin, id).turns;
      const reason = cost > outing.remaining ? '回合不足' : outing.locked ? '行程进行中' : '';
      button.disabled = current || Boolean(reason);
      button.dataset.current = String(current);
      if (current) button.setAttribute('aria-current', 'location');
      else button.removeAttribute('aria-current');
      detail.textContent = current ? '当前位置' : `${cost} 回合${reason ? ` · ${reason}` : ''}`;
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

  return { layout, update, reset };
}
