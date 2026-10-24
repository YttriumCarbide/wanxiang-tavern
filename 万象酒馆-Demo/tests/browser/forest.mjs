import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

export async function forestChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && /assets\//.test(response.url()))
      errors.push(response.status() + ' ' + response.url());
  });
  try {
    await legacySession(page);
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    const frame = page.frameLocator('#inn-frame iframe');
    await frame.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    for (const viewport of [
      { width: 1440, height: 836 },
      { width: 960, height: 480 },
    ]) {
      await page.setViewportSize(viewport);
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('bookshelf'));
      await frame.locator('#bookshelf-archives').waitFor({ state: 'visible' });
      const rects = await frame.locator('[data-shelf-action]').evaluateAll((nodes) =>
        nodes.map((node) => {
          const r = node.getBoundingClientRect();
          return {
            top: r.top,
            bottom: r.bottom,
            left: r.left,
            right: r.right,
            label: node.textContent,
          };
        }),
      );
      assert.deepEqual(
        rects.map((r) => r.label),
        ['归档', '记录', '总结'],
      );
      for (const [i, r] of rects.entries()) {
        assert(
          r.left >= 0 && r.right <= viewport.width && r.top >= 0 && r.bottom <= viewport.height,
        );
        if (i)
          assert(rects[i - 1].bottom + 4 < r.top, 'Separate buttons on the three shelf levels');
      }
      assert.equal(await frame.locator('#bookshelf-open').count(), 0);
      await page.screenshot({
        path: path.join(output, 'bookshelf-three-levels-' + viewport.width + '.png'),
      });
    }
    for (const [action, dialog] of [
      ['archives', 'archive-dialog'],
      ['records', 'journey-records'],
      ['memory', 'memory-dialog'],
    ]) {
      await frame.locator('#bookshelf-' + action).click();
      await page.locator('#' + dialog).waitFor({ state: 'visible' });
      await page.locator('#' + dialog).evaluate((node) => node.close());
    }
    await page.setViewportSize({ width: 1440, height: 836 });
    for (const mode of ['official', 'npc', 'chaos', 'infinite']) {
      await frame.locator('canvas').evaluate(() => window.assetPreview.placeNow('summon'));
      await frame.locator('#summon-open').click();
      const button = page.locator('[data-summon-mode="' + mode + '"]');
      await button.waitFor({ state: 'visible' });
      const before = await button.boundingBox();
      // Sample the same live transition for left and right buttons instead of only its endpoint.
      const movement = await button.evaluate(async (node) => {
        const initial = node.getBoundingClientRect();
        node.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const animations = node.getAnimations();
        await new Promise((resolve) => setTimeout(resolve, 160));
        const middle = node.getBoundingClientRect();
        await Promise.all(animations.map((a) => a.finished.catch(() => {})));
        const end = node.getBoundingClientRect();
        return {
          transitions: animations.map((a) => a.transitionProperty),
          initial: { x: initial.x, y: initial.y },
          middle: { x: middle.x, y: middle.y },
          end: { x: end.x, y: end.y, width: end.width, height: end.height },
        };
      });
      assert(movement.transitions.includes('translate'), mode + ' has a real movement transition');
      const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      assert(distance(movement.initial, movement.middle) > 3, mode + ' visibly moves');
      assert(distance(movement.middle, movement.end) > 3, mode + ' does not jump to the endpoint');
      assert(Math.abs(movement.end.x + movement.end.width / 2 - 720) < 1);
      assert(Math.abs(movement.end.y + movement.end.height / 2 - 418) < 1);
      assert.equal(movement.end.width, before.width);
      assert.equal(movement.end.height, before.height);
      assert.equal(await frame.locator('#summon-open').isVisible(), false);
      await page.locator('#summon-choice-close').click();
    }
    await page.goto(baseURL + '/artbook.html');
    await page.waitForFunction(() => window.artbook && !window.artbook.status().loading);
    const loaded = await page.evaluate(async () => {
      window.artbook.dispose();
      document
        .querySelectorAll('aside,footer,#atlas-loading')
        .forEach((node) => (node.hidden = true));
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const { FOREST_ENEMIES, FOREST_BOSSES } = await import('/src/content/forest-adversaries.js');
      const enemies = [...FOREST_ENEMIES, ...FOREST_BOSSES];
      const records = [];
      for (const enemy of enemies) {
        const model = (await new GLTFLoader().loadAsync('/assets/' + enemy.model)).scene;
        let meshes = 0;
        model.traverse((object) => {
          if (!object.isMesh) return;
          meshes++;
          object.geometry.dispose();
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            material.dispose();
        });
        records.push({ id: enemy.id, meshes });
      }
      const { createBattleView } = await import('/src/scene.js');
      const { newBattle, preview, advance, enemyTimeline } = await import('/src/engine.js');
      const stage = document.querySelector('#art-stage');
      stage.style.inset = '0';
      const enemyIds = ['moonCrown', 'moonEye', 'moonRoot'];
      const state = advance(preview(newBattle(enemyIds), []));
      window.forestView = await createBattleView(stage, () => {}, {
        map: 'forest',
        enemyIds,
        weather: 'clear',
      });
      window.forestView.draw(state, preview(state, []), null, null);
      return { records, order: enemyTimeline(state).filter(Boolean) };
    });
    assert.equal(loaded.records.length, 24);
    assert(loaded.records.every((record) => record.meshes >= 4));
    assert.deepEqual(loaded.order, ['moonCrown', 'moonEye', 'moonRoot']);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(output, 'mother-three-parts.png') });
    await page.evaluate(async () => {
      window.forestView.dispose();
      const { FOREST_ENEMIES, FOREST_BOSSES } = await import('/src/content/forest-adversaries.js');
      const atlas = document.createElement('section');
      atlas.style.cssText =
        'position:fixed;inset:0;z-index:100;background:#142428;display:grid;grid-template-columns:repeat(6,1fr);padding:16px;gap:8px;overflow:auto';
      for (const enemy of [...FOREST_ENEMIES, ...FOREST_BOSSES]) {
        const card = document.createElement('figure');
        card.style.cssText =
          'margin:0;display:flex;flex-direction:column;align-items:center;color:#dfd4ad;font:14px sans-serif';
        const img = document.createElement('img');
        img.src = '/assets/portraits/' + enemy.portrait + '.svg';
        img.style.cssText = 'width:128px;height:180px;object-fit:contain';
        const label = document.createElement('figcaption');
        label.textContent = enemy.name;
        card.append(img, label);
        atlas.append(card);
      }
      document.body.append(atlas);
    });
    await page.waitForFunction(() =>
      [...document.images].every((img) => img.complete && img.naturalWidth > 0),
    );
    await page.screenshot({ path: path.join(output, 'forest-enemies-atlas.png') });
    assert.deepEqual(errors, []);
    return {
      models: 24,
      chapters: 6,
      bookshelfLevels: 3,
      animatedSummonMethods: 4,
      motherActionOrder: loaded.order,
    };
  } finally {
    await page.close();
  }
}
