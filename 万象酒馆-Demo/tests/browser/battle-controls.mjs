import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

export async function battleControlChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.stack));
  await legacySession(page);
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    await page.evaluate(() => demo.startBattle());
    await page.waitForFunction(
      () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
    );
    const state = await page.evaluate(() => demo.getState());
    const rear = state.formation[3],
      front = state.formation[0];
    const a = await page.locator(`[data-rear="${rear}"]`).boundingBox();
    const b = await page.locator(`[data-unit="${front}"]`).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 });
    await page.waitForFunction(() => demo.getStatus().dragging?.visible);
    const drag = await page.evaluate(() => demo.getStatus().dragging);
    assert.equal(drag.source, 'hand');
    await page.mouse.up();
    assert.equal((await page.evaluate(() => demo.getPlan())).length, 1);
    const motion = (await page.evaluate(() => demo.getSceneMotion())).find(
      (record) => record.id === rear,
    );
    assert(motion?.visible && motion.from);
    const released = await page.evaluate(() => demo.getStatus().releasedDrag);
    assert(
      Math.hypot(...motion.from.map((value, index) => value - released.position[index])) < 0.001,
      JSON.stringify({ from: motion.from, released, old: drag.position }),
    );
    await page.waitForFunction(() => !demo.getStatus().animating);
    await page.screenshot({ path: path.join(output, 'rear-to-front-continuous.png') });
    await page.locator('#clear').click();
    await page.waitForFunction(() => !demo.getStatus().animating);
    const c = await page.locator(`[data-unit="${front}"]`).boundingBox();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2);
    await page.mouse.down();
    await page.mouse.move(c.x + c.width / 2 + 60, c.y + c.height / 2 - 40, { steps: 5 });
    await page.keyboard.press('Escape');
    await page.mouse.up();
    assert.equal((await page.evaluate(() => demo.getPlan())).length, 0);
    assert.equal(await page.locator('.is-drag-source').count(), 0);
    await page.locator('#story-toggle').click();
    let held;
    await page.route('**/api/ai/generate/quick-chat', (route) => {
      held = route;
    });
    await page.locator('#quick-chat-input').fill('先停下这次请求');
    await page.locator('#quick-chat-send').click();
    await page.locator('[data-request-stop="quick-chat"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-request-stop="quick-chat"]'));
    assert.equal((await page.evaluate(() => demo.getChat().quick)).length, 1);
    await held?.abort().catch(() => {});
    await page.unroute('**/api/ai/generate/quick-chat');
    await page.route('**/api/ai/generate/quick-chat', (route) =>
      route.fulfill({ json: { content: '同行者点了点头。', usage: { input: 1, output: 1 } } }),
    );
    await page.locator('#quick-chat-input').fill('这一条可以删除');
    await page.locator('#quick-chat-send').click();
    await page.waitForFunction(() => demo.getChat().quick.length === 3);
    const deleted = (await page.evaluate(() => demo.getChat().quick))[1].id;
    await page.locator(`[data-chat-delete="${deleted}"]`).click();
    assert(
      !(await page.evaluate(() => demo.getChat().quick)).some((message) => message.id === deleted),
    );
    await page.evaluate(() => demo.flushStorage());
    const controls = await page.evaluate(async () => {
      const { createRequestControls } = await import('/src/app/request-controls.js');
      const aborted = [];
      const client = createRequestControls({
        request: (path, data, { signal }) =>
          new Promise((resolve, reject) => {
            signal.addEventListener(
              'abort',
              () => {
                aborted.push(path);
                reject(signal.reason);
              },
              { once: true },
            );
          }),
        dispose() {},
      });
      for (const kind of [
        'character',
        'script',
        'chat',
        'quick-chat',
        'summary',
        'creation',
        'map',
      ]) {
        for (const operation of ['generate', 'models']) {
          const pending = client.request(`${operation}/${kind}`, {}).catch((error) => error.name);
          document.querySelector(`[data-request-stop="${kind}"]`).click();
          if ((await pending) !== 'AbortError') throw Error('Cancellation did not propagate');
        }
      }
      client.dispose();
      return aborted;
    });
    assert.equal(controls.length, 14);
    assert.equal(await page.locator('[data-request-stop]').count(), 0);
    assert.equal(await page.locator('#creation-form textarea[name="skill1"]').count(), 1);
    assert.equal(await page.locator('#creation-form textarea[name="skill2"]').count(), 1);
    assert.equal(await page.locator('#creation-form select[name^="skillType"]').count(), 2);
    assert.deepEqual(errors, []);
    return {
      rearDragContinuous: true,
      cancelDrag: true,
      actualRequestAborted: true,
      quickChatDeleted: true,
      allRequestStops: true,
      separateSkillFields: true,
    };
  } catch (failure) {
    await page.screenshot({ path: path.join(output, 'battle-controls-failure.png') });
    throw failure;
  } finally {
    await page.close();
  }
}
