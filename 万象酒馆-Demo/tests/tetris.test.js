import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newTetris,
  restoreTetris,
  tetrisStep,
  tetrisDisplay,
  TETRIS_REWARDS,
} from '../src/tetris.js';
import { newLibrary, restoreLibrary } from '../src/ai/library.js';

test('one to four rows emit exactly the shared ether award with increasing multi-row bonus', () => {
  for (let count = 1; count <= 4; count++) {
    const state = newTetris(42);
    state.status = 'playing';
    for (let row = 20 - count; row < 20; row++)
      state.board[row] = Array.from({ length: 10 }, (_, x) => (x === 9 ? 0 : 1));
    state.piece = { type: 0, cells: [[1], [1], [1], [1]], x: 9, y: 0 };
    const result = tetrisStep(state, 'drop');
    assert.equal(
      result.events.find((event) => event.type === 'clear').ether,
      TETRIS_REWARDS[count],
    );
    assert.equal(result.state.lines, count);
    assert.equal(result.state.earned, TETRIS_REWARDS[count]);
    assert.equal(state.lines, 0, 'Simulation must not mutate its input');
    const restored = restoreTetris(JSON.parse(JSON.stringify(result.state)));
    assert.equal(tetrisStep(restored, 'pause').events.length, 0);
    assert.equal(restored.earned, TETRIS_REWARDS[count]);
    assert.equal(tetrisDisplay(restored).flat().length, 200);
  }
});

test('movement, rotation, pause and saved library preserve one board without granting a replayed reward', () => {
  let state = tetrisStep(newTetris(10), 'play').state;
  for (let index = 0; index < 20; index++) state = tetrisStep(state, 'left').state;
  assert(state.piece.x >= 0);
  state = tetrisStep(state, 'rotate').state;
  assert(state.piece.x + state.piece.cells[0].length <= 10);
  state = tetrisStep(state, 'pause').state;
  assert.deepEqual(tetrisStep(state, 'down').state, state);
  const library = newLibrary();
  library.arcade = state;
  const restored = restoreLibrary(JSON.parse(JSON.stringify(library)));
  assert.deepEqual(restored.arcade.board, state.board);
  assert.equal(restored.arcade.status, 'paused');
  assert.deepEqual(restoreTetris({ ...state, piece: { ...state.piece, x: 1000 } }), newTetris());
});
