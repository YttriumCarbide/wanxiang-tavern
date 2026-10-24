import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function arcadeChecks({ browser, baseURL, output }) {
  const document = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
    '<script type="module" src="./src/app.js"></script>',
    '',
  );
  const errors = [];
  const layouts = [];
  for (const viewport of [
    { width: 1440, height: 836 },
    { width: 667, height: 375 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.height < 600 });
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.route('**/__arcade', (route) =>
        route.fulfill({ contentType: 'text/html', body: document }),
      );
      await page.goto(new URL('__arcade', baseURL).href);
      await page.evaluate(async () => {
        const [{ createArcade }, { createEventScope }, { newTetris }] = await Promise.all([
          import('/src/app/arcade.js'),
          import('/src/shared/events.js'),
          import('/src/tetris.js'),
        ]);
        const library = { inventory: { ether: 100 }, arcade: newTetris(123) };
        for (let row = 16; row < 20; row++)
          library.arcade.board[row] = Array.from({ length: 10 }, (_, x) => (x === 9 ? 0 : 1));
        library.arcade.piece = { type: 0, cells: [[1], [1], [1], [1]], x: 9, y: 0 };
        const events = createEventScope();
        const context = {
          events,
          session: { ai: { library } },
          generation: {
            save() {
              localStorage.setItem('arcade-fixture', JSON.stringify(context.session.ai.library));
            },
          },
        };
        const arcade = createArcade(context);
        window.arcadeFixture = { context, arcade, events };
        arcade.open();
      });
      assert.equal(await page.locator('.arcade-controls button').count(), 2);
      assert.equal(await page.locator('#arcade-dialog button').count(), 4);
      await page.locator('[data-arcade-pause]').click();
      assert.equal(await page.locator('[data-arcade-pause]').textContent(), '继续');
      const paused = await page.evaluate(
        () => window.arcadeFixture.context.session.ai.library.arcade,
      );
      await page.waitForTimeout(750);
      assert.deepEqual(
        await page.evaluate(() => window.arcadeFixture.context.session.ai.library.arcade),
        paused,
      );
      const geometry = await page.evaluate(() => {
        const rect = (selector) => {
          const box = document.querySelector(selector).getBoundingClientRect();
          return { x: box.x, y: box.y, width: box.width, height: box.height };
        };
        return {
          board: rect('#arcade-board'),
          controls: rect('.arcade-controls'),
          actions: rect('.arcade-actions'),
          dialog: rect('#arcade-dialog'),
          scroll: document.querySelector('#arcade-dialog').scrollHeight,
          height: document.querySelector('#arcade-dialog').clientHeight,
        };
      });
      assert(Math.abs(geometry.board.x + geometry.board.width / 2 - viewport.width / 2) < 2);
      assert(Math.abs(geometry.board.height / geometry.board.width - 2) < 0.03);
      assert(geometry.actions.y + geometry.actions.height <= geometry.board.y);
      assert(geometry.controls.y >= geometry.board.y + geometry.board.height);
      assert(geometry.actions.x + geometry.actions.width <= viewport.width);
      assert(geometry.controls.y + geometry.controls.height < viewport.height);
      assert(
        geometry.scroll <= geometry.height + 1,
        'No hidden or scrolling controls: ' + JSON.stringify(geometry),
      );
      layouts.push({ viewport, ...geometry });
      await page.locator('[data-arcade-pause]').click();
      await page.locator('#arcade-dialog h2').click();
      await page.screenshot({ path: path.join(output, `centered-${viewport.width}.png`) });
      await page.keyboard.press('ArrowLeft');
      assert.equal(
        await page.evaluate(() => window.arcadeFixture.context.session.ai.library.arcade.piece.x),
        8,
      );
      await page.keyboard.press('ArrowRight');
      for (let index = 0; index < 3; index++) await page.keyboard.press('ArrowLeft');
      for (let index = 0; index < 2; index++) {
        if (viewport.height === 480) await page.locator('[data-tetris="rotate"]').tap();
        else await page.locator('[data-tetris="rotate"]').click();
        assert.equal(
          await page.evaluate(
            () => window.arcadeFixture.context.session.ai.library.arcade.piece.cells.length,
          ),
          index ? 4 : 1,
        );
      }
      const board = await page.locator('#arcade-board').boundingBox();
      const cell = board.width / 10;
      await page.mouse.move(board.x + cell * 3, board.y + board.height / 2);
      await page.mouse.down();
      await page.mouse.move(board.x + cell, board.y + board.height / 2, { steps: 5 });
      await page.mouse.up();
      assert(
        (await page.evaluate(
          () => window.arcadeFixture.context.session.ai.library.arcade.piece.x,
        )) < 6,
        'Drag moves the live piece left',
      );
      await page.mouse.down();
      await page.mouse.move(board.x + cell * 9.5, board.y + board.height / 2, { steps: 10 });
      await page.mouse.up();
      assert.equal(
        await page.evaluate(() => window.arcadeFixture.context.session.ai.library.arcade.piece.x),
        9,
      );
      const accelerate = await page.locator('[data-tetris="down"]').boundingBox();
      await page.mouse.move(
        accelerate.x + accelerate.width / 2,
        accelerate.y + accelerate.height / 2,
      );
      await page.mouse.down();
      await page.waitForFunction(
        () => window.arcadeFixture.context.session.ai.library.arcade.lines === 4,
      );
      await page.mouse.up();
      await page.locator('[data-arcade-pause]').click();
      assert.equal(
        await page.evaluate(() => window.arcadeFixture.context.session.ai.library.inventory.ether),
        110,
      );
      await page.locator('[data-arcade-close]').click();
      assert.equal(await page.locator('#arcade-dialog').isVisible(), false);
      await page.evaluate(() => {
        const fixture = window.arcadeFixture;
        fixture.context.session.ai.library = JSON.parse(localStorage.getItem('arcade-fixture'));
        fixture.arcade.open();
      });
      assert.equal(
        await page.evaluate(() => window.arcadeFixture.context.session.ai.library.arcade.lines),
        4,
      );
      assert.equal(
        await page.evaluate(() => window.arcadeFixture.context.session.ai.library.inventory.ether),
        110,
      );
      await page.evaluate(() => window.arcadeFixture.arcade.completed('剧本生成'));
      await page.locator('#arcade-completion').waitFor({ state: 'visible' });
      await page.locator('[data-arcade-return]').click();
      assert.equal(await page.locator('#arcade-dialog').isVisible(), false);
    } finally {
      await page.close();
    }
  }
  assert.deepEqual(errors, []);
  return { layouts, dragAndRotate: true, heldAcceleration: true, pauseAndSharedSave: true };
}
