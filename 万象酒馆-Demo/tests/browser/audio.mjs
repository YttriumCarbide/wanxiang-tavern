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
    await page
      .frameLocator('iframe')
      .locator('#status')
      .waitFor({ state: 'detached', timeout: 60000 });
    await page
      .frameLocator('iframe')
      .locator('canvas')
      .click({ position: { x: 30, y: 100 } });
    await page.waitForFunction(
      () => demo.getAudioStatus().track === 'inn' && demo.getAudioStatus().rms > 0.0001,
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
    for (const [key, value] of [
      ['music', 19],
      ['effects', 47],
    ]) {
      await page.locator(`#audio-${key}`).evaluate((input, value) => {
        input.value = String(value);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }, value);
    }
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
    assert.equal(await page.evaluate(() => demo.getAudioStatus().state), 'locked');
    await page.locator('#audio-toggle').click();
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
    await page.locator('#audio-music-mute').click();
    await page.waitForTimeout(200);
    await page.locator('#audio-toggle').click();
    await page.locator('[data-unit="morrow"]').click();
    assert(
      (await page.evaluate(() => demo.getAudioStatus().voices)) > 0,
      'Selection creates a real sound source',
    );
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('#audio-toggle').click();
    const panel = await page.locator('#audio-panel').boundingBox();
    assert(panel.x >= 0 && panel.x + panel.width <= 844 && panel.y + panel.height < 390);
    await page.screenshot({ path: path.join(output, 'audio-landscape.png') });
    await page.keyboard.press('Escape');
    await page.evaluate(() => demo.returnInn());
    await page.waitForFunction(
      () => demo.getAudioStatus().track === 'inn' && demo.getAudioStatus().tracks === 1,
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
      const [{ createAudioMixer }, { encounterMusic, MUSIC }] = await Promise.all([
        import('/src/audio/mixer.js'),
        import('/src/audio/config.js'),
      ]);
      const mixer = createAudioMixer({ music: 0.2 });
      document.querySelector('#unlock').onclick = () => mixer.unlock();
      window.musicFixture = { mixer, encounterMusic, MUSIC };
    });
    await page.locator('#unlock').click();
    const routes = [
      { map: 'frost', boss: false, track: 'frostBattle' },
      { map: 'forest', boss: false, track: 'battle' },
      { map: 'ruins', boss: true, track: 'ruinsBoss' },
      { map: 'frost', boss: true, track: 'boss' },
      { map: 'forge', boss: false, track: 'forgeBattle' },
      { map: 'tide', boss: false, track: 'battle' },
    ];
    for (const route of routes) {
      await page.evaluate((route) => {
        const { mixer, encounterMusic } = window.musicFixture;
        mixer.setScene(encounterMusic(route));
      }, route);
      await page.waitForFunction(
        (track) => {
          const status = window.musicFixture.mixer.status();
          return status.track === track && status.tracks === 1 && status.rms > 0.00001;
        },
        route.track,
        { timeout: 20000 },
      );
    }
    const status = await page.evaluate(() => {
      const { mixer } = window.musicFixture;
      const status = mixer.status();
      mixer.dispose();
      return { loaded: status.loaded, after: mixer.status() };
    });
    assert(routes.every((route) => status.loaded.includes(route.track)));
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
