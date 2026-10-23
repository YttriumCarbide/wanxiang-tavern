import assert from 'node:assert/strict';
import path from 'node:path';
import { UNIVERSAL_ENEMIES, UNIVERSAL_BOSSES } from '../../src/content/universal-adversaries.js';

export async function universalEnemyChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const failures = [];
  page.on('pageerror', (failure) => failures.push(failure.message));
  try {
    await page.goto(baseURL + '/artbook.html');
    await page.waitForFunction(() => window.artbook && !window.artbook.status().loading);
    await page.evaluate(() => {
      window.artbook.dispose();
      document
        .querySelectorAll('aside, footer, #atlas-loading')
        .forEach((element) => (element.hidden = true));
    });
    for (const [name, ids] of [
      ['universal-battle-cards', ['greyProwler', 'veilMender', 'hollowSentry']],
      ['universal-boss-cards', ['manyShellBeast', 'unmooredJudge', 'returningCore']],
    ]) {
      await page.evaluate(async (enemyIds) => {
        const { createBattleView } = await import('/src/scene.js');
        const { newBattle, preview } = await import('/src/engine.js');
        const stage = document.querySelector('#art-stage');
        stage.style.inset = '0';
        const state = newBattle(enemyIds);
        window.universalView = await createBattleView(stage, () => {}, {
          map: 'ruins',
          enemyIds,
          weather: 'clear',
        });
        window.universalView.draw(state, preview(state, []), null, null);
      }, ids);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(output, name + '.png') });
      await page.evaluate(() => window.universalView.dispose());
    }
    await page.setViewportSize({ width: 1500, height: 990 });
    const loaded = await page.evaluate(async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const { UNIVERSAL_ENEMIES, UNIVERSAL_BOSSES } =
        await import('/src/content/universal-adversaries.js');
      const stage = document.querySelector('#art-stage');
      stage.replaceChildren();
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(1500, 990);
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setScissorTest(true);
      stage.append(renderer.domElement);
      const records = [];
      for (const [index, enemy] of [...UNIVERSAL_ENEMIES, ...UNIVERSAL_BOSSES].entries()) {
        const model = (await new GLTFLoader().loadAsync('/assets/' + enemy.model)).scene;
        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#142428');
        scene.add(model, new THREE.HemisphereLight('#e2eee7', '#465253', 2.1));
        const light = new THREE.DirectionalLight('#fff0d7', 3.1);
        light.position.set(9, 18, 7);
        scene.add(light);
        const bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const half = Math.max(size.x, size.y, size.z) * 0.76;
        const camera = new THREE.OrthographicCamera(-half, half, half * 1.1, -half * 1.1, 0.1, 200);
        camera.position.copy(center).add(new THREE.Vector3(20, 14, 20));
        camera.lookAt(center);
        renderer.setViewport((index % 5) * 300, (2 - Math.floor(index / 5)) * 330, 300, 330);
        renderer.setScissor((index % 5) * 300, (2 - Math.floor(index / 5)) * 330, 300, 330);
        renderer.render(scene, camera);
        let meshes = 0;
        model.traverse((object) => {
          if (!object.isMesh) return;
          meshes++;
          object.geometry.dispose();
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material])
            material.dispose();
        });
        records.push({
          id: enemy.id,
          meshes,
          height: size.y,
          finite: bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite),
        });
      }
      window.universalRenderer = renderer;
      return records;
    });
    assert.equal(loaded.length, 13);
    assert(loaded.every((entry) => entry.meshes >= 4 && entry.height > 3 && entry.finite));
    await page.screenshot({ path: path.join(output, 'universal-glb-models.png') });
    await page.evaluate(() => window.universalRenderer.dispose());
    const enemies = [
      { name: '原有 · 晶背甲虫', portrait: 'crystal-beetle' },
      { name: '原有 · 石甲虫', portrait: 'stone-beetle' },
      ...UNIVERSAL_ENEMIES,
      ...UNIVERSAL_BOSSES,
    ];
    await page.setViewportSize({ width: 1350, height: 1100 });
    await page.setContent(
      `<html lang="zh"><head><style>body{margin:0;padding:20px;background:#102420;color:#dfd6b9;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(5,1fr);gap:16px}article{text-align:center}img{display:block;width:100%;aspect-ratio:2/3}p{margin:9px}</style></head><body><main>${enemies.map((entry) => `<article><img src="${baseURL}/assets/portraits/${entry.portrait}.svg"/><p>${entry.name}</p></article>`).join('')}</main></body></html>`,
    );
    await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    );
    await page.screenshot({
      path: path.join(output, 'universal-style-comparison.png'),
      fullPage: true,
    });
    assert.deepEqual(failures, []);
    return {
      enemies: 10,
      bosses: 3,
      actualGlbModels: loaded,
      realBattleCards: 6,
      originalReferences: 2,
    };
  } finally {
    await page.close();
  }
}
