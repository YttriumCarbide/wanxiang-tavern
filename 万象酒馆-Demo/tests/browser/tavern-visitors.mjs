import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';
import { newLibrary, officialCharacter } from '../../src/ai/library.js';
import { TAVERN_VISITOR_SPOTS } from '../../src/content/tavern-visitors.js';

/** Real textures, camera projection, room depth and canvas input; no image-only UI stand-ins. */
export async function tavernVisitorsChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await legacySession(page);
  const library = newLibrary();
  library.characters.push(
    officialCharacter('edith'),
    officialCharacter('pandora'),
    officialCharacter('luo-gongxu'),
    officialCharacter('silica-laps'),
  );
  await page.addInitScript((library) => {
    if (origin === 'null') return;
    localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
    localStorage.setItem(
      'wanxiang.generation-options.v1',
      JSON.stringify({ developerMode: true, skipAiGeneration: true, tavernVisitors: false }),
    );
  }, library);
  try {
    await page.goto(baseURL + '/?display=landscape');
    const inn = page.frameLocator('#inn-frame iframe');
    await inn.locator('#visitor-refresh').waitFor({ state: 'visible' });
    const canvas = inn.locator('canvas');
    await canvas.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const start = performance.now();
          const check = () => {
            const state = window.assetPreview?.visitors();
            if (state?.characters.length === 3 && state.characters.every((actor) => actor.loaded))
              resolve();
            else if (performance.now() - start > 20000) reject(Error('Visitors did not load'));
            else requestAnimationFrame(check);
          };
          check();
        }),
    );
    const visited = new Map();
    const blockedSpots = new Set();
    let initial;
    for (let index = 0; index < 15; index++) {
      await canvas.evaluate(
        () =>
          new Promise((resolve) => {
            const check = () =>
              window.assetPreview.visitors().characters.length === 3
                ? resolve()
                : requestAnimationFrame(check);
            check();
          }),
      );
      const state = await canvas.evaluate(() => window.assetPreview.visitors());
      if (!initial) initial = state;
      assert.equal(new Set(state.characters.map((actor) => actor.spot)).size, 3);
      for (const actor of state.characters) {
        assert.equal(actor.position[1], 0, 'feet share the room floor');
        const spots = visited.get(actor.key) || new Set();
        spots.add(actor.spot);
        visited.set(actor.key, spots);
      }
      const blocked = await canvas.evaluate(async () => {
        const THREE = await import('/vendor/build/three.module.js');
        const view = window.assetPreview;
        const ray = new THREE.Raycaster();
        const down = new THREE.Vector3(0, -1, 0);
        return view
          .visitors()
          .characters.filter((actor) => {
            const [x, , z] = actor.position;
            return [
              [0, 0],
              [-0.24, 0],
              [0.24, 0],
              [0, -0.24],
              [0, 0.24],
            ].some(([dx, dz]) => {
              ray.set(new THREE.Vector3(x + dx, 1.8, z + dz), down);
              const hit = ray.intersectObject(view.model, true)[0];
              return hit && hit.point.y > 0.1;
            });
          })
          .map((actor) => actor.spot);
      });
      blocked.forEach((spot) => blockedSpots.add(spot));
      if (index === 0) await page.screenshot({ path: path.join(output, 'visitors-room.png') });
      await inn.locator('#visitor-refresh').click();
    }
    assert.equal(visited.size, 5);
    assert.equal(
      new Set([...visited.values()].flatMap((spots) => [...spots])).size,
      TAVERN_VISITOR_SPOTS.length,
    );
    assert.deepEqual([...blockedSpots], [], 'all spawn locations keep the body clear of furniture');
    // Inspect the reported bar location directly after checking every refresh point.
    for (
      let attempt = 0;
      attempt < 9 &&
      !(await canvas.evaluate(() =>
        window.assetPreview.visitors().characters.some((actor) => actor.spot === 'bar-front'),
      ));
      attempt++
    )
      await inn.locator('#visitor-refresh').click();
    const target = await canvas.evaluate(() => {
      const view = window.assetPreview;
      const actor = view.visitors().characters.find((entry) => entry.spot === 'bar-front');
      const [x, , z] = actor.position;
      view.camera.position.set(x, 1.25, z + 2.4);
      view.camera.lookAt(x, 1.05, z);
      return actor.key;
    });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, 'visitor-close.png') });
    const point = await canvas.evaluate((_canvas, key) => {
      const view = window.assetPreview;
      const actor = view.visitors().characters.find((entry) => entry.key === key);
      const position = view.camera.position.clone().fromArray(actor.position);
      position.y = 1.05;
      position.project(view.camera);
      return { x: ((position.x + 1) * innerWidth) / 2, y: ((1 - position.y) * innerHeight) / 2 };
    }, target);
    await canvas.click({ position: point });
    await page.locator('#gal-stage[data-workspace="chat"]').waitFor({ state: 'visible' });
    const selected = await page
      .locator('#chat-participants input:checked')
      .evaluateAll((nodes) => nodes.map((node) => node.value));
    assert.equal(selected.length, 1);
    assert(selected[0].includes(target === 'yuexi' ? 'aegis' : target));
    await page.locator('[data-gal="close"]').click();
    await page.locator('#gal-stage').waitFor({ state: 'hidden' });
    await page.locator('#ai-open').click();
    await page.locator('[data-ai-tab="game"]').click();
    assert.equal(await page.locator('[data-generation-option="tavernVisitors"]').count(), 0);
    await page.locator('#ai-close').click();
    assert.equal(await inn.locator('#visitor-refresh').isVisible(), true);
    assert.deepEqual(errors, []);
    return {
      officialSprites: 5,
      spawnPointsPerCharacter: 9,
      actualCanvasSelection: true,
      alwaysEnabledWithLegacyFalse: true,
      initial,
    };
  } finally {
    await page.close();
  }
}
