import * as Data from '../../src/data.js';
import * as Dining from '../../src/content/dining.js';
import * as Items from '../../src/content/items.js';
import * as Gems from '../../src/content/gems.js';
import * as LearnableSkills from '../../src/content/learnable-skills.js';
import * as DropContent from '../../src/content/enemy-drops.js';
import * as EnemyTemplates from '../../src/content/enemy-templates.js';
import * as EnemyDrops from '../../src/enemy-drops.js';
import * as Regions from '../../src/content/regions.js';
import * as RuinsEncounters from '../../src/content/ruins-encounters.js';
import * as ForestEncounters from '../../src/content/forest-encounters.js';
import * as FrostEncounters from '../../src/content/frost-encounters.js';
import * as MillEncounters from '../../src/content/mill-encounters.js';
import * as ForestDungeons from '../../src/content/forest-dungeons.js';
import * as FrostDungeons from '../../src/content/frost-dungeons.js';
import * as OfficialDungeons from '../../src/content/official-dungeons.js';
import * as OverlordTutorials from '../../src/content/overlord-tutorials.js';
import * as TavernService from '../../src/content/tavern-service.js';
import * as Emblems from '../../src/emblems.js';
import * as EmblemProgression from '../../src/emblem-progression.js';
import * as WorkshopContent from '../../src/content/workshop-catalog.js';
import * as WorkshopRuntime from '../../src/workshop/catalog.js';
import * as WorkshopLayout from '../../src/workshop/layout.js';

const SOURCES = Object.freeze([
  Object.freeze(['src/data.js', Data]),
  Object.freeze(['src/content/dining.js', Dining]),
  Object.freeze(['src/content/items.js', Items]),
  Object.freeze(['src/content/gems.js', Gems]),
  Object.freeze(['src/content/learnable-skills.js', LearnableSkills]),
  Object.freeze(['src/content/enemy-drops.js', DropContent]),
  Object.freeze(['src/content/enemy-templates.js', EnemyTemplates]),
  Object.freeze(['src/enemy-drops.js', EnemyDrops]),
  Object.freeze(['src/content/regions.js', Regions]),
  Object.freeze(['src/content/ruins-encounters.js', RuinsEncounters]),
  Object.freeze(['src/content/forest-encounters.js', ForestEncounters]),
  Object.freeze(['src/content/frost-encounters.js', FrostEncounters]),
  Object.freeze(['src/content/mill-encounters.js', MillEncounters]),
  Object.freeze(['src/content/forest-dungeons.js', ForestDungeons]),
  Object.freeze(['src/content/frost-dungeons.js', FrostDungeons]),
  Object.freeze(['src/content/official-dungeons.js', OfficialDungeons]),
  Object.freeze(['src/content/overlord-tutorials.js', OverlordTutorials]),
  Object.freeze(['src/content/tavern-service.js', TavernService]),
  Object.freeze(['src/emblems.js', Emblems]),
  Object.freeze(['src/emblem-progression.js', EmblemProgression]),
  Object.freeze(['src/content/workshop-catalog.js', WorkshopContent]),
  Object.freeze(['src/workshop/catalog.js', WorkshopRuntime]),
  Object.freeze(['src/workshop/layout.js', WorkshopLayout]),
]);

const ROUTE_FAMILIES = Object.freeze([
  Object.freeze(['RUINS_ROUTES', 'RUINS_DUNGEONS', 'ruins']),
  Object.freeze(['FOREST_ROUTES', 'FOREST_DUNGEONS', 'forest']),
  Object.freeze(['FROST_ROUTES', 'FROST_DUNGEONS', 'frost']),
  Object.freeze(['MILL_ROUTES', 'MILL_DUNGEONS', 'mill']),
]);

const WORKSHOP_VISIBILITY_MODES = Object.freeze([
  'always',
  'auto',
  'passive',
  'base_materials',
  'research',
  'core_level',
  'composite',
]);

const WORKSHOP_VISIBILITY_RULES = Object.freeze([
  'always',
  'passive',
  'base_materials',
  'research',
  'core_level',
]);

const SKILL_RANKS = Object.freeze(['F', 'E', 'D', 'C', 'B', 'A', 'S']);
const GEM_QUALITIES = Object.freeze(['common', 'uncommon', 'rare', 'epic', 'legendary']);
const GEM_ATTRIBUTES = Object.freeze(['str', 'dex', 'con', 'int', 'wis', 'cha', 'all']);

const DOMAIN_NAMES = Object.freeze([
  'enemies',
  'bosses',
  'heroes',
  'heroSkills',
  'definitions',
  'buffs',
  'encounters',
  'regions',
  'regionNodes',
  'regionHooks',
  'ladderHooks',
  'routes',
  'battles',
  'tutorialBattles',
  'battleEnemyReferences',
  'enemyPoolReferences',
  'tutorialTargets',
  'overlordTutorials',
  'dungeonEntries',
  'officialDungeons',
  'npcs',
  'npcReferences',
  'dropGroups',
  'dropPortraitEntries',
  'knownEnemyPortraits',
  'enemyDropTables',
  'items',
  'gems',
  'learnableSkills',
  'skillCategories',
  'starterSkills',
  'ingredients',
  'dishes',
  'directFoods',
  'mealFoods',
  'serviceMenu',
  'serviceBasicMenu',
  'serviceExtras',
  'serviceParties',
  'serviceTraining',
  'emblems',
  'emblemSkills',
  'emblemVisuals',
  'emblemAwards',
  'storyEmblemRewards',
  'rewardMaps',
  'rewardEntries',
  'workshopCatalogs',
  'workshopPages',
  'workshopItems',
  'workshopStations',
  'workshopResearch',
  'workshopResearchCosts',
  'workshopEffects',
  'workshopModifiers',
  'workshopUnlocks',
  'workshopVisibilityRules',
  'workshopConstructionCosts',
  'workshopCore',
]);

function compareText(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function own(object, key) {
  return object !== null && object !== undefined && Object.hasOwn(object, key);
}

function describe(value) {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return String(value);
  }
  if (value === undefined) {
    return 'undefined';
  }
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function sameData(left, right, seen = new WeakMap()) {
  if (Object.is(left, right)) {
    return true;
  }
  if (
    left === null ||
    right === null ||
    typeof left !== 'object' ||
    typeof right !== 'object' ||
    Array.isArray(left) !== Array.isArray(right)
  ) {
    return false;
  }

  let partners = seen.get(left);
  if (partners?.has(right)) {
    return true;
  }
  if (!partners) {
    partners = new WeakSet();
    seen.set(left, partners);
  }
  partners.add(right);

  const leftKeys = Object.keys(left).sort(compareText);
  const rightKeys = Object.keys(right).sort(compareText);
  if (
    leftKeys.length !== rightKeys.length ||
    leftKeys.some((key, index) => key !== rightKeys[index])
  ) {
    return false;
  }

  return leftKeys.every((key) => sameData(left[key], right[key], seen));
}

function cloneData(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }

  const result = Array.isArray(value) ? [] : Object.create(null);
  seen.set(value, result);
  for (const key of Object.keys(value)) {
    Object.defineProperty(result, key, {
      configurable: true,
      enumerable: true,
      writable: true,
      value: cloneData(value[key], seen),
    });
  }
  return result;
}

function portraitBasename(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }
  const path = value.split(/[?#]/, 1)[0];
  const filename = path.split(/[\\/]/).at(-1);
  return filename.replace(/\.(?:svg|png|jpe?g|webp|gif|avif)$/i, '');
}

function makeSnapshot(overrides) {
  const snapshot = Object.create(null);

  for (const [, exports] of SOURCES) {
    Object.assign(snapshot, exports);
  }

  snapshot.RUINS_TUTORIAL_TARGETS = RuinsEncounters.TUTORIAL_TARGETS;
  snapshot.MILL_TUTORIAL_TARGETS = MillEncounters.TUTORIAL_TARGETS;

  for (const [path] of SOURCES) {
    const supplied = overrides[path] ?? overrides[`../../${path}`];
    if (isRecord(supplied)) {
      Object.assign(snapshot, supplied);
      if (path === 'src/content/ruins-encounters.js' && own(supplied, 'TUTORIAL_TARGETS')) {
        snapshot.RUINS_TUTORIAL_TARGETS = supplied.TUTORIAL_TARGETS;
      }
      if (path === 'src/content/mill-encounters.js' && own(supplied, 'TUTORIAL_TARGETS')) {
        snapshot.MILL_TUTORIAL_TARGETS = supplied.TUTORIAL_TARGETS;
      }
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (!SOURCES.some(([path]) => key === path || key === `../../${path}`)) {
      snapshot[key] = value;
    }
  }

  if (own(overrides, 'DROPGROUPS') && !own(overrides, 'DROP_GROUPS')) {
    snapshot.DROP_GROUPS = overrides.DROPGROUPS;
  }
  if (own(overrides, 'TUTORIAL_TARGETS')) {
    snapshot.RUINS_TUTORIAL_TARGETS = overrides.TUTORIAL_TARGETS;
    snapshot.MILL_TUTORIAL_TARGETS = overrides.TUTORIAL_TARGETS;
  }

  return snapshot;
}

function makeAudit() {
  const issues = [];
  const stats = Object.fromEntries(DOMAIN_NAMES.map((name) => [name, 0]));

  stats.domainsChecked = DOMAIN_NAMES.length;
  stats.referencesChecked = 0;
  stats.numericChecks = 0;
  stats.dependencyGraphs = 0;
  stats.dependencyEdges = 0;
  stats.dependencyCycles = 0;

  function issue(code, location, detail) {
    issues.push({ code, location, detail });
  }

  function record(value, location) {
    if (!isRecord(value)) {
      issue('invalid-object', location, `Expected an object; received ${describe(value)}.`);
      return {};
    }
    return value;
  }

  function array(value, location, minimum = 0, maximum = Infinity) {
    if (!Array.isArray(value)) {
      issue('invalid-array', location, `Expected an array; received ${describe(value)}.`);
      return [];
    }
    if (value.length < minimum || value.length > maximum) {
      issue(
        'invalid-array-length',
        location,
        `Expected ${minimum} through ${maximum} entries; received ${value.length}.`,
      );
    }
    return value;
  }

  function number(value, location, minimum = 0, maximum = Infinity, integer = false) {
    stats.numericChecks += 1;
    let valid = true;

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      issue('invalid-number', location, `Expected a finite number; received ${describe(value)}.`);
      return false;
    }
    if (value < minimum || value > maximum) {
      issue(
        'number-out-of-range',
        location,
        `Expected a value from ${minimum} through ${maximum}; received ${value}.`,
      );
      valid = false;
    }
    if (integer && !Number.isInteger(value)) {
      issue('noninteger-quantity', location, `Expected an integer; received ${value}.`);
      valid = false;
    }

    return valid;
  }

  function optionalNumber(object, key, location, minimum = 0, maximum = Infinity, integer = false) {
    if (own(object, key) && object[key] !== null && object[key] !== undefined) {
      number(object[key], `${location}.${key}`, minimum, maximum, integer);
    }
  }

  function enumeration(value, choices, location) {
    if (!choices.includes(value)) {
      issue(
        'invalid-enum',
        location,
        `Expected one of ${choices.join(', ')}; received ${describe(value)}.`,
      );
      return false;
    }
    return true;
  }

  function boolean(value, location) {
    if (typeof value !== 'boolean') {
      issue('invalid-boolean', location, `Expected a boolean; received ${describe(value)}.`);
    }
  }

  function id(value, location, pattern = null) {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim()) {
      issue(
        'invalid-id',
        location,
        `Expected a nonempty, trimmed ID; received ${describe(value)}.`,
      );
      return false;
    }
    if (pattern && !pattern.test(value)) {
      issue('invalid-id', location, `ID does not match ${pattern}: ${describe(value)}.`);
      return false;
    }
    return true;
  }

  function reference(value, domain, location, label) {
    stats.referencesChecked += 1;
    const exists =
      typeof value === 'string' &&
      (domain instanceof Map || domain instanceof Set ? domain.has(value) : own(domain, value));

    if (!exists) {
      issue('unknown-reference', location, `Unknown ${label} ID ${describe(value)}.`);
    }
    return exists;
  }

  function indexArray(value, location, stat, minimum = 0, maximum = Infinity, pattern = null) {
    const entries = array(value, location, minimum, maximum);
    const index = new Map();
    stats[stat] += entries.length;

    entries.forEach((rawEntry, entryIndex) => {
      const entryLocation = `${location}[${entryIndex}]`;
      const entry = record(rawEntry, entryLocation);
      if (!id(entry.id, `${entryLocation}.id`, pattern)) {
        return;
      }
      if (index.has(entry.id)) {
        issue('duplicate-id', `${entryLocation}.id`, `Duplicate ID ${describe(entry.id)}.`);
      } else {
        index.set(entry.id, entry);
      }
    });

    return { entries, index };
  }

  function indexMapping(value, location, stat, nestedId = false) {
    const entries = record(value, location);
    const index = new Map();
    stats[stat] += Object.keys(entries).length;

    for (const [key, rawEntry] of Object.entries(entries)) {
      const entryLocation = `${location}.${key}`;
      id(key, `${entryLocation}#key`);
      const entry = record(rawEntry, entryLocation);
      const entryId = nestedId ? entry.emblem?.id : entry.id;
      id(entryId, `${entryLocation}.${nestedId ? 'emblem.id' : 'id'}`);
      if (entryId !== key) {
        issue(
          'mapping-id-mismatch',
          entryLocation,
          `Mapping key ${describe(key)} disagrees with ID ${describe(entryId)}.`,
        );
      }
      index.set(key, entry);
    }

    return { entries, index };
  }

  function quantities(value, domain, location, label, options = {}) {
    const entries = record(value, location);
    const { maximum = Infinity, nonempty = false, maximumForId = null } = options;

    if (nonempty && Object.keys(entries).length === 0) {
      issue('empty-quantity-map', location, 'At least one quantity is required.');
    }

    for (const [key, count] of Object.entries(entries)) {
      const entryLocation = `${location}.${key}`;
      const exists = reference(key, domain, entryLocation, label);
      number(count, entryLocation, 1, maximum, true);
      if (exists && maximumForId) {
        const allowed = maximumForId(key);
        if (Number.isFinite(count) && Number.isFinite(allowed) && count > allowed) {
          issue(
            'reference-level-out-of-range',
            entryLocation,
            `Requested level ${count} exceeds ${label} ${describe(key)} maximum ${allowed}.`,
          );
        }
      }
    }

    return entries;
  }

  function finish() {
    const unique = new Map();
    for (const entry of issues) {
      const key = JSON.stringify([entry.code, entry.location, entry.detail]);
      unique.set(key, entry);
    }

    const sorted = [...unique.values()].sort((left, right) => {
      return (
        compareText(left.location, right.location) ||
        compareText(left.code, right.code) ||
        compareText(left.detail, right.detail)
      );
    });

    return {
      issues: sorted,
      stats: { ...stats, issues: sorted.length },
    };
  }

  return {
    stats,
    issue,
    record,
    array,
    number,
    optionalNumber,
    enumeration,
    boolean,
    id,
    reference,
    indexArray,
    indexMapping,
    quantities,
    finish,
  };
}

/**
 * Return cyclic strongly connected components, including self-dependencies.
 * Input is a Map or object whose values are arrays or Sets of dependency IDs.
 */
export function collectDependencyCycles(graph) {
  const source = graph instanceof Map ? graph : new Map(Object.entries(graph ?? {}));
  const nodes = [...source.keys()].sort(compareText);
  const known = new Set(nodes);
  const adjacency = new Map();

  for (const node of nodes) {
    const supplied = source.get(node);
    const dependencies = Array.isArray(supplied) || supplied instanceof Set ? [...supplied] : [];
    adjacency.set(
      node,
      [...new Set(dependencies.filter((dependency) => known.has(dependency)))].sort(compareText),
    );
  }

  const discovery = new Map();
  const low = new Map();
  const stack = [];
  const active = new Set();
  const cycles = [];
  let nextIndex = 0;

  function visit(node) {
    discovery.set(node, nextIndex);
    low.set(node, nextIndex);
    nextIndex += 1;
    stack.push(node);
    active.add(node);

    for (const dependency of adjacency.get(node)) {
      if (!discovery.has(dependency)) {
        visit(dependency);
        low.set(node, Math.min(low.get(node), low.get(dependency)));
      } else if (active.has(dependency)) {
        low.set(node, Math.min(low.get(node), discovery.get(dependency)));
      }
    }

    if (low.get(node) !== discovery.get(node)) {
      return;
    }

    const component = [];
    let member;
    do {
      member = stack.pop();
      active.delete(member);
      component.push(member);
    } while (member !== node);

    component.sort(compareText);
    if (component.length > 1 || adjacency.get(node).includes(node)) {
      cycles.push(component);
    }
  }

  for (const node of nodes) {
    if (!discovery.has(node)) {
      visit(node);
    }
  }

  return cycles.sort((left, right) => compareText(JSON.stringify(left), JSON.stringify(right)));
}

/**
 * OR prerequisites create a dependency cycle only when every alternative stays
 * inside that cycle. Recompute components after removing escapable OR edges.
 */
function collectMandatoryCycles(groups) {
  const known = new Set(groups.keys());
  const allEdges = new Map();

  for (const [node, constraints] of groups) {
    allEdges.set(
      node,
      new Set(
        constraints.flatMap((constraint) => {
          return constraint.dependencies.filter((dependency) => known.has(dependency));
        }),
      ),
    );
  }

  let graph = allEdges;
  while (true) {
    const components = collectDependencyCycles(graph);
    const membership = new Map();
    components.forEach((component, index) => {
      component.forEach((node) => membership.set(node, index));
    });

    const nextGraph = new Map();
    let removed = false;

    for (const [node, constraints] of groups) {
      const nextEdges = new Set();
      for (const constraint of constraints) {
        const dependencies = constraint.dependencies;
        const mandatory =
          constraint.logic !== 'or' ||
          dependencies.length <= 1 ||
          (membership.has(node) &&
            dependencies.every((dependency) => {
              return (
                membership.has(dependency) && membership.get(dependency) === membership.get(node)
              );
            }));

        if (!mandatory) {
          continue;
        }

        for (const dependency of dependencies) {
          if (graph.get(node)?.has(dependency)) {
            nextEdges.add(dependency);
          }
        }
      }

      if (nextEdges.size !== graph.get(node).size) {
        removed = true;
      }
      nextGraph.set(node, nextEdges);
    }

    graph = nextGraph;
    if (!removed) {
      return { cycles: collectDependencyCycles(graph), graph };
    }
  }
}

function reportCycles(audit, graph, location, filter = null) {
  audit.stats.dependencyGraphs += 1;
  for (const dependencies of graph.values()) {
    audit.stats.dependencyEdges += dependencies.size ?? dependencies.length;
  }

  for (const component of collectDependencyCycles(graph)) {
    if (filter && !filter(component)) {
      continue;
    }
    audit.stats.dependencyCycles += 1;
    audit.issue(
      'dependency-cycle',
      `${location}[${component.join(',')}]`,
      `Cyclic dependency component: ${component.join(', ')}.`,
    );
  }
}

function auditCombat(audit, snapshot) {
  const enemies = audit.indexArray(snapshot.ENEMIES, 'ENEMIES', 'enemies');
  const bosses = audit.indexArray(snapshot.BOSSES, 'BOSSES', 'bosses');
  const heroes = audit.indexArray(snapshot.HEROES, 'HEROES', 'heroes');
  const definitions = audit.indexMapping(snapshot.DEFINITIONS, 'DEFINITIONS', 'definitions');
  const buffs = audit.record(snapshot.BUFFS, 'BUFFS');
  audit.stats.buffs += Object.keys(buffs).length;

  const expected = new Map();
  for (const [label, collection] of [
    ['ENEMIES', enemies],
    ['BOSSES', bosses],
    ['HEROES', heroes],
  ]) {
    collection.entries.forEach((entry, index) => {
      if (!isRecord(entry) || typeof entry.id !== 'string') {
        return;
      }
      if (expected.has(entry.id)) {
        audit.issue(
          'duplicate-definition-id',
          `${label}[${index}].id`,
          `ID ${describe(entry.id)} is also declared in ${expected.get(entry.id).location}.`,
        );
      } else {
        expected.set(entry.id, { entry, location: `${label}[${index}]` });
      }
    });
  }

  const baselineRawIds = new Set(
    [Data.ENEMIES, Data.BOSSES, Data.HEROES]
      .flatMap((entries) => (Array.isArray(entries) ? entries : []))
      .filter(isRecord)
      .map((entry) => entry.id),
  );
  const supplementalIds = new Set(
    Object.keys(Data.DEFINITIONS ?? {}).filter((key) => !baselineRawIds.has(key)),
  );

  for (const [key, { entry, location }] of expected) {
    if (!definitions.index.has(key)) {
      audit.issue('missing-definition', location, `DEFINITIONS is missing ${describe(key)}.`);
    } else if (!sameData(entry, definitions.index.get(key))) {
      audit.issue(
        'definition-assembly-mismatch',
        `DEFINITIONS.${key}`,
        `Definition differs from its runtime source entry at ${location}.`,
      );
    }
  }

  for (const key of definitions.index.keys()) {
    if (!expected.has(key) && !supplementalIds.has(key)) {
      audit.issue(
        'unexpected-definition',
        `DEFINITIONS.${key}`,
        'Definition has no matching runtime source entry.',
      );
    }
  }

  const enemyDefinitions = new Map();
  for (const [key, entry] of definitions.index) {
    if (!heroes.index.has(key) && !Array.isArray(entry.skills)) {
      enemyDefinitions.set(key, entry);
    }
  }

  const skillIds = new Set();
  heroes.entries.forEach((hero, index) => {
    if (!isRecord(hero)) {
      return;
    }

    const location = `HEROES[${index}]`;
    const skills = audit.indexArray(hero.skills, `${location}.skills`, 'heroSkills');
    const scopedIds = new Set(skills.index.keys());

    for (const skillId of scopedIds) {
      skillIds.add(skillId);
    }

    if (hero.entrySkill !== null && hero.entrySkill !== undefined) {
      const entry = audit.record(hero.entrySkill, `${location}.entrySkill`);
      audit.stats.heroSkills += 1;
      if (audit.id(entry.id, `${location}.entrySkill.id`)) {
        if (scopedIds.has(entry.id)) {
          audit.issue(
            'duplicate-id',
            `${location}.entrySkill.id`,
            `Skill ID ${describe(entry.id)} is repeated within this hero.`,
          );
        }
        skillIds.add(entry.id);
      }
    }
  });

  for (const [label, entries] of [
    ['ENEMIES', enemies.entries],
    ['BOSSES', bosses.entries],
    ['HEROES', heroes.entries],
  ]) {
    entries.forEach((entry, index) => {
      if (!isRecord(entry)) {
        return;
      }
      const location = `${label}[${index}]`;
      audit.number(entry.hp, `${location}.hp`, Number.MIN_VALUE);
      audit.optionalNumber(entry, 'mp', location, 0);
      audit.optionalNumber(entry, 'speed', location, 0);
      audit.optionalNumber(entry, 'attack', location, 0);
      audit.optionalNumber(entry, 'limit', location, 1, Infinity, true);
      audit.optionalNumber(entry, 'actions', location, 1, Infinity, true);
      audit.optionalNumber(entry, 'enragedActions', location, 1, Infinity, true);
      audit.optionalNumber(entry, 'finalPhaseActions', location, 1, Infinity, true);
      audit.optionalNumber(entry, 'phaseThreshold', location, 0, 1);
      audit.optionalNumber(entry, 'toughness', location, 0, Infinity, true);
      auditEffectReferences(audit, entry, location, buffs);
    });
  }

  for (const [key, entry] of enemyDefinitions) {
    if (!expected.has(key)) {
      auditEffectReferences(audit, entry, `DEFINITIONS.${key}`, buffs);
    }
  }

  return {
    enemies,
    bosses,
    heroes,
    definitions: definitions.index,
    enemyDefinitions,
    buffs,
    skillIds,
  };
}

function auditEffectReferences(audit, value, location, buffs, ancestors = new Set()) {
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (ancestors.has(value)) {
    audit.issue('cyclic-data', location, 'Content contains an object-reference cycle.');
    return;
  }

  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      auditEffectReferences(audit, entry, `${location}[${index}]`, buffs, nextAncestors);
    });
    return;
  }

  if (own(value, 'buff')) {
    audit.reference(value.buff, buffs, `${location}.buff`, 'buff');
  }

  for (const key of ['buffs', 'selfBuff']) {
    if (!own(value, key)) {
      continue;
    }
    if (Array.isArray(value[key])) {
      value[key].forEach((buff, index) => {
        audit.reference(buff, buffs, `${location}.${key}[${index}]`, 'buff');
      });
    } else {
      const quantities = audit.record(value[key], `${location}.${key}`);
      for (const [buff, amount] of Object.entries(quantities)) {
        audit.reference(buff, buffs, `${location}.${key}.${buff}`, 'buff');
        audit.number(amount, `${location}.${key}.${buff}`, -Infinity, Infinity);
      }
    }
  }

  if (typeof value.type === 'string') {
    audit.optionalNumber(value, 'value', location, -Infinity, Infinity);
    audit.optionalNumber(value, 'maxHpPercent', location, 0, 1);
    audit.optionalNumber(value, 'maxMpPercent', location, 0, 1);
  }

  for (const [key, child] of Object.entries(value)) {
    if (key !== 'buffs' && key !== 'selfBuff') {
      auditEffectReferences(audit, child, `${location}.${key}`, buffs, nextAncestors);
    }
  }
}

function auditInventory(audit, snapshot, combat) {
  const items = audit.indexMapping(snapshot.ITEMS, 'ITEMS', 'items');
  const gems = audit.indexArray(snapshot.GEM_POOL, 'GEM_POOL', 'gems');
  const skills = audit.indexArray(snapshot.LEARNABLE_SKILLS, 'LEARNABLE_SKILLS', 'learnableSkills');
  const categories = audit.record(
    snapshot.LEARNABLE_SKILL_CATEGORIES,
    'LEARNABLE_SKILL_CATEGORIES',
  );
  audit.stats.skillCategories += Object.keys(categories).length;

  for (const [key, item] of items.index) {
    const location = `ITEMS.${key}`;
    audit.number(item.price, `${location}.price`, 0, Number.MAX_SAFE_INTEGER, true);
    audit.optionalNumber(item, 'ap', location, 0, Number.MAX_SAFE_INTEGER, true);
    audit.array(item.effects, `${location}.effects`);
    auditEffectReferences(audit, item, location, combat.buffs);
  }

  gems.entries.forEach((gem, index) => {
    if (!isRecord(gem)) {
      return;
    }
    const location = `GEM_POOL[${index}]`;
    audit.enumeration(gem.category, ['gem'], `${location}.category`);
    audit.enumeration(gem.quality, GEM_QUALITIES, `${location}.quality`);
    audit.number(gem.price, `${location}.price`, 0, Number.MAX_SAFE_INTEGER, true);
    audit.number(gem.level, `${location}.level`, 1, Number.MAX_SAFE_INTEGER, true);

    const bonuses = audit.record(gem.dcBonus, `${location}.dcBonus`);
    for (const [attribute, amount] of Object.entries(bonuses)) {
      audit.enumeration(attribute, GEM_ATTRIBUTES, `${location}.dcBonus.${attribute}#key`);
      audit.number(amount, `${location}.dcBonus.${attribute}`, -Infinity, Infinity);
    }

    if (items.index.has(gem.id)) {
      audit.issue('duplicate-inventory-id', `${location}.id`, 'Gem ID also exists in ITEMS.');
    }
  });

  skills.entries.forEach((skill, index) => {
    if (!isRecord(skill)) {
      return;
    }
    const location = `LEARNABLE_SKILLS[${index}]`;
    audit.reference(skill.category, categories, `${location}.category`, 'learnable skill category');
    audit.enumeration(skill.rank, SKILL_RANKS, `${location}.rank`);
    audit.number(skill.price, `${location}.price`, 0, Number.MAX_SAFE_INTEGER, true);
    audit.number(skill.meritReq, `${location}.meritReq`, 0, Number.MAX_SAFE_INTEGER, true);
    audit.optionalNumber(skill, 'ap', location, 0, Number.MAX_SAFE_INTEGER, true);
    audit.optionalNumber(skill, 'mp', location, 0, Number.MAX_SAFE_INTEGER, true);
    audit.optionalNumber(skill, 'hp', location, 0, Number.MAX_SAFE_INTEGER, true);
    audit.array(skill.effects, `${location}.effects`);
    auditEffectReferences(audit, skill, location, combat.buffs);
  });

  const starters = audit.array(snapshot.STARTER_LEARNED_SKILL_IDS, 'STARTER_LEARNED_SKILL_IDS');
  const seenStarters = new Set();
  audit.stats.starterSkills += starters.length;

  starters.forEach((skillId, index) => {
    const location = `STARTER_LEARNED_SKILL_IDS[${index}]`;
    audit.reference(skillId, skills.index, location, 'learnable skill');
    if (seenStarters.has(skillId)) {
      audit.issue('duplicate-id', location, `Repeated starter skill ${describe(skillId)}.`);
    }
    seenStarters.add(skillId);
  });

  return { items: items.index, gems: gems.index, skills: skills.index };
}

function auditDining(audit, snapshot) {
  const ingredients = audit.indexMapping(snapshot.INGREDIENTS, 'INGREDIENTS', 'ingredients');
  const dishes = audit.indexMapping(snapshot.DISHES, 'DISHES', 'dishes');
  const direct = audit.indexMapping(snapshot.DIRECT_FOODS, 'DIRECT_FOODS', 'directFoods');
  const meals = audit.indexMapping(snapshot.MEAL_FOODS, 'MEAL_FOODS', 'mealFoods');

  for (const [label, collection] of [
    ['INGREDIENTS', ingredients],
    ['DISHES', dishes],
    ['DIRECT_FOODS', direct],
    ['MEAL_FOODS', meals],
  ]) {
    for (const [key, entry] of collection.index) {
      const location = `${label}.${key}`;
      audit.optionalNumber(entry, 'price', location, 0, Number.MAX_SAFE_INTEGER, true);
      audit.optionalNumber(entry, 'rarity', location, 0, 3, true);
      audit.optionalNumber(entry, 'index', location, 0, Number.MAX_SAFE_INTEGER, true);

      if (label !== 'INGREDIENTS') {
        audit.quantities(entry.recipe, ingredients.index, `${location}.recipe`, 'ingredient', {
          nonempty: true,
          maximum: Number.MAX_SAFE_INTEGER,
        });
        const bonus = audit.record(entry.bonus, `${location}.bonus`);
        for (const [field, amount] of Object.entries(bonus)) {
          audit.number(amount, `${location}.bonus.${field}`, -Infinity, Infinity);
        }
      }

      if (label === 'DIRECT_FOODS') {
        audit.reference(key, ingredients.index, location, 'ingredient');
      }
    }
  }

  const assembled = new Map(dishes.index);
  for (const [key, entry] of direct.index) {
    if (assembled.has(key)) {
      audit.issue(
        'duplicate-food-id',
        `DIRECT_FOODS.${key}`,
        'ID is declared in both DISHES and DIRECT_FOODS.',
      );
    }
    assembled.set(key, entry);
  }

  for (const [key, expected] of assembled) {
    if (!meals.index.has(key)) {
      audit.issue('missing-meal-food', 'MEAL_FOODS', `Missing food ${describe(key)}.`);
    } else if (!sameData(expected, meals.index.get(key))) {
      audit.issue(
        'meal-food-assembly-mismatch',
        `MEAL_FOODS.${key}`,
        'Entry differs from its DISHES or DIRECT_FOODS source.',
      );
    }
  }

  for (const key of meals.index.keys()) {
    if (!assembled.has(key)) {
      audit.issue(
        'unexpected-meal-food',
        `MEAL_FOODS.${key}`,
        'Entry has no DISHES or DIRECT_FOODS source.',
      );
    }
  }

  const menu = audit.indexArray(snapshot.SERVICE_MENU, 'SERVICE_MENU', 'serviceMenu');
  menu.entries.forEach((entry, index) => {
    if (!isRecord(entry)) {
      return;
    }
    const location = `SERVICE_MENU[${index}]`;
    audit.number(entry.price, `${location}.price`, 0, Number.MAX_SAFE_INTEGER, true);
    audit.reference(entry.artId ?? entry.id, meals.index, `${location}.artId`, 'meal food');
    if (own(entry, 'foodId')) {
      audit.reference(entry.foodId, meals.index, `${location}.foodId`, 'meal food');
    }
  });

  const extras = audit.array(snapshot.SERVICE_EXTRAS, 'SERVICE_EXTRAS');
  const extraNames = new Set(extras.filter((extra) => typeof extra === 'string'));
  audit.stats.serviceExtras += extras.length;
  const basics = audit.array(snapshot.SERVICE_BASIC_MENU, 'SERVICE_BASIC_MENU');
  audit.stats.serviceBasicMenu += basics.length;
  const basicSeen = new Set();

  basics.forEach((menuIndex, index) => {
    const location = `SERVICE_BASIC_MENU[${index}]`;
    audit.number(menuIndex, location, 0, menu.entries.length - 1, true);
    if (basicSeen.has(menuIndex)) {
      audit.issue('duplicate-menu-index', location, `Repeated menu index ${describe(menuIndex)}.`);
    }
    basicSeen.add(menuIndex);
  });

  const seatRequests = audit.record(snapshot.SEAT_REQUESTS, 'SEAT_REQUESTS');
  for (const [label, stat] of [
    ['SERVICE_PARTIES', 'serviceParties'],
    ['SERVICE_TRAINING', 'serviceTraining'],
  ]) {
    const parties = audit.array(snapshot[label], label);
    audit.stats[stat] += parties.length;

    parties.forEach((rawParty, index) => {
      const location = `${label}[${index}]`;
      const party = audit.record(rawParty, location);
      audit.number(party.size, `${location}.size`, 1, Number.MAX_SAFE_INTEGER, true);
      audit.reference(party.seat, seatRequests, `${location}.seat`, 'seat request');
      const order = audit.array(party.order, `${location}.order`);
      order.forEach((menuIndex, orderIndex) => {
        audit.number(
          menuIndex,
          `${location}.order[${orderIndex}]`,
          0,
          menu.entries.length - 1,
          true,
        );
      });

      if (party.extras !== null && party.extras !== undefined) {
        audit.array(party.extras, `${location}.extras`).forEach((extraName, extraPosition) => {
          audit.reference(
            extraName,
            extraNames,
            `${location}.extras[${extraPosition}]`,
            'service extra',
          );
        });
      }
      audit.optionalNumber(party, 'coupon', location, 0, Number.MAX_SAFE_INTEGER, true);
    });
  }

  return {
    ingredients: ingredients.index,
    dishes: dishes.index,
    directFoods: direct.index,
    foods: meals.index,
  };
}

function auditWorld(audit, snapshot, combat) {
  const regions = audit.record(snapshot.REGIONS, 'REGIONS');
  audit.stats.regions += Object.keys(regions).length;
  const regionNodes = new Map();

  for (const [regionId, rawRegion] of Object.entries(regions)) {
    const location = `REGIONS.${regionId}`;
    const region = audit.record(rawRegion, location);
    audit.optionalNumber(region, 'level', location, 1, Number.MAX_SAFE_INTEGER, true);
    const enemyIds = audit.array(region.enemies, `${location}.enemies`);
    audit.stats.enemyPoolReferences += enemyIds.length;
    enemyIds.forEach((enemyId, index) => {
      audit.reference(enemyId, combat.enemyDefinitions, `${location}.enemies[${index}]`, 'enemy');
    });
    audit.reference(region.boss, combat.enemyDefinitions, `${location}.boss`, 'enemy definition');

    const nodes = own(region, 'nodes')
      ? audit.indexArray(region.nodes, `${location}.nodes`, 'regionNodes')
      : { entries: [], index: new Map() };
    regionNodes.set(regionId, nodes.index);

    const dependencyGraph = new Map();
    nodes.entries.forEach((node, index) => {
      if (isRecord(node)) {
        audit.reference(
          node.boss,
          combat.enemyDefinitions,
          `${location}.nodes[${index}].boss`,
          'enemy definition',
        );
        if (node.parentId !== null && node.parentId !== undefined) {
          audit.reference(
            node.parentId,
            nodes.index,
            `${location}.nodes[${index}].parentId`,
            'region node',
          );
        }
        if (node.id !== null && node.id !== undefined) {
          dependencyGraph.set(
            node.id,
            node.parentId === null || node.parentId === undefined ? [] : [node.parentId],
          );
        }
      }
    });
    reportCycles(audit, dependencyGraph, `${location}.nodes.parentId`);

    if (own(region, 'taskHooks')) {
      const hooks = audit.indexArray(region.taskHooks, `${location}.taskHooks`, 'regionHooks');
      hooks.entries.forEach((hook, index) => {
        if (!isRecord(hook)) {
          return;
        }
        const hookLocation = `${location}.taskHooks[${index}]`;
        audit.reference(
          hook.boss,
          combat.enemyDefinitions,
          `${hookLocation}.boss`,
          'enemy definition',
        );
        if (hook.nodeId !== null && hook.nodeId !== undefined) {
          audit.reference(hook.nodeId, nodes.index, `${hookLocation}.nodeId`, 'region node');
        }
      });
    }
  }

  if (snapshot.JACOBS_LADDER_CONFIG !== undefined) {
    const ladder = audit.record(snapshot.JACOBS_LADDER_CONFIG, 'JACOBS_LADDER_CONFIG');
    const hooks = audit.indexArray(
      ladder.taskHooks,
      'JACOBS_LADDER_CONFIG.taskHooks',
      'ladderHooks',
    );
    hooks.entries.forEach((hook, index) => {
      if (isRecord(hook)) {
        audit.reference(
          hook.boss,
          combat.enemyDefinitions,
          `JACOBS_LADDER_CONFIG.taskHooks[${index}].boss`,
          'enemy definition',
        );
      }
    });
  }

  const encounterCount =
    snapshot.ENCOUNTER_COUNT ??
    Data.ENCOUNTER_COUNT ??
    RuinsEncounters.ENCOUNTER_COUNT ??
    ForestEncounters.ENCOUNTER_COUNT ??
    FrostEncounters.ENCOUNTER_COUNT ??
    MillEncounters.ENCOUNTER_COUNT ??
    5;
  audit.number(encounterCount, 'ENCOUNTER_COUNT', 1, Number.MAX_SAFE_INTEGER, true);

  const routeFamilies = new Map();
  for (const [routeName, dungeonName, regionId] of ROUTE_FAMILIES) {
    const routes = audit.indexArray(snapshot[routeName], routeName, 'routes');
    routeFamilies.set(regionId, { ...routes, routeName, dungeonName });

    routes.entries.forEach((route, index) => {
      if (!isRecord(route)) {
        return;
      }
      const location = `${routeName}[${index}]`;
      audit.reference(route.boss, combat.enemyDefinitions, `${location}.boss`, 'enemy definition');

      if (route.nodeId !== null && route.nodeId !== undefined) {
        const nodes = regionNodes.get(regionId) ?? new Map();
        if (audit.reference(route.nodeId, nodes, `${location}.nodeId`, 'region node')) {
          if (nodes.get(route.nodeId).boss !== route.boss) {
            audit.issue(
              'route-node-boss-mismatch',
              `${location}.boss`,
              `Route boss disagrees with explicit region node ${describe(route.nodeId)}.`,
            );
          }
        }
      }

      for (const battleField of ['battles', 'tutorialBattles']) {
        if (battleField === 'tutorialBattles' && !own(route, battleField)) {
          continue;
        }
        const battles = audit.array(route[battleField], `${location}.${battleField}`, 1);
        audit.stats[battleField === 'battles' ? 'battles' : 'tutorialBattles'] += battles.length;

        if (Number.isInteger(encounterCount) && battles.length !== encounterCount) {
          audit.issue(
            'encounter-count-mismatch',
            `${location}.${battleField}`,
            `Expected ENCOUNTER_COUNT (${encounterCount}) battles; received ${battles.length}.`,
          );
        }

        battles.forEach((rawBattle, battleIndex) => {
          const battleLocation = `${location}.${battleField}[${battleIndex}]`;
          const battle = audit.record(rawBattle, battleLocation);
          const enemyIds = audit.array(battle.enemyIds, `${battleLocation}.enemyIds`, 1);
          audit.stats.battleEnemyReferences += enemyIds.length;
          enemyIds.forEach((enemyId, enemyIndex) => {
            audit.reference(
              enemyId,
              combat.enemyDefinitions,
              `${battleLocation}.enemyIds[${enemyIndex}]`,
              'enemy definition',
            );
          });
          audit.optionalNumber(battle, 'hpScale', battleLocation, Number.MIN_VALUE);
        });

        const finalBattle = battles.at(-1);
        if (isRecord(finalBattle) && Array.isArray(finalBattle.enemyIds)) {
          if (!finalBattle.enemyIds.includes(route.boss)) {
            audit.issue(
              'final-boss-missing',
              `${location}.${battleField}[${battles.length - 1}].enemyIds`,
              `Final battle does not contain route boss ${describe(route.boss)}.`,
            );
          }
        }
      }
    });
  }

  for (const poolName of ['RUINS_ENEMY_IDS', 'MILL_ENEMY_IDS']) {
    const pool = audit.array(snapshot[poolName], poolName);
    audit.stats.enemyPoolReferences += pool.length;
    pool.forEach((enemyId, index) => {
      audit.reference(
        enemyId,
        combat.enemyDefinitions,
        `${poolName}[${index}]`,
        'enemy definition',
      );
    });
  }

  for (const targetName of ['RUINS_TUTORIAL_TARGETS', 'MILL_TUTORIAL_TARGETS']) {
    const targets = audit.record(snapshot[targetName], targetName);
    audit.stats.tutorialTargets += Object.keys(targets).length;
    for (const [mechanic, enemyId] of Object.entries(targets)) {
      audit.reference(
        enemyId,
        combat.enemyDefinitions,
        `${targetName}.${mechanic}`,
        'enemy definition',
      );
    }
  }

  const tutorials = audit.indexMapping(
    snapshot.OVERLORD_TUTORIALS,
    'OVERLORD_TUTORIALS',
    'overlordTutorials',
  );
  for (const key of tutorials.index.keys()) {
    audit.reference(key, combat.enemyDefinitions, `OVERLORD_TUTORIALS.${key}`, 'enemy definition');
  }

  const encounters = audit.array(snapshot.ENCOUNTERS, 'ENCOUNTERS');
  audit.stats.encounters += encounters.length;
  encounters.forEach((rawEncounter, index) => {
    const location = `ENCOUNTERS[${index}]`;
    const encounter = audit.record(rawEncounter, location);
    audit.reference(encounter.map, regions, `${location}.map`, 'region');
    audit.optionalNumber(encounter, 'hpScale', location, Number.MIN_VALUE);
    if (own(encounter, 'enemyIds')) {
      const enemyIds = audit.array(encounter.enemyIds, `${location}.enemyIds`, 1);
      audit.stats.battleEnemyReferences += enemyIds.length;
      enemyIds.forEach((enemyId, enemyIndex) => {
        audit.reference(
          enemyId,
          combat.enemyDefinitions,
          `${location}.enemyIds[${enemyIndex}]`,
          'enemy definition',
        );
      });
    }
  });

  auditDungeons(audit, snapshot, routeFamilies);
  return { regions, routeFamilies, encounterCount };
}

function auditDungeons(audit, snapshot, routeFamilies) {
  const all = audit.indexArray(
    snapshot.ALL_OFFICIAL_DUNGEONS,
    'ALL_OFFICIAL_DUNGEONS',
    'officialDungeons',
  );
  const expected = new Map();

  const npcDomains = new Map();
  for (const [name, regionId] of [
    ['FOREST_NPCS', 'forest'],
    ['FROST_NPCS', 'frost'],
  ]) {
    npcDomains.set(regionId, audit.indexArray(snapshot[name], name, 'npcs').index);
  }

  function checkDungeon(entry, location, npcDomain = null) {
    if (!isRecord(entry)) {
      return;
    }
    if (entry.key !== `official-dungeon:${entry.id}`) {
      audit.issue(
        'dungeon-key-mismatch',
        `${location}.key`,
        `Expected ${describe(`official-dungeon:${entry.id}`)}; received ${describe(entry.key)}.`,
      );
    }

    if (entry.npcs !== null && entry.npcs !== undefined) {
      const npcs = audit.array(entry.npcs, `${location}.npcs`);
      audit.stats.npcReferences += npcs.length;
      npcs.forEach((rawNpc, index) => {
        const npc = audit.record(rawNpc, `${location}.npcs[${index}]`);
        const domain =
          npcDomain ?? new Map([...npcDomains.values()].flatMap((values) => [...values]));
        audit.reference(npc.id, domain, `${location}.npcs[${index}].id`, 'dungeon NPC');
      });
    }
  }

  for (const [regionId, family] of routeFamilies) {
    const dungeons = audit.indexArray(
      snapshot[family.dungeonName],
      family.dungeonName,
      'dungeonEntries',
    );

    dungeons.entries.forEach((entry, index) => {
      if (!isRecord(entry)) {
        return;
      }
      const location = `${family.dungeonName}[${index}]`;
      checkDungeon(entry, location, npcDomains.get(regionId));
      audit.reference(entry.id, family.index, `${location}.id`, 'encounter route');

      if (expected.has(entry.id)) {
        audit.issue(
          'duplicate-dungeon-association',
          `${location}.id`,
          `Dungeon ${describe(entry.id)} appears in multiple region families.`,
        );
      }
      expected.set(entry.id, entry);

      if (audit.reference(entry.id, all.index, `${location}.id`, 'official dungeon')) {
        if (!sameData(entry, all.index.get(entry.id))) {
          audit.issue(
            'official-dungeon-assembly-mismatch',
            location,
            'Dungeon differs from its ALL_OFFICIAL_DUNGEONS entry.',
          );
        }
      }
    });

    for (const routeId of family.index.keys()) {
      if (!dungeons.index.has(routeId)) {
        audit.issue(
          'missing-official-dungeon',
          family.dungeonName,
          `Route ${describe(routeId)} has no associated official dungeon.`,
        );
      }
    }
  }

  all.entries.forEach((entry, index) => {
    const location = `ALL_OFFICIAL_DUNGEONS[${index}]`;
    checkDungeon(entry, location);
    if (isRecord(entry) && !expected.has(entry.id)) {
      audit.issue(
        'unexpected-official-dungeon',
        `${location}.id`,
        'Dungeon is absent from the region dungeon collections.',
      );
    }
  });

  for (const name of ['OFFICIAL_DUNGEONS', 'EXPANDED_DUNGEONS']) {
    const subset = audit.indexArray(snapshot[name], name, 'dungeonEntries');
    subset.entries.forEach((entry, index) => {
      const location = `${name}[${index}]`;
      checkDungeon(entry, location);
      if (isRecord(entry)) {
        audit.reference(entry.id, all.index, `${location}.id`, 'official dungeon');
      }
    });
  }

  for (const name of [
    'TUTORIAL_DUNGEON',
    'CORRIDOR_DUNGEON',
    'HALL_DUNGEON',
    'SINKHOLE_DUNGEON',
    'TOMB_DUNGEON',
    'CURSE_DUNGEON',
  ]) {
    const entry = audit.record(snapshot[name], name);
    audit.stats.dungeonEntries += 1;
    checkDungeon(entry, name);
    if (audit.reference(entry.id, all.index, `${name}.id`, 'official dungeon')) {
      if (!sameData(entry, all.index.get(entry.id))) {
        audit.issue(
          'official-dungeon-assembly-mismatch',
          name,
          'Dungeon alias differs from its ALL_OFFICIAL_DUNGEONS entry.',
        );
      }
    }
  }
}

function collectTemplatePortraits(snapshot) {
  const portraits = new Set();
  const visited = new WeakSet();

  function visit(value) {
    if (value === null || typeof value !== 'object' || visited.has(value)) {
      return;
    }
    visited.add(value);

    if (isRecord(value) && typeof value.portrait === 'string') {
      const portrait = portraitBasename(value.portrait);
      if (portrait) {
        portraits.add(portrait);
      }
    }

    for (const child of Object.values(value)) {
      visit(child);
    }
  }

  visit(snapshot.HUMANOID_ENEMY_TEMPLATES);

  for (const [key, value] of Object.entries(snapshot)) {
    if (
      /(?:enemy|enemies|boss|bosses).*(?:appearance|template)|(?:appearance|template).*(?:enemy|enemies|boss|bosses)/i.test(
        key,
      )
    ) {
      visit(value);
    }
  }

  return portraits;
}

function auditDrops(audit, snapshot, combat, inventory, dining) {
  const groups = audit.record(snapshot.DROP_GROUPS, 'DROP_GROUPS');
  audit.stats.dropGroups += Object.keys(groups).length;
  const knownPortraits = collectTemplatePortraits(snapshot);

  for (const entry of combat.enemyDefinitions.values()) {
    const portrait = portraitBasename(entry.portrait);
    if (portrait) {
      knownPortraits.add(portrait);
    }
  }
  for (const entries of [combat.enemies.entries, combat.bosses.entries]) {
    for (const entry of entries) {
      const portrait = portraitBasename(entry?.portrait);
      if (portrait) {
        knownPortraits.add(portrait);
      }
    }
  }
  audit.stats.knownEnemyPortraits += knownPortraits.size;

  const primaryIds = new Set([...dining.ingredients.keys(), ...inventory.items.keys()]);
  const assigned = new Map();
  for (const [primaryId, rawPortraits] of Object.entries(groups)) {
    const location = `DROP_GROUPS.${primaryId}`;
    audit.reference(primaryId, primaryIds, `${location}#key`, 'ingredient or item');
    const portraits = audit.array(rawPortraits, location, 1);
    audit.stats.dropPortraitEntries += portraits.length;

    portraits.forEach((portrait, index) => {
      const entryLocation = `${location}[${index}]`;
      if (
        typeof portrait !== 'string' ||
        portrait !== portraitBasename(portrait) ||
        !portrait.trim()
      ) {
        audit.issue(
          'invalid-drop-portrait',
          entryLocation,
          `Expected a portrait basename; received ${describe(portrait)}.`,
        );
      }
      audit.reference(portrait, knownPortraits, entryLocation, 'canonical or appearance portrait');

      if (assigned.has(portrait)) {
        audit.issue(
          'duplicate-drop-portrait',
          entryLocation,
          `Portrait ${describe(portrait)} is already assigned at ${assigned.get(portrait)}.`,
        );
      } else {
        assigned.set(portrait, entryLocation);
      }
    });
  }

  for (const portrait of [...knownPortraits].sort(compareText)) {
    if (!assigned.has(portrait)) {
      audit.issue(
        'missing-drop-group',
        `DROP_GROUPS#${portrait}`,
        `Portrait ${describe(portrait)} has no drop group.`,
      );
    }
  }

  if (typeof snapshot.enemyDropTable !== 'function') {
    audit.issue(
      'invalid-drop-consumer',
      'enemyDropTable',
      'Expected the runtime drop-table function.',
    );
    return;
  }

  for (const [enemyId, enemy] of combat.enemyDefinitions) {
    const location = `enemyDropTable(${JSON.stringify(enemyId)})`;
    audit.stats.enemyDropTables += 1;

    try {
      const table = audit.record(snapshot.enemyDropTable(cloneData(enemy)), location);
      audit.reference(table.primary, primaryIds, `${location}.primary`, 'ingredient or item');
      audit.reference(table.extra, inventory.items, `${location}.extra`, 'item');
      audit.number(table.primaryChance, `${location}.primaryChance`, 0, 1);
      audit.number(table.extraChance, `${location}.extraChance`, 0, 1);
    } catch (error) {
      audit.issue('drop-consumer-error', location, String(error?.message ?? error));
    }
  }
}

function auditEmblems(audit, snapshot, combat, world) {
  const emblems = audit.indexMapping(snapshot.EMBLEMS, 'EMBLEMS', 'emblems', true);
  const visuals = audit.indexMapping(snapshot.EMBLEM_VISUALS, 'EMBLEM_VISUALS', 'emblemVisuals');
  const skillIds = new Set();

  for (const [emblemId, entry] of emblems.index) {
    audit.reference(emblemId, visuals.index, `EMBLEMS.${emblemId}`, 'emblem visual');
    const skill = audit.record(entry.skill, `EMBLEMS.${emblemId}.skill`);
    audit.stats.emblemSkills += 1;
    if (audit.id(skill.id, `EMBLEMS.${emblemId}.skill.id`)) {
      if (skillIds.has(skill.id)) {
        audit.issue(
          'duplicate-emblem-skill-id',
          `EMBLEMS.${emblemId}.skill.id`,
          `Repeated emblem skill ID ${describe(skill.id)}.`,
        );
      }
      skillIds.add(skill.id);
    }
    auditEffectReferences(audit, skill, `EMBLEMS.${emblemId}.skill`, combat.buffs);
  }

  for (const emblemId of visuals.index.keys()) {
    audit.reference(emblemId, emblems.index, `EMBLEM_VISUALS.${emblemId}`, 'emblem');
  }

  for (const [key, value] of Object.entries(snapshot)) {
    if (key === 'EMBLEM_ID' || key.endsWith('_EMBLEM_ID')) {
      audit.reference(value, emblems.index, key, 'emblem');
    }
  }

  for (const name of ['EMBLEM', 'OVERLOAD_EMBLEM']) {
    const emblem = audit.record(snapshot[name], name);
    audit.reference(emblem.id, emblems.index, `${name}.id`, 'emblem');
  }

  const awards = audit.record(snapshot.OVERLORD_EMBLEM_UNLOCKS, 'OVERLORD_EMBLEM_UNLOCKS');
  audit.stats.emblemAwards += Object.keys(awards).length;
  for (const [bossId, emblemId] of Object.entries(awards)) {
    const location = `OVERLORD_EMBLEM_UNLOCKS.${bossId}`;
    if (audit.reference(bossId, combat.enemyDefinitions, `${location}#key`, 'boss definition')) {
      if (combat.enemyDefinitions.get(bossId).boss !== true) {
        audit.issue(
          'emblem-award-not-boss',
          location,
          'Emblem award key refers to a non-boss definition.',
        );
      }
    }
    audit.reference(emblemId, emblems.index, location, 'emblem');
  }

  if (typeof snapshot.storyRingReward === 'function') {
    for (const [regionId, family] of world.routeFamilies) {
      family.entries.forEach((route, sequence) => {
        if (!isRecord(route)) {
          return;
        }
        const location = `storyRingReward(${JSON.stringify(regionId)},${sequence})`;
        try {
          const reward = snapshot.storyRingReward({ map: regionId, sequence }, []);
          if (reward === null || reward === undefined) {
            return;
          }
          audit.stats.storyEmblemRewards += 1;
          const entry = audit.record(reward, location);
          audit.reference(entry.id, emblems.index, `${location}.id`, 'emblem');
          audit.number(entry.encounter, `${location}.encounter`, 0, world.encounterCount - 1, true);
        } catch (error) {
          audit.issue('emblem-reward-consumer-error', location, String(error?.message ?? error));
        }
      });
    }
  }

  return emblems.index;
}

function auditContentReferences(audit, snapshot, domains) {
  const referenceFields = new Map([
    ['enemyId', [domains.enemies, 'enemy definition']],
    ['bossId', [domains.enemies, 'enemy definition']],
    ['heroId', [domains.heroes, 'hero']],
    ['itemId', [domains.items, 'item']],
    ['gemId', [domains.gems, 'gem']],
    ['ingredientId', [domains.ingredients, 'ingredient']],
    ['dishId', [domains.dishes, 'dish']],
    ['foodId', [domains.foods, 'meal food']],
    ['learnableSkillId', [domains.skills, 'learnable skill']],
    ['emblemId', [domains.emblems, 'emblem']],
  ]);
  const rewardDomains = new Map([
    ['items', [domains.items, 'item']],
    ['gems', [domains.gems, 'gem']],
    ['ingredients', [domains.ingredients, 'ingredient']],
  ]);
  const rewardNumbers = new Set([
    'gold',
    'ether',
    'goldReward',
    'etherReward',
    'summonContracts',
    'merit',
    'experience',
    'xp',
  ]);

  function rewardCollection(value, location, domain, label) {
    audit.stats.rewardMaps += 1;
    if (!Array.isArray(value)) {
      const entries = audit.quantities(value, domain, location, label, {
        maximum: Number.MAX_SAFE_INTEGER,
      });
      audit.stats.rewardEntries += Object.keys(entries).length;
      return;
    }

    audit.stats.rewardEntries += value.length;
    value.forEach((entry, index) => {
      const entryLocation = `${location}[${index}]`;
      if (typeof entry === 'string') {
        audit.reference(entry, domain, entryLocation, label);
        return;
      }
      const record = audit.record(entry, entryLocation);
      const idField =
        label === 'gem' ? 'gemId' : label === 'ingredient' ? 'ingredientId' : 'itemId';
      audit.reference(record[idField] ?? record.id, domain, `${entryLocation}.${idField}`, label);
      for (const quantity of ['count', 'quantity', 'amount']) {
        audit.optionalNumber(record, quantity, entryLocation, 1, Number.MAX_SAFE_INTEGER, true);
      }
    });
  }

  function walk(value, location, rewardContext = false, ancestors = new Set()) {
    if (value === null || typeof value !== 'object') {
      return;
    }
    if (ancestors.has(value)) {
      audit.issue('cyclic-data', location, 'Content contains an object-reference cycle.');
      return;
    }
    const nextAncestors = new Set(ancestors);
    nextAncestors.add(value);

    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        walk(entry, `${location}[${index}]`, rewardContext, nextAncestors);
      });
      return;
    }

    for (const [key, child] of Object.entries(value)) {
      const childLocation = `${location}.${key}`;
      const reference = referenceFields.get(key);
      if (reference && child !== null && child !== undefined) {
        audit.reference(child, reference[0], childLocation, reference[1]);
      }

      const rewardDomain = rewardDomains.get(key);
      if (rewardDomain && (rewardContext || key === 'items' || key === 'gems')) {
        rewardCollection(child, childLocation, rewardDomain[0], rewardDomain[1]);
        continue;
      }

      if (rewardContext && rewardNumbers.has(key)) {
        audit.number(child, childLocation, 0, Number.MAX_SAFE_INTEGER, true);
      }
      if (rewardContext && (key === 'chance' || key === 'probability')) {
        audit.number(child, childLocation, 0, 1);
      }

      walk(
        child,
        childLocation,
        rewardContext || /^(?:reward|rewards|loot|drops|firstClearReward|clearReward)$/.test(key),
        nextAncestors,
      );
    }
  }

  const roots = new Set([
    'REGIONS',
    'JACOBS_LADDER_CONFIG',
    'ENCOUNTERS',
    'ENEMIES',
    'BOSSES',
    'HEROES',
    'ITEMS',
    'GEM_POOL',
    'LEARNABLE_SKILLS',
    'OVERLORD_TUTORIALS',
    'ALL_OFFICIAL_DUNGEONS',
    'FOREST_DUNGEONS',
    'FROST_DUNGEONS',
    'RUINS_DUNGEONS',
    'MILL_DUNGEONS',
    'RUINS_ROUTES',
    'FOREST_ROUTES',
    'FROST_ROUTES',
    'MILL_ROUTES',
  ]);

  for (const key of roots) {
    walk(snapshot[key], key);
  }
}

function auditWorkshop(audit, snapshot) {
  audit.stats.workshopCatalogs += 1;
  const catalog = audit.record(snapshot.WORKSHOP_CATALOG, 'WORKSHOP_CATALOG');
  const root = 'WORKSHOP_CATALOG';
  const limit = WorkshopRuntime.WORKSHOP_LIMIT ?? 1e12;

  if (catalog.version !== 1) {
    audit.issue('unsupported-workshop-version', `${root}.version`, 'Expected catalog version 1.');
  }

  const pages = new Set(['production']);
  const customPages =
    catalog.pages === null || catalog.pages === undefined
      ? []
      : audit.array(catalog.pages, `${root}.pages`, 0, 16);
  audit.stats.workshopPages += pages.size + customPages.length;

  customPages.forEach((rawPage, index) => {
    const location = `${root}.pages[${index}]`;
    const page = audit.record(rawPage, location);
    audit.id(page.id, `${location}.id`, /^[a-z][a-z0-9-]{0,39}$/);
    if (pages.has(page.id) || page.id === 'research' || page.id === 'inventory') {
      audit.issue(
        'invalid-workshop-page-id',
        `${location}.id`,
        `Duplicate or reserved page ID ${describe(page.id)}.`,
      );
    }
    if (typeof page.id === 'string') {
      pages.add(page.id);
    }
  });

  const itemCollection = audit.indexArray(
    catalog.items,
    `${root}.items`,
    'workshopItems',
    1,
    250,
    /^[a-z][a-z0-9-]{0,79}$/,
  );
  const stationCollection = audit.indexArray(
    catalog.stations,
    `${root}.stations`,
    'workshopStations',
    0,
    250,
    /^[a-z][a-z0-9-]{0,79}$/,
  );
  const researchCollection = audit.indexArray(
    catalog.research,
    `${root}.research`,
    'workshopResearch',
    0,
    250,
    /^[a-z][a-z0-9-]{0,79}$/,
  );

  const items = itemCollection.index;
  const stations = stationCollection.index;
  const research = researchCollection.index;

  function researchMaximum(id) {
    const costs = research.get(id)?.costs;
    return Array.isArray(costs) ? costs.length : 0;
  }

  function itemQuantities(value, location, maximum = limit, nonempty = false) {
    return audit.quantities(value, items, location, 'workshop item', { maximum, nonempty });
  }

  function researchQuantities(value, location) {
    return audit.quantities(value, research, location, 'workshop research', {
      maximum: 100,
      maximumForId: researchMaximum,
    });
  }

  function position(entry, location) {
    if (entry.position === null || entry.position === undefined) {
      return;
    }
    const point = audit.record(entry.position, `${location}.position`);
    const board = WorkshopLayout.WORKSHOP_BOARD;
    let maximumX = Infinity;
    let maximumY = Infinity;

    if (board && typeof WorkshopLayout.workshopPosition === 'function') {
      const lastCell = WorkshopLayout.workshopPosition(board.maxColumns - 1, board.maxRows - 1);
      maximumX = lastCell.x;
      maximumY = lastCell.y;
    }

    audit.number(point.x, `${location}.position.x`, -20000, maximumX);
    audit.number(point.y, `${location}.position.y`, -20000, maximumY);
  }

  function visibility(entry, location) {
    const path = `${location}.visibility`;
    const rule = audit.record(entry.visibility, path);
    audit.stats.workshopVisibilityRules += 1;
    audit.enumeration(rule.mode, WORKSHOP_VISIBILITY_MODES, `${path}.mode`);
    audit.enumeration(rule.logic, ['and', 'or'], `${path}.logic`);
    audit.boolean(rule.permanent, `${path}.permanent`);
    itemQuantities(rule.items, `${path}.items`);
    researchQuantities(rule.research, `${path}.research`);
    audit.number(rule.core, `${path}.core`, 0, 100, true);

    audit.array(rule.rules, `${path}.rules`).forEach((mode, index) => {
      audit.enumeration(mode, WORKSHOP_VISIBILITY_RULES, `${path}.rules[${index}]`);
    });
  }

  function price(value, location) {
    const cost = audit.record(value, location);
    audit.stats.workshopConstructionCosts += 1;
    audit.optionalNumber(cost, 'gold', location, 0, limit);
    audit.optionalNumber(cost, 'ether', location, 0, limit);
    if (cost.materials !== null && cost.materials !== undefined) {
      itemQuantities(cost.materials, `${location}.materials`);
    }
  }

  function target(value, location) {
    const entry = audit.record(value, location);
    if (audit.enumeration(entry.type, ['item', 'station'], `${location}.type`)) {
      audit.reference(
        entry.id,
        entry.type === 'item' ? items : stations,
        `${location}.id`,
        `workshop ${entry.type}`,
      );
    }
    return entry;
  }

  audit.reference(catalog.researchKey, items, `${root}.researchKey`, 'workshop item');

  itemCollection.entries.forEach((item, index) => {
    if (!isRecord(item)) {
      return;
    }
    const location = `${root}.items[${index}]`;
    audit.reference(item.page ?? 'production', pages, `${location}.page`, 'workshop page');
    itemQuantities(item.inputs, `${location}.inputs`);
    audit.number(item.seconds, `${location}.seconds`, 0.5, 86400);
    audit.number(item.value, `${location}.value`, 1, limit);
    position(item, location);
    visibility(item, location);
  });

  stationCollection.entries.forEach((station, index) => {
    if (!isRecord(station)) {
      return;
    }
    const location = `${root}.stations[${index}]`;
    audit.reference(station.page ?? 'production', pages, `${location}.page`, 'workshop page');
    itemQuantities(station.outputs, `${location}.outputs`, 1000, true);
    itemQuantities(station.materials, `${location}.materials`);
    researchQuantities(station.requires, `${location}.requires`);
    itemQuantities(station.inputs ?? {}, `${location}.inputs`);
    audit.boolean(station.materialPrerequisite ?? false, `${location}.materialPrerequisite`);
    audit.number(station.price, `${location}.price`, 0, limit);
    audit.number(station.ether ?? 0, `${location}.ether`, 0, limit);

    for (const field of ['cycle', 'period']) {
      const duration = station[field] ?? 0;
      if (duration !== 0) {
        audit.number(duration, `${location}.${field}`, 0.5, 86400);
      } else {
        audit.number(duration, `${location}.${field}`, 0, 0);
      }
    }

    audit.number(station.max, `${location}.max`, 1, 1000, true);
    audit.number(station.initial ?? 0, `${location}.initial`, 0, station.max, true);
    audit.number(station.multiplier, `${location}.multiplier`, 0, 10);
    audit.number(station.exponentialAt, `${location}.exponentialAt`, 1, 1000);
    audit.number(station.exponential, `${location}.exponential`, 1, 3);

    const prerequisites = audit.array(station.stations, `${location}.stations`);
    prerequisites.forEach((stationId, dependencyIndex) => {
      audit.reference(
        stationId,
        stations,
        `${location}.stations[${dependencyIndex}]`,
        'workshop station',
      );
    });

    if (station.repeat !== null && station.repeat !== undefined) {
      price(station.repeat, `${location}.repeat`);
    }

    const construction = audit.record(station.construction ?? {}, `${location}.construction`);
    if (Number.isFinite(station.max) && Object.keys(construction).length > station.max) {
      audit.issue(
        'too-many-construction-costs',
        `${location}.construction`,
        'Construction cost entries exceed the station maximum.',
      );
    }

    for (const [owned, cost] of Object.entries(construction)) {
      const costLocation = `${location}.construction.${owned}`;
      if (
        !/^(0|[1-9]\d*)$/.test(owned) ||
        !Number.isSafeInteger(Number(owned)) ||
        (Number.isFinite(station.max) && Number(owned) >= station.max)
      ) {
        audit.issue(
          'invalid-construction-index',
          costLocation,
          'Construction index must be a nonnegative integer below the station maximum.',
        );
      }
      price(cost, costLocation);
    }

    position(station, location);
    visibility(station, location);
  });

  researchCollection.entries.forEach((tech, index) => {
    if (!isRecord(tech)) {
      return;
    }
    const location = `${root}.research[${index}]`;
    const costs = audit.array(tech.costs, `${location}.costs`, 1, 100);
    audit.stats.workshopResearchCosts += costs.length;
    costs.forEach((cost, costIndex) => {
      itemQuantities(cost, `${location}.costs[${costIndex}]`, limit, true);
    });

    researchQuantities(tech.requires, `${location}.requires`);
    audit.enumeration(tech.logic, ['and', 'or'], `${location}.logic`);
    if (tech.station) {
      audit.reference(tech.station, stations, `${location}.station`, 'workshop station');
    } else if (tech.station !== '' && tech.station !== null && tech.station !== undefined) {
      audit.issue(
        'invalid-research-station',
        `${location}.station`,
        'Research station must be a station ID or an empty string.',
      );
    }

    const effects = audit.array(tech.effects, `${location}.effects`);
    audit.stats.workshopEffects += effects.length;
    effects.forEach((rawEffect, effectIndex) => {
      const effectLocation = `${location}.effects[${effectIndex}]`;
      const effect = target(rawEffect, effectLocation);

      for (const field of ['speed', 'parallel']) {
        const modifierLocation = `${effectLocation}.${field}`;
        const modifier = audit.record(effect[field], modifierLocation);
        audit.stats.workshopModifiers += 1;
        audit.enumeration(modifier.mode, ['none', 'add', 'mul', 'pow'], `${modifierLocation}.mode`);
        audit.number(modifier.growth, `${modifierLocation}.growth`, 0, 10000);
        const levels = audit.record(modifier.levels, `${modifierLocation}.levels`);

        for (const [level, amount] of Object.entries(levels)) {
          const levelLocation = `${modifierLocation}.levels.${level}`;
          if (
            !/^[1-9]\d*$/.test(level) ||
            !Number.isSafeInteger(Number(level)) ||
            Number(level) > costs.length
          ) {
            audit.issue(
              'invalid-modifier-level',
              levelLocation,
              `Modifier level must be an integer from 1 through ${costs.length}.`,
            );
          }
          audit.number(amount, levelLocation, 0, 100000);
        }
      }
    });

    const unlocks = audit.array(tech.unlocks, `${location}.unlocks`);
    audit.stats.workshopUnlocks += unlocks.length;
    unlocks.forEach((rawUnlock, unlockIndex) => {
      const unlockLocation = `${location}.unlocks[${unlockIndex}]`;
      const unlock = target(rawUnlock, unlockLocation);
      audit.number(unlock.level, `${unlockLocation}.level`, 1, costs.length);
    });

    position(tech, location);
  });

  const core = audit.array(catalog.core, `${root}.core`, 0, 100);
  audit.stats.workshopCore += core.length;
  core.forEach((rawStep, index) => {
    const location = `${root}.core[${index}]`;
    const step = audit.record(rawStep, location);
    itemQuantities(step.materials, `${location}.materials`);
    itemQuantities(step.items, `${location}.items`);
    audit.number(step.price, `${location}.price`, 0, limit);
    audit.number(step.ether ?? 0, `${location}.ether`, 0, limit);
    audit.number(step.goldReward ?? 0, `${location}.goldReward`, 0, 999999999);
    audit.number(step.etherReward ?? 0, `${location}.etherReward`, 0, 999999999);
    audit.number(step.production, `${location}.production`, 0, 10000);
    audit.number(step.manual, `${location}.manual`, 0, 10000);

    const unlocks = audit.array(step.unlocks, `${location}.unlocks`);
    audit.stats.workshopUnlocks += unlocks.length;
    unlocks.forEach((itemId, unlockIndex) => {
      audit.reference(itemId, items, `${location}.unlocks[${unlockIndex}]`, 'workshop item');
    });
  });

  auditWorkshopCycles(audit, items, stations, research);
}

function auditWorkshopCycles(audit, items, stations, research) {
  const itemGraph = new Map();
  const stationGraph = new Map();
  const researchGroups = new Map();
  const combinedGroups = new Map();

  for (const [id, item] of items) {
    itemGraph.set(id, isRecord(item.inputs) ? Object.keys(item.inputs) : []);
  }
  reportCycles(audit, itemGraph, 'WORKSHOP_CATALOG.items.inputs');

  for (const [id, station] of stations) {
    const stationDependencies = Array.isArray(station.stations) ? station.stations : [];
    const researchDependencies = isRecord(station.requires) ? Object.keys(station.requires) : [];
    stationGraph.set(id, stationDependencies);
    combinedGroups.set(`station:${id}`, [
      {
        logic: 'and',
        dependencies: stationDependencies.map((dependency) => `station:${dependency}`),
      },
      {
        logic: 'and',
        dependencies: researchDependencies.map((dependency) => `research:${dependency}`),
      },
    ]);
  }
  reportCycles(audit, stationGraph, 'WORKSHOP_CATALOG.stations.stations');

  for (const [id, tech] of research) {
    const dependencies = isRecord(tech.requires) ? Object.keys(tech.requires) : [];
    const logic = tech.logic === 'or' ? 'or' : 'and';
    researchGroups.set(id, [{ logic, dependencies }]);

    const groups = [
      {
        logic,
        dependencies: dependencies.map((dependency) => `research:${dependency}`),
      },
    ];
    if (typeof tech.station === 'string' && tech.station) {
      groups.push({ logic: 'and', dependencies: [`station:${tech.station}`] });
    }
    combinedGroups.set(`research:${id}`, groups);
  }

  const pureResearch = collectMandatoryCycles(researchGroups);
  reportCycles(audit, pureResearch.graph, 'WORKSHOP_CATALOG.research.requires');

  const combined = collectMandatoryCycles(combinedGroups);
  reportCycles(
    audit,
    combined.graph,
    'WORKSHOP_CATALOG.station-research-dependencies',
    (component) => {
      return (
        component.some((id) => id.startsWith('station:')) &&
        component.some((id) => id.startsWith('research:'))
      );
    },
  );
}

export function auditRelationData(overrides = {}) {
  const audit = makeAudit();
  const supplied = isRecord(overrides) ? overrides : {};
  if (!isRecord(overrides)) {
    audit.issue(
      'invalid-overrides',
      'overrides',
      'Expected an object containing snapshot overrides.',
    );
  }

  const snapshot = makeSnapshot(supplied);
  const combat = auditCombat(audit, snapshot);
  const inventory = auditInventory(audit, snapshot, combat);
  const dining = auditDining(audit, snapshot);
  const world = auditWorld(audit, snapshot, combat);
  auditDrops(audit, snapshot, combat, inventory, dining);
  const emblems = auditEmblems(audit, snapshot, combat, world);

  auditContentReferences(audit, snapshot, {
    enemies: combat.enemyDefinitions,
    heroes: combat.heroes.index,
    items: inventory.items,
    gems: inventory.gems,
    skills: inventory.skills,
    ingredients: dining.ingredients,
    dishes: dining.dishes,
    foods: dining.foods,
    emblems,
  });

  auditWorkshop(audit, snapshot);
  return audit.finish();
}

export function auditRelations() {
  return auditRelationData();
}
