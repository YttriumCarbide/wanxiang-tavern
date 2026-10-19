import assert from 'node:assert/strict';
import path from 'node:path';

async function faceCorridorDoor(page, id) {
  await page.evaluate((id) => {
    const { camera, doors } = window.corridorPreview;
    const [x, , z] = doors[id].anchor;
    const desired = Math.atan2(camera.position.x - x, camera.position.z - z);
    const delta = Math.atan2(
      Math.sin(desired - camera.rotation.y),
      Math.cos(desired - camera.rotation.y),
    );
    const key = delta > 0 ? 'ArrowLeft' : 'ArrowRight';
    for (let index = 0; index < Math.round(Math.abs(delta) / 0.1); index++)
      window.dispatchEvent(new KeyboardEvent('keydown', { key }));
  }, id);
  await page.locator(`#spots .spot[data-door="${id}"]`).waitFor({ state: 'visible' });
}

async function checkRoomArrival(page, room) {
  const state = await page.evaluate(() => window.corridorPreview.getState());
  const door = { a: 'roomA', b: 'roomB', master: 'master' }[room];
  const z = { a: 2.2, b: 0, master: -2.2 }[room];
  assert.equal(state.entryDoor, door);
  assert(state.position[0] < -0.7 && Math.abs(state.position[2] - z) < 0.01);
  assert(state.facing[0] > 0, 'Leaving a bedroom must face out into the corridor');
  await faceCorridorDoor(page, door);
  assert(
    await page.locator(`#spots .spot[data-door="${door}"]`).isEnabled(),
    'The door just used remains reachable after turning around',
  );
}

/** Tavern corridor, both guest-room variants and the master bedroom. */
export async function guestRoomChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.goto(new URL('tavern.html', baseURL).href);
    await page.waitForFunction(() => window.modelReady === true, null, { timeout: 60000 });
    assert.equal(
      await page.evaluate(() => Boolean(window.assetPreview.places.corridorDoor)),
      true,
      'The tavern must expose the existing entrance as the corridor door',
    );
    await page.evaluate(() => window.assetPreview.placeNow('corridorDoor'));
    await page.locator('#corridor-open').waitFor({ state: 'visible' });
    const corridorNavigation = page.waitForURL('**/corridor.html', { timeout: 12000 });
    await page.locator('#corridor-open').click();
    await corridorNavigation;
    await page.waitForFunction(() => window.corridorReady === true, null, { timeout: 60000 });
    assert.equal(new URL(page.url()).pathname.endsWith('/corridor.html'), true);
    const doors = await page
      .locator(
        '#spots .spot.visible[data-door=roomA],#spots .spot.visible[data-door=roomB],#spots .spot.visible[data-door=master]',
      )
      .count();
    assert.equal(doors, 3, 'Arrival at the tavern door must face the other three room doors');
    const arrival = await page.evaluate(() => window.corridorPreview.getState());
    assert(arrival.position[0] > 0.7 && Math.abs(arrival.position[2] - 1) < 0.1);
    assert.equal(arrival.entryDoor, 'tavern');
    assert(arrival.facing[0] < -0.8);
    assert(!arrival.visible.includes('tavern'));
    await page.waitForFunction(
      () => Number(getComputedStyle(document.querySelector('#scene-fade')).opacity) === 0,
    );
    await page.screenshot({ path: path.join(output, 'corridor-arrival.png') });
    await page.evaluate(() => {
      const { camera } = window.corridorPreview;
      camera.position.set(0, 1.46, -2.65);
      camera.lookAt(0, 1.35, -4.3);
    });
    await page.locator('[data-door=shop].visible').waitFor();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(output, 'corridor-supplies.png') });
    await page.evaluate(() => {
      const { camera } = window.corridorPreview;
      camera.position.set(0.85, 1.46, 1);
      camera.lookAt(-1.52, 1.38, 0);
    });
    const chatButton = await page.locator('#corridor-talk').boundingBox();
    assert(Math.abs(chatButton.x + chatButton.width / 2 - 720) < 1);
    assert(chatButton.y > 740, 'Chat belongs at the bottom center');

    await faceCorridorDoor(page, 'tavern');
    const immediateReturn = page.waitForURL('**/tavern.html?return=corridor');
    await page.locator('#spots .spot[data-door="tavern"]').click();
    await immediateReturn;
    await page.waitForFunction(() => window.modelReady === true, null, { timeout: 60000 });
    await page.evaluate(() => {
      for (let index = 0; index < 31; index++)
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    });
    await page.locator('#corridor-open').waitFor({ state: 'visible' });
    const reenter = page.waitForURL('**/corridor.html');
    await page.locator('#corridor-open').click();
    await reenter;
    await page.waitForFunction(() => window.corridorReady === true, null, { timeout: 60000 });

    const roomNavigation = page.waitForURL('**/guest-room.html?room=a', { timeout: 12000 });
    await page.locator('#spots .spot[data-door="roomA"]').click();
    await roomNavigation;
    await page.waitForFunction(() => window.guestRoomReady === true, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.guestRoomPreview.kind), 'a');
    assert.equal(
      await page.locator('#spots .spot[data-place="door"]').count(),
      0,
      'The doorway must be an exit portal, not another walking spot',
    );
    const visibleSpots = await page.locator('#spots .spot.visible').count();
    assert(
      visibleSpots >= 2,
      'The guest room should present several discoverable spots on arrival',
    );
    const firstSpot = page.locator('#spots .spot.visible').first();
    const destination = await firstSpot.getAttribute('data-place');
    await firstSpot.click();
    await page.waitForFunction(
      (place) => window.guestRoomPreview.getState().current === place,
      destination,
      { timeout: 8000 },
    );

    for (const place of ['bed', 'window', 'desk', 'wardrobe', 'washstand', 'stove']) {
      await page.evaluate((id) => window.guestRoomPreview.placeNow(id), place);
      assert.equal(await page.evaluate(() => window.guestRoomPreview.getState().current), place);
    }
    const bedView = await page.evaluate(() => {
      const view = window.guestRoomPreview;
      view.placeNow('bed');
      const p = view.camera.position;
      return { x: p.x, y: p.y, z: p.z };
    });
    assert(
      bedView.x > -3 && bedView.x < -0.9 && bedView.z > -3.2 && bedView.z < -1.1,
      'The bed viewpoint must sit on the bed itself',
    );
    await page.evaluate(() => {
      const view = window.guestRoomPreview;
      view.camera.position.set(0, 1.36, 2.5);
      view.look(Math.PI, 0);
    });
    await page.locator('#leave-room').waitFor({ state: 'visible' });
    assert((await page.locator('#leave-room').textContent()).includes('离开房间'));
    await page.waitForTimeout(350);
    const stable = await page.evaluate(async () => {
      const view = window.guestRoomPreview;
      const gl = view.renderer.getContext();
      const hashPixels = () => {
        const width = gl.drawingBufferWidth,
          height = gl.drawingBufferHeight,
          pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let hash = 2166136261;
        for (let index = 0; index < pixels.length; index += 17)
          hash = Math.imul(hash ^ pixels[index], 16777619) >>> 0;
        return hash;
      };
      view.renderer.setAnimationLoop(null);
      view.renderer.shadowMap.autoUpdate = false;
      view.renderer.shadowMap.needsUpdate = true;
      view.renderer.render(view.scene, view.camera);
      view.renderer.shadowMap.needsUpdate = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        view.renderer.render(view.scene, view.camera);
        gl.finish();
        if (gl.isContextLost()) throw new Error('Guest-room WebGL context was lost');
        const first = hashPixels();
        view.renderer.render(view.scene, view.camera);
        gl.finish();
        if (first === hashPixels()) return true;
        await new Promise((resolve) => setTimeout(resolve, 40));
      }
      return false;
    });
    assert(stable, 'The static guest-room render must not flicker between frames');
    await page.screenshot({ path: path.join(output, 'guest-room.png') });

    const backToCorridor = page.waitForURL('**/corridor.html?from=a', { timeout: 12000 });
    await page.locator('#leave-room').click();
    await backToCorridor;
    await page.waitForFunction(() => window.corridorReady === true, null, { timeout: 60000 });
    await checkRoomArrival(page, 'a');
    await faceCorridorDoor(page, 'master');

    const masterNavigation = page.waitForURL('**/master-bedroom.html', { timeout: 12000 });
    await page.locator('#spots .spot[data-door="master"]').click();
    await masterNavigation;
    await page.waitForFunction(() => window.guestRoomReady === true, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.guestRoomPreview.kind), 'master');
    const masterPlaces = await page.evaluate(() => Object.keys(window.guestRoomPreview.places));
    assert(
      [
        'bed',
        'window',
        'desk',
        'wardrobe',
        'washstand',
        'stove',
        'sitting',
        'bookshelf',
        'door',
      ].every((place) => masterPlaces.includes(place)),
      'The larger master bedroom must expose its full set of visual points',
    );
    assert(
      (await page.locator('#spots .spot.visible').count()) >= 2,
      'The master bedroom should present its own discoverable spots',
    );
    await page.screenshot({ path: path.join(output, 'master-bedroom.png') });
    await page.evaluate(() => window.guestRoomPreview.placeNow('door'));
    const masterBack = page.waitForURL('**/corridor.html?from=master', { timeout: 12000 });
    await page.locator('#leave-room').click();
    await masterBack;
    await page.waitForFunction(() => window.corridorReady === true, null, { timeout: 60000 });
    await checkRoomArrival(page, 'master');
    await faceCorridorDoor(page, 'roomB');

    const variantNavigation = page.waitForURL('**/guest-room.html?room=b', { timeout: 12000 });
    await page.locator('#spots .spot[data-door="roomB"]').click();
    await variantNavigation;
    await page.waitForFunction(() => window.guestRoomReady === true, null, { timeout: 60000 });
    assert.equal(await page.evaluate(() => window.guestRoomPreview.kind), 'b');
    await page.screenshot({ path: path.join(output, 'guest-room-b.png') });
    await page.evaluate(() => window.guestRoomPreview.placeNow('door'));
    const variantBack = page.waitForURL('**/corridor.html?from=b', { timeout: 12000 });
    await page.locator('#leave-room').click();
    await variantBack;
    await page.waitForFunction(() => window.corridorReady === true, null, { timeout: 60000 });
    await checkRoomArrival(page, 'b');

    const returnNavigation = page.waitForURL('**/tavern.html?return=corridor', { timeout: 12000 });
    await page.locator('#leave-corridor').click();
    await returnNavigation;
    await page.waitForFunction(() => window.modelReady === true, null, { timeout: 60000 });
    assert.deepEqual(errors, [], 'The room route should not raise page errors');
    return {
      doors,
      destination,
      rooms: ['a', 'b', 'master'],
      returned: true,
      arrivalByDoor: true,
      turnBackAndReenter: true,
      chatBottomCenter: true,
    };
  } finally {
    await page.close();
  }
}
