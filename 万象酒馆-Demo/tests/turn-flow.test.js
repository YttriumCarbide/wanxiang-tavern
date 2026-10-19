import test from 'node:test';
import assert from 'node:assert/strict';
import { newBattle, preview, advance, makeAction } from '../src/engine.js';
import { actionSide, firstActionSide } from '../src/turn-flow.js';

test('turn notice uses the actual hero event emitted by the engine', () => {
  const state = advance(preview(newBattle(), []));
  const result = preview(state, [makeAction(state, 'morrow', 'attack', 'mossSlime', 0)]);
  assert.equal(result.valid, true);
  assert.equal(result.events[0].type, 'hero');
  assert.equal(firstActionSide(result.events), 'player');
  assert.equal(actionSide(result.events.find((event) => event.type === 'enemy')), 'enemy');
});

test('friendly swaps belong to the player; end ticks do not change sides', () => {
  assert.equal(actionSide({ type: 'swap' }), 'player');
  for (const type of ['wait', 'skip', 'regen', 'poison', 'invalid']) {
    assert.equal(actionSide({ type }), null);
  }
  assert.equal(firstActionSide([{ type: 'wait' }, { type: 'enemy' }]), 'enemy');
  assert.equal(firstActionSide([]), 'player');
});
