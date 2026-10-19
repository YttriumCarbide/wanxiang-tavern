import test from 'node:test';
import assert from 'node:assert/strict';
import { selectScopes } from '../tools/testing/scopes.mjs';

test('documentation and UI edits do not schedule unrelated dungeon or engine suites', () => {
  assert.deepEqual([...selectScopes(['--changed', 'README.md'])], ['quality']);
  assert.deepEqual(
    [...selectScopes(['--changed', 'styles/cards.css'])],
    ['quality', 'ui', 'layout'],
  );
  assert.deepEqual([...selectScopes(['--changed', 'src/engine.js'])], ['quality', 'core']);
});

test('combined edits deduplicate checks and invalid scope names fail clearly', () => {
  assert.deepEqual(
    [...selectScopes(['--changed', 'src/app.js,src/scene.js,server.cjs'])],
    ['quality', 'ui', 'server', 'layout'],
  );
  assert.throws(() => selectScopes(['--scope', 'typo']), /Unknown scope/);
});
