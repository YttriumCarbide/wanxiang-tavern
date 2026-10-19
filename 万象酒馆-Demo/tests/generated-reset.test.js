import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGeneratedReset,
  hasGeneratedRecovery,
  restoreGeneratedRecovery,
} from '../src/app/generated-reset.js';

test('requested clean start removes generated context once, retains recovery and leaves other settings intact', () => {
  const original = JSON.stringify({
    version: 1,
    characters: [{ source: 'generated' }],
    scripts: [{ title: 'old' }],
    history: [{ lines: ['old'] }],
    party: ['old'],
    prepared: 'old',
    chapter: 4,
  });
  const data = new Map([
    ['wanxiang.worldbooks.v1', original],
    ['audio-preferences', 'preserved'],
    ['other-settings', 'preserved'],
  ]);
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    removeItem: (key) => data.delete(key),
  };
  assert(applyGeneratedReset(storage));
  const fresh = JSON.parse(storage.getItem('wanxiang.worldbooks.v1'));
  assert.equal(fresh.characters.length, 6);
  assert(fresh.characters.every((entry) => entry.source === 'official'));
  assert.deepEqual(fresh.scripts, []);
  assert.deepEqual(fresh.history, []);
  assert.equal(fresh.prepared, null);
  assert.equal(fresh.chapter, 1);
  assert(hasGeneratedRecovery(storage));
  fresh.history.push({ lines: ['new'] });
  storage.setItem('wanxiang.worldbooks.v1', JSON.stringify(fresh));
  assert.equal(applyGeneratedReset(storage), false);
  assert.equal(JSON.parse(storage.getItem('wanxiang.worldbooks.v1')).history.length, 1);
  assert.equal(storage.getItem('other-settings'), 'preserved');
  assert.equal(storage.getItem('audio-preferences'), 'preserved');
  assert(restoreGeneratedRecovery(storage));
  assert.equal(storage.getItem('wanxiang.worldbooks.v1'), original);
  assert.equal(applyGeneratedReset(storage), false);
  assert.equal(hasGeneratedRecovery(storage), false);
});
