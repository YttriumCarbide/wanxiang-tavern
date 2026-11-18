import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function apepVfxChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (failure) => errors.push(failure.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /WebGL|GLTFLoader/.test(message.text()))
      errors.push(message.text());
  });
  async function waitForPlayback() {
    await page.waitForFunction(() => window.apepFixture.playbackDone, null, {
      timeout: 15000,
    });
    assert.equal(await page.evaluate(() => window.apepFixture.playbackError), null);
  }

  let checking = 'model setup';
  try {
    const markup = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
      '<script type="module" src="./src/app.js"></script>',
      '',
    );
    await page.route('**/__apep-vfx', (route) =>
      route.fulfill({ contentType: 'text/html', body: markup }),
    );
    await page.goto(new URL('__apep-vfx', baseURL).href);
    const setup = await page.evaluate(async () => {
      const [
        { createBattleView },
        { createSession },
        { createRoster },
        { createTimeline },
        { createOverlordBattle },
        { createPlayback },
        { newBattle, makeAction, enemyTimeline, preview },
      ] = await Promise.all([
        import('/src/scene.js'),
        import('/src/app/session.js'),
        import('/src/app/roster.js'),
        import('/src/app/timeline.js'),
        import('/src/app/overlord-battle.js'),
        import('/src/app/playback.js'),
        import('/src/engine.js'),
      ]);
      const id = 'apepLamb';
      const session = createSession();
      session.runtime.mode = 'battle';
      session.journey.expedition = { id: 'apep-vfx-test', partyIds: [] };
      session.battle.speed = 1;
      const stage = document.querySelector('#stage');
      document.body.classList.add('in-battle');
      document.querySelector('#battle').hidden = false;
      document.querySelector('#inn').hidden = true;
      document.querySelector('#scene-loading').hidden = true;

      function battle(round, enraged = false) {
        const state = newBattle([id]);
        state.phase = 'plan';
        state.round = round;
        for (const hero of state.formation.filter(Boolean)) {
          state.units[hero].hp = 140;
          state.units[hero].maxHp = 140;
        }
        if (enraged) {
          state.units[id].enraged = true;
          state.units[id].hp = Math.floor(state.units[id].maxHp / 3);
        }
        return state;
      }

      session.battle.state = battle(2);
      const view = await createBattleView(stage, () => {}, {
        map: 'ruins',
        enemyIds: [id],
        formation: session.battle.state.formation,
        weather: 'clear',
      });
      session.runtime.view = view;
      const seen = [];
      const audio = [];
      const ctx = {
        session,
        storage: localStorage,
        viewport: { compactHUD: () => false, compactLandscape: () => false, canPlan: () => true },
        audio: { play: (cue) => audio.push(cue), combat() {} },
        selection: { clearSelection() {} },
        generation: { save() {}, recordRound() {} },
        planning: {
          actionLabel: () => 'Fixture cut',
          recompute() {
            session.battle.forecast = preview(session.battle.state, session.battle.plan);
          },
        },
        renderer: {
          render() {
            ctx.timeline.renderTimeline();
            view.setSpeed(session.battle.speed);
            view.draw(
              session.battle.display || session.battle.state,
              session.battle.forecast,
              null,
              id,
              session.battle.playing,
            );
            ctx.overlordBattle.sync();
          },
        },
      };
      ctx.roster = createRoster(ctx);
      ctx.timeline = createTimeline(ctx);
      ctx.overlordBattle = createOverlordBattle(ctx);
      ctx.playback = createPlayback(ctx);
      const playEvent = view.playEvent;
      view.playEvent = (event, before) => {
        const duration = playEvent(event, before);
        if (event.actor === id) {
          seen.push({
            type: event.type,
            clip: event.clip,
            trails: [...stage.querySelectorAll('.apep-strike-trail')].map((el) => el.dataset.trail),
            effects: view.vfxStatus().activeEffects,
            slots: view.scene.getObjectByName('Apep_Plague_Floor').children.length,
            victims: event.statusTriggers?.filter((signal) => signal.type === 'sinkingPlague')
              .length,
          });
        }
        return duration;
      };
      function load(state, plan = []) {
        session.battle.state = state;
        session.battle.plan = plan;
        ctx.planning.recompute();
        ctx.renderer.render();
      }
      load(session.battle.state);
      await view.whenSettled();
      window.apepFixture = {
        seen,
        audio,
        watch(playback) {
          this.playbackDone = false;
          this.playbackError = null;
          void playback
            .catch((failure) => {
              this.playbackError = failure.stack || failure.message;
            })
            .finally(() => {
              this.playbackDone = true;
            });
        },
        entrance() {
          this.watch(ctx.overlordBattle.entrance());
        },
        commit() {
          this.watch(ctx.playback.commit());
        },
        phase() {
          const state = battle(1);
          state.units[id].hp = Math.floor(state.units[id].maxHp * 0.66) + 1;
          const hero = state.formation[0];
          const base = structuredClone(ctx.roster.get(hero));
          base.skills.push({
            id: 'fixture-cut',
            name: 'Fixture cut',
            ap: 1,
            mp: 0,
            target: 'enemy',
            effects: [{ type: 'damage', value: 25, flat: true }],
          });
          state.heroDefinitions[hero] = base;
          const slot = enemyTimeline(state).findIndex((actor) => actor === null);
          load(state, [makeAction(state, hero, 'fixture-cut', id, slot)]);
          this.commit();
        },
        emptySlot() {
          const state = structuredClone(session.battle.state);
          state.formation[0] = null;
          load(state);
          const floor = view.scene.getObjectByName('Apep_Plague_Floor');
          return floor.visible && floor.children[0].material.uniforms.presence.value === 1;
        },
        attackCases() {
          const events = [];
          for (const enraged of [false, true]) {
            for (const round of [1, 2, 3]) {
              const state = battle(round, enraged);
              const result = preview(state, []);
              result.events.forEach((event, index) => {
                if (
                  event.actor === id &&
                  event.clip &&
                  !events.some(({ clip }) => clip === event.clip)
                ) {
                  load(event.after);
                  playEvent(event, result.events[index - 1]?.after || state);
                  events.push({
                    clip: event.clip,
                    playing: view.overlordStatus().mounted[0].playingClip,
                  });
                }
              });
            }
          }
          return events;
        },
        dispose() {
          ctx.overlordBattle.reset();
          ctx.overlordBattle.dispose();
          view.dispose();
        },
      };
      return view.overlordStatus().mounted[0];
    });
    assert(setup.height >= 3.1);
    assert(setup.animations.includes('Apep_Eclipse') && setup.animations.includes('Break_Stagger'));
    await page.screenshot({ path: path.join(output, 'apep-model.png') });
    checking = 'entrance';
    await page.evaluate(() => window.apepFixture.entrance());
    await page.locator('#overlord-cutscene-layer.is-slash[data-overlord-theme="apep"]').waitFor();
    await page.screenshot({ path: path.join(output, 'apep-eclipse-entrance.png') });
    await page
      .locator('#overlord-dialogue-bar [data-dl-speaker]')
      .filter({ hasText: '阿佩普的羔羊' })
      .waitFor();
    await waitForPlayback();
    assert.match(await page.locator('.commit-plague-readout').textContent(), /沉疫.*2/);
    assert.equal(await page.locator('.unit-hit[data-apep-plague="preview"]').count(), 3);

    checking = 'plague cast';
    await page.evaluate(() => window.apepFixture.commit());
    await page.locator('[data-effect="apep-plague-surge"]').waitFor({ state: 'attached' });
    await page.locator('#overlord-dialogue-bar [data-dl-text]').getByText('沉疫').waitFor();
    await page.waitForTimeout(820);
    await page.screenshot({ path: path.join(output, 'apep-plague-cast.png') });
    checking = 'plague settlement';
    await waitForPlayback();
    assert.equal(await page.locator('.unit-hit[data-apep-plague="active"]').count(), 3);
    assert.match(await page.locator('.commit-plague-readout').textContent(), /沉疫 −\d+(?:–\d+)?/);
    assert.equal(await page.locator('#apep-plague-edge').isVisible(), true);
    assert.equal(await page.locator('#apep-plague-edge').getAttribute('data-rear-danger'), '1');
    assert.equal(await page.locator('.time-cell.is-corrupted-slot').count(), 1);
    await page.screenshot({ path: path.join(output, 'apep-plague-field.png') });
    const combat = await page.evaluate(() => window.apepFixture.seen);
    const cast = combat.find((event) => event.clip === 'Apep_Plague');
    assert.equal(cast.slots, 3);
    assert.equal(cast.trails.filter((kind) => kind === 'current').length, 3);
    assert(cast.effects.includes('shadow-tendrils'));
    assert.equal(combat.find((event) => event.type === 'sinkingPlague').victims, 6);
    assert.equal(await page.evaluate(() => window.apepFixture.emptySlot()), true);
    assert.equal(await page.locator('.unit-hit[data-apep-plague="active"]').count(), 2);

    checking = 'eclipse transition';
    await page.evaluate(() => window.apepFixture.phase());
    await page.locator('#overlord-cutscene-layer[data-tone="phase"].is-impact').waitFor();
    await page.screenshot({ path: path.join(output, 'apep-eclipse-phase.png') });
    await waitForPlayback();
    checking = 'attack clips and cleanup';
    const cases = await page.evaluate(() => window.apepFixture.attackCases());
    assert.deepEqual(cases.map((entry) => entry.clip).sort(), [
      'Apep_Eclipse',
      'Apep_Gaze',
      'Apep_Plague',
      'Apep_Shell',
      'Apep_Splash',
      'Apep_Tide',
    ]);
    assert(cases.every(({ clip, playing }) => clip === playing));
    await page.evaluate(() => window.apepFixture.dispose());
    assert.equal(
      await page.locator('.apep-screen-surge, .apep-strike-trail, .commit-plague-readout').count(),
      0,
    );
    assert.equal(await page.locator('#apep-plague-edge').count(), 0);
    assert.deepEqual(errors, []);
    return {
      attacks: cases.length,
      floorSlots: cast.slots,
      eclipseTransition: true,
      liftedOnExit: true,
    };
  } catch (failure) {
    throw new Error(`Apep ${checking}: ${failure.stack || failure.message}`, { cause: failure });
  } finally {
    await page.close();
  }
}
