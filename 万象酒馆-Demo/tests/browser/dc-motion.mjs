import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function dcMotionChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  const html = (await readFile(new URL('../../index.html', import.meta.url), 'utf8')).replace(
    '<script type="module" src="./src/app.js"></script>',
    '',
  );
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/__dc-motion', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  );
  try {
    await page.goto(new URL('__dc-motion', baseURL).href);
    await page.evaluate(async () => {
      document.documentElement.dataset.gameLayout = 'mobile';
      const { createDiceStage } = await import('/src/app/dice-stage.js');
      const { createGalPlayer } = await import('/src/app/gal.js');
      const { createEventScope } = await import('/src/shared/events.js');
      const { createAssetStore } = await import('/src/shared/asset-store.js');
      const { newLibrary, officialCharacter } = await import('/src/ai/library.js');
      const library = newLibrary();
      const member = officialCharacter('edith');
      library.characters = [member];
      const context = {
        session: { ai: { library, generationOptions: { galMode: true } }, runtime: {} },
        events: createEventScope(),
        assets: createAssetStore(),
      };
      context.gal = createGalPlayer(context);
      window.dcFixture = { context, dice: createDiceStage(context), member };
    });

    const dice = page.locator('#dc-stage');
    const gal = page.locator('#gal-stage');
    const freeOptions = { owner: 'dc-fixture' };
    await page.evaluate((playOptions) => {
      const { dice, context, member } = window.dcFixture;
      window.dcFixture.finished = false;
      window.dcFixture.phases = [];
      const overlay = document.querySelector('#dc-stage');
      const observer = new MutationObserver(() => {
        const phase = overlay.dataset.phase;
        if (!phase || window.dcFixture.phases.at(-1)?.phase === phase) return;
        const gal = document.querySelector('#gal-stage');
        window.dcFixture.phases.push({
          phase,
          dialogueVisible: !gal.hidden && getComputedStyle(gal).visibility === 'visible',
        });
      });
      observer.observe(overlay, { attributes: true, attributeFilter: ['data-phase'] });
      const actionText = '尝试沿着墙边悄悄走过石桥并查看门后留下的刻痕';
      void dice
        .playReply(
          {
            dcOutcome: {
              triggered: true,
              success: true,
              outcome: 'success',
              attr: 'dex',
              dc: 8,
              reward: { tier: 'medium', kind: 'protection' },
            },
            dcSplit: { beforeText: '【对白:伊蒂丝】准备好了。' },
          },
          playOptions,
          { style: 'free', actionText, member },
        )
        .then(() => {
          window.dcFixture.finished = true;
          observer.disconnect();
        });
      context.gal.skip();
    }, freeOptions);
    await page.locator('#dc-stage[data-phase="inscribe"] .fr-circle').waitFor();
    await page.locator('.fr-glyph').last().waitFor();
    assert.equal(await gal.getAttribute('data-dc-inscribing'), 'true');
    assert.equal(await gal.locator('.gal-text .gal-fly-char.is-flying-out').count(), 5);
    assert.equal(await dice.locator('.fr-glyph').count(), 5);
    assert(await gal.locator('.gal-reading').isVisible());
    assert(await dice.locator('.fr-dice').isHidden());
    assert.equal(await dice.locator('[data-dc-continue]').count(), 0);
    await page.keyboard.press('Enter');
    await page.waitForFunction(() =>
      window.dcFixture.phases.some(({ phase }) => phase === 'judge'),
    );
    assert.equal(await gal.getAttribute('data-dc-inscribing'), null);
    const phases = await page.evaluate(() => window.dcFixture.phases.slice(0, 3));
    assert.deepEqual(phases, [
      { phase: 'inscribe', dialogueVisible: true },
      { phase: 'withdraw', dialogueVisible: true },
      { phase: 'judge', dialogueVisible: false },
    ]);
    assert(await gal.isHidden());
    await dice.locator('.fr-dice .die-wrap').first().waitFor();
    await verifyResult(page, output, 'free-844');
    await page.waitForFunction(() => window.dcFixture.finished);

    for (const [style, viewport, reduced] of [
      ['event', { width: 667, height: 375 }, 'no-preference'],
      ['gal', { width: 390, height: 844 }, 'no-preference'],
      ['free', { width: 667, height: 375 }, 'reduce'],
    ]) {
      await page.setViewportSize(viewport);
      await page.emulateMedia({ reducedMotion: reduced });
      if (style === 'gal')
        await page.locator('#ai-dialog').evaluate((dialog) => dialog.showModal());
      await page.evaluate((mode) => {
        void window.dcFixture.dice.playCheck({
          style: mode,
          actionText: '长'.repeat(500),
          displayCheck: {
            actorName: '伊蒂丝',
            attr: 'dex',
            attrLabel: '敏捷',
            dice: [3, 4],
            mod: 2,
            dc: 8,
            total: 9,
            outcome: 'success',
          },
        });
      }, style);
      if (style === 'event') {
        const moving = page.locator('#dc-stage .ev-fall');
        await moving.first().waitFor();
        assert(
          await moving.evaluateAll(async (nodes) => {
            for (let sample = 0; sample < 7; sample++) {
              await new Promise((resolve) => setTimeout(resolve, 170));
              if (
                nodes.some((node) => {
                  const box = node.getBoundingClientRect();
                  return (
                    box.top < 0 ||
                    box.left < 0 ||
                    box.right > innerWidth ||
                    box.bottom > innerHeight
                  );
                })
              )
                return false;
            }
            return true;
          }),
          'The full throw remains inside the mobile viewport',
        );
      }
      await verifyResult(page, output, `${style}-${viewport.width}-${reduced}`, {
        reducedMotion: reduced === 'reduce',
        reopenOnExit: style === 'gal',
      });
      if (style === 'gal') await page.locator('#ai-dialog').evaluate((dialog) => dialog.close());
    }
    assert.deepEqual(errors, []);
    return {
      freeSequence: true,
      eventThrow: true,
      galCutIn: true,
      exitMotion: true,
      exitRapidReopen: true,
      reducedMotion: true,
    };
  } catch (error) {
    const phases = await page.evaluate(() => window.dcFixture?.phases).catch(() => []);
    await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
    throw new Error(
      `${error.message}\nDC phases: ${JSON.stringify(phases)}\n${errors.join('\n')}`,
      { cause: error },
    );
  } finally {
    await page.close();
  }
}

async function verifyResult(
  page,
  output,
  name,
  { reducedMotion = false, reopenOnExit = false } = {},
) {
  const ready = page.locator('#dc-stage[data-ready="true"]');
  const proceed = ready.locator('> .dc-continue');
  await proceed.waitFor();
  assert(
    await proceed.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const frame = button.parentElement.querySelector('.dc-frame').getBoundingClientRect();
      const reveal = button.parentElement.querySelector('.dc-reveal').getBoundingClientRect();
      return (
        box.height >= 44 &&
        box.bottom <= innerHeight &&
        box.right <= innerWidth &&
        frame.bottom <= box.top &&
        reveal.bottom <= frame.bottom + 1 &&
        document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === button
      );
    }),
    'The continue button has an independent, tappable row',
  );
  const renderedDice = await ready.locator('.die-wrap').evaluateAll((dice) =>
    dice.map((die) => {
      const cube = die.querySelector('.die-cube');
      const faces = [...cube.querySelectorAll('.die-face')];
      const roll = new DOMMatrix(getComputedStyle(cube).transform);
      const front = faces.find((face) => {
        const side = new DOMMatrix(getComputedStyle(face).transform);
        return roll.multiply(side).transformPoint(new DOMPoint(0, 0, 1, 0)).z > 0.99;
      });
      return {
        expected: Number(die.getAttribute('aria-label').match(/\d+/)[0]),
        visible: front?.querySelectorAll('.pip').length,
        sealed:
          faces.length === 6 &&
          faces.every(
            (face) =>
              getComputedStyle(face).backfaceVisibility === 'hidden' &&
              getComputedStyle(face).borderRadius === '0px',
          ),
      };
    }),
  );
  for (const { expected, visible, sealed } of renderedDice) {
    assert.equal(visible, expected, 'The final outward face matches the displayed roll');
    assert(sealed, 'Cube faces meet at the edges and hide their reverse sides');
  }
  await ready.screenshot({ path: path.join(output, `${name}.png`) });
  await ready.evaluate((stage, reopen) => {
    stage.addEventListener(
      'click',
      (event) => {
        if (!event.target.closest('[data-dc-continue]')) return;
        // Observe after the production click listener on the same element.
        stage.dataset.testExit = JSON.stringify({
          hidden: stage.hidden,
          inert: stage.inert,
          ariaHidden: stage.getAttribute('aria-hidden'),
          ready: stage.dataset.ready,
          pointerEvents: getComputedStyle(stage).pointerEvents,
          focusInside: stage.contains(document.activeElement),
          fading: stage
            .getAnimations()
            .some(
              (animation) => animation.id === 'dc-stage-exit' && animation.playState === 'running',
            ),
        });
        if (!reopen) return;

        void window.dcFixture.dice.playCheck({
          style: 'gal',
          displayCheck: {
            actorName: '伊蒂丝',
            attr: 'dex',
            attrLabel: '敏捷',
            dice: [3, 4],
            mod: 2,
            dc: 8,
            total: 9,
            outcome: 'success',
          },
        });
        stage.dataset.testReopen = JSON.stringify({
          hidden: stage.hidden,
          inert: stage.inert,
          ariaHidden: stage.getAttribute('aria-hidden'),
          exiting: stage.dataset.exiting === 'true',
          phase: stage.dataset.phase,
        });
      },
      { once: true },
    );
  }, reopenOnExit);
  await proceed.tap();
  const exit = await page.locator('#dc-stage').evaluate((stage) => {
    const result = JSON.parse(stage.dataset.testExit);
    delete stage.dataset.testExit;
    return { exit: result, reopen: JSON.parse(stage.dataset.testReopen || 'null') };
  });
  if (reducedMotion) {
    assert.deepEqual(exit.exit, {
      hidden: true,
      inert: false,
      ariaHidden: null,
      ready: 'false',
      pointerEvents: 'auto',
      focusInside: false,
      fading: false,
    });
  } else {
    assert.deepEqual(exit.exit, {
      hidden: false,
      inert: true,
      ariaHidden: 'true',
      ready: 'false',
      pointerEvents: 'none',
      focusInside: false,
      fading: true,
    });
  }

  if (reopenOnExit) {
    assert.deepEqual(exit.reopen, {
      hidden: false,
      inert: false,
      ariaHidden: null,
      exiting: false,
      phase: 'focus',
    });
    await page.waitForTimeout(220);
    assert.equal(
      await page.locator('#dc-stage').isHidden(),
      false,
      'the previous exit cannot hide a reopened stage',
    );
    await ready.waitFor();
    await ready.locator('> .dc-continue').tap();
  }

  const stage = page.locator('#dc-stage');
  await stage.waitFor({ state: 'hidden' });
  assert.equal(
    await stage.evaluate((element) => element.getAnimations().length),
    0,
    'exit playback does not leave a finished animation attached to the hidden stage',
  );
}
