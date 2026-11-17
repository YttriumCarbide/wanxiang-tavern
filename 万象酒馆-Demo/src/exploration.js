import {
  MAINLINE_DUNGEONS,
  CITY_DUNGEONS,
  EMPIRE_TRANSITION_DUNGEONS,
  UNLOCKABLE_DUNGEONS,
  isEndless,
  validateEncounters,
} from './worlds.js';
import { ENCOUNTER_COUNT, FINAL_ENCOUNTER } from './content/journey-rules.js';
import { REGIONS, regionTaskHookFor } from './content/regions.js';
import { millEncounterSpec } from './content/mill-encounters.js';
import { ruinsEncounterSpec } from './content/ruins-encounters.js';
import { forestEncounterSpec } from './content/forest-encounters.js';
import { frostEncounterSpec } from './content/frost-encounters.js';
import { MAP_IDS } from './content/biomes.js';
import { DEFINITIONS } from './data.js';
import { tutorialSpec } from './content/tutorial.js';
import { encounterLevel } from './enemy-growth.js';

const ALL_ROUTE_MAP_IDS = Object.freeze([
  ...MAP_IDS,
  ...EMPIRE_TRANSITION_DUNGEONS,
  ...CITY_DUNGEONS,
]);

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function nextSeed(seed, offset) {
  return (Math.imul(seed >>> 0, 1664525) + (offset * 7919 + 1013904223)) >>> 0;
}

function makeMainlineNode(map, bp, seed, parentId = null, depth = bp.step, continuation = null) {
  return {
    id: `${map}-${bp.id}-${seed >>> 0}`,
    map,
    nodeId: bp.id,
    label: bp.label,
    branch: bp.kind === 'branch',
    step: bp.step,
    authored: true,
    sequence: bp.authoredIndex,
    levelOffset: bp.levelOffset,
    boss: bp.boss,
    overlord: Boolean(bp.overlord),
    pos: bp.pos,
    endless: false,
    seed: seed >>> 0,
    site: bp.authoredIndex,
    continuation,
    parentId,
    depth,
  };
}

function makeEndlessMainlineNode(
  map,
  step,
  seed,
  continuation = null,
  parentId = null,
  world = null,
) {
  const sequence = 6 + Math.max(0, step - 4);
  return {
    id: `${world?.id || map}-endless-${step + 1}-${seed >>> 0}`,
    map,
    ...(world ? { world: structuredClone(world) } : {}),
    nodeId: null,
    label: String(step + 1),
    branch: false,
    step,
    authored: false,
    endless: true,
    sequence,
    seed: seed >>> 0,
    site: sequence % Math.max(1, REGIONS[map]?.sites?.length || 5),
    continuation,
    parentId,
    depth: step,
  };
}

function makeLinearNode(map, sequence, seed, continuation = null, parentId = null, world = null) {
  const regionSites = REGIONS[map]?.sites?.length || 6;
  const endless = Boolean(world) || sequence >= regionSites;
  return {
    id: `${world?.id || map}-${sequence}-${seed >>> 0}`,
    map,
    ...(world ? { world: structuredClone(world) } : {}),
    label: String(sequence + 1),
    step: sequence,
    sequence,
    seed: seed >>> 0,
    site: sequence % regionSites,
    endless,
    continuation,
    parentId,
    depth: sequence,
  };
}

function initialRoute(map, seed, world = null) {
  const blueprint = !world && MAINLINE_DUNGEONS.includes(map) ? REGIONS[map]?.nodes : null;
  if (blueprint?.length) {
    const root = blueprint.find((item) => !item.parentId) || blueprint[0];
    return {
      completed: 0,
      nextSequence: 1,
      frontier: [makeMainlineNode(map, root, seed >>> 0, null, 0)],
      cleared: [],
      history: [],
    };
  }
  return {
    completed: 0,
    nextSequence: 1,
    frontier: [makeLinearNode(map, 0, seed >>> 0, null, null, world)],
    cleared: [],
    history: [],
  };
}

export function newExploration(seed = 17371) {
  return Object.fromEntries(
    ALL_ROUTE_MAP_IDS.map((map, index) => [map, initialRoute(map, (seed + index * 7919) >>> 0)]),
  );
}

export function availableExplorations(route) {
  if (!route?.frontier?.length) return [];
  const clearedIds = new Set((route.cleared || []).map((item) => item.nodeId).filter(Boolean));
  const active = route.frontier.filter(
    (entry) => !entry.locked && !(entry.nodeId && clearedIds.has(entry.nodeId)),
  );
  if (!active.some((entry) => entry.nodeId)) return active.slice(0, 1);
  return active;
}

function mainlinePreview(route, map) {
  const blueprint = REGIONS[map]?.nodes || [];
  const clearedByNodeId = new Map(
    (route.cleared || []).filter((item) => item.nodeId).map((item) => [item.nodeId, item]),
  );
  const frontierByNodeId = new Map(
    (route.frontier || []).filter((item) => item.nodeId).map((item) => [item.nodeId, item]),
  );
  const resolvedIdByBp = new Map();
  const entries = [];
  for (const [index, bp] of blueprint.entries()) {
    const existing = clearedByNodeId.get(bp.id) || frontierByNodeId.get(bp.id);
    const parentRuntimeId = bp.parentId ? resolvedIdByBp.get(bp.parentId) || bp.parentId : null;
    if (existing) {
      const copy = {
        ...existing,
        label: existing.label || bp.label,
        branch: bp.kind === 'branch',
        authored: true,
        levelOffset: bp.levelOffset,
        boss: bp.boss,
        overlord: Boolean(bp.overlord),
        pos: bp.pos,
        parentId: parentRuntimeId,
      };
      resolvedIdByBp.set(bp.id, copy.id);
      entries.push(copy);
    } else {
      const seed = nextSeed(route.frontier?.[0]?.seed || 17371, index + 1);
      const lockedNode = {
        ...makeMainlineNode(map, bp, seed, parentRuntimeId, bp.step),
        locked: true,
      };
      resolvedIdByBp.set(bp.id, lockedNode.id);
      entries.push(lockedNode);
    }
  }
  const endlessNodes = [...(route.cleared || []), ...(route.frontier || [])]
    .filter((entry) => entry.endless || (!entry.nodeId && entry.sequence >= 6))
    .sort((a, b) => a.sequence - b.sequence)
    .map((entry) => ({ ...entry }));
  const finalBp = blueprint.find((item) => item.overlord) || blueprint.at(-1);
  let prevId = resolvedIdByBp.get(finalBp?.id) || entries.at(-1)?.id || null;
  for (const [offset, extra] of endlessNodes.entries()) {
    extra.parentId = prevId;
    extra.endless = true;
    extra.label = extra.label || String(5 + offset);
    extra.step = extra.step ?? 4 + offset;
    prevId = extra.id;
    entries.push(extra);
  }
  return entries;
}

export function explorationPreview(route, map) {
  if (!route) return [];
  if (MAINLINE_DUNGEONS.includes(map) && REGIONS[map]?.nodes?.length && !route.frontier[0]?.world) {
    return mainlinePreview(route, map);
  }
  const combined = [...(route.cleared || []), ...(route.frontier || [])].sort(
    (a, b) => a.sequence - b.sequence,
  );
  return combined.map((entry, index) => ({
    ...entry,
    label: entry.label || String(index + 1),
    parentId: index ? combined[index - 1].id : null,
  }));
}

function migrateLegacyMainlineRoute(route, map, seed, world) {
  const blueprint = REGIONS[map]?.nodes || [];
  const legacyCleared = Array.isArray(route.cleared) ? route.cleared : [];
  const clearedSeqs = new Set(
    legacyCleared.filter((entry) => entry.sequence < 6).map((entry) => entry.sequence),
  );
  const clearedNodes = [];
  const clearedBpIds = new Set();
  for (const bp of blueprint) {
    const match = legacyCleared.find((entry) => entry.sequence === bp.authoredIndex);
    if (match || clearedSeqs.has(bp.authoredIndex)) {
      clearedBpIds.add(bp.id);
      const baseNode = makeMainlineNode(
        map,
        bp,
        match?.seed ?? nextSeed(seed, bp.authoredIndex + 1),
        bp.parentId,
      );
      clearedNodes.push({
        ...match,
        ...baseNode,
        id: match?.id || baseNode.id,
      });
    }
  }
  const endlessEntries = [...legacyCleared, ...(route.frontier || [])]
    .filter((entry) => entry.sequence >= 6 || entry.endless)
    .sort((a, b) => a.sequence - b.sequence);
  const frontier = [];
  for (const bp of blueprint) {
    if (clearedBpIds.has(bp.id)) continue;
    if (!bp.parentId || clearedBpIds.has(bp.parentId)) {
      const oldFrontier = (route.frontier || []).find(
        (entry) => entry.nodeId === bp.id || entry.sequence === bp.authoredIndex,
      );
      const created = makeMainlineNode(
        map,
        bp,
        oldFrontier?.seed ?? nextSeed(seed, bp.authoredIndex + 10),
        bp.parentId,
      );
      if (oldFrontier?.id) created.id = oldFrontier.id;
      if (oldFrontier?.tutorial) created.tutorial = true;
      frontier.push(created);
    }
  }
  const finalBp = blueprint.find((item) => item.overlord);
  if (finalBp && clearedBpIds.has(finalBp.id)) {
    const endlessFrontier = (route.frontier || []).filter(
      (entry) => entry.endless || entry.sequence >= 6,
    );
    if (endlessFrontier.length) {
      for (const item of endlessFrontier) {
        frontier.push({
          ...item,
          endless: true,
          label: item.label || String(5 + Math.max(0, item.sequence - 6)),
        });
      }
    } else {
      const nextStep = 4 + endlessEntries.length;
      frontier.push(
        makeEndlessMainlineNode(map, nextStep, nextSeed(seed, nextStep + 20), null, null, world),
      );
    }
  }
  return {
    completed: route.completed ?? clearedNodes.length,
    nextSequence: Math.max(route.nextSequence || 1, clearedNodes.length + frontier.length),
    frontier,
    cleared: [
      ...clearedNodes,
      ...legacyCleared
        .filter((entry) => entry.endless || entry.sequence >= 6)
        .map((entry, idx) => ({
          ...entry,
          endless: true,
          label: entry.label || String(5 + idx),
        })),
    ],
    history: Array.isArray(route.history) ? structuredClone(route.history.slice(-3)) : [],
  };
}

/** Persist only code-generated node descriptors, never arbitrary encounter definitions from AI. */
export function restoreExploration(value, seed = 17371, worlds = []) {
  const result = newExploration(seed);
  for (const key of [
    ...ALL_ROUTE_MAP_IDS,
    ...worlds.filter((world) => !ALL_ROUTE_MAP_IDS.includes(world.id)).map((world) => world.id),
  ]) {
    const world = worlds.find((entry) => entry.id === key);
    const map = world?.map || key;
    const route = value?.[key];
    if (!route || !Array.isArray(route.frontier)) continue;
    try {
      if (!world && MAINLINE_DUNGEONS.includes(map) && REGIONS[map]?.nodes?.length) {
        const hasNodeGraph = [...(route.cleared || []), ...(route.frontier || [])].every(
          (entry) =>
            typeof entry.nodeId === 'string' || entry.endless === true || entry.sequence >= 6,
        );
        if (!hasNodeGraph) {
          result[key] = migrateLegacyMainlineRoute(route, map, seed, world);
          continue;
        }
      }
      const restoreNode = (entry) => {
        if (
          entry.map !== map ||
          !Number.isSafeInteger(entry.sequence) ||
          entry.sequence < 0 ||
          !Number.isSafeInteger(entry.seed)
        )
          throw Error('探索地点无效');
        const restored = {
          id: String(entry.id || `${key}-${entry.sequence}-${entry.seed}`),
          map,
          ...(entry.nodeId !== undefined
            ? { nodeId: entry.nodeId ? String(entry.nodeId) : null }
            : {}),
          ...(entry.label ? { label: String(entry.label) } : {}),
          ...(typeof entry.branch === 'boolean' ? { branch: entry.branch } : {}),
          ...(Number.isInteger(entry.step) ? { step: entry.step } : {}),
          ...(typeof entry.authored === 'boolean' ? { authored: entry.authored } : {}),
          ...(Number.isInteger(entry.levelOffset) ? { levelOffset: entry.levelOffset } : {}),
          ...(entry.boss ? { boss: String(entry.boss) } : {}),
          ...(typeof entry.overlord === 'boolean' ? { overlord: entry.overlord } : {}),
          ...(Array.isArray(entry.pos) ? { pos: [...entry.pos] } : {}),
          endless: Boolean(entry.endless),
          sequence: entry.sequence,
          seed: entry.seed >>> 0,
          site: Number.isInteger(entry.site)
            ? entry.site
            : entry.sequence % Math.max(1, REGIONS[map]?.sites?.length || 6),
          continuation: typeof entry.continuation === 'string' ? entry.continuation : null,
          parentId: entry.parentId ? String(entry.parentId) : null,
          depth: Number.isSafeInteger(entry.depth) ? entry.depth : entry.sequence,
          ...(entry.encounters ? { encounters: validateEncounters(entry.encounters, entry) } : {}),
        };
        const nodeWorld =
          world && (!MAINLINE_DUNGEONS.includes(key) || isEndless(restored))
            ? structuredClone(world)
            : null;
        if (nodeWorld) restored.world = nodeWorld;
        if (
          entry.recollection &&
          Number.isSafeInteger(entry.recollection.ether) &&
          entry.recollection.ether >= 0
        ) {
          const saved = entry.recollection;
          if (
            Array.isArray(saved.encounters) &&
            saved.encounters.length === ENCOUNTER_COUNT &&
            saved.encounters.every(
              (battle) =>
                Array.isArray(battle.enemyIds) &&
                battle.enemyIds.length >= 1 &&
                battle.enemyIds.length <= 3 &&
                new Set(battle.enemyIds).size === battle.enemyIds.length &&
                battle.enemyIds.every((id) => DEFINITIONS[id] || world?.enemyDefinitions?.[id]),
            )
          ) {
            restored.recollection = {
              ether: Math.min(999999999, saved.ether),
              tutorial: saved.tutorial === true,
              encounters: saved.encounters.map((battle) => ({ enemyIds: [...battle.enemyIds] })),
              ...(typeof saved.runId === 'string' ? { runId: saved.runId } : {}),
              ...(typeof saved.scriptId === 'string' ? { scriptId: saved.scriptId } : {}),
            };
          }
        }
        return restored;
      };
      const cleared = Array.isArray(route.cleared) ? route.cleared.map(restoreNode) : [];
      const frontier = route.frontier.map(restoreNode);
      if (!frontier.length) {
        if (!world && MAINLINE_DUNGEONS.includes(map) && REGIONS[map]?.nodes?.length) {
          const blueprint = REGIONS[map].nodes;
          const clearedNodeIds = new Set(cleared.map((item) => item.nodeId).filter(Boolean));
          for (const bp of blueprint) {
            if (clearedNodeIds.has(bp.id)) continue;
            if (!bp.parentId || clearedNodeIds.has(bp.parentId)) {
              const parentItem = bp.parentId
                ? cleared.find((item) => item.nodeId === bp.parentId)
                : null;
              frontier.push(
                makeMainlineNode(
                  map,
                  bp,
                  nextSeed(parentItem?.seed || seed, bp.authoredIndex + 10),
                  parentItem?.id || null,
                  bp.step,
                ),
              );
            }
          }
          const finalBp = blueprint.find((item) => item.overlord);
          if (!frontier.length && finalBp && clearedNodeIds.has(finalBp.id)) {
            const endlessCleared = cleared.filter((item) => item.endless || item.sequence >= 6);
            const last = endlessCleared.at(-1) || cleared.at(-1);
            const nextStep = 4 + endlessCleared.length;
            frontier.push(
              makeEndlessMainlineNode(
                map,
                nextStep,
                nextSeed(last?.seed || seed, nextStep + 11),
                null,
                last?.id || null,
                world,
              ),
            );
          }
        } else if (
          world ||
          MAINLINE_DUNGEONS.includes(map) ||
          CITY_DUNGEONS.includes(map) ||
          EMPIRE_TRANSITION_DUNGEONS.includes(map)
        ) {
          const last = cleared.at(-1);
          if (last) {
            frontier.push(
              makeLinearNode(
                map,
                last.sequence + 1,
                nextSeed(last.seed, last.sequence + 1),
                null,
                last.id,
                world,
              ),
            );
          }
        }
      }
      const maxSeq = Math.max(-1, ...[...cleared, ...frontier].map((entry) => entry.sequence));
      result[key] = {
        completed:
          Number.isSafeInteger(route.completed) && route.completed >= 0
            ? route.completed
            : cleared.length,
        nextSequence:
          Number.isSafeInteger(route.nextSequence) && route.nextSequence > maxSeq
            ? route.nextSequence
            : maxSeq + 1,
        frontier,
        cleared,
        history: Array.isArray(route.history) ? structuredClone(route.history.slice(-3)) : [],
      };
    } catch {
      if (world) result[key] = initialRoute(map, seed, world);
    }
  }
  return result;
}

export function explorationSpec(entry, index = 0) {
  if (entry?.replay && entry.recollection?.tutorial) entry = { ...entry, tutorial: true };
  const region = REGIONS[entry?.map];
  if (
    !region ||
    !Number.isInteger(entry?.sequence) ||
    entry.sequence < 0 ||
    !Number.isInteger(entry.seed)
  )
    throw Error('探索地点无效');
  if (!Number.isInteger(index) || index < 0 || index >= ENCOUNTER_COUNT)
    throw Error('战斗序号无效');

  const resolvedLevel = encounterLevel(
    entry.world?.baseLevel
      ? { ...entry, level: entry.world.baseLevel + Math.floor(entry.sequence / 2) }
      : entry,
  );
  const endlessEntry = isEndless(entry);
  const hook = regionTaskHookFor(entry);
  const bp =
    !entry.world && !endlessEntry ? region.nodes?.find((item) => item.id === entry.nodeId) : null;

  const authoredSpec =
    entry.tutorial === true && (entry.map === 'mill' || entry.map === 'ruins')
      ? tutorialSpec(index)
      : !entry.world && !endlessEntry
        ? entry.map === 'mill' && entry.sequence < 5
          ? millEncounterSpec(entry.sequence, index)
          : entry.map === 'ruins' && entry.sequence < 6
            ? ruinsEncounterSpec(entry.sequence, index)
            : entry.map === 'forest' && entry.sequence < 6
              ? forestEncounterSpec(entry.sequence, index)
              : entry.map === 'frost' && entry.sequence < 6
                ? frostEncounterSpec(entry.sequence, index)
                : null
        : null;

  if (authoredSpec) {
    return {
      ...authoredSpec,
      ...(entry.replay && entry.recollection?.encounters?.[index]
        ? { enemyIds: [...entry.recollection.encounters[index].enemyIds] }
        : {}),
      ...(authoredSpec.subtitle
        ? {}
        : bp?.subtitle || hook?.title
          ? { subtitle: bp?.subtitle || hook?.title }
          : {}),
      level: resolvedLevel,
      growthSeed: entry.seed,
      growthEntry: {
        map: entry.map,
        sequence: entry.sequence,
        seed: entry.seed,
        level: resolvedLevel,
        ...(Number.isInteger(entry.levelOffset) ? { levelOffset: entry.levelOffset } : {}),
        tutorial: entry.tutorial,
      },
      ...(entry.continuation ? { continuation: entry.continuation } : {}),
    };
  }

  const dynamic = entry.world;
  if (entry.encounters) validateEncounters(entry.encounters, entry);
  const definitions = dynamic?.enemyDefinitions || {};
  const poolIds = dynamic?.enemyIds || [...region.enemies, bp?.boss || region.boss];
  const bossIds = poolIds.filter((id) => (definitions[id] || DEFINITIONS[id])?.boss);
  const ordinary = poolIds.filter((id) => !(definitions[id] || DEFINITIONS[id])?.boss);
  const rng = random((entry.seed + index * 7919) >>> 0);
  const pool = [...(dynamic ? (ordinary.length ? ordinary : poolIds) : region.enemies)];

  const shuffle = (items) => {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  };
  const isElite = (id) => Boolean((definitions[id] || DEFINITIONS[id])?.elite);
  const ordinaryPool = shuffle(pool.filter((id) => !isElite(id)));
  const elitePool = shuffle(pool.filter((id) => isElite(id)));
  const fallbackPool = ordinaryPool.length ? ordinaryPool : shuffle(pool);
  const pickWave = () => {
    if (index === 2 && elitePool.length) {
      const rest = fallbackPool.filter((id) => id !== elitePool[0]);
      return rest.length ? [elitePool[0], rest[0]] : [elitePool[0]];
    }
    if (index === 0) return [fallbackPool[0]];
    const count =
      index === 3
        ? fallbackPool.length >= 3
          ? 3
          : 2
        : Math.min(3, Math.max(2, fallbackPool.length));
    return fallbackPool.slice(0, Math.min(count, fallbackPool.length));
  };

  const chosenBoss = entry.boss || bp?.boss || bossIds[0] || region.boss;
  const pickBossGroup = () => {
    if (chosenBoss === 'ares') return ['aresCannonLeft', 'ares', 'aresCannonRight'];
    if (chosenBoss === 'moonEye') return ['moonCrown', 'moonEye', 'moonRoot'];
    if (chosenBoss === 'radiantWyvern' || chosenBoss === 'alchemicalPuppet') return [chosenBoss];
    const aides = shuffle(fallbackPool).filter((id) => id !== chosenBoss);
    return aides.length >= 2 ? [aides[0], chosenBoss, aides[1]] : [chosenBoss];
  };

  const authored = entry.encounters?.[index];
  const enemyIds = authored
    ? [...authored.enemyIds]
    : index === FINAL_ENCOUNTER
      ? pickBossGroup()
      : pickWave();
  const baseName = dynamic
    ? dynamic.landmarks?.[entry.sequence % (dynamic.landmarks?.length || 1)] ||
      (endlessEntry ? '继续探索' : `${dynamic.name} · 第 ${entry.label || entry.sequence + 1} 区域`)
    : bp
      ? `${region.name} · ${bp.name}`
      : endlessEntry
        ? '继续探索'
        : entry.sequence < region.sites.length
          ? `${region.name} · ${region.sites[entry.sequence]}`
          : '继续探索';

  return {
    map: entry.map,
    name: baseName,
    ...(bp?.subtitle || hook?.title ? { subtitle: bp?.subtitle || hook?.title } : {}),
    hpScale: 1,
    enemyIds,
    ...(dynamic ? { enemyDefinitions: definitions } : {}),
    boss: index === FINAL_ENCOUNTER,
    environment: {},
    level: resolvedLevel,
    growthSeed: entry.seed,
    growthEntry: {
      map: entry.map,
      sequence: entry.sequence,
      seed: entry.seed,
      level: resolvedLevel,
      ...(Number.isInteger(entry.levelOffset) ? { levelOffset: entry.levelOffset } : {}),
      ...(entry.endless ? { endless: true } : {}),
      tutorial: entry.tutorial,
      ...(entry.world ? { world: { id: entry.world.id } } : {}),
    },
    ...(entry.continuation ? { continuation: entry.continuation } : {}),
  };
}

export function completeExploration(routes, entry, outcome = {}) {
  const {
    title,
    tags = [],
    lines = [],
    nextHook = null,
    runId = null,
    scriptId = null,
    ether = 0,
    encounters = null,
  } = outcome;
  const key = entry.world?.id || entry.map;
  const route = routes[key];
  const at = route?.frontier.findIndex((item) => item.id === entry.id);
  if (at === undefined || at < 0) return null;
  if (!availableExplorations(route).some((item) => item.id === entry.id)) return null;

  const continuation =
    typeof nextHook?.setting === 'string' ? nextHook.setting.slice(0, 2000) : null;
  const current = route.frontier[at];
  const blueprint =
    !current.world && MAINLINE_DUNGEONS.includes(current.map) ? REGIONS[current.map]?.nodes : null;
  const clearedIds = new Set((route.cleared || []).map((item) => item.nodeId).filter(Boolean));
  const frontierIds = new Set(route.frontier.map((item) => item.nodeId).filter(Boolean));

  const successors = [];
  if (blueprint?.length && current.nodeId) {
    clearedIds.add(current.nodeId);
    const children = blueprint.filter((bp) => bp.parentId === current.nodeId);
    for (const [idx, bp] of children.entries()) {
      if (clearedIds.has(bp.id) || frontierIds.has(bp.id)) continue;
      successors.push(
        makeMainlineNode(
          current.map,
          bp,
          nextSeed(current.seed, route.nextSequence++ + idx),
          current.id,
          bp.step,
          continuation,
        ),
      );
    }
    const currentBp = blueprint.find((bp) => bp.id === current.nodeId);
    if (currentBp?.overlord) {
      const nextStep = 4;
      successors.push(
        makeEndlessMainlineNode(
          current.map,
          nextStep,
          nextSeed(current.seed, route.nextSequence++ + 11),
          continuation,
          current.id,
          current.world,
        ),
      );
    }
  } else if (blueprint?.length && current.endless) {
    const nextStep = (current.step ?? 4) + 1;
    successors.push(
      makeEndlessMainlineNode(
        current.map,
        nextStep,
        nextSeed(current.seed, route.nextSequence++ + nextStep),
        continuation,
        current.id,
        current.world,
      ),
    );
  } else {
    const sequence = Math.max(route.nextSequence++, (current.sequence ?? 0) + 1);
    successors.push(
      makeLinearNode(
        current.map,
        sequence,
        nextSeed(current.seed, sequence),
        continuation,
        current.id,
        current.world,
      ),
    );
  }

  route.frontier.splice(at, 1, ...successors);
  route.cleared ||= [];
  route.cleared.push({
    ...structuredClone(current),
    ...(encounters
      ? {
          recollection: {
            runId,
            scriptId,
            ether,
            tutorial: entry.tutorial === true,
            encounters: encounters.map((battle) => ({ enemyIds: [...battle.enemyIds] })),
          },
        }
      : {}),
  });
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
  routes[world.id] = initialRoute(world.map, seed, world);
}

/** Record an overland-visited or city-discovered dungeon into the Dungeon Gate portal list. */
export function unlockDungeonMap(library, mapId) {
  if (!library || !UNLOCKABLE_DUNGEONS.includes(mapId)) return false;
  library.unlockedDungeons = Array.isArray(library.unlockedDungeons)
    ? [...new Set(library.unlockedDungeons.filter((id) => UNLOCKABLE_DUNGEONS.includes(id)))]
    : [];
  if (library.unlockedDungeons.includes(mapId)) return false;
  library.unlockedDungeons.push(mapId);
  return true;
}
