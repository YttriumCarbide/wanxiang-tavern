import test from 'node:test';
import assert from 'node:assert/strict';

import { REGIONS } from '../src/content/regions.js';
import { auditRelationData } from './topology/relations.js';

function cloneRegions() {
  return structuredClone(REGIONS);
}

function findNode(nodes, id) {
  const index = nodes.findIndex((node) => node && node.id === id);
  assert.notEqual(index, -1, `expected region node ${id} to exist`);
  return { index, node: nodes[index] };
}

function findIssue(issues, code, location) {
  return issues.find((issue) => issue.code === code && issue.location === location);
}

function cycleLocation(ids) {
  return `REGIONS.ruins.nodes.parentId[${[...ids].sort().join(',')}]`;
}

test('missing parentId produces unknown-reference at the parentId path', () => {
  const regions = cloneRegions();
  const nodes = regions.ruins.nodes;
  const { index, node } = findNode(nodes, 'ruins-2-corridor');
  const missingId = 'ruins-missing-parent';
  node.parentId = missingId;

  const result = auditRelationData({ REGIONS: regions });
  const location = `REGIONS.ruins.nodes[${index}].parentId`;
  const issue = findIssue(result.issues, 'unknown-reference', location);

  assert.ok(issue, `expected unknown-reference issue at ${location}`);
  assert.match(String(issue.detail), new RegExp(missingId));
});

test('self parent produces a dependency-cycle issue and increments stats', () => {
  const regions = cloneRegions();
  const nodes = regions.ruins.nodes;
  const { node } = findNode(nodes, 'ruins-a-hall');
  node.parentId = node.id;

  const result = auditRelationData({ REGIONS: regions });
  const issue = findIssue(result.issues, 'dependency-cycle', cycleLocation([node.id]));

  assert.ok(issue, 'expected dependency-cycle issue');
  assert.match(String(issue.detail), new RegExp(node.id));
  assert.ok(result.stats.dependencyCycles > 0);
});

test('two-node chain cycle is detected', () => {
  const regions = cloneRegions();
  const nodes = regions.ruins.nodes;
  const entrance = findNode(nodes, 'ruins-1-entrance').node;
  const corridor = findNode(nodes, 'ruins-2-corridor').node;

  entrance.parentId = corridor.id;
  corridor.parentId = entrance.id;

  const result = auditRelationData({ REGIONS: regions });
  const issue = findIssue(
    result.issues,
    'dependency-cycle',
    cycleLocation([entrance.id, corridor.id]),
  );

  assert.ok(issue, 'expected dependency-cycle issue');
  assert.match(String(issue.detail), new RegExp(entrance.id));
  assert.match(String(issue.detail), new RegExp(corridor.id));
  assert.ok(result.stats.dependencyCycles > 0);
});

test('three-node chain cycle is detected with component details', () => {
  const regions = cloneRegions();
  const nodes = regions.ruins.nodes;
  const root = findNode(nodes, 'ruins-1-entrance').node;
  const corridor = findNode(nodes, 'ruins-2-corridor').node;
  const hall = findNode(nodes, 'ruins-a-hall').node;

  root.parentId = hall.id;
  corridor.parentId = root.id;
  hall.parentId = corridor.id;

  const result = auditRelationData({ REGIONS: regions });
  const issue = findIssue(
    result.issues,
    'dependency-cycle',
    cycleLocation([root.id, corridor.id, hall.id]),
  );

  assert.ok(issue, 'expected dependency-cycle issue');
  assert.match(String(issue.detail), new RegExp(root.id));
  assert.match(String(issue.detail), new RegExp(corridor.id));
  assert.match(String(issue.detail), new RegExp(hall.id));
  assert.ok(result.stats.dependencyCycles > 0);
});

test('nullable or undefined root parentId is valid', () => {
  const nullRegions = cloneRegions();
  const nullRoot = findNode(nullRegions.ruins.nodes, 'ruins-1-entrance').node;
  nullRoot.parentId = null;

  const nullResult = auditRelationData({ REGIONS: nullRegions });
  assert.deepEqual(nullResult.issues, []);

  const undefinedRegions = cloneRegions();
  const undefinedRoot = findNode(undefinedRegions.ruins.nodes, 'ruins-1-entrance').node;
  delete undefinedRoot.parentId;

  const undefinedResult = auditRelationData({ REGIONS: undefinedRegions });
  assert.deepEqual(undefinedResult.issues, []);
});
