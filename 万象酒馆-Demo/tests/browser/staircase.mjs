import assert from 'node:assert/strict';
import path from 'node:path';

export async function staircaseChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(baseURL + '/tavern.html');
    await page.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    const walls = await page.evaluate(async () => {
      const THREE = await import('/vendor/build/three.module.js');
      const view = window.assetPreview;
      view.placeNow('stairs');
      const ray = new THREE.Raycaster();
      const samples = [
        [
          [7.5, 4.44, 4.2],
          [-1, 0, 0],
        ],
        [
          [7.5, 4.44, 4.2],
          [1, 0, 0],
        ],
        [
          [7.5, 4.44, 4.2],
          [0, 0, 1],
        ],
        [
          [7.5, 4.44, 2.2],
          [-1, 0, 0],
        ],
      ];
      const result = samples.map(([origin, direction]) => {
        ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...direction));
        const hit = ray.intersectObject(view.model, true)[0];
        return hit ? { distance: hit.distance, x: hit.point.x } : null;
      });
      view.camera.position.set(8.5, 4.44, 4.2);
      view.camera.lookAt(7.04, 4.2, 4.2);
      return result;
    });
    assert(
      walls.every((hit) => hit !== null && hit.distance < 1.6),
      JSON.stringify(walls),
    );
    assert(walls[0].x <= 7.21, 'the inward doorway is reached before any landing railing');
    await page.screenshot({ path: path.join(output, 'upstairs-inward-door.png') });
    await page.evaluate(() => window.assetPreview.placeNow('stairs'));
    await page.locator('#corridor-open').click();
    await page.waitForURL('**/corridor.html', { timeout: 15000 });
    await page.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    assert.equal(await page.evaluate(() => window.corridorPreview.getState().entryDoor), 'tavern');
    await page.locator('#leave-corridor').click();
    await page.waitForURL('**/tavern.html?return=corridor');
    await page.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await page.waitForFunction(() => !window.assetPreview.getState().moving);
    const position = await page.evaluate(() => window.assetPreview.camera.position.toArray());
    assert(Math.abs(position[0] - 7.92) < 0.02 && Math.abs(position[1] - 1.52) < 0.02);
    assert.deepEqual(errors, []);
    return { inwardDoor: true, enclosedLanding: true, ascentAndDescent: true };
  } finally {
    await page.close();
  }
}
