import { BASE_WORLDS, routeKey, isEndless, validateEncounters } from './worlds.js';
import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from './content/journey-rules.js';
import { REGIONS } from './content/regions.js';
import { MAP_IDS } from './content/biomes.js';
import { DEFINITIONS } from './data.js';
import { tutorialSpec } from './content/tutorial.js';
import { ruinsEncounterSpec } from './content/ruins-encounters.js';

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function node(map, sequence, seed, continuation = null, parentId = null, depth = 0, world = null) {
  return {
    id: `${world?.id || map}-${sequence}-${seed >>> 0}`,
    map,
    ...(world ? { world: structuredClone(world) } : {}),
    sequence,
    seed: seed >>> 0,
    site: sequence % 6,
    continuation,
    parentId,
    depth,
  };
}

export function newExploration(seed = 17371) {
  return Object.fromEntries(
    MAP_IDS.map((map, index) => [
      map,
      {
        completed: 0,
        nextSequence: 1,
        frontier: [node(map, 0, (seed + index * 7919) >>> 0)],
        cleared: [],
        history: [],
      },
    ]),
  );
}

export function availableExplorations(route) {
  const frontier = route.frontier.filter(
    (entry) => isEndless(entry) || entry.sequence < REGIONS[entry.map].sites.length,
  );
  const sequence = Math.min(...frontier.map((entry) => entry.sequence));
  return frontier.filter((entry) => entry.sequence === sequence);
}

export function explorationPreview(route, map) {
  if (route.frontier[0]?.world)
    return route.frontier.map((entry) => ({ ...entry, parentId: null }));
  const available = availableExplorations(route);
  const latest = Math.max(0, ...available.map((entry) => entry.sequence));
  const known = [...(route.cleared || []), ...route.frontier]
    .filter(
      (entry) =>
        entry.sequence < 6 ||
        (route.cleared || []).some(
          (item) => item.id === entry.id && entry.sequence >= latest - 5,
        ) ||
        available.some((item) => item.id === entry.id),
    )
    .sort((a, b) => a.sequence - b.sequence)
    .map((entry) => ({ ...entry }));
  if (latest >= 6)
    return known.map((entry, index) => ({
      ...entry,
      parentId: index ? known[index - 1].id : null,
    }));
  const entries = [];
  for (
    let sequence = 0;
    sequence < Math.max(REGIONS[map].sites.length, ...known.map((entry) => entry.sequence + 1));
    sequence++
  ) {
    const existing = known.find((entry) => entry.sequence === sequence);
    if (existing) {
      entries.push(existing);
      continue;
    }
    const previous = entries.at(-1);
    entries.push({
      ...node(
        map,
        sequence,
        (Math.imul(previous?.seed || 17371, 1664525) + sequence * 7919 + 1013904223) >>> 0,
        null,
        previous?.id || null,
        previous ? previous.depth + 1 : 0,
      ),
      locked: true,
    });
  }
  entries.forEach((entry, index) => {
    entry.parentId = index ? entries[index - 1].id : null;
  });
  return entries;
}

/** Persist only code-generated node descriptors, never arbitrary encounter definitions from AI. */
export function restoreExploration(value, seed = 17371, worlds = []) {
  const result = newExploration(seed);
  for (const key of [
    ...MAP_IDS,
    ...worlds.filter((world) => !MAP_IDS.includes(world.id)).map((world) => world.id),
  ]) {
    const world = worlds.find((entry) => entry.id === key);
    const map = world?.map || key;
    const route = value?.[key];
    if (!route || !Array.isArray(route.frontier)) continue;
    try {
      const restoreNode = (entry) => {
        if (
          entry.map !== map ||
          !Number.isSafeInteger(entry.sequence) ||
          entry.sequence < 0 ||
          !Number.isInteger(entry.seed)
        )
          throw Error('Invalid exploration node');
        return node(
          map,
          entry.sequence,
          entry.seed,
          typeof entry.continuation === 'string' ? entry.continuation.slice(0, 2000) : null,
          typeof entry.parentId === 'string' ? entry.parentId : null,
          Number.isSafeInteger(entry.depth) && entry.depth >= 0 ? entry.depth : 0,
          world,
        );
      };
      const valid = (entry) =>
        world || BASE_WORLDS.includes(map) || entry.sequence < REGIONS[map].sites.length;
      const frontier = route.frontier.map(restoreNode).filter(valid);
      const cleared = Array.isArray(route.cleared)
        ? route.cleared.map(restoreNode).filter(valid)
        : [];
      const all = [...cleared, ...frontier];
      if (!all.length) continue;
      if (new Set(all.map((entry) => entry.id)).size !== all.length) continue;
      // Parents must precede their descendants, so damaged saves cannot create cycles.
      const seen = new Set();
      for (const entry of all) {
        if (entry.parentId && !seen.has(entry.parentId)) throw Error('Invalid route parent');
        seen.add(entry.id);
      }
      if (!frontier.length && (world || BASE_WORLDS.includes(map))) {
        const last = cleared.at(-1);
        if (last)
          frontier.push(
            node(
              map,
              last.sequence + 1,
              (last.seed + 7919) >>> 0,
              null,
              last.id,
              last.depth + 1,
              world,
            ),
          );
      }
      result[key] = {
        completed: cleared.length,
        nextSequence: all.reduce((max, entry) => Math.max(max, entry.sequence + 1), 1),
        frontier,
        cleared,
        history: Array.isArray(route.history) ? structuredClone(route.history.slice(-3)) : [],
      };
    } catch {
      /* A damaged route resets independently of the other routes. */
    }
  }
  return result;
}

export function explorationSpec(entry, index = 0) {
  const region = REGIONS[entry?.map];
  if (
    !region ||
    !Number.isSafeInteger(entry.sequence) ||
    entry.sequence < 0 ||
    (!isEndless(entry) && entry.sequence >= region?.sites.length) ||
    !Number.isInteger(entry.seed)
  )
    throw Error('探索地点无效');
  if (!Number.isInteger(index) || index < 0 || index >= ENCOUNTER_COUNT)
    throw Error('战斗序号无效');
  if (entry.tutorial === true && entry.map === 'ruins') return tutorialSpec(index);
  if (!entry.world && entry.map === 'ruins' && entry.sequence < 6)
    return ruinsEncounterSpec(entry.sequence, index);
  const site = entry.sequence % 6;
  const dynamic = entry.world;
  if (entry.encounters) validateEncounters(entry.encounters, entry);
  const definitions = dynamic?.enemyDefinitions || {};
  const poolIds = dynamic?.enemyIds || [...region.enemies, region.boss];
  const bossIds = poolIds.filter((id) => (definitions[id] || DEFINITIONS[id])?.boss);
  const ordinary = poolIds.filter((id) => !(definitions[id] || DEFINITIONS[id])?.boss);
  const rng = random((entry.seed + index * 7919) >>> 0);
  const pool = [...(dynamic ? (ordinary.length ? ordinary : poolIds) : region.enemies)];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const boss = index === FINAL_ENCOUNTER;
  return {
    name: isEndless(entry)
      ? `${dynamic?.name || region.name} · 第 ${entry.sequence + 1} 处`
      : region.sites[site],
    map: entry.map,
    enemyDefinitions: definitions,
    enemyIds:
      entry.encounters?.[index]?.enemyIds ||
      (boss
        ? [dynamic ? bossIds[0] : region.boss]
        : pool.slice(0, index === 0 ? 1 + Math.floor(rng() * 3) : 2 + Math.floor(rng() * 2))),
    hpScale: 1,
    boss,
    environment: {},
    description: dynamic?.background || region.atmosphere,
  };
}

/** Only victory opens a successor; defeat, leaving and duplicate callbacks do not advance. */
export function completeExploration(
  routes,
  entry,
  { title, nextHook, lines = [], runId, tags = [] } = {},
) {
  const route = routes[routeKey(entry)];
  const at = route?.frontier.findIndex((item) => item.id === entry.id);
  if (at === undefined || at < 0) return null;
  if (!availableExplorations(route).some((item) => item.id === entry.id)) return null;
  const continuation =
    typeof nextHook?.setting === 'string' ? nextHook.setting.slice(0, 2000) : null;
  const current = route.frontier[at];
  const successors = Array.from(
    {
      length:
        entry.world ||
        BASE_WORLDS.includes(entry.map) ||
        route.nextSequence < REGIONS[entry.map].sites.length
          ? 1
          : 0,
    },
    () => {
      const sequence = route.nextSequence++;
      return node(
        entry.map,
        sequence,
        (Math.imul(current.seed, 1664525) + sequence * 7919 + 1013904223) >>> 0,
        continuation,
        current.id,
        current.depth + 1,
        current.world,
      );
    },
  );
  route.frontier.splice(at, 1, ...successors);
  route.cleared ||= [];
  route.cleared.push(structuredClone(current));
  route.completed++;
  route.history.push({
    ...(runId ? { runId } : {}),
    tags: [...tags],
    title: String(title || explorationSpec(entry).name).slice(0, 60),
    confirmedEvents: structuredClone(lines.slice(-18)),
    unresolvedHook: nextHook ? structuredClone(nextHook) : null,
  });
  route.history = route.history.slice(-3);
  return successors[0] || null;
}

export function addWorldRoute(routes, world, seed = Math.floor(Math.random() * 4294967296)) {
  if (routes[world.id]) {
    for (const entry of routes[world.id].frontier) entry.world = structuredClone(world);
    return;
  }
  routes[world.id] = {
    completed: 0,
    nextSequence: 1,
    frontier: [node(world.map, 0, seed, null, null, 0, world)],
    cleared: [],
    history: [],
  };
}
