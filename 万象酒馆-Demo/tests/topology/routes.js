import { ATLAS_PLACES, ATLAS_ROUTES } from '../../src/content/atlas-geography.js';
import { BIOMES } from '../../src/content/biomes.js';
import { CITY_CENTER } from '../../src/content/city-center.js';
import { ETERNAL_CITY_PLACES, ETERNAL_CITY_STOPS } from '../../src/content/eternal-city-scenes.js';
import { FOREST_DUNGEONS } from '../../src/content/forest-dungeons.js';
import { FROST_DUNGEONS } from '../../src/content/frost-dungeons.js';
import {
  IMPERIAL_BRANCH_LEGS,
  IMPERIAL_CROSSROADS,
  IMPERIAL_DUNGEONS,
  IMPERIAL_FORTS,
} from '../../src/content/imperial-network.js';
import {
  ALL_OFFICIAL_DUNGEONS,
  MILL_DUNGEONS,
  RUINS_DUNGEONS,
} from '../../src/content/official-dungeons.js';
import { OVERLAND_ROAD } from '../../src/content/overland-road.js';
import { SILVER_CROWN_PLACES, TAVERN_EXITS } from '../../src/content/silver-crown-scenes.js';
import { STARBELL_SCENES } from '../../src/content/starbell-scenes.js';
import { STARLAMP_STREET } from '../../src/content/starlamp-street.js';
import { TOWN_SIDE_PLACES } from '../../src/content/town-side-places.js';
import { explorationHref, explorationScene } from '../../src/exploration/scenes.js';
import {
  ALL_OVERLAND_STOPS,
  CAPITAL_ROAD_LEGS,
  CAPITAL_ROAD_STOPS,
  SILVER_ROAD_LEGS,
  SILVER_ROAD_STOPS,
  overlandOrigin,
  overlandPlan,
} from '../../src/overland-travel.js';

const MODULES = Object.freeze([
  'content/atlas-geography.js',
  'content/biomes.js',
  'content/city-center.js',
  'content/eternal-city-scenes.js',
  'content/forest-dungeons.js',
  'content/frost-dungeons.js',
  'content/imperial-network.js',
  'content/official-dungeons.js',
  'content/overland-road.js',
  'content/silver-crown-scenes.js',
  'content/starbell-scenes.js',
  'content/starlamp-street.js',
  'content/town-side-places.js',
  'exploration/scenes.js',
  'overland-travel.js',
]);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function describe(value) {
  if (value === undefined) {
    return 'undefined';
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }

  try {
    return (
      JSON.stringify(value, (key, item) => {
        if (typeof item === 'number' && !Number.isFinite(item)) {
          return String(item);
        }

        if (typeof item === 'bigint') {
          return String(item);
        }

        return item;
      }) ?? String(value)
    );
  } catch {
    return String(value);
  }
}

function addIssue(issues, code, location, detail) {
  issues.push({
    code: String(code),
    location: String(location),
    detail: String(detail),
  });
}

function stableIssues(issues) {
  const unique = new Map();

  for (const issue of issues) {
    const record = {
      code: String(issue.code),
      location: String(issue.location),
      detail: String(issue.detail),
    };

    unique.set(JSON.stringify(record), record);
  }

  return [...unique.values()].sort((left, right) => {
    return (
      compareText(left.code, right.code) ||
      compareText(left.location, right.location) ||
      compareText(left.detail, right.detail)
    );
  });
}

function validId(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function pairKey(from, to) {
  return JSON.stringify([from, to]);
}

function undirectedKey(from, to) {
  return JSON.stringify([from, to].sort(compareText));
}

function coordinateValues(point) {
  if (Array.isArray(point)) {
    return point.length === 2 || point.length === 3 ? point : null;
  }

  if (point && typeof point === 'object' && Object.hasOwn(point, 'x')) {
    if (Object.hasOwn(point, 'z')) {
      return Object.hasOwn(point, 'y') ? [point.x, point.y, point.z] : [point.x, point.z];
    }

    if (Object.hasOwn(point, 'y')) {
      return [point.x, point.y];
    }
  }

  return null;
}

function finitePoint(point, dimensions = null) {
  const values = coordinateValues(point);

  return (
    values !== null &&
    (dimensions === null || values.length === dimensions) &&
    values.every(Number.isFinite)
  );
}

function normalizedPoint(point) {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    point.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
  );
}

function atlasPoint(point) {
  return (
    Array.isArray(point) &&
    point.length === 2 &&
    Number.isFinite(point[0]) &&
    Number.isFinite(point[1]) &&
    point[0] >= 0 &&
    point[0] <= 3000 &&
    point[1] >= 0 &&
    point[1] <= 2200
  );
}

function reachable(start, adjacency) {
  const visited = new Set();
  const pending = [start];

  while (pending.length) {
    const current = pending.pop();

    if (visited.has(current)) {
      continue;
    }

    visited.add(current);

    for (const next of adjacency.get(current) || []) {
      if (!visited.has(next)) {
        pending.push(next);
      }
    }
  }

  return visited;
}

function graphComponents(ids, adjacency) {
  const remaining = new Set(ids);
  const components = [];

  for (const id of [...ids].sort(compareText)) {
    if (!remaining.has(id)) {
      continue;
    }

    const component = [...reachable(id, adjacency)].sort(compareText);

    for (const member of component) {
      remaining.delete(member);
    }

    components.push(component);
  }

  return components;
}

function strongComponents(ids, adjacency, reverseAdjacency) {
  const remaining = new Set(ids);
  const components = [];

  for (const id of [...ids].sort(compareText)) {
    if (!remaining.has(id)) {
      continue;
    }

    const forward = reachable(id, adjacency);
    const backward = reachable(id, reverseAdjacency);
    const component = [...forward].filter((member) => backward.has(member)).sort(compareText);

    for (const member of component) {
      remaining.delete(member);
    }

    components.push(component);
  }

  return components;
}

function expandEdges(edges) {
  return edges.flatMap((edge) => {
    const forward = { ...edge, directed: true };

    if (edge.directed !== false || edge.from === edge.to) {
      return [forward];
    }

    return [
      forward,
      {
        ...edge,
        from: edge.to,
        to: edge.from,
        id: undefined,
        directed: true,
      },
    ];
  });
}

function auditReverseAdjacency(edges, location) {
  const issues = [];
  const adjacency = new Set(edges.map((edge) => pairKey(edge.from, edge.to)));
  const checked = new Set();

  for (const edge of edges) {
    const key = pairKey(edge.from, edge.to);

    if (edge.from === edge.to || checked.has(key) || adjacency.has(pairKey(edge.to, edge.from))) {
      continue;
    }

    checked.add(key);
    addIssue(
      issues,
      'reverse-adjacency-mismatch',
      location,
      `${describe(edge.from)} -> ${describe(edge.to)} has no reverse adjacency.`,
    );
  }

  return issues;
}

/**
 * Edges are directed unless directed is explicitly false.
 * Optional bounds are { minX, maxX, minY, maxY } and apply only to 2D points.
 */
export function auditGraph({
  nodes = [],
  edges = [],
  root,
  requireReverse = true,
  location = 'graph',
  bounds = null,
} = {}) {
  const issues = [];
  const ids = new Set();
  const edgeIds = new Set();
  const validEdges = [];

  if (!Array.isArray(nodes)) {
    addIssue(issues, 'invalid-nodes', location, 'Nodes must be an array.');
    nodes = [];
  }

  if (!Array.isArray(edges)) {
    addIssue(issues, 'invalid-edges', location, 'Edges must be an array.');
    edges = [];
  }

  nodes.forEach((node, index) => {
    const nodeLocation = `${location}.nodes[${index}]`;
    const id = typeof node === 'string' ? node : node?.id;

    if (!validId(id)) {
      addIssue(issues, 'invalid-node-id', nodeLocation, `Invalid node ID: ${describe(id)}.`);
      return;
    }

    if (ids.has(id)) {
      addIssue(issues, 'duplicate-node', nodeLocation, `Duplicate node ID: ${describe(id)}.`);
    }

    ids.add(id);

    if (node && typeof node === 'object' && Object.hasOwn(node, 'point')) {
      if (!finitePoint(node.point)) {
        addIssue(
          issues,
          'invalid-coordinate',
          nodeLocation,
          `${describe(id)} has invalid coordinates: ${describe(node.point)}.`,
        );
      } else if (bounds) {
        const values = coordinateValues(node.point);

        if (values.length !== 2) {
          addIssue(
            issues,
            'invalid-coordinate-bounds',
            nodeLocation,
            'Explicit 2D coordinate bounds require a 2D point.',
          );
        } else {
          const [x, y] = values;
          const outside =
            (bounds.minX !== undefined && x < bounds.minX) ||
            (bounds.maxX !== undefined && x > bounds.maxX) ||
            (bounds.minY !== undefined && y < bounds.minY) ||
            (bounds.maxY !== undefined && y > bounds.maxY);

          if (outside) {
            addIssue(
              issues,
              'coordinate-out-of-bounds',
              nodeLocation,
              `${describe(id)} has coordinates outside ${describe(bounds)}: ${describe(values)}.`,
            );
          }
        }
      }
    }
  });

  edges.forEach((edge, index) => {
    const edgeLocation = `${location}.edges[${index}]`;

    if (!edge || typeof edge !== 'object') {
      addIssue(issues, 'invalid-edge', edgeLocation, 'An edge must be an object.');
      return;
    }

    if (edge.id !== undefined) {
      if (!validId(edge.id)) {
        addIssue(issues, 'invalid-edge-id', edgeLocation, `Invalid edge ID: ${describe(edge.id)}.`);
      } else if (edgeIds.has(edge.id)) {
        addIssue(
          issues,
          'duplicate-edge-id',
          edgeLocation,
          `Duplicate edge ID: ${describe(edge.id)}.`,
        );
      }

      edgeIds.add(edge.id);
    }

    const sourceExists = ids.has(edge.from);
    const targetExists = ids.has(edge.to);

    if (!sourceExists) {
      addIssue(
        issues,
        'missing-source',
        edgeLocation,
        `Source is not registered: ${describe(edge.from)}.`,
      );
    }

    if (!targetExists) {
      addIssue(
        issues,
        'missing-target',
        edgeLocation,
        `Target is not registered: ${describe(edge.to)}.`,
      );
    }

    if (sourceExists && targetExists && edge.from === edge.to) {
      addIssue(
        issues,
        'self-loop',
        edgeLocation,
        `Edge returns to its own node: ${describe(edge.from)}.`,
      );
    }

    if (sourceExists && targetExists) {
      validEdges.push(edge);
    }
  });

  const arcs = expandEdges(validEdges);
  const adjacency = new Map([...ids].map((id) => [id, new Set()]));
  const reverseAdjacency = new Map([...ids].map((id) => [id, new Set()]));
  const weakAdjacency = new Map([...ids].map((id) => [id, new Set()]));

  for (const edge of arcs) {
    adjacency.get(edge.from).add(edge.to);
    reverseAdjacency.get(edge.to).add(edge.from);
    weakAdjacency.get(edge.from).add(edge.to);
    weakAdjacency.get(edge.to).add(edge.from);
  }

  if (requireReverse) {
    issues.push(...auditReverseAdjacency(arcs, location));
  }

  const effectiveRoot = root === undefined ? [...ids].sort(compareText)[0] : root;

  if (effectiveRoot !== undefined && !ids.has(effectiveRoot)) {
    addIssue(
      issues,
      'missing-root',
      location,
      `Root is not registered: ${describe(effectiveRoot)}.`,
    );
  }

  const weakComponents = graphComponents(ids, weakAdjacency);
  const rootComponent = weakComponents.find((component) => component.includes(effectiveRoot));

  if (weakComponents.length > 1) {
    for (const component of weakComponents) {
      if (component === rootComponent) {
        continue;
      }

      addIssue(
        issues,
        'disconnected-component',
        location,
        `Component is disconnected from ${describe(effectiveRoot)}: ${describe(component)}.`,
      );

      for (const id of component) {
        addIssue(
          issues,
          'disconnected-node',
          `${location}.nodes[${describe(id)}]`,
          `Node is disconnected from ${describe(effectiveRoot)}.`,
        );
      }
    }
  }

  if (ids.has(effectiveRoot)) {
    const forward = reachable(effectiveRoot, adjacency);
    const weak = reachable(effectiveRoot, weakAdjacency);

    for (const id of [...weak].sort(compareText)) {
      if (!forward.has(id)) {
        addIssue(
          issues,
          'directed-unreachable',
          `${location}.nodes[${describe(id)}]`,
          `Node cannot be reached from ${describe(effectiveRoot)} using directed edges.`,
        );
      }
    }
  }

  for (const component of strongComponents(ids, adjacency, reverseAdjacency)) {
    const members = new Set(component);
    const departures = new Set();

    for (const id of component) {
      for (const next of adjacency.get(id)) {
        if (!members.has(next)) {
          departures.add(next);
        }
      }
    }

    if (departures.size) {
      addIssue(
        issues,
        'directed-no-return',
        location,
        `Leaving ${describe(component)} for ${describe([...departures].sort(compareText))} has no directed return path.`,
      );
    }
  }

  return stableIssues(issues);
}

function sceneDeclarations() {
  return [
    { id: 'street', source: 'STARLAMP_STREET', definition: STARLAMP_STREET },
    { id: 'city-center', source: 'CITY_CENTER', definition: CITY_CENTER },
    ...Object.entries(STARBELL_SCENES).map(([id, definition]) => ({
      id,
      source: 'STARBELL_SCENES',
      definition,
    })),
    ...Object.keys(TOWN_SIDE_PLACES).map((id) => ({
      id,
      source: 'TOWN_SIDE_PLACES',
    })),
    ...OVERLAND_ROAD.map(({ id }) => ({
      id,
      source: 'OVERLAND_ROAD',
    })),
    ...Object.keys(SILVER_CROWN_PLACES).map((id) => ({
      id,
      source: 'SILVER_CROWN_PLACES',
    })),
    ...Object.keys(ETERNAL_CITY_PLACES).map((id) => ({
      id,
      source: 'ETERNAL_CITY_PLACES',
    })),
    ...Object.keys(ETERNAL_CITY_STOPS).map((id) => ({
      id,
      source: 'ETERNAL_CITY_STOPS',
    })),
    ...IMPERIAL_CROSSROADS.map(({ id }) => ({
      id,
      source: 'IMPERIAL_CROSSROADS',
    })),
    ...IMPERIAL_DUNGEONS.map(({ id }) => ({
      id,
      source: 'IMPERIAL_DUNGEONS',
    })),
    ...IMPERIAL_FORTS.map(({ id }) => ({
      id,
      source: 'IMPERIAL_FORTS',
    })),
  ];
}

function auditAtlas(issues) {
  const edges = [];
  const seenRoutes = new Set();

  for (const [id, place] of Object.entries(ATLAS_PLACES)) {
    if (!atlasPoint(place?.point)) {
      addIssue(
        issues,
        'invalid-atlas-coordinate',
        `ATLAS_PLACES[${describe(id)}].point`,
        `Expected finite coordinates in [0,3000] x [0,2200], received ${describe(place?.point)}.`,
      );
    }
  }

  ATLAS_ROUTES.forEach((route, index) => {
    const location = `ATLAS_ROUTES[${index}]`;

    if (!Array.isArray(route) || route.length < 2 || route.length > 3) {
      addIssue(issues, 'invalid-atlas-route', location, `Invalid route tuple: ${describe(route)}.`);
      return;
    }

    const [from, to, waypoints] = route;
    const key = undirectedKey(from, to);

    if (seenRoutes.has(key)) {
      addIssue(
        issues,
        'duplicate-atlas-route',
        location,
        `Undirected route is declared more than once: ${key}.`,
      );
    }

    seenRoutes.add(key);
    edges.push({ from, to, directed: false });

    if (waypoints !== undefined) {
      if (!Array.isArray(waypoints)) {
        addIssue(
          issues,
          'invalid-route-waypoints',
          `${location}[2]`,
          'Route waypoints must be an array.',
        );
      } else {
        waypoints.forEach((point, pointIndex) => {
          if (!atlasPoint(point)) {
            addIssue(
              issues,
              'invalid-route-waypoint',
              `${location}[2][${pointIndex}]`,
              `Waypoint is not a finite atlas coordinate: ${describe(point)}.`,
            );
          }
        });
      }
    }
  });

  issues.push(
    ...auditGraph({
      nodes: Object.keys(ATLAS_PLACES),
      edges,
      root: 'outskirts',
      location: 'atlas',
    }),
  );

  for (const [source, entries] of [
    ['IMPERIAL_CROSSROADS', IMPERIAL_CROSSROADS],
    ['IMPERIAL_DUNGEONS', IMPERIAL_DUNGEONS],
    ['IMPERIAL_FORTS', IMPERIAL_FORTS],
  ]) {
    const seen = new Set();

    entries.forEach((entry, index) => {
      const location = `${source}[${index}]`;

      if (seen.has(entry.id)) {
        addIssue(
          issues,
          'duplicate-imperial-node',
          location,
          `Duplicate imperial node: ${describe(entry.id)}.`,
        );
      }

      seen.add(entry.id);

      if (!atlasPoint(entry.point)) {
        addIssue(
          issues,
          'invalid-imperial-coordinate',
          `${location}.point`,
          `Invalid atlas coordinates: ${describe(entry.point)}.`,
        );
      }

      const atlas = ATLAS_PLACES[entry.id];

      if (!atlas) {
        addIssue(
          issues,
          'missing-imperial-atlas-place',
          location,
          `Atlas does not register ${describe(entry.id)}.`,
        );
      } else if (
        !Array.isArray(entry.point) ||
        !Array.isArray(atlas.point) ||
        entry.point.length !== atlas.point.length ||
        entry.point.some((value, pointIndex) => value !== atlas.point[pointIndex])
      ) {
        addIssue(
          issues,
          'imperial-atlas-coordinate-mismatch',
          location,
          `Imperial point ${describe(entry.point)} differs from atlas point ${describe(atlas.point)}.`,
        );
      }

      if (!Number.isInteger(entry.level) || entry.level <= 0) {
        addIssue(
          issues,
          'invalid-level',
          `${location}.level`,
          `Expected a positive integer level, received ${describe(entry.level)}.`,
        );
      }
    });
  }

  return edges;
}

function orderedRoadEdges(stops, legs, source, issues) {
  if (legs.length !== Math.max(0, stops.length - 1)) {
    addIssue(
      issues,
      'road-cardinality-mismatch',
      source,
      `${stops.length} stops require ${Math.max(0, stops.length - 1)} legs; found ${legs.length}.`,
    );
  }

  const seenStops = new Set();

  stops.forEach((stop, index) => {
    if (!validId(stop?.id)) {
      addIssue(
        issues,
        'invalid-road-stop',
        `${source}.stops[${index}]`,
        `Invalid stop ID: ${describe(stop?.id)}.`,
      );
    } else if (seenStops.has(stop.id)) {
      addIssue(
        issues,
        'duplicate-road-stop',
        `${source}.stops[${index}]`,
        `Duplicate stop ID: ${describe(stop.id)}.`,
      );
    }

    seenStops.add(stop?.id);
  });

  return legs.map((leg, index) => ({
    ...leg,
    from: stops[index]?.id,
    to: stops[index + 1]?.id,
    directed: false,
  }));
}

function auditTransport(issues, atlasEdges, sceneIds) {
  const nodes = [...ALL_OVERLAND_STOPS, { id: 'silver-fork' }];
  const ids = new Set(nodes.map((node) => node.id));
  const edges = [
    ...orderedRoadEdges(SILVER_ROAD_STOPS, SILVER_ROAD_LEGS, 'silver-road', issues),
    ...orderedRoadEdges(CAPITAL_ROAD_STOPS, CAPITAL_ROAD_LEGS, 'capital-road', issues),
    {
      id: 'silver-fork-link',
      from: 'road-capital',
      to: 'silver-fork',
      turns: 1,
      level: 4,
      directed: false,
    },
    ...IMPERIAL_BRANCH_LEGS.map((leg) => ({ ...leg, directed: false })),
  ];

  issues.push(
    ...auditGraph({
      nodes,
      edges,
      root: 'outskirts',
      location: 'transport',
    }),
  );

  edges.forEach((edge, index) => {
    for (const field of ['turns', 'level']) {
      if (!Number.isInteger(edge[field]) || edge[field] <= 0) {
        addIssue(
          issues,
          field === 'turns' ? 'invalid-turns' : 'invalid-level',
          `transport.edges[${index}].${field}`,
          `Expected a positive integer, received ${describe(edge[field])}.`,
        );
      }
    }

    if (edge.bends !== undefined) {
      if (!Array.isArray(edge.bends)) {
        addIssue(
          issues,
          'invalid-transport-waypoints',
          `transport.edges[${index}].bends`,
          'Transport bends must be an array.',
        );
      } else {
        edge.bends.forEach((point, pointIndex) => {
          if (!atlasPoint(point)) {
            addIssue(
              issues,
              'invalid-transport-waypoint',
              `transport.edges[${index}].bends[${pointIndex}]`,
              `Invalid atlas coordinates: ${describe(point)}.`,
            );
          }
        });
      }
    }
  });

  for (const stop of ALL_OVERLAND_STOPS) {
    if (!sceneIds.has(stop.id)) {
      addIssue(
        issues,
        'missing-transport-scene',
        'ALL_OVERLAND_STOPS',
        `Arrival stop has no declared playable scene: ${describe(stop.id)}.`,
      );
    }

    if (!Object.hasOwn(ATLAS_PLACES, stop.id)) {
      addIssue(
        issues,
        'missing-transport-atlas-place',
        'ALL_OVERLAND_STOPS',
        `Arrival stop has no atlas place: ${describe(stop.id)}.`,
      );
    }
  }

  const atlasPairs = new Set(atlasEdges.map((edge) => undirectedKey(edge.from, edge.to)));
  const transportPairs = new Set(edges.map((edge) => undirectedKey(edge.from, edge.to)));

  for (const edge of edges) {
    if (!atlasPairs.has(undirectedKey(edge.from, edge.to))) {
      addIssue(
        issues,
        'missing-atlas-transport-route',
        'transport',
        `Transport route has no atlas segment: ${describe(edge.from)} <-> ${describe(edge.to)}.`,
      );
    }
  }

  // Atlas geography beyond the transport graph does not promise playable travel.
  for (const edge of atlasEdges) {
    if (
      ids.has(edge.from) &&
      ids.has(edge.to) &&
      !transportPairs.has(undirectedKey(edge.from, edge.to))
    ) {
      addIssue(
        issues,
        'missing-transport-atlas-route',
        'atlas',
        `Atlas segment between registered transport nodes has no transport leg: ${describe(edge.from)} <-> ${describe(edge.to)}.`,
      );
    }
  }

  for (const section of OVERLAND_ROAD) {
    let origin;

    try {
      origin = overlandOrigin(section.id);
    } catch (error) {
      addIssue(
        issues,
        'legacy-origin-error',
        `OVERLAND_ROAD[${describe(section.id)}]`,
        String(error?.message || error),
      );
      continue;
    }

    if (!ids.has(origin)) {
      addIssue(
        issues,
        'invalid-legacy-origin',
        `OVERLAND_ROAD[${describe(section.id)}]`,
        `Legacy road scene maps to an unregistered stop: ${describe(origin)}.`,
      );
    }
  }

  return { nodes, edges, ids };
}

function validatePlan(plan, from, to, registered, location, issues) {
  if (
    plan?.from !== from ||
    plan?.to !== to ||
    !Array.isArray(plan?.legs) ||
    plan.legs.length === 0
  ) {
    addIssue(
      issues,
      'invalid-transport-plan',
      location,
      `Expected a nonempty plan from ${describe(from)} to ${describe(to)}.`,
    );
    return false;
  }

  let cursor = from;
  let turns = 0;
  let valid = true;

  plan.legs.forEach((leg, index) => {
    const legLocation = `${location}.legs[${index}]`;

    if (leg?.from?.id !== cursor) {
      addIssue(
        issues,
        'transport-plan-discontinuity',
        legLocation,
        `Expected source ${describe(cursor)}, received ${describe(leg?.from?.id)}.`,
      );
      valid = false;
    }

    for (const endpoint of ['from', 'to']) {
      if (!registered.has(leg?.[endpoint]?.id)) {
        addIssue(
          issues,
          'invalid-transport-endpoint',
          `${legLocation}.${endpoint}`,
          `Unregistered stop: ${describe(leg?.[endpoint]?.id)}.`,
        );
        valid = false;
      }
    }

    for (const field of ['turns', 'level']) {
      if (!Number.isInteger(leg?.[field]) || leg[field] <= 0) {
        addIssue(
          issues,
          field === 'turns' ? 'invalid-turns' : 'invalid-level',
          `${legLocation}.${field}`,
          `Expected a positive integer, received ${describe(leg?.[field])}.`,
        );
        valid = false;
      }
    }

    cursor = leg?.to?.id;
    turns += leg?.turns;
  });

  if (cursor !== to) {
    addIssue(
      issues,
      'transport-plan-wrong-arrival',
      location,
      `Expected arrival ${describe(to)}, received ${describe(cursor)}.`,
    );
    valid = false;
  }

  if (!Number.isFinite(turns) || turns <= 0 || plan.turns !== turns) {
    addIssue(
      issues,
      'transport-plan-turn-mismatch',
      location,
      `Declared turns ${describe(plan.turns)} differ from leg total ${describe(turns)}.`,
    );
    valid = false;
  }

  return valid;
}

function auditSceneExits(issues, declarations) {
  const ids = new Set(declarations.map((entry) => entry.id));
  const scenes = new Map();
  const edges = [];
  const navigationEdges = [];
  const declared = new Map();

  for (const entry of declarations) {
    const location = `${entry.source}[${describe(entry.id)}]`;

    if (declared.has(entry.id)) {
      addIssue(
        issues,
        'duplicate-scene',
        location,
        `Scene is also declared by ${declared.get(entry.id)}.`,
      );
    }

    declared.set(entry.id, entry.source);

    if (entry.definition && entry.id !== 'street' && entry.definition.id !== entry.id) {
      addIssue(
        issues,
        'scene-definition-id-mismatch',
        location,
        `Export key ${describe(entry.id)} differs from definition ID ${describe(entry.definition.id)}.`,
      );
    }

    let scene;

    try {
      explorationHref(entry.id);
      scene = explorationScene(entry.id);
    } catch (error) {
      addIssue(issues, 'unregistered-scene', location, String(error?.message || error));
      continue;
    }

    const expectedId = entry.id === 'street' ? STARLAMP_STREET.id : entry.id;

    if (!scene || scene.id !== expectedId) {
      addIssue(
        issues,
        'scene-fallback',
        location,
        `Declared scene resolved to ${describe(scene?.id)} instead of ${describe(expectedId)}.`,
      );
      continue;
    }

    scenes.set(entry.id, scene);
  }

  function addNavigation(from, to, id, location) {
    const edge = { from, to, id, directed: true };

    edges.push(edge);

    if (to !== 'tavern') {
      navigationEdges.push(edge);
    }

    if (!ids.has(to) && to !== 'tavern') {
      addIssue(
        issues,
        'unknown-scene-target',
        location,
        `Destination is not declared by scene content: ${describe(to)}.`,
      );
      return;
    }

    try {
      explorationHref(to);
    } catch (error) {
      addIssue(
        issues,
        'unregistered-scene-target',
        location,
        `${describe(to)}: ${String(error?.message || error)}.`,
      );
    }
  }

  for (const [id, scene] of scenes) {
    const pointIds = new Set();
    const points = Array.isArray(scene.points) ? scene.points : [];

    if (!Array.isArray(scene.points)) {
      addIssue(
        issues,
        'invalid-scene-points',
        `scenes[${describe(id)}].points`,
        'Scene points must be an array.',
      );
    }

    points.forEach((point, index) => {
      const isExit = point?.kind === '前往' || point?.kind === '返回';

      if (!isExit) {
        return;
      }

      const location = `scenes[${describe(id)}].points[${index}]`;

      if (!validId(point.id)) {
        addIssue(issues, 'invalid-exit-id', location, `Invalid exit ID: ${describe(point.id)}.`);
      } else if (pointIds.has(point.id)) {
        addIssue(
          issues,
          'duplicate-exit-id',
          location,
          `Duplicate exit ID: ${describe(point.id)}.`,
        );
      }

      pointIds.add(point.id);

      const paintedPoints = scene.illustration?.points;
      const hasPaintedAnchor =
        paintedPoints !== null &&
        typeof paintedPoints === 'object' &&
        Object.hasOwn(paintedPoints, point.id);
      const hasSpatialAnchor = Object.hasOwn(point, 'anchor');

      if (!hasPaintedAnchor && !hasSpatialAnchor) {
        addIssue(
          issues,
          'missing-exit-anchor',
          location,
          `Exit ${describe(point.id)} has neither a spatial nor an illustration anchor.`,
        );
      }

      if (hasSpatialAnchor && !finitePoint(point.anchor, 3)) {
        addIssue(
          issues,
          'invalid-exit-anchor',
          `${location}.anchor`,
          `Expected three finite local coordinates, received ${describe(point.anchor)}.`,
        );
      }

      if (hasPaintedAnchor && !normalizedPoint(paintedPoints[point.id])) {
        addIssue(
          issues,
          'invalid-exit-anchor',
          `${location}.illustration`,
          `Expected a normalized image coordinate, received ${describe(paintedPoints[point.id])}.`,
        );
      }

      addNavigation(id, point.destination, `point:${id}:${index}:${point.id}`, location);
    });

    if (scene.returnDestination !== null && scene.returnDestination !== undefined) {
      addNavigation(
        id,
        scene.returnDestination,
        `return:${id}`,
        `scenes[${describe(id)}].returnDestination`,
      );
    }
  }

  const validNavigation = navigationEdges.filter((edge) => {
    return ids.has(edge.from) && ids.has(edge.to);
  });

  issues.push(...auditReverseAdjacency(validNavigation, 'scene-navigation'));

  for (const [id, place] of Object.entries(TOWN_SIDE_PLACES)) {
    if (!ids.has(place.parent)) {
      addIssue(
        issues,
        'unknown-side-place-parent',
        `TOWN_SIDE_PLACES[${describe(id)}].parent`,
        `Parent scene is not declared: ${describe(place.parent)}.`,
      );
    }
  }

  return { ids, scenes, edges };
}

const LEGACY_ROAD_IDS = Object.freeze([
  'road-meadow',
  'road-pines',
  'road-orchard',
  'road-ridge',
  'road-downs',
  'road-aqueduct',
  'road-causeway',
]);

export function partitionLegacyRoadGraph({
  roadIds = [],
  stopIds = [],
  sceneIds = [],
  localEdges = [],
  edges = [],
} = {}) {
  const currentStopIds = new Set(stopIds);
  const localTargetIds = new Set(localEdges.map(({ to }) => to));
  const recoveryScenes = roadIds.filter((id) => {
    return LEGACY_ROAD_IDS.includes(id) && !currentStopIds.has(id) && !localTargetIds.has(id);
  });
  const recoveryIds = new Set(recoveryScenes);

  return {
    recoveryScenes,
    currentSceneIds: sceneIds.filter((id) => !recoveryIds.has(id)),
    currentEdges: edges.filter(({ from }) => !recoveryIds.has(from)),
  };
}

function auditPlayableGraph(issues, sceneData, transport) {
  const planCache = new Map();
  const travelArcs = new Map();
  const destinations = [...new Set(ALL_OVERLAND_STOPS.map((stop) => stop.id))];
  const validLocalEdges = sceneData.edges.filter((edge) => {
    return sceneData.ids.has(edge.from) && (sceneData.ids.has(edge.to) || edge.to === 'tavern');
  });

  function canTravel(from, to) {
    const key = pairKey(from, to);

    if (planCache.has(key)) {
      return planCache.get(key);
    }

    const location = `overlandPlan(${describe(from)}, ${describe(to)})`;
    let valid = false;

    try {
      const plan = overlandPlan(from, to);

      valid = validatePlan(plan, from, to, transport.ids, location, issues);
    } catch (error) {
      addIssue(issues, 'transport-plan-error', location, String(error?.message || error));
    }

    planCache.set(key, valid);
    return valid;
  }

  // Validate both directions of each physical transport leg, including silver-fork.
  for (const edge of transport.edges) {
    if (transport.ids.has(edge.from) && transport.ids.has(edge.to) && edge.from !== edge.to) {
      canTravel(edge.from, edge.to);
      canTravel(edge.to, edge.from);
    }
  }

  // Travel consumes an origin alias and arrives at an advertised stop's scene.
  // Aliasing a legacy scene to a stop does not create an arrival back to that scene.
  for (const id of sceneData.scenes.keys()) {
    let origin;

    try {
      origin = overlandOrigin(id);
    } catch (error) {
      addIssue(
        issues,
        'scene-origin-error',
        `overlandOrigin(${describe(id)})`,
        String(error?.message || error),
      );
      continue;
    }

    if (origin === null) {
      continue;
    }

    if (!transport.ids.has(origin)) {
      addIssue(
        issues,
        'invalid-scene-origin',
        `overlandOrigin(${describe(id)})`,
        `Scene maps to an unregistered transport origin: ${describe(origin)}.`,
      );
      continue;
    }

    for (const destination of destinations) {
      if (
        destination !== origin &&
        sceneData.ids.has(destination) &&
        canTravel(origin, destination)
      ) {
        travelArcs.set(pairKey(id, destination), {
          from: id,
          to: destination,
          directed: true,
        });
      }
    }
  }

  const baseEdges = new Map();

  for (const edge of [...validLocalEdges, ...travelArcs.values()]) {
    baseEdges.set(pairKey(edge.from, edge.to), {
      from: edge.from,
      to: edge.to,
      directed: true,
    });
  }

  // Reviewed legacy stages remain available for save recovery and receive
  // exit/anchor/origin/escape-plan validation above. A current transport stop
  // or an incoming local edge puts a legacy stage back in the playable graph.
  const { recoveryScenes, currentSceneIds, currentEdges } = partitionLegacyRoadGraph({
    roadIds: OVERLAND_ROAD.map(({ id }) => id),
    stopIds: destinations,
    sceneIds: [...sceneData.ids],
    localEdges: validLocalEdges,
    edges: [...baseEdges.values()],
  });
  const tavernDestinations = Object.keys(TAVERN_EXITS);

  for (const destination of tavernDestinations) {
    if (!sceneData.ids.has(destination)) {
      addIssue(
        issues,
        'unknown-tavern-exit',
        `TAVERN_EXITS[${describe(destination)}]`,
        'Conditional tavern exit does not name a declared playable scene.',
      );
    }
  }

  // The tavern is an external hub whose selected exit is conditional.
  // Check each possible selection separately instead of granting simultaneous
  // unconditional connections to every city.
  const selections = tavernDestinations.length ? tavernDestinations : [null];

  if (!tavernDestinations.length) {
    addIssue(
      issues,
      'missing-tavern-exits',
      'TAVERN_EXITS',
      'The external tavern hub has no declared exit selections.',
    );
  }

  for (const selection of selections) {
    const edges = [...currentEdges];

    if (selection !== null && sceneData.ids.has(selection)) {
      edges.push({
        from: 'tavern',
        to: selection,
        directed: true,
      });
    }

    const scenarioIssues = auditGraph({
      nodes: [...currentSceneIds, 'tavern'],
      edges,
      root: 'street',
      requireReverse: false,
      location: 'playable-scenes',
    });

    for (const issue of scenarioIssues) {
      addIssue(
        issues,
        issue.code,
        issue.location,
        `${issue.detail} Tavern exit selection: ${describe(selection)}.`,
      );
    }
  }

  return {
    edgeCount: baseEdges.size,
    exitEdgeCount: sceneData.edges.length,
    travelEdgeCount: travelArcs.size,
    tavernExitCount: tavernDestinations.length,
    recoveryScenes,
  };
}

function dungeonDependencies(entry) {
  const dependencies = [];

  function collect(value) {
    if (typeof value === 'string') {
      dependencies.push(value);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }

    if (!value || typeof value !== 'object') {
      return;
    }

    for (const field of ['dungeonId', 'requiresDungeon', 'previousDungeonId']) {
      if (typeof value[field] === 'string') {
        dependencies.push(value[field]);
      }
    }
  }

  for (const field of [
    'precondition',
    'preconditions',
    'prerequisite',
    'prerequisites',
    'requiresDungeon',
    'previousDungeonId',
  ]) {
    if (Object.hasOwn(entry, field)) {
      collect(entry[field]);
    }
  }

  return [...new Set(dependencies)].sort(compareText);
}

function auditDungeons(issues) {
  const officialGroups = [
    { map: 'ruins', entries: RUINS_DUNGEONS },
    { map: 'mill', entries: MILL_DUNGEONS },
    { map: 'forest', entries: FOREST_DUNGEONS },
    { map: 'frost', entries: FROST_DUNGEONS },
  ];
  const inferredMaps = new Map();

  for (const group of officialGroups) {
    for (const entry of group.entries) {
      inferredMaps.set(entry.id, group.map);
    }
  }

  const records = [
    ...IMPERIAL_DUNGEONS.map((entry, index) => ({
      entry,
      map: entry.biome,
      location: `IMPERIAL_DUNGEONS[${index}]`,
    })),
    ...ALL_OFFICIAL_DUNGEONS.map((entry, index) => ({
      entry,
      map: entry.map ?? entry.biome ?? inferredMaps.get(entry.id),
      location: `ALL_OFFICIAL_DUNGEONS[${index}]`,
    })),
  ];
  const ids = new Set();
  const keys = new Set();

  for (const { entry, map, location } of records) {
    if (!validId(entry.id)) {
      addIssue(
        issues,
        'invalid-dungeon-id',
        location,
        `Invalid dungeon ID: ${describe(entry.id)}.`,
      );
    } else if (ids.has(entry.id)) {
      addIssue(
        issues,
        'duplicate-dungeon-id',
        location,
        `Duplicate dungeon ID: ${describe(entry.id)}.`,
      );
    }

    ids.add(entry.id);

    if (!validId(map) || !Object.hasOwn(BIOMES, map)) {
      addIssue(
        issues,
        'unknown-dungeon-map',
        location,
        `Dungeon map is not registered in BIOMES: ${describe(map)}.`,
      );
    }

    if (entry.key !== undefined) {
      if (!validId(entry.key) || keys.has(entry.key)) {
        addIssue(
          issues,
          'invalid-dungeon-key',
          location,
          `Dungeon key is invalid or duplicated: ${describe(entry.key)}.`,
        );
      }

      keys.add(entry.key);
    }
  }

  for (const [id, map] of inferredMaps) {
    if (!ALL_OFFICIAL_DUNGEONS.some((entry) => entry.id === id)) {
      addIssue(
        issues,
        'missing-official-dungeon',
        'ALL_OFFICIAL_DUNGEONS',
        `${describe(map)} dungeon ${describe(id)} is absent from the official registry.`,
      );
    }
  }

  const adjacency = new Map([...ids].map((id) => [id, new Set()]));
  const reverseAdjacency = new Map([...ids].map((id) => [id, new Set()]));

  // Only declared dependencies are edges; array order and narrative text do not
  // establish a gameplay precondition.
  for (const { entry, location } of records) {
    for (const dependency of dungeonDependencies(entry)) {
      if (!ids.has(dependency)) {
        addIssue(
          issues,
          'unknown-dungeon-precondition',
          location,
          `Dungeon precondition is not registered: ${describe(dependency)}.`,
        );
        continue;
      }

      adjacency.get(entry.id).add(dependency);
      reverseAdjacency.get(dependency).add(entry.id);
    }
  }

  for (const component of strongComponents(ids, adjacency, reverseAdjacency)) {
    if (
      component.length > 1 ||
      (component.length === 1 && adjacency.get(component[0]).has(component[0]))
    ) {
      addIssue(
        issues,
        'dungeon-precondition-cycle',
        'dungeons',
        `Dungeon preconditions form a cycle: ${describe(component)}.`,
      );
    }
  }

  return records.length;
}

export function auditRoutes() {
  const issues = [];
  const declarations = sceneDeclarations();
  const sceneIds = new Set(declarations.map((entry) => entry.id));
  const atlasEdges = auditAtlas(issues);
  const transport = auditTransport(issues, atlasEdges, sceneIds);
  const sceneData = auditSceneExits(issues, declarations);
  const playable = auditPlayableGraph(issues, sceneData, transport);
  const dungeonCount = auditDungeons(issues);

  return {
    issues: stableIssues(issues),
    boundaries: [
      {
        source:
          'src/overland-travel.js:overlandOrigin; src/content/overland-road.js; src/exploration/scenes.js:roadScenes',
        kind: 'legacy-save-recovery',
        ids: playable.recoveryScenes,
        reason:
          'Legacy stages have no declared arrival edges; validated migration origins and escape plans replace a requirement to return to obsolete stage IDs.',
      },
    ],
    stats: {
      legacyRecoveryScenes: playable.recoveryScenes.length,
      modulesChecked: MODULES.length,
      atlasNodes: Object.keys(ATLAS_PLACES).length,
      atlasEdges: atlasEdges.length,
      atlasDirectedEdges: expandEdges(atlasEdges).length,
      playableSceneNodes: sceneIds.size,
      playableSceneEdges: playable.edgeCount,
      sceneExitEdges: playable.exitEdgeCount,
      sceneTravelEdges: playable.travelEdgeCount,
      conditionalTavernExits: playable.tavernExitCount,
      transportNodes: transport.nodes.length,
      transportEdges: transport.edges.length,
      transportDirectedEdges: expandEdges(transport.edges).length,
      dungeonsChecked: dungeonCount,
    },
  };
}
