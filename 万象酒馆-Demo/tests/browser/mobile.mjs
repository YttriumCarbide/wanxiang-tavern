import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { newLibrary } from '../../src/ai/library.js';
import { normalizeEquipment } from '../../src/equipment.js';

/** Send real touch input so browser panning, pointer cancellation and click suppression all run. */
async function swipeScroll(page, panel, { rotated = false } = {}) {
  const metrics = await panel.evaluate((node) => {
    node.scrollTop = 0;
    return { overflow: node.scrollHeight - node.clientHeight };
  });
  assert(metrics.overflow > 20, 'The real panel contains enough content to scroll');
  const box = await panel.boundingBox();
  const from = rotated
    ? { x: box.x + 18, y: box.y + box.height / 2 }
    : { x: box.x + box.width / 2, y: box.y + box.height - 18 };
  const to = rotated ? { x: box.x + box.width - 18, y: from.y } : { x: from.x, y: box.y + 18 };
  const input = await page.context().newCDPSession(page);
  try {
    await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [from] });
    for (let step = 1; step <= 12; step++) {
      await input.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [
          { x: from.x + ((to.x - from.x) * step) / 12, y: from.y + ((to.y - from.y) * step) / 12 },
        ],
      });
      await page.waitForTimeout(18);
    }
    await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await panel.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const scrolled = await panel.evaluate((node) => node.scrollTop);
    assert(scrolled > 12, 'A finger swipe moves panel content: ' + scrolled);
    return scrolled;
  } finally {
    await input.detach();
  }
}

async function checkTimeline(page, viewport) {
  await page.locator('.turn-column').evaluate((node) =>
    Promise.all(
      node
        .getAnimations({ subtree: true })
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {})),
    ),
  );
  const geometry = await page.locator('.turn-column').evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    const cells = [...node.querySelectorAll('.time-cell')]
      .filter((cell) => cell.getClientRects().length)
      .map((cell) => {
        const box = cell.getBoundingClientRect();
        return { x: box.x, right: box.right, height: box.height };
      });
    const rail = document.querySelector('.right-rail').getBoundingClientRect();
    return {
      x: bounds.x,
      right: bounds.right,
      center: (bounds.left + bounds.right) / 2,
      cells,
      railLeft: rail.left,
    };
  });
  assert(
    Math.abs(geometry.center - viewport.width / 2) < 1,
    'The complete battle timeline is centered on the screen',
  );
  assert(geometry.right <= geometry.railLeft - 6, 'The timeline leaves space for reserve cards');
  for (const cell of geometry.cells) {
    assert(
      Math.abs(cell.height - 46) < 1,
      'Both current and preview turn cells use the smaller mobile height',
    );
    assert(
      cell.x >= geometry.x - 1 && cell.right <= geometry.right + 1,
      JSON.stringify({ cell, geometry }),
    );
  }
}

/** One batch covers actual small landscape panels and renderer suspension, with isolated saves. */
export async function mobileChecks({ browser, baseURL, output }) {
  const errors = [],
    problems = [],
    screens = [];
  const library = newLibrary();
  library.inventory.ether = 450;
  library.inventory.gold = 500;
  library.equipment.catalog.push(
    normalizeEquipment(
      {
        name: '界门断环',
        description: '佩戴后提升2点skillDamage与2点hp。buff恢复1sp。',
        stats: { hp: 2, skillDamage: 2 },
        rules: [],
      },
      { id: 'mobile-equipment', name: '断环', value: 65 },
    ),
  );
  for (let index = 1; index < 12; index++) {
    library.equipment.catalog.push({
      ...structuredClone(library.equipment.catalog[0]),
      id: 'mobile-equipment-' + index,
      name: '旅途装备' + index,
    });
  }
  library.tavernChat = Array.from({ length: 24 }, (_, index) => ({
    id: 'mobile-message-' + index,
    role: index % 2 ? 'assistant' : 'user',
    content: '这是一条用于验证手机手指滑动的酒馆聊天记录。'.repeat(3),
  }));
  for (const viewport of [
    { width: 667, height: 375 },
    { width: 844, height: 390 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: true, deviceScaleFactor: 3 });
    page.on('pageerror', (error) => errors.push(error.message));
    await legacySession(page);
    await page.addInitScript((value) => {
      if (location.origin === 'null') return;
      if (!sessionStorage.getItem('mobile-seeded')) {
        localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(value));
        sessionStorage.setItem('mobile-seeded', 'true');
      }
    }, library);
    try {
      await page.goto(baseURL + '/?display=landscape');
      await page.waitForFunction(() => !!window.demo);
      const frame = page.frameLocator('#inn-frame iframe');
      await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
      const measure = async (selector, label) => {
        await page.locator(selector).waitFor({ state: 'visible' });
        await page.locator(selector).evaluate((node) =>
          Promise.all(
            node
              .getAnimations()
              .filter((a) => a.effect?.getTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => {})),
          ),
        );
        const box = await page.locator(selector).boundingBox();
        if (
          !box ||
          box.x < -0.5 ||
          box.y < -0.5 ||
          box.x + box.width > viewport.width + 1 ||
          box.y + box.height > viewport.height + 1
        )
          problems.push({ label, viewport, box });
        const overflow = await page
          .locator(selector)
          .evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth }));
        if (overflow.scroll > overflow.width + 2)
          problems.push({ label, viewport, horizontalOverflow: overflow });
        await page.screenshot({ path: path.join(output, label + '-' + viewport.width + '.png') });
        screens.push(label + '-' + viewport.width);
      };
      const stats = await frame
        .locator('canvas')
        .evaluate(() => window.assetPreview.getState().rendering);
      assert.equal(stats.fps, 30);
      assert.equal(stats.shadows, false);
      assert(stats.pixelRatio <= 1.25);
      assert.equal(await page.locator('#workshop-open,#workshop-dialog').count(), 0);
      await page.locator('#ai-open').click();
      for (const tab of ['settings', 'prompts', 'game']) {
        await page.locator('[data-ai-tab="' + tab + '"]').click();
        await measure('#ai-dialog', 'api-' + tab);
        if (tab === 'settings')
          await swipeScroll(page, page.locator('#ai-dialog .ai-editor').first());
      }
      const paused = await frame
        .locator('canvas')
        .evaluate(() => window.assetPreview.getState().rendering.frames);
      await page.waitForTimeout(220);
      assert.equal(
        await frame
          .locator('canvas')
          .evaluate(() => window.assetPreview.getState().rendering.frames),
        paused,
        'Covered tavern stops rendering',
      );
      await page.locator('#ai-close').click();
      await page.locator('#party-toggle').click();
      await measure('#party-panel', 'preparation');
      const slots = await page.locator('[data-prepare-slot]').evaluateAll((nodes) =>
        nodes.map((n) => {
          const b = n.getBoundingClientRect();
          return { x: b.x, y: b.y, w: b.width, h: b.height };
        }),
      );
      assert.equal(slots.length, 6);
      for (const slot of slots)
        if (slot.y + slot.h > viewport.height || slot.h < 30)
          problems.push({ label: 'formation', viewport, slot });
      await page.locator('[data-prepare-slot="0"]').click();
      await measure('#prepare-character-dialog', 'character');
      await page.locator('#prepare-character-close').click();
      await page.locator('#prepare-close').click();
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('supplies'));
      await frame.locator('#condenser-open').click();
      await page.locator('[data-forge-page="exchange"]').click();
      await measure('#ether-forge', 'forge');
      await swipeScroll(page, page.locator('#forge-list'));
      const buy = await page.locator('[data-buy-equipment]').boundingBox();
      const work = await page.locator('#forge-workspace').boundingBox();
      if (!buy || buy.y < work.y || buy.y + buy.height > work.y + work.height + 1)
        problems.push({ label: 'forge-buy', viewport, buy, work });
      const description = await page.locator('#forge-workspace').textContent();
      assert(description.includes('技能伤害'));
      assert(!description.includes('skillDamage'));
      await page.locator('[data-forge-close]').click();
      await frame.locator('#shop-open').click();
      await measure('#void-shop', 'shop');
      await page.locator('#shop-close').click();
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('table'));
      await frame.locator('#talk-open').click();
      await measure('#chat-dialog', 'chat');
      await swipeScroll(page, page.locator('#chat-messages'));
      await page.locator('#chat-close').click();
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('bookshelf'));
      for (const [button, dialog, close] of [
        ['archives', 'archive-dialog', 'archive-close'],
        ['records', 'journey-records', 'records-close'],
        ['memory', 'memory-dialog', 'memory-close'],
      ]) {
        await frame.locator('#bookshelf-' + button).click();
        await measure('#' + dialog, button);
        if (button === 'archives') {
          await page.locator('[data-archive-tab="enemies"]').click();
          await swipeScroll(page, page.locator('#archive-list'));
        }
        await page.locator('#' + close).click();
      }
      // Exercise the production request wrapper and the real shared arcade without an upstream request.
      await page.evaluate(async () => {
        const { createRequestControls } = await import('/src/app/request-controls.js');
        const finish = [];
        const arcade = {
          opens: 0,
          outcomes: [],
          open() {
            this.opens++;
          },
          completed(label, success) {
            this.outcomes.push({ label, success });
          },
        };
        const client = createRequestControls(
          { request: () => new Promise((resolve) => finish.push(resolve)), dispose() {} },
          () => ({}),
          () => arcade,
        );
        const kinds = ['character', 'script', 'chat', 'quick-chat', 'summary', 'creation', 'map'];
        window.mobileWait = {
          client,
          arcade,
          finish,
          requests: kinds.map((k) => client.request('generate/' + k, {})),
        };
      });
      assert.equal(await page.locator('[data-request-arcade]').count(), 7);
      await page.locator('[data-request-arcade="map"]').click();
      await page.evaluate(async () => {
        const w = window.mobileWait;
        w.finish.forEach((resolve) => resolve({}));
        await Promise.all(w.requests);
      });
      assert.deepEqual(
        await page.evaluate(() => ({
          opens: window.mobileWait.arcade.opens,
          completed: window.mobileWait.arcade.outcomes.length,
        })),
        { opens: 1, completed: 7 },
      );
      await page.evaluate(() => window.mobileWait.client.dispose());
      await page.evaluate(() => demo.startBattle());
      await page.waitForFunction(
        () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
      );
      await page.locator('#round-start').waitFor({ state: 'hidden' });
      await measure('#battle', 'battle');
      await measure('.command-controls', 'battle-controls');
      await checkTimeline(page, viewport);
      const intersects = await page.evaluate(() => {
        const save = document.querySelector('#saves-open').getBoundingClientRect();
        const round = document.querySelector('.round-indicator').getBoundingClientRect();
        return (
          save.left < round.right &&
          save.right > round.left &&
          save.top < round.bottom &&
          save.bottom > round.top
        );
      });
      assert.equal(intersects, false, 'Save and round indicator do not overlap');
      const front = await page.evaluate(() => demo.getState().formation[0]);
      await page.locator(`[data-unit="${front}"]`).tap();
      await measure('#details', 'battle-details');
      assert((await page.locator('#details').boundingBox()).height >= 180);
      const selected = await page.evaluate(() => demo.getStatus().selected);
      await page.locator('#details .hero-heading').tap();
      assert.equal(
        await page.evaluate(() => demo.getStatus().selected),
        selected,
        'Touching the heading keeps the selected actor',
      );
      await page.locator('#details').evaluate((node) => {
        window.mobileDetailsOriginal = node.firstElementChild;
      });
      await swipeScroll(page, page.locator('#details'));
      assert.equal(
        await page.evaluate(() => demo.getStatus().selected),
        selected,
        'Scrolling skills keeps the selected actor',
      );
      assert(
        await page
          .locator('#details')
          .evaluate((node) => node.firstElementChild === window.mobileDetailsOriginal),
        'Scrolling does not replace the panel DOM',
      );
      assert.equal(
        (await page.evaluate(() => demo.getPlan())).length,
        0,
        'A swipe over skills never activates a skill',
      );
      await page.screenshot({
        path: path.join(output, 'battle-scrolled-' + viewport.width + '.png'),
      });
      await page.locator('#details [data-skill="attack"]').tap();
      assert(
        await page.evaluate(
          () =>
            demo.getStatus().pending?.skill === 'attack' ||
            demo.getPlan().some((action) => action.skill === 'attack'),
        ),
        'A deliberate tap still selects or queues the attack after scrolling',
      );
      await page.locator('#stage').tap({ position: { x: 8, y: 170 } });
      assert.equal(await page.evaluate(() => demo.getStatus().selected), null);
      if ((await page.evaluate(() => demo.getPlan())).length) await page.locator('#clear').click();
      await page.locator('#commit').click();
      await page.waitForFunction(
        () =>
          demo.getState().phase === 'plan' &&
          !demo.getStatus().playing &&
          !demo.getStatus().animating,
      );
      await page.locator('#round-start').waitFor({ state: 'hidden' });
      await checkTimeline(page, viewport);
      await page.locator(`[data-unit="${front}"]`).tap();
      await page.locator('#details [data-skill="attack"]').tap();
      const target = await page.evaluate(() => demo.getStatus().eligibleTargets[0]);
      if (target) await page.locator(`[data-unit="${target}"]`).tap();
      const planned = await page.evaluate(() => demo.getPlan());
      assert.equal(planned.length, 1);
      await checkTimeline(page, viewport);
      const action = await page.locator('.time-action').boundingBox();
      const slot = await page.locator(`[data-start="${planned[0].start}"]`).boundingBox();
      assert(
        Math.abs(action.x - slot.x) < 1 &&
          Math.abs(action.width - slot.width) < 1 &&
          Math.abs(action.height - 46) < 1,
        'Queued actions align with smaller cells',
      );
      await page.screenshot({
        path: path.join(output, 'timeline-centered-' + viewport.width + '.png'),
      });
      const canvas = await page.locator('#battle canvas').evaluate((node) => ({
        width: node.width,
        height: node.height,
        cssWidth: node.clientWidth,
        cssHeight: node.clientHeight,
      }));
      assert(canvas.width * canvas.height <= 900001);
      assert(canvas.width <= canvas.cssWidth * 1.25 + 2);
    } finally {
      await page.close();
    }
  }
  const portrait = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    await legacySession(portrait);
    await portrait.goto(baseURL);
    const game = portrait.frameLocator('#landscape-frame');
    await game.locator('#ai-open').waitFor();
    const host = await portrait.evaluate(() => ({
      ownsGame: !!window.demo,
      frames: document.querySelectorAll('#landscape-frame').length,
    }));
    assert.deepEqual(host, { ownsGame: false, frames: 1 });
    const size = await game
      .locator('body')
      .evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert.deepEqual(size, { width: 844, height: 390 });
    await game.locator('#ai-open').click();
    await swipeScroll(portrait, game.locator('#ai-dialog .ai-editor').first(), { rotated: true });
  } finally {
    await portrait.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(problems, [], 'All mobile panel failures are collected together');
  return {
    landscapeSizes: 2,
    screens,
    rendering: { fps: 30, pixelRatioCap: 1.25, shadows: false, pausedUnderModals: true },
    apiWaitGames: 7,
    realTouchScrolling: [
      'settings',
      'equipment',
      'chat',
      'archives',
      'battle-details',
      'rotated-host',
    ],
    preservesActorAndPanel: true,
    centeredTimeline: { height: 46, phases: ['opening', 'plan'], alignedActions: true },
  };
}
