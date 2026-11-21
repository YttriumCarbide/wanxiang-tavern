import assert from 'node:assert/strict';
import path from 'node:path';
import { openUiPreview } from '../../tools/preview-ui.mjs';

export async function uiPreviewChecks({ browser, baseURL, output }) {
  const preview = await openUiPreview(browser, baseURL);
  const { desktop, phone } = preview;
  const dimensions = (page) =>
    page.evaluate(() => [innerWidth, innerHeight, matchMedia('(pointer: coarse)').matches]);
  try {
    await Promise.all([
      desktop.waitForFunction(() => window.demo?.getStatus().mode === 'inn'),
      phone.locator('#landscape-frame').waitFor({ state: 'visible' }),
    ]);
    const frame = await phone.locator('#landscape-frame').elementHandle();
    const game = await frame.contentFrame();
    await game.waitForFunction(() => window.demo?.getStatus().mode === 'inn');
    assert.deepEqual(await dimensions(desktop), [1440, 836, false]);
    assert.deepEqual(await dimensions(phone), [844, 390, true]);
    await desktop.evaluate(() => localStorage.setItem('ui-preview-isolation', 'desktop only'));
    assert.equal(await game.evaluate(() => localStorage.getItem('ui-preview-isolation')), null);
    await Promise.all([
      desktop.screenshot({ path: path.join(output, 'desktop.png') }),
      phone.screenshot({ path: path.join(output, 'phone-landscape.png') }),
    ]);

    await desktop.keyboard.press('Control+Alt+r');
    await phone.waitForFunction(() => innerWidth === 390 && innerHeight === 844);
    assert.equal(await phone.evaluate(() => screen.orientation.type), 'portrait-primary');
    assert.equal(await game.evaluate(() => window.demo.getStatus().mode), 'inn');
    await phone.screenshot({ path: path.join(output, 'phone-portrait.png') });
    await desktop.keyboard.press('Control+Alt+r');
    await phone.waitForFunction(() => innerWidth === 844 && innerHeight === 390);
    assert.equal(await phone.evaluate(() => screen.orientation.type), 'landscape-primary');
    return { desktop: [1440, 836], phone: [844, 390], portraitToggle: true, isolated: true };
  } finally {
    await preview.close();
  }
}
