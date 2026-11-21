import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { auditRepository } from './topology/audit.js';
import { inspectSource } from './topology/source.js';
import { auditGraph } from './topology/routes.js';
import { auditRelationData, collectDependencyCycles } from './topology/relations.js';
import { auditRewardPool } from './topology/relations-rewards.js';
import { ITEMS } from '../src/content/items.js';

const report = await auditRepository();

function hasCode(issues, code) {
  return issues.some((issue) => issue.code === code);
}

async function enumerateContentFiles(directory) {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const entry of entries) {
    const absolute = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await enumerateContentFiles(absolute)));
    } else if (entry.isFile() && /\.(js|json)$/i.test(entry.name)) {
      files.push(absolute);
    }
  }
  return files;
}

test('audit report matches the registered known-findings snapshot', async () => {
  const outputUrl = new URL('../.runtime/tests/topology/audit.json', import.meta.url);
  await mkdir(new URL('.', outputUrl), { recursive: true });
  await writeFile(outputUrl, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  const knownUrl = new URL('./topology/known-findings.json', import.meta.url);
  const known = JSON.parse(await readFile(knownUrl, 'utf8'));

  assert.deepEqual(
    report.issues,
    known,
    'This is a regression snapshot of existing findings, not a zero-defect guarantee. Do not update it automatically.',
  );
});

test('every src/content file is covered by source coverage', async () => {
  const contentRoot = new URL('../src/content', import.meta.url);
  const absoluteFiles = await enumerateContentFiles(fileURLToPath(contentRoot));
  const expected = absoluteFiles
    .map((file) => {
      const marker = '/src/content/';
      const index = file.replaceAll('\\', '/').indexOf(marker);
      return file.replaceAll('\\', '/').slice(index + 1);
    })
    .sort();

  const covered = report.sections.source.coverage
    .map((entry) => entry.file)
    .filter((file) => file.startsWith('src/content/'))
    .sort();

  assert.deepEqual(covered, expected);
});

test('content schema coverage matches the registered snapshot', async () => {
  const actual = report.sections.source.coverage
    .filter((entry) => entry.file.startsWith('src/content/'))
    .map(({ file, exports, fieldKeys, unresolved }) => ({
      file,
      exports,
      fieldKeys,
      unresolved,
    }));

  const schemaUrl = new URL('./topology/content-schema.json', import.meta.url);
  const expected = JSON.parse(await readFile(schemaUrl, 'utf8'));

  assert.deepEqual(
    actual,
    expected,
    'New content patterns require added rules and a reviewed snapshot update.',
  );
});

test('repeated audit runs are deterministic', async () => {
  const second = await auditRepository();
  assert.deepEqual(second, report);
});

test('no registry construction may silently lose its source keys', () => {
  const gaps = report.sections.source.coverage.flatMap((entry) =>
    entry.unresolved.filter((site) => /Registry entr/i.test(site.detail)),
  );
  assert.deepEqual(gaps, [], 'Registry keys must be resolved before duplicate detection.');
});

test('runtime orphan candidates match the reviewed inventory', async () => {
  const saved = JSON.parse(
    await readFile(new URL('./topology/orphan-assets.json', import.meta.url), 'utf8'),
  );
  assert.deepEqual(report.sections.assets.orphans, saved);
});

test('inspectSource reports DUPLICATE_OBJECT_KEY for repeated literal keys', () => {
  const result = inspectSource('export const x={a:1,a:2};');
  assert.ok(hasCode(result.issues, 'DUPLICATE_OBJECT_KEY'));
});

test('inspectSource reports DUPLICATE_OBJECT_KEY for repeated computed keys', () => {
  const result = inspectSource("export const x={['a']:1,['a']:2};");
  assert.ok(hasCode(result.issues, 'DUPLICATE_OBJECT_KEY'));
});

test('inspectSource does not report a getter/setter pair as duplicate', () => {
  const result = inspectSource('export const x={get a(){return 1},set a(v){void v}};');
  assert.ok(!hasCode(result.issues, 'DUPLICATE_OBJECT_KEY'));
});

test('inspectSource reports DUPLICATE_REGISTRY_KEY for repeated fromEntries keys', () => {
  const result = inspectSource("export const x=Object.fromEntries([['x',1],['x',2]]);");
  assert.ok(hasCode(result.issues, 'DUPLICATE_REGISTRY_KEY'));
});

test('inspectSource reports DUPLICATE_REGISTRY_KEY for repeated registry spreads', () => {
  const result = inspectSource("const a={x:{id:'x'}}; export const r={...a,...a};");
  assert.ok(hasCode(result.issues, 'DUPLICATE_REGISTRY_KEY'));
});

test('auditGraph returns no issues for a two-node cycle', () => {
  const issues = auditGraph({
    nodes: ['a', 'b'],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ],
    root: 'a',
  });
  assert.deepEqual(issues, []);
});

test('auditGraph reports disconnected-node for an isolated node', () => {
  const issues = auditGraph({
    nodes: ['a', 'b', 'c'],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'a' },
    ],
    root: 'a',
  });
  assert.ok(hasCode(issues, 'disconnected-node'));
});

test('auditGraph reports directed-no-return when requireReverse is false', () => {
  const issues = auditGraph({
    nodes: ['a', 'b'],
    edges: [{ from: 'a', to: 'b' }],
    root: 'a',
    requireReverse: false,
  });
  assert.ok(hasCode(issues, 'directed-no-return'));
});

test('auditGraph reports reverse-adjacency-mismatch by default', () => {
  const issues = auditGraph({
    nodes: ['a', 'b'],
    edges: [{ from: 'a', to: 'b' }],
    root: 'a',
  });
  assert.ok(hasCode(issues, 'reverse-adjacency-mismatch'));
});

test('auditGraph reports invalid-coordinate for NaN point', () => {
  const issues = auditGraph({
    nodes: [{ id: 'a', point: [NaN, 1] }],
    root: 'a',
  });
  assert.ok(hasCode(issues, 'invalid-coordinate'));
});

test('auditGraph reports missing-target for an unknown edge target', () => {
  const issues = auditGraph({
    nodes: ['a'],
    edges: [{ from: 'a', to: 'missing' }],
    root: 'a',
  });
  assert.ok(hasCode(issues, 'missing-target'));
});

test('auditGraph reports duplicate-node for repeated node ids', () => {
  const issues = auditGraph({
    nodes: ['a', 'a'],
    root: 'a',
  });
  assert.ok(hasCode(issues, 'duplicate-node'));
});

test('auditRelationData reports number-out-of-range for a negative price', () => {
  const firstId = Object.keys(ITEMS)[0];
  const result = auditRelationData({
    ITEMS: {
      ...ITEMS,
      [firstId]: { ...ITEMS[firstId], price: -1 },
    },
  });
  assert.ok(hasCode(result.issues, 'number-out-of-range'));
});

test('collectDependencyCycles returns a non-empty array for a two-node cycle', () => {
  const cycles = collectDependencyCycles(
    new Map([
      ['a', ['b']],
      ['b', ['a']],
    ]),
  );
  assert.ok(Array.isArray(cycles));
  assert.ok(cycles.length > 0);
});

test('auditRewardPool accepts a valid gold interval entry', () => {
  const result = auditRewardPool([{ id: 'r', weight: 1, gold: [1, 2] }], {
    itemIds: ['item'],
    gemIds: ['gem'],
    skillIds: ['skill'],
    emblemIds: ['emblem'],
  });
  assert.deepEqual(result.issues, []);
});

test('auditRewardPool reports duplicate-id for repeated valid entries', () => {
  const result = auditRewardPool(
    [
      { id: 'r', weight: 1, gold: [1, 2] },
      { id: 'r', weight: 1, gold: [1, 2] },
    ],
    {
      itemIds: ['item'],
      gemIds: ['gem'],
      skillIds: ['skill'],
      emblemIds: ['emblem'],
    },
  );
  assert.ok(hasCode(result.issues, 'duplicate-id'));
});

test('auditRewardPool reports empty-reward for an entry with no grants', () => {
  const result = auditRewardPool([{ id: 'r', weight: 1 }], {
    itemIds: ['item'],
    gemIds: ['gem'],
    skillIds: ['skill'],
    emblemIds: ['emblem'],
  });
  assert.ok(hasCode(result.issues, 'empty-reward'));
});

test('auditRewardPool reports invalid-interval for a reversed gold interval', () => {
  const result = auditRewardPool([{ id: 'r', weight: 1, gold: [3, 1] }], {
    itemIds: ['item'],
    gemIds: ['gem'],
    skillIds: ['skill'],
    emblemIds: ['emblem'],
  });
  assert.ok(hasCode(result.issues, 'invalid-interval'));
});

test('auditRewardPool reports invalid-weight for a negative weight', () => {
  const result = auditRewardPool([{ id: 'r', weight: -1, gold: [1, 2] }], {
    itemIds: ['item'],
    gemIds: ['gem'],
    skillIds: ['skill'],
    emblemIds: ['emblem'],
  });
  assert.ok(hasCode(result.issues, 'invalid-weight'));
});

test('auditRewardPool reports unknown-item even when a positive grant exists', () => {
  const result = auditRewardPool([{ id: 'r', weight: 1, gold: [1, 2], items: { missing: 1 } }], {
    itemIds: ['item'],
    gemIds: ['gem'],
    skillIds: ['skill'],
    emblemIds: ['emblem'],
  });
  assert.ok(hasCode(result.issues, 'unknown-item'));
});

test('auditRewardPool reports unknown-skill even when a positive grant exists', () => {
  const result = auditRewardPool([{ id: 'r', weight: 1, gold: [1, 2], skillIds: ['missing'] }], {
    itemIds: ['item'],
    gemIds: ['gem'],
    skillIds: ['skill'],
    emblemIds: ['emblem'],
  });
  assert.ok(hasCode(result.issues, 'unknown-skill'));
});

test('auditRewardPool reports unknown-emblem even when a positive grant exists', () => {
  const result = auditRewardPool([{ id: 'r', weight: 1, gold: [1, 2], emblemIds: ['missing'] }], {
    itemIds: ['item'],
    gemIds: ['gem'],
    skillIds: ['skill'],
    emblemIds: ['emblem'],
  });
  assert.ok(hasCode(result.issues, 'unknown-emblem'));
});

test('auditRewardPool reports unknown-gem for an unknown gem reference', () => {
  const result = auditRewardPool([{ id: 'r', weight: 1, gems: [{ gemId: 'missing', count: 1 }] }], {
    itemIds: ['item'],
    gemIds: ['gem'],
    skillIds: ['skill'],
    emblemIds: ['emblem'],
  });
  assert.ok(hasCode(result.issues, 'unknown-gem'));
});
