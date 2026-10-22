import assert from 'node:assert/strict';
import path from 'node:path';
import { HUMANOID_ENEMY_TEMPLATES } from '../../src/content/enemy-templates.js';

export async function humanoidEnemyChecks({ browser, baseURL, output }) {
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
    for (const gender of ['female', 'male']) {
      await page.evaluate(async (gender) => {
        const { createBattleView } = await import('/src/scene.js');
        const { newBattle, preview } = await import('/src/engine.js');
        const { DEFINITIONS } = await import('/src/data.js');
        const { HUMANOID_ENEMY_TEMPLATES } = await import('/src/content/enemy-templates.js');
        const enemyDefinitions = Object.fromEntries(
          HUMANOID_ENEMY_TEMPLATES.filter((entry) => entry.gender === gender).map(
            (entry, index) => [
              `human-${index}`,
              {
                ...DEFINITIONS.pebble,
                id: `human-${index}`,
                name: entry.name,
                portrait: entry.portrait,
              },
            ],
          ),
        );
        const enemyIds = Object.keys(enemyDefinitions);
        const state = newBattle(enemyIds, {}, enemyDefinitions);
        const stage = document.querySelector('#art-stage');
        stage.style.inset = '0';
        window.humanoidCardView = await createBattleView(stage, () => {}, {
          map: 'ruins',
          enemyIds,
          enemyDefinitions,
          weather: 'clear',
        });
        window.humanoidCardView.draw(state, preview(state, []), null, null);
      }, gender);
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(output, `humanoid-cards-${gender}.png`) });
      await page.evaluate(() => window.humanoidCardView.dispose());
    }
    // Load and render the actual GLBs as well as checking their final battle-card representations.
    await page.setViewportSize({ width: 1800, height: 520 });
    const loaded = await page.evaluate(async () => {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const { HUMANOID_ENEMY_TEMPLATES } = await import('/src/content/enemy-templates.js');
      const stage = document.querySelector('#art-stage');
      stage.replaceChildren();
      const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
      renderer.setSize(1800, 520);
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      stage.append(renderer.domElement);
      renderer.setScissorTest(true);
      const records = [];
      for (const [index, entry] of HUMANOID_ENEMY_TEMPLATES.entries()) {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#142428');
        const model = (await new GLTFLoader().loadAsync(`/assets/${entry.model}`)).scene;
        scene.add(model);
        scene.add(new THREE.HemisphereLight('#e2eee7', '#465253', 2.1));
        const key = new THREE.DirectionalLight('#fff0d7', 3.1);
        key.position.set(9, 18, 7);
        scene.add(key);
        const bounds = new THREE.Box3().setFromObject(model);
        const center = bounds.getCenter(new THREE.Vector3());
        const camera = new THREE.OrthographicCamera(-3.75, 3.75, 6.5, -6.5, 0.1, 200);
        camera.position.copy(center).add(new THREE.Vector3(18, 12, 18));
        camera.lookAt(center);
        renderer.setViewport(index * 300, 0, 300, 520);
        renderer.setScissor(index * 300, 0, 300, 520);
        renderer.render(scene, camera);
        let meshes = 0;
        model.traverse((object) => {
          if (object.isMesh) {
            meshes++;
            object.geometry.dispose();
            for (const material of Array.isArray(object.material)
              ? object.material
              : [object.material])
              material.dispose();
          }
        });
        records.push({
          id: entry.id,
          meshes,
          height: bounds.max.y - bounds.min.y,
          finite: bounds.min.toArray().concat(bounds.max.toArray()).every(Number.isFinite),
        });
      }
      window.humanoidModelRenderer = renderer;
      return records;
    });
    assert.equal(loaded.length, 6);
    assert(loaded.every((entry) => entry.meshes > 8 && entry.height > 7 && entry.finite));
    await page.screenshot({ path: path.join(output, 'humanoid-glb-models.png') });
    await page.evaluate(() => window.humanoidModelRenderer.dispose());
    const entries = [
      { name: '原有 · 晶背甲虫', portrait: 'crystal-beetle' },
      { name: '原有 · 刻纹守墓魔像', portrait: 'tomb-warden' },
      ...HUMANOID_ENEMY_TEMPLATES,
    ];
    await page.setContent(
      `<html><head><style>body{margin:0;padding:18px;background:#102420;color:#dfd6b9;font:16px sans-serif}main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}article{text-align:center}img{display:block;width:100%;aspect-ratio:2/3}p{margin:9px}</style></head><body><main>${entries.map((entry) => `<article><img src="${baseURL}/assets/portraits/${entry.portrait}.svg"/><p>${entry.name}</p></article>`).join('')}</main></body></html>`,
    );
    await page.setViewportSize({ width: 1200, height: 1040 });
    await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    );
    await page.screenshot({
      path: path.join(output, 'humanoid-style-comparison.png'),
      fullPage: true,
    });
    assert.deepEqual(failures, []);
    return {
      glbModels: loaded,
      battleCards: 6,
      originalStyleReferences: 2,
      companionArtExcluded: true,
    };
  } finally {
    await page.close();
  }
}
