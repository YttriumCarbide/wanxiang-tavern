import assert from 'node:assert/strict';
import path from 'node:path';

/** Exercise a real startup and clicks when an older browser lacks top-layer selectors/APIs. */
export async function compatibilityChecks({ browser, baseURL, output }) {
  const results = [];
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 667, height: 375 },
  ]) {
    const page = await browser.newPage({ viewport, hasTouch: true });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => {
      const matches = Element.prototype.matches;
      Element.prototype.matches = function (selector) {
        if (selector.includes(':popover-open') || selector.includes(':modal'))
          throw new DOMException('Unsupported state selector', 'SyntaxError');
        return matches.call(this, selector);
      };
      Object.defineProperty(HTMLElement.prototype, 'showPopover', {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(HTMLElement.prototype, 'hidePopover', {
        configurable: true,
        value: undefined,
      });
      if (origin !== 'null')
        localStorage.setItem(
          'wanxiang.generation-options.v1',
          JSON.stringify({ developerMode: true, skipAiGeneration: true }),
        );
    });
    const activate = (locator) => (viewport.height < 500 ? locator.tap() : locator.click());
    try {
      await page.goto(baseURL + '/?display=landscape');
      await activate(page.locator('#start-journey'));
      await activate(page.locator('#creation-start'));
      await page.locator('#gal-stage').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#gal-stage').getAttribute('popover'), null);
      await activate(page.locator('.gal-page'));
      assert((await page.locator('.gal-text').textContent()).length > 0);
      await page.screenshot({ path: path.join(output, `fallback-${viewport.width}.png`) });
      for (let index = 0; index < 140 && (await page.locator('#gal-stage').isVisible()); index++) {
        if ((await page.locator('#gal-stage').getAttribute('data-leaving')) === 'true')
          await page.waitForFunction(
            () => document.querySelector('#gal-stage').dataset.leaving !== 'true',
          );
        else await activate(page.locator('.gal-page'));
      }
      await page.locator('#gal-stage').waitFor({ state: 'hidden' });
      await activate(page.locator('#ai-open'));
      await page.locator('#ai-dialog').waitFor({ state: 'visible' });
      await activate(page.locator('#ai-close'));
      await page.locator('#ai-dialog').waitFor({ state: 'hidden' });
      const accepted = await page.locator('#ai-open').evaluate((button) =>
        button.dispatchEvent(
          new PointerEvent('pointerdown', {
            bubbles: true,
            cancelable: true,
            pointerType: 'touch',
            button: -1,
          }),
        ),
      );
      assert(accepted, 'touch contacts without a mouse button must not be blocked');
      assert.deepEqual(errors, []);
      results.push({ viewport, legacyStartup: true, galAdvances: true, controlsAfterGal: true });
    } finally {
      await page.close();
    }
  }
  return results;
}
