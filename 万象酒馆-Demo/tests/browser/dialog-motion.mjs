import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

const PROBE_ATTRIBUTE = 'data-test-dialog-exit-properties';
const ENTRY_PROBE_ATTRIBUTE = 'data-test-dialog-entry-opacity';
const EXIT_PROPERTIES = ['opacity'];
const DIALOG_SELECTOR = '#party-panel';
const OPENER_ID = 'party-toggle';
const SCROLL_PROBE_ID = 'dialog-motion-scroll-probe';
const VIEWPORT = { width: 844, height: 390 };

function supportsDialogMotion() {
  return (
    CSS.supports('overlay: auto') &&
    CSS.supports('transition-behavior: allow-discrete') &&
    CSS.supports('interactivity: inert')
  );
}

async function armDialogEntryProbe(dialog) {
  return dialog.evaluate((element, attribute) => {
    if (
      !CSS.supports('overlay: auto') ||
      !CSS.supports('transition-behavior: allow-discrete') ||
      !CSS.supports('interactivity: inert') ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return false;
    }

    element.setAttribute(attribute, '');
    let timeoutId;
    const finish = () => {
      window.removeEventListener('transitionrun', record, true);
      window.clearTimeout(timeoutId);
    };
    const record = (event) => {
      if (event.target !== element || event.pseudoElement || event.propertyName !== 'opacity')
        return;
      element.setAttribute(attribute, 'true');
      finish();
    };
    window.addEventListener('transitionrun', record, true);
    timeoutId = window.setTimeout(finish, 2000);
    return true;
  }, ENTRY_PROBE_ATTRIBUTE);
}

export async function armDialogExitProbe(dialog) {
  return dialog.evaluate(
    (element, { attribute, required }) => {
      if (
        !CSS.supports('overlay: auto') ||
        !CSS.supports('transition-behavior: allow-discrete') ||
        !CSS.supports('interactivity: inert') ||
        matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return false;
      }

      element.setAttribute(attribute, '');
      let timeoutId;
      const finish = () => {
        window.removeEventListener('transitionrun', record, true);
        window.clearTimeout(timeoutId);
      };
      const record = (event) => {
        if (event.target !== element || !['', '::backdrop'].includes(event.pseudoElement)) return;
        if (!['opacity', 'display', 'overlay'].includes(event.propertyName)) return;

        const properties = new Set(element.getAttribute(attribute).split(' ').filter(Boolean));
        properties.add(event.propertyName);
        element.setAttribute(attribute, [...properties].join(' '));
        if (required.every((property) => properties.has(property))) finish();
      };
      window.addEventListener('transitionrun', record, true);
      timeoutId = window.setTimeout(finish, 2000);
      return true;
    },
    { attribute: PROBE_ATTRIBUTE, required: EXIT_PROPERTIES },
  );
}

async function readDocumentScrollState(page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      rootOverflow: getComputedStyle(root).overflow,
      rootInlineOverflow: root.style.overflow,
      bodyOverflow: getComputedStyle(body).overflow,
      bodyInlineOverflow: body.style.overflow,
    };
  });
}

export async function assertDialogExited(
  dialog,
  selector,
  { animated = false, focusId, scrollState } = {},
) {
  const state = await dialog.evaluate((element, targetId) => {
    const style = getComputedStyle(element);
    const target = targetId ? document.getElementById(targetId) : null;
    const targetStyle = target ? getComputedStyle(target) : null;
    const targetInteractive = Boolean(
      target?.isConnected &&
      !target.matches(':disabled, [aria-disabled="true"]') &&
      !target.closest('[hidden], [inert], dialog:not([open])') &&
      target.getClientRects().length > 0 &&
      targetStyle?.visibility === 'visible' &&
      targetStyle.pointerEvents !== 'none',
    );
    return {
      open: element.open,
      modal: element.matches(':modal'),
      display: style.display,
      opacity: style.opacity,
      pointerEvents: style.pointerEvents,
      backdropPointerEvents: getComputedStyle(element, '::backdrop').pointerEvents,
      focusedId: document.activeElement?.id || '',
      targetInteractive,
      scrollState: {
        rootOverflow: getComputedStyle(document.documentElement).overflow,
        rootInlineOverflow: document.documentElement.style.overflow,
        bodyOverflow: getComputedStyle(document.body).overflow,
        bodyInlineOverflow: document.body.style.overflow,
      },
    };
  }, focusId || '');

  assert.equal(state.open, false, 'The native open state must end immediately');
  assert.equal(state.modal, false, 'The modal top layer must be released immediately');
  if (focusId) {
    assert.equal(state.focusedId, focusId, 'Focus must return to the interactive trigger');
    assert.equal(state.targetInteractive, true, 'The focus target must remain interactive');
  }
  if (scrollState)
    assert.deepEqual(state.scrollState, scrollState, 'Document scroll styles must be restored');

  if (animated) {
    assert.equal(state.pointerEvents, 'none', 'The exiting dialog must not receive pointer input');
    assert.equal(
      state.backdropPointerEvents,
      'none',
      'The exiting backdrop must not receive pointer input',
    );
    await dialog.page().waitForFunction(
      ({ selector, attribute, required }) => {
        const element = document.querySelector(selector);
        const actual = new Set(element?.getAttribute(attribute)?.split(' ').filter(Boolean) || []);
        return required.every((property) => actual.has(property));
      },
      { selector, attribute: PROBE_ATTRIBUTE, required: EXIT_PROPERTIES },
      { timeout: 2000 },
    );
  }

  await dialog.evaluate(
    (element, attribute) => element.removeAttribute(attribute),
    PROBE_ATTRIBUTE,
  );
  return state;
}

async function assertNoLingeringMotion(page, selector, { expectHiddenPaint = false } = {}) {
  await page.locator(selector).waitFor({ state: 'hidden' });
  const state = await page.evaluate((target) => {
    const element = document.querySelector(target);
    if (!element) return { missing: true };
    const activeAnimations = element
      .getAnimations({ subtree: true })
      .filter((animation) => ['running', 'pending'].includes(animation.playState));
    return {
      missing: false,
      open: element.open,
      modal: element.matches(':modal'),
      opacity: getComputedStyle(element).opacity,
      backdropOpacity: getComputedStyle(element, '::backdrop').opacity,
      activeAnimations: activeAnimations.length,
    };
  }, selector);

  assert.equal(state.missing, false, 'The dialog element must remain in the DOM');
  assert.equal(state.open, false, 'The dialog must not be left open');
  assert.equal(state.modal, false, 'The dialog must not be left modal');
  assert.equal(state.activeAnimations, 0, 'No dialog or descendant animations may keep running');
  if (expectHiddenPaint) {
    assert.equal(state.opacity, '0', 'The exited dialog must settle at opacity 0');
    assert.equal(state.backdropOpacity, '0', 'The exited backdrop must settle at opacity 0');
  }
  return state;
}

async function assertFocusNotTrapped(page, openerId) {
  await page.locator(`#${openerId}`).focus();
  await page.keyboard.press('Tab');
  const state = await page.evaluate((selector) => {
    const dialog = document.querySelector(selector);
    const active = document.activeElement;
    return {
      open: dialog?.open ?? false,
      focusInsideClosedDialog: Boolean(dialog && active && dialog.contains(active)),
      activeDialog: active?.closest('dialog')?.open ?? false,
    };
  }, DIALOG_SELECTOR);

  assert.equal(state.open, false, 'The dialog must be closed before tab navigation');
  assert.equal(
    state.focusInsideClosedDialog,
    false,
    'Tab must not be trapped in the closed dialog',
  );
  assert.equal(state.activeDialog, false, 'Focus must remain outside any closed modal');
}

async function openDialog(page, dialog, opener, { motionSupported, reducedMotion = false } = {}) {
  const entryProbe = motionSupported && !reducedMotion ? await armDialogEntryProbe(dialog) : false;
  await opener.click();
  await dialog.waitFor({ state: 'visible' });

  if (entryProbe) {
    await page.waitForFunction(
      ({ selector, attribute }) =>
        document.querySelector(selector)?.getAttribute(attribute) === 'true',
      { selector: DIALOG_SELECTOR, attribute: ENTRY_PROBE_ATTRIBUTE },
      { timeout: 2000 },
    );
    await dialog.evaluate(
      (element, attribute) => element.removeAttribute(attribute),
      ENTRY_PROBE_ATTRIBUTE,
    );
  }

  await page.waitForFunction((selector) => {
    const element = document.querySelector(selector);
    return element && getComputedStyle(element).opacity === '1';
  }, DIALOG_SELECTOR);
}

async function exerciseLedgerAtlasExit(page) {
  const handle = page.locator('#ledger-handle');
  const drawer = page.locator('#ledger-drawer-host');
  const opener = drawer.locator('#ledger-atlas-open');
  const frame = page.locator('#daily-atlas-frame');
  const atlas = page.frameLocator('#daily-atlas-frame');
  const map = atlas.locator('#street-map[open]');
  const close = atlas.getByRole('button', { name: '关闭地图' });
  const travelState = () =>
    page.evaluate(() => {
      const { daily, atlasDiscoveries, overlandExploration } = demo.getLibrary();
      return { daily, atlasDiscoveries, overlandExploration };
    });

  async function waitForOpenAtlas() {
    await map.waitFor({ state: 'visible' });
    await drawer.waitFor({ state: 'hidden' });
    await page.waitForFunction(() => {
      const element = document.getElementById('daily-atlas-frame');
      return (
        element && !element.hidden && !element.inert && getComputedStyle(element).opacity === '1'
      );
    });
  }

  async function openAtlas() {
    await handle.click();
    await opener.click();
    await waitForOpenAtlas();
  }

  async function closeAtlas({ reducedMotion = false, reopen = false } = {}) {
    await close.focus();
    assert(await frame.evaluate((element) => document.activeElement === element));
    await frame.evaluate((element, rapidReopen) => {
      const observeClose = (event) => {
        if (
          event.source !== element.contentWindow ||
          event.data?.type !== 'street-map-state' ||
          event.data.open !== false
        )
          return;
        window.removeEventListener('message', observeClose);
        const motion = element
          .getAnimations()
          .find((animation) => animation.transitionProperty === 'opacity');
        element.dataset.testAtlasExit = JSON.stringify({
          painted: getComputedStyle(element).display !== 'none',
          inert: element.inert,
          ariaHidden: element.getAttribute('aria-hidden'),
          focusedId: document.activeElement?.id,
          pointerEvents: element.hidden ? null : getComputedStyle(element).pointerEvents,
          fading: Boolean(motion),
        });
        if (rapidReopen && motion) {
          const settled = () => (element.dataset.testAtlasOldExitSettled = 'true');
          void motion.finished.then(settled, settled);
          // Activate the same ledger actions in this turn, before the 180 ms exit can finish.
          document.getElementById('ledger-handle').click();
          document.getElementById('ledger-atlas-open').click();
        }
      };
      window.addEventListener('message', observeClose);
    }, reopen);
    await close.click();
    await page.locator('#daily-atlas-frame[data-test-atlas-exit]').waitFor({ state: 'attached' });
    const exit = await frame.evaluate((element) => {
      const snapshot = JSON.parse(element.dataset.testAtlasExit);
      delete element.dataset.testAtlasExit;
      return snapshot;
    });
    assert.deepEqual(exit, {
      painted: !reducedMotion,
      inert: true,
      ariaHidden: 'true',
      focusedId: 'ledger-handle',
      pointerEvents: reducedMotion ? null : 'none',
      fading: !reducedMotion,
    });
    if (!reopen) {
      await frame.waitFor({ state: 'hidden' });
      assert.equal(await frame.evaluate((element) => element.getAnimations().length), 0);
    }
  }

  const before = await travelState();
  await openAtlas();
  await closeAtlas();
  await openAtlas();
  await closeAtlas({ reopen: true });
  await page
    .locator('#daily-atlas-frame[data-test-atlas-old-exit-settled]')
    .waitFor({ state: 'attached' });
  await waitForOpenAtlas();
  assert.equal(
    await frame.getAttribute('aria-hidden'),
    null,
    'Reopening restores atlas accessibility',
  );
  assert.equal(await frame.getAttribute('data-closing'), null, 'The old exit is no longer active');
  await frame.evaluate((element) => delete element.dataset.testAtlasOldExitSettled);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await closeAtlas({ reducedMotion: true });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  assert.deepEqual(
    await travelState(),
    before,
    'Viewing and closing the atlas does not start travel',
  );
  return { rapidReopen: true, reducedMotion: true };
}

async function installBackgroundScrollProbe(drawer) {
  return drawer.evaluate((element, id) => {
    const scroller = document.createElement('div');
    scroller.id = id;
    scroller.setAttribute('aria-hidden', 'true');
    scroller.style.cssText =
      'position:absolute;right:8px;bottom:8px;width:96px;height:72px;overflow-y:auto;z-index:1;opacity:.02;pointer-events:auto;';
    const content = document.createElement('div');
    content.style.height = '480px';
    scroller.append(content);
    element.append(scroller);
    const rect = scroller.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, SCROLL_PROBE_ID);
}

async function assertBackgroundScrollAvailable(page, point) {
  try {
    await page.mouse.move(point.x, point.y);
    await page.mouse.wheel(0, 100);
    await page.waitForFunction(
      (id) => (document.getElementById(id)?.scrollTop || 0) > 0,
      SCROLL_PROBE_ID,
      { timeout: 1000 },
    );
    return await page.evaluate(
      (id) => document.getElementById(id)?.scrollTop || 0,
      SCROLL_PROBE_ID,
    );
  } finally {
    await page.evaluate((id) => document.getElementById(id)?.remove(), SCROLL_PROBE_ID);
  }
}

async function closeDialog(page, dialog, close, { focusId, scrollState, scrollProbe } = {}) {
  const animated = await armDialogExitProbe(dialog);
  await close.click();
  const state = await assertDialogExited(dialog, DIALOG_SELECTOR, {
    animated,
    focusId,
    scrollState,
  });
  if (scrollProbe) {
    await page.waitForFunction(() => {
      const host = document.querySelector('#ledger-drawer-host');
      const drawer = document.querySelector('#ledger-drawer');
      return (
        !document.querySelector('#party-panel')?.open &&
        host?.classList.contains('is-open') &&
        !host.classList.contains('is-closing') &&
        drawer &&
        getComputedStyle(drawer).transform === 'matrix(1, 0, 0, 1, 0, 0)'
      );
    });
    const scrollTop = await assertBackgroundScrollAvailable(page, scrollProbe);
    assert(scrollTop > 0, 'Background scroll input must work during the visual exit');
  }
  await assertNoLingeringMotion(page, DIALOG_SELECTOR, { expectHiddenPaint: animated });
  return { animated, state };
}

export async function dialogMotionChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: VIEWPORT });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));

  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await legacySession(page);
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    const atlasExit = await exerciseLedgerAtlasExit(page);

    const dialog = page.locator(DIALOG_SELECTOR);
    const close = page.locator('#prepare-close');
    const opener = page.locator(`#${OPENER_ID}`);

    await page.locator('#ledger-handle').click();
    await page.locator('#ledger-drawer-host.is-open').waitFor({ state: 'visible' });
    const motionSupported = await page.evaluate(supportsDialogMotion);
    const scrollState = await readDocumentScrollState(page);

    // Measure the open drawer before it moves into the preparation modal and closes.
    await opener.waitFor({ state: 'visible' });
    await page.waitForFunction(
      () =>
        getComputedStyle(document.querySelector('#ledger-drawer')).transform ===
        'matrix(1, 0, 0, 1, 0, 0)',
    );
    const scrollProbe = await installBackgroundScrollProbe(page.locator('#ledger-drawer'));
    // Entry and native close must remain symmetric without delaying focus release.
    await openDialog(page, dialog, opener, { motionSupported });
    const firstExit = await closeDialog(page, dialog, close, {
      focusId: OPENER_ID,
      scrollState,
      scrollProbe,
    });
    await assertFocusNotTrapped(page, OPENER_ID);

    await openDialog(page, dialog, opener, { motionSupported });
    const embeddedHandle = dialog.locator('#ledger-handle');
    const embeddedDrawer = dialog.locator('#ledger-drawer-host.is-open');
    await embeddedHandle.click();
    await embeddedDrawer.waitFor({ state: 'visible' });
    const speed = embeddedDrawer.locator('#ledger-speed-toggle');
    const speedBefore = await speed.textContent();
    await speed.click();
    assert.notEqual(
      await speed.textContent(),
      speedBefore,
      'Ledger actions work inside preparation',
    );
    await speed.click();
    await embeddedDrawer.locator('.ledger-backdrop').click({ position: { x: 20, y: 100 } });
    await embeddedDrawer.waitFor({ state: 'hidden' });
    await embeddedHandle.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement?.id === 'ledger-handle');
    assert(await dialog.isVisible(), 'Dismissing the ledger does not dismiss preparation');
    await embeddedHandle.press('Enter');
    await embeddedDrawer.waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await embeddedHandle.waitFor({ state: 'visible' });
    assert(await dialog.isVisible(), 'Escape closes only the inner ledger');
    await closeDialog(page, dialog, close, { focusId: 'ledger-handle', scrollState });
    await assertFocusNotTrapped(page, 'ledger-handle');

    // The drawer stayed closed; reopen it before using its preparation trigger again.
    await page.locator('#ledger-handle').click();
    await page.locator('#ledger-drawer-host.is-open').waitFor({ state: 'visible' });
    await opener.waitFor({ state: 'visible' });

    // Repeated normal cycles catch stale top-layer state and forgotten transitions.
    const cycles = 6;
    for (let index = 0; index < cycles; index += 1) {
      await openDialog(page, dialog, opener, { motionSupported });
      await closeDialog(page, dialog, close, { focusId: OPENER_ID, scrollState });
    }

    // A real click on the underlying opener must pass through an exiting dialog/backdrop.
    await openDialog(page, dialog, opener, { motionSupported });
    await page.evaluate(() => document.querySelector('#prepare-close')?.click());
    const rapidExit = await assertDialogExited(dialog, DIALOG_SELECTOR, {
      focusId: OPENER_ID,
      scrollState,
    });
    if (motionSupported) {
      assert.equal(rapidExit.pointerEvents, 'none');
      assert.equal(rapidExit.backdropPointerEvents, 'none');
      assert.notEqual(rapidExit.display, 'none', 'The visual exit should linger without modality');
    }
    await openDialog(page, dialog, opener, { motionSupported });
    const reopened = await dialog.evaluate((element) => ({
      open: element.open,
      modal: element.matches(':modal'),
      opacity: getComputedStyle(element).opacity,
    }));
    assert.equal(reopened.open, true, 'Rapid reopen must restore the native open state');
    assert.equal(reopened.modal, true, 'Rapid reopen must restore modality');
    assert.equal(reopened.opacity, '1', 'Rapid reopen must settle at the visible state');
    await closeDialog(page, dialog, close, { focusId: OPENER_ID, scrollState });

    // Reduced motion removes visual transitions but keeps native close and scroll usable.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDialog(page, dialog, opener, { motionSupported, reducedMotion: true });
    const reduced = await page.evaluate((selector) => {
      const element = document.querySelector(selector);
      return {
        transition: getComputedStyle(element).transitionDuration,
        animation: getComputedStyle(element).animationDuration,
        backdropTransition: getComputedStyle(element, '::backdrop').transitionDuration,
      };
    }, DIALOG_SELECTOR);
    assert.equal(reduced.transition, '0s', 'Reduced motion must disable dialog transitions');
    assert.equal(reduced.animation, '0s', 'Reduced motion must disable dialog animations');
    assert.equal(
      reduced.backdropTransition,
      '0s',
      'Reduced motion must disable backdrop transitions',
    );

    await fs.mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'dialog-motion-mobile.png') });

    // Close the inner ledger first, then close preparation to a visible trigger.
    const reducedHandle = dialog.locator('#ledger-handle');
    await reducedHandle.click();
    await page.locator('#ledger-drawer-host.is-open').waitFor({ state: 'visible' });
    await page.keyboard.press('Escape');
    await reducedHandle.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement?.id === 'ledger-handle');

    const reducedExit = await closeDialog(page, dialog, close, {
      focusId: 'ledger-handle',
      scrollState,
    });
    assert.equal(reducedExit.animated, false, 'Reduced motion must not wait for exit transitions');
    await assertFocusNotTrapped(page, 'ledger-handle');

    // If another modal takes focus while preparation closes, keep focus there.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.locator('#ledger-handle').click();
    await page.locator('#ledger-drawer-host.is-open').waitFor({ state: 'visible' });
    await openDialog(page, dialog, opener, { motionSupported });
    await page.evaluate(() => {
      const settings = document.querySelector('#ai-dialog');
      settings.showModal();
      document.querySelector('#ai-close').focus();
      document.querySelector('#party-panel').close();
    });
    await page.waitForFunction(() => {
      const preparation = document.querySelector('#party-panel');
      const settings = document.querySelector('#ai-dialog');
      return (
        !preparation.open &&
        settings.open &&
        document.activeElement?.id === 'ai-close' &&
        !preparation.contains(document.querySelector('#ledger-handle'))
      );
    });
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      'ai-close',
      'Closing preparation must not steal focus from another open modal',
    );
    await page.locator('#ai-close').click();
    await page.locator('#ai-dialog').waitFor({ state: 'hidden' });

    assert.deepEqual(pageErrors, [], `Page errors: ${pageErrors.join('\n')}`);
    return {
      viewport: VIEWPORT,
      motionSupported,
      animated: firstExit.animated,
      reduced,
      cycles,
      atlasExit,
      closedLedgerFocus: true,
      competingModalFocusPreserved: true,
      dialog: DIALOG_SELECTOR,
    };
  } finally {
    await page
      .evaluate((id) => document.getElementById(id)?.remove(), SCROLL_PROBE_ID)
      .catch(() => {});
    await page.close();
  }
}
