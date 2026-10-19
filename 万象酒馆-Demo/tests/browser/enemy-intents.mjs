import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Three simultaneous intents use actual engine events and the production selection controller. */
export async function enemyIntentChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    const document = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
      '<script type="module" src="./src/app.js"></script>',
      '',
    );
    await page.route('**/__enemy-intent-fixture', (route) =>
      route.fulfill({ contentType: 'text/html', body: document }),
    );
    await page.goto(new URL('__enemy-intent-fixture', baseURL).href);
    await page.evaluate(async () => {
      const [
        { createBattleView },
        { createSession },
        { createSelection },
        { createRoster },
        engine,
      ] = await Promise.all([
        import('/src/scene.js'),
        import('/src/app/session.js'),
        import('/src/app/selection.js'),
        import('/src/app/roster.js'),
        import('/src/engine.js'),
      ]);
      document.body.classList.add('in-battle');
      document.querySelector('#battle').hidden = false;
      document.querySelector('#inn').hidden = true;
      document.querySelector('#scene-loading').hidden = true;
      document.querySelector('#story-toggle').hidden = false;
      const ids = ['hound', 'warden', 'hexer'];
      const session = createSession();
      session.runtime.mode = 'battle';
      session.battle.state = engine.advance(engine.preview(engine.newBattle(ids), []));
      session.battle.forecast = engine.preview(session.battle.state, []);
      const context = {
        session,
        viewport: { canPlan: () => true, compactHUD: () => false },
        drag: { clearDropHighlights() {} },
      };
      context.roster = createRoster(context);
      context.selection = createSelection(context);
      const view = await createBattleView(
        document.querySelector('#stage'),
        (...args) => context.selection.selectUnit(...args),
        { enemyIds: ids },
      );
      session.runtime.view = view;
      context.renderer = {
        render() {
          view.draw(session.battle.state, session.battle.forecast, null, null, false);
          context.selection.refreshInteraction();
        },
      };
      context.renderer.render();
      context.selection.chooseCell(session.battle.forecast.slots.findIndex(Boolean));
      window.intentFixture = {
        context,
        view,
        cancelHound() {
          session.battle.state.units.hound.buffs.bind = 1;
          session.battle.forecast = engine.preview(session.battle.state, []);
          context.selection.chooseCell(session.battle.forecast.slots.findIndex(Boolean));
        },
      };
    });
    await page.waitForFunction(() => !window.intentFixture.view.isAnimating());
    assert.equal(await page.locator('.enemy-intent-summary').count(), 3);
    assert.equal(await page.locator('.intent-path').count(), 3);
    assert.equal(await page.locator('.intent-sword').count(), 3);
    for (const badge of await page.locator('.enemy-intent-summary').all()) {
      assert.match(await badge.textContent(), /^[\s\d/]+$/, 'Only icons and numbers are visible');
    }
    assert.equal(await page.locator('.enemy-intent-description').count(), 0);
    assert(
      await page
        .locator('.enemy-intent-summary')
        .first()
        .evaluate(async (element) => {
          await new Promise(requestAnimationFrame);
          await new Promise(requestAnimationFrame);
          return element.isConnected;
        }),
      'Unchanged intent headers must survive animation frames',
    );
    assert.equal(
      await page.locator('.intent-label').count(),
      0,
      'The middle contains arrows without floating damage labels',
    );
    assert.equal(await page.locator('[data-enemy-intent="hound"] [data-buff="bleed"]').count(), 1);
    assert.equal(
      await page.locator('[data-enemy-intent="warden"] [data-buff="shield"]').count(),
      1,
    );
    const damage = await page.evaluate(() => {
      const { context } = window.intentFixture;
      const state = context.session.battle.state;
      return context.selection.enemyIntentPreview().map((data) => {
        const at = context.session.battle.forecast.events.findIndex(
          (event) => event.actor === data.id && event.type === 'enemy',
        );
        const event = context.session.battle.forecast.events[at];
        const before = at ? context.session.battle.forecast.events[at - 1].after : state;
        const target = data.targets.find((target) => target.id);
        return {
          expected: before.units[target.id].hp - event.after.units[target.id].hp,
          displayed: document.querySelector(
            '[data-enemy-intent="' + data.id + '"] .intent-damage b',
          ).textContent,
        };
      });
    });
    damage.forEach(({ expected, displayed }) => assert.equal(displayed, String(expected)));
    for (const viewport of [
      { width: 1440, height: 836 },
      { width: 844, height: 390 },
    ]) {
      await page.setViewportSize(viewport);
      await page.waitForTimeout(200);
      const cards = [];
      for (const id of ['hound', 'warden', 'hexer']) {
        const badge = await page.locator('[data-enemy-intent="' + id + '"]').boundingBox();
        const enemy = await page.locator('[data-unit="' + id + '"]').boundingBox();
        const sword = await page
          .locator('[data-enemy-intent="' + id + '"] .intent-damage')
          .boundingBox();
        assert(
          badge && enemy && sword,
          `${id} must have visible card, badge and damage at ${viewport.width}: ${JSON.stringify({ badge, enemy, sword })}`,
        );
        const stage = await page.locator('#stage').boundingBox();
        const journal = await page.locator('#story-toggle').boundingBox();
        assert(
          badge.y >= stage.y && badge.y + badge.height <= enemy.y,
          'Each summary sits above its own enemy',
        );
        assert(
          badge.y >= journal.y + journal.height,
          'Journal entry must not cover the intent summary',
        );
        for (const previous of cards)
          assert(
            badge.x >= previous.x + previous.width || previous.x >= badge.x + badge.width,
            'Enemy summaries must not overlap horizontally',
          );
        for (const buff of await page
          .locator('[data-enemy-intent="' + id + '"] .intent-buff')
          .all()) {
          const box = await buff.boundingBox();
          assert(box.x >= sword.x + sword.width, 'Buff icons follow the sword and number');
        }
        cards.push(badge);
      }
      await page.screenshot({
        path: path.join(output, 'enemy-intents-' + viewport.width + '.png'),
      });
    }
    await page.locator('[data-unit="hound"]').click();
    assert.equal(await page.locator('.enemy-intent-summary').count(), 1);
    assert.equal(await page.locator('.intent-path').count(), 1);
    await page.evaluate(() => window.intentFixture.cancelHound());
    assert.equal(await page.locator('[data-enemy-intent="hound"] .intent-damage').count(), 0);
    assert.equal(await page.locator('.intent-path[data-intent-enemy="hound"]').count(), 0);
    assert((await page.locator('[data-enemy-intent="hound"]').textContent()).includes('×'));
    await page.evaluate(() => window.intentFixture.view.dispose());
    assert.equal(await page.locator('#intent-layer > *').count(), 0);
    assert.deepEqual(errors, []);
    return {
      threeIndependentHeaders: true,
      eventDamageMatches: true,
      buffIconsToRight: true,
      arrowsWithoutMiddleLabels: true,
      singleAndCancelled: true,
      mobile: true,
    };
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'enemy-intents-error.png') });
    throw error;
  } finally {
    await page.close();
  }
}
