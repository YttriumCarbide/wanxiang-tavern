import assert from 'node:assert/strict';
import path from 'node:path';
import { openCityFacility } from './city-facility.mjs';
import { travelTownScene } from './town-navigation.mjs';
import { legacySession } from './legacy-session.mjs';
import { newLibrary } from '../../src/ai/library.js';
import { ITEMS } from '../../src/content/items.js';
import { DEFINITIONS } from '../../src/data.js';
import { normalizeEquipment } from '../../src/equipment.js';

/** Send real touch input so browser panning, pointer cancellation and click suppression all run. */
export async function swipeScroll(page, panel, { rotated = false } = {}) {
  const metrics = await panel.evaluate((node) => {
    node.scrollTop = 0;
    return { overflow: node.scrollHeight - node.clientHeight };
  });
  assert(metrics.overflow > 20, 'The real panel contains enough content to scroll');
  const box = await panel.boundingBox();
  // Keep the original 18px margins unless a short scrollport needs more swipe travel.
  const verticalInset = Math.min(18, Math.max(2, (box.height - 24) / 2));
  const verticalTravel = box.height - verticalInset * 2;
  const swipeDistance = rotated ? box.width - 120 : verticalTravel;
  assert(swipeDistance > 12, 'The panel fits a meaningful in-bounds finger swipe');
  const from = rotated
    ? { x: box.x + 60, y: box.y + box.height / 2 }
    : { x: box.x + box.width / 2, y: box.y + box.height / 2 + verticalTravel / 2 };
  const to = rotated
    ? { x: box.x + box.width - 60, y: from.y }
    : { x: from.x, y: box.y + box.height / 2 - verticalTravel / 2 };
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
    const scrolled = await panel.evaluate((node) => node.scrollTop, undefined, { timeout: 5000 });
    assert(scrolled > 12, 'A finger swipe moves panel content: ' + scrolled);
    return scrolled;
  } catch (failure) {
    const state = await page.evaluate(() => ({
      url: location.href,
      frames: [...document.querySelectorAll('iframe')].map((frame) => ({
        id: frame.id,
        src: frame.src,
      })),
      body: document.body.className,
    }));
    throw Error(
      `${failure.message}\nTouch context: ${JSON.stringify({ state, from, to, box, rotated })}`,
      { cause: failure },
    );
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

async function visibleBox(locator) {
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox();
  assert(box && box.width > 0 && box.height > 0, 'Visible geometry for ' + locator);
  return box;
}

async function openLedgerByDrag(page, box) {
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const reachable = await page
    .locator('#ledger-handle')
    .evaluate((node, { x, y }) => node.contains(document.elementFromPoint(x, y)), center);
  assert(reachable, 'The ledger handle is reachable at its center');
  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  try {
    await page.mouse.move(Math.max(10, box.x - 140), center.y, { steps: 6 });
  } finally {
    await page.mouse.up();
  }
  await page.locator('#ledger-drawer-host.is-open').waitFor();
}

async function checkDiceContinue(page, output) {
  await page.evaluate(async () => {
    const { createDiceStage } = await import('/src/app/dice-stage.js');
    const { createEventScope } = await import('/src/shared/events.js');
    const original = document.querySelector('#dc-stage');
    original.remove();
    const events = createEventScope();
    const dice = createDiceStage({ session: { ai: {} }, events });
    void dice
      .playCheck({
        displayCheck: {
          actorName: '长景月汐',
          attrLabel: '敏捷',
          dice: [3, 4],
          mod: 2,
          dc: 8,
          total: 9,
          success: true,
        },
      })
      .finally(() => {
        dice.dispose();
        events.dispose();
        document.body.append(original);
      });
  });
  const button = page.locator('#dc-stage[data-ready="true"] > .dc-continue');
  await button.waitFor();
  assert.equal(await page.locator('#dc-stage .ev-total').textContent(), '9');
  assert.equal(await page.locator('#ledger-corner').isVisible(), false);
  assert(
    await button.evaluate((node) => {
      const { right, bottom, height } = node.getBoundingClientRect();
      return height >= 44 && innerWidth - right <= 24 && innerHeight - bottom <= 24;
    }),
    'The dice continue action is in the mobile bottom-right corner',
  );
  await page.screenshot({ path: path.join(output, 'dice-continue-667.png') });
  await button.tap();
  await page.locator('#dc-stage').waitFor({ state: 'hidden' });
}

/** One batch covers actual small landscape panels and renderer suspension, with isolated saves. */
export async function mobileChecks({ browser, baseURL, output }) {
  const errors = [],
    problems = [],
    screens = [];
  const library = newLibrary();
  library.seenMonsters = Object.values(DEFINITIONS)
    .filter((entry) => entry.speed)
    .map((entry) => entry.id);
  library.inventory.ether = 450;
  library.inventory.gold = 500;
  library.inventory.equipmentVouchers = 3;
  library.inventory.bagUnlocked = true;
  library.dining = {
    ...(library.dining || {}),
    inventory: { ...(library.dining?.inventory || {}), 'country-bread': 3 },
  };
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
    { width: 844, height: 390 },
    { width: 667, height: 375 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: true, deviceScaleFactor: 3 });
    page.on('pageerror', (error) => errors.push(error.stack || error.message));
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
      assert.equal(await page.locator('html').getAttribute('data-game-layout'), 'mobile');
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
      assert.equal(await page.locator('#workshop-dialog').count(), 1);
      assert.equal(await page.locator('#workshop-dialog').isVisible(), false);
      const iconTextWidths = await page
        .locator('#ledger-corner :is(#saves-open, #audio-toggle, #fullscreen-toggle, #ai-open)')
        .evaluateAll((buttons) =>
          buttons.map((button) => {
            const label = button.querySelector('span');
            return {
              id: button.id,
              visible: button.getBoundingClientRect().width > 0,
              labelW: label ? label.getBoundingClientRect().width : 0,
            };
          }),
        );
      assert.deepEqual(
        iconTextWidths.map((item) => item.id),
        ['saves-open', 'audio-toggle', 'fullscreen-toggle', 'ai-open'],
      );
      assert(
        iconTextWidths.every((item) => item.visible && item.labelW <= 1),
        'Top-right corner buttons render stroke icons without visible text',
      );
      await page.locator('#ledger-handle').click();
      await page.locator('#ledger-drawer-host.is-open').waitFor();
      await page.locator('#ledger-close').click();
      await page.locator('#ledger-drawer').waitFor({ state: 'hidden' });
      await page.locator('#audio-toggle').click();
      await page.locator('#audio-panel').waitFor({ state: 'visible' });
      await page.keyboard.press('Escape');
      await page.locator('#audio-panel').waitFor({ state: 'hidden' });
      await page.locator('#ai-open').click();
      for (const tab of ['settings', 'prompts', 'game']) {
        await page.locator('[data-ai-tab="' + tab + '"]').click();
        await measure('#ai-dialog', 'api-' + tab);
        if (tab === 'settings') await swipeScroll(page, page.locator('#ai-dialog'));
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
      const handleBox = await visibleBox(page.locator('#ledger-handle'));
      await openLedgerByDrag(page, handleBox);
      const wallet = page.locator('#ledger-drawer #inn-resources');
      const voucherIcon = wallet.locator('.inn-resource:has(#voucher-count) > img');
      await voucherIcon.waitFor();
      const voucher = await voucherIcon.evaluate(async (icon) => {
        await icon.decode();
        const { top, width, height } = icon.getBoundingClientRect();
        const chip = icon.parentElement.getBoundingClientRect();
        return {
          asset: new URL(icon.currentSrc).pathname.split('/').at(-1),
          square: width > 0 && Math.abs(width - height) < 1,
          centered: Math.abs(top + height / 2 - (chip.top + chip.height / 2)) < 1,
        };
      });
      assert.deepEqual(voucher, { asset: 'equipment-voucher.svg', square: true, centered: true });
      assert.equal(await wallet.locator('#voucher-count').textContent(), '3');
      const actionGrids = page.locator(
        '#ledger-drawer :is([data-ledger-main-grid], [data-ledger-archive-grid])',
      );
      const buttons = await actionGrids
        .locator(':scope > .ledger-tile > button')
        .evaluateAll((nodes) =>
          nodes.map((button) => {
            const { x, y, width, height } = button.getBoundingClientRect();
            return {
              main: Boolean(button.closest('[data-ledger-main-grid]')),
              workshop: button.id === 'workshop-open',
              daily: button.dataset.daily,
              x,
              y,
              width,
              height,
            };
          }),
        );
      assert.equal(buttons.filter((button) => button.main).length, 6);
      assert(
        buttons.some((button) => !button.main),
        'Archive actions are also checked',
      );
      assert(
        await actionGrids
          .locator(':scope > .ledger-tile')
          .evaluateAll((tiles) =>
            tiles.every(
              (tile) => tile.children.length === 1 && tile.firstElementChild.matches('button'),
            ),
          ),
        'Ledger action buttons have no subtitle rows',
      );
      assert(
        buttons.every(
          ({ width, height }) =>
            width > 0 &&
            height > 0 &&
            Math.abs(width - buttons[0].width) < 1 &&
            Math.abs(height - buttons[0].height) < 1,
        ),
        'Ledger actions in both sections have one consistent size',
      );
      const workshop = buttons.find((button) => button.workshop);
      const promotion = buttons.find((button) => button.daily === 'promotion');
      assert(
        workshop && promotion && Math.abs(workshop.y - promotion.y) < 1 && workshop.x < promotion.x,
        'The workshop and tavern promotion are on the same row',
      );
      assert.doesNotMatch((await actionGrids.allTextContents()).join(''), /接班开始/);
      assert.deepEqual(
        await page
          .locator('#ledger-drawer .ledger-foot button:visible')
          .evaluateAll((buttons) => buttons.map((button) => button.id)),
        ['ledger-speed-toggle', 'ledger-raw-btn'],
      );
      await page.locator('#ledger-speed-toggle').click();
      assert.match(await page.locator('#ledger-speed-toggle').textContent(), /×2/);
      await page.locator('#ledger-speed-toggle').click();
      assert.match(await page.locator('#ledger-speed-toggle').textContent(), /×1/);
      await page.locator('#party-toggle').click();
      await measure('#party-panel', 'preparation');
      const prepareDone = page.locator('#party-panel > footer #prepare-done');
      assert(await prepareDone.isVisible());
      assert((await prepareDone.boundingBox()).height >= 44);
      assert.equal(
        await page
          .locator('.prepare-body')
          .evaluate((node) => getComputedStyle(node).gridTemplateColumns.split(' ').length),
        2,
      );
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
      await page.locator('#prepare-detail .prepare-inspector-col').waitFor({ state: 'visible' });
      await page.locator('#prepare-close').click();
      await page.locator('#party-panel').waitFor({ state: 'hidden' });
      await page.locator('#ledger-close').click();
      await page.locator('#ledger-drawer-host').waitFor({ state: 'hidden' });
      if (viewport.width === 667) await checkDiceContinue(page, output);
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('supplies'));
      await frame.locator('#condenser-open').click();
      await page.locator('[data-forge-page="exchange"]').click();
      await measure('#ether-forge', 'forge');
      await measure('#forge-list', 'forge-list');
      const list = page.locator('#forge-list');
      await swipeScroll(page, list);
      await list.locator('[data-forge-select="mobile-equipment"]').tap();
      const buy = await page.locator('[data-buy-equipment]').boundingBox();
      const dock = await page.locator('#forge-catalog .forge-detail-actions').boundingBox();
      if (!buy || !dock || buy.y < dock.y || buy.y + buy.height > dock.y + dock.height + 1)
        problems.push({ label: 'forge-buy', viewport, buy, dock });
      await measure('#forge-catalog', 'forge-details');
      const description = await page.locator('#forge-catalog .forge-effects').textContent();
      assert(description.includes('技能伤害'));
      assert(!description.includes('skillDamage'));
      await page.locator('[data-forge-close]').click();
      await openCityFacility(page, 'market');
      await measure('#void-shop', 'shop');
      await page.locator('#shop-close').click();
      await travelTownScene(page, 'tavern');
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('table'));
      const tavernDock = page.locator('#daily-hud .daily-dock');
      await tavernDock.waitFor({ state: 'visible' });
      const dockLayout = await tavernDock.evaluate((node) => {
        const { left, right } = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const actions = [...node.querySelectorAll(':scope > button[data-daily]')]
          .filter((button) => button.checkVisibility({ visibilityProperty: true }))
          .map((button) => {
            const { x, y, width } = button.getBoundingClientRect();
            return { id: button.dataset.daily, x, y, width };
          });
        return {
          start: left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
          end: right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight),
          gap: parseFloat(style.columnGap),
          actions,
        };
      });
      const { start, end, gap, actions } = dockLayout;
      assert.deepEqual(
        actions.map(({ id }) => id),
        ['chat', 'invitation', 'dungeon', 'outing'],
        'The tavern dock shows only its four actions in order',
      );
      const actionWidth = (end - start - gap * (actions.length - 1)) / actions.length;
      assert(
        actions.every(
          ({ x, y, width }, index) =>
            Math.abs(x - (start + index * (actionWidth + gap))) < 1 &&
            Math.abs(y - actions[0].y) < 1 &&
            Math.abs(width - actionWidth) < 1,
        ),
        'The visible tavern actions evenly fill one row: ' +
          JSON.stringify({ viewport, dockLayout }),
      );
      await tavernDock.locator('[data-daily="chat"]').tap();
      await measure('#gal-stage', 'chat');
      await page.locator('[data-gal="history"]').click();
      await swipeScroll(page, page.locator('.gal-archive'));
      await page.locator('[data-gal="close"]').click();
      await page.locator('#gal-stage').waitFor({ state: 'hidden' });
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('bookshelf'));
      await frame.locator('#bookshelf-archives').click();
      await measure('#archive-dialog', 'archives');
      for (const tab of ['enemies', 'records', 'memory', 'manual']) {
        await page.locator(`#archive-dialog [data-archive-tab="${tab}"]`).click();
        if (tab === 'enemies') {
          const index = page.locator('#archive-list');
          const taxonomyLayout = await page.evaluate(() => {
            const inspect = (selector) => {
              const node = document.querySelector(selector);
              if (!node) return null;
              const rect = node.getBoundingClientRect();
              const style = getComputedStyle(node);
              const round = (value) => Math.round(value * 100) / 100;
              return {
                hidden: node.hidden,
                text: (node.innerText || '').slice(0, 100),
                rect: {
                  x: round(rect.x),
                  y: round(rect.y),
                  width: round(rect.width),
                  height: round(rect.height),
                  bottom: round(rect.bottom),
                },
                clientHeight: node.clientHeight,
                scrollHeight: node.scrollHeight,
                clientWidth: node.clientWidth,
                scrollWidth: node.scrollWidth,
                css: {
                  display: style.display,
                  flex: style.flex,
                  flexBasis: style.flexBasis,
                  minHeight: style.minHeight,
                  maxHeight: style.maxHeight,
                  padding: style.padding,
                  overflowX: style.overflowX,
                  overflowY: style.overflowY,
                  touchAction: style.touchAction,
                  gridTemplateColumns: style.gridTemplateColumns,
                },
              };
            };
            const categories = document.querySelector('.archive-enemy-categories');
            const list = document.querySelector('#archive-list');
            const viewport = window.visualViewport;
            return {
              viewport: {
                width: innerWidth,
                height: innerHeight,
                devicePixelRatio,
                visualWidth: viewport?.width ?? null,
                visualHeight: viewport?.height ?? null,
                visualScale: viewport?.scale ?? null,
              },
              regions: Object.fromEntries(
                [
                  '#archive-dialog',
                  '#archive-dialog > header',
                  '#archive-dialog .records-body',
                  '.archive-index-col',
                  '.archive-codex-progress',
                  '.archive-enemy-tiers',
                  '.archive-enemy-categories',
                  '#archive-list',
                  '.archive-enemy-export',
                ].map((selector) => [selector, inspect(selector)]),
              ),
              categoryOverflow: getComputedStyle(categories).overflowX,
              categoryTouchAction: getComputedStyle(categories).touchAction,
              categoriesScrollable: categories.scrollWidth > categories.clientWidth,
              categoryButtons: [...categories.querySelectorAll('button')].map((button) => {
                const rect = button.getBoundingClientRect();
                return {
                  id: button.dataset.enemyCategory,
                  width: Math.round(rect.width * 100) / 100,
                  height: Math.round(rect.height * 100) / 100,
                  minHeight: getComputedStyle(button).minHeight,
                };
              }),
              listHeight: list.getBoundingClientRect().height,
              listTouchAction: getComputedStyle(list).touchAction,
              listItems: list.children.length,
            };
          });
          assert(
            taxonomyLayout.listHeight >= 96,
            'The taxonomy filters leave room to browse the enemy list by touch: ' +
              JSON.stringify(taxonomyLayout),
          );
          assert.equal(taxonomyLayout.categoryOverflow, 'auto');
          assert.equal(taxonomyLayout.categoryTouchAction, 'pan-x');
          assert(
            taxonomyLayout.categoriesScrollable,
            'Taxonomy filters fit a horizontal touch strip',
          );
          assert.equal(taxonomyLayout.listTouchAction, 'pan-y');
          await swipeScroll(page, index);
        }
        await measure('#archive-dialog', tab);
      }
      await page.locator('#archive-close').click();
      // Exercise the workshop entry on the mobile request toolbar without an upstream request.
      await page.evaluate(async () => {
        const { createRequestControls } = await import('/src/app/request-controls.js');
        const finish = [];
        const workshop = {
          opens: 0,
          outcomes: [],
          begin() {},
          open() {
            this.opens++;
          },
          finish(id, outcome) {
            this.outcomes.push({ id, outcome });
          },
        };
        const client = createRequestControls(
          { request: () => new Promise((resolve) => finish.push(resolve)), dispose() {} },
          () => ({}),
          () => workshop,
        );
        const kinds = ['character', 'script', 'chat', 'quick-chat', 'summary', 'creation', 'map'];
        window.mobileWait = {
          client,
          workshop,
          finish,
          requests: kinds.map((k) => client.request('generate/' + k, {})),
        };
      });
      assert.equal(await page.locator('[data-workshop-wait]').count(), 7);
      await page.locator('[data-workshop-wait="map"]').click();
      await page.evaluate(async () => {
        const w = window.mobileWait;
        w.finish.forEach((resolve) => resolve({}));
        await Promise.all(w.requests);
      });
      assert.deepEqual(
        await page.evaluate(() => ({
          opens: window.mobileWait.workshop.opens,
          completed: window.mobileWait.workshop.outcomes.length,
        })),
        { opens: 1, completed: 7 },
      );
      await page.evaluate(() => window.mobileWait.client.dispose());
      await page.evaluate(() => demo.startBattle());
      await page.waitForFunction(
        () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
      );
      await page.locator('#round-start').waitFor({ state: 'hidden' });
      // The real ledger entry stays hidden until the chapter curtain has fully exited.
      await page.locator('#chapter-theater').waitFor({ state: 'hidden' });
      await page.locator('#scene-loading').waitFor({ state: 'hidden' });
      await page.locator('#generation-progress').waitFor({ state: 'hidden' });
      await measure('#battle', 'battle');
      await measure('.command-controls', 'battle-controls');
      await checkTimeline(page, viewport);
      const cornerBox = await visibleBox(page.locator('#ledger-corner'));
      const battleHandle = await visibleBox(page.locator('#ledger-handle'));
      const roundBox = await visibleBox(page.locator('#round-label'));
      const overlaps = (a, b) =>
        a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
      assert.equal(
        overlaps(cornerBox, roundBox) || overlaps(battleHandle, roundBox),
        false,
        'Corner bar and edge handle do not overlap round indicator',
      );
      assert(
        battleHandle.x >= 0 &&
          battleHandle.y >= 0 &&
          battleHandle.x + battleHandle.width <= viewport.width + 1 &&
          battleHandle.y + battleHandle.height <= viewport.height + 1 &&
          battleHandle.width >= 24 &&
          battleHandle.height >= 44,
        'Ledger handle remains inside the mobile viewport with a usable touch target',
      );
      await page.locator('#ledger-handle').tap();
      await page.locator('#ledger-drawer-host.is-open').waitFor();
      await page.locator('#ledger-close').tap();
      await page.locator('#ledger-drawer').waitFor({ state: 'hidden' });
      await openLedgerByDrag(page, battleHandle);
      await measure('#ledger-drawer', 'battle-ledger');
      assert.equal(await page.locator('#ledger-drawer [data-daily="service"]').isDisabled(), true);
      assert.equal(await page.locator('#ledger-drawer #party-toggle').isDisabled(), true);
      await page.locator('.ledger-backdrop').tap({ position: { x: 6, y: viewport.height / 2 } });
      await page.locator('#ledger-drawer').waitFor({ state: 'hidden' });
      await page.locator('#backpack-open').click();
      await page.locator('#backpack-dialog.expanded').waitFor();
      await page
        .locator('#backpack-dialog')
        .evaluate((node) =>
          Promise.all(node.getAnimations().map((a) => a.finished.catch(() => {}))),
        );
      assert.equal(
        await page.locator('#backpack-items .bag-item').count(),
        Object.keys(ITEMS).length,
      );
      assert.doesNotMatch(
        await page.locator('#backpack-dialog').textContent(),
        /乡村面包|烹饪食材/,
        'Battle backpack shows only usable combat items, never cooking ingredients',
      );
      await page.screenshot({
        path: path.join(output, 'backpack-battle-' + viewport.width + '.png'),
      });
      await page.keyboard.press('Escape');
      await page.locator('#backpack-dialog').waitFor({ state: 'hidden' });
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
    assert.equal(await game.locator('html').getAttribute('data-game-layout'), 'mobile');
    await game.locator('#ai-open').click();
    await swipeScroll(portrait, game.locator('#ai-dialog'), { rotated: true });
  } finally {
    await portrait.close();
  }
  const desktopLayout = await browser.newPage({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
  });
  try {
    await legacySession(desktopLayout);
    await desktopLayout.goto(baseURL + '/?display=landscape&layout=desktop');
    await desktopLayout.waitForFunction(() => !!window.demo);
    assert.equal(await desktopLayout.locator('html').getAttribute('data-game-layout'), 'desktop');
    assert.equal(await desktopLayout.locator('.prepare-formation-col #prepare-done').count(), 1);
  } finally {
    await desktopLayout.close();
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

export async function androidWindowResizeChecks({ browser, baseURL }) {
  const tablet = { width: 1200, height: 900 };
  const page = await browser.newPage({ viewport: tablet, hasTouch: true });
  try {
    await legacySession(page);
    await page.addInitScript(() => {
      window.wanxiangNativeUpdate = {};
    });
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    const root = page.locator('html');
    assert.equal(await root.getAttribute('data-android-web-view'), '');
    assert.equal(await root.getAttribute('data-game-layout'), 'desktop');
    await page.setViewportSize({ width: 667, height: 375 });
    await page.waitForFunction(() => document.documentElement.dataset.gameLayout === 'mobile');
    await page.setViewportSize(tablet);
    await page.waitForFunction(() => document.documentElement.dataset.gameLayout === 'desktop');
    return { switchesLayoutOnResize: true };
  } finally {
    await page.close();
  }
}
