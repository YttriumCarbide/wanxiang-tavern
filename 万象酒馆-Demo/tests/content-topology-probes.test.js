import test from 'node:test';
import assert from 'node:assert/strict';

import { auditGraph, partitionLegacyRoadGraph } from './topology/routes.js';
import { inspectSource } from './topology/source.js';
import { auditRelationData } from './topology/relations.js';
import { findAssetReferences, validateAssetReferences } from './topology/assets.js';
import { auditGuildData } from './topology/relations-guild.js';
import { auditRewardPool, auditEventRewardConsumer } from './topology/relations-rewards.js';
import { ENCOUNTERS } from '../src/data.js';
import { LEARNABLE_SKILLS } from '../src/content/learnable-skills.js';
import { WORKSHOP_CATALOG } from '../src/content/workshop-catalog.js';

test('JSON object keys are checked before JSON.parse can overwrite them', () => {
  const result = inspectSource('{"same":1,"same":2}', 'fixture.json');
  assert.ok(result.issues.some((entry) => entry.code === 'DUPLICATE_OBJECT_KEY'));
});

test('asset constructor rules do not approve an unrelated same-spelling function', () => {
  const result = findAssetReferences('export function rogue(art){return `${art}.glb`;}', {
    file: 'src/content/common-adversaries.js',
  });
  assert.ok(result.dynamic.some((entry) => entry.status === 'unresolved'));
});

test('module-relative image URL constructors remain visible to the asset validator', () => {
  const result = findAssetReferences("const image = new URL('./missing.png', import.meta.url);", {
    file: 'src/content/fixture.js',
  });
  const issues = validateAssetReferences(result.references, []);
  assert.ok(issues.some((entry) => entry.code === 'asset.missing'));
});

test('HTML local path constructors require a closed domain', () => {
  const result = findAssetReferences('const html = `<img src="./${name}.png">`;', {
    file: 'src/app/fixture.js',
  });
  assert.ok(result.dynamic.some((entry) => entry.status === 'unresolved'));
});

test('AST detects duplicate registry keys from constructor calls with repeated ids', () => {
  const source = [
    'function item(id){return Object.freeze({id});}',
    "export const rows=Object.fromEntries([item('same'),item('same')].map(x=>[x.id,x]));",
  ].join('\n');

  const result = inspectSource(source);
  const codes = result.issues.map((issue) => issue.code);

  assert.ok(
    codes.includes('DUPLICATE_REGISTRY_KEY'),
    `expected DUPLICATE_REGISTRY_KEY, got ${JSON.stringify(codes)}`,
  );
});

test('AST detects duplicate registry keys from destructured map entries', () => {
  const source = [
    "const rows=[['same',1],['same',2]];",
    'export const index=Object.fromEntries(rows.map(([id,value])=>[id,value]));',
  ].join('\n');

  const result = inspectSource(source);
  const codes = result.issues.map((issue) => issue.code);

  assert.ok(
    codes.includes('DUPLICATE_REGISTRY_KEY'),
    `expected DUPLICATE_REGISTRY_KEY, got ${JSON.stringify(codes)}`,
  );
});

test('coverage exposes unresolved gaps for unsupported call expressions', () => {
  const result = inspectSource('export const DATA=unknownBuild();');

  assert.ok(Array.isArray(result.coverage), 'coverage must be an array');
  assert.ok(
    result.coverage.some((entry) => Array.isArray(entry.unresolved) && entry.unresolved.length > 0),
    `expected an unresolved coverage entry, got ${JSON.stringify(result.coverage)}`,
  );
});

test('coverage exposes unresolved gaps for unsupported spread expressions', () => {
  const result = inspectSource('export const DATA=[...unknownBuild()];');

  assert.ok(Array.isArray(result.coverage), 'coverage must be an array');
  assert.ok(
    result.coverage.some((entry) => Array.isArray(entry.unresolved) && entry.unresolved.length > 0),
    `expected an unresolved coverage entry, got ${JSON.stringify(result.coverage)}`,
  );
});

test('relation audit reports unknown enemy references in encounters', () => {
  const encounters = structuredClone(ENCOUNTERS);
  encounters[0].enemyIds = ['__missing-enemy__'];

  const result = auditRelationData({ ENCOUNTERS: encounters });
  const codes = result.issues.map((issue) => issue.code);

  assert.ok(
    codes.includes('unknown-reference'),
    `expected unknown-reference, got ${JSON.stringify(codes)}`,
  );
});

test('relation audit reports duplicate learnable skill ids', () => {
  const skills = structuredClone(LEARNABLE_SKILLS);
  skills.push(structuredClone(skills[0]));

  const result = auditRelationData({ LEARNABLE_SKILLS: skills });
  const codes = result.issues.map((issue) => issue.code);

  assert.ok(codes.includes('duplicate-id'), `expected duplicate-id, got ${JSON.stringify(codes)}`);
});

test('relation audit reports dependency cycles in workshop catalog', () => {
  const catalog = structuredClone(WORKSHOP_CATALOG);
  const [a, b, c] = catalog.research.slice(0, 3);

  a.station = '';
  b.station = '';
  c.station = '';

  a.requires = { [b.id]: 1 };
  b.requires = { [a.id]: 1 };
  a.logic = 'and';
  b.logic = 'and';

  const result = auditRelationData({ WORKSHOP_CATALOG: catalog });
  const codes = result.issues.map((issue) => issue.code);

  assert.ok(
    codes.includes('dependency-cycle'),
    `expected dependency-cycle, got ${JSON.stringify(codes)}`,
  );
});

test('relation audit does not report a cycle when an OR dependency provides an escape', () => {
  const catalog = structuredClone(WORKSHOP_CATALOG);
  const [a, b, c] = catalog.research.slice(0, 3);

  a.station = '';
  b.station = '';
  c.station = '';

  a.requires = { [b.id]: 1, [c.id]: 1 };
  a.logic = 'or';
  b.requires = { [a.id]: 1 };
  b.logic = 'and';
  c.requires = {};
  c.logic = 'and';

  const result = auditRelationData({ WORKSHOP_CATALOG: catalog });
  const codes = result.issues.map((issue) => issue.code);

  assert.ok(
    !codes.includes('dependency-cycle'),
    `expected no dependency-cycle, got ${JSON.stringify(codes)}`,
  );
});

test('asset references extract relative runtime paths and validate against inventory', () => {
  const result = findAssetReferences('const url="./assets/a.png";', {
    file: 'src/fixture.js',
  });

  const paths = result.references.map((reference) => reference.path);
  assert.ok(paths.includes('assets/a.png'), `expected assets/a.png, got ${JSON.stringify(paths)}`);

  const validation = validateAssetReferences(result.references, ['assets/a.png']);
  assert.deepEqual(validation, []);
});

test('asset validation reports missing files', () => {
  const result = findAssetReferences('const url="./assets/a.png";', {
    file: 'src/fixture.js',
  });

  const validation = validateAssetReferences(result.references, []);
  const codes = validation.map((issue) => issue.code);

  assert.ok(
    codes.includes('asset.missing'),
    `expected asset.missing, got ${JSON.stringify(codes)}`,
  );
});

test('asset validation reports case mismatches for Linux-sensitive paths', () => {
  const result = findAssetReferences('const url="./assets/a.png";', {
    file: 'src/fixture.js',
  });

  const validation = validateAssetReferences(result.references, ['assets/A.png']);
  const codes = validation.map((issue) => issue.code);

  assert.ok(
    codes.includes('asset.case-mismatch'),
    `expected asset.case-mismatch, got ${JSON.stringify(codes)}`,
  );
});

test('asset references decode percent-encoded path segments and ignore query and hash', () => {
  const result = findAssetReferences('const url="./assets/a%2Dimage.png?v=1#id";');

  const paths = result.references.map((reference) => reference.path);
  assert.ok(
    paths.includes('assets/a-image.png'),
    `expected assets/a-image.png, got ${JSON.stringify(paths)}`,
  );

  const validation = validateAssetReferences(result.references, ['assets/a-image.png']);
  assert.deepEqual(validation, []);
});

test('asset validation reports traversal outside the project root', () => {
  const validation = validateAssetReferences(
    [
      {
        path: './assets/../../outside.png',
        location: 'fixture.js:1',
        kind: 'runtime',
      },
    ],
    [],
  );

  const codes = validation.map((issue) => issue.code);
  assert.ok(
    codes.includes('asset.traversal'),
    `expected asset.traversal, got ${JSON.stringify(codes)}`,
  );
});

test('asset references expose unresolved dynamic template paths', () => {
  const result = findAssetReferences('const url=`./assets/${unknownId}.png`;');

  const dynamic = result.dynamic.filter((reference) => reference.status === 'unresolved');

  assert.ok(
    dynamic.length > 0,
    `expected an unresolved dynamic reference, got ${JSON.stringify(result.dynamic)}`,
  );
});

test('asset references extract CSS url() paths relative to the stylesheet', () => {
  const result = findAssetReferences('.x { background: url(../assets/a.png); }', {
    file: 'styles/fixture.css',
  });

  const paths = result.references.map((reference) => reference.path);
  assert.ok(paths.includes('assets/a.png'), `expected assets/a.png, got ${JSON.stringify(paths)}`);
});

test('asset references extract HTML src paths relative to the document', () => {
  const result = findAssetReferences('<img src="./assets/a.png">', {
    file: 'index.html',
  });

  const paths = result.references.map((reference) => reference.path);
  assert.ok(paths.includes('assets/a.png'), `expected assets/a.png, got ${JSON.stringify(paths)}`);
});

test('guild audit still detects invalid trial enemies after supplies are retired', () => {
  const result = auditGuildData({
    GUILD_TRIALS: [{ id: 'bad-trial', enemyIds: ['missing-enemy'] }],
  });
  assert.ok(result.issues.some(({ code }) => code === 'unknown-enemy'));
});

test('event reward consumer reports unsupported fields and empty reward', () => {
  const result = auditEventRewardConsumer([
    { id: 'r', weight: 1, gems: [{ gemId: 'known', count: 1 }] },
  ]);
  const codes = result.map((issue) => issue.code);

  assert.ok(
    codes.includes('unsupported-consumer-field'),
    `expected unsupported-consumer-field, got ${JSON.stringify(codes)}`,
  );
  assert.ok(
    codes.includes('consumer-empty-reward'),
    `expected consumer-empty-reward, got ${JSON.stringify(codes)}`,
  );
});

test('event reward consumer keeps unsupported field issue without empty reward when positive reward exists', () => {
  const result = auditEventRewardConsumer([
    { id: 'r', weight: 1, gems: [{ gemId: 'known', count: 1 }], gold: [1, 2] },
  ]);
  const codes = result.map((issue) => issue.code);

  assert.ok(
    codes.includes('unsupported-consumer-field'),
    `expected unsupported-consumer-field, got ${JSON.stringify(codes)}`,
  );
  assert.ok(
    !codes.includes('consumer-empty-reward'),
    `expected no consumer-empty-reward, got ${JSON.stringify(codes)}`,
  );
});

test('reward pool audit reports invalid gem counts', () => {
  const result = auditRewardPool([{ id: 'r', weight: 1, gems: [{ gemId: 'known', count: -1 }] }], {
    gemIds: ['known'],
  });
  const codes = result.issues.map((issue) => issue.code);

  assert.ok(
    codes.includes('invalid-gem-count'),
    `expected invalid-gem-count, got ${JSON.stringify(codes)}`,
  );
});

test('a new isolated road stage stays current and fails the topology audit', () => {
  const isolated = 'road-new-stage';
  const localEdges = [
    { from: 'hub', to: 'market' },
    { from: 'market', to: 'hub' },
  ];
  const { recoveryScenes, currentSceneIds, currentEdges } = partitionLegacyRoadGraph({
    roadIds: [isolated],
    sceneIds: ['hub', 'market', isolated],
    localEdges,
    edges: localEdges,
  });

  assert.deepEqual(recoveryScenes, []);
  assert.deepEqual(currentSceneIds, ['hub', 'market', isolated]);
  const issues = auditGraph({ nodes: currentSceneIds, edges: currentEdges, root: 'hub' });
  assert.ok(issues.some(({ code }) => code === 'disconnected-node'));
});

test('only the seven reviewed road stages qualify for recovery', () => {
  const legacyIds = [
    'road-meadow',
    'road-pines',
    'road-orchard',
    'road-ridge',
    'road-downs',
    'road-aqueduct',
    'road-causeway',
  ];
  const unknown = 'road-eighth-stage';
  const roadIds = [...legacyIds, unknown];

  assert.deepEqual(partitionLegacyRoadGraph({ roadIds, sceneIds: roadIds }), {
    recoveryScenes: legacyIds,
    currentSceneIds: [unknown],
    currentEdges: [],
  });
});

test('an incoming local edge promotes a reviewed legacy stage', () => {
  const legacy = 'road-meadow';
  const edges = [
    { from: 'hub', to: legacy },
    { from: legacy, to: 'hub' },
  ];

  assert.deepEqual(
    partitionLegacyRoadGraph({
      roadIds: [legacy],
      sceneIds: ['hub', legacy],
      localEdges: [edges[0]],
      edges,
    }),
    { recoveryScenes: [], currentSceneIds: ['hub', legacy], currentEdges: edges },
  );
});

test('a current transport stop promotes a reviewed legacy stage', () => {
  const legacy = 'road-causeway';
  const edges = [{ from: legacy, to: 'hub' }];

  assert.deepEqual(
    partitionLegacyRoadGraph({
      roadIds: [legacy],
      stopIds: [legacy],
      sceneIds: ['hub', legacy],
      edges,
    }),
    { recoveryScenes: [], currentSceneIds: ['hub', legacy], currentEdges: edges },
  );
});

test('partitioning leaves all input arrays and edge records unchanged', () => {
  const input = {
    roadIds: ['road-meadow', 'road-pines'],
    stopIds: ['road-pines'],
    sceneIds: ['road-meadow', 'road-pines', 'hub'],
    localEdges: [{ from: 'road-pines', to: 'hub' }],
    edges: [
      { from: 'road-meadow', to: 'hub' },
      { from: 'road-pines', to: 'hub' },
    ],
  };
  const before = structuredClone(input);

  partitionLegacyRoadGraph(input);

  assert.deepEqual(input, before);
});
