import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { newLibrary } from '../../src/ai/library.js';
import { validateWorkshopCatalog } from '../../src/workshop/catalog.js';
import { WORKSHOP_TILE } from '../../src/workshop/layout.js';
import { EMBLEM_ID, OVERLOAD_EMBLEM_ID } from '../../src/emblems.js';

export async function workshopChecks({ browser, baseURL, output }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const editorPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  editorPage.on('pageerror', (error) => errors.push(error.message));
  let harness;
  async function openWorkshop() {
    await page.locator('#workshop-open').click();
    await page.locator('#workshop-dialog[open]:not([data-loading])').waitFor();
  }
  const editor = editorPage.locator('#workshop-editor');
  async function apply() {
    const [response] = await Promise.all([
      editorPage.waitForResponse((reply) => reply.request().method() === 'PUT'),
      editor.locator('[data-we-apply]').click(),
    ]);
    assert.equal(response.status(), 200);
    await editor.locator('[data-we-status]').filter({ hasText: '已写入游戏配置' }).waitFor();
  }
  try {
    await page.goto(baseURL);
    await page.waitForFunction(() => !!window.demo);
    const save = newLibrary();
    save.emblems = [EMBLEM_ID, OVERLOAD_EMBLEM_ID];
    save.workshop = { version: 1, at: Date.now(), coins: 10, items: { stardust: 5 } };
    await page.evaluate(async (library) => {
      const { openDatabase } = await import('/src/storage/database.js');
      const db = await openDatabase();
      await db.write([
        ['game.wanxiang.worldbooks.v1', JSON.stringify(library)],
        ['game.wanxiang.creation-pending.v1', 'false'],
        ['game.wanxiang.setup.completed.v1', 'true'],
        [
          'game.wanxiang.generation-options.v1',
          JSON.stringify({ developerMode: true, skipAiGeneration: true }),
        ],
      ]);
      db.close();
    }, save);
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await openWorkshop();
    const lesson = page.getByRole('dialog', { name: '工坊入门' });
    await lesson.getByRole('button', { name: '开始经营' }).click();
    await page.waitForFunction(() => demo.getLibrary().daily.unlocks.workshopTutorial === 'done');
    for (const id of ['stardust', 'spring-water', 'barley'])
      assert(await page.locator(`[data-ws-node="${id}"][data-kind="item"]`).isVisible());
    assert.equal(await page.locator('.ws-inspector').isVisible(), false);
    assert.equal(await page.locator('#workshop-editor,[data-ws-editor]').count(), 0);
    const map = await page.locator('.ws-map').boundingBox();
    const tabs = await page.locator('.ws-footer nav').boundingBox();
    const zoom = await page.locator('.ws-zoom').boundingBox();
    const grain = await page.locator('[data-ws-node="barley"]').boundingBox();
    const dust = await page.locator('[data-ws-node="stardust"]').boundingBox();
    assert(tabs.y > map.y && zoom.x < grain.x && grain.x < dust.x);
    await page.waitForTimeout(320);
    await page.screenshot({ path: path.join(output, 'workshop-start.png') });
    await page.locator('.ws-node [data-ws-action="craft"][data-id="stardust"]').click();
    await page.waitForFunction(
      () => parseFloat(document.querySelector('[data-ws-progress="stardust"]').style.width) > 5,
    );
    await page.waitForFunction(
      () => document.querySelector('[data-ws-quantity="stardust"]').textContent === '6',
    );
    await page.locator('[data-ws-select="stardust"]').click();
    await page.locator('.ws-inspector [data-ws-action="build"][data-id="collector"]').click();
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).workshop.stations.collector.count,
      1,
    );
    await page.locator('[data-ws-active="collector"]').fill('0');
    await page.locator('[data-ws-active="collector"]').dispatchEvent('change');
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).workshop.stations.collector.active,
      0,
    );
    await page.locator('[data-ws-active="collector"]').fill('1');
    await page.locator('[data-ws-active="collector"]').dispatchEvent('change');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ws-inspector').isVisible(), false);
    await page.locator('[data-ws-close]').click();
    await editorPage.goto(new URL('/tools/workshop-editor.html', baseURL).href);
    await editor.locator('[data-we-status]').filter({ hasText: '已读取游戏配置' }).waitFor();
    assert.equal(await editorPage.locator('#ai-open,#workshop-dialog').count(), 0);
    assert.equal(await editor.locator('option[value="progress"]').count(), 0);
    await editor.locator('[data-we-type]').selectOption('items');
    const viewport = editor.locator('.we-map');
    const viewportBox = await viewport.boundingBox();
    await editorPage.mouse.move(viewportBox.x + 170, viewportBox.y + 32);
    await editorPage.mouse.down();
    await editorPage.mouse.move(viewportBox.x + 35, viewportBox.y + 32, { steps: 6 });
    await editorPage.mouse.up();
    assert(
      await viewport.evaluate(
        (node) =>
          new DOMMatrix(getComputedStyle(node.querySelector('.we-graph')).transform).m41 < -60,
      ),
    );
    assert(
      await viewport.evaluate(
        (node) => node.scrollLeft === 0 && getComputedStyle(node).overflowX === 'clip',
      ),
    );
    const board = await editor.locator('.we-sheet').boundingBox();
    assert(board.width > 9000 && board.height > 10000);
    const expanded = editor.locator('[data-we-map-only]');
    await expanded.click();
    assert((await viewport.boundingBox()).width > viewportBox.width);
    await expanded.click();
    await editor.locator('[data-we-reset-view]').click();
    await editor.locator('[data-we-select="stardust"]').click();
    assert.equal(await editor.locator('.we-icon-picker').getAttribute('open'), null);
    assert.equal(await editor.locator('[data-we-pick-icon]').count(), 0);
    await editor.locator('.we-icon-picker summary').click();
    await editor.locator('[data-we-pick-icon="gem"]').waitFor();
    assert((await editor.locator('[data-we-pick-icon]').count()) >= 160);
    assert.equal(await editor.locator('[data-we-pick-tint]').count(), 18);
    await editor.locator('[data-we-pick-tint="ruby"]').click();
    await editor.locator('[data-we-pick-icon="gem"]').click();
    await editor.locator('[data-we-field="name"]').fill('微光星尘');
    await editor.locator('[data-we-field="seconds"]').fill('1');
    await editor.locator('button[type="submit"]').click();
    await apply();
    await openWorkshop();
    assert.match(await page.locator('[data-ws-node="stardust"] strong').textContent(), /微光星尘/);
    await page.locator('[data-ws-close]').click();
    await editor.locator('[data-we-undo]').click();
    await apply();
    await openWorkshop();
    assert.equal(await page.locator('[data-ws-node="stardust"] strong').textContent(), '星尘');
    await page.locator('[data-ws-close]').click();
    await editor.locator('[data-we-redo]').click();
    await apply();
    await editor.locator('[data-we-delete]').click();
    assert.match(await editor.locator('[data-we-status]').textContent(), /仍被引用/);
    await editor.locator('[data-we-select="stardust"]').click();
    const node = editor.locator('[data-we-node="stardust"]');
    const box = await node.boundingBox();
    const left = await node.evaluate((button) => parseFloat(button.style.left));
    await editorPage.mouse.move(box.x + 30, box.y + 35);
    await editorPage.mouse.down();
    await editorPage.mouse.move(box.x + 50, box.y + 60, { steps: 8 });
    await editorPage.mouse.up();
    assert.equal(await node.evaluate((button) => parseFloat(button.style.left)), left);
    await editorPage.mouse.move(box.x + 30, box.y + 35);
    await editorPage.mouse.down();
    await editorPage.mouse.move(box.x + 30 - WORKSHOP_TILE.width, box.y + 35, { steps: 8 });
    await editorPage.mouse.up();
    assert.match(await editor.locator('[data-we-status]').textContent(), /目标格被占用/);
    assert.equal(await node.evaluate((button) => parseFloat(button.style.left)), left);
    await editorPage.mouse.move(box.x + 30, box.y + 35);
    await editorPage.mouse.down();
    await editorPage.mouse.move(box.x + 30 + WORKSHOP_TILE.width, box.y + 35, { steps: 8 });
    await editorPage.mouse.up();
    assert.equal(
      await node.evaluate((button) => parseFloat(button.style.left)),
      left + WORKSHOP_TILE.width,
    );
    await editor.locator('[data-we-copy]').click();
    await editor.locator('[data-we-field="name"]').fill('试制星屑');
    await editor.locator('button[type="submit"]').click();
    await apply();
    const customId = await editor.locator('[data-we-field="id"]').inputValue();
    const downloadPromise = editorPage.waitForEvent('download');
    await editor.locator('[data-we-export]').click();
    const download = await downloadPromise;
    const exported = path.join(output, 'workshop-export.json');
    await download.saveAs(exported);
    const exportedCatalog = validateWorkshopCatalog(JSON.parse(await readFile(exported, 'utf8')));
    assert.equal(exportedCatalog.items.length, 44);
    assert.equal(exportedCatalog.items[0].position.x, left + WORKSHOP_TILE.width);
    await editor.locator('[data-we-type]').selectOption('stations');
    await editor.locator('[data-we-select="well"]').click();
    await editor.locator('[data-we-row="stations"]').click();
    await editor.locator('[data-we-table="stations"] select').selectOption('collector');
    await editor.locator('[data-rule-value="visibilityMode"]').selectOption('composite');
    await editor.locator('[data-rule-value="visibilityLogic"]').selectOption('or');
    await editor.locator('[data-rule-check="permanent"]').uncheck();
    await editor.locator('[data-rule-value="visibilityCore"]').fill('2');
    await editor.locator('[data-we-row="visibleItems"]').click();
    await editor.locator('[data-we-table="visibleItems"] input').fill('3');
    await apply();
    const station = await editorPage.evaluate(async () => {
      const { catalog } = await (await fetch('/__demo/workshop-catalog')).json();
      return catalog.stations.find(({ id }) => id === 'well');
    });
    assert.deepEqual(station.stations, ['collector']);
    assert.deepEqual(station.visibility, {
      mode: 'composite',
      logic: 'or',
      permanent: false,
      items: { stardust: 3 },
      research: {},
      core: 2,
      rules: ['base_materials', 'core_level'],
    });
    await editor.locator('[data-we-type]').selectOption('research');
    await editor.locator('[data-we-select="tech-01"]').click();
    await editor.locator('[data-rule-add="unlocks"]').click();
    await editor
      .locator('[data-rule-row="unlocks"]')
      .last()
      .locator('[data-rule-value="id"]')
      .selectOption('well');
    await editor.locator('button[type="submit"]').click();
    await apply();
    const unlocks = await editorPage.evaluate(async () => {
      const { catalog } = await (await fetch('/__demo/workshop-catalog')).json();
      return catalog.research[0].unlocks;
    });
    assert(
      unlocks.some((rule) => rule.type === 'station' && rule.id === 'well' && rule.level === 1),
    );
    await editor.locator('[data-we-preview]').click();
    const preview = editor.locator('.we-preview[open]');
    const published = JSON.parse(await preview.locator('textarea').inputValue());
    assert.deepEqual(published.research[0].unlocks, unlocks);
    await preview.getByRole('button', { name: '关闭' }).click();
    await editor.locator('[data-we-type]').selectOption('items');
    await editor.locator('[data-we-file]').setInputFiles({
      name: 'broken.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version":99}'),
    });
    await editorPage.waitForFunction(() =>
      document.querySelector('[data-we-status]').textContent.includes('版本不支持'),
    );
    await editor.locator('[data-we-file]').setInputFiles(exported);
    await apply();
    await editor.locator('[data-we-chain]').click();
    await editor.locator('[data-we-chain-names]').fill('酒馆试酿\n酒馆陈酿\n酒馆珍酿');
    assert.match(
      await editor.locator('[data-we-chain-preview]').innerText(),
      /酒馆陈酿 × 1 → 酒馆珍酿/,
    );
    await editor.locator('[data-we-create-chain]').click();
    assert.equal(await editor.locator('[data-we-field="name"]').inputValue(), '酒馆珍酿');
    await editorPage.screenshot({ path: path.join(output, 'workshop-editor.png') });
    await editor.locator('[data-we-read]').click();
    await editor.locator('[data-we-status]').filter({ hasText: '已重读游戏' }).waitFor();
    assert.equal(await editor.locator('.we-list button').count(), 44);
    await editor.locator('[data-we-preset]').selectOption('essence');
    assert.equal(await editor.locator('[data-we-field="name"]').inputValue(), '精酿原液');
    await editor.locator('[data-we-undo]').click();
    assert.equal(await editor.locator('.we-list button').count(), 44);
    const before = (await page.evaluate(() => demo.getLibrary())).inventory;
    await openWorkshop();
    await page.locator(`[data-ws-action="craft"][data-id="${customId}"]`).press('Enter');
    await page.waitForFunction((id) => demo.getLibrary().workshop.items[id] === 1, customId);
    await page.locator('[data-ws-close]').click();
    await page.evaluate(() => demo.flushStorage());
    await page.reload();
    await page.waitForFunction(() => !!window.demo);
    await openWorkshop();
    assert.equal((await page.evaluate(() => demo.getLibrary())).workshop.items[customId], 1);
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).workshop.stations.collector.count,
      1,
    );
    assert.deepEqual((await page.evaluate(() => demo.getLibrary())).inventory, before);
    assert.equal(await page.locator('[data-ws-node="stardust"] strong').textContent(), '微光星尘');
    await page.locator('[data-ws-tab="inventory"]').click();
    assert.match(await page.locator('.ws-inventory').textContent(), /试制星屑/);
    await page.locator('[data-ws-tab="research"]').click();
    assert.match(await page.locator('.ws-empty').textContent(), /尚未开启/);
    await page.locator('[data-ws-tab="production"]').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(output, 'workshop-production.png') });
    await page.setViewportSize({ width: 960, height: 480 });
    await page.waitForTimeout(300);
    const bounds = await page.locator('#workshop-dialog').boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.width <= 960 && bounds.height <= 480);
    await page.locator('[data-ws-center]').click();
    await page.locator('[data-ws-select="stardust"]').click();
    const inspectorBounds = await page.locator('.ws-inspector').boundingBox();
    assert(inspectorBounds.width >= 250 && inspectorBounds.height > 200);
    await page.screenshot({ path: path.join(output, 'workshop-mobile-landscape.png') });
    await page.locator('[data-ws-detail-close]').click();
    await page.locator('[data-ws-close]').click();
    await page.route('**/__demo/workshop-catalog', (route) =>
      route.fulfill({ status: 500, json: { error: '工坊配置暂时无法读取' } }),
    );
    await page.locator('#workshop-open').click();
    await page.locator('.ws-loading').filter({ hasText: '工坊配置暂时无法读取' }).waitFor();
    await page.locator('[data-ws-close]').click();
    assert.equal((await page.evaluate(() => demo.getLibrary())).workshop.items[customId], 1);
    await page.unroute('**/__demo/workshop-catalog');
    await page.evaluate(() => demo.newAdventure());
    await page.locator('#creation-start').click();
    await page.waitForFunction(() => demo.getLibrary().campaign?.version);
    assert.equal(
      (await page.evaluate(() => demo.getLibrary())).workshop.items[customId],
      1,
      'Confirming a generated protagonist must retain waiting-game progress',
    );

    // Exercise the actual request wrapper and workshop together, with a held local
    // transport. No service credentials or paid provider are read by this fixture.
    harness = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    harness.on('pageerror', (error) => errors.push(error.message));
    await harness.route('**/src/app.js', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    await harness.goto(baseURL);
    await harness.evaluate(async () => {
      const { createWorkshop } = await import('/src/app/workshop.js');
      const { createRequestControls } = await import('/src/app/request-controls.js');
      const { newLibrary } = await import('/src/ai/library.js');
      const store = new Map();
      const context = {
        storage: {
          getItem: (k) => store.get(k) || null,
          setItem: (k, v) => store.set(k, v),
          flush: async () => {},
        },
        session: { ai: { library: newLibrary(), generationOptions: { developerMode: true } } },
        generation: { save: () => true },
      };
      const workshop = createWorkshop(context),
        pending = new Map(),
        outcomes = [];
      const client = createRequestControls(
        {
          request: (path, _data, { signal }) =>
            new Promise((resolve, reject) => {
              pending.set(path, { resolve, reject });
              signal.addEventListener('abort', () => reject(signal.reason), { once: true });
            }),
          dispose() {},
        },
        () => null,
        () => workshop,
      );
      window.workshopTest = {
        context,
        workshop,
        client,
        pending,
        outcomes,
        start(path) {
          client.request(path, {}).then(
            () => outcomes.push('success'),
            () => outcomes.push('error'),
          );
        },
      };
    });
    const kinds = ['character', 'script', 'chat', 'quick-chat', 'summary', 'creation', 'map'];
    for (const operation of ['generate', 'models'])
      for (const kind of kinds) {
        const request = operation + '/' + kind;
        await harness.evaluate((p) => window.workshopTest.start(p), request);
        assert.equal(await harness.locator(`[data-workshop-wait="${kind}"]`).count(), 1);
        assert.equal(await harness.locator('[data-request-arcade]').count(), 0);
        await harness.locator(`[data-workshop-wait="${kind}"]`).click();
        assert.equal(await harness.locator('#workshop-dialog').isVisible(), true);
        await harness.evaluate((p) => window.workshopTest.pending.get(p).resolve({}), request);
        await harness.locator('#workshop-completion').waitFor({ state: 'visible' });
        assert.match(await harness.locator('#workshop-completion p').textContent(), /已完成/);
        await harness.locator('[data-ws-stay]').click();
        await harness.locator('[data-ws-close]').click();
      }
    await harness.evaluate(() => {
      window.workshopTest.start('generate/chat');
      window.workshopTest.start('generate/map');
    });
    await harness.locator('[data-workshop-wait="chat"]').click();
    await harness.locator('[data-ws-close]').click();
    assert.equal(
      await harness.locator('[data-request-stop]').count(),
      2,
      'Closing workshop must not cancel either request',
    );
    await harness.locator('[data-workshop-wait="map"]').click();
    await harness.evaluate(() =>
      window.workshopTest.pending.get('generate/map').reject(Error('fixture failure')),
    );
    await harness.locator('#workshop-completion').waitFor({ state: 'visible' });
    assert.match(await harness.locator('#workshop-completion p').textContent(), /返回错误/);
    await harness.locator('[data-ws-return]').click();
    await harness.locator('[data-request-stop="chat"]').click();
    await harness.locator('[data-request-stop]').waitFor({ state: 'detached' });
    await harness.evaluate(() => {
      window.workshopTest.start('generate/script');
      document.querySelector('[data-workshop-wait="script"]').click();
      window.workshopTest.workshop.dispose();
      window.workshopTest.client.dispose();
    });
    assert.equal(
      await harness.locator('#workshop-dialog,#workshop-editor,.api-request-control').count(),
      0,
    );
    assert.deepEqual(errors, []);
    return {
      manualProduction: true,
      facilitiesAndPause: true,
      persistentCustomCatalog: true,
      editorHistoryAndDrag: true,
      referenceProtection: true,
      importExportAndChains: true,
      isolatedInventory: true,
      landscape: true,
      all14WaitEntrances: true,
      concurrentCompletionAndAbort: true,
      disposedWithoutLateUI: true,
    };
  } catch (error) {
    await page.screenshot({ path: path.join(output, 'workshop-failure.png') });
    await editorPage.screenshot({ path: path.join(output, 'workshop-editor-failure.png') });
    if (harness)
      await harness.screenshot({ path: path.join(output, 'workshop-request-failure.png') });
    throw error;
  } finally {
    await page.close();
    await editorPage.close();
    await harness?.close();
  }
}
