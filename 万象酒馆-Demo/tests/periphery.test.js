import test from 'node:test';
import assert from 'node:assert/strict';
import { MAP_IDS } from '../src/content/biomes.js';
import { planPeriphery } from '../src/content/periphery.js';

test('all thirteen environments tile the full outer field without entering the battle board', () => {
  assert.equal(MAP_IDS.length, 13);
  for (const map of MAP_IDS) {
    const plan = planPeriphery(map);
    assert.equal(plan.patches.length, 518, `${map} must cover both sides and both ends`);
    assert(plan.boxes.length > 3000 && plan.boxes.length < 20000);
    for (const box of plan.boxes) {
      assert(box.w > 0 && box.h > 0 && box.d > 0);
      assert(
        Math.abs(box.x) - box.w / 2 >= 6.55 || Math.abs(box.z) - box.d / 2 >= 5.55,
        `${map}: scenery must leave the central board alone`,
      );
      assert(Math.abs(box.x) + box.w / 2 <= plan.bounds.x);
      assert(Math.abs(box.z) + box.d / 2 <= plan.bounds.z);
    }
    assert(plan.patches.some(({ x }) => x > 20) && plan.patches.some(({ x }) => x < -20));
    assert(plan.patches.some(({ z }) => z > 15) && plan.patches.some(({ z }) => z < -15));
  }
});

test('outer tiling is stable and reserves authored buildings before adding repeated modules', () => {
  assert.deepEqual(planPeriphery('xianxia'), planPeriphery('xianxia'));
  const blocked = planPeriphery('metropolis', () => true);
  assert.equal(blocked.patches.length, 0);
  assert.equal(blocked.boxes.length, 0);
  assert.equal(blocked.skipped, 518);
  const half = planPeriphery('castle', (x) => x > 0);
  assert(half.patches.every(({ x }) => x <= 0));
  assert(half.skipped > 0);
});
