import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Actual engine deaths drive the actual WebGL card renderer; no six-room replay. */
export async function cardDeathChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /WebGL|Shader|GL_INVALID/.test(message.text()))
      errors.push(message.text());
  });
  try {
    const document = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
      '<script type="module" src="./src/app.js"></script>',
      '',
    );
    await page.route('**/__card-death-fixture', (route) =>
      route.fulfill({ contentType: 'text/html', body: document }),
    );
    await page.goto(new URL('__card-death-fixture', baseURL).href);
    await page.evaluate(async () => {
      const [{ createBattleView }, engine, { createAudioMixer }] = await Promise.all([
        import('/src/scene.js'),
        import('/src/engine.js'),
        import('/src/audio/mixer.js'),
      ]);
      document.body.classList.add('in-battle');
      document.querySelector('#battle').hidden = false;
      document.querySelector('#inn').hidden = true;
      document.querySelector('#scene-loading').hidden = true;
      window.deathFixture = {
        audio: createAudioMixer({ musicMuted: true }),
        view: null,
        async start(id) {
          this.view?.dispose();
          const before = engine.newBattle([id]);
          before.units[id].hp = 1;
          before.units[id].block = 0;
          before.units[id].buffs = {};
          const result = engine.preview(before, [
            engine.makeAction(before, before.formation[0], 'attack', id, 0),
          ]);
          const event = result.events.find((item) => item.after.units[id].hp === 0);
          if (!event) throw Error('Fixture attack must kill its target through the engine');
          const view = await createBattleView(document.querySelector('#stage'), () => {}, {
            enemyIds: [id],
          });
          this.view = view;
          view.draw(before, engine.preview(before, []), null, null);
          view.snapFormationOnNextDraw();
          this.before = before;
          this.event = event;
          view.draw(event.after, { final: event.after }, null, null, true);
          this.duration = view.playEvent(event, before);
          this.audio.combat(event, before, 1);
          return this.duration;
        },
      };
      const unlock = document.createElement('button');
      unlock.id = 'death-audio';
      unlock.textContent = '启用声音';
      unlock.style.cssText = 'position:fixed;top:0;left:0;z-index:99999';
      unlock.onclick = () => window.deathFixture.audio.unlock();
      document.body.append(unlock);
    });
    await page.locator('#death-audio').click();
    await page.waitForFunction(() => window.deathFixture.audio.status().state === 'running');
    await page.locator('#death-audio').evaluate((button) => button.remove());
    const smallDuration = await page.evaluate(() => window.deathFixture.start('mossSlime'));
    assert(smallDuration <= 1000, 'Death debris cannot lengthen the attack presentation');
    await page.waitForFunction(() => !window.deathFixture.view.isAnimating());
    await page.waitForFunction(() => window.deathFixture.view.deathStatus().lowestChunkBase > 0.28);
    const small = await page.evaluate(() => window.deathFixture.view.deathStatus());
    const floor = await page.evaluate(() => window.deathFixture.view.floorStatus());
    assert(floor.stabilizedMeshes > 0 && floor.hiddenCoplanarArea > 0.1);
    assert(small.active === 1 && small.chunks >= 5 && small.chunks <= 7 && !small.boss);
    assert.equal(small.model, 'voxel-debris');
    assert.equal(
      small.distinctChunkShapes,
      small.chunks,
      'Every chunk must have a different voxel topology',
    );
    assert.equal(small.texturedMeshes, 0, 'Death model must never reuse portrait fragments');
    assert(small.lowestChunkBase > 0.28, 'Voxel model must remain above the stone pedestal');
    await page.screenshot({ path: path.join(output, 'enemy-voxel-bloom.png') });
    await page.waitForFunction(() => window.deathFixture.view.deathStatus().active === 0);
    const settled = await page.evaluate(() => {
      const fixture = window.deathFixture;
      const roots = [1, 2, 3].map((index) =>
        fixture.view.model.getObjectByName(`Placeholder_Enemy_0${index}`),
      );
      fixture.view.draw(fixture.event.after, { final: fixture.event.after }, null, null);
      fixture.view.playEvent(fixture.event, fixture.before);
      return { ...fixture.view.deathStatus(), visible: roots.some((root) => root.visible) };
    });
    assert.equal(settled.completed, 1);
    assert.equal(settled.active, 0, 'Repeated presentation cannot play death twice');
    assert.equal(settled.visible, false, 'A later draw must not resurrect the dead card');
    const sheen = await page.evaluate(async () => {
      const { view, event } = window.deathFixture;
      view.draw(event.after, { final: event.after }, 'aegis', null);
      const card = document.querySelector('[data-unit="aegis"]');
      const animationName = getComputedStyle(card, '::before').animationName;
      const animation = card
        .getAnimations({ subtree: true })
        .find((item) => item.animationName === animationName);
      if (!animation) throw Error('Selected card must have its sweep animation');
      animation.pause();
      const duration = animation.effect.getTiming().duration;
      function sample(time) {
        animation.currentTime = time;
        const style = getComputedStyle(card, '::before');
        return { x: parseFloat(style.backgroundPositionX), opacity: Number(style.opacity) };
      }
      return {
        before: sample(duration - 1),
        after: sample(duration + 1),
        middle: sample(duration / 2),
      };
    });
    assert(
      sheen.before.opacity < 0.01 && sheen.after.opacity < 0.01,
      'Reset must happen while invisible',
    );
    assert(
      Math.abs(sheen.before.x - sheen.after.x) < 1,
      'Sweep position must match across the loop seam',
    );
    assert(sheen.middle.opacity > 0.9, 'The sweep must still light the selected card');
    const bossDuration = await page.evaluate(() => window.deathFixture.start('bossGate'));
    assert.equal(
      bossDuration,
      smallDuration,
      'The same attack keeps its duration when killing a Boss',
    );
    await page.waitForFunction(() => {
      const status = window.deathFixture.view.deathStatus();
      return status.boss && status.zoom > 1.5 && status.lowestChunkBase > 0.28;
    });
    const boss = await page.evaluate(() => window.deathFixture.view.deathStatus());
    const sound = await page.evaluate(() => window.deathFixture.audio.status());
    assert(
      sound.voices > 0 && sound.rms > 0.0001,
      'Boss close-up plays real audio after the normal hit has ended',
    );
    assert(boss.boss && boss.zoom > 1.5 && boss.chunks > small.chunks && boss.chunks <= 10);
    assert.equal(boss.texturedMeshes, 0);
    assert.equal(await page.locator('.boss-death-cinema').count(), 1);
    await page.screenshot({ path: path.join(output, 'boss-death-closeup.png') });
    await page.waitForFunction(() => window.deathFixture.view.deathStatus().active === 0);
    assert.equal(await page.locator('.boss-death-cinema').count(), 0);
    assert.equal(
      await page
        .locator('#battle')
        .evaluate((element) => element.classList.contains('boss-finisher')),
      false,
    );
    assert.equal(await page.evaluate(() => window.deathFixture.view.camera.zoom), 1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.evaluate(() =>
      window.deathFixture.audio.setPreferences({ musicMuted: true, effectsMuted: true }),
    );
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => window.deathFixture.start('bossTide'));
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => window.deathFixture.view.camera.zoom), 1);
    assert.equal(await page.locator('.boss-death-cinema').count(), 0);
    assert.equal(await page.evaluate(() => window.deathFixture.audio.status().voices), 0);
    await page.evaluate(() => window.deathFixture.view.dispose());
    assert.equal(await page.locator('.boss-death-cinema').count(), 0);
    assert.deepEqual(errors, []);
    return {
      realEngineEvents: true,
      unifiedVoxelModel: true,
      normalChunks: small.chunks,
      bossChunks: boss.chunks,
      portraitFragments: 0,
      compactBurstThenFade: true,
      selectionSweepLoop: true,
      deadCardStaysGone: true,
      singleEffectPerDeath: true,
      bossCameraRestored: true,
      corpsesIndependentOfTurn: true,
      bossDeathAudio: true,
      coplanarFloorSurfacesResolved: true,
      reducedMotion: true,
      disposalDuringDeath: true,
      errors,
    };
  } finally {
    await page.evaluate(() => window.deathFixture?.audio.dispose()).catch(() => {});
    await page.close();
  }
}
