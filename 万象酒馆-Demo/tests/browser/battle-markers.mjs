import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Production timeline and playback consume actual engine events without model calls. */
export async function battleMarkerChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (failure) => errors.push(failure.message));
  try {
    const document = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
      '<script type="module" src="./src/app.js"></script>',
      '',
    );
    await page.route('**/__battle-markers', (route) =>
      route.fulfill({ contentType: 'text/html', body: document }),
    );
    await page.goto(new URL('__battle-markers', baseURL).href);
    await page.evaluate(async () => {
      const [{ createSession }, { createRoster }, { createTimeline }, engine, data, emblems] =
        await Promise.all([
          import('/src/app/session.js'),
          import('/src/app/roster.js'),
          import('/src/app/timeline.js'),
          import('/src/engine.js'),
          import('/src/data.js'),
          import('/src/emblems.js'),
        ]);
      document.body.classList.add('in-battle');
      document.querySelector('#battle').hidden = false;
      document.querySelector('#inn').hidden = true;
      document.querySelector('#scene-loading').hidden = true;
      const definitions = Object.fromEntries(
        ['marker-left', 'marker-right'].map((id, index) => [
          id,
          {
            ...structuredClone(data.DEFINITIONS.hound),
            id,
            name: index ? '未禁锢敌人' : '禁锢敌人',
            hp: 200,
            speed: index ? 1 : 2,
            buffs: {},
            intents: [{ name: '攻击', slot: 0, effects: [{ type: 'damage', value: 1 }] }],
          },
        ]),
      );
      const heroDefinitions = Object.fromEntries(
        data.HEROES.map((hero) => [
          hero.id,
          {
            ...structuredClone(hero),
            buffs: {},
            skills: [],
          },
        ]),
      );
      const state = engine.newBattle(Object.keys(definitions), heroDefinitions, definitions);
      state.phase = 'plan';
      state.round = 1;
      const actor = state.formation[0];
      const binder = state.formation[1];
      Object.assign(state.heroDefinitions[actor], {
        emblemId: emblems.OVERLOAD_EMBLEM_ID,
        limit: 2,
        skills: [
          {
            id: 'burst',
            name: '过载斩',
            ap: 1,
            mp: 4,
            target: 'enemy',
            effects: [{ type: 'damage', value: 10 }],
          },
        ],
      });
      state.heroDefinitions[binder].skills = [
        {
          id: 'bind',
          name: '束缚',
          ap: 1,
          mp: 0,
          target: 'enemy',
          effects: [{ type: 'buff', buff: 'bind', value: 1 }],
        },
      ];
      Object.assign(state.units[actor], { combined: 3, mp: 30 });
      const session = createSession();
      session.runtime.mode = 'battle';
      session.battle.state = state;
      session.battle.plan = [
        engine.makeAction(state, actor, emblems.OVERLOAD_SKILL.id, actor, 0),
        engine.makeAction(state, actor, 'burst', state.enemyIds[0], 1),
        engine.makeAction(state, binder, 'bind', state.enemyIds[0], 2),
      ];
      session.battle.forecast = engine.preview(state, session.battle.plan);
      if (!session.battle.forecast.valid)
        throw Error(JSON.stringify(session.battle.forecast.invalid));
      const context = {
        session,
        viewport: { compactHUD: () => false, compactLandscape: () => false, canPlan: () => true },
        planning: { actionLabel: (action) => action.skill || action.kind },
      };
      context.roster = createRoster(context);
      const timeline = createTimeline(context);
      timeline.renderTimeline();
      window.markerFixture = { session, timeline, engine, actor, binder };
    });
    assert.equal(await page.locator('.skill-repeat').count(), 1);
    assert.equal(await page.locator('.skill-repeat').textContent(), '×2');
    assert.equal(await page.locator('.time-cell.bound .timeline-chain').count(), 1);
    assert.match(await page.locator('.time-cell.bound').getAttribute('data-tooltip'), /禁锢/);
    assert.match(await page.locator('.time-action.repeated b').textContent(), /过载斩/);
    await page.screenshot({ path: path.join(output, 'overload-and-bind.png') });
    await page.evaluate(() => {
      const { session, timeline, engine, binder } = window.markerFixture;
      const state = session.battle.state;
      state.enemyDefinitions[state.enemyIds[0]].speed = 5;
      session.battle.plan = [engine.makeAction(state, binder, 'bind', state.enemyIds[0], 1)];
      session.battle.forecast = engine.preview(state, session.battle.plan);
      timeline.renderTimeline();
    });
    assert.equal(await page.locator('.skill-repeat').count(), 0);
    assert.equal(await page.locator('.timeline-chain').count(), 0);
    const animation = await page.evaluate(async () => {
      const { session, timeline, engine, actor, binder } = window.markerFixture;
      const { createPlayback } = await import('/src/app/playback.js');
      const { createBattleView } = await import('/src/scene.js');
      const state = session.battle.state;
      state.enemyDefinitions[state.enemyIds[0]].speed = 2;
      state.units[actor].buffs.overload = 1;
      state.units[actor].mp = 30;
      session.battle.plan = [engine.makeAction(state, actor, 'burst', state.enemyIds[0], 0)];
      session.battle.speed = 4;
      session.battle.forecast = engine.preview(state, session.battle.plan);
      const expected = session.battle.forecast.events.filter((event) => event.type === 'hero');
      const view = await createBattleView(document.querySelector('#stage'), () => {}, {
        heroDefinitions: state.heroDefinitions,
        enemyDefinitions: state.enemyDefinitions,
        enemyIds: state.enemyIds,
        formation: state.formation,
      });
      const played = [];
      session.journey.expedition = { id: 'animation-fixture', partyIds: [] };
      session.runtime.view = {
        snapFormationOnNextDraw: view.snapFormationOnNextDraw,
        playEvent(event, before) {
          if (event.type === 'hero')
            played.push({
              index: event.repeatIndex,
              time: performance.now(),
              hp: event.after.units[state.enemyIds[0]].hp,
            });
          return view.playEvent(event, before);
        },
      };
      const context = {
        session,
        selection: { clearSelection() {} },
        planning: {
          recompute() {
            session.battle.forecast = engine.preview(session.battle.state, session.battle.plan);
          },
        },
        generation: { save() {}, recordRound() {} },
        audio: { play() {}, combat() {} },
        renderer: {
          render() {
            timeline.renderTimeline();
            view.setSpeed(4);
            view.draw(
              session.battle.display || session.battle.state,
              session.battle.forecast,
              actor,
              state.enemyIds[0],
              session.battle.playing,
            );
          },
        },
      };
      context.renderer.render();
      await createPlayback(context).commit();
      view.dispose();
      return {
        played,
        expected: expected.map((event) => event.after.units[state.enemyIds[0]].hp),
        binder,
      };
    });
    assert.deepEqual(
      animation.played.map((event) => event.index),
      [1, 2],
    );
    assert.deepEqual(
      animation.played.map((event) => event.hp),
      animation.expected,
    );
    assert(
      animation.played[1].time - animation.played[0].time >= 180,
      'Both real attack animations start on separate beats',
    );
    assert.deepEqual(errors, []);
    return {
      overloadUsesActualEvent: true,
      bindMatchesCancelledSlot: true,
      lateBindDoesNotCancelPast: true,
      repeatedAttackAnimations: 2,
    };
  } finally {
    await page.close();
  }
}
