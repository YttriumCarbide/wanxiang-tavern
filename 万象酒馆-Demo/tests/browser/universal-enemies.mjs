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
    const overlordResults = [];
    for (const [name, mapId, ids, expectBadges] of [
      ['overlords-standing-on-cards', 'relic', ['apepLamb', 'radiantWyvern', 'ares'], 3],
      ['ares-formation-on-cards', 'frost', ['aresCannonLeft', 'ares', 'aresCannonRight'], 1],
    ]) {
      const check = await page.evaluate(
        async ({ mapId, enemyIds }) => {
          const { createBattleView } = await import('/src/scene.js');
          const { newBattle, preview } = await import('/src/engine.js');
          const stage = document.querySelector('#art-stage');
          stage.style.inset = '0';
          const state = newBattle(enemyIds);
          window.universalView = await createBattleView(stage, () => {}, {
            map: mapId,
            enemyIds,
            weather: 'clear',
          });
          window.universalView.draw(state, preview(state, []), null, null);
          return {
            status: window.universalView.overlordStatus(),
            overlordBadges: document.querySelectorAll(
              '.unit-hit.is-overlord .enemy-tier-badge.is-overlord',
            ).length,
          };
        },
        { mapId, enemyIds: ids },
      );
      assert.equal(check.status.mounted.length, 3, `${name}: all 3 units must mount on cards`);
      assert.equal(check.overlordBadges, expectBadges, `${name}: overlord badge count`);
      for (const entry of check.status.mounted) {
        assert.equal(entry.standOnCard, true);
        assert.equal(entry.nonVoxel, true);
        assert.equal(entry.visible, true);
        assert(entry.triangles >= 4000, `${entry.id}: triangles >= 4000`);
        assert(entry.mountLocalY > 0.3, `${entry.id}: mounted atop card`);
        assert(entry.height > 1.0, `${entry.id}: visible 3D height`);
      }
      overlordResults.push({ name, mounted: check.status.mounted });
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(output, name + '.png') });
      await page.evaluate(() => window.universalView.dispose());
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(async () => {
      const [{ createRecords }, { createEventScope }] = await Promise.all([
        import('/src/app/records.js'),
        import('/src/shared/events.js'),
      ]);
      const archivesOpen = document.createElement('button');
      archivesOpen.id = 'archives-open';
      archivesOpen.hidden = true;
      const recordsOpen = document.createElement('button');
      recordsOpen.id = 'records-open';
      recordsOpen.hidden = true;
      document.body.append(archivesOpen, recordsOpen);
      const events = createEventScope();
      const session = {
        runtime: { mode: 'tavern', disposed: false },
        ai: {
          library: {
            history: [],
            scripts: [],
            worlds: [],
            archives: {
              npcs: [
                {
                  id: 'npc-bridge',
                  name: '灰袍守桥人',
                  content: '在旧石桥旁守候夜行人。',
                  keywords: ['守桥人'],
                  sources: [{ title: '潮声 · 林中的旧桥', map: 'ruins', encounter: 0 }],
                },
              ],
              items: [
                {
                  id: 'item-coin',
                  name: '旧铜片',
                  description: '刻着水道方向的铜片',
                  value: 5,
                  map: 'ruins',
                  level: 1,
                  quality: 'common',
                  converted: false,
                  source: { title: '潮声 · 林中的旧桥', map: 'ruins', encounter: 1 },
                },
              ],
            },
          },
          generationOptions: { developerMode: false, editArchives: false },
        },
      };
      const controller = createRecords({
        session,
        events,
        generation: { save: () => true },
        shell: { toast: () => {} },
      });
      window.archiveTestHost = {
        cleanup() {
          controller.dispose();
          events.dispose();
          archivesOpen.remove();
          recordsOpen.remove();
        },
      };
      archivesOpen.click();
    });
    await page.locator('#archive-dialog').waitFor({ state: 'visible' });
    const tabsBox = await page.locator('.archive-tabs').boundingBox();
    const archiveBox = await page.locator('#archive-dialog').boundingBox();
    assert(tabsBox.x > archiveBox.x + archiveBox.width / 2);
    assert.equal(await page.locator('#archive-list button').count(), 1);
    await page.locator('[data-archive-tab="items"]').click();
    assert.equal(await page.locator('#archive-list button').count(), 1);
    assert((await page.locator('#archive-text').innerText()).includes('以太'));
    await page.locator('[data-archive-tab="enemies"]').click();
    assert.equal(await page.locator('[data-enemy-tier]').count(), 4);
    assert.equal(await page.locator('#archive-text img').count(), 1);
    await page.locator('[data-enemy-tier="elite"]').click();
    assert.equal(await page.locator('#archive-text img').count(), 1);
    await page.locator('[data-enemy-tier="boss"]').click();
    assert.equal(await page.locator('#archive-text img').count(), 1);
    await page.locator('[data-enemy-tier="overlord"]').click();
    assert.equal(await page.locator('#archive-list button').count(), 4);
    assert.equal(await page.locator('#archive-text img').count(), 0);
    await page
      .locator(
        '#archive-dialog .archive-overlord-stage[data-stage-ready="ready"][data-loaded-models="1"]',
      )
      .waitFor({ timeout: 30000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, 'archive-overlord-single.png') });
    await page.locator('#archive-list button').filter({ hasText: '母树' }).click();
    await page
      .locator(
        '#archive-dialog .archive-overlord-stage[data-stage-ready="ready"][data-loaded-models="3"]',
      )
      .waitFor({ timeout: 30000 });
    const overlordText = await page.locator('#archive-text').innerText();
    for (const partName of ['月蚀树冠', '月之魔眼', '月痕树根']) {
      assert(overlordText.includes(partName), `Missing Mother Tree part ${partName}`);
    }
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, 'archive-overlord-moontree.png') });
    await page.locator('#archive-close').click();
    await page.evaluate(() => window.archiveTestHost.cleanup());
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
    const expandedCards = await page.evaluate(async () => {
      const [{ LADDER_ENEMIES, LADDER_BOSSES }, { COMMON_ENEMIES, COMMON_BOSSES }] =
        await Promise.all([
          import('/src/content/ladder-adversaries.js'),
          import('/src/content/common-adversaries.js'),
        ]);
      return [
        { name: '霸主 · 阿佩普的羔羊', portrait: 'apep-lamb' },
        { name: '霸主 · 阿瑞斯', portrait: 'ares' },
        { name: '霸主 · 月蚀树冠', portrait: 'moon-crown' },
        { name: '霸主 · 月之魔眼', portrait: 'moon-eye' },
        { name: '霸主 · 月痕树根', portrait: 'moon-root' },
        ...LADDER_ENEMIES,
        ...LADDER_BOSSES,
        ...COMMON_ENEMIES,
        ...COMMON_BOSSES,
      ];
    });
    await page.setViewportSize({ width: 1500, height: 1200 });
    await page.setContent(
      `<html lang="zh"><head><style>body{margin:0;padding:20px;background:#0f1922;color:#dfd6b9;font:14px sans-serif}main{display:grid;grid-template-columns:repeat(8,1fr);gap:12px}article{text-align:center}img{display:block;width:100%;aspect-ratio:2/3}p{margin:6px 0}</style></head><body><main>${expandedCards.map((entry) => `<article><img src="${baseURL}/assets/portraits/${entry.portrait}.svg"/><p>${entry.name}</p></article>`).join('')}</main></body></html>`,
    );
    const portraitWidths = await page.waitForFunction(() =>
      [...document.images].every((image) => image.complete && image.naturalWidth === 600),
    );
    assert(portraitWidths);
    await page.screenshot({
      path: path.join(output, 'expanded-monsters-gallery.png'),
      fullPage: true,
    });
    assert.deepEqual(failures, []);
    return {
      enemies: 10,
      bosses: 3,
      expandedMonsters: expandedCards.length,
      overlordResults,
      actualGlbModels: loaded,
      realBattleCards: 6,
      originalReferences: 2,
    };
  } finally {
    await page.close();
  }
}
