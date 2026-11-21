import { REGIONS } from './content/regions.js';
import { DEFINITIONS } from './data.js';
import { quickTestOverlordsEnabled } from './generation-options.js';

function isOverlordBoss(bossId) {
  return Boolean(bossId && DEFINITIONS[bossId]?.overlord === true);
}

function authoredOverlordCandidate(region) {
  if (!region) return null;
  const nodes = Array.isArray(region.nodes) ? region.nodes : [];
  if (nodes.length) {
    return nodes.find((node) => node.overlord === true || isOverlordBoss(node.boss)) || null;
  }
  const hooks = Array.isArray(region.taskHooks) ? region.taskHooks : [];
  return hooks.find((hook) => hook.overlord === true || isOverlordBoss(hook.boss)) || null;
}

export function quickTestOverlordMaps() {
  return Object.keys(REGIONS).filter((map) => Boolean(authoredOverlordCandidate(REGIONS[map])));
}

function isWorldEntry(entry) {
  return Boolean(entry && entry.world);
}

function deriveSeed(rootSeed, index) {
  return (Math.imul(rootSeed >>> 0, 1664525) + (index + 1) * 7919 + 1013904223) >>> 0;
}

function projectTaskHooks(entries, map, region, candidate) {
  const hooks = Array.isArray(region.taskHooks) ? region.taskHooks : [];
  const root = entries.find((entry) => !isWorldEntry(entry) && !entry.endless) || null;
  if (!root) return null;
  const rootSeed = Number.isInteger(root.seed) ? root.seed : 17371;
  const projected = [];
  let previousId = null;
  for (let index = 0; index < hooks.length; index++) {
    const hook = hooks[index];
    const existing = entries.find(
      (entry) => !isWorldEntry(entry) && !entry.endless && entry.sequence === index,
    );
    if (existing) {
      const copy = {
        ...existing,
        sequence: index,
        site: index,
        step: index,
        depth: index,
        label: String(index + 1),
        boss: hook.boss,
        taskHookId: hook.id,
        authored: false,
        endless: false,
        tutorial: false,
        parentId: previousId,
      };
      if (Number.isInteger(hook.levelOffset)) copy.levelOffset = hook.levelOffset;
      else delete copy.levelOffset;
      projected.push(copy);
      previousId = copy.id;
      continue;
    }
    const template = entries.find((entry) => !isWorldEntry(entry) && !entry.endless) || root;
    const seed = deriveSeed(rootSeed, index);
    const synthetic = {
      ...template,
      id: `${map}-quick-preview-${index}-${seed}`,
      map,
      nodeId: null,
      sequence: index,
      site: index,
      step: index,
      depth: index,
      label: String(index + 1),
      boss: hook.boss,
      taskHookId: hook.id,
      authored: false,
      endless: false,
      tutorial: false,
      locked: true,
      seed,
      parentId: previousId,
    };
    delete synthetic.level;
    if (Number.isInteger(hook.levelOffset)) synthetic.levelOffset = hook.levelOffset;
    else delete synthetic.levelOffset;
    projected.push(synthetic);
    previousId = synthetic.id;
  }
  const endlessEntries = entries.filter(
    (entry) => !isWorldEntry(entry) && (entry.endless || entry.sequence >= hooks.length),
  );
  return { projected, endlessEntries, candidate };
}

function swapAuthoredRoles(entries, map, candidate) {
  const root = entries.find((entry) => !isWorldEntry(entry) && !entry.endless) || null;
  if (!root) return null;
  const candidateEntry = entries.find(
    (entry) =>
      !isWorldEntry(entry) && (entry.nodeId === candidate.id || entry.taskHookId === candidate.id),
  );
  if (!candidateEntry) return null;
  const quickRootId = `${map}-quick-test-${candidate.boss}`;
  const originalRootId = root.id;
  const candidateIsRoot = candidateEntry.id === root.id;

  const quickRoot = {
    ...candidateEntry,
    id: quickRootId,
    nodeId: candidateEntry.nodeId,
    label: '1',
    step: 0,
    depth: 0,
    parentId: null,
    branch: false,
    quickTestBoss: true,
    overlord: true,
    locked: false,
    tutorial: false,
    pos: root.pos,
  };

  const displaced = {
    ...root,
    id: candidateEntry.id,
    nodeId: root.nodeId,
    label: candidateEntry.label,
    step: candidateEntry.step,
    depth: candidateEntry.depth,
    pos: candidateEntry.pos,
    quickTestDisplaced: true,
    tutorial: false,
    locked: candidateEntry.locked,
    parentId: candidateEntry.parentId === originalRootId ? quickRootId : candidateEntry.parentId,
  };

  const result = [];
  for (const entry of entries) {
    if (entry === root) {
      result.push(quickRoot);
      continue;
    }
    if (entry === candidateEntry) {
      if (!candidateIsRoot) result.push(displaced);
      continue;
    }
    if (entry.parentId === originalRootId) {
      result.push({ ...entry, parentId: quickRootId });
      continue;
    }
    result.push(entry);
  }
  return result;
}

export function quickTestOverlordPreview(entries, map, options = {}) {
  if (!quickTestOverlordsEnabled(options)) return entries;
  if (!Array.isArray(entries) || entries.length === 0) return entries;
  if (entries.some(isWorldEntry)) return entries;
  const region = REGIONS[map];
  const candidate = authoredOverlordCandidate(region);
  if (!candidate) return entries;

  const nodes = Array.isArray(region.nodes) ? region.nodes : [];
  if (nodes.length) {
    const swapped = swapAuthoredRoles(entries, map, candidate);
    return swapped || entries;
  }

  const projection = projectTaskHooks(entries, map, region, candidate);
  if (!projection) return entries;
  const swapped = swapAuthoredRoles(projection.projected, map, candidate);
  if (!swapped) return entries;
  return [...swapped, ...projection.endlessEntries];
}
