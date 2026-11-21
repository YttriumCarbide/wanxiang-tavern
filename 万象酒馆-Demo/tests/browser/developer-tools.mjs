import assert from 'node:assert/strict';
import path from 'node:path';
import { legacySession } from './legacy-session.mjs';

export async function developerToolChecks({ browser, baseURL, output }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const game = await context.newPage();
    await legacySession(game);
    await game.goto(baseURL);
    await game.waitForFunction(() => window.demo?.getStatus().mode === 'inn');
    const original = await game.evaluate(() => demo.getLibrary().inventory);
    const editor = await context.newPage();
    await editor.goto(`${baseURL}/tools/workshop-editor.html`);
    await editor.locator('[data-modifier-tab="developer"]').click();
    const fork = editor.locator('[data-command="fork"]');
    await fork.waitFor({ state: 'visible' });
    const [copy] = await Promise.all([editor.waitForEvent('popup'), fork.click()]);
    await copy.waitForFunction(() => window.demo?.getStatus().mode === 'inn');
    const target = editor.locator('[data-field="target"]');
    const copyOption = target.locator('option').filter({ hasText: '测试档' });
    await copyOption.waitFor({ state: 'attached' });
    await target.selectOption(await copyOption.getAttribute('value'));
    await editor.locator('[data-command="supply"]').click();
    await copy.waitForFunction(
      (gold) => demo.getLibrary().inventory.gold === gold + 10000,
      original.gold,
    );
    assert.deepEqual(await game.evaluate(() => demo.getLibrary().inventory), original);
    await editor.locator('[data-command="skip-scenes"]').click();
    const gate = copy.frameLocator('#inn-frame iframe');
    await gate.locator('#status').waitFor({ state: 'detached', timeout: 60000 });
    await gate.locator('canvas').evaluate(() => window.assetPreview.placeNow('summon'));
    const visitors = [
      'official-libet',
      'official-lumi',
      'official-yuto-nakashi',
      'official-pandora',
    ];
    for (const id of visitors) {
      await gate.locator('#summon-open').click();
      await copy.locator('[data-summon-mode="official"]').click();
      await copy.evaluate(async (id) => {
        const { officialSummonPool } = await import('/src/summoning.js');
        const pool = officialSummonPool(demo.getLibrary(), null, { developerMode: true });
        const index = pool.findIndex((member) => member.id === id);
        if (index < 0) throw Error('Missing candidate: ' + id);
        window.developerTestRandom ??= Math.random;
        Math.random = () => (index + 0.25) / pool.length;
      }, id);
      await copy.locator('#summon-confirm').click();
      await copy.locator('#summoned-dialog').waitFor({ state: 'visible' });
      await copy.evaluate(() => {
        Math.random = window.developerTestRandom;
      });
      assert(
        (await copy.evaluate(() => demo.getLibrary().characters)).some(
          (member) => member.id === id,
        ),
      );
      await copy.locator('#summoned-join').click();
    }
    assert.equal(
      await copy.evaluate(() => demo.getLibrary().inventory.summonContracts),
      original.summonContracts + 26,
    );
    assert(
      !(await game.evaluate(() => demo.getLibrary().characters)).some(({ id }) =>
        visitors.includes(id),
      ),
    );
    await editor.locator('[data-field="speed"]').selectOption('4');
    await editor.locator('[data-command="speed"]').click();
    await copy.waitForFunction(() => document.querySelector('#speed').textContent.includes('×4'));
    await editor.locator('[data-command="apep"]').click();
    await copy.waitForFunction(() => demo.getStatus().mode === 'battle', null, { timeout: 45000 });
    await editor.locator('[data-command="phase"]').click();
    await copy.waitForFunction(() =>
      demo
        .getForecast()
        .events.some((event) => event.type === 'bossPhase' && event.actor === 'apepLamb'),
    );
    await editor.screenshot({ path: path.join(output, 'developer-tools.png') });
    await copy.locator('#commit').click();
    await copy.waitForFunction(
      () => !demo.getStatus().playing && demo.getState().units.apepLamb.bossStage === 2,
    );

    await editor.locator('[data-field="failure"]').selectOption('429');
    await editor.locator('[data-command="failure"]').click();
    await editor.locator('[data-failure]').filter({ hasText: '429' }).waitFor();
    await copy.evaluate(() => document.dispatchEvent(new CustomEvent('gal-open-quick')));
    await copy.locator('#quick-chat-input').fill('验证模拟限流');
    await copy.locator('#quick-chat-send').click();
    await copy
      .getByText(/HTTP 429.*开发者模拟/)
      .first()
      .waitFor();

    editor.once('dialog', (dialog) => dialog.accept());
    await editor.locator('[data-command="clear-checkpoint"]').click();
    await copy.waitForFunction(() => demo.getStatus().mode === 'inn');
    await editor.locator('[data-field="custom-map"]').selectOption('mill');
    await editor.locator('[data-field="custom-enemies"]').selectOption('millCanalFrog');
    await editor.locator('[data-command="custom"]').click();
    await copy.waitForFunction(
      () => demo.getStatus().mode === 'battle' && demo.getState().enemyIds[0] === 'millCanalFrog',
    );
    await copy.getByRole('button', { name: '战斗调试', exact: true }).click();
    await copy.locator('[data-dev-battle="one-hp"]').click();
    const actor = await copy.evaluate(() => demo.getState().formation[0]);
    await copy.locator(`[data-unit="${actor}"]`).click();
    await copy.locator('#details [data-skill="attack"]').click();
    if (await copy.evaluate(() => demo.getStatus().interactionStep === 'target')) {
      await copy.locator('[data-unit="millCanalFrog"]').click();
    }
    await copy.waitForFunction(() => demo.getForecast().outcome === 'victory');
    await copy.locator('#commit').click();
    await copy.locator('#result[open]').waitFor();
    assert.deepEqual(await game.evaluate(() => demo.getLibrary().inventory), original);
    return {
      copiedSave: true,
      previewIsolation: true,
      recruited: visitors.length,
      bossPhase: true,
      simulatedRateLimit: true,
      settlement: true,
    };
  } finally {
    await context.close();
  }
}
