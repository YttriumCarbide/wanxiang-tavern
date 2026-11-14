import { createAtlasTravel } from './atlas-travel.js';
import { populateAtlasGeography } from './atlas-geography.js';
import { ATLAS_OVERLAND_CENTER } from '../content/atlas-geography.js';
import { overlandOrigin } from '../overland-travel.js';

const ATLAS_WIDTH = 3072;
const ATLAS_HEIGHT = 2048;
const LOCAL_VIEW_WIDTH = 84;
const LOCAL_VIEW_HEIGHT = 66;
const REGION_VIEW_WIDTH = LOCAL_VIEW_WIDTH * 2;
const WORLD_VIEW_WIDTH = LOCAL_VIEW_WIDTH * 6;
const FULL_SHEET_FIT = 0.94;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

/** The atlas camera measures its view in world units, independent of screen size. */
export function createWorldMap({ dialog, events, scene, onTravel }) {
  const sheet = dialog.querySelector('.street-map-sheet');
  const fit = dialog.querySelector('#street-map-fit');
  const origin = overlandOrigin(scene);
  populateAtlasGeography(sheet);
  const screenMarkers = sheet.querySelectorAll('.street-map-screen-marker');
  const travel = createAtlasTravel({ dialog, events, scene, onTravel });
  const camera = { scale: 1, x: 0, y: 0, minimum: 1, maximum: 1 };
  const pointers = new Map();
  let pointerDownOrigin = null;
  let pointerDownTarget = null;
  let viewWidth = 0;
  let viewHeight = 0;
  let drag = null;
  let pinch = null;

  function clampCamera() {
    const mapWidth = ATLAS_WIDTH * camera.scale;
    const mapHeight = ATLAS_HEIGHT * camera.scale;
    camera.x =
      mapWidth <= viewWidth ? (viewWidth - mapWidth) / 2 : clamp(camera.x, viewWidth - mapWidth, 0);
    camera.y =
      mapHeight <= viewHeight
        ? (viewHeight - mapHeight) / 2
        : clamp(camera.y, viewHeight - mapHeight, 0);
  }

  function render() {
    const { x, y, scale } = camera;
    const width = viewWidth / scale;
    let detail = 'local';
    if (width >= WORLD_VIEW_WIDTH) detail = 'world';
    else if (width >= REGION_VIEW_WIDTH) detail = 'region';
    sheet.dataset.detail = detail;
    const fitLabel = scale === camera.minimum ? '回到两城' : '全图';
    if (fit.textContent !== fitLabel) fit.textContent = fitLabel;
    sheet.style.setProperty('--atlas-marker-scale', 1 / scale);
    for (const marker of screenMarkers) marker.setAttribute('transform', `scale(${1 / scale})`);
    sheet.setAttribute('viewBox', `${-x / scale} ${-y / scale} ${width} ${viewHeight / scale}`);
    travel.layout({ x, y, scale, width: viewWidth, height: viewHeight, detail });
  }

  function resize(reset = false) {
    const previousWidth = viewWidth;
    const previousHeight = viewHeight;
    const wasFitted = camera.scale === camera.minimum;
    const previousLocalScale = Math.min(
      (previousWidth || 1) / LOCAL_VIEW_WIDTH,
      (previousHeight || 1) / LOCAL_VIEW_HEIGHT,
    );
    const wasLocal = Math.abs(camera.scale - previousLocalScale) < 0.1;
    const centerX = previousWidth ? (previousWidth / 2 - camera.x) / camera.scale : 0;
    const centerY = previousHeight ? (previousHeight / 2 - camera.y) / camera.scale : 0;
    viewWidth = window.innerWidth;
    viewHeight = window.innerHeight;
    const localScale = Math.min(viewWidth / LOCAL_VIEW_WIDTH, viewHeight / LOCAL_VIEW_HEIGHT);
    camera.minimum = Math.min(viewWidth / ATLAS_WIDTH, viewHeight / ATLAS_HEIGHT) * FULL_SHEET_FIT;
    camera.maximum = localScale * 2.5;
    if (reset || !previousWidth || wasLocal) {
      camera.scale = localScale;
      camera.x = viewWidth / 2 - ATLAS_OVERLAND_CENTER.x * camera.scale;
      camera.y = viewHeight / 2 - ATLAS_OVERLAND_CENTER.y * camera.scale;
    } else {
      const scaleFactor = Math.min(viewWidth / previousWidth, viewHeight / previousHeight);
      camera.scale = wasFitted
        ? camera.minimum
        : clamp(camera.scale * scaleFactor, camera.minimum, camera.maximum);
      camera.x = viewWidth / 2 - centerX * camera.scale;
      camera.y = viewHeight / 2 - centerY * camera.scale;
    }
    clampCamera();
    render();
  }

  function zoomAt(clientX, clientY, factor) {
    const nextScale = clamp(camera.scale * factor, camera.minimum, camera.maximum);
    if (nextScale === camera.scale) return;
    const mapX = (clientX - camera.x) / camera.scale;
    const mapY = (clientY - camera.y) / camera.scale;
    camera.scale = nextScale;
    camera.x = clientX - mapX * nextScale;
    camera.y = clientY - mapY * nextScale;
    clampCamera();
    render();
  }

  function beginPinch() {
    const [first, second] = [...pointers.values()];
    const centerX = (first.x + second.x) / 2;
    const centerY = (first.y + second.y) / 2;
    pinch = {
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      scale: camera.scale,
      mapX: (centerX - camera.x) / camera.scale,
      mapY: (centerY - camera.y) / camera.scale,
    };
    drag = null;
  }

  function pointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    try {
      sheet.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is an enhancement; dragging still works without it.
    }
    sheet.classList.add('dragging');
    if (pointers.size === 1) {
      pointerDownOrigin = { x: event.clientX, y: event.clientY };
      pointerDownTarget = event.target;
      drag = { x: event.clientX, y: event.clientY, cameraX: camera.x, cameraY: camera.y };
      pinch = null;
    } else if (pointers.size === 2) {
      beginPinch();
    }
  }

  function pointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 1 && drag) {
      camera.x = drag.cameraX + event.clientX - drag.x;
      camera.y = drag.cameraY + event.clientY - drag.y;
      clampCamera();
      render();
      return;
    }
    if (pointers.size !== 2 || !pinch) return;
    const [first, second] = [...pointers.values()];
    const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
    const centerX = (first.x + second.x) / 2;
    const centerY = (first.y + second.y) / 2;
    const nextScale = clamp(
      pinch.scale * (distance / pinch.distance),
      camera.minimum,
      camera.maximum,
    );
    camera.scale = nextScale;
    camera.x = centerX - pinch.mapX * nextScale;
    camera.y = centerY - pinch.mapY * nextScale;
    clampCamera();
    render();
  }

  function handleClick(target) {
    const pin = target.closest('[data-travel-to]');
    const pinId = pin?.dataset.travelTo;
    if (pinId && travel.isAvailable()) {
      onTravel(pinId);
      return;
    }
    const landmark = target.closest('[data-atlas-landmark]');
    const landmarkId = landmark?.dataset.atlasLandmark;
    if (landmarkId && travel.isAvailable()) {
      if (landmarkId === 'outskirts' && origin === 'outskirts') return;
      onTravel(landmarkId);
      return;
    }
    const label = target.closest('#atlas-silver-crown, #atlas-starbell');
    if (label?.id === 'atlas-silver-crown') {
      if (travel.isAvailable()) onTravel('road-capital');
      return;
    }
    if (label?.id === 'atlas-starbell' && origin !== 'outskirts') {
      if (travel.isAvailable()) onTravel('outskirts');
    }
  }

  function pointerUp(event) {
    const isClick =
      pointerDownOrigin &&
      pointers.size === 1 &&
      Math.hypot(event.clientX - pointerDownOrigin.x, event.clientY - pointerDownOrigin.y) < 7;
    const target = pointerDownTarget;
    pointers.delete(event.pointerId);
    if (sheet.hasPointerCapture(event.pointerId)) sheet.releasePointerCapture(event.pointerId);
    if (pointers.size === 0) {
      drag = null;
      pinch = null;
      pointerDownOrigin = null;
      pointerDownTarget = null;
      sheet.classList.remove('dragging');
    } else if (pointers.size === 1) {
      const [remaining] = [...pointers.values()];
      drag = {
        x: remaining.x,
        y: remaining.y,
        cameraX: camera.x,
        cameraY: camera.y,
      };
      pinch = null;
    }
    if (isClick && target) {
      handleClick(target);
    }
  }

  function onWheel(event) {
    event.preventDefault();
    const unit = [1, 16, viewHeight][event.deltaMode] ?? 1;
    zoomAt(event.clientX, event.clientY, Math.exp(-event.deltaY * unit * 0.0015));
  }

  function resetInput() {
    pointers.clear();
    drag = null;
    pinch = null;
    sheet.classList.remove('dragging');
  }

  function onKeyDown(event) {
    if (['+', '=', '-'].includes(event.key)) {
      event.preventDefault();
      zoomAt(viewWidth / 2, viewHeight / 2, event.key === '-' ? 1 / 1.5 : 1.5);
      return;
    }
    const offsets = {
      ArrowLeft: [1, 0],
      ArrowRight: [-1, 0],
      ArrowUp: [0, 1],
      ArrowDown: [0, -1],
    };
    const direction = offsets[event.key];
    if (!direction) return;
    event.preventDefault();
    camera.x += direction[0] * viewWidth * 0.12;
    camera.y += direction[1] * viewHeight * 0.12;
    clampCamera();
    render();
  }

  function open() {
    if (dialog.open) return;
    dialog.showModal();
    resize(true);
  }

  events.on(sheet, 'pointerdown', pointerDown);
  events.on(sheet, 'pointermove', pointerMove);
  events.on(sheet, 'pointerup', pointerUp);
  events.on(sheet, 'pointercancel', pointerUp);
  events.on(sheet, 'lostpointercapture', pointerUp);
  events.on(sheet, 'pointerover', (event) => {
    if (pointers.size > 0) return;
    const pin = event.target.closest('[data-travel-to]');
    if (pin) {
      travel.setHovered(pin.dataset.travelTo);
      return;
    }
    const landmark = event.target.closest('[data-atlas-landmark]');
    const id = landmark?.dataset.atlasLandmark;
    if (id) {
      travel.setHovered(id);
    } else {
      const label = event.target.closest('#atlas-silver-crown');
      if (label) travel.setHovered('road-capital');
    }
  });
  events.on(sheet, 'pointerout', (event) => {
    if (pointers.size > 0) return;
    const landmark = event.target.closest(
      '[data-travel-to], [data-atlas-landmark], #atlas-silver-crown',
    );
    if (landmark) travel.setHovered(null);
  });
  events.on(dialog.querySelector('.street-map-body'), 'wheel', onWheel, { passive: false });
  events.on(sheet, 'keydown', onKeyDown);
  events.on(fit, 'click', () => {
    if (camera.scale === camera.minimum) resize(true);
    else {
      camera.scale = camera.minimum;
      clampCamera();
      render();
    }
  });
  events.on(window, 'resize', () => {
    if (!dialog.open) return;
    resetInput();
    resize();
  });
  events.on(dialog, 'close', () => {
    if (dialog.open) return;
    resetInput();
    travel.reset();
  });

  return { open, updateTravel: travel.update, updateDiscoveries: travel.updateDiscoveries };
}
