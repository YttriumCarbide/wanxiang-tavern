import { legacySession } from './legacy-session.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';

export async function audioChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await legacySession(page);
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    assert.equal(await page.evaluate(() => demo.getAudioStatus().state), 'locked');
    await page.locator('#audio-toggle').click();
    assert.equal(await page.locator('#audio-panel').isVisible(), true);
    assert.equal(await page.locator('#audio-playlist .audio-track-item').count(), 0);
    assert.equal(await page.locator('#audio-playlist-empty').isVisible(), true);
    await page.locator('#audio-close').click();
    await page
      .frameLocator('iframe')
      .locator('#status')
      .waitFor({ state: 'detached', timeout: 60000 });
    await page
      .frameLocator('iframe')
      .locator('canvas')
      .click({ position: { x: 30, y: 100 } });
    await page.waitForFunction(
      () =>
        ['inn', 'inn2', 'inn3'].includes(demo.getAudioStatus().track) &&
        demo.getAudioStatus().scene === 'inn' &&
        demo.getAudioStatus().rms > 0.0001,
    );
    await page.waitForFunction(
      () => {
        const status = demo.getAudioStatus();
        return status.sfxLoaded.length === status.sfxTotal && !status.sfxError;
      },
      null,
      { timeout: 30000 },
    );
    await page.locator('#audio-toggle').click();
    assert.equal(await page.locator('#audio-panel').isVisible(), true);
    const initialTavernTrack = await page.evaluate(() => demo.getAudioStatus().track);
    assert.equal(await page.locator('#audio-playlist .audio-track-item').count(), 1);
    assert.equal(await page.locator('[data-track-id="warlordBoss"]').count(), 0);
    assert.equal(await page.locator(`[data-track-id="${initialTavernTrack}"]`).count(), 1);
    await page.locator('#audio-close').click();
    for (const [key, value] of [
      ['music', 19],
      ['effects', 47],
    ]) {
      await page.locator('#audio-toggle').click();
      await page.locator(`#audio-${key}`).evaluate((input, value) => {
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
      await page.keyboard.press('Escape');
    }
    await page.locator('#audio-toggle').click();
    await page.locator('#audio-music-mute').click();
    await page.locator('#audio-effects-mute').click();
    await page.waitForFunction(() => demo.getAudioStatus().rms < 0.00001);
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    assert.deepEqual(await page.evaluate(() => demo.getAudioStatus().settings), {
      music: 0.19,
      effects: 0.47,
      musicMuted: true,
      effectsMuted: true,
    });
    assert.deepEqual(await page.evaluate(() => demo.getAudioStatus().unlockedTracks), [
      initialTavernTrack,
    ]);
    assert.equal(await page.evaluate(() => demo.getAudioStatus().state), 'locked');
    await page.locator('#audio-toggle').click();
    assert.equal(await page.locator('#audio-playlist .audio-track-item').count(), 1);
    await page.locator('#audio-music-mute').click();
    await page.locator('#audio-effects-mute').click();
    await page.keyboard.press('Escape');
    await page.evaluate(() => demo.startBattle());
    await page.waitForFunction(
      () => demo.getStatus().mode === 'battle' && demo.getAudioStatus().track === 'battle',
    );
    await page.waitForFunction(
      () => demo.getAudioStatus().tracks === 1 && demo.getAudioStatus().rms > 0.0001,
    );
    await page.locator('#audio-toggle').click();
    assert.equal(await page.locator('#audio-playlist .audio-track-item').count(), 2);
    await page.locator(`[data-audio-preview="${initialTavernTrack}"]`).click();
    await page.waitForFunction(
      (trackId) => demo.getAudioStatus().track === trackId,
      initialTavernTrack,
    );
    const previewStatus = await page.evaluate(() => demo.getAudioStatus());
    assert.equal(previewStatus.previewTrack, initialTavernTrack);
    assert.equal(previewStatus.activeTrack, 'battle');
    await page.locator(`[data-audio-select="${initialTavernTrack}"]`).click();
    await page.waitForFunction(
      (trackId) =>
        demo.getAudioStatus().pinnedTrack === trackId && demo.getAudioStatus().track === trackId,
      initialTavernTrack,
    );
    await page.locator('#audio-auto-scene').click();
    await page.waitForFunction(
      () => demo.getAudioStatus().pinnedTrack === null && demo.getAudioStatus().track === 'battle',
    );
    await page.locator('#audio-music-mute').click();
    await page.waitForTimeout(200);
    await page.keyboard.press('Escape');
    await page.locator('[data-unit="morrow"]').click();
    assert(
      (await page.evaluate(() => demo.getAudioStatus().voices)) > 0,
      'Selection creates a real sound source',
    );
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('#audio-toggle').click();
    await page.locator('#audio-panel').waitFor({ state: 'visible' });
    const panel = await page.locator('#audio-panel').boundingBox();
    assert(panel.x >= 0 && panel.x + panel.width <= 844 && panel.y + panel.height <= 390);
    await page.screenshot({ path: path.join(output, 'audio-landscape.png') });
    await page.keyboard.press('Escape');
    await page.evaluate(() => demo.returnInn());
    await page.waitForFunction(
      () =>
        ['inn', 'inn2', 'inn3'].includes(demo.getAudioStatus().track) &&
        demo.getAudioStatus().tracks === 1,
    );
    const disposed = await page.evaluate(() => {
      demo.dispose();
      return demo.getAudioStatus();
    });
    assert.equal(disposed.disposed, true);
    assert.equal(disposed.tracks, 0);
    assert.equal(disposed.voices, 0);
    assert.deepEqual(errors, []);
    return {
      firstGestureInTavern: true,
      twoMusicTracks: true,
      crossfadeCleanup: true,
      decodedSfx: true,
      selectionSound: true,
      muteAndPersistence: true,
      landscape: true,
      disposedWithoutLeaks: true,
    };
  } finally {
    await page.close();
  }
}

/** Decode the supplied files and exercise map/Boss routing without replaying a dungeon. */
export async function battleMusicChecks({ browser, baseURL }) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.route('**/__music-fixture', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<button id="unlock">启用声音</button>' }),
    );
    await page.goto(new URL('__music-fixture', baseURL).href);
    await page.evaluate(async () => {
      const [{ createAudioMixer }, { encounterMusic, locationMusic, MUSIC }] = await Promise.all([
        import('/src/audio/mixer.js'),
        import('/src/audio/config.js'),
      ]);
      const mixer = createAudioMixer({ music: 0.2 });
      document.querySelector('#unlock').onclick = () => mixer.unlock();
      window.musicFixture = { mixer, encounterMusic, locationMusic, MUSIC };
    });
    await page.locator('#unlock').click();
    const routes = [
      { map: 'frost', boss: false, tracks: ['frostBattle'] },
      { map: 'forest', boss: false, tracks: ['battle'] },
      { map: 'ruins', boss: true, tracks: ['ruinsBoss', 'boss', 'boss3'] },
      { map: 'frost', boss: true, tracks: ['ruinsBoss', 'boss', 'boss3'] },
      { map: 'forge', boss: false, tracks: ['forgeBattle'] },
      { map: 'tide', boss: false, tracks: ['battle'] },
      { map: 'mill', boss: true, enemyIds: ['alchemicalPuppet'], tracks: ['puppetBoss'] },
      {
        map: 'graystone-quarry',
        boss: true,
        enemyIds: ['darkscaleWarlord'],
        tracks: ['warlordBoss'],
      },
      { map: 'tide', boss: true, enemyIds: ['radiantWyvern'], tracks: ['wyvernBoss'] },
      {
        map: 'black-market',
        boss: true,
        enemyIds: ['banditSyndicateKing'],
        tracks: ['syndicateBoss'],
      },
    ];
    const lockedBefore = await page.evaluate(() => {
      window.musicFixture.mixer.preview('boss3');
      window.musicFixture.mixer.selectTrack('boss3');
      return window.musicFixture.mixer.status();
    });
    assert.equal(lockedBefore.previewTrack, null);
    assert.equal(lockedBefore.pinnedTrack, null);
    for (const route of routes) {
      await page.evaluate((route) => {
        const { mixer, encounterMusic } = window.musicFixture;
        mixer.setScene(encounterMusic(route));
      }, route);
      await page.waitForFunction(
        (allowed) => {
          const status = window.musicFixture.mixer.status();
          return allowed.includes(status.track) && status.tracks === 1 && status.rms > 0.00001;
        },
        route.tracks,
        { timeout: 20000 },
      );
    }
    for (const scene of ['street', 'inn2', 'inn3', 'ruinsBoss', 'boss3']) {
      const expected = await page.evaluate((scene) => {
        const { mixer, locationMusic, MUSIC } = window.musicFixture;
        const target = MUSIC[scene] ? scene : locationMusic(scene);
        mixer.setScene(target);
        return target;
      }, scene);
      await page.waitForFunction(
        (track) => {
          const status = window.musicFixture.mixer.status();
          return status.track === track && status.tracks === 1 && status.rms > 0.00001;
        },
        expected,
        { timeout: 20000 },
      );
    }
    const status = await page.evaluate(() => {
      const { mixer } = window.musicFixture;
      const status = mixer.status();
      mixer.dispose();
      return {
        loaded: status.loaded,
        unlockedTracks: status.unlockedTracks,
        after: mixer.status(),
      };
    });
    assert(status.unlockedTracks.includes('boss3'));
    assert(routes.every((route) => route.tracks.some((id) => status.loaded.includes(id))));
    assert.equal(status.after.tracks, 0);
    assert.equal(status.after.disposed, true);
    assert.deepEqual(errors, []);
    return {
      suppliedMp3Decoded: true,
      mapAndBossRouting: routes,
      crossfadeCleanup: true,
      disposal: true,
    };
  } finally {
    await page.evaluate(() => window.musicFixture?.mixer.dispose());
    await page.close();
  }
}
