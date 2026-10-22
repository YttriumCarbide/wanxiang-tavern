import assert from 'node:assert/strict';
import path from 'node:path';
import { PORTRAIT_TEMPLATES } from '../../src/content/portrait-templates.js';
import { legacySession } from './legacy-session.mjs';

export async function vertexPortraitChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (failure) => errors.push(failure.message));
  try {
    await legacySession(page);
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#ai-open').click();
    await page.locator('#ai-provider').selectOption('vertex');
    assert.equal(
      await page.locator('#ai-baseUrl').inputValue(),
      'https://aiplatform.googleapis.com/v1',
    );
    assert(await page.locator('#ai-vertex-auth').isVisible());
    await page.locator('#ai-model').fill('gemini-2.5-flash');
    await page.locator('#ai-key').fill('fixture-vertex-browser-key');
    await page.locator('#api-preset-name').fill('Vertex 快捷模式');
    await page.locator('#api-preset-save').click();
    await page.waitForFunction(() =>
      document.querySelector('#api-preset-select').value.startsWith('api-'),
    );
    const preset = await page.locator('#api-preset-select').inputValue();
    await page.locator('#ai-kind').selectOption('map');
    await page.locator('#api-preset-select').selectOption(preset);
    await page.waitForFunction(() => document.querySelector('#ai-provider').value === 'vertex');
    assert.equal(await page.locator('#ai-vertexAuth').inputValue(), 'api-key');
    await page.screenshot({ path: path.join(output, 'vertex-settings.png') });
    await page.locator('#ai-close').click();
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await page.locator('#ai-open').click();
    await page.locator('#ai-kind').selectOption('map');
    assert.equal(await page.locator('#ai-provider').inputValue(), 'vertex');
    await page.locator('#ai-vertexAuth').selectOption('oauth');
    assert.match(await page.locator('#ai-provider-hint').textContent(), /访问令牌/);
    await page.locator('#ai-close').click();
    assert.deepEqual(errors, []);
    await page.goto(baseURL + '/artbook.html');
    await page.waitForFunction(() => window.artbook && !window.artbook.status().loading);
    await page.evaluate(async () => {
      window.artbook.dispose();
      document
        .querySelectorAll('aside, footer, #atlas-loading')
        .forEach((element) => (element.hidden = true));
      const { HEROES, DEFINITIONS } = await import('/src/data.js');
      const { HUMANOID_ENEMY_TEMPLATES } = await import('/src/content/enemy-templates.js');
      const { createBattleView } = await import('/src/scene.js');
      const { newBattle, preview } = await import('/src/engine.js');
      const weapons = ['sword', 'staff', 'bow'];
      const heroDefinitions = Object.fromEntries(
        HEROES.map((hero, index) => [
          hero.id,
          index < 3
            ? { ...hero, portrait: `template-${weapons[index]}-female.webp` }
            : { ...hero, inactive: true },
        ]),
      );
      const enemyDefinitions = Object.fromEntries(
        weapons.map((weapon, index) => [
          `template-enemy-${index}`,
          {
            ...DEFINITIONS.pebble,
            id: `template-enemy-${index}`,
            name: HUMANOID_ENEMY_TEMPLATES.find(
              (entry) => entry.weapon === weapon && entry.gender === 'male',
            ).name,
            portrait: `enemy-humanoid-${weapon}-male`,
          },
        ]),
      );
      const enemyIds = Object.keys(enemyDefinitions);
      const state = newBattle(enemyIds, heroDefinitions, enemyDefinitions);
      const stage = document.querySelector('#art-stage');
      stage.style.inset = '0';
      window.templatePortraitView = await createBattleView(stage, () => {}, {
        map: 'ruins',
        enemyIds,
        heroDefinitions,
        enemyDefinitions,
        weather: 'clear',
      });
      window.templatePortraitView.draw(state, preview(state, []), null, null);
    });
    await page.waitForTimeout(1800);
    await page.screenshot({ path: path.join(output, 'templates-combat.png') });
    await page.evaluate(() => window.templatePortraitView.dispose());
    await page.setContent(
      `<html><head><style>body{margin:0;padding:24px;background:#102420;color:#e8dbb8;font:18px sans-serif}main{display:grid;grid-template-columns:repeat(6,1fr);gap:14px}article{text-align:center}img{display:block;width:100%;aspect-ratio:2/3;border-radius:8px}p{margin:12px}</style></head><body><main>${PORTRAIT_TEMPLATES.map((entry) => `<article><img src="${baseURL}/assets/portraits/${entry.portrait}"/><p>${entry.name}</p></article>`).join('')}</main></body></html>`,
    );
    await page.waitForFunction(() => [...document.images].every((item) => item.complete));
    assert(
      await page.evaluate(() =>
        [...document.images].every(
          (item) => item.naturalWidth === 1024 && item.naturalHeight === 1536,
        ),
      ),
    );
    await page.setViewportSize({ width: 1800, height: 520 });
    await page.screenshot({ path: path.join(output, 'templates-gallery.png'), fullPage: true });
    return {
      vertexConnectionSaved: true,
      reusedOnMapAPI: true,
      reloadPreserved: true,
      portraits: 6,
      combatCards: true,
    };
  } finally {
    await page.close();
  }
}
