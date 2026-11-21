import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Real engine Overlord moves drive the actual battle view / playback / overlord
 * battle modules. No fabricated events, no controller edits. The fixture exposes
 * only window.overlordVfxFixture.
 */
export async function overlordVfxChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (failure) => errors.push(failure.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /WebGL|Shader|GL_INVALID|GLTFLoader/.test(message.text()))
      errors.push(message.text());
  });

  async function waitForPlayback() {
    await page.waitForFunction(() => window.overlordVfxFixture.playbackDone, null, {
      timeout: 20000,
    });
    const failure = await page.evaluate(() => window.overlordVfxFixture.playbackError);
    assert.equal(failure, null, `Playback failed: ${failure}`);
  }

  async function assertBadgeGeometry(badgeSelector, labelSelector) {
    const geometry = await page.evaluate(
      ({ badgeSelector, labelSelector }) => {
        const badge = document.querySelector(badgeSelector);
        if (!badge) return { missing: true };
        const badgeRect = badge.getBoundingClientRect();
        const badgeStyle = getComputedStyle(badge);
        const label = badge.querySelector(labelSelector);
        if (!label) return { missingLabel: true };
        const labelRect = label.getBoundingClientRect();
        const labelStyle = getComputedStyle(label);
        const container = badge.closest('[data-unit], [data-rear]');
        const containerRect = container ? container.getBoundingClientRect() : null;
        return {
          missing: false,
          badgeVisible: badge.offsetParent !== null && badgeStyle.visibility !== 'hidden',
          badgeHeight: badgeRect.height,
          labelHeight: labelRect.height,
          labelWhiteSpace: labelStyle.whiteSpace,
          badgeLeft: badgeRect.left,
          badgeRight: badgeRect.right,
          containerLeft: containerRect ? containerRect.left : null,
          containerRight: containerRect ? containerRect.right : null,
        };
      },
      { badgeSelector, labelSelector },
    );
    assert(!geometry.missing, `Badge ${badgeSelector} must be present`);
    assert(!geometry.missingLabel, `Badge ${badgeSelector} must contain ${labelSelector}`);
    assert(geometry.badgeVisible, `Badge ${badgeSelector} must be visible`);
    assert(
      geometry.badgeHeight <= 30,
      `Badge ${badgeSelector} height ${geometry.badgeHeight}px must be <= 30px`,
    );
    assert(
      geometry.labelHeight > 0 && geometry.labelHeight <= 20,
      `Badge ${badgeSelector} label height ${geometry.labelHeight}px must be nonzero and <= 20px`,
    );
    assert.equal(
      geometry.labelWhiteSpace,
      'nowrap',
      `Badge ${badgeSelector} label must use white-space: nowrap`,
    );
    if (geometry.containerLeft !== null) {
      const tolerance = 2;
      assert(
        geometry.badgeLeft >= geometry.containerLeft - tolerance &&
          geometry.badgeRight <= geometry.containerRight + tolerance,
        `Badge ${badgeSelector} (${geometry.badgeLeft}–${geometry.badgeRight}) exceeds card (${geometry.containerLeft}–${geometry.containerRight})`,
      );
    }
  }

  let checking = 'fixture setup';
  try {
    const markup = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
      '<script type="module" src="./src/app.js"></script>',
      '',
    );
    await page.route('**/__overlord-vfx', (route) =>
      route.fulfill({ contentType: 'text/html', body: markup }),
    );
    await page.goto(new URL('__overlord-vfx', baseURL).href);

    await page.evaluate(async () => {
      const [
        { createBattleView },
        { createSession },
        { createRoster },
        { createTimeline },
        { createOverlordBattle },
        { createPlayback },
        { encounterSpec },
        engine,
      ] = await Promise.all([
        import('/src/scene.js'),
        import('/src/app/session.js'),
        import('/src/app/roster.js'),
        import('/src/app/timeline.js'),
        import('/src/app/overlord-battle.js'),
        import('/src/app/playback.js'),
        import('/src/data.js'),
        import('/src/engine.js'),
      ]);
      const { newEncounter, preview, advance, enemyTimeline, makeAction } = engine;

      document.body.classList.add('in-battle');
      document.querySelector('#battle').hidden = false;
      document.querySelector('#inn').hidden = true;
      document.querySelector('#scene-loading').hidden = true;
      const stage = document.querySelector('#stage');

      const session = createSession();
      session.runtime.mode = 'battle';
      session.journey.expedition = { id: 'animation-fixture', partyIds: [] };
      session.battle.speed = 1;

      const seen = [];
      let view = null;
      let ctx = null;
      let originalPlayEvent = null;

      function buildContext() {
        const localCtx = {
          session,
          storage: localStorage,
          viewport: { compactHUD: () => false, compactLandscape: () => false, canPlan: () => true },
          audio: { play() {}, combat() {} },
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
              localCtx.timeline.renderTimeline();
              view.setSpeed(session.battle.speed);
              view.draw(
                session.battle.display || session.battle.state,
                session.battle.forecast,
                null,
                null,
                session.battle.playing,
              );
              localCtx.overlordBattle.sync();
            },
          },
        };
        localCtx.roster = createRoster(localCtx);
        localCtx.timeline = createTimeline(localCtx);
        localCtx.overlordBattle = createOverlordBattle(localCtx);
        localCtx.playback = createPlayback(localCtx);
        return localCtx;
      }

      function captureDom() {
        const fx = [...document.querySelectorAll('[data-overlord-effect]')].map((el) => ({
          fx: el.dataset.overlordEffect,
          unitId: el.dataset.unitId,
          role: el.dataset.effectRole,
          destinationId: el.dataset.destinationId,
          opacity: Number(getComputedStyle(el).opacity),
        }));
        const badge = document.querySelector('.overlord-darkscale-badge');
        const iron = badge ? Number(badge.dataset.iron) : null;
        const cards = [...document.querySelectorAll('[data-unit]')]
          .filter((el) => el.offsetParent !== null)
          .map((el) => el.dataset.unit);
        return { fx, iron, cards };
      }

      function wrapPlayEvent() {
        originalPlayEvent = view.playEvent;
        view.playEvent = (event, before) => {
          const duration = originalPlayEvent(event, before);
          const dom = captureDom();
          seen.push({
            type: event.type,
            statusTriggers: (event.statusTriggers || []).map((signal) => ({
              type: signal.type,
              id: signal.id,
              actor: signal.actor,
              target: signal.target,
              targets: signal.targets,
            })),
            at: event.at,
            actor: event.actor,
            target: event.target,
            heroHpBefore: Object.fromEntries(
              before.formation.filter(Boolean).map((id) => [id, before.units[id].hp]),
            ),
            heroHpAfter: Object.fromEntries(
              event.after.formation.filter(Boolean).map((id) => [id, event.after.units[id].hp]),
            ),
            fx: dom.fx,
            iron: dom.iron,
            cards: dom.cards,
          });
          return duration;
        };
      }

      async function mount(id) {
        if (view) {
          ctx.overlordBattle.reset();
          ctx.overlordBattle.dispose();
          view.dispose();
          view = null;
        }
        seen.length = 0;
        const initial = newEncounter({ ...encounterSpec(4, id), level: 10 }, null, 4);
        const state = advance(preview(initial, []));
        ensureHeroesSurvive(state);
        session.battle.state = state;
        session.battle.plan = [];
        session.battle.playing = false;
        view = await createBattleView(stage, () => {}, {
          map: state.map,
          enemyIds: [id],
          formation: state.formation,
          weather: 'clear',
        });
        session.runtime.view = view;
        ctx = buildContext();
        ctx.planning.recompute();
        ctx.renderer.render();
        view.snapFormationOnNextDraw();
        await view.whenSettled();
        wrapPlayEvent();
        return state;
      }

      function ensureHeroesSurvive(state) {
        for (const hero of state.formation.filter(Boolean)) {
          const unit = state.units[hero];
          if (unit) {
            unit.hp = Math.max(unit.hp, 400);
            unit.maxHp = Math.max(unit.maxHp, 400);
          }
        }
      }

      function start() {
        this.playbackDone = false;
        this.playbackError = null;
        const run = ctx.playback.commit();
        void Promise.resolve(run)
          .catch((failure) => {
            this.playbackError = failure.stack || failure.message;
          })
          .finally(() => {
            this.playbackDone = true;
          });
      }

      window.overlordVfxFixture = {
        seen,
        playbackDone: true,
        playbackError: null,
        async load(id) {
          const state = await mount(id);
          ensureHeroesSurvive(state);
          ctx.renderer.render();
          await view.whenSettled();
          return { id, round: state.round };
        },
        start,
        dispose() {
          if (view) {
            ctx.overlordBattle.reset();
            ctx.overlordBattle.dispose();
            view.dispose();
            view = null;
          }
          seen.length = 0;
        },
        // Expose engine helpers for the test to drive real authored moves.
        engine: { newEncounter, encounterSpec, preview, advance, enemyTimeline, makeAction },
        session,
        get view() {
          return view;
        },
        get ctx() {
          return ctx;
        },
      };
    });

    // ---------------------------------------------------------------------
    // 1. Bandit Syndicate King — black-market hidden weapon lock
    // ---------------------------------------------------------------------
    checking = 'bandit hidden weapon lock';
    await page.evaluate(() => window.overlordVfxFixture.load('banditSyndicateKing'));
    const weapon = await page.evaluate(() => {
      const fixture = window.overlordVfxFixture;
      const state = fixture.session.battle.state;
      const hidden = state.activeHiddenWeapons || {};
      const weapon = hidden.banditSyndicateKing;
      const id = weapon?.id;
      if (!id) throw Error('Boss must expose an active hidden weapon');
      return id;
    });
    await page
      .locator(`.overlord-weapon-pill[data-weapon="${weapon}"]`)
      .waitFor({ state: 'visible', timeout: 10000 });
    await assertBadgeGeometry(
      `.overlord-weapon-pill[data-weapon="${weapon}"]`,
      '.overlord-weapon-pill-name',
    );
    await page.evaluate(() => {
      window.overlordVfxFixture.session.battle.speed = 2;
      window.overlordVfxFixture.start();
    });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-overlord-effect="hiddenWeaponLock"]');
        return el && Number(getComputedStyle(el).opacity) > 0.18;
      },
      null,
      { timeout: 20000 },
    );
    await page.screenshot({ path: path.join(output, 'black-crow-lock.png') });
    await waitForPlayback();
    const banditSeen = await page.evaluate(() => window.overlordVfxFixture.seen);
    const lockIndex = banditSeen.findIndex((entry) =>
      entry.fx.some((item) => item.fx === 'hiddenWeaponLock'),
    );
    const firstAttack = banditSeen.findIndex(
      (entry) => entry.actor === 'banditSyndicateKing' && entry.type === 'enemy',
    );
    assert(lockIndex >= 0, 'hiddenWeaponLock must be observed in a real playEvent');
    assert.equal(banditSeen[lockIndex].at, 0, 'hiddenWeaponLock must use the opening time slot');
    assert.deepEqual(
      banditSeen[lockIndex].heroHpAfter,
      banditSeen[lockIndex].heroHpBefore,
      'The lock beat must finish before enemy damage changes hero HP',
    );
    assert(
      banditSeen[lockIndex].fx.some(
        (item) => item.unitId === 'banditSyndicateKing' && item.role === 'mark',
      ),
      'Lock cue must anchor to the boss card',
    );
    assert(firstAttack >= 0, 'The real Black Crow round must contain a boss attack');
    assert(lockIndex < firstAttack, 'hiddenWeaponLock must precede the first bandit attack');
    assert(banditSeen.some((entry) => entry.type === 'hiddenWeaponLock'));

    // ---------------------------------------------------------------------
    // 2. Darkscale Warlord — graystone-quarry tactical rounds
    // ---------------------------------------------------------------------
    checking = 'warlord round one (slash then rally)';
    await page.evaluate(() => window.overlordVfxFixture.load('darkscaleWarlord'));
    await assertBadgeGeometry('.overlord-darkscale-badge', ':scope > span:last-child');
    await page.evaluate(() => {
      const fixture = window.overlordVfxFixture;
      const state = fixture.session.battle.state;
      if (state.round !== 1 || state.phase !== 'plan')
        throw Error(`Expected round 1 plan state, got ${state.phase}/${state.round}`);
      fixture.session.battle.speed = 2;
      fixture.ctx.planning.recompute();
      fixture.ctx.renderer.render();
    });
    await page.evaluate(() => window.overlordVfxFixture.start());
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-overlord-effect="warlordRally"]');
        return el && Number(getComputedStyle(el).opacity) > 0.18;
      },
      null,
      { timeout: 20000 },
    );
    await page.screenshot({ path: path.join(output, 'warlord-rally.png') });
    await waitForPlayback();
    const summoned = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('[data-unit^="riftDarkDust:"]')];
      return cards.map((el) => ({
        id: el.dataset.unit,
        visible: el.offsetParent !== null,
        alive: !el.classList.contains('is-dead'),
      }));
    });
    assert.equal(summoned.length, 2, 'Rally must summon two riftDarkDust units');
    assert(
      summoned.every((unit) => unit.visible && unit.alive),
      'Summoned riftDarkDust must be mounted, alive and visible',
    );
    const rallySeen = await page.evaluate(() => window.overlordVfxFixture.seen);
    const rallyEntry = rallySeen.find((entry) =>
      entry.fx.some((item) => item.fx === 'warlordRally'),
    );
    assert(rallyEntry, 'warlordRally must be observed');
    assert(
      rallyEntry.fx.some((item) => item.unitId === 'darkscaleWarlord' && item.role === 'origin'),
      'Rally cue must originate from the commander',
    );
    assert.equal(
      rallyEntry.fx.filter((item) => item.role === 'target').length,
      2,
      'Rally cues must mark each summoned minion',
    );
    assert(
      rallySeen.some((entry) => entry.fx.some((item) => item.fx === 'eclipsescaleGrow')),
      'eclipsescaleGrow must be observed during round one',
    );

    checking = 'warlord round two (rally then consume)';
    await page.evaluate(() => {
      const fixture = window.overlordVfxFixture;
      const state = fixture.session.battle.state;
      if (state.round !== 2) throw Error(`Expected round 2, got ${state.round}`);
      fixture.ctx.planning.recompute();
      fixture.ctx.renderer.render();
    });
    await page.evaluate(() => window.overlordVfxFixture.start());
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-overlord-effect="warlordConsume"]');
        return el && Number(getComputedStyle(el).opacity) > 0.18;
      },
      null,
      { timeout: 20000 },
    );
    await page.screenshot({ path: path.join(output, 'warlord-consume.png') });
    await waitForPlayback();
    const afterConsume = await page.evaluate(() => {
      const fixture = window.overlordVfxFixture;
      const remaining = document.querySelectorAll('[data-unit^="riftDarkDust:"]').length;
      const death = fixture.view.deathStatus();
      const bossBadge = document.querySelector('.overlord-darkscale-badge');
      return {
        remaining,
        deathActive: death.active,
        deathCount: death.count ?? death.completed ?? 0,
        bossBadge: Boolean(bossBadge),
      };
    });
    assert.equal(afterConsume.remaining, 0, 'Consume must remove both summoned units');
    assert.equal(afterConsume.deathActive, 0, 'Consume must not trigger death effects');
    assert.equal(afterConsume.deathCount, 0, 'Consume must not register death effects');
    assert(afterConsume.bossBadge, 'Darkscale boss badge must be present');
    const consumeSeen = await page.evaluate(() => window.overlordVfxFixture.seen);
    const consumeEntry = consumeSeen.find((entry) =>
      entry.fx.some((item) => item.fx === 'warlordConsume'),
    );
    assert(consumeEntry, 'warlordConsume must be observed');
    const consumeTrails = consumeEntry.fx.filter((item) => item.role === 'transfer');
    assert.equal(consumeTrails.length, 2, 'Consume must animate both minion-to-boss transfers');
    const rallyTargets = new Set(
      (rallyEntry.statusTriggers || []).flatMap((signal) => signal.targets || []),
    );
    assert(
      consumeTrails.every(
        (item) => item.destinationId === 'darkscaleWarlord' && rallyTargets.has(item.unitId),
      ),
      'Transfer trails must lead from the rallied minions to the boss',
    );
    const consumeTargets = new Set(
      (consumeEntry.statusTriggers || []).flatMap((signal) => signal.targets || []),
    );
    assert(
      [...consumeTargets].some((target) => rallyTargets.has(target)),
      'Consume must target a unit that Rally summoned (causal connection)',
    );

    // ---------------------------------------------------------------------
    // 2b. True engine debuff-only action: iron 2 -> 0 via authoritative events
    // ---------------------------------------------------------------------
    checking = 'warlord iron shed via debuff-only action';
    const shed = await page.evaluate(() => {
      const fixture = window.overlordVfxFixture;
      const { enemyTimeline } = fixture.engine;
      const state = structuredClone(fixture.session.battle.state);
      if (state.round !== 3 || state.phase !== 'plan')
        throw Error(`Expected round 3 plan state, got ${state.phase}/${state.round}`);
      const boss = state.units.darkscaleWarlord;
      boss.buffs.iron = 2;
      const hero = state.formation.find(Boolean);
      const base = structuredClone(fixture.ctx.roster.get(hero));
      base.skills.push({
        id: 'fixture-shed',
        name: 'Fixture shed',
        ap: 1,
        mp: 0,
        target: 'enemy',
        effects: [
          { type: 'buff', buff: 'vulnerable', value: 1 },
          { type: 'buff', buff: 'weak', value: 1 },
        ],
      });
      state.heroDefinitions[hero] = base;
      const slot = enemyTimeline(state).findIndex((actor) => actor === null);
      const action = fixture.engine.makeAction(
        state,
        hero,
        'fixture-shed',
        'darkscaleWarlord',
        slot,
      );
      fixture.session.battle.state = state;
      fixture.session.battle.plan = [action];
      fixture.ctx.planning.recompute();
      fixture.ctx.renderer.render();
      return { ironBefore: boss.buffs.iron };
    });
    assert.equal(shed.ironBefore, 2);
    await page.evaluate(() => window.overlordVfxFixture.start());
    await waitForPlayback();
    const ironAfter = await page.evaluate(() => {
      const state = window.overlordVfxFixture.session.battle.state;
      return state.units.darkscaleWarlord.buffs.iron || 0;
    });
    assert.equal(ironAfter, 0, 'Iron must shed to zero through authoritative events');

    checking = 'hidden attack target does not anchor at stage origin';
    const hiddenTarget = await page.evaluate(() => {
      const fixture = window.overlordVfxFixture;
      const { enemyTimeline, makeAction, preview } = fixture.engine;
      const before = structuredClone(fixture.session.battle.state);
      const actor = before.formation.find(Boolean);
      const target = 'darkscaleWarlord';
      const slot = enemyTimeline(before).findIndex((id) => id === null);
      const action = makeAction(before, actor, 'attack', target, slot);
      const event = preview(before, [action]).events.find((item) => item.type === 'hero');
      const card = document.querySelector(`[data-unit="${target}"]`);
      if (!card || !event) throw Error('Expected a visible Warlord target and a real attack event');
      card.hidden = true;
      fixture.view.playEvent(event, before);
      return [...document.querySelectorAll('.battle-effects > *')].map((element) => ({
        left: element.style.left,
        top: element.style.top,
        effect: element.dataset.effect || element.dataset.overlordEffect || element.className,
      }));
    });
    assert(
      hiddenTarget.every((effect) => effect.left !== '0px' || effect.top !== '0px'),
      `Hidden targets must not place effects at the battle layer origin: ${JSON.stringify(hiddenTarget)}`,
    );

    checking = 'warlord dispose cleanup';
    await page.evaluate(() => window.overlordVfxFixture.dispose());
    assert.equal(await page.locator('[data-overlord-effect]').count(), 0);

    // ---------------------------------------------------------------------
    // 3. Reduced motion — informational lock cue still appears
    // ---------------------------------------------------------------------
    checking = 'reduced motion lock cue';
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.evaluate(() => window.overlordVfxFixture.load('banditSyndicateKing'));
    await page.evaluate(() => {
      window.overlordVfxFixture.session.battle.speed = 2;
      window.overlordVfxFixture.start();
    });
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[data-overlord-effect="hiddenWeaponLock"]');
        return el && Number(getComputedStyle(el).opacity) > 0.18;
      },
      null,
      { timeout: 20000 },
    );
    await assertBadgeGeometry('.overlord-weapon-pill', '.overlord-weapon-pill-name');
    await page.screenshot({ path: path.join(output, 'reduced-motion-black-crow-lock.png') });
    await waitForPlayback();
    await page.evaluate(() => window.overlordVfxFixture.load('darkscaleWarlord'));
    await assertBadgeGeometry('.overlord-darkscale-badge', ':scope > span:last-child');
    await page.screenshot({ path: path.join(output, 'compact-warlord-badge.png') });
    await page.evaluate(() => window.overlordVfxFixture.dispose());

    assert.deepEqual(errors, []);
    return {
      realEngineEvents: true,
      hiddenWeaponLockBeforeAttack: true,
      warlordSummonConsume: true,
      ironShedToZero: true,
      disposeCleanup: true,
      reducedMotionLockCue: true,
      errors,
    };
  } catch (failure) {
    throw new Error(`Overlord VFX ${checking}: ${failure.stack || failure.message}`, {
      cause: failure,
    });
  } finally {
    await page.evaluate(() => window.overlordVfxFixture?.dispose()).catch(() => {});
    await page.close();
  }
}
