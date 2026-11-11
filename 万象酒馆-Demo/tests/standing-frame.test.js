import test from 'node:test';
import assert from 'node:assert/strict';
import { standingFrame } from '../src/tavern/standing-frame.js';

test('custom standing art uses opaque body bounds and ignores transparent padding and soft glow', () => {
  const alpha = new Uint8ClampedArray(10 * 20 * 4);
  for (let row = 0; row < 20; row++)
    for (let column = 0; column < 10; column++)
      alpha[(row * 10 + column) * 4 + 3] =
        row >= 4 && row <= 15 && column >= 3 && column <= 6 ? 255 : 32;
  assert.deepEqual(standingFrame(alpha, 10, 20, 1000), { top: 200, foot: 800 });
  assert.deepEqual(standingFrame(new Uint8ClampedArray(800), 10, 20, 1000), { top: 0, foot: 1000 });
});
