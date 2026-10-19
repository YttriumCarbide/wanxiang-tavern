import assert from 'node:assert/strict';
import path from 'node:path';

/** Exercise the actual decision UI against isolated data, without minting live rewards. */
export async function lootConflictChecks({ page, output }) {
  await page.evaluate(async () => {
    const { createLootConflicts } = await import('/src/app/loot-conflicts.js');
    const { createEventScope } = await import('/src/shared/events.js');
    const library = {
      inventory: { ether: 5 },
      rewardClaims: [],
      archives: {
        items: [
          {
            id: 'old',
            name: '残晶',
            description: '青色的遗迹晶体',
            value: 7,
            map: 'ruins',
            converted: true,
            source: { runId: 'old' },
          },
          {
            id: 'new',
            name: '残晶',
            description: '赤色的遗迹晶体',
            value: 13,
            map: 'ruins',
            converted: false,
            source: { runId: 'new' },
            conflictWith: 'old',
          },
        ],
      },
    };
    const events = createEventScope();
    const controller = createLootConflicts({
      session: { ai: { library } },
      events,
      generation: { save() {} },
    });
    window.lootDecisionTest = { library, events, controller, done: controller.resolve('new') };
  });
  try {
    const panel = page.locator('#loot-conflicts[open]');
    await panel.waitFor({ state: 'visible' });
    assert.equal(await panel.locator('.loot-comparison article').count(), 2);
    await panel.locator('[data-loot-choice="rename-new"]').click();
    assert((await panel.locator('#loot-conflict-error').textContent()).includes('新名字'));
    await panel.locator('#loot-rename').fill('赤色残晶');
    await page.screenshot({ path: path.join(output, 'loot-conflict-choice.png') });
    await panel.locator('[data-loot-choice="rename-new"]').click();
    const settled = await page.evaluate(async () => {
      const state = window.lootDecisionTest;
      const { settleEther } = await import('/src/archives.js');
      const accepted = await state.done;
      const first = settleEther(state.library, 'new');
      const second = settleEther(state.library, 'new');
      return {
        accepted,
        first,
        second,
        name: state.library.archives.items[1].name,
        ether: state.library.inventory.ether,
      };
    });
    assert.deepEqual(settled, {
      accepted: true,
      first: 13,
      second: 0,
      name: '赤色残晶',
      ether: 18,
    });
  } finally {
    await page.evaluate(() => {
      window.lootDecisionTest.controller.dispose();
      window.lootDecisionTest.events.dispose();
      delete window.lootDecisionTest;
    });
  }
}
