import assert from 'node:assert/strict';
import { galWorkspaceChecks } from './gal-workspace.mjs';

export async function galPersistentComposerExitChecks({ browser, baseURL }) {
  const page = await browser.newPage({ reducedMotion: 'no-preference' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  try {
    await page.route('**/__gal-persistent-exit', (route) =>
      route.fulfill({
        contentType: 'text/html; charset=utf-8',
        body: `<!doctype html><link rel="stylesheet" href="./styles/app.css">
          <body class="in-adventure"><div id="input-home"><textarea id="rp-input">保留的输入</textarea></div></body>`,
      }),
    );
    await page.goto(new URL('__gal-persistent-exit', baseURL).href);
    const departing = await page.evaluate(async () => {
      const [{ createGalPlayer }, { newLibrary }] = await Promise.all([
        import('/src/app/gal.js'),
        import('/src/ai/library.js'),
      ]);
      const gal = createGalPlayer({ session: { ai: { library: newLibrary() } } });
      const field = document.querySelector('#rp-input');
      gal.workspace({ owner: 'adventure', persistent: true, composer: [field] });
      const composer = field.closest('.gal-composer');
      const exit = () =>
        composer
          .getAnimations()
          .find((animation) => animation.animationName === 'gal-workspace-exit');
      const state = () => ({
        hidden: composer.hidden,
        inert: composer.inert,
        exiting: composer.hasAttribute('data-workspace-exiting'),
        animating: Boolean(exit()),
        display: getComputedStyle(composer).display,
      });
      window.persistentGalFixture = { gal, field, composer, exit, state };
      field.focus();
      gal.waiting();
      return { ...state(), focus: document.activeElement.id };
    });
    assert.deepEqual(
      departing,
      {
        hidden: false,
        inert: true,
        exiting: true,
        animating: true,
        display: 'block',
        focus: 'gal-stage',
      },
      'waiting starts a visible but inert composer exit and moves focus to the stage',
    );

    const composer = page.locator('.gal-composer');
    await composer.waitFor({ state: 'hidden' });
    assert.equal(await composer.getAttribute('data-workspace-exiting'), null);

    const reopened = await page.evaluate(async () => {
      const { gal, field, composer, exit, state } = window.persistentGalFixture;
      gal.settled('adventure');
      gal.waiting();
      const outgoing = exit();
      const finished = outgoing?.finished.catch(() => {});
      gal.settled('adventure');
      await finished;
      field.focus();
      return {
        ...state(),
        cancelled: outgoing?.playState === 'idle',
        draft: field.value,
        sameField: composer.contains(field) && document.activeElement === field,
      };
    });
    assert.deepEqual(
      reopened,
      {
        hidden: false,
        inert: false,
        exiting: false,
        animating: false,
        display: 'block',
        cancelled: true,
        draft: '保留的输入',
        sameField: true,
      },
      'a quick reply cancels the in-flight exit and the same input is usable again',
    );

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const reduced = await page.evaluate(() => {
      const { gal, state } = window.persistentGalFixture;
      gal.waiting();
      return state();
    });
    assert.deepEqual(
      reduced,
      { hidden: true, inert: true, exiting: false, animating: false, display: 'none' },
      'reduced motion hides the composer immediately without creating an exit animation',
    );

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const disposed = await page.evaluate(() => {
      const { gal, field, composer, exit } = window.persistentGalFixture;
      gal.settled('adventure');
      gal.waiting();
      const outgoing = exit();
      gal.dispose();
      return {
        connected: composer.isConnected,
        hidden: composer.hidden,
        inert: composer.inert,
        exiting: composer.hasAttribute('data-workspace-exiting'),
        animation: outgoing?.playState,
        inputHome: field.parentElement?.id,
      };
    });
    assert.deepEqual(disposed, {
      connected: false,
      hidden: true,
      inert: false,
      exiting: false,
      animation: 'idle',
      inputHome: 'input-home',
    });
    assert.deepEqual(errors, []);
    return {
      persistentComposerExit: true,
      exitFocusRecovery: true,
      exitRapidReopen: true,
      reducedMotion: true,
      exitCleanup: true,
    };
  } finally {
    await page.close();
  }
}

/** The actual Gal workflow plus its persistent RP composer exit regression. */
export async function chatChecks(options) {
  const persistentComposer = await galPersistentComposerExitChecks(options);
  return { ...(await galWorkspaceChecks(options)), ...persistentComposer };
}
