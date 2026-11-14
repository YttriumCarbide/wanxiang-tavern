import { ATLAS_PLACES, ATLAS_ROUTES, ATLAS_TERRAIN } from '../content/atlas-geography.js';
import { CAPITAL_ROAD_STOPS } from '../overland-travel.js';

const SVG = 'http://www.w3.org/2000/svg';
const SILVER_ROAD_ART = './assets/exploration/fansheng-silver-road.svg';
const TERRAIN_ART = { grove: 'grove', hill: 'hill-hatch', reed: 'reed' };

function element(tag, attrs) {
  const node = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

function roadLine([first, ...points]) {
  let path = `M${first.join(' ')}`;
  for (let i = 0; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nextX, nextY] = points[i + 1];
    path += ` Q${x} ${y} ${(x + nextX) / 2} ${(y + nextY) / 2}`;
  }
  return path + ` L${points.at(-1).join(' ')}`;
}

function populateRoads(layer) {
  const fill = element('g', { class: 'street-map-road-fill' });
  const seam = element('g', { class: 'street-map-road-seam' });
  const highlights = element('g', { 'aria-hidden': 'true' });
  for (const [from, to, bends] of ATLAS_ROUTES) {
    if (!bends) continue;
    const points = [ATLAS_PLACES[from].point, ...bends, ATLAS_PLACES[to].point];
    const d = roadLine(points);
    layer.append(element('path', { d, 'data-atlas-road': `${from}:${to}` }));
    fill.append(element('path', { d }));
    seam.append(element('path', { d }));
    if (
      CAPITAL_ROAD_STOPS.some(({ id }) => id === from) &&
      CAPITAL_ROAD_STOPS.some(({ id }) => id === to)
    ) {
      highlights.append(
        element('path', {
          d,
          class: 'street-atlas-route-preview',
          'data-atlas-preview-leg': `${from}:${to}`,
        }),
      );
    }
  }
  layer.append(fill, seam, highlights);
}

function populateRelief(layer, rangesLayer) {
  for (const [kind, regional, local, ranges = []] of ATLAS_TERRAIN) {
    const symbol = TERRAIN_ART[kind];
    const href = symbol ? `${SILVER_ROAD_ART}#${symbol}` : `#atlas-${kind}`;
    for (const [marks, target, className] of [
      [regional, layer, 'street-map-relief-mark'],
      [local, layer, 'street-map-local'],
      [ranges, rangesLayer || layer, 'street-map-relief-mark'],
    ]) {
      for (const [x, y, size, rotation = 0] of marks) {
        target.append(
          element('use', {
            href,
            class: className,
            transform: `translate(${x} ${y}) rotate(${rotation}) scale(${size})`,
          }),
        );
      }
    }
  }
}

function addMarker(layer, id, place) {
  const anchor = element('g', {
    transform: `translate(${place.point.join(' ')})`,
    'data-atlas-landmark': id,
  });
  const marker = element('g', {
    class: `street-map-screen-marker street-map-landmark${place.marker === 'gate' ? ' street-map-gate' : ''}`,
  });
  const label = element('text', {});
  label.textContent = place.name;
  marker.append(element('circle', { r: 6.5 }), label);
  anchor.append(marker);
  layer.append(anchor);
  return anchor;
}

function engraveSettlement(anchor, place) {
  const marker = anchor.querySelector('.street-map-screen-marker');
  marker.querySelector('use')?.remove();
  const crossing = place.marker === 'gate';
  const artwork = element('use', {
    href: `#atlas-${place.marker}`,
    class: 'street-map-local street-map-settlement',
  });
  marker.before(artwork);
  if (crossing) return;
  marker.classList.add('street-map-settlement-point');
  const label = element('text', {
    class: 'street-map-local street-map-city-labels',
    y: 3.5,
  });
  label.textContent = place.name;
  marker.after(label);
}

export function populateAtlasGeography(sheet) {
  populateRoads(sheet.querySelector('[data-atlas-roads]'));
  populateRelief(
    sheet.querySelector('[data-atlas-relief]'),
    sheet.querySelector('[data-atlas-ranges]'),
  );
  const markers = sheet.querySelector('.street-map-landmarks');
  for (const [id, place] of Object.entries(ATLAS_PLACES)) {
    const existing = markers.querySelector(`[data-atlas-landmark="${id}"]`);
    if (existing) existing.querySelector('text').textContent = place.name;
    if (place.marker === 'stop')
      addMarker(markers, id, place).classList.add('street-map-capital-stop');
    else if (place.marker) engraveSettlement(existing || addMarker(markers, id, place), place);
  }
}
