import { legacySession } from './legacy-session.mjs';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';

export async function portraitImportChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 836 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const bytes = await readFile(new URL('../../assets/portraits/fan-yuexi.webp', import.meta.url));
  const calls = [];
  await page.route('**/api/ai/portrait', async (route) => {
    calls.push(route.request().postDataJSON());
    await route.fulfill({
      json: { dataUrl: `data:image/webp;base64,${bytes.toString('base64')}` },
    });
  });
  try {
    await legacySession(page);
    await page.goto(baseURL);
    await page.locator('#party-toggle').click();
    await page.locator('[data-prepare-hero="official-aegis"]').click();
    assert((await page.locator('#prepare-character-title').textContent()).includes('长景月汐'));
    assert(
      (await page.locator('#prepare-detail .prepare-portrait > img').getAttribute('src')).endsWith(
        'changjing-yuexi.png',
      ),
    );
    await page.screenshot({ path: path.join(output, 'changjing-yuexi-character.png') });
    await page.locator('.prepare-portrait-tools summary').click();
    await page.locator('[data-portrait-url="official-aegis"]').click();
    await page.locator('#portrait-url').fill('javascript:alert(1)');
    await page.locator('#portrait-url-apply').click();
    await page.waitForFunction(() =>
      document.querySelector('#portrait-url-status').textContent.includes('http'),
    );
    assert.equal(calls.length, 0);
    await page.locator('#portrait-url').fill('https://images.example/fan-yuexi.webp');
    await page.locator('#portrait-url-apply').click();
    await page.locator('#portrait-dialog').waitFor({ state: 'hidden' });
    assert.equal(calls.length, 1);
    assert(
      (
        await page.locator('#prepare-detail .prepare-portrait > img').getAttribute('src')
      ).startsWith('/api/ai/portraits/'),
    );
    const originalUrl = await page
      .locator('#prepare-detail .prepare-portrait > img')
      .getAttribute('src');
    const original = await page.request.get(new URL(originalUrl, baseURL).href);
    assert.deepEqual(await original.body(), bytes, 'Imported image bytes must remain identical');
    await page.reload();
    await page.locator('#party-toggle').click();
    await page.locator('[data-prepare-hero="official-aegis"]').click();
    assert(
      (
        await page.locator('#prepare-detail .prepare-portrait > img').getAttribute('src')
      ).startsWith('/api/ai/portraits/'),
    );
    await page.locator('.prepare-portrait-tools summary').click();
    await page.locator('[data-reset-portrait="official-aegis"]').click();
    assert(
      (await page.locator('#prepare-detail .prepare-portrait > img').getAttribute('src')).endsWith(
        'changjing-yuexi.png',
      ),
    );
    await page.setViewportSize({ width: 844, height: 390 });
    await page.locator('.prepare-portrait-tools summary').click();
    await page.locator('[data-portrait-url="official-aegis"]').click();
    const box = await page.locator('#portrait-dialog').boundingBox();
    assert(box.x >= 0 && box.y >= 0 && box.x + box.width <= 844 && box.y + box.height <= 390);
    await page.screenshot({ path: path.join(output, 'portrait-url-landscape.png') });
    await page.locator('#portrait-url-close').click();
    await page.setViewportSize({ width: 1440, height: 836 });
    const framing = await page.evaluate(async () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1254;
      const paint = canvas.getContext('2d');
      paint.fillStyle = 'rgb(70,140,210)';
      paint.fillRect(0, 0, 1254, 1254);
      const dataUrl = canvas.toDataURL('image/png');
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const { portraitFrame } = await import('/src/portrait-frame.js');
      const frame = portraitFrame(image);
      const pixel = [...frame.getContext('2d').getImageData(200, 200, 1, 1).data];
      const response = await fetch('/api/ai/portrait/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl }),
      });
      const { url } = await response.json();
      const library = demo.getLibrary();
      library.characters[0].combat.customPortrait = url;
      localStorage.setItem('wanxiang.worldbooks.v1', JSON.stringify(library));
      const { saveCustomPortrait } = await import('/src/portraits.js');
      saveCustomPortrait(library.characters[0].id, url);
      return { width: frame.width, height: frame.height, pixel };
    });
    assert.equal(framing.width, 1254, 'Portrait must not be reduced to 512 pixels');
    assert.deepEqual(framing.pixel, [70, 140, 210, 255]);
    await page.reload();
    await page.evaluate(() => demo.startBattle());
    await page.waitForFunction(
      () => demo.getStatus().mode === 'battle' && !demo.getStatus().animating,
    );
    await page.mouse.move(10, 10);
    const art = await page.locator('[data-unit="aegis"]').boundingBox();
    const shot = await page.screenshot({ path: path.join(output, 'portrait-color-reference.png') });
    const actualColor = await page.evaluate(
      async ({ png, x, y }) => {
        const image = new Image();
        image.src = 'data:image/png;base64,' + png;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        return [...context.getImageData(Math.round(x), Math.round(y), 1, 1).data];
      },
      { png: shot.toString('base64'), x: art.x + art.width / 2, y: art.y + art.height * 0.3 },
    );
    assert(
      actualColor.slice(0, 3).every((value, index) => Math.abs(value - [70, 140, 210][index]) <= 3),
      `Scene lighting/tone mapping changed portrait color: ${actualColor}`,
    );
    assert.deepEqual(errors, []);
    return {
      replacedOfficialCompanion: true,
      originalArtwork: true,
      imageHostImport: true,
      localPersistenceAfterReload: true,
      resetToNewDefault: true,
      invalidSchemeRejectedBeforeRequest: true,
      landscape: true,
      originalBytesPreserved: true,
      nativeResolutionRetained: true,
      webglMatchesSourceColor: actualColor,
      errors,
    };
  } finally {
    await page.close();
  }
}
