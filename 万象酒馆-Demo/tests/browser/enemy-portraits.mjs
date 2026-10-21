import assert from 'node:assert/strict';
import path from 'node:path';
import {
  EXTRA_ENEMIES,
  RUINS_ADVERSARIES,
  EXTRA_BOSSES,
  RUINS_BOSSES,
} from '../../src/content/new-adversaries.js';

export async function enemyPortraitChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const enemies = [...EXTRA_ENEMIES, ...RUINS_ADVERSARIES, ...EXTRA_BOSSES, ...RUINS_BOSSES];
  try {
    await page.goto(baseURL + '/artbook.html');
    await page.waitForFunction(() => window.artbook && !window.artbook.status().loading);
    await page.evaluate(async () => {
      window.artbook.dispose();
      document
        .querySelectorAll('aside, footer, #atlas-loading')
        .forEach((element) => (element.hidden = true));
      const { createBattleView } = await import('/src/scene.js');
      const { newBattle, preview } = await import('/src/engine.js');
      const enemyIds = ['tombBeetle', 'pebble', 'tombWarden'];
      const state = newBattle(enemyIds);
      const stage = document.querySelector('#art-stage');
      stage.style.inset = '0';
      window.enemyPortraitView = await createBattleView(stage, () => {}, {
        map: 'ruins',
        enemyIds,
        weather: 'clear',
      });
      window.enemyPortraitView.draw(state, preview(state, []), null, null);
    });
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(output, 'enemy-card-scale.png') });
    await page.evaluate(() => window.enemyPortraitView.dispose());
    const gallery = enemies
      .map(
        (enemy) =>
          `<article data-id="${enemy.id}"><img src="${baseURL}/assets/portraits/${enemy.portrait}.svg" alt="${enemy.name}"/><p>${enemy.name}</p></article>`,
      )
      .join('');
    await page.setContent(
      `<html lang="zh"><head><style>body{margin:0;padding:24px;background:#112421;color:#e6dbb8;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(6,1fr);gap:18px}article{text-align:center;margin:0}img{width:100%;aspect-ratio:2/3;display:block;object-fit:contain}p{margin:8px}</style></head><body><main>${gallery}</main></body></html>`,
    );
    await page.waitForFunction(() => [...document.images].every((image) => image.complete));
    assert(
      await page.evaluate(() => [...document.images].every((image) => image.naturalWidth > 0)),
    );
    await page.screenshot({ path: path.join(output, 'enemy-portraits.png'), fullPage: true });
    await page
      .locator('article')
      .evaluateAll((elements) =>
        elements
          .filter(
            (element) =>
              ![
                'bossTide',
                'ruinsGate',
                'chasmBeast',
                'brassColossus',
                'cinderPriest',
                'apepLamb',
              ].includes(element.dataset.id),
          )
          .forEach((element) => element.remove()),
      );
    await page.setViewportSize({ width: 1440, height: 420 });
    await page.screenshot({ path: path.join(output, 'boss-portraits.png'), fullPage: true });
    return { rendered: enemies.length, reference: 'crystalBeetle', rebuilt: enemies.length - 1 };
  } finally {
    await page.close();
  }
}
