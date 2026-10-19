import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseTestPlan, loadTestPlan } from '../tools/testing/plan.mjs';
import { runBatch } from '../tools/testing/batch.mjs';

test('one checklist deduplicates scopes and selects only named core files', () => {
  const plan = parseTestPlan({
    scopes: ['quality', 'ui', 'ui'],
    coreFiles: ['tests/test-runner.test.js'],
  });
  assert.deepEqual([...plan.scopes], ['quality', 'ui', 'layout']);
  assert.deepEqual(plan.coreFiles, ['tests/test-runner.test.js']);
  assert.equal(plan.browserConcurrency, 2);
  assert.throws(() => parseTestPlan({ scopes: ['missing'] }), /Unknown scope/);
  assert.throws(
    () => parseTestPlan({ scopes: ['core'], coreFiles: ['../private.js'] }),
    /coreFiles/,
  );
  assert.throws(() => parseTestPlan({ scopes: ['core'], browserConcurrency: 20 }), /并行/);
});

test('independent jobs start together, dependencies wait, and a failure does not stop the batch', async () => {
  const first = Promise.withResolvers();
  const second = Promise.withResolvers();
  const started = [];
  const batch = runBatch(
    [
      {
        name: 'first',
        operation: () => {
          started.push('first');
          return first.promise;
        },
      },
      {
        name: 'second',
        operation: () => {
          started.push('second');
          return second.promise;
        },
      },
      {
        name: 'dependent',
        after: ['first', 'second'],
        operation: () => {
          started.push('dependent');
          return 3;
        },
      },
    ],
    2,
  );
  await Promise.resolve();
  assert.deepEqual(started, ['first', 'second']);
  first.reject(Error('fixture failure'));
  await Promise.resolve();
  assert(!started.includes('dependent'));
  second.resolve(2);
  const results = await batch;
  assert.deepEqual(
    results.map((item) => item.status),
    ['rejected', 'fulfilled', 'fulfilled'],
  );
  assert.equal(results[2].value, 3);
});

test('batch rejects duplicate, unknown, and cyclic jobs', async () => {
  await assert.rejects(runBatch([{ name: 'same' }, { name: 'same' }]), /Duplicate/);
  await assert.rejects(runBatch([{ name: 'one', after: ['missing'] }]), /Unknown/);
  await assert.rejects(
    runBatch([
      { name: 'one', after: ['two'] },
      { name: 'two', after: ['one'] },
    ]),
    /Cyclic/,
  );
});

test('explicit scopes do not add checklist jobs and list mode remains inspection only', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const plan = await loadTestPlan(['--list', '--scope', 'layout'], root);
  assert.equal(plan.list, true);
  assert.equal(plan.planPath, null);
  assert.equal(plan.scopes.size, 0);
  assert.deepEqual(plan.args, ['--scope', 'layout']);
  await assert.rejects(loadTestPlan(['--plan'], root), /needs a file/);
});
