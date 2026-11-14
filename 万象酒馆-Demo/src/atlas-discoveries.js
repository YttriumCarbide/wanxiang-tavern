import { ATLAS_PLACES } from './content/atlas-geography.js';

export const DISCOVERY_DIRECTIONS = Object.freeze({
  北: [0, -1],
  东北: [1, -1],
  东: [1, 0],
  东南: [1, 1],
  南: [0, 1],
  西南: [-1, 1],
  西: [-1, 0],
  西北: [-1, -1],
});

export function routePoints(plan) {
  return [plan.stages[0].from, ...plan.stages.map((stage) => stage.to)]
    .map((stop, index) => ({
      ...stop,
      level: Math.max(plan.stages[index - 1]?.level || 1, plan.stages[index]?.level || 1),
    }))
    .filter(({ id }) => Object.hasOwn(ATLAS_PLACES, id));
}

export function chooseDiscoveryPoint(plan, discoveries, random = Math.random) {
  const used = new Set(discoveries.map((entry) => entry.generatedFrom));
  const available = routePoints(plan).filter(({ id }) => !used.has(id));
  return available[Math.floor(random() * available.length)] || null;
}

export function placeDiscovery(world, metadata, point, allowed, existing, random = Math.random) {
  const link = allowed.find(({ id }) => id === metadata?.linkId);
  const vector = DISCOVERY_DIRECTIONS[metadata?.direction];
  if (!link || !vector || !Object.hasOwn(DISCOVERY_DIRECTIONS, metadata.direction))
    throw Error('地图未指定有效的连接地点和方向');
  const [x, y] = ATLAS_PLACES[link.id].point;
  const [dx, dy] = vector;
  const occupied = [
    ...Object.values(ATLAS_PLACES).map((entry) => entry.point),
    ...existing.map((entry) => entry.point),
  ];
  const candidates = [0, 1, -1, 2, -2].flatMap((offset) =>
    [11, 15, 19].map((distance) => [
      x + dx * distance - dy * offset * 4,
      y + dy * distance + dx * offset * 4,
    ]),
  );
  const coordinates = candidates.find(([px, py]) =>
    occupied.every(([ox, oy]) => Math.hypot(px - ox, py - oy) >= 7),
  );
  if (!coordinates) throw Error('该方向的地图位置不足');
  return {
    id: world.id,
    name: world.name,
    linkId: link.id,
    ...(point ? { generatedFrom: point.id } : {}),
    direction: metadata.direction,
    point: coordinates,
    level: Math.max(1, Math.min(99, link.level + Math.floor(random() * 5) - 2)),
  };
}

export function restoreDiscoveries(value, worlds) {
  const valid = new Set(worlds.map((world) => world.id));
  const seen = new Set();
  return (Array.isArray(value) ? value : [])
    .filter((entry) => {
      if (
        !valid.has(entry?.id) ||
        seen.has(entry.id) ||
        !Object.hasOwn(ATLAS_PLACES, entry.linkId) ||
        !Object.hasOwn(DISCOVERY_DIRECTIONS, entry.direction) ||
        !Array.isArray(entry.point) ||
        entry.point.length !== 2 ||
        !entry.point.every(Number.isFinite) ||
        !Number.isInteger(entry.level) ||
        entry.level < 1 ||
        entry.level > 99
      )
        return false;
      seen.add(entry.id);
      return true;
    })
    .map((entry) => structuredClone(entry));
}
